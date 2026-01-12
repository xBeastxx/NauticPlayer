/**
 * MPV Controller for NauticPlayer
 * Uses direct child_process spawn instead of node-mpv due to path quoting bug
 */

import { spawn, ChildProcess } from 'child_process'
import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import * as net from 'net'
import { getIsFullScreen } from './index'
import { isYouTubeUrl, extractYouTubeMetadata, isYouTubePlaylist, extractYouTubePlaylist } from './lib/historyService'
import { updatePlayerState, getPlayerState, broadcastFullState, setCurrentFile } from './remoteServer'

let mpvProcess: ChildProcess | null = null
let ipcSocket: net.Socket | null = null
const socketPath = `\\\\.\\pipe\\mpvsocket-${process.pid}`
let mpvInitialized = false // Track if MPV has been initialized
let commandQueue: Record<string, any>[] = [] // Queue for commands before socket is ready

let globalUiSender: Electron.WebContents | null = null

// Updated signature for BrowserView Architecture
// hostWindow: The physical window where MPV is embedded (provides WID)
// uiSender: The WebContents of the BrowserView (where React UI lives)
export function setupMpvController(hostWindow: BrowserWindow, uiSender: Electron.WebContents): void {
  globalUiSender = uiSender
  // Prevent multiple initializations
  if (mpvInitialized) {
    console.log('[MPV] Already initialized, skipping...')
    return
  }
  mpvInitialized = true
  console.log('[MPV] Initializing for the first time...')
  
  // Get the native window handle from the HOST window
  const windowHandle = hostWindow.getNativeWindowHandle()
  const wid = windowHandle.readBigInt64LE(0).toString()
  
  // Path to mpv.exe and bin folder
  const resourcesPath = is.dev 
    ? join(process.cwd(), 'resources')
    : process.resourcesPath

  const mpvPath = join(resourcesPath, 'mpv', 'mpv.exe')
  const binPath = join(resourcesPath, 'bin')
  const ytdlPath = join(binPath, 'yt-dlp.exe')
  
  console.log('MPV Path:', mpvPath)
  console.log('Bin Path:', binPath)
  console.log('Window ID:', wid)
  
  // MPV arguments
  const args = [
    `--input-ipc-server=${socketPath}`,
    `--wid=${wid}`,
    '--idle=yes',
    '--no-border',
    '--no-osc',
    '--osd-level=0',
    '--keep-open=yes',
    '--force-window=no',
    '--input-default-bindings=no',
    '--input-vo-keyboard=no',
    '--vo=gpu',
    '--hwdec=auto',
    '--panscan=1.0', // Zoom to fill (will be dynamically adjusted in fullscreen)
    '--image-display-duration=inf',
    '--loop-file=no',
    `--script-opts=ytdl_hook-ytdl_path=${ytdlPath}`,
    '--ytdl-raw-options=format=bestvideo+bestaudio/best'
  ]
  
  const env = { 
    ...process.env, 
    PATH: `${binPath};${process.env.PATH}` 
  }

  // Spawn MPV
  mpvProcess = spawn(mpvPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env
  })
  
  mpvProcess.on('error', (err) => {
    console.error('MPV spawn error:', err)
    if (!uiSender.isDestroyed()) uiSender.send('mpv-error', err.message)
  })
  
  mpvProcess.on('exit', (code) => {
    console.log('MPV exited with code:', code)
    mpvInitialized = false
    mpvProcess = null
    ipcSocket = null
  })
  
  mpvProcess.stdout?.on('data', (data) => {
     // Optional: verbose logging
  })
  
  // Connect to IPC
  setTimeout(() => {
    connectToMpvSocket(uiSender, hostWindow)
  }, 1000)
}

function connectToMpvSocket(uiSender: Electron.WebContents, hostWindow: BrowserWindow): void {
  ipcSocket = net.createConnection(socketPath)
  
  ipcSocket.on('connect', () => {
    console.log('Connected to MPV IPC socket')
    if (!uiSender.isDestroyed()) uiSender.send('mpv-ready')
    
    // Observers
    const props = ['time-pos', 'duration', 'pause', 'volume', 'track-list', 'video-out-params', 'speed', 'audio-delay', 'sub-delay', 'filename', 'aid', 'sid']
    props.forEach((p, i) => {
         // Use generic ID 0 for all observers or specific ones? MPV handles auto-ID if 0
         // We'll stick to manual IDs if code relies on them?
         // Actually current code uses 1, 2, ...
    })
    
    sendCommand({ command: ['observe_property', 1, 'time-pos'] })
    sendCommand({ command: ['observe_property', 2, 'duration'] })
    sendCommand({ command: ['observe_property', 3, 'pause'] })
    sendCommand({ command: ['observe_property', 4, 'volume'] })
    sendCommand({ command: ['observe_property', 6, 'track-list'] })
    sendCommand({ command: ['observe_property', 5, 'video-out-params'] })
    sendCommand({ command: ['observe_property', 7, 'speed'] })
    sendCommand({ command: ['observe_property', 8, 'audio-delay'] })
    sendCommand({ command: ['observe_property', 9, 'sub-delay'] })
    sendCommand({ command: ['observe_property', 10, 'filename'] })
    sendCommand({ command: ['observe_property', 11, 'aid'] })
    sendCommand({ command: ['observe_property', 12, 'sid'] })
    sendCommand({ command: ['observe_property', 12, 'sid'] })
    sendCommand({ command: ['observe_property', 13, 'mute'] })
    sendCommand({ command: ['observe_property', 14, 'path'] })

    if (commandQueue.length > 0) {
        commandQueue.forEach(cmd => sendCommand(cmd))
        commandQueue = []
    }
  })
  
  ipcSocket.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    lines.forEach(line => {
      try {
        const msg = JSON.parse(line)
        handleMpvMessage(msg, uiSender, hostWindow)
      } catch (e) {
      }
    })
  })
  
  ipcSocket.on('error', (err) => {
    console.error('MPV socket error:', err)
    setTimeout(() => connectToMpvSocket(uiSender, hostWindow), 2000)
  })
}

function handleMpvMessage(msg: any, uiSender: Electron.WebContents, hostWindow: BrowserWindow): void {
  if (uiSender.isDestroyed()) return

  if (msg.event === 'end-file') {
      console.log('MPV End File:', msg)
      if (msg.reason === 'error') {
          uiSender.send('mpv-error', 'Failed to load file')
      }
      // Emit file-ended for playlist auto-advance (eof = natural end)
      if (msg.reason === 'eof') {
          uiSender.send('mpv-file-ended', { reason: 'eof' })
      }
  }

  if (msg.event === 'property-change') {
    switch (msg.name) {
      case 'time-pos':
        if (typeof msg.data === 'number') {
            uiSender.send('mpv-time', msg.data)
            updatePlayerState({ time: msg.data })
        }
        break
      case 'duration':
        if (typeof msg.data === 'number') {
            uiSender.send('mpv-duration', msg.data)
            updatePlayerState({ duration: msg.data })
        }
        break
      case 'pause':
        uiSender.send('mpv-paused', msg.data)
        updatePlayerState({ paused: msg.data })
        break
      case 'volume':
        uiSender.send('mpv-volume', msg.data)
        updatePlayerState({ volume: msg.data })
        break
      case 'speed':
        uiSender.send('mpv-speed', msg.data)
        break
      case 'audio-delay':
        uiSender.send('mpv-audio-delay', msg.data)
        break
      case 'sub-delay':
        uiSender.send('mpv-sub-delay', msg.data)
        break
      case 'mute':
        uiSender.send('mpv-mute', msg.data)
        updatePlayerState({ muted: msg.data })
        break
      case 'track-list':
        if (Array.isArray(msg.data)) {
            handleTrackListChange(msg.data, uiSender)
            updatePlayerState({ tracks: msg.data })
        }
        break
      case 'aid':
      case 'sid':
          // Refresh track list
          sendCommand({ command: ['get_property', 'track-list'] })
          break
      case 'video-out-params':
        if (msg.data && msg.data.w && msg.data.h) {
          resizeWindowToVideo(hostWindow, msg.data.w, msg.data.h)
        }
        break
      case 'filename':
        uiSender.send('mpv-filename', msg.data)
        updatePlayerState({ filename: msg.data })
        break
      case 'path':
        setCurrentFile(msg.data)
        break
    }
  }
}

function resizeWindowToVideo(mainWindow: BrowserWindow, videoW: number, videoH: number) {
  if (!videoW || !videoH) return
  
  // CRITICAL FIX: Do NOT auto-resize if maximized or fullscreen
  if (mainWindow.isMaximized()) {
      console.log('Skipping auto-resize because window is MAXIMIZED')
      return
  }
  
  // Use manual fullscreen tracking (not Electron's isFullScreen)
  if (getIsFullScreen()) {
      console.log('Skipping auto-resize because window is in MANUAL FULLSCREEN')
      return
  }
  
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

// Updated to take WebContents (uiSender)
function handleTrackListChange(tracks: any[], uiSender: Electron.WebContents) {
  if (uiSender.isDestroyed()) return
  // Always send track list to renderer
  uiSender.send('mpv-tracks', tracks)

  if (tracks.length === 0) return

  const hasVideo = tracks.some(t => t.type === 'video')
  
  if (!hasVideo) {
    console.log('Audio-only detected. Applying Custom Background...')
    const resourcesPath = is.dev ? join(process.cwd(), 'resources') : process.resourcesPath
    const bgPath = join(resourcesPath, 'images', 'FondoMusic-.png').replaceAll('\\', '/').replaceAll(':', '\\:')
    
    const complexFilter = `movie='${bgPath}'[logo];[logo]scale=400:-1[small];color=c=black:s=1280x720[bg];[bg][small]overlay=(W-w)/2:(H-h)/2[vo]`
    
    sendCommand({ command: ['set_property', 'lavfi-complex', complexFilter] })
    uiSender.send('mpv-msg', '🎵 Audio Mode')
  } else {
    sendCommand({ command: ['set_property', 'lavfi-complex', ''] })
  }
}

// Updated signatures for IPC setup
export function setupIpcHandlers(uiSender: Electron.WebContents, hostWindow: BrowserWindow): void {
  // We can't use the simple function property check easily with WebContents arg, so we'll just re-bind if needed, 
  // or better, store registration state in a module-level variable or property on mpvController
  // For safety/simplicity in this refactor, we remove the check (or assume single-call from index.ts)
  // But let's keep a module level flag? 
  // Actually, 'setupIpcHandlers' is called once. The closure captures 'uiSender'.
  
  // Note: IPC events like 'mpv-load' come from the Renderer. 
  // 'ipcMain.on' does not change.
  // The 'targetWindow' references in `mpv-load` (lazy init) must use `hostWindow` (for WID) and `uiSender` (for setup).
  
  ipcMain.removeAllListeners('mpv-load') // Clear previous to be safe
  
  ipcMain.on('mpv-load', async (_event, filePath: string) => {
    // Lazy: Init with hostWindow (WID) and uiSender (View)
    if (!mpvInitialized) {
         setupMpvController(hostWindow, uiSender)
    }
    
    // Check if this is a YouTube PLAYLIST
    if (isYouTubePlaylist(filePath)) {
      // Extract all videos from the playlist
      const playlistItems = await extractYouTubePlaylist(filePath)
      
      if (playlistItems.length > 0 && !uiSender.isDestroyed()) {
        // Emit playlist data to renderer
        uiSender.send('playlist-loaded', playlistItems)
        
        // Auto-play the first video
        const firstVideo = playlistItems[0]
        sendCommand({ command: ['loadfile', firstVideo.url] })
        
        // Also extract metadata for the first video
        if (isYouTubeUrl(firstVideo.url)) {
          extractYouTubeMetadata(firstVideo.url).then(metadata => {
            if (metadata && !uiSender.isDestroyed()) {
              uiSender.send('youtube-metadata', metadata)
            }
          })
        }
      } else {
        // Playlist extraction failed, try loading as single video
        sendCommand({ command: ['loadfile', filePath] })
      }
      return
    }
    
    // Extract YouTube metadata if applicable (async, non-blocking)
    if (isYouTubeUrl(filePath)) {
      extractYouTubeMetadata(filePath).then(metadata => {
        if (metadata && !uiSender.isDestroyed()) {
          uiSender.send('youtube-metadata', metadata)
        }
      })
      // Clear current file for streaming (YouTube URLs can't be streamed this way)
      setCurrentFile(null)
    } else {
      // Local file - set for streaming to phone
      setCurrentFile(filePath)
    }
    
    sendCommand({ command: ['loadfile', filePath] })
  })

  // Restored Playback Handlers
  ipcMain.on('mpv-play', () => {
    sendCommand({ command: ['set_property', 'pause', false] })
  })
  
  ipcMain.on('mpv-pause', () => {
    sendCommand({ command: ['set_property', 'pause', true] })
  })
  
  ipcMain.on('mpv-toggle', () => {
    sendCommand({ command: ['cycle', 'pause'] })
  })

  ipcMain.on('mpv-seek', (_event, time: number) => {
    sendCommand({ command: ['seek', time, 'relative'] })
  })

  ipcMain.on('mpv-seek-to', (_event, time: number) => {
    sendCommand({ command: ['seek', time, 'absolute', 'exact'] })
  })

  ipcMain.on('mpv-jump', (_event, time: number) => {
    sendCommand({ command: ['seek', time, 'relative'] })
  })

  ipcMain.on('mpv-volume', (_event, volume: number) => {
    // Ensure volume is clamped 0-100 if needed, usually UI handles it but backend safe is good
    sendCommand({ command: ['set_property', 'volume', volume] })
  })

  ipcMain.on('mpv-mute', (_event, muted: boolean) => {
    sendCommand({ command: ['set_property', 'mute', muted] })
  })

  // Restored Audio/Subtitle Selection Handlers
  ipcMain.on('mpv-set-audio', (_event, id: any) => {
     // ID can be a number or "no"
     sendCommand({ command: ['set_property', 'aid', id] })
  })

  ipcMain.on('mpv-set-sub', (_event, id: any) => {
     // ID can be a number or "no"
     sendCommand({ command: ['set_property', 'sid', id] })
  })

  ipcMain.on('mpv-adjust-sub-delay', (_event, seconds: number) => {
    sendCommand({ command: ['add', 'sub-delay', seconds] })
  })

  ipcMain.on('mpv-command', (_event, args: any[]) => {
      sendCommand({ command: args })
  })

  // ... (Other handlers are stateless or use sendCommand, they are fine)
  // Except those that reply to mainWindow?
  // Most handlers here just `sendCommand`. 
  // set-always-on-top uses mainWindow reference. WE NEED TO FIX THAT.
  
  ipcMain.removeAllListeners('set-always-on-top')
  ipcMain.on('set-always-on-top', (_event, value: boolean) => {
      hostWindow.setAlwaysOnTop(value) 
      // View doesn't need always-on-top, it's inside host.
  })

  // ... Update updateYtdl call below
  // ... Update updateYtdl call below
  ipcMain.removeAllListeners('mpv-update-ytdl')
  ipcMain.on('mpv-update-ytdl', () => {
    updateYtdl(uiSender, false)
  })

// Remote command handler - moved outside setupIpcHandlers to avoid closure issues
ipcMain.on('remote-command', (_event, action: string, value: any) => {
      // console.log('[MPV] Remote Command:', action, value)
      switch(action) {
          case 'play': sendCommand({ command: ['set_property', 'pause', false] }); break;
          case 'pause': sendCommand({ command: ['set_property', 'pause', true] }); break;
          case 'toggle': sendCommand({ command: ['cycle', 'pause'] }); break;
          case 'seek': sendCommand({ command: ['seek', value, 'relative'] }); break;
          case 'seek-to': sendCommand({ command: ['seek', value, 'absolute', 'exact'] }); break;
          case 'volume': 
              if (value === 'up') sendCommand({ command: ['add', 'volume', 5] });
              else if (value === 'down') sendCommand({ command: ['add', 'volume', -5] });
              else sendCommand({ command: ['set_property', 'volume', value] }); 
              break;
          case 'mute': sendCommand({ command: ['cycle', 'mute'] }); break;
          case 'toggle-fullscreen': 
              // Use the exported function from index.ts or send IPC
              ipcMain.emit('toggle-fullscreen', null);
              break;
          case 'init': 
              // Send full state using new API
              broadcastFullState()
              break;
          case 'loadfile':
              console.log('[MPV] Loading file from remote:', value)
              sendCommand({ command: ['loadfile', value, 'replace'] })
              break;
          case 'resume':
              // value matches the target position
              sendCommand({ command: ['seek', value, 'absolute', 'exact'] })
              if (globalUiSender) globalUiSender.send('remote-action', { action: 'resume-confirmed' })
              break;
          case 'dismiss-resume':
              if (globalUiSender) globalUiSender.send('remote-action', { action: 'resume-dismissed' })
              break;
          case 'quit':
              console.log('[MPV] Remote requested shutdown')
              app.quit()
              break;
          case 'command': sendCommand({ command: value }); break; 
          default: console.warn('[MPV] Unknown remote command:', action); break; 
      }
})

  // Shader Preset Handler
  ipcMain.removeAllListeners('mpv-set-shader-preset')
  ipcMain.on('mpv-set-shader-preset', (_event, preset: string) => {
    const resourcesPath = is.dev 
      ? join(process.cwd(), 'resources')
      : process.resourcesPath
    const shadersPath = join(resourcesPath, 'shaders')

    // Clear all existing shaders first
    sendCommand({ command: ['change-list', 'glsl-shaders', 'clr', ''] })

    if (preset === 'none') {
      console.log('[SHADERS] Cleared all shaders')
      if (!uiSender.isDestroyed()) uiSender.send('mpv-msg', '🎨 Shaders: Off')
      return
    }

    // Define shader chains for each preset
    const shaderChains: Record<string, string[]> = {
      // === ANIME PRESETS ===
      'anime-quality': [
        'Anime4K_Clamp_Highlights.glsl',
        'Anime4K_Restore_CNN_VL.glsl',
        'Anime4K_Upscale_CNN_x2_VL.glsl',
        'Anime4K_AutoDownscalePre_x2.glsl',
        'Anime4K_AutoDownscalePre_x4.glsl',
        'Anime4K_Upscale_CNN_x2_M.glsl'
      ],
      'anime-fast': [
        'Anime4K_Clamp_Highlights.glsl',
        'Anime4K_Restore_CNN_M.glsl',
        'Anime4K_Upscale_CNN_x2_M.glsl'
      ],
      'anime-perf': [
        'Anime4K_Clamp_Highlights.glsl',
        'Anime4K_Restore_CNN_S.glsl',
        'Anime4K_Upscale_CNN_x2_S.glsl'
      ],
      
      // === UNIVERSAL PRESETS ===
      'denoise': [
        'Anime4K_Denoise_Bilateral_Mode.glsl',
        'Anime4K_Deblur_DoG.glsl'
      ],
      'sharpen': [
        'Anime4K_Darken_HQ.glsl',
        'Anime4K_Thin_HQ.glsl',
        'Anime4K_Deblur_Original.glsl'
      ],
      'enhance': [
        'Anime4K_Clamp_Highlights.glsl',
        'Anime4K_Darken_HQ.glsl',
        'Anime4K_Deblur_DoG.glsl'
      ],
      
      // === MOVIE / LIVE-ACTION PRESETS ===
      'movie-lite': [
        'Anime4K_Denoise_Bilateral_Mean.glsl'
      ],
      'movie-balanced': [
        'Anime4K_Denoise_Bilateral_Mode.glsl',
        'Anime4K_Deblur_DoG.glsl',
        'Anime4K_Darken_Fast.glsl'
      ],
      'movie-quality': [
        'Anime4K_Clamp_Highlights.glsl',
        'Anime4K_Denoise_Bilateral_Mode.glsl',
        'Anime4K_Deblur_Original.glsl',
        'Anime4K_Darken_HQ.glsl',
        'Anime4K_Restore_CNN_M.glsl'
      ]
    }

    const presetNames: Record<string, string> = {
      // Universal
      'denoise': '🌐 Denoise',
      'sharpen': '🌐 Sharpen',
      'enhance': '🌐 Enhance',
      // Anime
      'anime-quality': '🎌 Anime Quality',
      'anime-fast': '🎌 Anime Balanced',
      'anime-perf': '🎌 Anime Lite',
      // Movies
      'movie-lite': '🎬 Movie Lite',
      'movie-balanced': '🎬 Movie Balanced',
      'movie-quality': '🎬 Movie Quality'
    }

    const shaders = shaderChains[preset]
    if (!shaders) {
      console.log('[SHADERS] Unknown preset:', preset)
      return
    }

    // Load each shader in the chain
    shaders.forEach(shader => {
      const shaderPath = join(shadersPath, shader)
      sendCommand({ command: ['change-list', 'glsl-shaders', 'append', shaderPath] })
    })

    console.log(`[SHADERS] Loaded preset: ${preset} (${shaders.length} shaders)`)
    if (!uiSender.isDestroyed()) {
      uiSender.send('mpv-msg', `🎨 ${presetNames[preset] || preset}`)
    }
  })
}

export function updateYtdl(uiSender: Electron.WebContents, silent: boolean) {
    console.log(`Checking for yt-dlp updates (Silent: ${silent})...`)
    if (!silent && !uiSender.isDestroyed()) uiSender.send('mpv-msg', '🔄 Updating engines...')

    const resourcesPath = is.dev 
      ? join(process.cwd(), 'resources')
      : process.resourcesPath
    const binPath = join(resourcesPath, 'bin')
    const ytdlPath = join(binPath, 'yt-dlp.exe')

    const updateProcess = spawn(ytdlPath, ['-U'])

    let output = ''

    updateProcess.stdout?.on('data', (data) => {
        output += data.toString()
    })

    updateProcess.on('close', (code) => {
      if (uiSender.isDestroyed()) return
      if (code === 0) {
        const wasUpdated = output.includes('Updated') || output.includes('updating')
        if (!silent) {
            uiSender.send('mpv-msg', '✅ Engines updated!')
        } else if (wasUpdated) {
            uiSender.send('mpv-msg', '✅ Engines Auto-Updated')
        }
      } else {
        if (!silent) uiSender.send('mpv-msg', `Update refresh (Code ${code})`)
      }
    })

    updateProcess.on('error', (err) => {
      if (!silent && !uiSender.isDestroyed()) uiSender.send('mpv-msg', '❌ Update error')
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

export function sendCommand(data: Record<string, any>): void {
  if (ipcSocket && !ipcSocket.destroyed && !ipcSocket.connecting) {
    const json = JSON.stringify(data)
    console.log('[IPC-SEND]', json) // Log all sent commands
    try {
        ipcSocket.write(json + '\n')
    } catch(err) {
        console.error('[IPC-FAIL] Write error:', err)
    }
  } else {
    // Queue command if socket not ready
    console.log('[IPC-QUEUE] Socket not ready, queueing command:', data)
    commandQueue.push(data)
  }
}
