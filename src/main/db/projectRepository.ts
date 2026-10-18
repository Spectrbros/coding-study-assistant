import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createAppError } from '@shared/errors'
import type { Project, ProjectEvent } from '@shared/types'
import { nowIso } from './settingsRepository'

interface ProjectRow {
  id: string
  name: string
  description: string | null
  root_path: string
  created_at: string
  updated_at: string
}

function clampText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    folderExists: existsSync(row.root_path)
  }
}

export class ProjectRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all() as unknown as ProjectRow[]
    return rows.map(mapProject)
  }

  find(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row ? mapProject(row) : null
  }

  require(id: string): Project {
    const project = this.find(id)
    if (!project) {
      throw createAppError('not_configured', 'Проект не найден')
    }
    return project
  }

  create(input: { name: string; description: string | null; rootPath: string }): Project {
    const name = clampText(input.name, 120)
    if (name.length === 0) {
      throw createAppError('validation', 'Название проекта не может быть пустым')
    }
    const rootPath = this.validateRootPath(input.rootPath)
    const id = randomUUID()
    const timestamp = nowIso()
    const description = input.description ? clampText(input.description, 2000) : null

    this.db
      .prepare(
        `INSERT INTO projects (id, name, description, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, description, rootPath, timestamp, timestamp)

    this.addEvent(id, 'created', name)
    return this.require(id)
  }

  update(input: { id: string; name?: string; description?: string | null; rootPath?: string }): Project {
    const project = this.require(input.id)
    const name = input.name === undefined ? project.name : clampText(input.name, 120)
    if (name.length === 0) {
      throw createAppError('validation', 'Название проекта не может быть пустым')
    }
    const description =
      input.description === undefined
        ? project.description
        : input.description === null
          ? null
          : clampText(input.description, 2000)
    const rootPath =
      input.rootPath === undefined || input.rootPath === project.rootPath
        ? project.rootPath
        : this.validateRootPath(input.rootPath)

    this.db
      .prepare('UPDATE projects SET name = ?, description = ?, root_path = ?, updated_at = ? WHERE id = ?')
      .run(name, description, rootPath, nowIso(), project.id)

    if (name !== project.name) {
      this.addEvent(project.id, 'renamed', name)
    }
    if (description !== project.description) {
      this.addEvent(project.id, 'described', description)
    }
    if (rootPath !== project.rootPath) {
      this.addEvent(project.id, 'path_changed', rootPath)
    }

    return this.require(project.id)
  }

  delete(id: string): boolean {
    const project = this.require(id)
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(project.id)
    return true
  }

  events(projectId: string): ProjectEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(projectId) as unknown as Array<{
      id: string
      project_id: string
      type: string
      detail: string | null
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type as ProjectEvent['type'],
      detail: row.detail,
      createdAt: row.created_at
    }))
  }

  private addEvent(projectId: string, type: ProjectEvent['type'], detail: string | null): void {
    this.db
      .prepare('INSERT INTO project_events (id, project_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), projectId, type, detail, nowIso())
  }

  /**
   * Проверяет, что путь указывает на существующую папку.
   * Приложение работает с папкой проекта только в режиме чтения.
   */
  private validateRootPath(rawPath: string): string {
    const candidate = rawPath.trim()
    if (candidate.length === 0 || !isAbsolute(candidate)) {
      throw createAppError('validation', 'Укажите абсолютный путь к папке проекта')
    }
    const resolved = resolve(candidate)
    if (!existsSync(resolved)) {
      throw createAppError('file_error', 'Папка проекта не существует')
    }
    if (!statSync(resolved).isDirectory()) {
      throw createAppError('file_error', 'Путь проекта должен указывать на папку')
    }
    return resolved
  }
}
