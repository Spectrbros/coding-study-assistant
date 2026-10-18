import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RefreshCw, Square } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge, Button, EmptyState, IconButton, Spinner } from '../ui/ui'
import styles from './panels.module.css'
import type { RunPrompt, RunResult } from '@shared/types'
import { errorToMessage } from '../../utils/errorText'

const LIVE_OUTPUT_LIMIT = 20000

export function RunsPanel(): React.JSX.Element {
  const { t } = useI18n()
  const { activeProject, pushToast } = useApp()
  const [prompts, setPrompts] = useState<RunPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [liveOutput, setLiveOutput] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeRunRef = useRef<string | null>(null)

  const propose = useCallback(async (): Promise<void> => {
    if (!activeProject) {
      setPrompts([])
      return
    }
    setLoading(true)
    try {
      const list = await window.api.runs.propose(activeProject.id)
      setPrompts(list)
    } catch (err) {
      setPrompts([])
      pushToast(errorToMessage(t, err), 'error')
    } finally {
      setLoading(false)
    }
  }, [activeProject, pushToast, t])

  useEffect(() => {
    void propose()
  }, [propose])

  useEffect(() => {
    return window.api.runs.onEvent((event) => {
      if (event.runId !== activeRunRef.current) {
        return
      }
      setLiveOutput((current) => {
        const next = current + (event.stream === 'stderr' ? `[stderr] ${event.chunk}` : event.chunk)
        return next.length > LIVE_OUTPUT_LIMIT ? next.slice(next.length - LIVE_OUTPUT_LIMIT) : next
      })
    })
  }, [])

  const run = async (prompt: RunPrompt): Promise<void> => {
    if (!activeProject) {
      return
    }
    activeRunRef.current = prompt.id
    setRunningId(prompt.id)
    setLiveOutput('')
    setResult(null)
    setError(null)
    try {
      const outcome = await window.api.runs.execute(prompt)
      setResult(outcome)
      if (outcome.sourceChanged) {
        pushToast(t('runs.sourceChanged'), 'error')
      } else if (!outcome.cleanupOk) {
        pushToast(t('runs.cleanupFailed'), 'error')
      }
    } catch (err) {
      setError(errorToMessage(t, err))
    } finally {
      activeRunRef.current = null
      setRunningId(null)
    }
  }

  const cancel = async (runId: string): Promise<void> => {
    try {
      await window.api.runs.cancel(runId)
    } catch (err) {
      pushToast(errorToMessage(t, err), 'error')
    }
  }

  if (!activeProject) {
    return <div className={styles.emptyInline}>{t('runs.empty')}</div>
  }

  const combinedOutput = [result?.stdout, result?.stderr].filter((part) => part && part.length > 0).join('\n')
  const exitTone = result ? (result.exitCode === 0 ? 'success' : 'danger') : 'neutral'

  return (
    <div className={styles.stack}>
      <div className={styles.panelTitle}>
        <span>{t('runs.title')}</span>
        <IconButton label={t('runs.propose')} onClick={() => void propose()} disabled={loading || runningId !== null}>
          <RefreshCw size={14} />
        </IconButton>
      </div>
      <div className={styles.purpose}>{t('runs.subtitle')}</div>

      {loading && prompts.length === 0 ? (
        <div className={styles.row}>
          <Spinner />
          <span className={styles.purpose}>{t('runs.propose')}</span>
        </div>
      ) : prompts.length === 0 ? (
        <EmptyState title={t('runs.empty')} />
      ) : (
        <div className={styles.itemList}>
          {prompts.map((prompt) => {
            const isRunning = runningId === prompt.id
            const isOtherRunning = runningId !== null && !isRunning
            return (
              <div key={prompt.id} className={styles.runRow}>
                <div className={styles.grow}>
                  <div className={styles.command} title={prompt.displayCommand}>
                    {prompt.displayCommand}
                  </div>
                  <div className={styles.purpose}>{prompt.purpose}</div>
                </div>
                {isRunning ? (
                  <Button small variant="danger" onClick={() => void cancel(prompt.id)}>
                    <Square size={12} />
                    {t('runs.cancel')}
                  </Button>
                ) : (
                  <Button
                    small
                    variant="secondary"
                    disabled={isOtherRunning}
                    onClick={() => void run(prompt)}
                  >
                    <Play size={12} />
                    {t('runs.run')}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.notice}>{t('runs.onlyWhitelisted')}</div>
      <div className={styles.notice}>{t('runs.runNotice')}</div>
      {prompts[0] ? <div className={styles.purpose}>{prompts[0].isolationNote}</div> : null}

      {runningId !== null || result !== null || error !== null ? (
        <div className={styles.stack}>
          <div className={styles.panelTitle}>
            <span>{t('runs.output')}</span>
            {runningId !== null ? (
              <Badge tone="accent">{t('runs.running')}</Badge>
            ) : result ? (
              <Badge tone={exitTone}>{t('runs.exitCode', { code: result.exitCode ?? '—' })}</Badge>
            ) : null}
          </div>

          {result ? (
            <div className={styles.resultMeta}>
              <span>{t('runs.duration', { ms: result.durationMs })}</span>
              <span>
                {t('runs.copied', {
                  files: result.copiedFiles,
                  kb: Math.round(result.copiedBytes / 1024)
                })}
              </span>
              {result.timedOut ? <Badge tone="warning">{t('runs.timeout')}</Badge> : null}
              {result.truncated ? <Badge tone="warning">{t('runs.truncated')}</Badge> : null}
              {result.cleanupOk ? (
                <Badge tone="success">{t('runs.cleanupOk')}</Badge>
              ) : (
                <Badge tone="danger">{t('runs.cleanupFailed')}</Badge>
              )}
              {result.sourceChanged ? (
                <Badge tone="danger">{t('runs.sourceChanged')}</Badge>
              ) : (
                <Badge tone="neutral">{t('runs.sourceUnchanged')}</Badge>
              )}
            </div>
          ) : null}

          {error ? <div className={styles.noticeDanger}>{error}</div> : null}

          <pre className={styles.output}>
            {runningId !== null ? liveOutput || t('runs.running') : combinedOutput || t('runs.noOutput')}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
