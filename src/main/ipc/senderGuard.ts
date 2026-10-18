import { fileURLToPath } from 'node:url'
import type { IpcMainInvokeEvent } from 'electron'

function isSameOrigin(candidate: string, originUrl: string): boolean {
  try {
    return new URL(candidate).origin === new URL(originUrl).origin
  } catch {
    return false
  }
}

export function createSenderGuard(devUrl: string | null, rendererDirectory: string): (event: IpcMainInvokeEvent) => boolean {
  const normalizedRoot = rendererDirectory.replace(/\\/g, '/').toLowerCase()

  return (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame
    if (!frame) {
      return false
    }
    // Запросы из вложенных frame'ов запрещены: приложение одностраничное.
    if (frame !== event.sender.mainFrame) {
      return false
    }

    const frameUrl = frame.url
    if (!frameUrl) {
      return false
    }

    if (devUrl) {
      return isSameOrigin(frameUrl, devUrl)
    }

    try {
      const parsed = new URL(frameUrl)
      if (parsed.protocol !== 'file:') {
        return false
      }
      const filePath = fileURLToPath(parsed).replace(/\\/g, '/').toLowerCase()
      return filePath.startsWith(normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`)
    } catch {
      return false
    }
  }
}
