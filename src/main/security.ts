import { app, session, shell, type BrowserWindow } from 'electron'
import { URL } from 'node:url'

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:'])

export function isAllowedExternalUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return false
  }
  // Отклоняем адреса с учётными данными и управляющими символами.
  if (parsed.username || parsed.password) {
    return false
  }
  return parsed.hostname.length > 0
}

export async function openExternalUrl(rawUrl: string): Promise<boolean> {
  if (!isAllowedExternalUrl(rawUrl)) {
    return false
  }
  await shell.openExternal(rawUrl)
  return true
}

export function getRendererDevUrl(): string | null {
  return process.env['ELECTRON_RENDERER_URL'] ?? null
}

function isSameOrigin(candidate: string, origin: string): boolean {
  try {
    return new URL(candidate).origin === new URL(origin).origin
  } catch {
    return false
  }
}

/**
 * Применяет политику безопасности к сессии: запрещает все разрешения,
 * блокирует переходы по внешним адресам и открытие новых окон.
 */
export function applySessionSecurity(): void {
  const defaultSession = session.defaultSession
  const devUrl = getRendererDevUrl()

  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  defaultSession.setPermissionCheckHandler(() => false)

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      const currentUrl = contents.getURL()
      const samePage = currentUrl.length > 0 && url === currentUrl
      const devNavigation = devUrl !== null && isSameOrigin(url, devUrl)
      if (!samePage && !devNavigation) {
        event.preventDefault()
        if (isAllowedExternalUrl(url)) {
          void shell.openExternal(url)
        }
      }
    })

    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
  })
}

export function hardenWindow(window: BrowserWindow): void {
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

/**
 * Заголовок CSP для dev-режима применения через webRequest.
 * В production используется строгий meta-тег, сгенерированный при сборке.
 */
export function applyDevHeadersCsp(): void {
  const devUrl = getRendererDevUrl()
  if (!devUrl) {
    return
  }
  const devOrigin = new URL(devUrl).origin
  const devWsOrigin = devOrigin.replace('http://', 'ws://').replace('https://', 'wss://')
  const policy = [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' ${devOrigin}`,
    `style-src 'self' 'unsafe-inline' ${devOrigin}`,
    `img-src 'self' data: blob: ${devOrigin}`,
    `font-src 'self' data: ${devOrigin}`,
    `connect-src 'self' ${devOrigin} ${devWsOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}
