import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { createAppError } from '@shared/errors'
import type { Chat, HelpMode } from '@shared/types'
import { nowIso } from './settingsRepository'

interface ChatRow {
  id: string
  project_id: string | null
  title: string
  model: string | null
  help_mode: string
  draft: string | null
  created_at: string
  updated_at: string
}

const HELP_MODE_VALUES = new Set<HelpMode>(['normal', 'explain', 'debug', 'implement', 'defense'])

export function mapHelpMode(value: string | null): HelpMode {
  return value !== null && HELP_MODE_VALUES.has(value as HelpMode) ? (value as HelpMode) : 'normal'
}

function mapChat(row: ChatRow): Chat {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    model: row.model,
    helpMode: mapHelpMode(row.help_mode),
    draft: row.draft,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class ChatRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(projectId: string | null): Chat[] {
    const rows = (
      projectId === null
        ? this.db.prepare('SELECT * FROM chats WHERE project_id IS NULL ORDER BY updated_at DESC').all()
        : this.db.prepare('SELECT * FROM chats WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
    ) as unknown as ChatRow[]
    return rows.map(mapChat)
  }

  find(id: string): Chat | null {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined
    return row ? mapChat(row) : null
  }

  require(id: string): Chat {
    const chat = this.find(id)
    if (!chat) {
      throw createAppError('not_configured', 'Чат не найден')
    }
    return chat
  }

  create(input: { projectId: string | null; title: string; helpMode: HelpMode }): Chat {
    const title = input.title.trim().slice(0, 160) || 'Новый чат'
    const id = randomUUID()
    const timestamp = nowIso()
    this.db
      .prepare(
        `INSERT INTO chats (id, project_id, title, model, help_mode, draft, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)`
      )
      .run(id, input.projectId, title, input.helpMode, timestamp, timestamp)
    return this.require(id)
  }

  update(input: {
    id: string
    title?: string
    helpMode?: HelpMode
    model?: string | null
    draft?: string | null
  }): Chat {
    const chat = this.require(input.id)
    const title = input.title === undefined ? chat.title : input.title.trim().slice(0, 160) || chat.title
    const helpMode = input.helpMode === undefined ? chat.helpMode : input.helpMode
    const model = input.model === undefined ? chat.model : input.model
    const draft = input.draft === undefined ? chat.draft : input.draft

    this.db
      .prepare('UPDATE chats SET title = ?, help_mode = ?, model = ?, draft = ?, updated_at = ? WHERE id = ?')
      .run(title, helpMode, model, draft, nowIso(), chat.id)
    return this.require(chat.id)
  }

  touch(id: string): void {
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(nowIso(), id)
  }

  delete(id: string): boolean {
    this.require(id)
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id)
    return true
  }
}
