import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createAppError } from '@shared/errors'
import type { RunPrompt, RunResult } from '@shared/types'
import type { AppContext } from './appContext'
import { planRunPrompts } from './runPlanner'
import { copyProject, fingerprintProject, type CopyStats } from './runCopy'

const OUTPUT_LIMIT = 256 * 1024
const RUN_TIMEOUT_MS = 120_000

interface ActiveRun {
  child: ChildProcess
  cancelled: boolean
}

function needsCommandShell(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command) || ['npm', 'npx', 'gradle', 'gradlew', 'mvn', 'dotnet', 'cmake', 'python'].includes(command)
}

function escapeArgument(value: string): string {
  if (/["&|<>^%]/.test(value)) {
    throw createAppError('validation', 'Аргумент команды содержит недопустимые символы')
  }
  return /\s/.test(value) ? `"${value}"` : value
}

export class RunService {
  private readonly active = new Map<string, ActiveRun>()

  constructor(private readonly context: AppContext) {}

  propose(projectId: string): RunPrompt[] {
    const project = this.context.projects.require(projectId)
    return planRunPrompts(project)
  }

  cancel(runId: string): boolean {
    const active = this.active.get(runId)
    if (!active) {
      return false
    }
    active.cancelled = true
    active.child.kill()
    return true
  }

  async execute(
    prompt: RunPrompt,
    onChunk: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): Promise<RunResult> {
    const project = this.context.projects.require(prompt.projectId)
    const allowed = planRunPrompts(project)
    const match = allowed.find(
      (candidate) =>
        candidate.command === prompt.command && candidate.args.join('\u0000') === prompt.args.join('\u0000')
    )
    if (!match) {
      throw createAppError('validation', 'Команда не входит в список разрешённых проверок для этого проекта')
    }

    const runId = prompt.id
    const runRoot = join(this.context.tempDirectory, 'runs', `${Date.now()}-${runId.slice(0, 8)}`)
    const copyPath = join(runRoot, 'project')
    mkdirSync(copyPath, { recursive: true })

    const before = fingerprintProject(project.rootPath)
    const copyStats: CopyStats = { files: 0, bytes: 0 }
    copyProject(project.rootPath, copyPath, copyStats)

    const startedAt = Date.now()
    let stdout = ''
    let stderr = ''
    let truncated = false

    const useShell = needsCommandShell(prompt.command)
    const command = useShell ? 'cmd.exe' : prompt.command
    const args = useShell
      ? ['/d', '/s', '/c', [prompt.command, ...prompt.args].map(escapeArgument).join(' ')]
      : prompt.args

    const child = spawn(command, args, {
      cwd: copyPath,
      shell: false,
      windowsHide: true,
      env: {
        PATH: process.env['PATH'] ?? '',
        SystemRoot: process.env['SystemRoot'] ?? '',
        TEMP: process.env['TEMP'] ?? '',
        TMP: process.env['TMP'] ?? '',
        USERPROFILE: process.env['USERPROFILE'] ?? '',
        APPDATA: process.env['APPDATA'] ?? '',
        LOCALAPPDATA: process.env['LOCALAPPDATA'] ?? '',
        CI: '1'
      }
    })

    this.active.set(runId, { child, cancelled: false })

    const appendOutput = (text: string, stream: 'stdout' | 'stderr'): void => {
      if (stdout.length + stderr.length >= OUTPUT_LIMIT * 2) {
        truncated = true
        return
      }
      if (stream === 'stdout') {
        stdout += text
      } else {
        stderr += text
      }
      onChunk(text, stream)
    }

    child.stdout?.on('data', (data: Buffer) => appendOutput(data.toString('utf8'), 'stdout'))
    child.stderr?.on('data', (data: Buffer) => appendOutput(data.toString('utf8'), 'stderr'))

    const exitInfo = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }>(
      (resolve) => {
        let settled = false
        const finish = (code: number | null, signal: NodeJS.Signals | null, timedOut: boolean): void => {
          if (!settled) {
            settled = true
            resolve({ code, signal, timedOut })
          }
        }

        const timer = setTimeout(() => {
          if (process.platform === 'win32' && child.pid) {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
          } else {
            child.kill('SIGKILL')
          }
          finish(null, null, true)
        }, RUN_TIMEOUT_MS)

        child.on('error', (error) => {
          clearTimeout(timer)
          stderr += `\n${error.message}\n`
          finish(null, null, false)
        })
        child.on('close', (code, signal) => {
          clearTimeout(timer)
          finish(code, signal, false)
        })
      }
    )

    const activeRun = this.active.get(runId)
    this.active.delete(runId)

    const after = fingerprintProject(project.rootPath)
    const sourceChanged =
      after.files !== before.files ||
      after.bytes !== before.bytes ||
      Math.abs(after.latestMtime - before.latestMtime) > 1

    let cleanupOk = true
    try {
      rmSync(runRoot, { recursive: true, force: true })
      cleanupOk = !existsSync(runRoot)
    } catch {
      cleanupOk = false
    }

    if (activeRun?.cancelled) {
      stderr += '\n[выполнение отменено пользователем]\n'
    }

    return {
      id: runId,
      exitCode: exitInfo.code,
      signal: exitInfo.signal,
      stdout: stdout.slice(0, OUTPUT_LIMIT),
      stderr: stderr.slice(0, OUTPUT_LIMIT),
      truncated: truncated || stdout.length > OUTPUT_LIMIT || stderr.length > OUTPUT_LIMIT,
      timedOut: exitInfo.timedOut,
      durationMs: Date.now() - startedAt,
      copiedFiles: copyStats.files,
      copiedBytes: copyStats.bytes,
      sourceChanged,
      cleanupOk
    }
  }

  cancelAll(): void {
    for (const active of this.active.values()) {
      active.child.kill()
    }
    this.active.clear()
  }
}
