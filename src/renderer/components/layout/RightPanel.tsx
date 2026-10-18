import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, ListChecks, Terminal } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n } from '../../i18n/I18nProvider'
import { EmptyState, IconButton } from '../ui/ui'
import { RequirementsPanel } from '../panels/RequirementsPanel'
import { ChecklistPanel } from '../panels/ChecklistPanel'
import { RunsPanel } from '../panels/RunsPanel'
import styles from './layout.module.css'
import panelStyles from '../panels/panels.module.css'

type PanelTab = 'requirements' | 'checklist' | 'runs'

export function RightPanel(): React.JSX.Element {
  const { t } = useI18n()
  const { activeProject, checklist } = useApp()
  const [tab, setTab] = useState<PanelTab>('requirements')
  const [collapsed, setCollapsed] = useState(false)

  const tabs: Array<{ id: PanelTab; label: string; icon: React.JSX.Element }> = [
    { id: 'requirements', label: t('nav.requirements'), icon: <FileText size={14} /> },
    { id: 'checklist', label: t('nav.checklist'), icon: <ListChecks size={14} /> },
    { id: 'runs', label: t('nav.runs'), icon: <Terminal size={14} /> }
  ]

  if (collapsed) {
    return (
      <aside className={[styles.rightPanel, styles.rightPanelCollapsed].join(' ')}>
        <div className={panelStyles.collapsedTabs}>
          <IconButton label={t('nav.expand')} onClick={() => setCollapsed(false)}>
            <ChevronLeft size={15} />
          </IconButton>
          {tabs.map((entry) => (
            <IconButton
              key={entry.id}
              label={entry.label}
              onClick={() => {
                setTab(entry.id)
                setCollapsed(false)
              }}
            >
              {entry.icon}
            </IconButton>
          ))}
        </div>
      </aside>
    )
  }

  return (
    <aside className={styles.rightPanel}>
      <div className={styles.rightHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.panelTitle} style={{ fontSize: 13 }}>
            {activeProject?.name ?? t('app.name')}
          </div>
          <div className={styles.panelHint} title={activeProject?.rootPath}>
            {activeProject ? activeProject.rootPath : t('project.empty')}
          </div>
        </div>
        <IconButton label={t('nav.collapse')} onClick={() => setCollapsed(true)}>
          <ChevronRight size={15} />
        </IconButton>
      </div>

      <div className={styles.tabs}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={[styles.tab, tab === entry.id ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(entry.id)}
          >
            {entry.icon}
            <span>{entry.label}</span>
            {entry.id === 'checklist' && checklist.length > 0 ? (
              <span className={panelStyles.tabBadge}>{checklist.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={styles.panelBody}>
        {!activeProject ? (
          <EmptyState title={t('onboarding.title')} body={t('onboarding.stepProject')} />
        ) : tab === 'requirements' ? (
          <RequirementsPanel />
        ) : tab === 'checklist' ? (
          <ChecklistPanel />
        ) : (
          <RunsPanel />
        )}
      </div>
    </aside>
  )
}
