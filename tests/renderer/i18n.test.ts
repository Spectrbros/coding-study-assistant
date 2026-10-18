import { describe, expect, it } from 'vitest'
import { en, ru, translate, type TranslationKey } from '@renderer/i18n/I18nProvider'

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort()
}

describe('translations', () => {
  const keys = Object.keys(ru) as TranslationKey[]

  it('contains a meaningful number of interface strings', () => {
    expect(keys.length).toBeGreaterThan(180)
  })

  it('has the same keys in both languages', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort())
  })

  it('has non-empty values for every key in both languages', () => {
    for (const key of keys) {
      expect(ru[key].trim().length, `ru:${key}`).toBeGreaterThan(0)
      expect(en[key].trim().length, `en:${key}`).toBeGreaterThan(0)
    }
  })

  it('keeps interpolation placeholders consistent between languages', () => {
    for (const key of keys) {
      expect(placeholders(en[key]), `placeholders:${key}`).toEqual(placeholders(ru[key]))
    }
  })

  it('interpolates parameters and falls back to Russian', () => {
    expect(translate('en', 'checklist.progress', { done: 3, total: 7 })).toBe('Completed 3 of 7')
    expect(translate('ru', 'checklist.progress', { done: 3, total: 7 })).toBe('Выполнено 3 из 7')
    expect(translate('en', 'app.name')).toBe('Coding Study Assistant')
  })

  it('returns the key itself for an unknown translation', () => {
    expect(translate('en', 'missing.key' as TranslationKey)).toBe('missing.key')
  })
})
