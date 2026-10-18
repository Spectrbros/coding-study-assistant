import { z } from 'zod'
import { IPC } from '@shared/channels'
import type { IpcRegistry } from './registry'
import type { RunService } from '../services/runService'
import { projectIdSchema, runIdSchema, runPromptSchema } from './schemas'

export function registerRunHandlers(registry: IpcRegistry, runs: RunService): void {
  registry.handle(IPC.runsPropose, projectIdSchema, ({ projectId }) => runs.propose(projectId))

  registry.handle(IPC.runsExecute, runPromptSchema, async (prompt, event) => {
    const sender = event.sender
    return runs.execute(prompt, (chunk, stream) => {
      if (!sender.isDestroyed()) {
        sender.send(IPC.runsEvent, { runId: prompt.id, chunk, stream })
      }
    })
  })

  registry.handle(IPC.runsCancel, runIdSchema, ({ runId }) => runs.cancel(runId))
}

export const runPromptShape = runPromptSchema
export const runIdShape = z.object({ runId: z.string().min(1) }).strict()
