import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge, Button, Field, Input, Modal, Textarea } from '../ui/ui'
import { errorToMessage } from '../../utils/errorText'
import type { Project } from '@shared/types'
import styles from './projectModal.module.css'

interface ProjectModalProps {
  open: boolean
  project: Project | null
  onClose: () => void
}

export function ProjectModal({ open, project, onClose }: ProjectModalProps): React.JSX.Element {
  const { t } = useI18n()
  const { reloadProjects, selectProject, pushToast } = useApp()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setRootPath(project?.rootPath ?? '')
    setError(null)
  }, [open, project])

  const pickFolder = async (): Promise<void> => {
    try {
      const selected = await window.api.system.pickDirectory()
      if (selected) {
        setRootPath(selected)
        if (name.trim().length === 0) {
          const folderName = selected.split(/[\\/]/).filter(Boolean).pop() ?? ''
          setName(folderName)
        }
      }
    } catch (err) {
      setError(errorToMessage(t, err))
    }
  }

  const submit = async (): Promise<void> => {
    if (name.trim().length === 0) {
      setError(t('project.requiredName'))
      return
    }
    if (rootPath.trim().length === 0) {
      setError(t('project.requiredFolder'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        rootPath: rootPath.trim()
      }
      const saved = project
        ? await window.api.projects.update({ id: project.id, ...payload })
        : await window.api.projects.create(payload)
      await reloadProjects()
      await selectProject(saved.id)
      pushToast(t(project ? 'toast.updated' : 'toast.saved'), 'success')
      onClose()
    } catch (err) {
      setError(errorToMessage(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={project ? t('project.edit') : t('project.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {project ? t('common.save') : t('project.create')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label={t('project.name')}>
          <Input
            value={name}
            maxLength={120}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </Field>

        <Field label={t('project.description')}>
          <Textarea
            value={description}
            rows={3}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field label={t('project.folder')} hint={t('project.folderHint')}>
          <div className={styles.folderRow}>
            <Input
              value={rootPath}
              readOnly
              placeholder={t('project.chooseFolder')}
              title={rootPath}
              onClick={() => void pickFolder()}
            />
            <Button variant="secondary" onClick={() => void pickFolder()}>
              <FolderOpen size={14} />
              {t('project.chooseFolder')}
            </Button>
          </div>
        </Field>

        {project && !project.folderExists ? (
          <Badge tone="warning">{t('project.folderMissing')}</Badge>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}
      </div>
    </Modal>
  )
}
