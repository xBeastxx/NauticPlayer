import { useState, useEffect, useCallback } from 'react'

export interface HistoryItem {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  duration: number
  watchedAt: number
}

const STORAGE_KEY = 'nautic-player-history'
const MAX_HISTORY_ITEMS = 100

/**
 * Custom hook for managing watch history with localStorage persistence
 */
export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setHistory(parsed)
        }
      }
    } catch (error) {
      console.error('[HISTORY] Failed to load from localStorage:', error)
    }
    // Mark as initialized after loading (even if empty)
    setIsInitialized(true)
  }, [])

  // Save history to localStorage whenever it changes (but only after initial load)
  useEffect(() => {
    // Don't save until we've loaded existing data first
    if (!isInitialized) return
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
      console.log('[HISTORY] Saved to localStorage:', history.length, 'items')
    } catch (error) {
      console.error('[HISTORY] Failed to save to localStorage:', error)
    }
  }, [history, isInitialized])

  /**
   * Add a new item to history. If URL already exists, move it to top.
   */
  const addToHistory = useCallback((item: Omit<HistoryItem, 'watchedAt'>) => {
    setHistory(prev => {
      // Remove existing entry with same URL
      const filtered = prev.filter(h => h.url !== item.url)
      
      // Add new entry at the beginning with current timestamp
      const newItem: HistoryItem = {
        ...item,
        watchedAt: Date.now()
      }
      
      // Limit history size
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)
      
      return updated
    })
  }, [])

  /**
   * Remove a single item from history by ID
   */
  const removeFromHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id))
  }, [])

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  /**
   * Filter history based on search query (title or channel)
   */
  const filteredHistory = history.filter(item => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      item.title.toLowerCase().includes(query) ||
      item.channel.toLowerCase().includes(query)
    )
  })

  return {
    history: filteredHistory,
    allHistory: history,
    searchQuery,
    setSearchQuery,
    addToHistory,
    removeFromHistory,
    clearHistory
  }
}
