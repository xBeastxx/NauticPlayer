/**
 * usePlaylist Hook - Manages playlist state for NauticPlayer
 */
import { useState, useEffect, useCallback } from 'react'

const { ipcRenderer } = (window as any).require('electron')

export interface PlaylistItem {
  id: string
  url: string
  title: string
  thumbnail: string
  duration: number
  index: number
}

export interface UsePlaylistReturn {
  playlist: PlaylistItem[]
  currentIndex: number
  currentItem: PlaylistItem | null
  isPlaylistActive: boolean
  totalItems: number
  playNext: () => void
  playPrevious: () => void
  playIndex: (index: number) => void
  clearPlaylist: () => void
  addToPlaylist: (items: PlaylistItem | PlaylistItem[]) => void
}

export function usePlaylist(): UsePlaylistReturn {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Listen for playlist-loaded event from main process
  useEffect(() => {
    const handlePlaylistLoaded = (_event: any, items: PlaylistItem[]) => {
      console.log('[PLAYLIST] Received playlist with', items.length, 'items')
      setPlaylist(items)
      setCurrentIndex(0) // Start at first item
    }

    ipcRenderer.on('playlist-loaded', handlePlaylistLoaded)
    return () => {
      ipcRenderer.removeListener('playlist-loaded', handlePlaylistLoaded)
    }
  }, [])

  // Listen for video end to auto-advance
  useEffect(() => {
    const handleVideoEnd = () => {
      if (playlist.length > 0 && currentIndex < playlist.length - 1) {
        console.log('[PLAYLIST] Video ended, playing next')
        playNext()
      }
    }

    ipcRenderer.on('mpv-file-ended', handleVideoEnd)
    return () => {
      ipcRenderer.removeListener('mpv-file-ended', handleVideoEnd)
    }
  }, [playlist, currentIndex])

  const playNext = useCallback(() => {
    if (currentIndex < playlist.length - 1) {
      const nextIndex = currentIndex + 1
      setCurrentIndex(nextIndex)
      const nextItem = playlist[nextIndex]
      ipcRenderer.send('mpv-load', nextItem.url)
    }
  }, [playlist, currentIndex])

  const playPrevious = useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1
      setCurrentIndex(prevIndex)
      const prevItem = playlist[prevIndex]
      ipcRenderer.send('mpv-load', prevItem.url)
    }
  }, [playlist, currentIndex])

  const playIndex = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentIndex(index)
      const item = playlist[index]
      ipcRenderer.send('mpv-load', item.url)
    }
  }, [playlist])

  const clearPlaylist = useCallback(() => {
    setPlaylist([])
    setCurrentIndex(0)
  }, [])

  const addToPlaylist = useCallback((items: PlaylistItem | PlaylistItem[]) => {
    const newItems = Array.isArray(items) ? items : [items]
    setPlaylist(prev => [...prev, ...newItems.map((item, i) => ({
      ...item,
      index: prev.length + i
    }))])
  }, [])

  return {
    playlist,
    currentIndex,
    currentItem: playlist[currentIndex] || null,
    isPlaylistActive: playlist.length > 1,
    totalItems: playlist.length,
    playNext,
    playPrevious,
    playIndex,
    clearPlaylist,
    addToPlaylist
  }
}
