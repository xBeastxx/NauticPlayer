/**
 * Watch Party Server
 * P2P synchronized video watching for NauticPlayer
 */

import { Server, Socket } from 'socket.io'
import { randomBytes } from 'crypto'
import { startTunnel, stopTunnel, getTunnelUrl, isCloudflaredInstalled } from './tunnelManager'
import { markSocketAsWatchParty } from './remoteServer'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PartyGuest {
  socketId: string
  name: string
  joinedAt: number
}

export interface PartyRoom {
  id: string
  hostSocketId: string
  hostName: string
  guests: Map<string, PartyGuest>
  createdAt: number
  
  // Media state
  filename: string
  duration: number
  currentTime: number
  paused: boolean
  
  // Stream info (for guests to connect to host's stream)
  streamUrl: string | null
  
  // Internet access
  tunnelUrl: string | null  // Cloudflare tunnel URL for internet access
  localUrl: string | null   // Local network URL
}

export interface PartyAction {
  type: 'play' | 'pause' | 'seek' | 'sync'
  time?: number
  fromHost: boolean
}

export interface PartyInfo {
  roomId: string
  hostName: string
  guestCount: number
  maxGuests: number
  filename: string
  isStreaming: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_GUESTS = 5
const ROOM_ID_PREFIX = 'NP'
const SYNC_TOLERANCE_MS = 2000 // Resync if time differs by more than 2s

// ============================================================================
// STATE
// ============================================================================

// Active party rooms
const rooms = new Map<string, PartyRoom>()

// Socket to room mapping (for quick lookup on disconnect)
const socketToRoom = new Map<string, string>()

// Reference to Socket.io server (set by init)
let io: Server | null = null

// ============================================================================
// ROOM ID GENERATION
// ============================================================================

/**
 * Generate a unique room ID in format: NP-XXXX-XXXX
 */
function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid confusing chars (0/O, 1/I/L)
  let id = ROOM_ID_PREFIX + '-'
  
  for (let i = 0; i < 8; i++) {
    if (i === 4) id += '-'
    id += chars[randomBytes(1)[0] % chars.length]
  }
  
  // Ensure uniqueness
  if (rooms.has(id)) {
    return generateRoomId()
  }
  
  return id
}

// ============================================================================
// ROOM MANAGEMENT
// ============================================================================

/**
 * Initialize the watch party system with Socket.io server reference
 */
export function initWatchParty(socketIo: Server): void {
  io = socketIo
  console.log('[WatchParty] Initialized')
}

/**
 * Create a new watch party room
 */
export function createRoom(
  hostSocketId: string, 
  hostName: string,
  filename: string,
  duration: number,
  currentTime: number,
  streamUrl: string | null,
  localUrl: string | null = null,
  tunnelUrl: string | null = null
): PartyRoom {
  const roomId = generateRoomId()
  
  const room: PartyRoom = {
    id: roomId,
    hostSocketId,
    hostName,
    guests: new Map(),
    createdAt: Date.now(),
    filename,
    duration,
    currentTime,
    paused: true,
    streamUrl,
    localUrl,
    tunnelUrl
  }
  
  rooms.set(roomId, room)
  socketToRoom.set(hostSocketId, roomId)
  
  console.log(`[WatchParty] Room created: ${roomId} by ${hostName}`)
  
  return room
}

/**
 * Join an existing party room
 */
export function joinRoom(
  roomId: string, 
  guestSocketId: string, 
  guestName: string
): { success: boolean; error?: string; room?: PartyRoom } {
  const room = rooms.get(roomId)
  
  if (!room) {
    return { success: false, error: 'Room not found' }
  }
  
  if (room.guests.size >= MAX_GUESTS) {
    return { success: false, error: 'Room is full (max 5 guests)' }
  }
  
  // Check if already in room
  if (room.guests.has(guestSocketId)) {
    return { success: false, error: 'Already in this room' }
  }
  
  const guest: PartyGuest = {
    socketId: guestSocketId,
    name: guestName,
    joinedAt: Date.now()
  }
  
  room.guests.set(guestSocketId, guest)
  socketToRoom.set(guestSocketId, roomId)
  
  console.log(`[WatchParty] ${guestName} joined room ${roomId}`)
  
  // Notify host and other guests
  if (io) {
    io.to(room.hostSocketId).emit('party:guest-joined', {
      name: guestName,
      guestCount: room.guests.size
    })
    
    // Notify other guests
    room.guests.forEach((g, socketId) => {
      if (socketId !== guestSocketId) {
        io!.to(socketId).emit('party:guest-joined', {
          name: guestName,
          guestCount: room.guests.size
        })
      }
    })
  }
  
  return { success: true, room }
}

/**
 * Leave a party room (guest)
 */
export function leaveRoom(socketId: string): void {
  const roomId = socketToRoom.get(socketId)
  if (!roomId) return
  
  const room = rooms.get(roomId)
  if (!room) {
    socketToRoom.delete(socketId)
    return
  }
  
  // Check if this is the host
  if (room.hostSocketId === socketId) {
    // Host left - close the entire room
    closeRoom(roomId, 'Host left the party')
    return
  }
  
  // Remove guest
  const guest = room.guests.get(socketId)
  if (guest) {
    room.guests.delete(socketId)
    socketToRoom.delete(socketId)
    
    console.log(`[WatchParty] ${guest.name} left room ${roomId}`)
    
    // Notify host and remaining guests
    if (io) {
      io.to(room.hostSocketId).emit('party:guest-left', {
        name: guest.name,
        guestCount: room.guests.size
      })
      
      room.guests.forEach((_, guestSocketId) => {
        io!.to(guestSocketId).emit('party:guest-left', {
          name: guest.name,
          guestCount: room.guests.size
        })
      })
    }
  }
}

/**
 * Close a party room (host only)
 */
export function closeRoom(roomId: string, reason: string = 'Party ended'): void {
  const room = rooms.get(roomId)
  if (!room) return
  
  console.log(`[WatchParty] Closing room ${roomId}: ${reason}`)
  
  // Stop tunnel if it was running for this room
  if (room.tunnelUrl) {
    console.log('[WatchParty] Stopping tunnel for closed room')
    stopTunnel()
  }
  
  // Notify all guests
  if (io) {
    room.guests.forEach((guest, socketId) => {
      io!.to(socketId).emit('party:closed', { reason })
      socketToRoom.delete(socketId)
    })
  }
  
  // Clean up
  socketToRoom.delete(room.hostSocketId)
  rooms.delete(roomId)
}

/**
 * Get room info (public info, safe to share)
 */
export function getRoomInfo(roomId: string): PartyInfo | null {
  const room = rooms.get(roomId)
  if (!room) return null
  
  return {
    roomId: room.id,
    hostName: room.hostName,
    guestCount: room.guests.size,
    maxGuests: MAX_GUESTS,
    filename: room.filename,
    isStreaming: room.streamUrl !== null
  }
}

/**
 * Get full room data (internal use)
 */
export function getRoom(roomId: string): PartyRoom | null {
  return rooms.get(roomId) || null
}

/**
 * Get room by socket ID
 */
export function getRoomBySocket(socketId: string): PartyRoom | null {
  const roomId = socketToRoom.get(socketId)
  if (!roomId) return null
  return rooms.get(roomId) || null
}

/**
 * Check if socket is a host
 */
export function isHost(socketId: string): boolean {
  const room = getRoomBySocket(socketId)
  return room ? room.hostSocketId === socketId : false
}

// ============================================================================
// SYNC ACTIONS
// ============================================================================

/**
 * Broadcast an action from host to all guests
 */
export function broadcastAction(roomId: string, action: PartyAction): void {
  const room = rooms.get(roomId)
  if (!room || !io) return
  
  // Update room state
  if (action.type === 'play') {
    room.paused = false
  } else if (action.type === 'pause') {
    room.paused = true
  }
  
  if (action.time !== undefined) {
    room.currentTime = action.time
  }
  
  // Broadcast to all guests
  room.guests.forEach((_, socketId) => {
    io!.to(socketId).emit('party:action', action)
  })
  
  console.log(`[WatchParty] Action broadcasted in ${roomId}: ${action.type}`)
}

/**
 * Update room state (called by host periodically)
 */
export function updateRoomState(roomId: string, time: number, paused: boolean): void {
  const room = rooms.get(roomId)
  if (!room) return
  
  room.currentTime = time
  room.paused = paused
}

/**
 * Get current sync state for a room
 */
export function getSyncState(roomId: string): { time: number; paused: boolean } | null {
  const room = rooms.get(roomId)
  if (!room) return null
  
  return {
    time: room.currentTime,
    paused: room.paused
  }
}

/**
 * Check if time is out of sync
 */
export function isOutOfSync(roomId: string, clientTime: number): boolean {
  const room = rooms.get(roomId)
  if (!room) return false
  
  return Math.abs(room.currentTime - clientTime) * 1000 > SYNC_TOLERANCE_MS
}

// ============================================================================
// SOCKET HANDLERS
// ============================================================================

/**
 * Setup socket handlers for a connected client
 */
export function setupPartySocketHandlers(socket: Socket, hostIp: string, port: number): void {
  // Create a party (host)
  socket.on('party:create', async (data: { 
    name: string; 
    filename: string; 
    duration: number; 
    currentTime: number;
    enableInternet?: boolean;  // Request internet access via tunnel
  }, callback) => {
    // Check if already hosting
    const existingRoom = getRoomBySocket(socket.id)
    if (existingRoom && existingRoom.hostSocketId === socket.id) {
      callback({ success: false, error: 'Already hosting a party' })
      return
    }
    
    // Build stream URL for guests
    const streamUrl = `http://${hostIp}:${port}/stream`
    const localUrl = `http://${hostIp}:${port}`
    
    let tunnelUrl: string | null = null
    let publicShareUrl: string | null = null
    
    // If internet access requested, start Cloudflare tunnel
    console.log('[WatchParty] enableInternet:', data.enableInternet)
    if (data.enableInternet) {
      console.log('[WatchParty] Internet access requested, starting tunnel...')
      const tunnelResult = await startTunnel(port)
      if (tunnelResult.success && tunnelResult.url) {
        tunnelUrl = tunnelResult.url
        console.log('[WatchParty] Tunnel started:', tunnelUrl)
      } else {
        console.warn('[WatchParty] Tunnel failed:', tunnelResult.error)
        // Continue without tunnel - local still works
      }
    }
    
    const room = createRoom(
      socket.id,
      data.name || 'Host',
      data.filename,
      data.duration,
      data.currentTime,
      streamUrl,
      localUrl,
      tunnelUrl
    )
    
    // Mark the HOST socket as Watch Party (so it doesn't activate the Remote icon)
    markSocketAsWatchParty(socket.id)
    
    // Build share URLs
    const localShareUrl = `nauticplayer://party/${room.id}?host=${hostIp}&port=${port}`
    if (tunnelUrl) {
      // Extract hostname from tunnel URL for share link
      publicShareUrl = `${tunnelUrl}/${room.id}`
    }
    
    callback({ 
      success: true, 
      roomId: room.id,
      shareUrl: localShareUrl,
      publicShareUrl: publicShareUrl,  // For internet sharing
      shareCode: room.id,
      tunnelActive: tunnelUrl !== null
    })
  })
  
  // Join a party (guest)
  socket.on('party:join', (data: { roomId: string; name: string }, callback) => {
    const result = joinRoom(data.roomId, socket.id, data.name || 'Guest')
    
    if (result.success && result.room) {
      // Mark this socket as Watch Party (not Remote client)
      markSocketAsWatchParty(socket.id)
      
      // Build stream URLs - guest might be on LAN or Internet
      const localStreamUrl = result.room.streamUrl // http://192.168.x.x:5678/stream
      
      // For Internet guests, use HLS which works better through tunnels and is more compatible
      // MPV can play HLS natively, so this works for both desktop and mobile guests
      const tunnelHlsUrl = result.room.tunnelUrl ? result.room.tunnelUrl + '/hls/playlist.m3u8' : null
      
      // Send initial sync state to guest
      socket.emit('party:sync', {
        filename: result.room.filename,
        duration: result.room.duration,
        time: result.room.currentTime,
        paused: result.room.paused,
        streamUrl: localStreamUrl,           // For LAN guests (direct file access)
        publicStreamUrl: tunnelHlsUrl,       // For Internet guests (HLS via tunnel)
        hostName: result.room.hostName,
        needsTranscode: true                 // Signal that transcoding is needed
      })
    }
    
    callback(result)
  })
  
  // Leave party
  socket.on('party:leave', () => {
    leaveRoom(socket.id)
  })
  
  // Close party (host only)
  socket.on('party:close', () => {
    const room = getRoomBySocket(socket.id)
    if (room && room.hostSocketId === socket.id) {
      closeRoom(room.id, 'Host ended the party')
    }
  })
  
  // Broadcast action (host only)
  socket.on('party:action', (action: PartyAction) => {
    const room = getRoomBySocket(socket.id)
    if (!room) return
    
    // Only host can broadcast actions
    if (room.hostSocketId !== socket.id) {
      console.log('[WatchParty] Non-host tried to broadcast action, ignoring')
      return
    }
    
    broadcastAction(room.id, { ...action, fromHost: true })
  })
  
  // Heartbeat (host sends current time periodically)
  socket.on('party:heartbeat', (data: { time: number; paused: boolean }) => {
    const room = getRoomBySocket(socket.id)
    if (!room || room.hostSocketId !== socket.id) return
    
    updateRoomState(room.id, data.time, data.paused)
    
    // Broadcast to guests for smooth sync
    if (io) {
      room.guests.forEach((_, guestSocketId) => {
        io!.to(guestSocketId).emit('party:heartbeat', data)
      })
    }
  })
  
  // Get room info
  socket.on('party:info', (roomId: string, callback) => {
    const info = getRoomInfo(roomId)
    callback(info)
  })
  
  // Handle disconnect
  socket.on('disconnect', () => {
    leaveRoom(socket.id)
  })
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  MAX_GUESTS,
  SYNC_TOLERANCE_MS
}
