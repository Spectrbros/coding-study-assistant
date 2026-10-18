import { createAppError } from '@shared/errors'
import type { UsageInfo } from '@shared/types'

export interface ChatDelta {
  content?: string
  reasoning?: string
}

export interface ChatStreamResult {
  usage: UsageInfo | null
  finishReason: string | null
}

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
  error?: { message?: string; code?: string }
}

/**
 * Разбирает SSE-поток DeepSeek: строки `data: {...}` и терминатор `[DONE]`.
 * Буферизация по строкам защищает от разрыва JSON между чанками.
 */
export async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (delta: ChatDelta) => void
): Promise<ChatStreamResult> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let usage: UsageInfo | null = null
  let finishReason: string | null = null
  let done = false

  const handleLine = (rawLine: string): boolean => {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith(':')) {
      return false
    }
    if (!line.startsWith('data:')) {
      return false
    }
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') {
      return true
    }

    let chunk: StreamChunk
    try {
      chunk = JSON.parse(payload) as StreamChunk
    } catch {
      throw createAppError('stream_error', 'Не удалось разобрать потоковый ответ DeepSeek API')
    }

    if (chunk.error?.message) {
      throw createAppError('stream_error', chunk.error.message)
    }

    const choice = chunk.choices?.[0]
    if (choice?.delta) {
      const content = choice.delta.content ?? undefined
      const reasoning = choice.delta.reasoning_content ?? undefined
      if ((content && content.length > 0) || (reasoning && reasoning.length > 0)) {
        onDelta({ content: content || undefined, reasoning: reasoning || undefined })
      }
    }
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason
    }
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens ?? null,
        completionTokens: chunk.usage.completion_tokens ?? null,
        totalTokens: chunk.usage.total_tokens ?? null
      }
    }
    return false
  }

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) {
        break
      }
      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
        if (handleLine(line)) {
          done = true
          break
        }
      }
    }

    if (!done && buffer.trim().length > 0) {
      handleLine(buffer)
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Поток мог быть уже закрыт.
    }
  }

  return { usage, finishReason }
}
