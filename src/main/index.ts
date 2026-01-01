import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/NauticPlayerIcon.ico?asset'
import { setupMpvController, setupIpcHandlers, updateYtdl } from './mpvController'
import { setupSubtitleController } from './subtitleController'
import { logger } from './lib/logger'

// Configure Auto Updater
autoUpdater.autoDownload = true
autoUpdater.logger = logger as any

let mainWindow: BrowserWindow | null = null
let isInFullScreenMode = false // Manual tracking for fullscreen state
// NOTE: "View" is the UI Layer


function createWindow(): void {
  logger.log('[MAIN] Creating MAIN window (Host for Video + UI View)...')
  
  // 1. Create the browser window (Transparent + UI + Video Host)
  mainWindow = new BrowserWindow({
    width: 700,
    height: 450,
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
    mainWindow.focus()
    // Sync UI with Window State
    mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximized'))
    mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-unmaximized'))
    mainWindow.on('enter-full-screen', () => {
        isInFullScreenMode = true
        mainWindow?.webContents.send('window-maximized')
    })
    mainWindow.on('leave-full-screen', () => {
        isInFullScreenMode = false
        if (mainWindow?.isMaximized()) {
            mainWindow?.webContents.send('window-maximized')
        } else {
            mainWindow?.webContents.send('window-unmaximized')
        }
    })

    // Initialize MPV on the MainWindow
    // We use mainWindow for both the WID host and the IPC sender
    logger.log('[MAIN] Initializing Controllers...')
    setupMpvController(mainWindow, mainWindow.webContents) // (Host, Sender) - Correct
    // Check for updates on startup (Silent in Prod, Verbose in Dev)
    updateYtdl(mainWindow.webContents, !is.dev)
    
    // Check for APP updates (GitHub Releases)
    if (!is.dev) {
         autoUpdater.checkForUpdatesAndNotify()
    }

    setupSubtitleController(mainWindow)
    setupIpcHandlers(mainWindow.webContents, mainWindow) // (Sender, Host) - Corrected Order

    // Reset loop state to none on startup
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mpv-update-loop', 'none')
        
        // Check for startup file (CLI Arg / Open With)
        if (!is.dev) {
            // Production: argv[1] is usually the file path if present
            const args = process.argv
            const startupFile = args.find((arg, index) => index >= 1 && !arg.startsWith('--'))
            if (startupFile) {
                logger.log('[MAIN] Startup File Detected:', startupFile)
                // Use a small timeout to ensure React is fully ready to receive
                setTimeout(() => {
                    mainWindow?.webContents.send('mpv-load-file', startupFile)
                }, 1000)
            }
        }
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
    const isMax = mainWindow.isMaximized()
    
    logger.log(`[TOGGLE] isInFullScreenMode: ${isInFullScreenMode}, isMaximized: ${isMax}`)
    
    if (isMax || isInFullScreenMode) {
        logger.log('[TOGGLE] Restoring window...')
        mainWindow.setFullScreen(false)
        isInFullScreenMode = false
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.unmaximize()
            }
        }, 200)
    } else {
        logger.log('[TOGGLE] Expanding to fullscreen...')
        mainWindow.setFullScreen(true)
        isInFullScreenMode = true
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

ipcMain.handle('get-legal-content', async (_event, filename: string) => {
    try {
        const resourcesPath = is.dev 
            ? join(__dirname, '../../resources/legal') 
            : join(process.resourcesPath, 'legal') // Correct path for packaged app (extraResources)
        
        // Try alternate path if first fails (common issue in prod vs dev)
        let filePath = join(resourcesPath, filename)
        
        // Simple sanitization
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            throw new Error('Invalid filename')
        }

        const data = await import('fs').then(fs => fs.promises.readFile(filePath, 'utf-8'))
        return data
    } catch (error) {
        logger.error('[MAIN] Failed to read legal doc:', error)
        return '# Error\nCould not load document.'
    }
})

  // ... Global App Logic ...
app.whenReady().then(() => {
  logger.log('[APP] Electron app is ready')
  electronApp.setAppUserModelId('com.electron') // Fixed ID

  app.on('browser-window-created', (_, window) => {
      // No DevTools auto-open
      optimizer.watchWindowShortcuts(window)
  })

  // Single Instance Lock
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    return
  } else {
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
      // Someone tried to run a second instance, we should focus our window.
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
        
        // Handle file open from second instance
        const file = commandLine.find(arg => arg.endsWith('.mkv') || arg.endsWith('.mp4') || arg.endsWith('.avi') || arg.endsWith('.mov') || arg.endsWith('.webm'))
        // Or cleaner: take last arg if it's not a flag? simple heuristic for now:
        const potentialFile = commandLine[commandLine.length - 1]
        if (potentialFile && !potentialFile.startsWith('--') && potentialFile !== '.') {
             logger.log('[MAIN] Second Instance File:', potentialFile)
             mainWindow.webContents.send('mpv-load-file', potentialFile)
        }
      }
    })
  }

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
