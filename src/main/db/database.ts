import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createAppError } from '@shared/errors'
import { MIGRATIONS, TARGET_SCHEMA_VERSION } from './migrations'

export interface DatabaseHandle {
  db: DatabaseSync
  filePath: string
  recoveredFromCorruption: boolean
  schemaVersion: number
}

function readSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  return typeof row?.user_version === 'number' ? row.user_version : 0
}

function applyMigrations(db: DatabaseSync): number {
  let version = readSchemaVersion(db)

  if (version > TARGET_SCHEMA_VERSION) {
    throw createAppError(
      'db_error',
      `Файл базы данных создан более новой версией приложения (схема v${version}). Обновите приложение.`
    )
  }

  while (version < TARGET_SCHEMA_VERSION) {
    const sql = MIGRATIONS[version]
    if (!sql) {
      throw createAppError('db_error', `Отсутствует миграция схемы v${version + 1}`)
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw createAppError('db_error', `Не удалось применить миграцию схемы v${version + 1}`, {
        details: error instanceof Error ? error.message : String(error),
        cause: error
      })
    }
    version += 1
  }

  return version
}

function configure(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
}

function openRaw(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath)
  configure(db)
  return db
}

function verifyIntegrity(db: DatabaseSync): void {
  const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check?: string }>
  const first = rows[0]?.integrity_check ?? 'unknown'
  if (first.toLowerCase() !== 'ok') {
    throw new Error(`integrity_check: ${first}`)
  }
}

/**
 * Открывает локальную базу данных, применяет миграции и, при повреждении
 * файла, сохраняет его копию рядом с суффиксом `.corrupt-<timestamp>`,
 * после чего создаёт новую базу. Данные при этом не удаляются безвозвратно.
 */
export function openDatabase(dataDirectory: string): DatabaseHandle {
  mkdirSync(dataDirectory, { recursive: true })
  const filePath = join(dataDirectory, 'app.db')

  let recoveredFromCorruption = false

  if (existsSync(filePath)) {
    try {
      const probe = openRaw(filePath)
      try {
        verifyIntegrity(probe)
        probe.close()
      } catch (error) {
        probe.close()
        throw error
      }
    } catch (error) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = `${filePath}.corrupt-${timestamp}`
      try {
        renameSync(filePath, backupPath)
        recoveredFromCorruption = true
      } catch (renameError) {
        throw createAppError('db_error', 'Файл базы данных повреждён и не может быть перемещён', {
          details: `${String(error)}; ${String(renameError)}`
        })
      }
      // WAL/SHM от повреждённой базы больше не нужны.
      for (const suffix of ['-wal', '-shm']) {
        try {
          if (existsSync(`${filePath}${suffix}`)) {
            renameSync(`${filePath}${suffix}`, `${backupPath}${suffix}`)
          }
        } catch {
          // Не критично: при следующем открытии SQLite создаст новые файлы.
        }
      }
    }
  }

  let db: DatabaseSync
  try {
    db = openRaw(filePath)
  } catch (error) {
    throw createAppError('db_error', 'Не удалось открыть базу данных приложения', {
      details: error instanceof Error ? error.message : String(error),
      cause: error
    })
  }

  let schemaVersion: number
  try {
    schemaVersion = applyMigrations(db)
  } catch (error) {
    db.close()
    throw error
  }

  return { db, filePath, recoveredFromCorruption, schemaVersion }
}

export function closeDatabase(handle: DatabaseHandle): void {
  try {
    handle.db.close()
  } catch {
    // Повторное закрытие не является ошибкой.
  }
}

export function withTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Откат может не понадобиться, если транзакция уже завершилась.
    }
    throw error
  }
}
