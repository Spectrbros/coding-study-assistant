import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  AppSettings,
  AttachmentPayload,
  Chat,
  ChatMessage,
  ChecklistItem,
  ContextSource,
  HelpMode,
  ModelsResult,
  Project,
  RequirementDoc
} from '@shared/types'
import type { CreateChatInput } from '@shared/api'
import { useI18n } from '../i18n/I18nProvider'
import { errorToMessage } from '../utils/errorText'

export interface ToastItem {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

export interface StreamState {
  requestId: string
  messageId: string
  content: string
  reasoning: string
}

export interface SendMessageInput {
  text: string
  mode: HelpMode
  model: string
  sources: ContextSource[]
  attachments: AttachmentPayload[]
  requirementText: string | null
}

interface AppContextValue {
  ready: boolean
  bootError: string | null
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  projects: Project[]
  activeProject: Project | null
  selectProject: (projectId: string | null) => Promise<void>
  reloadProjects: () => Promise<void>
  chats: Chat[]
  activeChat: Chat | null
  selectChat: (chatId: string | null) => Promise<void>
  createChat: (input?: Partial<CreateChatInput>) => Promise<Chat | null>
  deleteChat: (chatId: string) => Promise<void>
  renameChat: (chatId: string, title: string) => Promise<void>
  clearMessages: () => Promise<void>
  messages: ChatMessage[]
  stream: StreamState | null
  sendMessage: (input: SendMessageInput) => Promise<void>
  cancelStream: () => Promise<void>
  requirements: RequirementDoc | null
  reloadRequirements: () => Promise<void>
  checklist: ChecklistItem[]
  reloadChecklist: () => Promise<void>
  models: ModelsResult | null
  refreshModels: (force: boolean) => Promise<ModelsResult | null>
  toasts: ToastItem[]
  pushToast: (message: string, tone?: ToastItem['tone']) => void
  dismissToast: (id: string) => void
  checklistRefreshKey: number
  bumpChecklist: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function defaultSettings(): AppSettings {
  return {
    theme: 'dark',
    language: 'ru',
    selectedModel: null,
    thinkingEnabled: true,
    reasoningEffort: 'high',
    sendKey: 'enter',
    maxFileSizeKb: 256,
    maxContextChars: 60_000,
    searchExcludePatterns: [],
    saveHistory: true,
    sidebarCollapsed: false
  }
}

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { t, setLanguage } = useI18n()
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [stream, setStream] = useState<StreamState | null>(null)
  const [requirements, setRequirements] = useState<RequirementDoc | null>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [models, setModels] = useState<ModelsResult | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0)

  const streamRef = useRef<StreamState | null>(null)
  const settingsRef = useRef(settings)
  const activeChatIdRef = useRef<string | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)

  settingsRef.current = settings
  streamRef.current = stream
  activeChatIdRef.current = activeChatId
  activeProjectIdRef.current = activeProjectId

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const bumpChecklist = useCallback(() => setChecklistRefreshKey((value) => value + 1), [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.lang = settings.language
    setLanguage(settings.language)
  }, [settings.theme, settings.language, setLanguage])

  const reloadChats = useCallback(async (projectId: string | null): Promise<Chat[]> => {
    const list = await window.api.chats.list(projectId)
    setChats(list)
    return list
  }, [])

  const loadMessages = useCallback(async (chatId: string | null) => {
    if (!chatId) {
      setMessages([])
      return
    }
    setMessages(await window.api.messages.list(chatId))
  }, [])

  const selectChat = useCallback(
    async (chatId: string | null) => {
      setActiveChatId(chatId)
      await loadMessages(chatId)
    },
    [loadMessages]
  )

  const reloadProjects = useCallback(async () => {
    setProjects(await window.api.projects.list())
  }, [])

  const selectProject = useCallback(
    async (projectId: string | null) => {
      setActiveProjectId(projectId)
      setRequirements(null)
      setChecklist([])
      setActiveChatId(null)
      setMessages([])
      try {
        const list = await reloadChats(projectId)
        if (projectId) {
          setRequirements(await window.api.requirements.get(projectId))
          setChecklist(await window.api.checklist.list(projectId))
        }
        if (list[0]) {
          await selectChat(list[0].id)
        }
      } catch (error) {
        pushToast(errorToMessage(t, error), 'error')
      }
    },
    [pushToast, reloadChats, selectChat, t]
  )

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const previous = settingsRef.current
      setSettings({ ...previous, ...patch })
      try {
        setSettings(await window.api.settings.update(patch))
      } catch (error) {
        setSettings(previous)
        pushToast(errorToMessage(t, error), 'error')
      }
    },
    [pushToast, t]
  )

  const createChat = useCallback(
    async (input?: Partial<CreateChatInput>): Promise<Chat | null> => {
      const projectId = activeProjectIdRef.current
      try {
        const chat = await window.api.chats.create({
          projectId,
          title: input?.title ?? t('chat.new'),
          helpMode: input?.helpMode ?? 'normal'
        })
        const list = await reloadChats(projectId)
        if (!list.some((item) => item.id === chat.id)) {
          setChats([chat, ...list])
        }
        await selectChat(chat.id)
        return chat
      } catch (error) {
        pushToast(errorToMessage(t, error), 'error')
        return null
      }
    },
    [pushToast, reloadChats, selectChat, t]
  )

  const deleteChat = useCallback(
    async (chatId: string) => {
      try {
        await window.api.chats.remove(chatId)
        const list = await reloadChats(activeProjectIdRef.current)
        if (activeChatIdRef.current === chatId) {
          await selectChat(list[0]?.id ?? null)
        }
      } catch (error) {
        pushToast(errorToMessage(t, error), 'error')
      }
    },
    [pushToast, reloadChats, selectChat, t]
  )

  const renameChat = useCallback(
    async (chatId: string, title: string) => {
      try {
        await window.api.chats.update({ id: chatId, title })
        await reloadChats(activeProjectIdRef.current)
      } catch (error) {
        pushToast(errorToMessage(t, error), 'error')
      }
    },
    [pushToast, reloadChats, t]
  )

  const clearMessages = useCallback(async () => {
    const chatId = activeChatIdRef.current
    if (!chatId) {
      return
    }
    try {
      await window.api.messages.clear(chatId)
      await loadMessages(chatId)
      pushToast(t('toast.updated'), 'success')
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    }
  }, [loadMessages, pushToast, t])

  const reloadRequirements = useCallback(async () => {
    const projectId = activeProjectIdRef.current
    setRequirements(projectId ? await window.api.requirements.get(projectId) : null)
  }, [])

  const reloadChecklist = useCallback(async () => {
    const projectId = activeProjectIdRef.current
    setChecklist(projectId ? await window.api.checklist.list(projectId) : [])
  }, [])

  const refreshModels = useCallback(
    async (force: boolean): Promise<ModelsResult | null> => {
      try {
        const result = await window.api.models.list(force)
        setModels(result)
        return result
      } catch (error) {
        pushToast(errorToMessage(t, error), 'error')
        return null
      }
    },
    [pushToast, t]
  )

  useEffect(() => {
    let disposed = false
    const bootstrap = async (): Promise<void> => {
      try {
        const [loadedSettings, projectList, cachedModels] = await Promise.all([
          window.api.settings.get(),
          window.api.projects.list(),
          window.api.models.list(false).catch(() => null)
        ])
        if (disposed) {
          return
        }
        setSettings(loadedSettings)
        setProjects(projectList)
        setModels(cachedModels)
        const firstProject = projectList[0] ?? null
        setActiveProjectId(firstProject?.id ?? null)
        if (firstProject) {
          setRequirements(await window.api.requirements.get(firstProject.id))
          setChecklist(await window.api.checklist.list(firstProject.id))
        }
        const chatList = await window.api.chats.list(firstProject?.id ?? null)
        if (disposed) {
          return
        }
        setChats(chatList)
        if (chatList[0]) {
          setActiveChatId(chatList[0].id)
          setMessages(await window.api.messages.list(chatList[0].id))
        }
        setReady(true)
      } catch (error) {
        if (!disposed) {
          setBootError(errorToMessage(t, error))
          setReady(true)
        }
      }
    }
    void bootstrap()
    return () => {
      disposed = true
    }
    // Начальная загрузка выполняется один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const finishStream = async (notice?: string): Promise<void> => {
      const finished = streamRef.current
      setStream(null)
      const chatId = activeChatIdRef.current
      if (!chatId) {
        return
      }
      if (settingsRef.current.saveHistory) {
        try {
          const list = await window.api.messages.list(chatId)
          if (activeChatIdRef.current === chatId) {
            setMessages(list)
          }
        } catch {
          // Если перечитать историю не удалось, оставляем текущее представление.
        }
      } else if (finished && finished.content.trim().length > 0) {
        setMessages((current) => [
          ...current,
          {
            id: finished.messageId || `stream-${finished.requestId}`,
            chatId,
            role: 'assistant',
            content: finished.content,
            reasoning: finished.reasoning || null,
            model: null,
            mode: null,
            status: 'complete',
            errorCode: null,
            usage: null,
            contextMeta: null,
            createdAt: new Date().toISOString()
          }
        ])
      }
      if (notice) {
        pushToast(notice, 'info')
      }
      try {
        setChats(await window.api.chats.list(activeProjectIdRef.current))
      } catch {
        // Список чатов обновится при следующем действии.
      }
    }

    const unsubscribe = window.api.ai.onEvent((event) => {
      const current = streamRef.current
      if (!current || current.requestId !== event.requestId) {
        return
      }
      switch (event.type) {
        case 'start':
          setStream((previous) => (previous ? { ...previous, messageId: event.messageId } : previous))
          break
        case 'reasoning':
          setStream((previous) =>
            previous ? { ...previous, reasoning: previous.reasoning + event.delta } : previous
          )
          break
        case 'delta':
          setStream((previous) =>
            previous ? { ...previous, content: previous.content + event.delta } : previous
          )
          break
        case 'done':
          void finishStream()
          break
        case 'cancelled':
          void finishStream(t('chat.stopped'))
          break
        case 'error':
          pushToast(errorToMessage(t, { code: event.error.code, message: event.error.message }), 'error')
          void finishStream()
          break
        default:
          break
      }
    })
    return unsubscribe
  }, [pushToast, t])

  const sendMessage = useCallback(
    async (input: SendMessageInput): Promise<void> => {
      if (streamRef.current) {
        return
      }
      let chatId = activeChatIdRef.current
      if (!chatId) {
        const chat = await createChat({ helpMode: input.mode })
        chatId = chat?.id ?? null
      }
      if (!chatId) {
        return
      }

      const requestId = crypto.randomUUID()
      const optimisticUser: ChatMessage = {
        id: `local-user-${requestId}`,
        chatId,
        role: 'user',
        content: input.text,
        reasoning: null,
        model: null,
        mode: input.mode,
        status: 'complete',
        errorCode: null,
        usage: null,
        contextMeta: null,
        createdAt: new Date().toISOString()
      }
      setMessages((current) => [...current, optimisticUser])
      setStream({ requestId, messageId: '', content: '', reasoning: '' })

      try {
        await window.api.ai.send({
          requestId,
          chatId,
          text: input.text,
          mode: input.mode,
          model: input.model,
          thinkingEnabled: settingsRef.current.thinkingEnabled,
          reasoningEffort: settingsRef.current.reasoningEffort,
          language: settingsRef.current.language,
          requirementText: input.requirementText,
          sources: input.sources,
          attachments: input.attachments
        })
      } catch (error) {
        setStream(null)
        pushToast(errorToMessage(t, error), 'error')
        try {
          setMessages(await window.api.messages.list(chatId))
        } catch {
          setMessages((current) => current.filter((message) => message.id !== optimisticUser.id))
        }
      }
    },
    [createChat, pushToast, t]
  )

  const cancelStream = useCallback(async () => {
    const current = streamRef.current
    if (!current) {
      return
    }
    try {
      await window.api.ai.cancel(current.requestId)
    } catch {
      // Отмена уже завершённого запроса не является ошибкой.
    }
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      bootError,
      settings,
      updateSettings,
      projects,
      activeProject: projects.find((project) => project.id === activeProjectId) ?? null,
      selectProject,
      reloadProjects,
      chats,
      activeChat: chats.find((chat) => chat.id === activeChatId) ?? null,
      selectChat,
      createChat,
      deleteChat,
      renameChat,
      clearMessages,
      messages,
      stream,
      sendMessage,
      cancelStream,
      requirements,
      reloadRequirements,
      checklist,
      reloadChecklist,
      models,
      refreshModels,
      toasts,
      pushToast,
      dismissToast,
      checklistRefreshKey,
      bumpChecklist
    }),
    [
      ready,
      bootError,
      settings,
      updateSettings,
      projects,
      activeProjectId,
      selectProject,
      reloadProjects,
      chats,
      activeChatId,
      selectChat,
      createChat,
      deleteChat,
      renameChat,
      clearMessages,
      messages,
      stream,
      sendMessage,
      cancelStream,
      requirements,
      reloadRequirements,
      checklist,
      reloadChecklist,
      models,
      refreshModels,
      toasts,
      pushToast,
      dismissToast,
      checklistRefreshKey,
      bumpChecklist
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used inside AppProvider')
  }
  return context
}

