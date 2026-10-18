import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, type Dirent, type Stats } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type {
  ContextBuildMode,
  ContextBuildResult,
  ContextCandidate,
  ContextSource,
  ContextStaleEntry,
  Project
} from '@shared/types'
import { estimateTokens } from './prompts'
import type { FileService } from './fileService'

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'markdown', 'txt', 'py', 'java', 'cs', 'cpp', 'cc', 'c', 'h',
  'hpp', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'go', 'rs', 'rb', 'php', 'sql', 'yml', 'yaml',
  'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'ps1', 'bat', 'cmd', 'xml', 'kt', 'kts', 'swift', 'gradle', 'properties',
  'dockerfile', 'gitignore', 'editorconfig', 'env', 'lua', 'r', 'pl', 'dart', 'ex', 'exs'
])

const ALWAYS_SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json'])
const MAX_SCAN_FILES = 6000
const MAX_FILE_BYTES = 256 * 1024
const MAX_TOTAL_READ_BYTES = 24 * 1024 * 1024
const MAX_SEARCH_SOURCES = 12
const MAX_PROJECT_SOURCES = MAX_SCAN_FILES
const MAX_CACHE_ENTRIES = 300
const WINDOW_RADIUS = 12

interface CachedFile {
  mtimeMs: number
  size: number
  lines: string[]
  text: string
}

export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

export function tokenizeQuery(query: string): string[] {
  const raw = query.match(/[A-Za-zА-Яа-яЁё0-9_]{3,}/g) ?? []
  const tokens = new Set<string>()
  for (const word of raw) {
    tokens.add(word.toLowerCase())
    for (const part of word.split(/[_-]|(?<=[a-zа-я])(?=[A-ZА-Я])/)) {
      if (part.length >= 3) {
        tokens.add(part.toLowerCase())
      }
    }
  }
  return [...tokens].slice(0, 40)
}

function looksTextual(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) {
    return TEXT_EXTENSIONS.has(fileName.toLowerCase())
  }
  return TEXT_EXTENSIONS.has(fileName.slice(dotIndex + 1).toLowerCase())
}

function isBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8192)
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }
  return false
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export class ContextService {
  private readonly cache = new Map<string, CachedFile>()

  constructor(private readonly files: FileService) {}

  private loadFileSync(absolutePath: string, mtimeMs: number, size: number): CachedFile | null {
    const cached = this.cache.get(absolutePath)
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      return cached
    }
    try {
      const buffer = readFileSync(absolutePath)
      if (isBinary(buffer)) {
        return null
      }
      const text = new TextDecoder('utf-8').decode(buffer)
      const entry: CachedFile = { mtimeMs, size, text, lines: text.split(/\r\n|\r|\n/) }
      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        this.cache.clear()
      }
      this.cache.set(absolutePath, entry)
      return entry
    } catch {
      return null
    }
  }

  private scoreFile(relativePath: string, text: string, tokens: string[]): number {
    if (tokens.length === 0) {
      return 1
    }
    const lowerPath = relativePath.toLowerCase()
    const lowerText = text.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (lowerPath.includes(token)) {
        score += 8
      }
      let index = lowerText.indexOf(token)
      let occurrences = 0
      while (index !== -1 && occurrences < 12) {
        occurrences += 1
        index = lowerText.indexOf(token, index + token.length)
      }
      score += occurrences * 2
    }
    return score
  }

  private bestWindow(lines: string[], tokens: string[]): { content: string; startLine: number; endLine: number } {
    if (lines.length <= 40) {
      return { content: lines.join('\n'), startLine: 1, endLine: Math.max(1, lines.length) }
    }
    let bestIndex = 0
    let bestScore = -1
    for (let index = 0; index < lines.length; index += 1) {
      const lower = (lines[index] ?? '').toLowerCase()
      let score = 0
      for (const token of tokens) {
        if (lower.includes(token)) {
          score += 1
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
    if (bestScore <= 0) {
      const end = Math.min(80, lines.length)
      return { content: lines.slice(0, end).join('\n'), startLine: 1, endLine: end }
    }
    const start = Math.max(0, bestIndex - WINDOW_RADIUS)
    const end = Math.min(lines.length, bestIndex + WINDOW_RADIUS + 1)
    return { content: lines.slice(start, end).join('\n'), startLine: start + 1, endLine: end }
  }

  async build(options: {
    project: Project
    mode: ContextBuildMode
    query: string
    excludePatterns: string[]
    maxContextChars: number
    manualPaths: string[]
  }): Promise<ContextBuildResult> {
    const exclusions = options.excludePatterns.map(wildcardToRegExp)
    const tokens = options.mode === 'search' ? tokenizeQuery(options.query) : []
    const sourceLimit = options.mode === 'all' ? MAX_PROJECT_SOURCES : MAX_SEARCH_SOURCES
    const candidates: ContextCandidate[] = []
    let scannedFiles = 0
    let skippedFiles = 0
    let totalReadBytes = 0
    let scanLimited = false

    const walk = (directory: string, depth: number): void => {
      if (scannedFiles >= MAX_SCAN_FILES) {
        scanLimited = true
        return
      }
      if (depth > 12) {
        scanLimited = true
        return
      }
      let entries: Dirent[]
      try {
        entries = readdirSync(directory, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (scannedFiles >= MAX_SCAN_FILES || totalReadBytes > MAX_TOTAL_READ_BYTES) {
          scanLimited = true
          return
        }
        const name = entry.name
        if (exclusions.some((pattern) => pattern.test(name))) {
          skippedFiles += 1
          continue
        }
        const absolutePath = join(directory, name)

        if (entry.isDirectory()) {
          walk(absolutePath, depth + 1)
          continue
        }
        if (!entry.isFile() || ALWAYS_SKIP_FILES.has(name) || !looksTextual(name)) {
          skippedFiles += 1
          continue
        }

        let stats: Stats
        try {
          stats = statSync(absolutePath)
        } catch {
          skippedFiles += 1
          continue
        }
        if (stats.size > MAX_FILE_BYTES || stats.size === 0) {
          skippedFiles += 1
          continue
        }

        const loaded = this.loadFileSync(absolutePath, stats.mtimeMs, stats.size)
        scannedFiles += 1
        if (!loaded) {
          skippedFiles += 1
          continue
        }
        totalReadBytes += stats.size

        const relativePath = relative(options.project.rootPath, absolutePath).split(sep).join('/')
        const score = options.mode === 'search' ? this.scoreFile(relativePath, loaded.text, tokens) : 0
        if (options.mode === 'search' && score <= 0 && tokens.length > 0) {
          continue
        }

        const window =
          options.mode === 'all'
            ? {
                content: loaded.lines.join('\n'),
                startLine: 1,
                endLine: Math.max(1, loaded.lines.length)
              }
            : this.bestWindow(loaded.lines, tokens)
        candidates.push({
          reason: score > 0 ? `совпадения в файле: ${score}` : 'файл по имени',
          source: {
            id:
              options.mode === 'all'
                ? `project:${relativePath}`
                : `file:${relativePath}:${window.startLine}-${window.endLine}`,
            kind: options.mode === 'all' ? 'project' : 'search',
            label: relativePath,
            path: relativePath,
            startLine: window.startLine,
            endLine: window.endLine,
            content: window.content,
            score,
            mtimeMs: stats.mtimeMs,
            sha256: hashText(window.content)
          }
        })
      }
    }

    walk(options.project.rootPath, 0)

    const manualPaths = this.normalizeManualPaths(options.manualPaths)
    const manualCandidates = await this.readManualSources(options.project, manualPaths)
    const manualPathSet = new Set(
      manualCandidates
        .map((candidate) => candidate.source.path?.toLowerCase())
        .filter((path): path is string => path !== undefined)
    )
    const merged = [
      ...manualCandidates,
      ...candidates
        .filter((candidate) => {
          const path = candidate.source.path
          return path === null || !manualPathSet.has(path.toLowerCase())
        })
        .sort((left, right) =>
          options.mode === 'all'
            ? (left.source.path ?? '').localeCompare(right.source.path ?? '', 'ru')
            : (right.source.score ?? 0) - (left.source.score ?? 0)
        )
    ]

    const selected: ContextCandidate[] = []
    let usedChars = 0
    let truncated = scanLimited

    for (const candidate of merged) {
      const length = candidate.source.content.length
      if (selected.length >= sourceLimit || usedChars + length > options.maxContextChars) {
        truncated = true
        continue
      }
      selected.push(candidate)
      usedChars += length
    }

    const missingManual = manualPaths.length - manualCandidates.length
    let notice: string | null = null
    if (missingManual > 0) {
      notice = 'Часть добавленных вручную файлов не удалось прочитать.'
    } else if (options.mode === 'search' && tokens.length === 0) {
      notice = 'Поисковый запрос пуст: показаны первые подходящие файлы. Проверьте выбор перед отправкой.'
    }

    return {
      candidates: selected,
      estimatedTokens: estimateTokens(selected.map((item) => item.source.content).join('\n')),
      scannedFiles,
      skippedFiles,
      truncated,
      notice
    }
  }

  private normalizeManualPaths(manualPaths: string[]): string[] {
    const result: string[] = []
    const seenPaths = new Set<string>()
    for (const requestedPath of manualPaths.slice(0, 20)) {
      const path = requestedPath
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .replace(/^\.\//, '')
      if (path.length === 0) {
        continue
      }
      const dedupKey = path.toLowerCase()
      if (seenPaths.has(dedupKey)) {
        continue
      }
      seenPaths.add(dedupKey)
      result.push(path)
    }
    return result
  }

  private async readManualSources(project: Project, manualPaths: string[]): Promise<ContextCandidate[]> {
    const result: ContextCandidate[] = []
    for (const path of manualPaths) {
      try {
        const read = await this.files.readText(project.rootPath, path)
        const normalized = read.text.replace(/\r\n?/g, '\n')
        const lines: string[] = []
        let usedChars = 0
        for (const line of normalized.split('\n')) {
          if (usedChars + line.length + 1 > 32_000) {
            break
          }
          lines.push(line)
          usedChars += line.length + 1
        }
        if (lines.length === 0) {
          lines.push(normalized.slice(0, 32_000))
        }
        const content = lines.join('\n')
        result.push({
          reason: 'добавлено вручную',
          source: {
            id: `manual:${path}`,
            kind: 'manual',
            label: path,
            path,
            startLine: 1,
            endLine: Math.max(1, lines.length),
            content,
            score: null,
            mtimeMs: null,
            sha256: hashText(content)
          }
        })
      } catch {
        // Недоступные файлы просто не попадают в контекст.
      }
    }
    return result
  }

  async revalidate(project: Project, sources: ContextSource[]): Promise<ContextStaleEntry[]> {
    const stale: ContextStaleEntry[] = []
    for (const source of sources) {
      if (!source.path) {
        continue
      }
      try {
        const read = await this.files.readText(project.rootPath, source.path)
        const lines = read.text.split(/\r\n|\r|\n/)
        const start = Math.max(0, (source.startLine ?? 1) - 1)
        const end = source.endLine === null ? lines.length : Math.min(lines.length, source.endLine)
        const currentContent = lines.slice(start, end).join('\n')
        if (source.sha256 && hashText(currentContent) !== source.sha256) {
          stale.push({ path: source.path, reason: 'changed' })
        }
      } catch {
        stale.push({ path: source.path, reason: 'missing' })
      }
    }
    return stale
  }
}
