import type { ModelInfo, ModelsResult } from '@shared/types'
import type { DeepSeekClient } from './deepseekClient'

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-flash',
    name: 'deepseek-flash',
    contextWindow: 1_000_000,
    maxOutputTokens: 384_000,
    inputModalities: ['text', 'image'],
    effortLevels: ['low', 'high', 'max'],
    ownedBy: 'deepseek'
  },
  {
    id: 'deepseek-v4-pro',
    name: 'deepseek-v4-pro',
    contextWindow: null,
    maxOutputTokens: null,
    inputModalities: ['text'],
    effortLevels: ['low', 'high', 'max'],
    ownedBy: 'deepseek'
  }
]

const CACHE_TTL_MS = 15 * 60 * 1000

/**
 * Кэш списка моделей: данные /models приоритетнее, но при сбое сети
 * интерфейс продолжает работать на резервном списке с явной пометкой.
 */
export class ModelCache {
  private models: ModelInfo[] = []
  private fetchedAt: number | null = null
  private lastError: ModelsResult['error'] = null
  private inflight: Promise<ModelsResult> | null = null

  constructor(private readonly client: DeepSeekClient) {}

  seed(models: ModelInfo[]): void {
    this.models = models
    this.fetchedAt = Date.now()
    this.lastError = null
  }

  getCached(): ModelsResult | null {
    if (this.models.length === 0) {
      return null
    }
    return {
      models: this.models,
      source: this.fetchedAt !== null ? 'api' : 'fallback',
      fetchedAt: this.fetchedAt !== null ? new Date(this.fetchedAt).toISOString() : null,
      error: this.lastError
    }
  }

  async list(apiKey: string, forceRefresh: boolean): Promise<ModelsResult> {
    const fresh = this.fetchedAt !== null && Date.now() - this.fetchedAt < CACHE_TTL_MS
    if (!forceRefresh && fresh && this.models.length > 0) {
      return {
        models: this.models,
        source: 'api',
        fetchedAt: this.fetchedAt !== null ? new Date(this.fetchedAt).toISOString() : null,
        error: null
      }
    }

    if (this.inflight) {
      return this.inflight
    }

    this.inflight = this.client
      .listModels(apiKey)
      .then((models) => {
        this.models = models
        this.fetchedAt = Date.now()
        this.lastError = null
        return {
          models,
          source: 'api' as const,
          fetchedAt: new Date(this.fetchedAt).toISOString(),
          error: null
        }
      })
      .catch((error: unknown) => {
        const payload = (error as { code?: string }).code
          ? {
              code: (error as { code: string }).code,
              message: (error as Error).message,
              status: ((error as { status?: number | null }).status ?? null) as number | null,
              details: ((error as { details?: string | null }).details ?? null) as string | null
            }
          : { code: 'unknown', message: String(error), status: null, details: null }

        this.lastError = payload
        return {
          models: this.models.length > 0 ? this.models : FALLBACK_MODELS,
          source: this.models.length > 0 ? ('api' as const) : ('fallback' as const),
          fetchedAt: this.fetchedAt !== null ? new Date(this.fetchedAt).toISOString() : null,
          error: payload
        }
      })
      .finally(() => {
        this.inflight = null
      })

    return this.inflight
  }
}
