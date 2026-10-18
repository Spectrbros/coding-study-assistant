import { Sparkles } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge } from '../ui/ui'
import { MarkdownMessage, ReasoningBlock } from '../markdown/MarkdownMessage'
import styles from './chat.module.css'
import type { ChatMessage } from '@shared/types'

export function MessageList({
  messages,
  stream
}: {
  messages: ChatMessage[]
  stream: { content: string; reasoning: string } | null
}): React.JSX.Element {
  const { t } = useI18n()

  return (
    <>
      {messages.map((message) => (
        <div
          key={message.id}
          className={[styles.message, message.role === 'assistant' ? styles.assistantMessage : ''].join(' ')}
        >
          <span className={[styles.avatar, message.role === 'assistant' ? styles.avatarAssistant : ''].join(' ')}>
            {message.role === 'assistant' ? <Sparkles size={14} /> : 'Вы'}
          </span>
          <div className={[styles.bubble, message.role === 'user' ? styles.userBubble : ''].join(' ')}>
            {message.role === 'assistant' ? (
              <>
                {message.reasoning ? <ReasoningBlock reasoning={message.reasoning} streaming={false} /> : null}
                <MarkdownMessage content={message.content} />
                {message.status === 'error' ? (
                  <div className={styles.errorBox}>
                    {t('chat.errorPrefix')}: {t(`errors.${message.errorCode ?? 'unknown'}` as never)}
                  </div>
                ) : null}
                {message.status === 'cancelled' ? <div className={styles.messageMeta}>{t('chat.stopped')}</div> : null}
                <div className={styles.messageMeta}>
                  {message.usage?.totalTokens ? (
                    <span>
                      {t('chat.usage', {
                        prompt: message.usage.promptTokens ?? 0,
                        completion: message.usage.completionTokens ?? 0
                      })}
                    </span>
                  ) : null}
                  {message.contextMeta ? (
                    <Badge tone="accent">
                      {t('chat.contextUsed', { count: message.contextMeta.sourceIds.length })}
                      {message.contextMeta.requirementIncluded ? ` · ${t('chat.requirementUsed')}` : ''}
                    </Badge>
                  ) : null}
                </div>
              </>
            ) : (
              message.content
            )}
          </div>
        </div>
      ))}

      {stream ? (
        <div className={[styles.message, styles.assistantMessage].join(' ')}>
          <span className={[styles.avatar, styles.avatarAssistant].join(' ')}>
            <Sparkles size={14} />
          </span>
          <div className={styles.bubble}>
            {stream.reasoning ? <ReasoningBlock reasoning={stream.reasoning} streaming /> : null}
            {stream.content ? (
              <MarkdownMessage content={stream.content} />
            ) : (
              <span className={styles.typing} aria-label={t('common.loading')}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </span>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
