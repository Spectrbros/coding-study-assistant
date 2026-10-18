import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { IPC } from '@shared/channels'
import type { ChecklistLinkState } from '@shared/api'
import type { AppSettings, ChecklistItem } from '@shared/types'
import type { IpcRegistry } from './registry'
import type { AppContext } from '../services/appContext'
import {
  chatCreateSchema,
  chatIdSchema,
  chatListSchema,
  chatUpdateSchema,
  checklistCreateSchema,
  checklistUpdateSchema,
  idSchema,
  projectCreateSchema,
  projectIdSchema,
  projectUpdateSchema,
  requirementSaveSchema,
  settingsPatchSchema
} from './schemas'

function sha256OfFile(absolutePath: string): string {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
}

export interface DataHandlerHooks {
  onSettingsChanged?: (settings: AppSettings) => void
}

export function registerDataHandlers(registry: IpcRegistry, context: AppContext, hooks: DataHandlerHooks = {}): void {
  registry.handleVoid(IPC.settingsGet, () => context.settings.read())
  registry.handle(IPC.settingsUpdate, settingsPatchSchema, (patch) => {
    const current = context.settings.read()
    const next = context.settings.write({ ...current, ...patch })
    hooks.onSettingsChanged?.(next)
    return next
  })

  registry.handleVoid(IPC.projectsList, () => context.projects.list())
  registry.handle(IPC.projectsCreate, projectCreateSchema, (input) => context.projects.create(input))
  registry.handle(IPC.projectsUpdate, projectUpdateSchema, (input) => context.projects.update(input))
  registry.handle(IPC.projectsDelete, idSchema, ({ id }) => context.projects.delete(id))
  registry.handle(IPC.projectsEvents, projectIdSchema, ({ projectId }) => context.projects.events(projectId))

  registry.handle(IPC.requirementsGet, projectIdSchema, ({ projectId }) => context.requirements.get(projectId))
  registry.handle(IPC.requirementsSave, requirementSaveSchema, (input) => context.requirements.save(input))

  registry.handle(IPC.chatsList, chatListSchema, ({ projectId }) => context.chats.list(projectId))
  registry.handle(IPC.chatsCreate, chatCreateSchema, (input) => context.chats.create(input))
  registry.handle(IPC.chatsUpdate, chatUpdateSchema, (input) => context.chats.update(input))
  registry.handle(IPC.chatsDelete, idSchema, ({ id }) => context.chats.delete(id))
  registry.handle(IPC.messagesList, chatIdSchema, ({ chatId }) => context.messages.list(chatId))
  registry.handle(IPC.messagesClear, chatIdSchema, ({ chatId }) => context.messages.clear(chatId))

  registry.handle(IPC.checklistList, projectIdSchema, ({ projectId }) => context.checklist.list(projectId))
  registry.handle(IPC.checklistCreate, checklistCreateSchema, (input) => {
    const project = context.projects.require(input.projectId)
    let fileSha: string | null = null
    if (input.filePath) {
      try {
        const absolute = context.files.resolveInsideRoot(project.rootPath, input.filePath)
        fileSha = sha256OfFile(absolute)
      } catch {
        fileSha = null
      }
    }
    const item = context.checklist.create(input)
    return fileSha ? context.checklist.update({ id: item.id, fileSha }) : item
  })
  registry.handle(IPC.checklistUpdate, checklistUpdateSchema, (input) => context.checklist.update(input))
  registry.handle(IPC.checklistDelete, idSchema, ({ id }) => context.checklist.delete(id))

  registry.handle(IPC.checklistLinkState, projectIdSchema, ({ projectId }): ChecklistLinkState[] => {
    const project = context.projects.require(projectId)
    return context.checklist.list(projectId).map((item) => ({
      itemId: item.id,
      state: resolveLinkState(context, project.rootPath, item)
    }))
  })
}

function resolveLinkState(
  context: AppContext,
  rootPath: string,
  item: ChecklistItem
): ChecklistLinkState['state'] {
  if (!item.filePath) {
    return 'unlinked'
  }
  try {
    const absolute = context.files.resolveInsideRoot(rootPath, item.filePath)
    if (!existsSync(absolute)) {
      return 'missing'
    }
    const currentSha = sha256OfFile(absolute)
    if (item.fileSha && item.fileSha !== currentSha) {
      return 'stale'
    }
    return 'valid'
  } catch {
    return 'missing'
  }
}
