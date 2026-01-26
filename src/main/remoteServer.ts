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
import { ipcMain, BrowserWindow, app as electronApp } from 'electron'
import * as fs from 'fs'
import { spawn, ChildProcess, exec } from 'child_process'
import { initWatchParty, setupPartySocketHandlers } from './watchPartyServer'

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
let uiSenderRef: Electron.WebContents | null = null  // Reference to UI for sending updates

// Track Watch Party sockets (they don't count as Remote clients)
const watchPartySocketIds = new Set<string>()

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
 * Send shutdown confirmation to connected clients
 * This allows the client to wait until the player actually closes before disconnecting
 */
export function sendShutdownAck(): void {
  if (io) {
    console.log('[Remote] Sending shutdown ACKnowledgment to clients')
    io.emit('shutdown-confirmed')
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

  // If clearing file, reset player state to empty/stopped
  if (filePath === null) {
      updatePlayerState({
          filename: '',
          time: 0,
          duration: 0,
          paused: true,
          tracks: []
      })
  }
  
  // Notify clients that streaming is available
  if (io) {
    if (filePath) {
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
    } else {
        // Not available
        io.emit('stream-available', { available: false, native: false, needsTranscode: false })
    }
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
  // Wake the app window when a client connects
  ipcMain.emit('remote-wake')

  console.log('[Remote] Client connected:', socket.id)
  connectedClients++
  
  if (!uiSender.isDestroyed()) {
    uiSender.send('remote-client-connected', { count: connectedClients })
  }
  
  // Send full state immediately on connection
  socket.emit('full-state', playerState)
  socket.emit('status', { connected: true, deviceName: playerState.deviceName })

  // Handle remote commands
  socket.on('remote-command', (data: { action: string, value?: any }) => {
    console.log(`[Remote] Raw Command Received:`, JSON.stringify(data))
    
    // Broadcast to MPV controller via IPC
    // We send this to the main process logic which then talks to MPV
    electronApp.emit('remote-command', data)
  })
  
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

  // Listen for resume prompt sync from frontend

  
  // Handle ping for latency check
  socket.on('ping-remote', (timestamp: number) => {
    socket.emit('pong-remote', timestamp)
  })


  // System Settings Handlers
  socket.on('get-sys-info', () => {
    const loginSettings = electronApp.getLoginItemSettings()
    socket.emit('sys-info', { 
      autoLaunch: loginSettings.openAtLogin,
      version: electronApp.getVersion() 
    })
  })

  socket.on('toggle-autolaunch', (enable: boolean) => {
    electronApp.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: enable, // Start minimized if auto-launching
      path: process.execPath,
      args: ['--hidden']
    })
    
    // Check if applied
    const newSettings = electronApp.getLoginItemSettings()
    socket.emit('sys-info', { 
      autoLaunch: newSettings.openAtLogin,
      version: electronApp.getVersion()
    })
  })
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('[Remote] Client disconnected:', reason)
    
    // Only decrement if this is NOT a Watch Party socket
    // (Watch Party sockets were already excluded from the count)
    if (!watchPartySocketIds.has(socket.id)) {
      connectedClients--
      if (!uiSender.isDestroyed()) {
        uiSender.send('remote-client-disconnected', { count: connectedClients })
      }
    } else {
      // Clean up the Watch Party tracking
      watchPartySocketIds.delete(socket.id)
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

  // Store reference to uiSender for use in markSocketAsWatchParty
  uiSenderRef = uiSender

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

  // Initialize Watch Party system
  initWatchParty(io)

  // Listen for resume prompt sync from frontend (Moved here to avoid duplicate listeners)
  ipcMain.removeAllListeners('sync-resume-state')
  ipcMain.on('sync-resume-state', (_event, state) => {
      // Broadcast to mobile clients
      if (io) {
        io.emit('resume-prompt', state)
      }
  })

  // Serve static files for remote webapp
  const resourcesPath = is.dev 
    ? join(process.cwd(), 'resources', 'remote')
    : join(process.resourcesPath, 'remote')
  
  app.use(express.static(resourcesPath))

  // Handle Room IDs (e.g. /NP-ABCD-1234) - Serve dedicated Watch Party page
  // This is separate from the Remote Control page (index.html)
  app.get(/^\/NP-[A-Z0-9-]+$/, (_req, res) => {
    res.sendFile(join(resourcesPath, 'party.html'))
  })

  // Root route
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
      // Clean up old files, but skip files that are busy (in use)
      fs.readdirSync(hlsDir).forEach(f => {
        try {
          fs.unlinkSync(join(hlsDir, f))
        } catch (e: any) {
          // Ignore EBUSY errors - file is still being used, will be cleaned up later
          if (e.code !== 'EBUSY') {
            console.warn('[Remote] Could not delete:', f, e.code)
          }
        }
      })
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
      
      // HLS settings - optimized for Watch Party seeking
      '-f', 'hls',
      '-hls_time', '2',                  // 2 second segments for more precise seeking
      '-hls_list_size', '0',             // Keep ALL segments in playlist (enables full seeking)
      '-hls_flags', 'split_by_time+append_list', // Don't delete old segments, allow seeking back
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

  // API: Get Defaults (Platform Paths)
  app.get('/api/defaults', (req, res) => {
    try {
        res.json({
            downloads: electronApp.getPath('downloads'),
            documents: electronApp.getPath('documents'),
            home: electronApp.getPath('home')
        })
    } catch (e) {
        console.error('[Remote] Failed to get default paths:', e)
        res.status(500).json({ error: 'Failed' })
    }
  })

  // API: List Drives
  app.get('/api/drives', (req, res) => {
    // Use PowerShell for reliable JSON output, avoids locale parsing issues
    const cmd = 'powershell "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Description | ConvertTo-Json"'
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('[Remote] Failed to list drives:', error)
        // Fallback to basic drives if PS fails
        return res.json([
            { name: 'C:', description: 'System Drive' },
            { name: 'D:', description: 'Local Disk' }
        ])
      }
      
      try {
        let drives = JSON.parse(stdout)
        // If only one drive, PS returns an object, not array
        if (!Array.isArray(drives)) {
            drives = [drives]
        }
        res.json(drives.map((d: { Name: string; Description: any }) => ({
            name: d.Name + ':', // PS returns "C", we want "C:"
            description: d.Description || 'Local Disk'
        })))
      } catch (e) {
        console.error('[Remote] Failed to parse drive headers:', e)
        res.status(500).json({ error: 'Failed to parse drives' })
      }
    })
  })

  // API: List Files
  app.get('/api/files', (req, res) => {
    const dirPath = req.query.path as string
    
    if (!dirPath) {
      return res.status(400).json({ error: 'Path is required' })
    }

    // Security check? For now, we allow full access as it's a remote admin tool
    
    try {
      if (!fs.existsSync(dirPath)) {
        return res.status(404).json({ error: 'Path not found' })
      }

      const parent = join(dirPath, '..')
      const items = fs.readdirSync(dirPath, { withFileTypes: true })
        .map(dirent => {
          // Skip hidden/system files if starts with . or $
          if (dirent.name.startsWith('.') || dirent.name.startsWith('$') || dirent.name === 'System Volume Information') return null
          
          return {
            name: dirent.name,
            path: join(dirPath, dirent.name),
            isDir: dirent.isDirectory(),
            // Simple extension check for video files
            isVideo: !dirent.isDirectory() && ALL_VIDEO_FORMATS.includes(extname(dirent.name).toLowerCase())
          }
        })
        .filter(item => item !== null)
        .sort((a, b) => {
          if (a.isDir && !b.isDir) return -1
          if (!a.isDir && b.isDir) return 1
          return a.name.localeCompare(b.name)
        })
        
      res.json({
        path: dirPath,
        parent: parent === dirPath ? null : parent,
        items
      })
    } catch (e) {
      console.error('[Remote] Read dir error:', e)
      res.status(500).json({ error: 'Failed to read directory' })
    }
  })


  // Socket.io connection handler
  io.on('connection', async (socket) => {
    setupSocketHandlers(socket, uiSender)
    
    // Setup Watch Party handlers
    const ips = await resolveBestIps()
    const hostIp = ips[0] || '127.0.0.1'
    setupPartySocketHandlers(socket, hostIp, PORT)
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

// Mark a socket as Watch Party (so it doesn't count as Remote client)
export function markSocketAsWatchParty(socketId: string): void {
  if (!watchPartySocketIds.has(socketId)) {
    watchPartySocketIds.add(socketId)
    // Decrement the counter since this socket was already counted on connect
    if (connectedClients > 0) {
      connectedClients--
      // Notify UI of the corrected count
      if (uiSenderRef && !uiSenderRef.isDestroyed()) {
        uiSenderRef.send('remote-client-disconnected', { count: connectedClients })
      }
    }
  }
}

// Unmark a socket (called when leaving Watch Party)
export function unmarkSocketAsWatchParty(socketId: string): void {
  watchPartySocketIds.delete(socketId)
}
