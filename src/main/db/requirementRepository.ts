import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { createAppError } from '@shared/errors'
import type { RequirementDoc } from '@shared/types'
import { nowIso } from './settingsRepository'

interface RequirementRow {
  id: string
  project_id: string
  source_type: string
  source_name: string | null
  content: string
  created_at: string
  updated_at: string
}

const MAX_REQUIREMENT_CHARS = 200_000

function mapRequirement(row: RequirementRow): RequirementDoc {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceType: row.source_type === 'file' ? 'file' : 'pasted',
    sourceName: row.source_name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class RequirementRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(projectId: string): RequirementDoc | null {
    const row = this.db.prepare('SELECT * FROM requirement_docs WHERE project_id = ?').get(projectId) as
      | RequirementRow
      | undefined
    return row ? mapRequirement(row) : null
  }

  save(input: {
    projectId: string
    content: string
    sourceType: 'pasted' | 'file'
    sourceName: string | null
  }): RequirementDoc {
    const content = input.content.trim()
    if (content.length === 0) {
      throw createAppError('validation', 'Текст требований не может быть пустым')
    }
    if (content.length > MAX_REQUIREMENT_CHARS) {
      throw createAppError(
        'validation',
        `Текст требований слишком большой: максимум ${Math.round(MAX_REQUIREMENT_CHARS / 1000)} тыс. символов`
      )
    }

    const existing = this.get(input.projectId)
    const timestamp = nowIso()

    if (existing) {
      this.db
        .prepare(
          `UPDATE requirement_docs
             SET content = ?, source_type = ?, source_name = ?, updated_at = ?
           WHERE project_id = ?`
        )
        .run(content, input.sourceType, input.sourceName, timestamp, input.projectId)
      return this.get(input.projectId) as RequirementDoc
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO requirement_docs (id, project_id, source_type, source_name, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.projectId, input.sourceType, input.sourceName, content, timestamp, timestamp)
    return this.get(input.projectId) as RequirementDoc
  }
}
