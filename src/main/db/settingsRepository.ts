import type { DatabaseSync } from 'node:sqlite'
import type { AppSettings } from '@shared/types'

const SETTINGS_KEY = 'app_settings'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'ru',
  selectedModel: null,
  thinkingEnabled: true,
  reasoningEffort: 'high',
  sendKey: 'enter',
  maxFileSizeKb: 256,
  maxContextChars: 60_000,
  searchExcludePatterns: [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    'coverage',
    '.cache',
    'venv',
    '.venv',
    '__pycache__',
    'target',
    'bin',
    'obj',
    'vendor',
    '.idea',
    '.vscode'
  ],
  saveHistory: true,
  sidebarCollapsed: false
}

export function nowIso(): string {
  return new Date().toISOString()
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

export class SettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  read(): AppSettings {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as
      | { value: string }
      | undefined
    if (!row) {
      return { ...DEFAULT_SETTINGS }
    }
    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>
      return this.sanitize({ ...DEFAULT_SETTINGS, ...parsed })
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  write(settings: AppSettings): AppSettings {
    const sanitized = this.sanitize(settings)
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(SETTINGS_KEY, JSON.stringify(sanitized), nowIso())
    return sanitized
  }

  sanitize(input: AppSettings): AppSettings {
    const language = input.language === 'en' ? 'en' : 'ru'
    const theme = input.theme === 'light' ? 'light' : 'dark'
    const effort = input.reasoningEffort === 'low' || input.reasoningEffort === 'max' ? input.reasoningEffort : 'high'
    const sendKey = input.sendKey === 'ctrl-enter' ? 'ctrl-enter' : 'enter'
    const patterns = Array.isArray(input.searchExcludePatterns)
      ? input.searchExcludePatterns
          .map((pattern) => clampText(String(pattern), 120))
          .filter((pattern) => pattern.length > 0)
          .slice(0, 100)
      : DEFAULT_SETTINGS.searchExcludePatterns

    return {
      theme,
      language,
      selectedModel: input.selectedModel ? clampText(input.selectedModel, 120) : null,
      thinkingEnabled: input.thinkingEnabled !== false,
      reasoningEffort: effort,
      sendKey,
      maxFileSizeKb: clampNumber(input.maxFileSizeKb, 16, 4096),
      maxContextChars: clampNumber(input.maxContextChars, 4_000, 400_000),
      searchExcludePatterns: patterns.length > 0 ? patterns : DEFAULT_SETTINGS.searchExcludePatterns,
      saveHistory: input.saveHistory !== false,
      sidebarCollapsed: input.sidebarCollapsed === true
    }
  }
}
