import type { ApiErrorCode } from '@shared/errors'
import type { TranslationKey } from '../i18n/I18nProvider'

interface Translatable {
  (key: TranslationKey, params?: Record<string, string | number>): string
}

const KNOWN_CODES = new Set<string>([
  'api_unauthorized',
  'api_forbidden',
  'api_insufficient_balance',
  'api_invalid_request',
  'api_rate_limit',
  'api_context_length',
  'api_server_error',
  'api_unavailable',
  'api_bad_response',
  'network',
  'timeout',
  'cancelled',
  'stream_error',
  'no_key',
  'key_unavailable',
  'not_configured',
  'validation',
  'file_error',
  'db_error',
  'unsupported',
  'unknown'
])

/**
 * Переводит код ошибки main-процесса в понятное сообщение интерфейса.
 * Технический текст показываем только если код неизвестен.
 */
export function errorToMessage(t: Translatable, error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown } | null
  const code = typeof candidate?.code === 'string' ? candidate.code : 'unknown'
  if (KNOWN_CODES.has(code)) {
    return t(`errors.${code}` as TranslationKey)
  }
  if (typeof candidate?.message === 'string' && candidate.message.length > 0) {
    return candidate.message
  }
  return t('errors.unknown')
}

export function isKnownErrorCode(code: string): code is ApiErrorCode {
  return KNOWN_CODES.has(code)
}
