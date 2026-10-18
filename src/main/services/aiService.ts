import type { WebContents } from 'electron'
import { IPC } from '@shared/channels'
import { createAppError, toErrorPayload } from '@shared/errors'
import type {
  AiSendRequest,
  AiStreamEvent,
  ContextSelectionMeta,
  MessageStatus,
  UsageInfo
} from '@shared/types'
import type { AppContext } from './appContext'
import type { DeepSeekClient } from './deepseekClient'
import { buildChatMessages, estimateTokens, makeChatTitle } from './prompts'
import type { SecretStore } from './secretStore'

const MAX_HISTORY_MESSAGES = 14
const MAX_HISTORY_CHARS = 60_000
const MAX_CONTEXT_CHARS = 120_000

interface ActiveRequest {
  controller: AbortController
}

export class AiService {
  private readonly active = new Map<string, ActiveRequest>()

  constructor(
    private readonly context: AppContext,
    private readonly secrets: SecretStore,
    private readonly client: DeepSeekClient
  ) {}

  cancel(requestId: string): boolean {
    const active = this.active.get(requestId)
    if (!active) {
      return false
    }
    active.controller.abort()
    return true
  }

  cancelAll(): void {
    for (const active of this.active.values()) {
      active.controller.abort()
    }
    this.active.clear()
  }

  async send(request: AiSendRequest, sender: WebContents): Promise<{ messageId: string }> {
    if (this.active.has(request.requestId)) {
      throw createAppError('validation', 'Запрос с таким идентификатором уже выполняется')
    }
    const chat = this.context.chats.require(request.chatId)
    const settings = this.context.settings.read()
    const apiKey = this.secrets.requireKey()

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
    let historyChars = 0
    if (settings.saveHistory) {
      const stored = this.context.messages.list(chat.id)
      for (const message of stored.slice().reverse()) {
        if (message.role === 'system' || message.status !== 'complete' || !message.content.trim()) {
          continue
        }
        if (history.length >= MAX_HISTORY_MESSAGES || historyChars >= MAX_HISTORY_CHARS) {
          break
        }
        history.unshift({ role: message.role, content: message.content })
        historyChars += message.content.length
      }
    }

    const trimmedSources = this.limitSources(request)
    const finalRequest: AiSendRequest = { ...request, sources: trimmedSources }
    const messages = buildChatMessages({ request: finalRequest, history, maxHistoryMessages: MAX_HISTORY_MESSAGES })

    if (settings.saveHistory) {
      this.context.messages.create({
        chatId: chat.id,
        role: 'user',
        content: request.text,
        status: 'complete',
        mode: request.mode,
        contextMeta: this.buildContextMeta(request, trimmedSources)
      })
    }

    const assistantMessage = this.context.messages.create({
      chatId: chat.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: request.model,
      mode: request.mode,
      reasoning: null
    })

    if (settings.saveHistory) {
      this.context.chats.touch(chat.id)
      if (chat.title === 'Новый чат' || chat.title.trim().length === 0) {
        this.context.chats.update({ id: chat.id, title: makeChatTitle(request.text) })
      }
    }

    const controller = new AbortController()
    this.active.set(request.requestId, { controller })
    this.emit(sender, { type: 'start', requestId: request.requestId, messageId: assistantMessage.id })

    let content = ''
    let reasoning = ''
    let lastFlush = 0

    const flush = (status: MessageStatus, usage: UsageInfo | null, errorCode: string | null): void => {
      if (!settings.saveHistory) {
        return
      }
      this.context.messages.update(assistantMessage.id, {
        content,
        reasoning: reasoning.length > 0 ? reasoning : null,
        status,
        usage,
        errorCode
      })
    }

    try {
      const result = await this.client.streamChat({
        apiKey,
        model: request.model,
        messages,
        thinkingEnabled: request.thinkingEnabled,
        reasoningEffort: request.reasoningEffort,
        signal: controller.signal,
        onDelta: (delta) => {
          if (delta.reasoning) {
            reasoning += delta.reasoning
            this.emit(sender, { type: 'reasoning', requestId: request.requestId, delta: delta.reasoning })
          }
          if (delta.content) {
            content += delta.content
            this.emit(sender, { type: 'delta', requestId: request.requestId, delta: delta.content })
          }
          const now = Date.now()
          if (now - lastFlush > 1500) {
            lastFlush = now
            flush('streaming', null, null)
          }
        }
      })

      flush('complete', result.usage, null)
      this.context.chats.touch(chat.id)
      this.emit(sender, {
        type: 'done',
        requestId: request.requestId,
        usage: result.usage,
        finishReason: result.finishReason
      })
      return { messageId: assistantMessage.id }
    } catch (error) {
      const payload = toErrorPayload(error)
      const status: MessageStatus = payload.code === 'cancelled' ? 'cancelled' : 'error'
      flush(status, null, payload.code)
      this.emit(
        sender,
        status === 'cancelled'
          ? { type: 'cancelled', requestId: request.requestId }
          : {
              type: 'error',
              requestId: request.requestId,
              error: {
                code: payload.code,
                message: payload.message,
                status: payload.status,
                details: payload.details
              }
            }
      )
      return { messageId: assistantMessage.id }
    } finally {
      this.active.delete(request.requestId)
      this.context.chats.touch(chat.id)
    }
  }

  private limitSources(request: AiSendRequest): AiSendRequest['sources'] {
    const settings = this.context.settings.read()
    const budget = Math.min(settings.maxContextChars, MAX_CONTEXT_CHARS)
    const selected: AiSendRequest['sources'] = []
    let used = 0
    for (const source of request.sources) {
      if (used + source.content.length > budget || selected.length >= 16) {
        break
      }
      selected.push(source)
      used += source.content.length
    }
    return selected
  }

  private buildContextMeta(request: AiSendRequest, sources: AiSendRequest['sources']): ContextSelectionMeta {
    return {
      sourceIds: sources.map((source) => source.id),
      paths: sources.map((source) => source.path).filter((path): path is string => path !== null),
      estimatedTokens: estimateTokens(sources.map((source) => source.content).join('\n')),
      requirementIncluded: Boolean(request.requirementText && request.requirementText.trim().length > 0),
      excludedByUser: request.sources
        .filter((source) => !sources.some((kept) => kept.id === source.id))
        .map((source) => source.path ?? source.label)
    }
  }

  private emit(sender: WebContents, event: AiStreamEvent): void {
    if (!sender.isDestroyed()) {
      sender.send(IPC.aiEvent, event)
    }
  }
}
