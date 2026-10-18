export type ApiErrorCode =
  | 'api_unauthorized'
  | 'api_forbidden'
  | 'api_insufficient_balance'
  | 'api_invalid_request'
  | 'api_rate_limit'
  | 'api_context_length'
  | 'api_server_error'
  | 'api_unavailable'
  | 'api_bad_response'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'stream_error'
  | 'no_key'
  | 'key_unavailable'
  | 'not_configured'
  | 'validation'
  | 'file_error'
  | 'db_error'
  | 'unsupported'
  | 'unknown'

export interface AppError extends Error {
  code: ApiErrorCode
  status: number | null
  details: string | null
}

export function createAppError(
  code: ApiErrorCode,
  message: string,
  options: { status?: number | null; details?: string | null; cause?: unknown } = {}
): AppError {
  const error = new Error(message) as AppError
  error.name = 'AppError'
  error.code = code
  error.status = options.status ?? null
  error.details = options.details ?? null
  if (options.cause !== undefined) {
    error.cause = options.cause
  }
  return error
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  )
}

export function toErrorPayload(error: unknown): {
  code: ApiErrorCode
  message: string
  status: number | null
  details: string | null
} {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return { code: 'unknown', message, status: null, details: null }
}
