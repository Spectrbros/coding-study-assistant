import { z, type ZodType } from 'zod'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { toErrorPayload } from '@shared/errors'
import { ipcFail, ipcOk } from '@shared/result'
import type { IpcResult } from '@shared/result'

export interface SenderGuard {
  (event: IpcMainInvokeEvent): boolean
}

export class IpcRegistry {
  private readonly channels = new Set<string>()
  private readonly guard: SenderGuard

  constructor(guard: SenderGuard) {
    this.guard = guard
  }

  handle<TIn, TOut>(
    channel: string,
    schema: ZodType<TIn>,
    handler: (input: TIn, event: IpcMainInvokeEvent) => Promise<TOut> | TOut
  ): void {
    if (this.channels.has(channel)) {
      throw new Error(`IPC channel registered twice: ${channel}`)
    }
    this.channels.add(channel)

    ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<TOut>> => {
      if (!this.guard(event)) {
        return ipcFail({ code: 'validation', message: 'Untrusted IPC sender', status: null, details: null })
      }

      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ')
        return ipcFail({ code: 'validation', message: 'Invalid IPC payload', status: null, details })
      }

      try {
        const data = await handler(parsed.data, event)
        return ipcOk(data)
      } catch (error) {
        const payloadError = toErrorPayload(error)
        return ipcFail({
          code: payloadError.code,
          message: payloadError.message,
          status: payloadError.status,
          details: payloadError.details
        })
      }
    })
  }

  handleVoid<TOut>(channel: string, handler: () => Promise<TOut> | TOut): void {
    this.handle<undefined, TOut>(channel, undefinedSchema, () => handler())
  }
}

// Схема для каналов без полезной нагрузки: допускает undefined и null.
const undefinedSchema = z
  .undefined()
  .or(z.null())
  .transform(() => undefined)
