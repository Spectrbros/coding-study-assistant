import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePlus2, RefreshCw, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useApp } from '../../state/AppProvider'
import { Badge, Button, Input, Modal, Spinner } from '../ui/ui'
import styles from './context.module.css'
import type {
  ContextBuildMode,
  ContextCandidate,
  ContextSelectionMode,
  ContextSource,
  ContextStaleEntry
} from '@shared/types'
import { errorToMessage } from '../../utils/errorText'

export interface ContextApplyPayload {
  mode: ContextSelectionMode
  query: string
  sources: ContextSource[]
  autoSearch: boolean
  includeRequirement: boolean
}

interface ContextModalProps {
  open: boolean
  projectId: string
  initialMode: ContextSelectionMode
  initialQuery: string
  initialSources: ContextSource[]
  initialAutoSearch: boolean
  initialIncludeRequirement: boolean
  requirementText: string | null
  onClose: () => void
  onApply: (payload: ContextApplyPayload) => void
}

export function ContextModal({
  open,
  projectId,
  initialMode,
  initialQuery,
  initialSources,
  initialAutoSearch,
  initialIncludeRequirement,
  requirementText,
  onClose,
  onApply
}: ContextModalProps): React.JSX.Element {
  const { t } = useI18n()
  const { bumpChecklist, pushToast } = useApp()
  const [mode, setMode] = useState<ContextBuildMode>(initialMode === 'search' ? 'search' : 'all')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [autoSearch, setAutoSearch] = useState(initialAutoSearch)
  const [candidates, setCandidates] = useState<ContextCandidate[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [includeRequirement, setIncludeRequirement] = useState(initialIncludeRequirement)
  const [manualInput, setManualInput] = useState('')
  const [manualPaths, setManualPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [scanned, setScanned] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [stale, setStale] = useState<ContextStaleEntry[]>([])
  const [submitting, setSubmitting] = useState(false)

  const build = useCallback(
    async (
      nextMode: ContextBuildMode,
      nextQuery: string,
      paths: string[],
      preferredPaths: string[] | null
    ): Promise<void> => {
      setLoading(true)
      setError(null)
      setStale([])
      try {
        const result = await window.api.context.build({
          projectId,
          mode: nextMode,
          query: nextQuery,
          includeRequirement,
          manualPaths: paths
        })
        const preferred = preferredPaths === null ? null : new Set(preferredPaths)
        const selected = result.candidates.filter(
          (candidate) => preferred === null || (candidate.source.path !== null && preferred.has(candidate.source.path))
        )
        setCandidates(result.candidates)
        setSelectedIds(new Set(selected.map((candidate) => candidate.source.id)))
        setPreviewId(result.candidates[0]?.source.id ?? null)
        setNotice(result.notice)
        setScanned(result.scannedFiles)
        setTruncated(result.truncated)
      } catch (buildError) {
        setError(errorToMessage(t, buildError))
        setCandidates([])
        setSelectedIds(new Set())
        setPreviewId(null)
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
    const initialManual = initialSources
      .filter((source) => source.kind === 'manual' && source.path !== null)
      .map((source) => source.path as string)
    const preferred = initialMode === 'all' ? null : initialSources
      .map((source) => source.path)
      .filter((path): path is string => path !== null)
    setMode(initialMode === 'search' ? 'search' : 'all')
    setSearchQuery(initialQuery)
    setAutoSearch(initialAutoSearch)
    setIncludeRequirement(initialIncludeRequirement)
    setManualPaths(initialManual)
    setManualInput('')
    setPreviewId(null)
    setStale([])
    setNotice(null)
    setTruncated(false)
    void build(
      initialMode === 'search' ? 'search' : 'all',
      initialMode === 'search' ? initialQuery : '',
      initialManual,
      preferred
    )
    // Начальные значения фиксируются при открытии окна.
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
  const allSelected = candidates.length > 0 && selectedIds.size === candidates.length

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

  const switchMode = (next: ContextBuildMode): void => {
    setMode(next)
    setStale([])
    if (next === 'all') {
      void build('all', '', manualPaths, null)
      return
    }
    if (searchQuery.trim().length > 0) {
      void build('search', searchQuery, manualPaths, null)
    } else {
      setCandidates([])
      setSelectedIds(new Set())
      setPreviewId(null)
      setNotice(null)
      setTruncated(false)
      setScanned(0)
    }
  }

  const addManualPath = (): void => {
    const path = manualInput.trim().replace(/\\/g, '/')
    if (path.length === 0) {
      return
    }
    const nextPaths = [...new Set([...manualPaths, path])].slice(0, 10)
    setManualPaths(nextPaths)
    setManualInput('')
    const selectedPaths = selectedSources
      .map((source) => source.path)
      .filter((sourcePath): sourcePath is string => sourcePath !== null)
    void build(
      mode,
      mode === 'search' ? searchQuery : '',
      nextPaths,
      [...new Set([...selectedPaths, path])]
    )
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

  const apply = async (): Promise<void> => {
    setSubmitting(true)
    try {
      const appliedMode: ContextSelectionMode =
        mode === 'search'
          ? 'search'
          : selectedSources.length === candidates.length && manualPaths.length === 0
            ? 'all'
            : 'custom'
      if (appliedMode !== 'all' && selectedSources.length > 0) {
        const changed = await window.api.context.revalidate({ projectId, sources: selectedSources })
        if (changed.length > 0) {
          setStale(changed)
          return
        }
      }
      onApply({
        mode: appliedMode,
        query: mode === 'search' ? searchQuery : '',
        sources: selectedSources,
        autoSearch,
        includeRequirement
      })
    } catch (applyError) {
      pushToast(errorToMessage(t, applyError), 'error')
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
            <span className={styles.scrollHint}>
              {t('context.selectedFiles', { count: selectedSources.length })}
            </span>
          </div>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void apply()}
            loading={submitting}
            disabled={loading || stale.length > 0}
          >
            {t('context.apply')}
          </Button>
        </>
      }
    >
      <div className={styles.searchRow}>
        <Button
          variant={mode === 'all' ? 'primary' : 'secondary'}
          onClick={() => switchMode('all')}
          disabled={loading}
        >
          {t('context.tabAll')}
        </Button>
        <Button
          variant={mode === 'search' ? 'primary' : 'secondary'}
          onClick={() => switchMode('search')}
          disabled={loading}
        >
          <Search size={14} />
          {t('context.tabSearch')}
        </Button>
      </div>

      {mode === 'search' ? (
        <div className={styles.searchRow}>
          <Input
            value={searchQuery}
            placeholder={t('context.searchPlaceholder')}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void build('search', searchQuery, manualPaths, null)
              }
            }}
          />
          <Button
            onClick={() => void build('search', searchQuery, manualPaths, null)}
            disabled={loading || searchQuery.trim().length === 0}
          >
            <Search size={14} />
            {t('context.searchButton')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void build('search', searchQuery, manualPaths, null)}
            disabled={loading}
            title={t('context.refresh')}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      ) : (
        <div className={styles.searchRow}>
          <Button
            variant="secondary"
            onClick={() => void build('all', '', manualPaths, null)}
            disabled={loading}
          >
            <RefreshCw size={14} />
            {t('context.refresh')}
          </Button>
        </div>
      )}

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
        <span>{mode === 'all' ? t('context.filesAvailable', { count: candidates.length }) : t('context.found', { count: candidates.length })}</span>
        <span>{t('context.scanned', { count: scanned })}</span>
        <span>{t('context.estimatedTokens', { tokens: estimatedTokens })}</span>
        <Button
          small
          variant="ghost"
          onClick={() => setSelectedIds(new Set(candidates.map((candidate) => candidate.source.id)))}
          disabled={candidates.length === 0 || allSelected}
        >
          {t('context.selectAll')}
        </Button>
        <Button small variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>
          {t('context.deselectAll')}
        </Button>
      </div>

      {truncated ? (
        <div className={styles.staleBox}>
          {t('context.partial', { included: candidates.length, scanned })}
        </div>
      ) : null}

      {notice ? <div className={styles.metaRow}>{notice}</div> : null}

      <div className={styles.requirementRow}>
        <span>{t('context.autoSearch')}</span>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={autoSearch}
          onChange={(event) => setAutoSearch(event.target.checked)}
        />
      </div>
      {autoSearch ? <div className={styles.scrollHint}>{t('context.autoSearchHint')}</div> : null}

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
          <Button
            small
            variant="secondary"
            onClick={() =>
              void build(
                mode,
                mode === 'search' ? searchQuery : '',
                manualPaths,
                selectedSources
                  .map((source) => source.path)
                  .filter((sourcePath): sourcePath is string => sourcePath !== null)
              )
            }
          >
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
                <div>{t('context.emptyFiles')}</div>
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