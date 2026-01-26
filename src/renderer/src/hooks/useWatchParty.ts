/**
 * useWatchParty Hook
 * Manages Watch Party state and socket communication for synchronized viewing
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

// ============================================================================
// TYPES
// ============================================================================

export interface PartyGuest {
  name: string
  joinedAt: number
}

export interface PartyState {
  active: boolean
  isHost: boolean
  roomId: string | null
  shareUrl: string | null
  publicShareUrl: string | null  // For internet access (Cloudflare tunnel)
  tunnelActive: boolean
  hostName: string | null
  guests: PartyGuest[]
  connecting: boolean
  error: string | null
}

export interface PartyMediaState {
  filename: string
  duration: number
  time: number
  paused: boolean
  streamUrl: string | null
  publicStreamUrl?: string | null  // For Internet guests (via tunnel)
}

export interface UseWatchPartyReturn {
  // State
  party: PartyState
  
  // Actions
  createParty: (name: string, filename: string, duration: number, currentTime: number, enableInternet?: boolean) => Promise<{ success: boolean; shareUrl?: string; publicShareUrl?: string; error?: string }>
  joinParty: (hostUrl: string, name: string) => Promise<{ success: boolean; error?: string }>
  leaveParty: () => void
  
  // Sync (called by player on state changes)
  broadcastAction: (type: 'play' | 'pause' | 'seek', time?: number) => void
  sendHeartbeat: (time: number, paused: boolean) => void
}

// ============================================================================
// HOOK
// ============================================================================

export function useWatchParty(
  onRemoteAction?: (action: { type: string; time?: number }) => void,
  onMediaSync?: (state: PartyMediaState) => void
): UseWatchPartyReturn {
  const [party, setParty] = useState<PartyState>({
    active: false,
    isHost: false,
    roomId: null,
    shareUrl: null,
    publicShareUrl: null,
    tunnelActive: false,
    hostName: null,
    guests: [],
    connecting: false,
    error: null
  })

  const socketRef = useRef<Socket | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [])

  // Setup socket event handlers
  const setupSocketListeners = useCallback((socket: Socket, isHost: boolean) => {
    // Guest joined (host and guests receive this)
    socket.on('party:guest-joined', (data: { name: string; guestCount: number }) => {
      console.log('[WatchParty] Guest joined:', data.name)
      setParty(prev => ({
        ...prev,
        guests: [...prev.guests, { name: data.name, joinedAt: Date.now() }]
      }))
    })

    // Guest left
    socket.on('party:guest-left', (data: { name: string; guestCount: number }) => {
      console.log('[WatchParty] Guest left:', data.name)
      setParty(prev => ({
        ...prev,
        guests: prev.guests.filter(g => g.name !== data.name)
      }))
    })

    // Party closed by host
    socket.on('party:closed', (data: { reason: string }) => {
      console.log('[WatchParty] Party closed:', data.reason)
      setParty({
        active: false,
        isHost: false,
        roomId: null,
        shareUrl: null,
        publicShareUrl: null,
        tunnelActive: false,
        hostName: null,
        guests: [],
        connecting: false,
        error: null
      })
      socket.disconnect()
      socketRef.current = null
    })

    // Actions from host (guests only)
    if (!isHost) {
      socket.on('party:action', (action: { type: string; time?: number; fromHost: boolean }) => {
        console.log('[WatchParty] Action received:', action)
        if (action.fromHost && onRemoteAction) {
          onRemoteAction(action)
        }
      })

      // Initial sync when joining
      socket.on('party:sync', (state: PartyMediaState) => {
        console.log('[WatchParty] Initial sync:', state)
        if (onMediaSync) {
          onMediaSync(state)
        }
      })

      // Heartbeat from host for smooth sync
      socket.on('party:heartbeat', (data: { time: number; paused: boolean }) => {
        // Only sync if significantly off (>2s difference handled server-side)
        if (onRemoteAction) {
          onRemoteAction({ type: 'sync', time: data.time })
        }
      })
    }

    // Disconnect handling
    socket.on('disconnect', (reason: string) => {
      console.log('[WatchParty] Disconnected:', reason)
      if (reason !== 'io client disconnect') {
        // Unexpected disconnect
        setParty(prev => ({
          ...prev,
          active: false,
          error: 'Connection lost'
        }))
      }
    })
  }, [onRemoteAction, onMediaSync])

  // Create a new party (host)
  const createParty = useCallback(async (
    name: string,
    filename: string,
    duration: number,
    currentTime: number,
    enableInternet: boolean = false
  ): Promise<{ success: boolean; shareUrl?: string; publicShareUrl?: string; error?: string }> => {
    return new Promise(async (resolve) => {
      try {
        setParty(prev => ({ ...prev, connecting: true, error: null }))

        // Get remote server info
        const { ipcRenderer } = (window as any).require('electron')
        const remoteInfo = await ipcRenderer.invoke('get-remote-info')
        
        if (!remoteInfo) {
          setParty(prev => ({ ...prev, connecting: false, error: 'Remote server not available' }))
          resolve({ success: false, error: 'Remote server not available' })
          return
        }

        const { url } = remoteInfo

        // Connect to local remote server
        const socket = io(url, {
          transports: ['websocket', 'polling'],
          timeout: 5000
        })

        socket.on('connect', () => {
          console.log('[WatchParty] Connected to local server, creating party...')
          
          socket.emit('party:create', {
            name,
            filename,
            duration,
            currentTime,
            enableInternet
          }, (response: { success: boolean; roomId?: string; shareUrl?: string; publicShareUrl?: string; tunnelActive?: boolean; error?: string }) => {
            if (response.success) {
              socketRef.current = socket
              setupSocketListeners(socket, true)
              
              setParty({
                active: true,
                isHost: true,
                roomId: response.roomId || null,
                shareUrl: response.shareUrl || null,
                publicShareUrl: response.publicShareUrl || null,
                tunnelActive: response.tunnelActive || false,
                hostName: name,
                guests: [],
                connecting: false,
                error: null
              })
              
              resolve({ 
                success: true, 
                shareUrl: response.shareUrl,
                publicShareUrl: response.publicShareUrl 
              })
            } else {
              socket.disconnect()
              setParty(prev => ({ ...prev, connecting: false, error: response.error || 'Failed to create party' }))
              resolve({ success: false, error: response.error })
            }
          })
        })

        socket.on('connect_error', (err: Error) => {
          console.error('[WatchParty] Connection error:', err)
          setParty(prev => ({ ...prev, connecting: false, error: 'Failed to connect' }))
          resolve({ success: false, error: 'Connection failed' })
        })

      } catch (error: any) {
        console.error('[WatchParty] Create error:', error)
        setParty(prev => ({ ...prev, connecting: false, error: error.message }))
        resolve({ success: false, error: error.message })
      }
    })
  }, [setupSocketListeners])

  // Join an existing party (guest)
  const joinParty = useCallback(async (
    hostUrl: string,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      try {
        setParty(prev => ({ ...prev, connecting: true, error: null }))

        // Parse the share URL
        // Format: nauticplayer://party/NP-XXXX-XXXX?host=192.168.1.100&port=5678
        // Or direct: http://192.168.1.100:5678 (just connect to this)
        let socketUrl: string
        let roomId: string | null = null

        if (hostUrl.startsWith('nauticplayer://')) {
          const match = hostUrl.match(/party\/(NP-[A-Z0-9-]+)\?host=([^&]+)&port=(\d+)/)
          if (match) {
            roomId = match[1]
            socketUrl = `http://${match[2]}:${match[3]}`
          } else {
            setParty(prev => ({ ...prev, connecting: false, error: 'Invalid party URL' }))
            resolve({ success: false, error: 'Invalid party URL' })
            return
          }
        } else if (hostUrl.match(/^NP-[A-Z0-9-]+$/)) {
          // Just room code, need to ask for host IP
          setParty(prev => ({ ...prev, connecting: false, error: 'Please enter full party URL' }))
          resolve({ success: false, error: 'Please enter full party URL' })
          return
        } else {
          // Assume it's a direct URL like http://192.168.1.100:5678/NP-XXXX-XXXX
          const urlMatch = hostUrl.match(/^(https?:\/\/[^\/]+)(?:\/(.+))?$/)
          if (urlMatch) {
            socketUrl = urlMatch[1]
            roomId = urlMatch[2] || null
          } else {
            setParty(prev => ({ ...prev, connecting: false, error: 'Invalid URL format' }))
            resolve({ success: false, error: 'Invalid URL format' })
            return
          }
        }

        if (!roomId) {
          setParty(prev => ({ ...prev, connecting: false, error: 'Room ID not found in URL' }))
          resolve({ success: false, error: 'Room ID not found' })
          return
        }

        console.log('[WatchParty] Joining party:', { socketUrl, roomId })

        const socket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          timeout: 10000
        })

        socket.on('connect', () => {
          console.log('[WatchParty] Connected to host, joining room...')
          
          socket.emit('party:join', { roomId, name }, (response: { success: boolean; error?: string }) => {
            if (response.success) {
              socketRef.current = socket
              setupSocketListeners(socket, false)
              
              setParty({
                active: true,
                isHost: false,
                roomId,
                shareUrl: null,
                publicShareUrl: null,
                tunnelActive: false,
                hostName: null, // Will be set from sync
                guests: [],
                connecting: false,
                error: null
              })
              
              resolve({ success: true })
            } else {
              socket.disconnect()
              setParty(prev => ({ ...prev, connecting: false, error: response.error || 'Failed to join' }))
              resolve({ success: false, error: response.error })
            }
          })
        })

        socket.on('connect_error', (err: Error) => {
          console.error('[WatchParty] Connection error:', err)
          setParty(prev => ({ ...prev, connecting: false, error: 'Could not reach host' }))
          resolve({ success: false, error: 'Could not reach host. Check if host is online and URL is correct.' })
        })

      } catch (error: any) {
        console.error('[WatchParty] Join error:', error)
        setParty(prev => ({ ...prev, connecting: false, error: error.message }))
        resolve({ success: false, error: error.message })
      }
    })
  }, [setupSocketListeners])

  // Leave the party
  const leaveParty = useCallback(() => {
    if (socketRef.current) {
      if (party.isHost) {
        socketRef.current.emit('party:close')
      } else {
        socketRef.current.emit('party:leave')
      }
      socketRef.current.disconnect()
      socketRef.current = null
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    setParty({
      active: false,
      isHost: false,
      roomId: null,
      shareUrl: null,
      publicShareUrl: null,
      tunnelActive: false,
      hostName: null,
      guests: [],
      connecting: false,
      error: null
    })
  }, [party.isHost])

  // Broadcast action to guests (host only)
  const broadcastAction = useCallback((type: 'play' | 'pause' | 'seek', time?: number) => {
    if (!party.active || !party.isHost || !socketRef.current) return
    
    socketRef.current.emit('party:action', { type, time, fromHost: true })
  }, [party.active, party.isHost])

  // Send heartbeat (host only, called periodically)
  const sendHeartbeat = useCallback((time: number, paused: boolean) => {
    if (!party.active || !party.isHost || !socketRef.current) return
    
    socketRef.current.emit('party:heartbeat', { time, paused })
  }, [party.active, party.isHost])

  return {
    party,
    createParty,
    joinParty,
    leaveParty,
    broadcastAction,
    sendHeartbeat
  }
}
