import type { ApiErrorPayload } from './types'

export type IpcOk<T> = { ok: true; data: T }

export type IpcFail = { ok: false; error: ApiErrorPayload }

export type IpcResult<T> = IpcOk<T> | IpcFail

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcFail<T>(error: ApiErrorPayload): IpcResult<T> {
  return { ok: false, error }
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  if (result.ok) {
    return result.data
  }
  const error = new Error(result.error.message) as Error & {
    code: string
    status: number | null
    details: string | null
  }
  error.name = 'IpcCallError'
  error.code = result.error.code
  error.status = result.error.status
  error.details = result.error.details
  throw error
}
