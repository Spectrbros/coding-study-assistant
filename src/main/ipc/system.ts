import { app, clipboard, dialog, shell } from 'electron'
import { safeStorage } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/channels'
import { createAppError } from '@shared/errors'
import type { AppInfo } from '@shared/types'
import type { IpcRegistry } from './registry'
import { isAllowedExternalUrl } from '../security'

const MAX_CLIPBOARD_CHARS = 2_000_000

export function registerSystemHandlers(registry: IpcRegistry): void {
  registry.handleVoid<AppInfo>(IPC.systemInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  }))

  registry.handle(IPC.systemOpenExternal, z.string().min(1).max(4096), async (url) => {
    if (!isAllowedExternalUrl(url)) {
      throw createAppError('validation', 'Ссылка отклонена: разрешены только http(s)-адреса')
    }
    await shell.openExternal(url)
    return true
  })

  registry.handleVoid<string | null>(IPC.systemPickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Выберите папку проекта',
      properties: ['openDirectory', 'dontAddToRecent']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0] ?? null
  })

  registry.handle(IPC.systemCopyText, z.string().max(MAX_CLIPBOARD_CHARS), (text) => {
    clipboard.writeText(text)
    return true
  })
}
