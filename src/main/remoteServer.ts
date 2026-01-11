/**
 * Nautic Remote Server
 * Real-time streaming control and video casting from mobile devices
 */

import express from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'
import os from 'os'
import dgram from 'dgram'
import { join, extname } from 'path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, ipcMain, app as electronApp } from 'electron'
import * as fs from 'fs'
import { spawn, ChildProcess } from 'child_process'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TrackInfo {
  id: number
  type: 'video' | 'audio' | 'sub'
  title?: string
  lang?: string
  selected: boolean
}

export interface PlayerState {
  // Playback
  time: number
  duration: number
  paused: boolean
  
  // Audio
  volume: number
  muted: boolean
  
  // Media Info
  filename: string
  tracks: TrackInfo[]
  
  // Connection
  connected: boolean
  deviceName: string
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Unified player state - single source of truth
const playerState: PlayerState = {
  time: 0,
  duration: 0,
  paused: true,
  volume: 100,
  muted: false,
  filename: 'No Media',
  tracks: [],
  connected: true,
  deviceName: 'NauticPlayer PC'
}

// Server instances
let app: express.Express | null = null
let server: http.Server | null = null
let io: Server | null = null
let PORT = 5678
let connectedClients = 0

// Current file being played (for streaming)
let currentFilePath: string | null = null

// Heartbeat interval
let heartbeatInterval: NodeJS.Timeout | null = null
const HEARTBEAT_MS = 3000 // Send state every 3 seconds

// Supported video formats for browser playback (no transcoding needed)
const BROWSER_PLAYABLE = ['.mp4', '.webm', '.ogg', '.mov']

// All video formats we can transcode
const ALL_VIDEO_FORMATS = ['.mp4', '.mkv', '.avi', '.wmv', '.flv', '.webm', '.mov', '.m4v', '.ts', '.m2ts', '.mpg', '.mpeg', '.3gp']

// FFmpeg transcoding process
let transcodeProcess: ChildProcess | null = null

// ============================================================================
// STATE API (Used by mpvController)
// ============================================================================

/**
 * Update player state and broadcast to all connected clients
 */
export function updatePlayerState(updates: Partial<PlayerState>): void {
  // Merge updates into state
  Object.assign(playerState, updates)
  
  // Broadcast only the changed properties for efficiency
  if (io) {
    io.emit('state-update', updates)
  }
}

/**
 * Get current player state (for initial sync)
 */
export function getPlayerState(): PlayerState {
  return { ...playerState }
}

/**
 * Broadcast full state to all clients (used for sync)
 */
export function broadcastFullState(): void {
  if (io) {
    io.emit('full-state', playerState)
  }
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use updatePlayerState instead
 */
export function broadcastState(state: Partial<PlayerState>): void {
  updatePlayerState(state)
}

/**
 * Set the current file path for video streaming
 */
export function setCurrentFile(filePath: string | null): void {
  currentFilePath = filePath
  console.log('[Remote] Current file set to:', filePath)
  
  // Kill any existing transcode process
  if (transcodeProcess) {
    transcodeProcess.kill()
    transcodeProcess = null
  }
  
  // Notify clients that streaming is available
  if (io && filePath) {
    const ext = extname(filePath).toLowerCase()
    const isNativePlayable = BROWSER_PLAYABLE.includes(ext)
    const canTranscode = ALL_VIDEO_FORMATS.includes(ext)
    
    io.emit('stream-available', { 
      available: isNativePlayable || canTranscode,
      native: isNativePlayable,
      needsTranscode: !isNativePlayable && canTranscode,
      filename: playerState.filename,
      format: ext.replace('.', '').toUpperCase()
    })
  }
}

/**
 * Get current file path
 */
export function getCurrentFile(): string | null {
  return currentFilePath
}

// ============================================================================
// NETWORK UTILITIES
// ============================================================================

export function getLocalIps(): string[] {
  const ips: string[] = []
  const ifaces = os.networkInterfaces()
  
  Object.keys(ifaces).forEach((ifname) => {
    ifaces[ifname]?.forEach((iface) => {
      if ('IPv4' !== iface.family || iface.internal !== false) return
      ips.push(iface.address)
    })
  })

  // Sort: 192.168... first (home wifi)
  return ips.sort((a, b) => {
    const aIsHome = a.startsWith('192.168')
    const bIsHome = b.startsWith('192.168')
    if (aIsHome && !bIsHome) return -1
    if (!aIsHome && bIsHome) return 1
    return 0
  })
}

export async function getPrimaryIp(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    socket.on('error', () => {
      resolve(null)
      try { socket.close() } catch(e) { /* ignore */ }
    })
    try {
      socket.connect(80, '8.8.8.8', () => {
        const addr = socket.address().address
        socket.close()
        resolve(addr)
      })
    } catch(e) { 
      resolve(null) 
    }
  })
}

export async function resolveBestIps(): Promise<string[]> {
  const allIps = getLocalIps()
  const primary = await getPrimaryIp()
  if (primary) {
    const idx = allIps.indexOf(primary)
    if (idx !== -1) allIps.splice(idx, 1)
    allIps.unshift(primary)
  }
  return [...new Set(allIps)]
}

// ============================================================================
// SOCKET.IO HANDLERS
// ============================================================================

function setupSocketHandlers(socket: Socket, uiSender: Electron.WebContents): void {
  console.log('[Remote] Client connected:', socket.id)
  connectedClients++
  
  if (!uiSender.isDestroyed()) {
    uiSender.send('remote-client-connected', { count: connectedClients })
  }
  
  // Send full state immediately on connection
  socket.emit('full-state', playerState)
  socket.emit('status', { connected: true, deviceName: playerState.deviceName })
  
  // Handle commands from mobile
  socket.on('cmd', (data: { action: string; value?: any }) => {
    console.log('[Remote] Command:', data)
    const { action, value } = data
    
    // Forward to MPV via internal IPC
    ipcMain.emit('remote-command', null, action, value)
  })
  
  // Handle state request (manual sync)
  socket.on('request-state', () => {
    console.log('[Remote] State requested by client')
    socket.emit('full-state', playerState)
  })
  
  // Handle ping for latency check
  socket.on('ping-remote', (timestamp: number) => {
    socket.emit('pong-remote', timestamp)
  })
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('[Remote] Client disconnected:', reason)
    connectedClients--
    if (!uiSender.isDestroyed()) {
      uiSender.send('remote-client-disconnected', { count: connectedClients })
    }
  })
}

// ============================================================================
// SERVER LIFECYCLE
// ============================================================================

export function startRemoteServer(uiSender: Electron.WebContents, _mpvWindow: BrowserWindow) {
  if (server) {
    return { port: PORT, ips: getLocalIps() }
  }

  app = express()
  server = http.createServer(app)
  
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    // Allow both transports, don't force order
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    pingTimeout: 20000,
    pingInterval: 10000,
    // Important: allow EIO3 for older clients
    allowEIO3: true
  })

  // Serve static files for remote webapp
  const resourcesPath = is.dev 
    ? join(process.cwd(), 'resources', 'remote')
    : join(process.resourcesPath, 'remote')
  
  app.use(express.static(resourcesPath))

  // Fallback route
  app.get('/', (_req, res) => {
    res.sendFile(join(resourcesPath, 'index.html'))
  })

  // ============================================
  // VIDEO STREAMING ENDPOINTS
  // ============================================
  
  // Get stream info
  app.get('/stream-info', (_req, res) => {
    if (!currentFilePath || !fs.existsSync(currentFilePath)) {
      return res.status(404).json({ error: 'No file loaded', available: false })
    }
    
    const ext = extname(currentFilePath).toLowerCase()
    const isNativePlayable = BROWSER_PLAYABLE.includes(ext)
    const canTranscode = ALL_VIDEO_FORMATS.includes(ext)
    const stat = fs.statSync(currentFilePath)
    
    res.json({
      available: isNativePlayable || canTranscode,
      native: isNativePlayable,
      needsTranscode: !isNativePlayable && canTranscode,
      filename: playerState.filename,
      format: ext.replace('.', '').toUpperCase(),
      size: stat.size,
      duration: playerState.duration,
      currentTime: playerState.time,
      paused: playerState.paused
    })
  })
  
  // Stream video file with range request support
  app.get('/stream', (req, res) => {
    if (!currentFilePath || !fs.existsSync(currentFilePath)) {
      return res.status(404).send('No file loaded')
    }
    
    const ext = extname(currentFilePath).toLowerCase()
    if (!BROWSER_PLAYABLE.includes(ext)) {
      return res.status(415).send('Format not supported for browser playback')
    }
    
    const stat = fs.statSync(currentFilePath)
    const fileSize = stat.size
    const range = req.headers.range
    
    // Content type mapping
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime'
    }
    const contentType = mimeTypes[ext] || 'video/mp4'
    
    if (range) {
      // Handle range request (for seeking)
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = (end - start) + 1
      
      const file = fs.createReadStream(currentFilePath, { start, end })
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      })
      
      file.pipe(res)
    } else {
      // Full file request
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      })
      
      fs.createReadStream(currentFilePath).pipe(res)
    }
  })
  
  // Stream video with FFmpeg transcoding for non-native formats
  app.get('/stream-transcode', (req, res) => {
    if (!currentFilePath || !fs.existsSync(currentFilePath)) {
      return res.status(404).send('No file loaded')
    }
    
    // Clean up any existing transcode process
    if (transcodeProcess) {
      transcodeProcess.kill()
      transcodeProcess = null
    }

    // Ensure HLS directory exists and is empty
    const hlsDir = join(electronApp.getPath('userData'), 'hls-stream')
    if (fs.existsSync(hlsDir)) {
      try {
        fs.readdirSync(hlsDir).forEach(f => fs.unlinkSync(join(hlsDir, f)))
      } catch (e) {
        console.error('[Remote] Failed to clean HLS dir:', e)
      }
    } else {
      fs.mkdirSync(hlsDir, { recursive: true })
    }

    // Get FFmpeg path
    const ffmpegPath = is.dev 
      ? join(__dirname, '../../resources/bin/ffmpeg.exe')
      : join(process.resourcesPath, 'bin/ffmpeg.exe')
    
    if (!fs.existsSync(ffmpegPath)) {
      console.error('[Remote] FFmpeg not found at:', ffmpegPath)
      return res.status(500).send('FFmpeg not available')
    }

    // Get start time from query param (for seeking)
    const startTime = parseFloat(req.query.t as string) || 0
    
    console.log('[Remote] Starting HLS transcode from', startTime, 'seconds')
    console.log('[Remote] Output dir:', hlsDir)
    
    const playlistPath = join(hlsDir, 'playlist.m3u8')
    const maxBitrate = 2000000 // 2Mbps cap for mobile
    
    // FFmpeg args for HLS streaming (Standard mobile streaming)
    const ffmpegArgs = [
      '-ss', startTime.toString(),       // Seek start
      '-i', currentFilePath,             // Input
      
      // Video settings
      '-c:v', 'libx264',                 // H.264
      '-preset', 'veryfast',             // Balance speed/quality
      '-tune', 'zerolatency',            // Low latency
      '-profile:v', 'baseline',          // Max compatibility
      '-level', '3.0',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=-2:480',             // 480p
      '-b:v', '1500k',
      '-maxrate', '2000k',
      '-bufsize', '4000k',
      '-g', '30',                        // Keyframe every 1s
      '-keyint_min', '30',
      '-sc_threshold', '0',
      
      // Audio settings
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '44100',
      
      // HLS settings
      '-f', 'hls',
      '-hls_time', '4',                  // 4 second segments
      '-hls_list_size', '5',             // Keep 5 segments in playlist
      '-hls_flags', 'delete_segments+split_by_time',
      '-hls_segment_filename', join(hlsDir, 'segment_%03d.ts'),
      playlistPath
    ]
    
    console.log('[Remote] FFmpeg args:', ffmpegArgs.join(' '))
    
    transcodeProcess = spawn(ffmpegPath, ffmpegArgs)
    
    transcodeProcess.stderr?.on('data', (data) => {
      const msg = data.toString()
      // console.log('[FFmpeg]', msg) // Optional: too verbose
    })
    
    transcodeProcess.on('close', (code) => {
      console.log('[Remote] FFmpeg process closed with code:', code)
      transcodeProcess = null
    })

    // Wait for playlist to be created before responding
    let checks = 0
    const checkPlaylist = setInterval(() => {
      if (fs.existsSync(playlistPath)) {
        clearInterval(checkPlaylist)
        res.json({ 
          url: '/hls/playlist.m3u8',
          ready: true 
        })
      } else {
        checks++
        if (checks > 20) { // Timeout after 10s
          clearInterval(checkPlaylist)
          if (transcodeProcess) transcodeProcess.kill()
          res.status(500).json({ error: 'Transcoding timeout' })
        }
      }
    }, 500)
    
    // Clean up on client disconnect is tricky with HLS because client polling
    // We rely on "new file loaded" or "stop" command to kill process
  })

  // Serve HLS files
  app.use('/hls', (req, res, next) => {
    const hlsDir = join(electronApp.getPath('userData'), 'hls-stream')
    // Check if cleaning up? No, express static handles serving
    next()
  }, express.static(join(electronApp.getPath('userData'), 'hls-stream')))

  // Socket.io connection handler
  io.on('connection', (socket) => {
    setupSocketHandlers(socket, uiSender)
  })

  // Start heartbeat (broadcast time position regularly for smooth sync)
  if (heartbeatInterval) clearInterval(heartbeatInterval)
  heartbeatInterval = setInterval(() => {
    if (io && connectedClients > 0) {
      // Only send time updates during playback for smooth seek bar
      if (!playerState.paused && playerState.duration > 0) {
        io.emit('state-update', { time: playerState.time })
      }
    }
  }, HEARTBEAT_MS)

  // Start listening
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Remote] Server running at http://0.0.0.0:${PORT}`)
    if (!uiSender.isDestroyed()) {
      resolveBestIps().then(ips => {
        uiSender.send('remote-server-ready', { 
          ips, 
          port: PORT,
          url: `http://${ips[0]}:${PORT}` 
        })
      })
    }
  })

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.log('[Remote] Port busy, retrying...')
      PORT++
      server?.close()
      server = null
      io = null
      startRemoteServer(uiSender, _mpvWindow)
    }
  })

  return { port: PORT, ips: getLocalIps() }
}

export function stopRemoteServer(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
  if (io) {
    io.close()
    io = null
  }
  if (server) {
    server.close()
    server = null
  }
  app = null
  connectedClients = 0
}

export function getConnectedClients(): number {
  return connectedClients
}
