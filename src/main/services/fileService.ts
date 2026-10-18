import { realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import { createAppError } from '@shared/errors'

export interface ReadTextResult {
  text: string
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1251'
  sizeBytes: number
  truncated: boolean
}

const BINARY_PROBE_BYTES = 8192

function hasBinaryContent(buffer: Buffer): boolean {
  const probeLength = Math.min(buffer.length, BINARY_PROBE_BYTES)
  for (let index = 0; index < probeLength; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }
  return false
}

export function decodeTextBuffer(buffer: Buffer): { text: string; encoding: ReadTextResult['encoding'] } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buffer.subarray(3)), encoding: 'utf-8' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'utf-16le' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buffer.subarray(2)), encoding: 'utf-16be' }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return { text, encoding: 'utf-8' }
  } catch {
    // Не UTF-8: типичный случай для старых русскоязычных файлов — cp1251.
    const text = new TextDecoder('windows-1251').decode(buffer)
    return { text, encoding: 'windows-1251' }
  }
}

/**
 * Разрешает путь внутри корня проекта и защищает от выхода за его пределы.
 * Символические ссылки раскрываются через realpath и проверяются повторно.
 */
export function resolveInsideRoot(rootPath: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, '/').trim()
  if (normalizedRelative.length === 0) {
    throw createAppError('file_error', 'Пустой путь к файлу')
  }
  if (normalizedRelative.includes('\u0000')) {
    throw createAppError('file_error', 'Недопустимый символ в пути к файлу')
  }
  if (isAbsolute(normalizedRelative) || /^[a-zA-Z]:/.test(normalizedRelative)) {
    throw createAppError('file_error', 'Ожидается путь относительно папки проекта')
  }

  const segments = normalizedRelative.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw createAppError('file_error', 'Путь не может содержать переходы вверх по каталогу')
  }

  const rootReal = realpathSync.native(rootPath)
  const candidate = normalize(join(rootReal, ...segments))
  const candidateReal = realpathSync.native(candidate)

  const relativeToRoot = relative(rootReal, candidateReal)
  if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
    throw createAppError('file_error', 'Файл находится вне папки проекта')
  }

  return candidateReal
}

export class FileService {
  maxFileBytes = 512 * 1024

  resolveInsideRoot(rootPath: string, relativePath: string): string {
    return resolveInsideRoot(rootPath, relativePath)
  }

  async readText(rootPath: string, relativePath: string): Promise<ReadTextResult> {
    const absolutePath = resolveInsideRoot(rootPath, relativePath)
    const stats = statSync(absolutePath)
    if (!stats.isFile()) {
      throw createAppError('file_error', 'Путь не является файлом')
    }
    if (stats.size > this.maxFileBytes) {
      throw createAppError('file_error', 'Файл слишком большой для чтения целиком')
    }

    const buffer = await readFile(absolutePath)
    if (hasBinaryContent(buffer)) {
      throw createAppError('file_error', 'Файл выглядит бинарным и не может быть прочитан как текст')
    }

    const decoded = decodeTextBuffer(buffer)
    return {
      text: decoded.text,
      encoding: decoded.encoding,
      sizeBytes: buffer.length,
      truncated: false
    }
  }

  resolveRelative(rootPath: string, absolutePath: string): string {
    const rootReal = realpathSync.native(rootPath)
    const targetReal = realpathSync.native(absolutePath)
    const relativeToRoot = relative(rootReal, targetReal)
    if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
      throw createAppError('file_error', 'Файл находится вне папки проекта')
    }
    return relativeToRoot.split(sep).join('/')
  }
}
