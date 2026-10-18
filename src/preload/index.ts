import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import { unwrapIpcResult } from '@shared/result'
import type { IpcResult } from '@shared/result'
import type { AppApi } from '@shared/api'
import type {
  AiSendRequest,
  AiStreamEvent,
  AppSettings,
  AttachmentResult,
  ChecklistItem,
  Chat,
  ChatMessage,
  Project,
  RequirementDoc,
  RunPrompt,
  RunResult
} from '@shared/types'

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T> | undefined
  if (!result || typeof result !== 'object') {
    const error = new Error('Malformed IPC response') as Error & { code: string }
    error.code = 'unknown'
    throw error
  }
  return unwrapIpcResult(result)
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: AppApi = {
  system: {
    getInfo: () => invoke(IPC.systemInfo),
    openExternal: (url: string) => invoke(IPC.systemOpenExternal, url),
    openPath: (target: string) => invoke(IPC.systemOpenPath, target),
    pickDirectory: () => invoke(IPC.systemPickDirectory),
    copyText: (text: string) => invoke(IPC.systemCopyText, text)
  },
  settings: {
    get: () => invoke<AppSettings>(IPC.settingsGet),
    update: (patch: Partial<AppSettings>) => invoke<AppSettings>(IPC.settingsUpdate, patch)
  },
  key: {
    status: () => invoke(IPC.keyStatus),
    verify: (key: string) => invoke(IPC.keyVerify, key),
    save: (key: string) => invoke(IPC.keySave, key),
    clear: () => invoke(IPC.keyClear)
  },
  models: {
    list: (forceRefresh: boolean) => invoke(IPC.modelsList, { forceRefresh }),
    cached: () => invoke(IPC.modelsList, { cachedOnly: true })
  },
  ai: {
    send: (request: AiSendRequest) => invoke<{ messageId: string }>(IPC.aiSend, request),
    cancel: (requestId: string) => invoke<boolean>(IPC.aiCancel, { requestId }),
    onEvent: (listener: (event: AiStreamEvent) => void) => subscribe<AiStreamEvent>(IPC.aiEvent, listener)
  },
  projects: {
    list: () => invoke<Project[]>(IPC.projectsList),
    create: (input) => invoke<Project>(IPC.projectsCreate, input),
    update: (input) => invoke<Project>(IPC.projectsUpdate, input),
    remove: (id: string) => invoke<boolean>(IPC.projectsDelete, { id }),
    events: (projectId: string) => invoke(IPC.projectsEvents, { projectId })
  },
  requirements: {
    get: (projectId: string) => invoke<RequirementDoc | null>(IPC.requirementsGet, { projectId }),
    save: (input) => invoke<RequirementDoc>(IPC.requirementsSave, input),
    importFile: (projectId: string) => invoke(IPC.requirementsImport, { projectId })
  },
  chats: {
    list: (projectId: string | null) => invoke<Chat[]>(IPC.chatsList, { projectId }),
    create: (input) => invoke<Chat>(IPC.chatsCreate, input),
    update: (input) => invoke<Chat>(IPC.chatsUpdate, input),
    remove: (id: string) => invoke<boolean>(IPC.chatsDelete, { id })
  },
  messages: {
    list: (chatId: string) => invoke<ChatMessage[]>(IPC.messagesList, { chatId }),
    clear: (chatId: string) => invoke<boolean>(IPC.messagesClear, { chatId })
  },
  context: {
    build: (input) => invoke(IPC.contextBuild, input),
    revalidate: (input) => invoke(IPC.contextRevalidate, input)
  },
  checklist: {
    list: (projectId: string) => invoke<ChecklistItem[]>(IPC.checklistList, { projectId }),
    create: (input) => invoke<ChecklistItem>(IPC.checklistCreate, input),
    update: (input) => invoke<ChecklistItem>(IPC.checklistUpdate, input),
    remove: (id: string) => invoke<boolean>(IPC.checklistDelete, { id }),
    linkState: (projectId: string) => invoke(IPC.checklistLinkState, { projectId }),
    suggest: (projectId: string) => invoke(IPC.checklistSuggest, { projectId }),
    evaluate: (projectId: string) => invoke(IPC.checklistEvaluate, { projectId })
  },
  attachments: {
    pickAndProcess: () => invoke<AttachmentResult[]>(IPC.attachmentsProcess)
  },
  runs: {
    propose: (projectId: string) => invoke<RunPrompt[]>(IPC.runsPropose, { projectId }),
    execute: (prompt: RunPrompt) => invoke<RunResult>(IPC.runsExecute, prompt),
    cancel: (runId: string) => invoke<boolean>(IPC.runsCancel, { runId }),
    onEvent: (listener) =>
      subscribe<{ runId: string; chunk: string; stream: 'stdout' | 'stderr' }>(IPC.runsEvent, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

