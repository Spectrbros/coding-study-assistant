import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getRendererDevUrl, hardenWindow } from './security'
import type { WindowStateStore } from './windowState'

export interface WindowOptions {
  stateStore: WindowStateStore
  preloadPath: string
  onClose?: () => void
}

function isBoundsVisible(bounds: { x: number; y: number; width: number; height: number }): boolean {
  const displays = screen.getAllDisplays()
  return displays.some((display) => {
    const area = display.workArea
    const horizontal = bounds.x < area.x + area.width && bounds.x + bounds.width > area.x
    const vertical = bounds.y < area.y + area.height && bounds.y + bounds.height > area.y
    return horizontal && vertical
  })
}

export function createMainWindow({ stateStore, preloadPath, onClose }: WindowOptions): BrowserWindow {
  const saved = stateStore.read()
  const position =
    saved.x !== null && saved.y !== null && isBoundsVisible({ x: saved.x, y: saved.y, width: saved.width, height: saved.height })
      ? { x: saved.x, y: saved.y }
      : {}

  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...position,
    minWidth: 980,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    title: 'Coding Study Assistant',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false
    }
  })

  hardenWindow(window)

  let saveTimer: NodeJS.Timeout | null = null
  const persistBounds = (): void => {
    if (window.isDestroyed()) {
      return
    }
    const normal = window.getNormalBounds()
    stateStore.write({
      width: normal.width,
      height: normal.height,
      x: normal.x,
      y: normal.y,
      maximized: window.isMaximized()
    })
  }

  const schedulePersist = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      saveTimer = null
      persistBounds()
    }, 400)
  }

  window.on('resize', schedulePersist)
  window.on('move', schedulePersist)
  window.on('maximize', schedulePersist)
  window.on('unmaximize', schedulePersist)

  window.once('ready-to-show', () => {
    if (saved.maximized) {
      window.maximize()
    }
    window.show()
  })

  window.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    persistBounds()
    onClose?.()
  })

  const devUrl = getRendererDevUrl()
  if (devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
