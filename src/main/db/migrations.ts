/**
 * Миграции применяются последовательно по PRAGMA user_version.
 * Каждая запись массива — SQL для перехода на версию index + 1.
 * Изменять существующие миграции нельзя: только добавлять новые.
 */
export const MIGRATIONS: readonly string[] = [
  // v1 — базовая схема приложения.
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    root_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE project_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_project_events_project ON project_events(project_id, created_at DESC);

  CREATE TABLE requirement_docs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_name TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id)
  );

  CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    model TEXT,
    help_mode TEXT NOT NULL DEFAULT 'normal',
    draft TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_chats_project ON chats(project_id, updated_at DESC);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    reasoning TEXT,
    model TEXT,
    mode TEXT,
    status TEXT NOT NULL,
    error_code TEXT,
    usage_json TEXT,
    context_meta_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    text_content TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE checklist_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    file_path TEXT,
    start_line INTEGER,
    end_line INTEGER,
    file_sha TEXT,
    order_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_checklist_project ON checklist_items(project_id, order_index);
  `
]

export const TARGET_SCHEMA_VERSION = MIGRATIONS.length
