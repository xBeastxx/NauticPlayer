/**
 * MPV Controller for NauticPlayer
 * Uses direct child_process spawn instead of node-mpv due to path quoting bug
 */

import { spawn, ChildProcess } from 'child_process'
import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import * as net from 'net'

let mpvProcess: ChildProcess | null = null
let ipcSocket: net.Socket | null = null
const socketPath = `\\\\.\\pipe\\mpvsocket-${process.pid}`

export function setupMpvController(mainWindow: BrowserWindow): void {
  // Get the native window handle for embedding
  const windowHandle = mainWindow.getNativeWindowHandle()
  const wid = windowHandle.readBigInt64LE(0).toString()
  
  // Path to mpv.exe and bin folder (for yt-dlp/ffmpeg)
  const resourcesPath = is.dev 
    ? join(process.cwd(), 'resources')
    : process.resourcesPath

  const mpvPath = join(resourcesPath, 'mpv', 'mpv.exe')
  const binPath = join(resourcesPath, 'bin')
  const ytdlPath = join(binPath, 'yt-dlp.exe')
  
  console.log('MPV Path:', mpvPath)
  console.log('Bin Path:', binPath)
  console.log('Window ID:', wid)
  
  // MPV arguments for embedded playback
  const args = [
    `--input-ipc-server=${socketPath}`,
    `--wid=${wid}`,
    '--idle=yes',
    '--no-border',
    '--no-osc',
    '--osd-level=0',
    '--keep-open=yes',
    '--force-window=yes',
    '--input-default-bindings=no',
    '--input-vo-keyboard=no',
    '--vo=gpu',
    '--hwdec=auto',
    '--panscan=1.0', // Zoom to fill
    '--image-display-duration=inf',
    '--loop-file=inf', // Loop for testing
    // Stream Integration
    `--script-opts=ytdl_hook-ytdl_path=${ytdlPath}`,
    '--ytdl-raw-options=format=bestvideo+bestaudio/best'
  ]
  
  // Extend PATH to include bin folder (for mpv/yt-dlp to find ffmpeg)
  const env = { 
    ...process.env, 
    PATH: `${binPath};${process.env.PATH}` 
  }

  // Spawn MPV process
  mpvProcess = spawn(mpvPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env // Pass updated environment
  })
  
  mpvProcess.on('error', (err) => {
    console.error('MPV spawn error:', err)
    mainWindow.webContents.send('mpv-error', err.message)
  })
  
  mpvProcess.on('exit', (code) => {
    console.log('MPV exited with code:', code)
  })
  
  mpvProcess.stdout?.on('data', (data) => {
    console.log('MPV stdout:', data.toString())
  })
  
  mpvProcess.stderr?.on('data', (data) => {
    console.log('MPV stderr:', data.toString())
  })
  
  // Connect to MPV IPC socket after short delay
  setTimeout(() => {
    connectToMpvSocket(mainWindow)
  }, 1000)
  
  // Setup IPC handlers for renderer
  setupIpcHandlers(mainWindow)
}

function connectToMpvSocket(mainWindow: BrowserWindow): void {
  ipcSocket = net.createConnection(socketPath)
  
  ipcSocket.on('connect', () => {
    console.log('Connected to MPV IPC socket')
    mainWindow.webContents.send('mpv-ready')
    
    // Start observing properties
    sendCommand({ command: ['observe_property', 1, 'time-pos'] })
    sendCommand({ command: ['observe_property', 2, 'duration'] })
    sendCommand({ command: ['observe_property', 3, 'pause'] })
    sendCommand({ command: ['observe_property', 4, 'volume'] })
    sendCommand({ command: ['observe_property', 6, 'track-list'] })
    // Observe video dimensions for auto-resize
    sendCommand({ command: ['observe_property', 5, 'video-out-params'] })
    
    // Playback & Delays
    sendCommand({ command: ['observe_property', 7, 'speed'] })
    sendCommand({ command: ['observe_property', 8, 'audio-delay'] })
    sendCommand({ command: ['observe_property', 9, 'sub-delay'] })
    // Metadata
    sendCommand({ command: ['observe_property', 10, 'filename'] })
    // Active Tracks
    sendCommand({ command: ['observe_property', 11, 'aid'] })
    sendCommand({ command: ['observe_property', 12, 'sid'] })
  })
  
  ipcSocket.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    lines.forEach(line => {
      try {
        const msg = JSON.parse(line)
        handleMpvMessage(msg, mainWindow)
      } catch (e) {
        // Ignore parse errors
      }
    })
  })
  
  ipcSocket.on('error', (err) => {
    console.error('MPV socket error:', err)
    // Retry connection
    setTimeout(() => connectToMpvSocket(mainWindow), 2000)
  })
}

function handleMpvMessage(msg: any, mainWindow: BrowserWindow): void {
  if (msg.event === 'property-change') {
    switch (msg.name) {
      case 'time-pos':
        if (typeof msg.data === 'number') {
          mainWindow.webContents.send('mpv-time', msg.data)
        }
        break
      case 'duration':
        if (typeof msg.data === 'number') {
          mainWindow.webContents.send('mpv-duration', msg.data)
        }
        break
      case 'pause':
        mainWindow.webContents.send('mpv-paused', msg.data)
        break
      case 'volume':
        mainWindow.webContents.send('mpv-volume', msg.data)
        break
      case 'speed':
        mainWindow.webContents.send('mpv-speed', msg.data)
        break
      case 'audio-delay':
        mainWindow.webContents.send('mpv-audio-delay', msg.data)
        break
      case 'sub-delay':
        mainWindow.webContents.send('mpv-sub-delay', msg.data)
        break
      case 'track-list':
        if (Array.isArray(msg.data)) {
           handleTrackListChange(msg.data, mainWindow)
        }
        break
      // Fix: Refresh track list when active track changes
      case 'aid':
      case 'sid':
          console.log(`Property ${msg.name} changed. Refreshing track list...`)
          sendCommand({ command: ['get_property', 'track-list'] })
          break
      case 'video-out-params':
        if (msg.data && msg.data.w && msg.data.h) {
          resizeWindowToVideo(mainWindow, msg.data.w, msg.data.h)
        }
        break
      case 'filename':
        mainWindow.webContents.send('mpv-filename', msg.data)
        break
    }
  }
}

function resizeWindowToVideo(mainWindow: BrowserWindow, videoW: number, videoH: number) {
  if (!videoW || !videoH) return
  
  const currentBounds = mainWindow.getBounds()
  const currentRatio = currentBounds.width / currentBounds.height
  const videoRatio = videoW / videoH
  
  // Don't resize if ratio is very close (avoid minor jitter)
  if (Math.abs(currentRatio - videoRatio) < 0.01) return

  // Keep width, adjust height to match aspect ratio
  const newHeight = Math.round(currentBounds.width / videoRatio)
  
  console.log(`Auto-resizing window from ${currentBounds.width}x${currentBounds.height} to ${currentBounds.width}x${newHeight} for video ratio ${videoRatio}`)
  
  // Enforce aspect ratio for manual resizing
  mainWindow.setAspectRatio(videoRatio)
  
  mainWindow.setSize(currentBounds.width, newHeight, true)
}

function handleTrackListChange(tracks: any[], mainWindow: BrowserWindow) {
  // Always send track list to renderer so UI can update (Audio/Sub menus)
  mainWindow.webContents.send('mpv-tracks', tracks)

  // If no tracks (idle), do nothing else.
  if (tracks.length === 0) return

  const hasVideo = tracks.some(t => t.type === 'video')
  
  if (!hasVideo) {
    console.log('Audio-only detected. Applying Custom Background...')
    const resourcesPath = is.dev ? join(process.cwd(), 'resources') : process.resourcesPath
    // Escape backslashes for MPV filter string
    const bgPath = join(resourcesPath, 'images', 'FondoMusic-.png').replaceAll('\\', '/').replaceAll(':', '\\:')
    
    // Filter: Movie -> Scale (400px width) -> Overlay on Black (1280x720)
    // format=rgba ensures alpha is handled, then overlaying on black kills the checkerboard
    const complexFilter = `movie='${bgPath}'[logo];[logo]scale=400:-1[small];color=c=black:s=1280x720[bg];[bg][small]overlay=(W-w)/2:(H-h)/2[vo]`
    
    sendCommand({ command: ['set_property', 'lavfi-complex', complexFilter] })
    mainWindow.webContents.send('mpv-msg', '🎵 Audio Mode')
  } else {
    // If video exists, clear any custom background
    sendCommand({ command: ['set_property', 'lavfi-complex', ''] })
  }
}

function setupIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.on('mpv-load', (_event, filePath: string) => {
    sendCommand({ command: ['loadfile', filePath] })
  })
  
  ipcMain.on('mpv-play', () => {
    sendCommand({ command: ['set_property', 'pause', false] })
  })
  
  ipcMain.on('mpv-pause', () => {
    sendCommand({ command: ['set_property', 'pause', true] })
  })
  
  ipcMain.on('mpv-toggle', () => {
    sendCommand({ command: ['cycle', 'pause'] })
  })
  
  ipcMain.on('mpv-seek-to', (_event, seconds: number) => {
    sendCommand({ command: ['seek', seconds, 'absolute+exact'] })
  })

  ipcMain.on('mpv-jump', (_event, seconds: number) => {
    sendCommand({ command: ['seek', seconds, 'relative+exact'] })
  })
  
  ipcMain.on('mpv-playpause', () => {
    sendCommand({ command: ['cycle', 'pause'] })
  })
  
  ipcMain.on('mpv-volume', (_event, delta: number) => {
    sendCommand({ command: ['add', 'volume', delta] })
    // Clamp volume to 0-100
    setTimeout(() => {
      sendCommand({ command: ['get_property', 'volume'] })
    }, 50)
  })
  
  ipcMain.on('mpv-mute', (_event, muted: boolean) => {
    sendCommand({ command: ['set_property', 'mute', muted] })
  })

  ipcMain.on('mpv-add-sub', (_event, filePath: string) => {
    console.log('Adding subtitle:', filePath)
    sendCommand({ command: ['sub-add', filePath] })
  })

  ipcMain.on('mpv-adjust-sub-delay', (_event, delta: number) => {
    sendCommand({ command: ['add', 'sub-delay', delta] })
  })

  // Shader Logic
  let shaderEnabled = false
  ipcMain.on('mpv-toggle-shader', (_event, enable?: boolean) => {
    if (typeof enable === 'boolean') {
        shaderEnabled = enable
    } else {
        shaderEnabled = !shaderEnabled
    }
    
    if (shaderEnabled) {
      const resourcesPath = is.dev ? join(process.cwd(), 'resources') : process.resourcesPath
      const shaderDir = join(resourcesPath, 'shaders')
      
      const shaders = [
        join(shaderDir, 'Anime4K_Clamp_Highlights.glsl'),
        join(shaderDir, 'Anime4K_Restore_CNN_UL.glsl'),
        join(shaderDir, 'Anime4K_Upscale_CNN_x2_UL.glsl')
      ]
      
      const shaderString = shaders.join(';')
      
      console.log('Enabling Shaders (Ultra Quality):', shaderString)
      sendCommand({ command: ['set_property', 'glsl-shaders', shaderString] })
      mainWindow.webContents.send('mpv-msg', '✨ Anime4K Enhanced')
    } else {
      console.log('Disabling Shaders')
      sendCommand({ command: ['set_property', 'glsl-shaders', ''] })
      mainWindow.webContents.send('mpv-msg', 'Standard Quality')
    }
  })

  // === Track Selection (Forced Update) ===
  ipcMain.on('mpv-set-audio', (_event, id: number) => {
    // Ensure ID is a number
    const numId = parseInt(String(id), 10)
    console.log('Setting Audio Track ID:', numId)
    sendCommand({ command: ['set_property', 'aid', numId] })
  })

  ipcMain.on('mpv-set-sub', (_event, id: number | string) => {
    console.log('Setting Sub Track ID:', id) 
    // Sub ID can be 'no' (string) or number
    sendCommand({ command: ['set_property', 'sid', id] })
  })

  // === Generic Command Handler (Settings Menu) ===
  ipcMain.on('mpv-command', (_event, args: any[]) => {
      console.log('Generic Command:', args)
      sendCommand({ command: args })
  })

  // === Settings Specifics ===
  ipcMain.on('set-always-on-top', (_event, value: boolean) => {
      mainWindow.setAlwaysOnTop(value)
  })

  ipcMain.on('open-config-folder', () => {
      const resourcesPath = is.dev ? join(process.cwd(), 'resources') : process.resourcesPath
      const mpvConfDir = join(resourcesPath, 'mpv')
      require('electron').shell.openPath(mpvConfDir)
  })

  // === Update Logic ===
  ipcMain.on('mpv-update-ytdl', () => {
    updateYtdl(mainWindow, false)
  })




}

function updateYtdl(mainWindow: BrowserWindow, silent: boolean) {
    console.log(`Checking for yt-dlp updates (Silent: ${silent})...`)
    if (!silent) mainWindow.webContents.send('mpv-msg', '🔄 Updating engines...')

    const resourcesPath = is.dev 
      ? join(process.cwd(), 'resources')
      : process.resourcesPath
    const binPath = join(resourcesPath, 'bin')
    const ytdlPath = join(binPath, 'yt-dlp.exe')

    const updateProcess = spawn(ytdlPath, ['-U'])

    let output = ''

    updateProcess.stdout?.on('data', (data) => {
        output += data.toString()
        console.log('yt-dlp update output:', data.toString())
    })

    updateProcess.on('close', (code) => {
      if (code === 0) {
        const wasUpdated = output.includes('Updated') || output.includes('updating')
        
        if (!silent) {
            mainWindow.webContents.send('mpv-msg', '✅ Engines updated!')
        } else if (wasUpdated) {
            mainWindow.webContents.send('mpv-msg', '✅ Engines Auto-Updated')
        }
        console.log('yt-dlp check finished. Updated:', wasUpdated)
      } else {
        console.error('yt-dlp update exited with code:', code)
        if (!silent) mainWindow.webContents.send('mpv-msg', `Update refresh (Code ${code})`)
      }
    })

    updateProcess.on('error', (err) => {
      console.error('yt-dlp spawn error:', err)
      if (!silent) mainWindow.webContents.send('mpv-msg', '❌ Update error')
    })
}

export function quitMpv(): void {
  if (ipcSocket) {
    sendCommand({ command: ['quit'] })
    ipcSocket.destroy()
    ipcSocket = null
  }
  if (mpvProcess) {
    mpvProcess.kill()
    mpvProcess = null
  }
}

function sendCommand(data: Record<string, any>): void {
  if (ipcSocket && !ipcSocket.destroyed) {
    const json = JSON.stringify(data)
    console.log('[IPC-SEND]', json) // Log all sent commands
    ipcSocket.write(json + '\n')
  } else {
    console.warn('[IPC-FAIL] Socket not ready or destroyed', data)
  }
}
