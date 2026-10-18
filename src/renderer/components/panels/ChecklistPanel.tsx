import { useCallback, useEffect, useState } from 'react'
import { ListChecks, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n, type TranslationKey } from '../../i18n/I18nProvider'
import { Badge, Button, EmptyState, IconButton, Input, Modal } from '../ui/ui'
import styles from './panels.module.css'
import {
  CHECKLIST_STATUSES,
  type ChecklistItem,
  type ChecklistStatus
} from '@shared/types'
import type { ChecklistLinkState, RequirementEvaluation, RequirementSuggestion } from '@shared/api'
import { errorToMessage } from '../../utils/errorText'

function statusTone(status: ChecklistStatus): 'neutral' | 'accent' | 'success' | 'warning' {
  if (status === 'done') {
    return 'success'
  }
  if (status === 'in_progress') {
    return 'accent'
  }
  if (status === 'needs_fix') {
    return 'warning'
  }
  return 'neutral'
}

export function ChecklistPanel(): React.JSX.Element {
  const { t } = useI18n()
  const { activeProject, checklist, checklistRefreshKey, reloadChecklist, pushToast } = useApp()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkStates, setLinkStates] = useState<Record<string, ChecklistLinkState['state']>>({})
  const [suggestions, setSuggestions] = useState<RequirementSuggestion[] | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())
  const [evaluations, setEvaluations] = useState<RequirementEvaluation[] | null>(null)
  const [selectedEvaluations, setSelectedEvaluations] = useState<Set<string>>(new Set())
  const [aiBusy, setAiBusy] = useState<'suggest' | 'evaluate' | null>(null)

  const refreshLinks = useCallback(async () => {
    if (!activeProject) {
      setLinkStates({})
      return
    }
    try {
      const states = await window.api.checklist.linkState(activeProject.id)
      const map: Record<string, ChecklistLinkState['state']> = {}
      for (const state of states) {
        map[state.itemId] = state.state
      }
      setLinkStates(map)
    } catch {
      setLinkStates({})
    }
  }, [activeProject])

  useEffect(() => {
    void refreshLinks()
    // Состояния ссылок пересчитываются при смене проекта и состава чек-листа.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, checklist.length, checklistRefreshKey])

  if (!activeProject) {
    return <div className={styles.emptyInline}>{t('checklist.empty')}</div>
  }

  const doneCount = checklist.filter((item) => item.status === 'done').length
  const progress = checklist.length === 0 ? 0 : Math.round((doneCount / checklist.length) * 100)

  const addItem = async (): Promise<void> => {
    const title = draft.trim()
    if (title.length === 0) {
      return
    }
    setBusy(true)
    try {
      await window.api.checklist.create({
        projectId: activeProject.id,
        title,
        description: null,
        status: 'unchecked',
        filePath: null,
        startLine: null,
        endLine: null,
        source: 'manual'
      })
      setDraft('')
      await reloadChecklist()
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (item: ChecklistItem, status: ChecklistStatus): Promise<void> => {
    try {
      await window.api.checklist.update({ id: item.id, status })
      await reloadChecklist()
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    }
  }

  const removeItem = async (item: ChecklistItem): Promise<void> => {
    if (!window.confirm(t('checklist.deleteConfirm', { title: item.title }))) {
      return
    }
    try {
      await window.api.checklist.remove(item.id)
      await reloadChecklist()
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    }
  }

  const suggest = async (): Promise<void> => {
    setAiBusy('suggest')
    try {
      const result = await window.api.checklist.suggest(activeProject.id)
      setSuggestions(result)
      setSelectedSuggestions(new Set(result.map((_, index) => index)))
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const evaluate = async (): Promise<void> => {
    setAiBusy('evaluate')
    try {
      const result = await window.api.checklist.evaluate(activeProject.id)
      setEvaluations(result)
      setSelectedEvaluations(new Set(result.map((entry) => entry.itemId)))
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const applySuggestions = async (): Promise<void> => {
    if (!suggestions) {
      return
    }
    setBusy(true)
    try {
      for (const [index, suggestion] of suggestions.entries()) {
        if (!selectedSuggestions.has(index)) {
          continue
        }
        await window.api.checklist.create({
          projectId: activeProject.id,
          title: suggestion.title,
          description: suggestion.description,
          status: 'unchecked',
          filePath: null,
          startLine: null,
          endLine: null,
          source: 'ai'
        })
      }
      setSuggestions(null)
      await reloadChecklist()
      pushToast(t('toast.saved'), 'success')
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const applyEvaluations = async (): Promise<void> => {
    if (!evaluations) {
      return
    }
    setBusy(true)
    try {
      for (const evaluation of evaluations) {
        if (!selectedEvaluations.has(evaluation.itemId)) {
          continue
        }
        await window.api.checklist.update({ id: evaluation.itemId, status: evaluation.suggestedStatus })
      }
      setEvaluations(null)
      await reloadChecklist()
      pushToast(t('toast.updated'), 'success')
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const statusLabel = (status: ChecklistStatus): string => t(`checklist.status.${status}` as TranslationKey)

  const linkLabel = (state: ChecklistLinkState['state']): string => {
    if (state === 'valid') {
      return t('checklist.linkValid')
    }
    if (state === 'stale') {
      return t('checklist.linkStale')
    }
    if (state === 'missing') {
      return t('checklist.linkMissing')
    }
    return t('checklist.link')
  }

  return (
    <div className={styles.stack}>
      <div className={styles.progressLabel}>
        <span>{t('checklist.progress', { done: doneCount, total: checklist.length })}</span>
        <span>{progress}%</span>
      </div>
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.row}>
        <Input
          value={draft}
          placeholder={t('checklist.newPlaceholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void addItem()
            }
          }}
        />
        <Button variant="primary" small onClick={() => void addItem()} loading={busy} disabled={draft.trim().length === 0}>
          <Plus size={14} />
          {t('checklist.add')}
        </Button>
      </div>

      <div className={styles.row}>
        <Button
          small
          variant="secondary"
          onClick={() => void suggest()}
          loading={aiBusy === 'suggest'}
          disabled={aiBusy !== null}
        >
          <Sparkles size={13} />
          {aiBusy === 'suggest' ? t('checklist.suggesting') : t('checklist.suggest')}
        </Button>
        <Button
          small
          variant="ghost"
          onClick={() => void evaluate()}
          loading={aiBusy === 'evaluate'}
          disabled={aiBusy !== null || checklist.length === 0}
        >
          <ListChecks size={13} />
          {aiBusy === 'evaluate' ? t('checklist.evaluating') : t('checklist.evaluate')}
        </Button>
      </div>

      {checklist.length === 0 ? (
        <EmptyState title={t('checklist.empty')} />
      ) : (
        <div className={styles.itemList}>
          {checklist.map((item) => {
            const linkState = linkStates[item.id] ?? 'unlinked'
            return (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemTop}>
                  <input
                    type="checkbox"
                    style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                    checked={item.status === 'done'}
                    onChange={(event) => void setStatus(item, event.target.checked ? 'done' : 'unchecked')}
                    aria-label={item.title}
                  />
                  <span className={[styles.itemTitle, item.status === 'done' ? styles.itemTitleDone : ''].join(' ')}>
                    {item.title}
                  </span>
                  <IconButton label={t('common.delete')} onClick={() => void removeItem(item)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                {item.description ? <div className={styles.purpose}>{item.description}</div> : null}
                <div className={styles.itemMeta}>
                  <select
                    className={styles.statusSelect}
                    value={item.status}
                    onChange={(event) => void setStatus(item, event.target.value as ChecklistStatus)}
                  >
                    {CHECKLIST_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  {item.source === 'ai' ? <Badge tone="accent">{t('checklist.ai')}</Badge> : null}
                  {item.filePath ? (
                    <span
                      className={[
                        styles.linkBadge,
                        styles[
                          linkState === 'valid'
                            ? 'linkValid'
                            : linkState === 'stale'
                              ? 'linkStale'
                              : linkState === 'missing'
                                ? 'linkMissing'
                                : 'linkBadge'
                        ]
                      ].join(' ')}
                      title={item.filePath}
                    >
                      {linkLabel(linkState)}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={suggestions !== null}
        title={t('checklist.suggestionsTitle')}
        onClose={() => setSuggestions(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuggestions(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void applySuggestions()} loading={busy}>
              {t('checklist.suggestionApply')} ({selectedSuggestions.size})
            </Button>
          </>
        }
      >
        {suggestions && suggestions.length === 0 ? (
          <EmptyState title={t('checklist.noSuggestions')} />
        ) : (
          <div className={styles.suggestionList}>
            {(suggestions ?? []).map((suggestion, index) => (
              <label key={index} className={styles.suggestionItem}>
                <input
                  type="checkbox"
                  style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                  checked={selectedSuggestions.has(index)}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setSelectedSuggestions((current) => {
                      const next = new Set(current)
                      if (checked) {
                        next.add(index)
                      } else {
                        next.delete(index)
                      }
                      return next
                    })
                  }}
                />
                <span>
                  <span className={styles.suggestionTitle}>{suggestion.title}</span>
                  {suggestion.description ? (
                    <div className={styles.suggestionBody}>{suggestion.description}</div>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={evaluations !== null}
        title={t('checklist.evaluationTitle')}
        onClose={() => setEvaluations(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEvaluations(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void applyEvaluations()} loading={busy}>
              {t('checklist.applyAll')} ({selectedEvaluations.size})
            </Button>
          </>
        }
      >
        <div className={styles.suggestionList}>
          {(evaluations ?? []).map((evaluation) => {
            const item = checklist.find((entry) => entry.id === evaluation.itemId)
            return (
              <label key={evaluation.itemId} className={styles.suggestionItem}>
                <input
                  type="checkbox"
                  style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                  checked={selectedEvaluations.has(evaluation.itemId)}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setSelectedEvaluations((current) => {
                      const next = new Set(current)
                      if (checked) {
                        next.add(evaluation.itemId)
                      } else {
                        next.delete(evaluation.itemId)
                      }
                      return next
                    })
                  }}
                />
                <span style={{ flex: 1 }}>
                  <span className={styles.suggestionTitle}>{item?.title ?? evaluation.itemId}</span>
                  {evaluation.rationale ? (
                    <div className={styles.suggestionBody}>{evaluation.rationale}</div>
                  ) : null}
                  <div className={styles.itemMeta} style={{ marginTop: 4 }}>
                    <Badge tone={statusTone(evaluation.suggestedStatus)}>
                      {statusLabel(evaluation.suggestedStatus)}
                    </Badge>
                  </div>
                </span>
              </label>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
