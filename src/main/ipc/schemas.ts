import { z } from 'zod'

const id = z.string().min(1).max(64)
const shortText = z.string().max(4096)

export const emptySchema = z.undefined().or(z.null()).transform(() => undefined)

export const openExternalSchema = z.string().min(1).max(4096)
export const copyTextSchema = z.string().max(2_000_000)

export const settingsPatchSchema = z
  .object({
    theme: z.enum(['dark', 'light']).optional(),
    language: z.enum(['ru', 'en']).optional(),
    selectedModel: z.string().max(120).nullable().optional(),
    thinkingEnabled: z.boolean().optional(),
    reasoningEffort: z.enum(['low', 'high', 'max']).optional(),
    sendKey: z.enum(['enter', 'ctrl-enter']).optional(),
    maxFileSizeKb: z.number().int().min(16).max(4096).optional(),
    maxContextChars: z.number().int().min(4_000).max(400_000).optional(),
    searchExcludePatterns: z.array(z.string().min(1).max(120)).max(100).optional(),
    saveHistory: z.boolean().optional(),
    sidebarCollapsed: z.boolean().optional()
  })
  .strict()

export const apiKeySchema = z.string().min(8).max(400)

export const modelsListSchema = z
  .object({
    forceRefresh: z.boolean().optional(),
    cachedOnly: z.boolean().optional(),
    silent: z.boolean().optional()
  })
  .strict()
  .optional()

export const projectCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable(),
    rootPath: z.string().min(1).max(4096)
  })
  .strict()

export const projectUpdateSchema = z
  .object({
    id,
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    rootPath: z.string().min(1).max(4096).optional()
  })
  .strict()

export const idSchema = z.object({ id }).strict()
export const projectIdSchema = z.object({ projectId: id }).strict()

export const requirementSaveSchema = z
  .object({
    projectId: id,
    content: z.string().min(1).max(200_000),
    sourceType: z.enum(['pasted', 'file']),
    sourceName: z.string().max(400).nullable()
  })
  .strict()

export const chatCreateSchema = z
  .object({
    projectId: id.nullable(),
    title: z.string().max(160),
    helpMode: z.enum(['normal', 'explain', 'debug', 'implement', 'defense'])
  })
  .strict()

export const chatUpdateSchema = z
  .object({
    id,
    title: z.string().max(160).optional(),
    helpMode: z.enum(['normal', 'explain', 'debug', 'implement', 'defense']).optional(),
    model: z.string().max(120).nullable().optional(),
    draft: z.string().max(50_000).nullable().optional()
  })
  .strict()

export const chatListSchema = z.object({ projectId: id.nullable() }).strict()
export const chatIdSchema = z.object({ chatId: id }).strict()

const contextSourceSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: z.enum(['search', 'manual', 'attachment']),
    label: z.string().max(400),
    path: z.string().max(4096).nullable(),
    startLine: z.number().int().min(1).nullable(),
    endLine: z.number().int().min(1).nullable(),
    content: z.string().max(400_000),
    score: z.number().nullable(),
    mtimeMs: z.number().nullable(),
    sha256: z.string().max(128).nullable()
  })
  .strict()

export const contextBuildSchema = z
  .object({
    projectId: id,
    query: z.string().max(20_000),
    includeRequirement: z.boolean(),
    manualPaths: z.array(z.string().max(4096)).max(50)
  })
  .strict()

export const contextRevalidateSchema = z
  .object({ projectId: id, sources: z.array(contextSourceSchema).max(64) })
  .strict()

export const checklistCreateSchema = z
  .object({
    projectId: id,
    title: z.string().min(1).max(240),
    description: z.string().max(4000).nullable(),
    status: z.enum(['unchecked', 'in_progress', 'done', 'needs_fix']),
    filePath: z.string().max(4096).nullable(),
    startLine: z.number().int().min(1).nullable(),
    endLine: z.number().int().min(1).nullable(),
    source: z.enum(['manual', 'ai'])
  })
  .strict()

export const checklistUpdateSchema = z
  .object({
    id,
    title: z.string().min(1).max(240).optional(),
    description: z.string().max(4000).nullable().optional(),
    status: z.enum(['unchecked', 'in_progress', 'done', 'needs_fix']).optional(),
    filePath: z.string().max(4096).nullable().optional(),
    startLine: z.number().int().min(1).nullable().optional(),
    endLine: z.number().int().min(1).nullable().optional(),
    fileSha: z.string().max(128).nullable().optional()
  })
  .strict()

const attachmentSchema = z
  .object({
    kind: z.enum(['text', 'pdf', 'docx', 'image', 'unsupported']),
    fileName: z.string().max(400),
    sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024),
    mimeType: z.string().max(200).nullable(),
    text: z.string().max(400_000).nullable(),
    dataUrl: z.string().max(40_000_000).nullable()
  })
  .strict()

export const aiSendSchema = z
  .object({
    requestId: id,
    chatId: id,
    text: z.string().min(1).max(50_000),
    mode: z.enum(['normal', 'explain', 'debug', 'implement', 'defense']),
    model: z.string().min(1).max(120),
    thinkingEnabled: z.boolean(),
    reasoningEffort: z.enum(['low', 'high', 'max']),
    language: z.enum(['ru', 'en']),
    requirementText: z.string().max(200_000).nullable(),
    sources: z.array(contextSourceSchema).max(24),
    attachments: z.array(attachmentSchema).max(10)
  })
  .strict()

export const requestIdSchema = z.object({ requestId: id }).strict()

export const runPromptSchema = z
  .object({
    id: z.string().max(64),
    projectId: id,
    command: z.string().min(1).max(200),
    args: z.array(z.string().max(2000)).max(50),
    displayCommand: z.string().max(2000),
    purpose: z.string().max(1000),
    workingDirectoryNote: z.string().max(1000),
    isolationNote: z.string().max(1000),
    effectsNote: z.string().max(1000)
  })
  .strict()

export const runIdSchema = z.object({ runId: id }).strict()

export { shortText }
