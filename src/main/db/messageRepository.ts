import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type {
  ChatMessage,
  ContextSelectionMeta,
  HelpMode,
  MessageRole,
  MessageStatus,
  UsageInfo
} from '@shared/types'
import { nowIso } from './settingsRepository'
import { mapHelpMode } from './chatRepository'

interface MessageRow {
  id: string
  chat_id: string
  role: string
  content: string
  reasoning: string | null
  model: string | null
  mode: string | null
  status: string
  error_code: string | null
  usage_json: string | null
  context_meta_json: string | null
  created_at: string
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role as MessageRole,
    content: row.content,
    reasoning: row.reasoning,
    model: row.model,
    mode: row.mode === null ? null : mapHelpMode(row.mode),
    status: row.status as MessageStatus,
    errorCode: row.error_code,
    usage: parseJson<UsageInfo>(row.usage_json),
    contextMeta: parseJson<ContextSelectionMeta>(row.context_meta_json),
    createdAt: row.created_at
  }
}

export class MessageRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(chatId: string): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
      .all(chatId) as unknown as MessageRow[]
    return rows.map(mapMessage)
  }

  create(input: {
    chatId: string
    role: MessageRole
    content: string
    status: MessageStatus
    reasoning?: string | null
    model?: string | null
    mode?: HelpMode | null
    errorCode?: string | null
    usage?: UsageInfo | null
    contextMeta?: ContextSelectionMeta | null
  }): ChatMessage {
    const id = randomUUID()
    const timestamp = nowIso()
    this.db
      .prepare(
        `INSERT INTO messages
           (id, chat_id, role, content, reasoning, model, mode, status, error_code, usage_json, context_meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.chatId,
        input.role,
        input.content,
        input.reasoning ?? null,
        input.model ?? null,
        input.mode ?? null,
        input.status,
        input.errorCode ?? null,
        input.usage ? JSON.stringify(input.usage) : null,
        input.contextMeta ? JSON.stringify(input.contextMeta) : null,
        timestamp
      )
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as MessageRow
    return mapMessage(row)
  }

  update(
    id: string,
    patch: {
      content?: string
      reasoning?: string | null
      status?: MessageStatus
      errorCode?: string | null
      usage?: UsageInfo | null
    }
  ): boolean {
    const sets: string[] = []
    const values: Array<string | null> = []
    if (patch.content !== undefined) {
      sets.push('content = ?')
      values.push(patch.content)
    }
    if (patch.reasoning !== undefined) {
      sets.push('reasoning = ?')
      values.push(patch.reasoning)
    }
    if (patch.status !== undefined) {
      sets.push('status = ?')
      values.push(patch.status)
    }
    if (patch.errorCode !== undefined) {
      sets.push('error_code = ?')
      values.push(patch.errorCode)
    }
    if (patch.usage !== undefined) {
      sets.push('usage_json = ?')
      values.push(patch.usage ? JSON.stringify(patch.usage) : null)
    }
    if (sets.length === 0) {
      return false
    }
    values.push(id)
    this.db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    return true
  }

  clear(chatId: string): boolean {
    this.db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId)
    return true
  }
}
