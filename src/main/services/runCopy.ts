import { copyFileSync, mkdirSync, readdirSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

export const SKIP_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.cache', 'venv',
  '.venv', '__pycache__', 'target', 'bin', 'obj', 'vendor', '.idea', '.vscode'
])

export const MAX_COPY_FILES = 20_000
export const MAX_COPY_BYTES = 300 * 1024 * 1024

export interface CopyStats {
  files: number
  bytes: number
}

/**
 * Копирует проект во временный каталог, пропуская зависимости, кэши и символические ссылки.
 * Копия нужна для изоляции проверочной команды от оригинальной папки.
 */
export function copyProject(sourceRoot: string, destinationRoot: string, stats: CopyStats, depth = 0): void {
  if (depth > 20 || stats.files >= MAX_COPY_FILES || stats.bytes >= MAX_COPY_BYTES) {
    return
  }
  let entries: Dirent[]
  try {
    entries = readdirSync(sourceRoot, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (stats.files >= MAX_COPY_FILES || stats.bytes >= MAX_COPY_BYTES) {
      return
    }
    if (entry.isSymbolicLink()) {
      continue
    }
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue
      }
      const target = join(destinationRoot, entry.name)
      mkdirSync(target, { recursive: true })
      copyProject(join(sourceRoot, entry.name), target, stats, depth + 1)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const sourceFile = join(sourceRoot, entry.name)
    let size = 0
    try {
      size = statSync(sourceFile).size
    } catch {
      continue
    }
    if (stats.bytes + size > MAX_COPY_BYTES) {
      return
    }
    try {
      copyFileSync(sourceFile, join(destinationRoot, entry.name))
      stats.files += 1
      stats.bytes += size
    } catch {
      // Отдельные файлы могут быть заняты другой программой — пропускаем.
    }
  }
}

export interface ProjectFingerprint {
  files: number
  bytes: number
  latestMtime: number
}

export function fingerprintProject(rootPath: string): ProjectFingerprint {
  let files = 0
  let bytes = 0
  let latestMtime = 0

  const walk = (directory: string, depth: number): void => {
    if (depth > 12) {
      return
    }
    let entries: Dirent[]
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue
        }
        walk(fullPath, depth + 1)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      try {
        const stats = statSync(fullPath)
        files += 1
        bytes += stats.size
        latestMtime = Math.max(latestMtime, stats.mtimeMs)
      } catch {
        // Файл мог исчезнуть во время обхода.
      }
    }
  }

  walk(rootPath, 0)
  return { files, bytes, latestMtime }
}
