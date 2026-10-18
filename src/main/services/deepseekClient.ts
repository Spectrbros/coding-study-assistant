import { createAppError, type ApiErrorCode } from '@shared/errors'
import type { ApiErrorPayload, ModelInfo } from '@shared/types'
import { consumeSseStream, type ChatDelta, type ChatStreamResult } from './sse'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const CHAT_TIMEOUT_MS = 300_000
const MODELS_TIMEOUT_MS = 20_000

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

interface DeepSeekModelResponse {
  data?: Array<{
    id?: string
    owned_by?: string
    context_window?: number
    max_output_tokens?: number
    input_modalities?: string[]
    reasoning_efforts?: string[]
  }>
}

export function mapStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'api_invalid_request'
    case 401:
      return 'api_unauthorized'
    case 402:
      return 'api_insufficient_balance'
    case 403:
      return 'api_forbidden'
    case 429:
      return 'api_rate_limit'
    default:
      return status >= 500 ? 'api_unavailable' : 'api_invalid_request'
  }
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  let details: string | null = null
  try {
    details = (await response.text()).slice(0, 2000)
  } catch {
    details = null
  }

  let message = `DeepSeek API вернул HTTP ${response.status}`
  if (details) {
    try {
      const parsed = JSON.parse(details) as { error?: { message?: string } }
      if (parsed.error?.message) {
        message = parsed.error.message
      }
    } catch {
      // Тело ответа не JSON — используем общий текст.
    }
  }

  return { code: mapStatusToCode(response.status), message, status: response.status, details }
}

function throwApiError(payload: ApiErrorPayload): never {
  throw createAppError(payload.code as ApiErrorCode, payload.message, {
    status: payload.status,
    details: payload.details
  })
}

export class DeepSeekClient {
  constructor(private readonly baseUrl: string = DEEPSEEK_BASE_URL) {}

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS)
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal
      })
      if (!response.ok) {
        throwApiError(await readErrorPayload(response))
      }
      const json = (await response.json()) as DeepSeekModelResponse
      const models = (json.data ?? [])
        .filter((model): model is NonNullable<typeof model> & { id: string } => typeof model.id === 'string')
        .map((model) => ({
          id: model.id,
          name: model.id,
          contextWindow: typeof model.context_window === 'number' ? model.context_window : null,
          maxOutputTokens: typeof model.max_output_tokens === 'number' ? model.max_output_tokens : null,
          inputModalities: Array.isArray(model.input_modalities) ? model.input_modalities : ['text'],
          effortLevels:
            Array.isArray(model.reasoning_efforts) && model.reasoning_efforts.length > 0
              ? model.reasoning_efforts
              : ['low', 'high', 'max'],
          ownedBy: model.owned_by ?? null
        }))

      if (models.length === 0) {
        throw createAppError('api_bad_response', 'DeepSeek API не вернул доступных моделей')
      }
      return models
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createAppError('timeout', 'DeepSeek API не ответил вовремя')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async streamChat(options: {
    apiKey: string
    model: string
    messages: ChatMessagePayload[]
    thinkingEnabled: boolean
    reasoningEffort: 'low' | 'high' | 'max'
    signal: AbortSignal
    onDelta: (delta: ChatDelta) => void
  }): Promise<ChatStreamResult> {
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    options.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

    try {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: options.messages,
        stream: true,
        stream_options: { include_usage: true },
        thinking: { type: options.thinkingEnabled ? 'enabled' : 'disabled' }
      }
      if (options.thinkingEnabled) {
        body['reasoning_effort'] = options.reasoningEffort
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        throwApiError(await readErrorPayload(response))
      }
      if (!response.body) {
        throw createAppError('api_bad_response', 'DeepSeek API вернул пустой поток данных')
      }

      return await consumeSseStream(response.body, options.onDelta)
    } catch (error) {
      if (options.signal.aborted) {
        throw createAppError('cancelled', 'Запрос отменён пользователем')
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw createAppError('timeout', 'DeepSeek API не завершил ответ вовремя')
      }
      throw error
    } finally {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
    }
  }

  async completeJson(options: {
    apiKey: string
    model: string
    messages: ChatMessagePayload[]
    thinkingEnabled: boolean
    reasoningEffort: 'low' | 'high' | 'max'
    signal: AbortSignal
  }): Promise<string> {
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    options.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
    try {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: options.messages,
        stream: false,
        response_format: { type: 'json_object' },
        thinking: { type: options.thinkingEnabled ? 'enabled' : 'disabled' }
      }
      if (options.thinkingEnabled) {
        body['reasoning_effort'] = options.reasoningEffort
      }
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      if (!response.ok) {
        throwApiError(await readErrorPayload(response))
      }
      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const content = json.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw createAppError('api_bad_response', 'DeepSeek API вернул пустой ответ')
      }
      return content
    } catch (error) {
      if (options.signal.aborted) {
        throw createAppError('cancelled', 'Запрос отменён пользователем')
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw createAppError('timeout', 'DeepSeek API не завершил ответ вовремя')
      }
      throw error
    } finally {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
    }
  }
}
