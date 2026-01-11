/**
 * Nautic Remote Server - Complete Rewrite
 * Real-time streaming control from mobile devices via Socket.io
 */

import express from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'
import os from 'os'
import dgram from 'dgram'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, ipcMain } from 'electron'

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

// Heartbeat interval
let heartbeatInterval: NodeJS.Timeout | null = null
const HEARTBEAT_MS = 3000 // Send state every 3 seconds

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
