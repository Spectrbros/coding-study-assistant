export type ThemeSetting = 'dark' | 'light'

export type AppLanguage = 'ru' | 'en'

export type HelpMode = 'normal' | 'explain' | 'debug' | 'implement' | 'defense'

export type ReasoningEffort = 'low' | 'high' | 'max'

export type ChecklistStatus = 'unchecked' | 'in_progress' | 'done' | 'needs_fix'

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'complete' | 'streaming' | 'cancelled' | 'error'

export type SourceKind = 'search' | 'manual' | 'attachment'

export const HELP_MODES: HelpMode[] = ['normal', 'explain', 'debug', 'implement', 'defense']

export const CHECKLIST_STATUSES: ChecklistStatus[] = ['unchecked', 'in_progress', 'done', 'needs_fix']

export const REASONING_EFFORTS: ReasoningEffort[] = ['low', 'high', 'max']

export interface WindowBounds {
  width: number
  height: number
  x: number | null
  y: number | null
  maximized: boolean
}

export interface AppSettings {
  theme: ThemeSetting
  language: AppLanguage
  selectedModel: string | null
  thinkingEnabled: boolean
  reasoningEffort: ReasoningEffort
  sendKey: 'enter' | 'ctrl-enter'
  maxFileSizeKb: number
  maxContextChars: number
  searchExcludePatterns: string[]
  saveHistory: boolean
  sidebarCollapsed: boolean
}

export interface Project {
  id: string
  name: string
  description: string | null
  rootPath: string
  createdAt: string
  updatedAt: string
  folderExists: boolean
}

export interface ProjectEvent {
  id: string
  projectId: string
  type: 'created' | 'renamed' | 'described' | 'path_changed' | 'deleted'
  detail: string | null
  createdAt: string
}

export interface RequirementDoc {
  id: string
  projectId: string
  sourceType: 'pasted' | 'file'
  sourceName: string | null
  content: string
  createdAt: string
  updatedAt: string
}

export interface Chat {
  id: string
  projectId: string | null
  title: string
  model: string | null
  helpMode: HelpMode
  draft: string | null
  createdAt: string
  updatedAt: string
}

export interface UsageInfo {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface ContextSelectionMeta {
  sourceIds: string[]
  paths: string[]
  estimatedTokens: number
  requirementIncluded: boolean
  excludedByUser: string[]
}

export interface ChatMessage {
  id: string
  chatId: string
  role: MessageRole
  content: string
  reasoning: string | null
  model: string | null
  mode: HelpMode | null
  status: MessageStatus
  errorCode: string | null
  usage: UsageInfo | null
  contextMeta: ContextSelectionMeta | null
  createdAt: string
}

export interface ChecklistItem {
  id: string
  projectId: string
  title: string
  description: string | null
  status: ChecklistStatus
  source: 'manual' | 'ai'
  filePath: string | null
  startLine: number | null
  endLine: number | null
  fileSha: string | null
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface ContextSource {
  id: string
  kind: SourceKind
  label: string
  path: string | null
  startLine: number | null
  endLine: number | null
  content: string
  score: number | null
  mtimeMs: number | null
  sha256: string | null
}

export interface ContextCandidate {
  source: ContextSource
  reason: string
}

export interface ContextBuildResult {
  candidates: ContextCandidate[]
  estimatedTokens: number
  scannedFiles: number
  skippedFiles: number
  truncated: boolean
  notice: string | null
}

export interface ContextStaleEntry {
  path: string
  reason: 'changed' | 'missing'
}

export interface ModelInfo {
  id: string
  name: string
  contextWindow: number | null
  maxOutputTokens: number | null
  inputModalities: string[]
  effortLevels: string[]
  ownedBy: string | null
}

export interface ModelsResult {
  models: ModelInfo[]
  source: 'api' | 'fallback'
  fetchedAt: string | null
  error: ApiErrorPayload | null
}

export interface ApiErrorPayload {
  code: string
  message: string
  status: number | null
  details: string | null
}

export type AttachmentKind = 'text' | 'pdf' | 'docx' | 'image' | 'unsupported'

export interface AttachmentPayload {
  kind: AttachmentKind
  fileName: string
  sizeBytes: number
  mimeType: string | null
  text: string | null
  dataUrl: string | null
}

export interface AttachmentResult {
  id: string
  fileName: string
  sizeBytes: number
  kind: AttachmentKind
  text: string | null
  dataUrl: string | null
  note: string | null
  error: ApiErrorPayload | null
}

export interface KeyStatus {
  configured: boolean
  keySuffix: string | null
  encryptionAvailable: boolean
  decryptError: boolean
}

export interface ConnectionCheckResult {
  ok: boolean
  models: ModelInfo[] | null
  error: ApiErrorPayload | null
}

export interface AiSendRequest {
  requestId: string
  chatId: string
  text: string
  mode: HelpMode
  model: string
  thinkingEnabled: boolean
  reasoningEffort: ReasoningEffort
  language: AppLanguage
  requirementText: string | null
  sources: ContextSource[]
  attachments: AttachmentPayload[]
}

export type AiStreamEvent =
  | { type: 'start'; requestId: string; messageId: string }
  | { type: 'reasoning'; requestId: string; delta: string }
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; usage: UsageInfo | null; finishReason: string | null }
  | { type: 'cancelled'; requestId: string }
  | { type: 'error'; requestId: string; error: ApiErrorPayload }

export interface RunPrompt {
  id: string
  projectId: string
  command: string
  args: string[]
  displayCommand: string
  purpose: string
  workingDirectoryNote: string
  isolationNote: string
  effectsNote: string
}

export interface RunResult {
  id: string
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
  durationMs: number
  copiedFiles: number
  copiedBytes: number
  sourceChanged: boolean
  cleanupOk: boolean
}

export interface AppInfo {
  version: string
  platform: string
  userDataPath: string
  encryptionAvailable: boolean
}
