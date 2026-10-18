import { useEffect, useState } from 'react'
import { Download, Save } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge, Button, Textarea } from '../ui/ui'
import { errorToMessage } from '../../utils/errorText'
import styles from './panels.module.css'

export function RequirementsPanel(): React.JSX.Element {
  const { t } = useI18n()
  const { activeProject, requirements, reloadRequirements, pushToast } = useApp()
  const [draft, setDraft] = useState(requirements?.content ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(requirements?.content ?? '')
  }, [requirements?.id, requirements?.updatedAt, activeProject?.id])

  const dirty = draft !== (requirements?.content ?? '')

  const save = async (): Promise<void> => {
    if (!activeProject) {
      return
    }
    setBusy(true)
    try {
      await window.api.requirements.save({
        projectId: activeProject.id,
        content: draft,
        sourceType: requirements?.sourceType ?? 'pasted',
        sourceName: requirements?.sourceName ?? null
      })
      await reloadRequirements()
      pushToast(t('requirements.saved'), 'success')
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (): Promise<void> => {
    if (!activeProject) {
      return
    }
    setBusy(true)
    try {
      const imported = await window.api.requirements.importFile(activeProject.id)
      if (imported) {
        await reloadRequirements()
        pushToast(t('requirements.imported', { name: imported.fileName }), 'success')
      }
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!activeProject) {
    return <div className={styles.emptyInline}>{t('requirements.empty')}</div>
  }

  return (
    <div className={styles.stack}>
      <div className={styles.requirementHeader}>
        <div>
          <div className={styles.panelTitle}>{t('requirements.title')}</div>
          <div className={styles.purpose}>{t('requirements.subtitle')}</div>
        </div>
        {requirements?.sourceName ? <Badge tone="accent">{requirements.sourceName}</Badge> : null}
      </div>

      <Textarea
        className={styles.textareaDraft}
        value={draft}
        placeholder={t('requirements.placeholder')}
        onChange={(event) => setDraft(event.target.value)}
      />

      <div className={styles.row}>
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!dirty || draft.trim().length === 0}>
          <Save size={14} />
          {t('common.save')}
        </Button>
        <Button variant="secondary" onClick={() => void importFile()} disabled={busy}>
          <Download size={14} />
          {t('requirements.import')}
        </Button>
        <span className={styles.charCount}>
          {t('requirements.chars', { count: draft.length })}
        </span>
      </div>
      <div className={styles.purpose}>{t('requirements.hint')}</div>
    </div>
  )
}
