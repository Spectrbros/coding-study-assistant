import { Children, isValidElement, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './markdown.module.css'

function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(nodeToText).join('')
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeToText(node.props.children)
  }
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }): React.JSX.Element {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const firstChild = Children.toArray(children)[0]
  const language =
    isValidElement<{ className?: string }>(firstChild) && firstChild.props.className
      ? firstChild.props.className.replace('hljs', '').replace('language-', '').trim()
      : ''

  const copy = async (): Promise<void> => {
    await window.api.system.copyText(nodeToText(children))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeBlockHeader}>
        <span>{language || 'code'}</span>
        <button type="button" className={styles.copyButton} onClick={() => void copy()}>
          <Copy size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

export function MarkdownMessage({ content }: { content: string }): React.JSX.Element {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                if (href) {
                  void window.api.system.openExternal(href)
                }
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function ReasoningBlock({
  reasoning,
  streaming
}: {
  reasoning: string
  streaming: boolean
}): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(streaming)
  return (
    <div className={styles.reasoning}>
      <button type="button" className={styles.reasoningToggle} onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? t('chat.hideReasoning') : t('chat.showReasoning')}
      </button>
      {open ? <div className={styles.reasoningBody}>{reasoning}</div> : null}
    </div>
  )
}
