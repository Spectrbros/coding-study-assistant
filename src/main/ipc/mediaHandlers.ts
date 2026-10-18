import { BrowserWindow } from 'electron'
import { IPC } from '@shared/channels'
import type { ImportedRequirement } from '@shared/api'
import type { AttachmentResult } from '@shared/types'
import type { IpcRegistry } from './registry'
import type { AppContext } from '../services/appContext'
import { contextBuildSchema, contextRevalidateSchema, emptySchema, projectIdSchema } from './schemas'

export function registerMediaHandlers(registry: IpcRegistry, context: AppContext): void {
  registry.handle(IPC.attachmentsProcess, emptySchema, async (_input, event): Promise<AttachmentResult[]> => {
    const settings = context.settings.read()
    const parent = BrowserWindow.fromWebContents(event.sender)
    return context.attachments.pickAndProcess(parent, settings.maxFileSizeKb * 1024)
  })

  registry.handle(IPC.contextBuild, contextBuildSchema, async (input) => {
    const project = context.projects.require(input.projectId)
    const settings = context.settings.read()
    return context.contextSearch.build({
      project,
      query: input.query,
      excludePatterns: settings.searchExcludePatterns,
      maxContextChars: settings.maxContextChars,
      manualPaths: input.manualPaths
    })
  })

  registry.handle(IPC.contextRevalidate, contextRevalidateSchema, async (input) => {
    const project = context.projects.require(input.projectId)
    return context.contextSearch.revalidate(project, input.sources)
  })

  registry.handle(IPC.requirementsImport, projectIdSchema, async ({ projectId }, event): Promise<ImportedRequirement | null> => {
    context.projects.require(projectId)
    const parent = BrowserWindow.fromWebContents(event.sender)
    const document = await context.attachments.pickRequirementDocument(parent)
    if (!document) {
      return null
    }
    const saved = context.requirements.save({
      projectId,
      content: document.content,
      sourceType: 'file',
      sourceName: document.fileName
    })
    return {
      fileName: document.fileName,
      content: saved.content,
      warning: document.content.length > 180_000 ? 'Документ очень большой: в контекст попадает только часть требований.' : null
    }
  })
}
