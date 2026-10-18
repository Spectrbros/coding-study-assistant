import { useEffect, useRef, useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n, type TranslationKey } from '../../i18n/I18nProvider'
import { IconButton, Select } from '../ui/ui'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { ContextModal, type ContextApplyPayload } from '../context/ContextModal'
import styles from './chat.module.css'
import {
  HELP_MODES,
  type AttachmentResult,
  type ContextSelectionMode,
  type ContextSource,
  type HelpMode,
  type KeyStatus
} from '@shared/types'
import { errorToMessage } from '../../utils/errorText'

interface PendingAttachment {
  fileName: string
  kind: AttachmentResult['kind']
  sizeBytes: number
  text: string | null
  dataUrl: string | null
}

interface ProjectContextConfig {
  mode: ContextSelectionMode
  query: string
  sources: ContextSource[]
  autoSearch: boolean
  includeRequirement: boolean
}

export function ChatView({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const {
    settings,
    updateSettings,
    activeProject,
    activeChat,
    messages,
    stream,
    sendMessage,
    cancelStream,
    clearMessages,
    requirements,
    models,
    pushToast
  } = useApp()

  const [mode, setMode] = useState<HelpMode>(activeChat?.helpMode ?? 'normal')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [contextOpen, setContextOpen] = useState(false)
  const [contexts, setContexts] = useState<Record<string, ProjectContextConfig>>({})
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const [preparingContext, setPreparingContext] = useState(false)
  const sendInFlightRef = useRef(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  const modelId = settings.selectedModel ?? models?.models[0]?.id ?? ''
  const modelInfo = models?.models.find((model) => model.id === modelId) ?? null
  const supportsImages = modelInfo?.inputModalities.includes('image') ?? false
  const hasKey = keyStatus?.configured ?? false

  useEffect(() => {
    setMode(activeChat?.helpMode ?? 'normal')
  }, [activeChat?.id, activeChat?.helpMode])

  useEffect(() => {
    let disposed = false
    window.api.key
      .status()
      .then((status) => {
        if (!disposed) {
          setKeyStatus(status)
        }
      })
      .catch(() => setKeyStatus(null))
    return () => {
      disposed = true
    }
  }, [settings.selectedModel, activeChat?.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, stream?.content.length, stream?.reasoning.length])

  const changeMode = (next: HelpMode): void => {
    setMode(next)
    if (activeChat) {
      void window.api.chats.update({ id: activeChat.id, helpMode: next }).catch(() => undefined)
    }
  }

  const attachFiles = async (): Promise<void> => {
    setAttachBusy(true)
    try {
      const results = await window.api.attachments.pickAndProcess()
      const accepted: PendingAttachment[] = []
      for (const result of results) {
        if (result.error) {
          pushToast(`${result.fileName}: ${errorToMessage(t, result.error)}`, 'error')
          continue
        }
        if (result.kind === 'image' && !supportsImages) {
          pushToast(t('attachments.imagesNote'), 'info')
          continue
        }
        accepted.push({
          fileName: result.fileName,
          kind: result.kind,
          sizeBytes: result.sizeBytes,
          text: result.text,
          dataUrl: result.dataUrl
        })
      }
      if (accepted.length > 0) {
        setAttachments((current) => [...current, ...accepted].slice(0, 8))
      }
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setAttachBusy(false)
    }
  }

  const loadAllSources = async (projectId: string, includeRequirement: boolean): Promise<ContextSource[]> => {
    const result = await window.api.context.build({
      projectId,
      mode: 'all',
      query: '',
      includeRequirement,
      manualPaths: []
    })
    return result.candidates.map((candidate) => candidate.source)
  }

  const performSend = async (text: string, sources: ContextSource[], includeRequirement: boolean): Promise<void> => {
    await sendMessage({
      text,
      mode,
      model: modelId,
      sources,
      attachments: attachments.map((attachment) => ({
        kind: attachment.kind,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
        mimeType: null,
        text: attachment.text,
        dataUrl: attachment.dataUrl
      })),
      requirementText: includeRequirement ? requirements?.content ?? null : null
    })
    setAttachments([])
  }

  const handleSend = async (text: string): Promise<void> => {
    if (stream || preparingContext || sendInFlightRef.current) {
      return
    }
    if (!hasKey) {
      onOpenSettings()
      return
    }
    if (!modelId) {
      pushToast(t('chat.noModelBanner'), 'error')
      return
    }

    sendInFlightRef.current = true
    try {
      if (!activeProject) {
        await performSend(text, [], false)
        return
      }

      const projectId = activeProject.id
      const saved = contexts[projectId]
      const requirementAvailable = Boolean(requirements?.content)
      const includeRequirement = requirementAvailable && (saved?.includeRequirement ?? true)
      setPreparingContext(true)

      if (saved?.autoSearch) {
        const result = await window.api.context.build({
          projectId,
          mode: 'search',
          query: text,
          includeRequirement,
          manualPaths: []
        })
        if (result.candidates.length === 0) {
          pushToast(t('context.autoSearchEmpty'), 'info')
        }
        setPreparingContext(false)
        await performSend(
          text,
          result.candidates.map((candidate) => candidate.source),
          includeRequirement
        )
        return
      }

      if (!saved || saved.mode === 'all') {
        const sources = await loadAllSources(projectId, includeRequirement)
        setContexts((current) => ({
          ...current,
          [projectId]: {
            mode: 'all',
            query: '',
            sources,
            autoSearch: saved?.autoSearch ?? false,
            includeRequirement
          }
        }))
        setPreparingContext(false)
        await performSend(text, sources, includeRequirement)
        return
      }

      setPreparingContext(false)
      await performSend(text, saved.sources, includeRequirement)
    } catch (sendError) {
      pushToast(errorToMessage(t, sendError), 'error')
    } finally {
      sendInFlightRef.current = false
      setPreparingContext(false)
    }
  }

  const activeContext = activeProject ? contexts[activeProject.id] : undefined
  const requirementAvailable = Boolean(requirements?.content)
  const requirementIncluded =
    activeProject && requirementAvailable ? activeContext?.includeRequirement ?? true : false
  const contextSummary = !activeProject
    ? t('context.emptyBody')
    : activeContext?.autoSearch
      ? t('context.autoSearchOn')
      : !activeContext || activeContext.mode === 'all'
        ? t('context.allFiles')
        : activeContext.mode === 'search'
          ? t('context.searchSummary', {
              query: activeContext.query || t('context.searchPlaceholder'),
              count: activeContext.sources.length
            })
          : t('context.selectedFiles', { count: activeContext.sources.length })

  const modeLabel = (item: HelpMode): string => t(`modes.${item}` as TranslationKey)
  const modeHint = (item: HelpMode): string => t(`modes.${item}.hint` as TranslationKey)

  return (
    <section className={styles.chat}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.chatTitle}>{activeChat?.title ?? t('chat.new')}</span>
          <span className={styles.chatSubtitle}>
            {activeProject ? (
              <>
                <span>{activeProject.name}</span>
                <span>·</span>
                <span>{activeProject.rootPath}</span>
              </>
            ) : (
              <span>{t('nav.freeChats')}</span>
            )}
          </span>
        </div>
        <div className={styles.headerControls}>
          <div className={styles.modeGroup} role="group" aria-label={t('chat.model')}>
            {HELP_MODES.map((item) => (
              <button
                key={item}
                type="button"
                title={modeHint(item)}
                className={[styles.modeButton, mode === item ? styles.modeButtonActive : ''].join(' ')}
                onClick={() => changeMode(item)}
              >
                {modeLabel(item)}
              </button>
            ))}
          </div>
          <Select
            style={{ width: 190 }}
            value={modelId}
            onChange={(event) => void updateSettings({ selectedModel: event.target.value })}
            aria-label={t('chat.model')}
          >
            <option value="">—</option>
            {(models?.models ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </Select>
          {activeChat ? (
            <IconButton
              label={t('chat.clear')}
              onClick={() => {
                if (window.confirm(t('chat.clearConfirm'))) {
                  void clearMessages()
                }
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          ) : null}
        </div>
      </header>

      {!hasKey ? (
        <div className={styles.banner} role="alert">
          {t('chat.noKeyBanner')}
          <button type="button" className={styles.suggestion} onClick={onOpenSettings}>
            {t('onboarding.openSettings')}
          </button>
        </div>
      ) : null}

      <div className={styles.messages}>
        {messages.length === 0 && !stream ? (
          <div className={styles.emptyChat}>
            <span className={styles.emptyIcon}>
              <Sparkles size={24} />
            </span>
            <span className={styles.emptyTitle}>{t('chat.empty.title')}</span>
            <span className={styles.emptyText}>{t('chat.empty.body')}</span>
            <div className={styles.suggestions}>
              {HELP_MODES.map((item) => (
                <button key={item} type="button" className={styles.suggestion} onClick={() => changeMode(item)}>
                  {modeLabel(item)} · {modeHint(item)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <MessageList messages={messages} stream={stream} />
        <div ref={endRef} />
      </div>

      <Composer
        disabled={Boolean(stream) || preparingContext}
        streaming={Boolean(stream)}
        attachments={attachments.map((attachment) => ({ fileName: attachment.fileName, kind: attachment.kind }))}
        onAttach={() => void attachFiles()}
        attachBusy={attachBusy}
        onRemoveAttachment={(index) => setAttachments((current) => current.filter((_, idx) => idx !== index))}
        onSend={(text) => void handleSend(text)}
        onStop={() => void cancelStream()}
        onOpenContext={() => {
          if (!activeProject) {
            pushToast(t('context.emptyBody'), 'info')
            return
          }
          setContextOpen(true)
        }}
        contextSummary={preparingContext ? t('context.preparing') : contextSummary}
        requirementIncluded={requirementIncluded}
        sendKey={settings.sendKey}
      />

      {activeProject ? (
        <ContextModal
          open={contextOpen}
          projectId={activeProject.id}
          initialMode={activeContext?.mode ?? 'all'}
          initialQuery={activeContext?.query ?? ''}
          initialSources={activeContext?.sources ?? []}
          initialAutoSearch={activeContext?.autoSearch ?? false}
          initialIncludeRequirement={
            Boolean(requirements?.content) && (activeContext?.includeRequirement ?? true)
          }
          requirementText={requirements?.content ?? null}
          onClose={() => setContextOpen(false)}
          onApply={(payload: ContextApplyPayload) => {
            setContexts((current) => ({
              ...current,
              [activeProject.id]: {
                mode: payload.mode,
                query: payload.query,
                sources: payload.sources,
                autoSearch: payload.autoSearch,
                includeRequirement: payload.includeRequirement
              }
            }))
            setContextOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}
