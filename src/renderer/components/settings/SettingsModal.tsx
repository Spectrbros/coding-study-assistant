import { useEffect, useState } from 'react'
import { KeyRound, RefreshCw, Trash2 } from 'lucide-react'
import { useApp } from '../../state/AppProvider'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge, Button, Field, Input, Modal, Select, Switch, Textarea } from '../ui/ui'
import { REASONING_EFFORTS, type AppInfo, type KeyStatus } from '@shared/types'
import { errorToMessage } from '../../utils/errorText'
import styles from './settings.module.css'

const MAX_FILE_MIN = 16
const MAX_FILE_MAX = 4096
const MAX_CONTEXT_MIN = 4_000
const MAX_CONTEXT_MAX = 400_000

function clampNumber(raw: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const { settings, updateSettings, models, refreshModels, pushToast } = useApp()
  const [keyInput, setKeyInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyNotice, setKeyNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [modelsBusy, setModelsBusy] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [maxFile, setMaxFile] = useState(String(settings.maxFileSizeKb))
  const [maxContext, setMaxContext] = useState(String(settings.maxContextChars))
  const [excludes, setExcludes] = useState(settings.searchExcludePatterns.join('\n'))

  const loadKeyStatus = async (): Promise<void> => {
    try {
      setKeyStatus(await window.api.key.status())
    } catch {
      setKeyStatus(null)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }
    setKeyInput('')
    setKeyNotice(null)
    void loadKeyStatus()
    window.api.system
      .getInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [open, settings.selectedModel])

  useEffect(() => {
    setMaxFile(String(settings.maxFileSizeKb))
    setMaxContext(String(settings.maxContextChars))
    setExcludes(settings.searchExcludePatterns.join('\n'))
  }, [settings.maxFileSizeKb, settings.maxContextChars, settings.searchExcludePatterns])

  const saveKey = async (): Promise<void> => {
    const candidate = keyInput.trim()
    if (candidate.length < 8) {
      setKeyNotice({ tone: 'error', text: t('errors.validation') })
      return
    }
    setKeyBusy(true)
    setKeyNotice(null)
    try {
      const result = await window.api.key.save(candidate)
      if (result.ok) {
        setKeyInput('')
        setKeyNotice({ tone: 'success', text: t('settings.key.verified') })
        pushToast(t('toast.keySaved'), 'success')
        await loadKeyStatus()
        await refreshModels(true)
      } else {
        setKeyNotice({
          tone: 'error',
          text: result.error ? errorToMessage(t, result.error) : t('errors.unknown')
        })
      }
    } catch (error) {
      setKeyNotice({ tone: 'error', text: errorToMessage(t, error) })
    } finally {
      setKeyBusy(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    if (!window.confirm(t('settings.key.clear'))) {
      return
    }
    setKeyBusy(true)
    try {
      setKeyStatus(await window.api.key.clear())
      setKeyNotice({ tone: 'success', text: t('toast.keyRemoved') })
      pushToast(t('toast.keyRemoved'), 'success')
    } catch (error) {
      setKeyNotice({ tone: 'error', text: errorToMessage(t, error) })
    } finally {
      setKeyBusy(false)
    }
  }

  const refreshModelList = async (): Promise<void> => {
    setModelsBusy(true)
    try {
      await refreshModels(true)
    } finally {
      setModelsBusy(false)
    }
  }

  const commitMaxFile = (): void => {
    const next = clampNumber(maxFile, settings.maxFileSizeKb, MAX_FILE_MIN, MAX_FILE_MAX)
    setMaxFile(String(next))
    if (next !== settings.maxFileSizeKb) {
      void updateSettings({ maxFileSizeKb: next })
    }
  }

  const commitMaxContext = (): void => {
    const next = clampNumber(maxContext, settings.maxContextChars, MAX_CONTEXT_MIN, MAX_CONTEXT_MAX)
    setMaxContext(String(next))
    if (next !== settings.maxContextChars) {
      void updateSettings({ maxContextChars: next })
    }
  }

  const commitExcludes = (): void => {
    const list = excludes
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (list.join('\n') !== settings.searchExcludePatterns.join('\n')) {
      void updateSettings({ searchExcludePatterns: list })
    }
  }

  return (
    <Modal
      open={open}
      title={t('settings.title')}
      onClose={onClose}
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>{t('settings.section.ai')}</div>

          <Field label={t('settings.key.title')}>
            <div className={styles.keyRow}>
              <Input
                type="password"
                value={keyInput}
                placeholder={t('settings.key.placeholder')}
                autoComplete="off"
                onChange={(event) => setKeyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void saveKey()
                  }
                }}
              />
              <Button
                variant="primary"
                onClick={() => void saveKey()}
                loading={keyBusy}
                disabled={keyInput.trim().length < 8}
              >
                <KeyRound size={14} />
                {t('settings.key.save')}
              </Button>
              {keyStatus?.configured ? (
                <Button variant="ghost" onClick={() => void clearKey()} disabled={keyBusy} title={t('settings.key.clear')}>
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </div>
          </Field>

          <div className={styles.keyMeta}>
            {keyStatus?.configured ? (
              <Badge tone="success">
                {t('settings.key.configured', { suffix: keyStatus.keySuffix ?? '' })}
              </Badge>
            ) : (
              <Badge tone="warning">{t('settings.key.missing')}</Badge>
            )}
            {keyStatus ? (
              keyStatus.encryptionAvailable ? (
                <Badge tone="neutral">{t('settings.key.encrypted')}</Badge>
              ) : (
                <Badge tone="warning">{t('settings.key.notEncrypted')}</Badge>
              )
            ) : null}
            {keyStatus?.decryptError ? <Badge tone="danger">{t('settings.key.decryptError')}</Badge> : null}
          </div>

          {keyNotice ? (
            <div className={keyNotice.tone === 'success' ? styles.noteSuccess : styles.noteError}>
              {keyNotice.text}
            </div>
          ) : null}

          <div className={styles.divider} />

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.model')}</span>
              <span className={styles.rowHint}>
                {models?.source === 'fallback' ? t('settings.modelFallback') : t('settings.modelHint')}
              </span>
            </div>
            <div className={styles.rowControl}>
              <Select
                value={settings.selectedModel ?? ''}
                onChange={(event) => void updateSettings({ selectedModel: event.target.value || null })}
              >
                <option value="">—</option>
                {(models?.models ?? []).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" small onClick={() => void refreshModelList()} loading={modelsBusy}>
                <RefreshCw size={13} />
                {t('settings.modelRefresh')}
              </Button>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.thinking')}</span>
              <span className={styles.rowHint}>{t('settings.thinkingHint')}</span>
            </div>
            <div className={styles.rowControl}>
              <Switch
                checked={settings.thinkingEnabled}
                label={settings.thinkingEnabled ? t('common.on') : t('common.off')}
                onChange={(checked) => void updateSettings({ thinkingEnabled: checked })}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.effort')}</span>
            </div>
            <div className={styles.rowControl}>
              <Select
                value={settings.reasoningEffort}
                disabled={!settings.thinkingEnabled}
                onChange={(event) =>
                  void updateSettings({
                    reasoningEffort: event.target.value as (typeof REASONING_EFFORTS)[number]
                  })
                }
              >
                {REASONING_EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>
                    {t(`settings.effort.${effort}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.sendKey')}</span>
            </div>
            <div className={styles.rowControl}>
              <Select
                value={settings.sendKey}
                onChange={(event) =>
                  void updateSettings({ sendKey: event.target.value as 'enter' | 'ctrl-enter' })
                }
              >
                <option value="enter">{t('settings.sendKey.enter')}</option>
                <option value="ctrl-enter">{t('settings.sendKey.ctrlEnter')}</option>
              </Select>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>{t('settings.section.appearance')}</div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.theme')}</span>
            </div>
            <div className={styles.rowControl}>
              <Select
                value={settings.theme}
                onChange={(event) => void updateSettings({ theme: event.target.value as 'dark' | 'light' })}
              >
                <option value="dark">{t('settings.theme.dark')}</option>
                <option value="light">{t('settings.theme.light')}</option>
              </Select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.language')}</span>
            </div>
            <div className={styles.rowControl}>
              <Select
                value={settings.language}
                onChange={(event) => void updateSettings({ language: event.target.value as 'ru' | 'en' })}
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </Select>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>{t('settings.section.context')}</div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.maxFile')}</span>
            </div>
            <div className={styles.rowControl}>
              <Input
                type="number"
                min={MAX_FILE_MIN}
                max={MAX_FILE_MAX}
                value={maxFile}
                onChange={(event) => setMaxFile(event.target.value)}
                onBlur={commitMaxFile}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitMaxFile()
                  }
                }}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.maxContext')}</span>
            </div>
            <div className={styles.rowControl}>
              <Input
                type="number"
                min={MAX_CONTEXT_MIN}
                max={MAX_CONTEXT_MAX}
                step={1000}
                value={maxContext}
                onChange={(event) => setMaxContext(event.target.value)}
                onBlur={commitMaxContext}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitMaxContext()
                  }
                }}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.excludes')}</span>
              <span className={styles.rowHint}>{t('settings.excludesHint')}</span>
            </div>
            <div className={styles.rowControl}>
              <Textarea
                className={styles.excludesArea}
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
                onBlur={commitExcludes}
                spellCheck={false}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{t('settings.saveHistory')}</span>
              <span className={styles.rowHint}>{t('settings.saveHistoryHint')}</span>
            </div>
            <div className={styles.rowControl}>
              <Switch
                checked={settings.saveHistory}
                label={settings.saveHistory ? t('common.on') : t('common.off')}
                onChange={(checked) => void updateSettings({ saveHistory: checked })}
              />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>{t('settings.about')}</div>
          <div className={styles.about}>
            <span>{info ? t('settings.version', { version: info.version }) : t('common.loading')}</span>
            <span>{t('settings.userData')}</span>
            <span className={styles.pathValue}>{info?.userDataPath ?? '…'}</span>
            <span>{t('settings.privacy')}</span>
          </div>
          <div>
            <Button
              variant="secondary"
              small
              disabled={!info}
              onClick={() => {
                if (info) {
                  void window.api.system.openPath(info.userDataPath).catch((error: unknown) => {
                    pushToast(errorToMessage(t, error), 'error')
                  })
                }
              }}
            >
              {t('settings.openData')}
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
