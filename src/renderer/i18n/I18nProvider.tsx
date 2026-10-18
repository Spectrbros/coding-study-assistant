import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ruBase } from './ruBase'
import { ruPanels } from './ruPanels'
import { enBase } from './enBase'
import { enPanels } from './enPanels'
import type { AppLanguage } from '@shared/types'

export const ru = { ...ruBase, ...ruPanels }
export const en: Record<keyof typeof ru, string> = { ...enBase, ...enPanels }

export type TranslationKey = keyof typeof ru
export type TranslateParams = Record<string, string | number>

export function translate(
  language: AppLanguage,
  key: TranslationKey,
  params?: TranslateParams
): string {
  const dictionary = language === 'en' ? en : ru
  const template = dictionary[key] ?? ru[key] ?? key
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  )
}

interface I18nContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: TranslationKey, params?: TranslateParams) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [language, setLanguage] = useState<AppLanguage>('ru')

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) => translate(language, key, params),
    [language]
  )

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider')
  }
  return context
}
