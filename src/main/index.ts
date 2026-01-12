import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/NauticPlayerIcon.ico?asset'
import { setupMpvController, setupIpcHandlers, updateYtdl, sendCommand } from './mpvController'
import { startRemoteServer, resolveBestIps, setCurrentFile, sendShutdownAck } from './remoteServer'
import { setupSubtitleController } from './subtitleController'
import { logger } from './lib/logger'
import { getPreference, savePreference } from './lib/preferences'

// Configure Auto Updater
autoUpdater.autoDownload = true
autoUpdater.logger = logger as any

let mainWindow: BrowserWindow | null = null
let isInFullScreenMode = false // Manual tracking for fullscreen state
let remoteWakeSuppressedUntil = 0 // Timestamp to ignore wakes after shutdown

// Export getter for fullscreen state (used by mpvController)
export function getIsFullScreen(): boolean {
    return isInFullScreenMode
}
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
    
    // Check for auto-launch hidden flag
    const startHidden = process.argv.includes('--hidden')
    if (startHidden) {
        logger.log('[MAIN] Starting in HIDDEN mode (Auto-Launch)')
        // Don't show or focus
    } else {
        mainWindow.show()
        mainWindow.focus()
    }
    // Sync UI with Window State
    mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximized'))
    mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-unmaximized'))
    mainWindow.on('enter-full-screen', () => {
        isInFullScreenMode = true
        mainWindow?.webContents.send('window-maximized')
        // Disable zoom in fullscreen to show full video without cropping
        sendCommand({ command: ['set_property', 'panscan', 0] })
    })
    mainWindow.on('leave-full-screen', () => {
        isInFullScreenMode = false
        // Re-enable zoom for windowed mode to fill the window
        sendCommand({ command: ['set_property', 'panscan', 1.0] })
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
    
    // Start Remote Server
    logger.log('[MAIN] Starting Remote Server...')
    startRemoteServer(mainWindow.webContents, mainWindow)

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

ipcMain.handle('get-remote-info', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const { port } = startRemoteServer(mainWindow.webContents, mainWindow)
        const ips = await resolveBestIps()
        return { port, ips, url: `http://${ips[0]}:${port}` }
    }
    return null
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

ipcMain.handle('open-file-dialog', async (_event, options?: any) => {
  if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: options?.properties || ['openFile'],
      title: options?.title || 'Open Video',
      filters: options?.filters || [
        { name: 'Videos', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', '3gp', 'ts'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled) return null
    // Return array if multiSelections, single path otherwise
    return options?.properties?.includes('multiSelections') ? filePaths : filePaths[0]
})

ipcMain.handle('open-folder-dialog', async (_event, options?: any) => {
  if (!mainWindow) return null
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: options?.title || 'Select Folder'
  })
  if (canceled || filePaths.length === 0) return null
  
  // Scan folder for video files
  const folderPath = filePaths[0]
  const fs = await import('fs')
  const path = await import('path')
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ts']
  
  try {
    const files = await fs.promises.readdir(folderPath)
    const videoFiles = files
      .filter(f => videoExtensions.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(folderPath, f))
      .sort() // Sort alphabetically
    
    return { folder: folderPath, files: videoFiles }
  } catch (e) {
    console.error('[FOLDER_DIALOG] Failed to read folder:', e)
    return null
  }
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

ipcMain.handle('open-external', async (_event, url: string) => {
    shell.openExternal(url)
})

  // ... Global App Logic ...
app.whenReady().then(() => {
  logger.log('[APP] Electron app is ready')
  electronApp.setAppUserModelId('com.electron') // Fixed ID

  // Default Auto-Launch on First Run
  if (!getPreference('initialSetupComplete')) {
      logger.log('[MAIN] First Run: Enabling Auto-Launch by default')
      try {
          app.setLoginItemSettings({
              openAtLogin: true,
              openAsHidden: true,
              path: process.execPath,
              args: ['--hidden']
          })
          savePreference('initialSetupComplete', true)
      } catch (e) {
          logger.error('[MAIN] Failed to set auto-launch:', e)
      }
  }

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

  // Create Tray
  const tray = createTray(mainWindow!)
  
  // Handle wake-on-connect from remote server
  // Handle wake-on-connect from remote server
  ipcMain.on('remote-wake', () => {
      if (Date.now() < remoteWakeSuppressedUntil) {
          logger.log('[MAIN] Ignoring Wake Signal (Suppressed after Shutdown)')
          return
      }
      logger.log('[MAIN] Received Wake Signal from Remote')
      if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
      }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

;(process as any).on('uncaughtException', (error: any) => {
  logger.error('[PROCESS] Uncaught:', { message: error?.message || error })
})

// Quit when all windows are closed, except on macOS. 
// OR if we want to keep running in tray on Windows/Linux too.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isQuitting) {
     // If not explicit quit, do nothing (keep app running in tray if desired)
     // BUT current requirement is "keep in tray".
     // If user closes window, we usually hide it.
     // If window-all-closed fires, it means we destroyed the window.
     // We should prevent window destruction on close instead.
  } else {
     app.quit()
  }
})

// --- TRAY LOGIC ---
import { Tray, Menu, nativeImage } from 'electron'
let tray: Tray | null = null
let isQuitting = false

// Export setter for isQuitting so mpvController can trigger a full quit
export function setQuitting(value: boolean): void {
    isQuitting = value
}

function createTray(win: BrowserWindow): Tray {
    const iconPath = is.dev
        ? join(__dirname, '../../resources/NauticPlayerIcon.ico')
        : join(process.resourcesPath, 'NauticPlayerIcon.ico')
        
    const appIcon = nativeImage.createFromPath(iconPath)
    const trayInstance = new Tray(appIcon)
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Player', click: () => win.show() },
        { type: 'separator' },
        { label: 'Quit', click: () => {
            isQuitting = true
            app.quit()
        }}
    ])
    
    trayInstance.setToolTip('NauticPlayer')
    trayInstance.setContextMenu(contextMenu)
    
    trayInstance.on('double-click', () => {
        logger.log('[TRAY] Double-click detected. Showing window...')
        if (win) {
            if (win.isMinimized()) win.restore()
            win.show()
            win.focus()
            logger.log('[TRAY] Window show/focus called.')
        } else {
             logger.error('[TRAY] Window reference is NULL!')
        }
    })

    // Handle Window Close (Minimize to Tray)
    win.on('close', (event) => {
        logger.log(`[WINDOW] Close event. isQuitting=${isQuitting}`)
        if (!isQuitting) {
            event.preventDefault()
            try {
                // Stop playback and reset UI state when minimizing to tray
                logger.log('[WINDOW] Stopping playback and resetting state...')
                sendCommand({ command: ['stop'] })
                // Clear remote server state so it doesn't think a file is playing
                setCurrentFile(null)
                
                // timeout to 3000ms (enough to skip auto-reconnect, short enough for user retry)
                remoteWakeSuppressedUntil = Date.now() + 3000 
                logger.log(`[WINDOW] Remote wake suppressed until ${remoteWakeSuppressedUntil}`)
                
                // Confirm shutdown to remote client so it can disconnect safely
                sendShutdownAck()

                win.webContents.send('reset-app-state')
                logger.log('[WINDOW] reset-app-state sent to renderer')
            } catch (e: any) {
                logger.error('[WINDOW] Error during close sequence:', e)
            }
            
            win.hide()
            logger.log('[WINDOW] Window hidden (minimized to tray)')
            return false
        }
        logger.log('[WINDOW] Quitting app...')
        return true
    })

    return trayInstance
}
