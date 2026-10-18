import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useApp } from './state/AppProvider'
import { useI18n } from './i18n/I18nProvider'
import { Sidebar } from './components/layout/Sidebar'
import { RightPanel } from './components/layout/RightPanel'
import { ChatView } from './components/chat/ChatView'
import { SettingsModal } from './components/settings/SettingsModal'
import { ProjectModal } from './components/project/ProjectModal'
import { Button, Spinner } from './components/ui/ui'
import { errorToMessage } from './utils/errorText'
import type { Project } from '@shared/types'
import styles from './components/layout/layout.module.css'

export function App(): React.JSX.Element {
  const { t } = useI18n()
  const {
    ready,
    bootError,
    projects,
    activeProject,
    reloadProjects,
    selectProject,
    pushToast,
    toasts,
    dismissToast
  } = useApp()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectModal, setProjectModal] = useState<{ open: boolean; project: Project | null }>({
    open: false,
    project: null
  })
  const [onboardingHidden, setOnboardingHidden] = useState(false)

  const deleteProject = async (project: Project): Promise<void> => {
    if (!window.confirm(t('project.deleteConfirm', { name: project.name }))) {
      return
    }
    try {
      await window.api.projects.remove(project.id)
      await reloadProjects()
      if (activeProject?.id === project.id) {
        await selectProject(null)
      }
      pushToast(t('toast.deleted'), 'success')
    } catch (error) {
      pushToast(errorToMessage(t, error), 'error')
    }
  }

  if (!ready) {
    return (
      <div className={styles.splash}>
        <span className={styles.splashLogo}>
          <Sparkles size={22} />
        </span>
        <span>{t('common.loading')}</span>
        <Spinner />
      </div>
    )
  }

  if (bootError) {
    return (
      <div className={styles.splash}>
        <span className={styles.splashLogo}>
          <Sparkles size={22} />
        </span>
        <strong style={{ color: 'var(--text)' }}>{t('errors.title')}</strong>
        <span style={{ maxWidth: 520, textAlign: 'center' }}>{bootError}</span>
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateProject={() => setProjectModal({ open: true, project: null })}
        onEditProject={(project) => setProjectModal({ open: true, project })}
        onDeleteProject={(project) => void deleteProject(project)}
      />

      <main className={styles.main}>
        {projects.length === 0 && !onboardingHidden ? (
          <section className={styles.onboarding}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.onboardingTitle}>{t('onboarding.title')}</div>
              <div className={styles.onboardingText}>{t('onboarding.body')}</div>
              <ol className={styles.onboardingList}>
                <li>{t('onboarding.stepKey')}</li>
                <li>{t('onboarding.stepProject')}</li>
                <li>{t('onboarding.stepRequirements')}</li>
              </ol>
            </div>
            <div className={styles.onboardingActions}>
              <Button variant="primary" small onClick={() => setSettingsOpen(true)}>
                {t('onboarding.openSettings')}
              </Button>
              <Button
                variant="secondary"
                small
                onClick={() => setProjectModal({ open: true, project: null })}
              >
                {t('nav.newProject')}
              </Button>
              <Button variant="ghost" small onClick={() => setOnboardingHidden(true)}>
                {t('common.close')}
              </Button>
            </div>
          </section>
        ) : null}

        <ChatView onOpenSettings={() => setSettingsOpen(true)} />
      </main>

      <RightPanel />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectModal
        open={projectModal.open}
        project={projectModal.project}
        onClose={() => setProjectModal({ open: false, project: null })}
      />

      <div className={styles.toastLayer} aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[
              styles.toast,
              toast.tone === 'success' ? styles.toastSuccess : toast.tone === 'error' ? styles.toastError : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => dismissToast(toast.id)}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}

