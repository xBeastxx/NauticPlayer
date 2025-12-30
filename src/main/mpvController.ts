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
  
  // Path to mpv.exe
  const mpvPath = is.dev 
    ? join(process.cwd(), 'resources', 'mpv', 'mpv.exe')
    : join(process.resourcesPath, 'mpv', 'mpv.exe')
  
  console.log('MPV Path:', mpvPath)
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
    '--panscan=1.0', // Zoom to fill - eliminates tiny gaps/borders if aspect ratio has minor mismatch
    '--image-display-duration=inf',
    '--loop-file=inf' // Loop for testing
  ]
  
  // Spawn MPV process
  mpvProcess = spawn(mpvPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
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
    // Observe video dimensions for auto-resize
    sendCommand({ command: ['observe_property', 5, 'video-out-params'] })
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
      case 'video-out-params':
        if (msg.data && msg.data.w && msg.data.h) {
          resizeWindowToVideo(mainWindow, msg.data.w, msg.data.h)
        }
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

function sendCommand(cmd: any): void {
  if (ipcSocket && ipcSocket.writable) {
    ipcSocket.write(JSON.stringify(cmd) + '\n')
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
  
  ipcMain.on('mpv-seek', (_event, seconds: number) => {
    sendCommand({ command: ['seek', seconds, 'absolute'] })
  })
  
  ipcMain.on('mpv-volume', (_event, volume: number) => {
    sendCommand({ command: ['set_property', 'volume', volume] })
  })
  
  ipcMain.on('mpv-mute', (_event, muted: boolean) => {
    sendCommand({ command: ['set_property', 'mute', muted] })
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
