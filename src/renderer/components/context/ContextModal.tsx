import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePlus2, RefreshCw, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useApp } from '../../state/AppProvider'
import { Badge, Button, Input, Modal, Spinner } from '../ui/ui'
import styles from './context.module.css'
import type { ContextCandidate, ContextSource, ContextStaleEntry } from '@shared/types'
import { errorToMessage } from '../../utils/errorText'

interface ContextModalProps {
  open: boolean
  projectId: string
  query: string
  requirementText: string | null
  onClose: () => void
  onConfirm: (sources: ContextSource[], includeRequirement: boolean) => void
}

export function ContextModal({
  open,
  projectId,
  query,
  requirementText,
  onClose,
  onConfirm
}: ContextModalProps): React.JSX.Element {
  const { t } = useI18n()
  const { bumpChecklist, pushToast } = useApp()
  const [searchQuery, setSearchQuery] = useState(query)
  const [candidates, setCandidates] = useState<ContextCandidate[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [includeRequirement, setIncludeRequirement] = useState(Boolean(requirementText))
  const [manualInput, setManualInput] = useState('')
  const [manualPaths, setManualPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [scanned, setScanned] = useState(0)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [stale, setStale] = useState<ContextStaleEntry[]>([])
  const [submitting, setSubmitting] = useState(false)

  const build = useCallback(
    async (nextQuery: string, paths: string[]) => {
      setLoading(true)
      setError(null)
      setStale([])
      try {
        const result = await window.api.context.build({
          projectId,
          query: nextQuery,
          includeRequirement,
          manualPaths: paths
        })
        setCandidates(result.candidates)
        setSelectedIds(new Set(result.candidates.map((candidate) => candidate.source.id)))
        setPreviewId(result.candidates[0]?.source.id ?? null)
        setNotice(result.notice)
        setScanned(result.scannedFiles)
      } catch (buildError) {
        setError(errorToMessage(t, buildError))
        setCandidates([])
      } finally {
        setLoading(false)
      }
    },
    [includeRequirement, projectId, t]
  )

  useEffect(() => {
    if (!open) {
      return
    }
    setSearchQuery(query)
    setManualPaths([])
    setManualInput('')
    setPreviewId(null)
    setStale([])
    void build(query, [])
    // Пересборка выполняется при открытии окна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId])

  const selectedSources = useMemo(
    () =>
      candidates.filter((candidate) => selectedIds.has(candidate.source.id)).map((candidate) => candidate.source),
    [candidates, selectedIds]
  )

  const estimatedTokens = useMemo(
    () => Math.ceil(selectedSources.reduce((sum, source) => sum + source.content.length, 0) / 3.3),
    [selectedSources]
  )

  const previewCandidate = candidates.find((candidate) => candidate.source.id === previewId) ?? null

  const toggleSource = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setStale([])
  }

  const addManualPath = (): void => {
    const path = manualInput.trim().replace(/\\/g, '/')
    if (path.length === 0) {
      return
    }
    const nextPaths = [...new Set([...manualPaths, path])].slice(0, 10)
    setManualPaths(nextPaths)
    setManualInput('')
    void build(searchQuery, nextPaths)
  }

  const addToChecklist = async (source: ContextSource): Promise<void> => {
    try {
      await window.api.checklist.create({
        projectId,
        title: source.label,
        description: source.startLine
          ? `${t('checklist.link')}: ${source.path}:${source.startLine}-${source.endLine ?? source.startLine}`
          : null,
        status: 'unchecked',
        filePath: source.path,
        startLine: source.startLine,
        endLine: source.endLine,
        source: 'ai'
      })
      bumpChecklist()
      pushToast(t('toast.saved'), 'success')
    } catch (createError) {
      pushToast(errorToMessage(t, createError), 'error')
    }
  }

  const confirm = async (withContext: boolean): Promise<void> => {
    if (!withContext) {
      onConfirm([], false)
      return
    }
    setSubmitting(true)
    try {
      if (selectedSources.length === 0) {
        onConfirm([], includeRequirement)
        return
      }
      const changed = await window.api.context.revalidate({ projectId, sources: selectedSources })
      if (changed.length > 0) {
        setStale(changed)
        return
      }
      onConfirm(selectedSources, includeRequirement)
    } catch (confirmError) {
      pushToast(errorToMessage(t, confirmError), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={t('context.title')}
      onClose={onClose}
      footer={
        <>
          <div className={styles.modalFooterLeft}>
            <Button variant="ghost" onClick={() => void confirm(false)} disabled={submitting}>
              {t('chat.send')} · {t('context.none')}
            </Button>
            <span className={styles.scrollHint}>{t('context.requiredBeforeSend')}</span>
          </div>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void confirm(true)} loading={submitting} disabled={loading}>
            {t('context.send')} ({selectedSources.length})
          </Button>
        </>
      }
    >
      <div className={styles.searchRow}>
        <Input
          value={searchQuery}
          placeholder={t('context.searchPlaceholder')}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void build(searchQuery, manualPaths)
            }
          }}
        />
        <Button onClick={() => void build(searchQuery, manualPaths)} disabled={loading}>
          <Search size={14} />
          {t('context.searchButton')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void build(searchQuery, manualPaths)}
          disabled={loading}
          title={t('context.refresh')}
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      <div className={styles.manualRow}>
        <Input
          value={manualInput}
          placeholder={t('context.manualHint')}
          onChange={(event) => setManualInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addManualPath()
            }
          }}
        />
        <Button variant="secondary" onClick={addManualPath}>
          <FilePlus2 size={14} />
          {t('context.manualAdd')}
        </Button>
      </div>

      {manualPaths.length > 0 ? (
        <div className={styles.metaRow}>
          {manualPaths.map((path) => (
            <Badge key={path} tone="accent">
              {path}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className={styles.metaRow}>
        <span>{t('context.found', { count: candidates.length })}</span>
        <span>{t('context.scanned', { count: scanned })}</span>
        <span>{t('context.estimatedTokens', { tokens: estimatedTokens })}</span>
        <Button small variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>
          {t('context.deselectAll')}
        </Button>
      </div>

      {notice ? <div className={styles.metaRow}>{notice}</div> : null}

      <div className={styles.requirementRow}>
        <span>{t('context.requirementToggle')}</span>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={includeRequirement}
          disabled={!requirementText}
          onChange={(event) => setIncludeRequirement(event.target.checked)}
        />
      </div>

      {stale.length > 0 ? (
        <div className={styles.staleBox}>
          <span>{t('context.staleBody', { paths: stale.map((entry) => entry.path).join(', ') })}</span>
          <Button small variant="secondary" onClick={() => void build(searchQuery, manualPaths)}>
            {t('context.refresh')}
          </Button>
        </div>
      ) : null}

      {error ? <div className={styles.staleBox}>{error}</div> : null}

      <div className={styles.results}>
        <div className={styles.sourceList}>
          {loading ? (
            <div className={styles.emptyPreview}>
              <Spinner />
              <span style={{ marginLeft: 8 }}>{t('context.searching')}</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className={styles.emptyPreview}>
              <div>
                <div style={{ marginBottom: 6 }}>{t('context.emptyTitle')}</div>
                <div>{t('context.emptyBody')}</div>
              </div>
            </div>
          ) : (
            candidates.map((candidate) => (
              <div
                key={candidate.source.id}
                className={[
                  styles.sourceItem,
                  previewId === candidate.source.id ? styles.sourceItemActive : ''
                ].join(' ')}
                onClick={() => setPreviewId(candidate.source.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setPreviewId(candidate.source.id)
                  }
                }}
              >
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedIds.has(candidate.source.id)}
                  onChange={(event) => {
                    event.stopPropagation()
                    toggleSource(candidate.source.id)
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
                <div className={styles.sourceInfo}>
                  <span className={styles.sourcePath}>{candidate.source.label}</span>
                  <span className={styles.sourceMeta}>
                    {candidate.source.startLine !== null
                      ? `${candidate.source.startLine}-${candidate.source.endLine ?? candidate.source.startLine} · `
                      : ''}
                    {candidate.reason}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.preview}>
          {previewCandidate ? (
            <>
              <div className={styles.previewHeader}>
                <span className={styles.sourcePath}>{previewCandidate.source.label}</span>
                <Button small variant="ghost" onClick={() => void addToChecklist(previewCandidate.source)}>
                  {t('checklist.addFromSource')}
                </Button>
              </div>
              {previewCandidate.source.content}
            </>
          ) : (
            <div className={styles.emptyPreview}>{t('context.preview')}</div>
          )}
        </div>
      </div>
    </Modal>
  )
}