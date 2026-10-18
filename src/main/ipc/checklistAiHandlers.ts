import { IPC } from '@shared/channels'
import type { IpcRegistry } from './registry'
import type { ChecklistAiService } from '../services/checklistAiService'
import { projectIdSchema } from './schemas'

export function registerChecklistAiHandlers(registry: IpcRegistry, service: ChecklistAiService): void {
  registry.handle(IPC.checklistSuggest, projectIdSchema, ({ projectId }) => service.suggest(projectId))
  registry.handle(IPC.checklistEvaluate, projectIdSchema, ({ projectId }) => service.evaluate(projectId))
}
