import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { createAppError } from '@shared/errors'
import type { ChecklistItem, ChecklistStatus } from '@shared/types'
import { nowIso } from './settingsRepository'

interface ChecklistRow {
  id: string
  project_id: string
  title: string
  description: string | null
  status: string
  source: string
  file_path: string | null
  start_line: number | null
  end_line: number | null
  file_sha: string | null
  order_index: number
  created_at: string
  updated_at: string
}

const STATUSES = new Set<ChecklistStatus>(['unchecked', 'in_progress', 'done', 'needs_fix'])

function mapItem(row: ChecklistRow): ChecklistItem {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: STATUSES.has(row.status as ChecklistStatus) ? (row.status as ChecklistStatus) : 'unchecked',
    source: row.source === 'ai' ? 'ai' : 'manual',
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    fileSha: row.file_sha,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface ChecklistCreateInput {
  projectId: string
  title: string
  description: string | null
  status: ChecklistStatus
  filePath: string | null
  startLine: number | null
  endLine: number | null
  source: 'manual' | 'ai'
}

export interface ChecklistUpdateInput {
  id: string
  title?: string
  description?: string | null
  status?: ChecklistStatus
  filePath?: string | null
  startLine?: number | null
  endLine?: number | null
  fileSha?: string | null
}

export class ChecklistRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(projectId: string): ChecklistItem[] {
    const rows = this.db
      .prepare('SELECT * FROM checklist_items WHERE project_id = ? ORDER BY order_index ASC, created_at ASC')
      .all(projectId) as unknown as ChecklistRow[]
    return rows.map(mapItem)
  }

  find(id: string): ChecklistItem | null {
    const row = this.db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as ChecklistRow | undefined
    return row ? mapItem(row) : null
  }

  require(id: string): ChecklistItem {
    const item = this.find(id)
    if (!item) {
      throw createAppError('not_configured', 'Пункт чек-листа не найден')
    }
    return item
  }

  create(input: ChecklistCreateInput): ChecklistItem {
    const title = input.title.trim().slice(0, 240)
    if (title.length === 0) {
      throw createAppError('validation', 'Название пункта не может быть пустым')
    }
    const nextOrder = this.nextOrderIndex(input.projectId)
    const id = randomUUID()
    const timestamp = nowIso()
    this.db
      .prepare(
        `INSERT INTO checklist_items
           (id, project_id, title, description, status, source, file_path, start_line, end_line, file_sha, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        title,
        input.description ? input.description.trim().slice(0, 4000) : null,
        input.status,
        input.source,
        input.filePath,
        input.startLine,
        input.endLine,
        nextOrder,
        timestamp,
        timestamp
      )
    return this.require(id)
  }

  update(input: ChecklistUpdateInput): ChecklistItem {
    const item = this.require(input.id)
    const title = input.title === undefined ? item.title : input.title.trim().slice(0, 240)
    if (title.length === 0) {
      throw createAppError('validation', 'Название пункта не может быть пустым')
    }
    const description =
      input.description === undefined
        ? item.description
        : input.description === null
          ? null
          : input.description.trim().slice(0, 4000)
    const status = input.status === undefined ? item.status : input.status
    const filePath = input.filePath === undefined ? item.filePath : input.filePath
    const startLine = input.startLine === undefined ? item.startLine : input.startLine
    const endLine = input.endLine === undefined ? item.endLine : input.endLine
    const fileSha = input.fileSha === undefined ? item.fileSha : input.fileSha

    this.db
      .prepare(
        `UPDATE checklist_items
            SET title = ?, description = ?, status = ?, file_path = ?, start_line = ?, end_line = ?, file_sha = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(title, description, status, filePath, startLine, endLine, fileSha, nowIso(), item.id)
    return this.require(item.id)
  }

  delete(id: string): boolean {
    this.require(id)
    this.db.prepare('DELETE FROM checklist_items WHERE id = ?').run(id)
    return true
  }

  private nextOrderIndex(projectId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(order_index), 0) AS max_order FROM checklist_items WHERE project_id = ?')
      .get(projectId) as { max_order: number } | undefined
    return (row?.max_order ?? 0) + 1
  }
}
