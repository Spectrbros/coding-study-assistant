import type {
  AiSendRequest,
  AiStreamEvent,
  AppInfo,
  AppSettings,
  AttachmentResult,
  Chat,
  ChatMessage,
  ChecklistItem,
  ChecklistStatus,
  ConnectionCheckResult,
  ContextBuildResult,
  ContextSource,
  ContextStaleEntry,
  HelpMode,
  KeyStatus,
  ModelInfo,
  ModelsResult,
  Project,
  ProjectEvent,
  RequirementDoc,
  RunPrompt,
  RunResult
} from './types'

export interface CreateProjectInput {
  name: string
  description: string | null
  rootPath: string
}

export interface UpdateProjectInput {
  id: string
  name?: string
  description?: string | null
  rootPath?: string
}

export interface CreateChatInput {
  projectId: string | null
  title: string
  helpMode: HelpMode
}

export interface UpdateChatInput {
  id: string
  title?: string
  helpMode?: HelpMode
  model?: string | null
  draft?: string | null
}

export interface SaveRequirementInput {
  projectId: string
  content: string
  sourceType: 'pasted' | 'file'
  sourceName: string | null
}

export interface ImportedRequirement {
  fileName: string
  content: string
  warning: string | null
}

export interface ChecklistCreateInput {
  projectId: string
  title: string
  description: string | null
  status: ChecklistStatus
  filePath: string | null
  startLine: number | null
  endLine: number | null
  source: 'manual' | 'ai'
}

export interface ChecklistUpdateInput {
  id: string
  title?: string
  description?: string | null
  status?: ChecklistStatus
  filePath?: string | null
  startLine?: number | null
  endLine?: number | null
  fileSha?: string | null
}

export interface RequirementSuggestion {
  title: string
  description: string | null
}

export interface RequirementEvaluation {
  itemId: string
  suggestedStatus: ChecklistStatus
  rationale: string
}

export interface BuildContextInput {
  projectId: string
  query: string
  includeRequirement: boolean
  manualPaths: string[]
}

export interface StaleCheckInput {
  projectId: string
  sources: ContextSource[]
}

export interface ChecklistLinkState {
  itemId: string
  state: 'valid' | 'missing' | 'stale' | 'unlinked'
}

export interface AppApi {
  system: {
    getInfo(): Promise<AppInfo>
    openExternal(url: string): Promise<boolean>
    pickDirectory(): Promise<string | null>
    copyText(text: string): Promise<boolean>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  key: {
    status(): Promise<KeyStatus>
    verify(key: string): Promise<ConnectionCheckResult>
    save(key: string): Promise<ConnectionCheckResult>
  }
  models: {
    list(forceRefresh: boolean): Promise<ModelsResult>
    cached(): Promise<ModelsResult | null>
  }
  ai: {
    send(request: AiSendRequest): Promise<{ messageId: string }>
    cancel(requestId: string): Promise<boolean>
    onEvent(listener: (event: AiStreamEvent) => void): () => void
  }
  projects: {
    list(): Promise<Project[]>
    create(input: CreateProjectInput): Promise<Project>
    update(input: UpdateProjectInput): Promise<Project>
    remove(id: string): Promise<boolean>
    events(projectId: string): Promise<ProjectEvent[]>
  }
  requirements: {
    get(projectId: string): Promise<RequirementDoc | null>
    save(input: SaveRequirementInput): Promise<RequirementDoc>
    importFile(projectId: string): Promise<ImportedRequirement | null>
  }
  chats: {
    list(projectId: string | null): Promise<Chat[]>
    create(input: CreateChatInput): Promise<Chat>
    update(input: UpdateChatInput): Promise<Chat>
    remove(id: string): Promise<boolean>
  }
  messages: {
    list(chatId: string): Promise<ChatMessage[]>
    clear(chatId: string): Promise<boolean>
  }
  context: {
    build(input: BuildContextInput): Promise<ContextBuildResult>
    revalidate(input: StaleCheckInput): Promise<ContextStaleEntry[]>
  }
  checklist: {
    list(projectId: string): Promise<ChecklistItem[]>
    create(input: ChecklistCreateInput): Promise<ChecklistItem>
    update(input: ChecklistUpdateInput): Promise<ChecklistItem>
    remove(id: string): Promise<boolean>
    linkState(projectId: string): Promise<ChecklistLinkState[]>
    suggest(projectId: string): Promise<RequirementSuggestion[]>
    evaluate(projectId: string): Promise<RequirementEvaluation[]>
  }
  attachments: {
    pickAndProcess(): Promise<AttachmentResult[]>
  }
  runs: {
    propose(projectId: string): Promise<RunPrompt[]>
    execute(prompt: RunPrompt): Promise<RunResult>
    cancel(runId: string): Promise<boolean>
    onEvent(listener: (event: { runId: string; chunk: string; stream: 'stdout' | 'stderr' }) => void): () => void
  }
  modelsInfo: {
    getCached(): Promise<ModelInfo[]>
  }
}
