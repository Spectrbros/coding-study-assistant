import { IPC } from '@shared/channels'
import type { AiSendRequest, ModelsResult } from '@shared/types'
import type { IpcRegistry } from './registry'
import type { AiService } from '../services/aiService'
import type { AppContext } from '../services/appContext'
import type { DeepSeekClient } from '../services/deepseekClient'
import type { ModelCache } from '../services/modelCache'
import type { SecretStore } from '../services/secretStore'
import { aiSendSchema, apiKeySchema, modelsListSchema, requestIdSchema } from './schemas'
import { toErrorPayload } from '@shared/errors'

export interface AiHandlerDeps {
  context: AppContext
  secrets: SecretStore
  client: DeepSeekClient
  models: ModelCache
  ai: AiService
}

export function registerAiHandlers(registry: IpcRegistry, deps: AiHandlerDeps): void {
  registry.handleVoid(IPC.keyStatus, () => deps.secrets.status())

  registry.handle(IPC.keyVerify, apiKeySchema, async (key) => {
    try {
      const models = await deps.client.listModels(key.trim())
      deps.models.seed(models)
      return { ok: true, models, error: null }
    } catch (error) {
      const payload = toErrorPayload(error)
      return {
        ok: false,
        models: null,
        error: { code: payload.code, message: payload.message, status: payload.status, details: payload.details }
      }
    }
  })

  registry.handle(IPC.keySave, apiKeySchema, async (key) => {
    try {
      const models = await deps.client.listModels(key.trim())
      deps.secrets.save(key)
      deps.models.seed(models)
      const settings = deps.context.settings.read()
      deps.context.settings.write({
        ...settings,
        selectedModel: settings.selectedModel ?? models[0]?.id ?? null
      })
      return { ok: true, models, error: null }
    } catch (error) {
      const payload = toErrorPayload(error)
      return {
        ok: false,
        models: null,
        error: { code: payload.code, message: payload.message, status: payload.status, details: payload.details }
      }
    }
  })

  registry.handle(IPC.modelsList, modelsListSchema, async (input): Promise<ModelsResult | null> => {
    const cachedOnly = input?.cachedOnly === true
    if (cachedOnly) {
      return deps.models.getCached()
    }

    let apiKey: string
    try {
      apiKey = deps.secrets.requireKey()
    } catch (error) {
      const payload = toErrorPayload(error)
      return {
        models: deps.models.getCached()?.models ?? [],
        source: 'fallback',
        fetchedAt: null,
        error: { code: payload.code, message: payload.message, status: payload.status, details: payload.details }
      }
    }

    return deps.models.list(apiKey, input?.forceRefresh === true)
  })

  registry.handle(IPC.aiSend, aiSendSchema, async (request, event) => {
    return deps.ai.send(request as AiSendRequest, event.sender)
  })

  registry.handle(IPC.aiCancel, requestIdSchema, ({ requestId }) => deps.ai.cancel(requestId))
}
