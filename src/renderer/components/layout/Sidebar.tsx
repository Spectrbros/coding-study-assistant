import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  MessageSquarePlus,
  Moon,
  Pencil,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n } from '../../i18n/I18nProvider'
import { IconButton } from '../ui/ui'
import styles from './layout.module.css'
import type { Project } from '@shared/types'

interface SidebarProps {
  onOpenSettings: () => void
  onCreateProject: () => void
  onEditProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
}

export function Sidebar({
  onOpenSettings,
  onCreateProject,
  onEditProject,
  onDeleteProject
}: SidebarProps): React.JSX.Element {
  const { t } = useI18n()
  const {
    settings,
    updateSettings,
    projects,
    activeProject,
    selectProject,
    chats,
    activeChat,
    selectChat,
    createChat,
    deleteChat
  } = useApp()
  const collapsed = settings.sidebarCollapsed

  return (
    <aside className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ''].join(' ')}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <Sparkles size={16} />
        </span>
        {!collapsed ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.brandTitle}>{t('app.name')}</div>
            <div className={styles.brandSub}>{t('app.tagline')}</div>
          </div>
        ) : null}
        <IconButton
          label={collapsed ? t('nav.expand') : t('nav.collapse')}
          onClick={() => void updateSettings({ sidebarCollapsed: !collapsed })}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </IconButton>
      </div>

      {collapsed ? (
        <div className={styles.sidebarScroll}>
          <IconButton label={t('nav.newChat')} onClick={() => void createChat()}>
            <MessageSquarePlus size={16} />
          </IconButton>
          <IconButton label={t('nav.newProject')} onClick={onCreateProject}>
            <FolderPlus size={16} />
          </IconButton>
        </div>
      ) : (
        <div className={styles.sidebarScroll}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>{t('nav.projects')}</span>
              <IconButton label={t('nav.newProject')} onClick={onCreateProject}>
                <FolderPlus size={14} />
              </IconButton>
            </div>
            {projects.length === 0 ? (
              <div className={styles.panelHint} style={{ padding: '4px 8px' }}>
                {t('project.empty')}
              </div>
            ) : null}
            {projects.map((project) => (
              <div key={project.id} className={styles.navRow}>
                <button
                  type="button"
                  className={[styles.navItem, activeProject?.id === project.id ? styles.navItemActive : ''].join(' ')}
                  onClick={() => void selectProject(project.id)}
                  title={project.rootPath}
                >
                  <span className={styles.iconWrap}>
                    {project.folderExists ? <span aria-hidden>•</span> : <TriangleAlert size={13} />}
                  </span>
                  <span className={styles.navLabel}>{project.name}</span>
                </button>
                <div className={styles.itemActions}>
                  <IconButton label={t('project.edit')} onClick={() => onEditProject(project)}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton label={t('common.delete')} onClick={() => onDeleteProject(project)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>{activeProject ? t('nav.chats') : t('nav.freeChats')}</span>
              <IconButton label={t('nav.newChat')} onClick={() => void createChat()}>
                <MessageSquarePlus size={14} />
              </IconButton>
            </div>
            {chats.length === 0 ? (
              <div className={styles.panelHint} style={{ padding: '4px 8px' }}>
                {t('chat.empty.body')}
              </div>
            ) : null}
            {chats.map((chat) => (
              <div key={chat.id} className={styles.navRow}>
                <button
                  type="button"
                  className={[styles.navItem, activeChat?.id === chat.id ? styles.navItemActive : ''].join(' ')}
                  onClick={() => void selectChat(chat.id)}
                  title={chat.title}
                >
                  <span className={styles.navLabel + ' ' + styles.chatTitle}>{chat.title}</span>
                </button>
                <div className={styles.itemActions}>
                  <IconButton
                    label={t('common.delete')}
                    onClick={() => {
                      if (window.confirm(t('chat.deleteConfirm', { title: chat.title }))) {
                        void deleteChat(chat.id)
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <IconButton label={t('nav.settings')} onClick={onOpenSettings}>
          <Settings size={16} />
        </IconButton>
        <IconButton
          label={settings.theme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')}
          onClick={() => void updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </div>
    </aside>
  )
}
