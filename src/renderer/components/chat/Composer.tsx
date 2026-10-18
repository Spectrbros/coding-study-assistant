import { useEffect, useRef, useState } from 'react'
import { Paperclip, SendHorizontal, SlidersHorizontal, Square, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge, Button, IconButton, Spinner } from '../ui/ui'
import styles from './chat.module.css'
import type { AttachmentKind } from '@shared/types'

interface ComposerProps {
  disabled: boolean
  streaming: boolean
  attachments: Array<{ fileName: string; kind: AttachmentKind }>
  attachBusy: boolean
  contextSummary: string
  requirementIncluded: boolean
  sendKey: 'enter' | 'ctrl-enter'
  onAttach: () => void
  onRemoveAttachment: (index: number) => void
  onSend: (text: string) => void
  onStop: () => void
  onOpenContext: () => void
}

export function Composer({
  disabled,
  streaming,
  attachments,
  attachBusy,
  contextSummary,
  requirementIncluded,
  sendKey,
  onAttach,
  onRemoveAttachment,
  onSend,
  onStop,
  onOpenContext
}: ComposerProps): React.JSX.Element {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) {
      return
    }
    element.style.height = 'auto'
    element.style.height = `${Math.min(200, element.scrollHeight)}px`
  }, [text])

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed.length === 0 || disabled) {
      return
    }
    onSend(trimmed)
    setText('')
  }

  return (
    <div className={styles.composer}>
      {attachments.length > 0 ? (
        <div className={styles.chipRow}>
          {attachments.map((attachment, index) => (
            <span key={`${attachment.fileName}-${index}`} className={styles.chip}>
              <span className={styles.chipText} title={attachment.fileName}>
                {attachment.fileName}
              </span>
              <Badge>{t(`attachments.${attachment.kind === 'unsupported' ? 'unsupported' : attachment.kind}` as never)}</Badge>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={t('attachments.remove')}
                onClick={() => onRemoveAttachment(index)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.composerRow}>
        <IconButton label={t('attachments.add')} onClick={onAttach} disabled={attachBusy || disabled}>
          {attachBusy ? <Spinner /> : <Paperclip size={16} />}
        </IconButton>
        <IconButton label={t('chat.contextButton')} onClick={onOpenContext} disabled={disabled}>
          <SlidersHorizontal size={16} />
        </IconButton>
        <textarea
          ref={textareaRef}
          className={styles.composerInput}
          placeholder={t('chat.placeholder')}
          value={text}
          rows={1}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return
            }
            const wantsSend =
              sendKey === 'enter'
                ? !event.shiftKey && !event.ctrlKey && !event.altKey
                : event.ctrlKey && !event.shiftKey
            if (wantsSend) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {streaming ? (
          <Button variant="danger" onClick={onStop} title={t('chat.stop')}>
            <Square size={13} />
            {t('chat.stop')}
          </Button>
        ) : (
          <Button variant="primary" onClick={submit} disabled={disabled || text.trim().length === 0}>
            <SendHorizontal size={14} />
            {t('chat.send')}
          </Button>
        )}
      </div>

      <div className={styles.composerHint}>
        <span>
          {contextSummary}
          {requirementIncluded ? ` · ${t('context.requirementIncluded')}` : ''}
        </span>
        <span>{sendKey === 'enter' ? t('settings.sendKey.enter') : t('settings.sendKey.ctrlEnter')}</span>
      </div>
    </div>
  )
}
