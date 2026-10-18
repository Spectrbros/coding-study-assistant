import { describe, expect, it } from 'vitest'
import type { TranslationKey } from '@renderer/i18n/I18nProvider'
import { errorToMessage, isKnownErrorCode } from '@renderer/utils/errorText'

const t = (key: TranslationKey): string => `translated:${key}`

describe('errorToMessage', () => {
  it('translates known API error codes', () => {
    expect(errorToMessage(t, { code: 'network' })).toBe('translated:errors.network')
    expect(errorToMessage(t, { code: 'api_rate_limit' })).toBe('translated:errors.api_rate_limit')
    expect(errorToMessage(t, { code: 'no_key' })).toBe('translated:errors.no_key')
  })

  it('falls back to the technical message for unknown codes', () => {
    expect(errorToMessage(t, { code: 'custom_failure', message: 'Detailed reason' })).toBe('Detailed reason')
  })

  it('uses the generic error for unknown codes without a message', () => {
    expect(errorToMessage(t, { code: 'custom_failure' })).toBe('translated:errors.unknown')
    expect(errorToMessage(t, null)).toBe('translated:errors.unknown')
    expect(errorToMessage(t, 'string error')).toBe('translated:errors.unknown')
  })
})

describe('isKnownErrorCode', () => {
  it('recognizes supported codes only', () => {
    expect(isKnownErrorCode('validation')).toBe(true)
    expect(isKnownErrorCode('api_context_length')).toBe(true)
    expect(isKnownErrorCode('something_else')).toBe(false)
  })
})
