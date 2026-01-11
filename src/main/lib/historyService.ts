/**
 * History Service for NauticPlayer
 * Extracts YouTube video metadata using yt-dlp
 */

import { spawn } from 'child_process'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { is } from '@electron-toolkit/utils'
import { logger } from './logger'

export interface YouTubeMetadata {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  duration: number
}

/**
 * Check if a URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  const ytPatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
    /^https?:\/\/youtu\.be\//,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//,
    /^https?:\/\/(www\.)?youtube\.com\/live\//
  ]
  return ytPatterns.some(pattern => pattern.test(url))
}

/**
 * Check if a URL is a YouTube PLAYLIST URL
 */
export function isYouTubePlaylist(url: string): boolean {
  return url.includes('list=') && (
    url.includes('youtube.com') || url.includes('youtu.be')
  )
}

export interface PlaylistItem {
  id: string
  url: string
  title: string
  thumbnail: string
  duration: number
  index: number
}

/**
 * Extract YouTube video metadata using yt-dlp
 */
export async function extractYouTubeMetadata(url: string): Promise<YouTubeMetadata | null> {
  return new Promise((resolve) => {
    try {
      // Path to yt-dlp binary
      const binPath = is.dev
        ? join(__dirname, '../../resources/bin')
        : join(process.resourcesPath, 'bin')
      const ytdlPath = join(binPath, 'yt-dlp.exe')

      logger.log('[HISTORY] Extracting metadata for:', url)

      const proc = spawn(ytdlPath, [
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--skip-download',
        url
      ], {
        windowsHide: true
      })

      let output = ''
      let errorOutput = ''

      proc.stdout.on('data', (data) => {
        output += data.toString()
      })

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0 || !output) {
          logger.error('[HISTORY] yt-dlp failed:', errorOutput || `Exit code ${code}`)
          resolve(null)
          return
        }

        try {
          const json = JSON.parse(output)
          
          const metadata: YouTubeMetadata = {
            id: randomUUID(),
            url: url,
            title: json.title || 'Unknown Title',
            thumbnail: json.thumbnail || (json.thumbnails && json.thumbnails[0]?.url) || '',
            channel: json.channel || json.uploader || 'Unknown Channel',
            duration: json.duration || 0
          }

          logger.log('[HISTORY] Metadata extracted:', metadata.title)
          resolve(metadata)
        } catch (parseError) {
          logger.error('[HISTORY] Failed to parse yt-dlp output:', parseError)
          resolve(null)
        }
      })

      proc.on('error', (err) => {
        logger.error('[HISTORY] Failed to spawn yt-dlp:', err)
        resolve(null)
      })

      // Timeout after 15 seconds
      setTimeout(() => {
        proc.kill()
        resolve(null)
      }, 15000)

    } catch (error) {
      logger.error('[HISTORY] extractYouTubeMetadata error:', error)
      resolve(null)
    }
  })
}

/**
 * Extract all videos from a YouTube playlist using yt-dlp --flat-playlist
 */
export async function extractYouTubePlaylist(playlistUrl: string): Promise<PlaylistItem[]> {
  return new Promise((resolve) => {
    try {
      const binPath = is.dev
        ? join(__dirname, '../../resources/bin')
        : join(process.resourcesPath, 'bin')
      const ytdlPath = join(binPath, 'yt-dlp.exe')

      logger.log('[PLAYLIST] Extracting playlist:', playlistUrl)

      const proc = spawn(ytdlPath, [
        '--flat-playlist',
        '-J',
        '--no-warnings',
        playlistUrl
      ], {
        windowsHide: true
      })

      let output = ''
      let errorOutput = ''

      proc.stdout.on('data', (data) => {
        output += data.toString()
      })

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0 || !output) {
          logger.error('[PLAYLIST] yt-dlp failed:', errorOutput || `Exit code ${code}`)
          resolve([])
          return
        }

        try {
          const json = JSON.parse(output)
          const entries = json.entries || []
          
          const items: PlaylistItem[] = entries.map((entry: any, index: number) => ({
            id: entry.id || randomUUID(),
            url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
            title: entry.title || `Video ${index + 1}`,
            thumbnail: entry.thumbnails?.[0]?.url || '',
            duration: entry.duration || 0,
            index: index
          }))

          logger.log(`[PLAYLIST] Extracted ${items.length} videos from playlist`)
          resolve(items)
        } catch (parseError) {
          logger.error('[PLAYLIST] Failed to parse playlist:', parseError)
          resolve([])
        }
      })

      proc.on('error', (err) => {
        logger.error('[PLAYLIST] Failed to spawn yt-dlp:', err)
        resolve([])
      })

      // Timeout after 30 seconds for playlists (can be larger)
      setTimeout(() => {
        proc.kill()
        resolve([])
      }, 30000)

    } catch (error) {
      logger.error('[PLAYLIST] extractYouTubePlaylist error:', error)
      resolve([])
    }
  })
}
