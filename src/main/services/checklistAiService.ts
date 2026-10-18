import type { RequirementEvaluation, RequirementSuggestion } from '@shared/api'
import type { ChecklistItem, RequirementDoc } from '@shared/types'
import { createAppError } from '@shared/errors'
import type { AppContext } from './appContext'
import type { DeepSeekClient, ChatMessagePayload } from './deepseekClient'
import type { ModelCache } from './modelCache'
import type { SecretStore } from './secretStore'
import { FALLBACK_MODELS } from './modelCache'

interface SuggestionResponse {
  items?: Array<{ title?: unknown; description?: unknown }>
}

interface EvaluationResponse {
  items?: Array<{ id?: unknown; status?: unknown; rationale?: unknown }>
}

const VALID_STATUSES = new Set(['unchecked', 'in_progress', 'done', 'needs_fix'])

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim()
    : trimmed
  try {
    return JSON.parse(withoutFence)
  } catch {
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1))
    }
    throw createAppError('api_bad_response', 'Модель вернула ответ не в формате JSON')
  }
}

export class ChecklistAiService {
  constructor(
    private readonly context: AppContext,
    private readonly secrets: SecretStore,
    private readonly client: DeepSeekClient,
    private readonly models: ModelCache
  ) {}

  private resolveModel(): string {
    const settings = this.context.settings.read()
    if (settings.selectedModel) {
      return settings.selectedModel
    }
    const cached = this.models.getCached()?.models[0]?.id
    return cached ?? FALLBACK_MODELS[0]?.id ?? 'deepseek-flash'
  }

  private requireRequirement(projectId: string): RequirementDoc {
    const requirement = this.context.requirements.get(projectId)
    if (!requirement || requirement.content.trim().length === 0) {
      throw createAppError('not_configured', 'Сначала добавьте требования проекта')
    }
    return requirement
  }

  private async complete(messages: ChatMessagePayload[]): Promise<string> {
    const settings = this.context.settings.read()
    const apiKey = this.secrets.requireKey()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000)
    try {
      return await this.client.completeJson({
        apiKey,
        model: this.resolveModel(),
        messages,
        thinkingEnabled: settings.thinkingEnabled,
        reasoningEffort: settings.reasoningEffort,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async suggest(projectId: string): Promise<RequirementSuggestion[]> {
    const project = this.context.projects.require(projectId)
    const requirement = this.requireRequirement(projectId)
    const settings = this.context.settings.read()
    const language = settings.language === 'en' ? 'English' : 'Russian'

    const raw = await this.complete([
      {
        role: 'system',
        content:
          'Ты помогаешь составить учебный чек-лист выполнения проекта. Верни строго JSON вида ' +
          '{"items":[{"title":"...","description":"..."}]}. 5-15 пунктов, каждый проверяемый, без нумерации в title. ' +
          `Язык: ${language}. Не добавляй пояснений вне JSON.`
      },
      {
        role: 'user',
        content: `Проект: ${project.name}\n\nТребования:\n${requirement.content.slice(0, 40_000)}`
      }
    ])

    const parsed = parseJsonObject(raw) as SuggestionResponse
    const suggestions: RequirementSuggestion[] = []
    for (const item of Array.isArray(parsed.items) ? parsed.items.slice(0, 20) : []) {
      if (typeof item.title !== 'string' || item.title.trim().length === 0) {
        continue
      }
      suggestions.push({
        title: item.title.trim().slice(0, 240),
        description: typeof item.description === 'string' ? item.description.trim().slice(0, 2000) : null
      })
    }
    if (suggestions.length === 0) {
      throw createAppError('api_bad_response', 'Модель не предложила ни одного пункта чек-листа')
    }
    return suggestions
  }

  async evaluate(projectId: string): Promise<RequirementEvaluation[]> {
    const project = this.context.projects.require(projectId)
    const requirement = this.requireRequirement(projectId)
    const items = this.context.checklist.list(projectId)
    if (items.length === 0) {
      throw createAppError('not_configured', 'Чек-лист пуст: сначала добавьте пункты')
    }
    const settings = this.context.settings.read()
    const language = settings.language === 'en' ? 'English' : 'Russian'

    const itemsBlock = items
      .map(
        (item: ChecklistItem) =>
          `- id: ${item.id}\n  title: ${item.title}\n  description: ${item.description ?? '-'}\n  status: ${item.status}\n  file: ${item.filePath ?? '-'}`
      )
      .join('\n')

    const raw = await this.complete([
      {
        role: 'system',
        content:
          'Ты проверяешь, насколько пункты учебного чек-листа выполнены по требованиям. ' +
          'Верни строго JSON {"items":[{"id":"...","status":"unchecked|in_progress|done|needs_fix","rationale":"..."}]}. ' +
          `Оценивай только по предоставленным данным, не выдумывай факты. Язык пояснений: ${language}. Одно предложение на rationale.`
      },
      {
        role: 'user',
        content: `Проект: ${project.name}\n\nТребования:\n${requirement.content.slice(0, 30_000)}\n\nПункты чек-листа:\n${itemsBlock}`
      }
    ])

    const parsed = parseJsonObject(raw) as EvaluationResponse
    const knownIds = new Set(items.map((item) => item.id))
    const evaluations: RequirementEvaluation[] = []
    for (const entry of Array.isArray(parsed.items) ? parsed.items : []) {
      if (typeof entry.id !== 'string' || !knownIds.has(entry.id)) {
        continue
      }
      const suggestedStatus =
        typeof entry.status === 'string' && VALID_STATUSES.has(entry.status)
          ? (entry.status as RequirementEvaluation['suggestedStatus'])
          : 'in_progress'
      evaluations.push({
        itemId: entry.id,
        suggestedStatus,
        rationale: typeof entry.rationale === 'string' ? entry.rationale.slice(0, 1000) : ''
      })
    }
    if (evaluations.length === 0) {
      throw createAppError('api_bad_response', 'Модель не вернула оценок по пунктам чек-листа')
    }
    return evaluations
  }
}