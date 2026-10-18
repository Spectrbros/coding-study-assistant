import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { createAppError } from '@shared/errors'
import type { KeyStatus } from '@shared/types'

interface StoredSecret {
  version: 1
  encrypted: string
}

/**
 * Хранит API-ключ DeepSeek только в зашифрованном виде.
 * На Windows используется DPAPI (Electron safeStorage), привязанный к учётной записи.
 * Если шифрование недоступно, ключ хранится только в памяти до выхода из приложения.
 */
export class SecretStore {
  private readonly filePath: string
  private memoryKey: string | null = null
  private lastDecryptError = false
  private cachedKey: string | null = null
  private cacheLoaded = false

  constructor(userDataPath: string) {
    const directory = join(userDataPath, 'secrets')
    mkdirSync(directory, { recursive: true })
    this.filePath = join(directory, 'deepseek-key.json')
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  status(): KeyStatus {
    const key = this.readKey()
    return {
      configured: key !== null,
      keySuffix: key ? key.slice(-4) : null,
      encryptionAvailable: this.isEncryptionAvailable(),
      decryptError: this.lastDecryptError
    }
  }

  readKey(): string | null {
    if (this.cacheLoaded) {
      return this.cachedKey
    }
    this.cacheLoaded = true
    this.cachedKey = this.memoryKey ?? this.readFromDisk()
    return this.cachedKey
  }

  requireKey(): string {
    const key = this.readKey()
    if (key) {
      return key
    }
    if (this.lastDecryptError) {
      throw createAppError('key_unavailable', 'Не удалось расшифровать сохранённый API-ключ')
    }
    throw createAppError('no_key', 'API-ключ DeepSeek не задан')
  }

  save(key: string): void {
    const trimmed = key.trim()
    if (trimmed.length < 8) {
      throw createAppError('validation', 'API-ключ выглядит слишком коротким')
    }

    this.memoryKey = trimmed
    this.cachedKey = trimmed
    this.cacheLoaded = true
    this.lastDecryptError = false

    if (!this.isEncryptionAvailable()) {
      // Не записываем открытый ключ на диск ни при каких условиях.
      if (existsSync(this.filePath)) {
        rmSync(this.filePath, { force: true })
      }
      return
    }

    const payload: StoredSecret = {
      version: 1,
      encrypted: safeStorage.encryptString(trimmed).toString('base64')
    }
    writeFileSync(this.filePath, JSON.stringify(payload), 'utf8')
  }

  clear(): void {
    this.memoryKey = null
    this.cachedKey = null
    this.cacheLoaded = true
    this.lastDecryptError = false
    if (existsSync(this.filePath)) {
      rmSync(this.filePath, { force: true })
    }
  }

  private readFromDisk(): string | null {
    if (!existsSync(this.filePath)) {
      return null
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoredSecret>
      if (raw.version !== 1 || typeof raw.encrypted !== 'string') {
        this.lastDecryptError = true
        return null
      }
      if (!this.isEncryptionAvailable()) {
        this.lastDecryptError = true
        return null
      }
      const decrypted = safeStorage.decryptString(Buffer.from(raw.encrypted, 'base64')).trim()
      return decrypted.length > 0 ? decrypted : null
    } catch {
      this.lastDecryptError = true
      return null
    }
  }
}
