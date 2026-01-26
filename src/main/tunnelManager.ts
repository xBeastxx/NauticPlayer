/**
 * Tunnel Manager
 * Manages Cloudflare Tunnel for internet access to Watch Party
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// ============================================================================
// TYPES
// ============================================================================

export interface TunnelStatus {
  active: boolean
  url: string | null
  error: string | null
  starting: boolean
}

// ============================================================================
// STATE
// ============================================================================

let tunnelProcess: ChildProcess | null = null
let tunnelUrl: string | null = null
let isStarting = false
let lastError: string | null = null

// Event emitter for tunnel status updates
export const tunnelEvents = new EventEmitter()

// ============================================================================
// CLOUDFLARED PATH
// ============================================================================

/**
 * Get the path to the bundled cloudflared executable
 */
function getCloudflaredPath(): string {
  // In development, it's in resources/
  // In production, electron-builder copies resources to app.getPath('exe')/../resources/
  const isDev = !app.isPackaged
  
  if (isDev) {
    // Development: resources folder in project root
    return path.join(process.cwd(), 'resources', 'cloudflared.exe')
  } else {
    // Production: resources folder next to executable  
    return path.join(process.resourcesPath, 'cloudflared.exe')
  }
}

/**
 * Check if bundled cloudflared is available
 */
export async function isCloudflaredInstalled(): Promise<boolean> {
  const cloudflaredPath = getCloudflaredPath()
  console.log('[Tunnel] Checking cloudflared at:', cloudflaredPath)
  return fs.existsSync(cloudflaredPath)
}

/**
 * Get cloudflared info (for debugging)
 */
export function getInstallInstructions(): string {
  return `cloudflared should be bundled with NauticPlayer. 
If you're seeing this message, the installation may be corrupted.
Try reinstalling NauticPlayer.`
}

// ============================================================================
// TUNNEL MANAGEMENT
// ============================================================================

/**
 * Start a Cloudflare quick tunnel for the given local port
 */
export async function startTunnel(localPort: number): Promise<{ success: boolean; url?: string; error?: string }> {
  // Check if already running
  if (tunnelProcess) {
    if (tunnelUrl) {
      return { success: true, url: tunnelUrl }
    }
    return { success: false, error: 'Tunnel is already starting' }
  }

  // Get bundled cloudflared path
  const cloudflaredPath = getCloudflaredPath()
  
  // Check if bundled binary exists
  if (!fs.existsSync(cloudflaredPath)) {
    console.error('[Tunnel] Bundled cloudflared not found at:', cloudflaredPath)
    return { 
      success: false, 
      error: 'cloudflared not found. Installation may be corrupted.' 
    }
  }

  isStarting = true
  lastError = null
  tunnelEvents.emit('status', getStatus())

  return new Promise((resolve) => {
    console.log(`[Tunnel] Starting cloudflared tunnel for port ${localPort}...`)
    console.log(`[Tunnel] Binary path: ${cloudflaredPath}`)

    // Start bundled cloudflared with quick tunnel (no account needed)
    tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${localPort}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let urlFound = false
    const timeout = setTimeout(() => {
      if (!urlFound) {
        isStarting = false
        lastError = 'Tunnel startup timeout (30s)'
        tunnelEvents.emit('status', getStatus())
        resolve({ success: false, error: lastError })
      }
    }, 30000)

    // Parse output for the generated URL
    const parseOutput = (data: Buffer) => {
      const output = data.toString()
      console.log('[Tunnel]', output)

      // Look for the trycloudflare.com URL
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (urlMatch && !urlFound) {
        urlFound = true
        clearTimeout(timeout)
        tunnelUrl = urlMatch[0]
        isStarting = false
        console.log('[Tunnel] ✓ Tunnel URL:', tunnelUrl)
        tunnelEvents.emit('status', getStatus())
        resolve({ success: true, url: tunnelUrl })
      }

      // Check for errors
      if (output.includes('error') || output.includes('failed')) {
        if (!urlFound) {
          lastError = 'Tunnel connection failed'
        }
      }
    }

    tunnelProcess.stdout?.on('data', parseOutput)
    tunnelProcess.stderr?.on('data', parseOutput)

    tunnelProcess.on('close', (code) => {
      console.log('[Tunnel] Process closed with code:', code)
      clearTimeout(timeout)
      tunnelProcess = null
      tunnelUrl = null
      isStarting = false
      
      if (!urlFound) {
        lastError = `Tunnel process exited (code ${code})`
        tunnelEvents.emit('status', getStatus())
        resolve({ success: false, error: lastError })
      } else {
        tunnelEvents.emit('status', getStatus())
      }
    })

    tunnelProcess.on('error', (err) => {
      console.error('[Tunnel] Process error:', err)
      clearTimeout(timeout)
      isStarting = false
      lastError = err.message
      tunnelProcess = null
      tunnelEvents.emit('status', getStatus())
      resolve({ success: false, error: err.message })
    })
  })
}

/**
 * Stop the running tunnel
 */
export function stopTunnel(): void {
  if (tunnelProcess) {
    console.log('[Tunnel] Stopping tunnel...')
    tunnelProcess.kill()
    tunnelProcess = null
    tunnelUrl = null
    isStarting = false
    lastError = null
    tunnelEvents.emit('status', getStatus())
  }
}

/**
 * Get current tunnel status
 */
export function getStatus(): TunnelStatus {
  return {
    active: tunnelProcess !== null && tunnelUrl !== null,
    url: tunnelUrl,
    error: lastError,
    starting: isStarting
  }
}

/**
 * Get tunnel URL if active
 */
export function getTunnelUrl(): string | null {
  return tunnelUrl
}

/**
 * Check if tunnel is active
 */
export function isTunnelActive(): boolean {
  return tunnelProcess !== null && tunnelUrl !== null
}
