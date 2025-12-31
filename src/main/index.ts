import { app, shell, BrowserWindow, BrowserView, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/NauticPlayerIcon.ico?asset'
import { setupMpvController, quitMpv, setupIpcHandlers } from './mpvController'
import { setupSubtitleController } from './subtitleController'
import { logger } from './lib/logger'
// Disable hardware acceleration to fix black screen issues
// app.disableHardwareAcceleration() // ENABLED AGAIN for BrowserView Transparency?

let mainWindow: BrowserWindow | null = null
// NOTE: "View" is the UI Layer


function createWindow(): void {
  logger.log('[MAIN] Creating MAIN window (Host for Video + UI View)...')
  
  // 1. Create the browser window (Transparent + UI + Video Host)
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 400,
    minHeight: 300,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Frameless
    transparent: true, // Transparent for UI
    backgroundColor: '#00000000', // Fully transparent background
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true, // Required for current renderer code
      contextIsolation: false, // Required for current renderer code
      backgroundThrottling: false
    }
  })

  // Explicitly ensure taskbar visibility
  mainWindow.setSkipTaskbar(false)

  // Ready to Show
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    
    logger.log('[MAIN] Window ready-to-show')
    mainWindow.show()
    mainWindow.focus() // Ensure focus

    // Initialize MPV on the MainWindow
    // We use mainWindow for both the WID host and the IPC sender
    logger.log('[MAIN] Initializing Controllers...')
    setupMpvController(mainWindow, mainWindow.webContents) // (Host, Sender) - Correct
    setupSubtitleController(mainWindow)
    setupIpcHandlers(mainWindow.webContents, mainWindow) // (Sender, Host) - Corrected Order

    // Reset loop state to none on startup
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mpv-update-loop', 'none')
    }
  })

  // Load URL
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    logger.log('[MAIN] Loading DEV URL into VIEW:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    logger.log('[MAIN] Loading PRODUCTION HTML into VIEW:', htmlPath)
    mainWindow.loadFile(htmlPath)
  }

  // Handle External Links
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  
  // Error handlers
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logger.error('[RENDERER-VIEW] Failed to load:', { errorCode, errorDescription })
  })
}

// IPC Handlers need to act on mainWindow (the container)
ipcMain.on('minimize-window', () => {
  mainWindow?.minimize()
})

ipcMain.on('close-window', () => {
  mainWindow?.close()
})

ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.handle('open-file-dialog', async () => {
  if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Videos', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled) return null
    return filePaths[0]
})

// ... Global App Logic ...
app.whenReady().then(() => {
  logger.log('[APP] Electron app is ready')
  electronApp.setAppUserModelId('com.electron') // Fixed ID

  app.on('browser-window-created', (_, window) => {
      // No DevTools auto-open
      optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

process.on('uncaughtException', (error) => {
  logger.error('[PROCESS] Uncaught:', { message: error.message })
})
process.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
