import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WindowBounds } from '@shared/types'

const DEFAULT_BOUNDS: WindowBounds = {
  width: 1320,
  height: 860,
  x: null,
  y: null,
  maximized: false
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseBounds(raw: unknown): WindowBounds {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_BOUNDS }
  }
  const candidate = raw as Record<string, unknown>
  return {
    width: isFiniteNumber(candidate['width']) ? Math.max(980, candidate['width']) : DEFAULT_BOUNDS.width,
    height: isFiniteNumber(candidate['height']) ? Math.max(600, candidate['height']) : DEFAULT_BOUNDS.height,
    x: isFiniteNumber(candidate['x']) ? candidate['x'] : null,
    y: isFiniteNumber(candidate['y']) ? candidate['y'] : null,
    maximized: candidate['maximized'] === true
  }
}

/**
 * Хранит геометрию окна в отдельном JSON-файле, чтобы окно можно было
 * восстановить ещё до готовности базы данных.
 */
export class WindowStateStore {
  private readonly filePath: string

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'window-state.json')
  }

  read(): WindowBounds {
    try {
      const content = readFileSync(this.filePath, 'utf8')
      return parseBounds(JSON.parse(content))
    } catch {
      return { ...DEFAULT_BOUNDS }
    }
  }

  write(bounds: WindowBounds): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(parseBounds(bounds), null, 2), 'utf8')
    } catch {
      // Геометрия окна не является критичными данными: при ошибке записи
      // приложение продолжает работать с настройками по умолчанию.
    }
  }
}
