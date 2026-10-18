import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { join } from 'node:path'
import { applyDevHeadersCsp, applySessionSecurity, getRendererDevUrl } from './security'
import { IpcRegistry } from './ipc/registry'
import { createSenderGuard } from './ipc/senderGuard'
import { registerSystemHandlers } from './ipc/system'
import { registerDataHandlers } from './ipc/dataHandlers'
import { registerAiHandlers } from './ipc/aiHandlers'
import { registerMediaHandlers } from './ipc/mediaHandlers'
import { registerRunHandlers } from './ipc/runHandlers'
import { registerChecklistAiHandlers } from './ipc/checklistAiHandlers'
import { createMainWindow } from './window'
import { WindowStateStore } from './windowState'
import { closeDatabase, openDatabase, type DatabaseHandle } from './db/database'
import { AppContext } from './services/appContext'
import { SecretStore } from './services/secretStore'
import { DeepSeekClient } from './services/deepseekClient'
import { ModelCache } from './services/modelCache'
import { AiService } from './services/aiService'
import { ChecklistAiService } from './services/checklistAiService'
import { RunService } from './services/runService'

let mainWindow: BrowserWindow | null = null
let databaseHandle: DatabaseHandle | null = null
let aiService: AiService | null = null
let runService: RunService | null = null

// Песочница включается до события ready, иначе Electron игнорирует вызов.
app.enableSandbox()
app.setAppUserModelId('com.spectrbros.codingstudy')

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
}

function installSmokeProbe(window: BrowserWindow): void {
  if (process.env['SMOKE_TEST'] !== '1') {
    return
  }
  window.webContents.once('did-finish-load', () => {
    void window.webContents
      .executeJavaScript('document.body.innerText')
      .then((text: unknown) => {
        process.stdout.write(`SMOKE_RESULT:${JSON.stringify(text).slice(0, 4000)}\n`)
      })
      .catch((error: unknown) => {
        process.stdout.write(`SMOKE_ERROR:${String(error)}\n`)
      })
      .finally(() => {
        setTimeout(() => app.quit(), 200)
      })
  })
}

function bootstrap(): void {
  applySessionSecurity()
  applyDevHeadersCsp()

  const devUrl = getRendererDevUrl()
  const rendererDirectory = join(__dirname, '../renderer')
  const registry = new IpcRegistry(createSenderGuard(devUrl, rendererDirectory))
  registerSystemHandlers(registry)

  const userDataPath = app.getPath('userData')
  const handle = openDatabase(join(userDataPath, 'data'))
  databaseHandle = handle
  const context = new AppContext(handle.db, userDataPath)

  registerDataHandlers(registry, context, {
    onSettingsChanged: (settings) => {
      nativeTheme.themeSource = settings.theme
    }
  })

  const secrets = new SecretStore(userDataPath)
  const client = new DeepSeekClient()
  const models = new ModelCache(client)
  const ai = new AiService(context, secrets, client)
  aiService = ai
  registerAiHandlers(registry, { context, secrets, client, models, ai })
  registerMediaHandlers(registry, context)
  registerChecklistAiHandlers(registry, new ChecklistAiService(context, secrets, client, models))

  const runs = new RunService(context)
  runService = runs
  registerRunHandlers(registry, runs)

  const initialSettings = context.settings.read()
  nativeTheme.themeSource = initialSettings.theme

  const stateStore = new WindowStateStore(userDataPath)
  mainWindow = createMainWindow({
    stateStore,
    preloadPath: join(__dirname, '../preload/index.js'),
    onClose: () => {
      mainWindow = null
    }
  })
  installSmokeProbe(mainWindow)

  if (handle.recoveredFromCorruption) {
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'База данных восстановлена',
      message: 'Файл локальной базы данных был повреждён и сохранён рядом в виде резервной копии.',
      detail: `Резервная копия: ${handle.filePath}.corrupt-<время>\nПриложение продолжит работу с новой базой.`,
      buttons: ['Понятно']
    })
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindow()
  })

  void app.whenReady().then(() => {
    bootstrap()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        bootstrap()
      } else {
        focusMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    aiService?.cancelAll()
    runService?.cancelAll()
    if (databaseHandle) {
      closeDatabase(databaseHandle)
      databaseHandle = null
    }
  })
}

