import { useState, useEffect, useCallback } from 'react'

export interface ResumePosition {
  /** Unique key - file path or URL */
  key: string
  /** Display name */
  title: string
  /** Last known position in seconds */
  position: number
  /** Total duration in seconds */
  duration: number
  /** Last updated timestamp */
  updatedAt: number
}

const STORAGE_KEY = 'nautic-player-resume-positions'
const MAX_ITEMS = 200

/**
 * Custom hook for managing resume positions with localStorage persistence
 * Works for both local files and streaming URLs
 */
export function useResumePositions() {
  const [positions, setPositions] = useState<ResumePosition[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setPositions(parsed)
        }
      }
    } catch (error) {
      console.error('[RESUME] Failed to load positions:', error)
    }
    setIsInitialized(true)
  }, [])

  // Save to localStorage when changed
  useEffect(() => {
    if (!isInitialized) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
    } catch (error) {
      console.error('[RESUME] Failed to save positions:', error)
    }
  }, [positions, isInitialized])

  /**
   * Save/update position for a file or URL
   * Only saves if position is meaningful (>30s and <95% of duration)
   */
  const savePosition = useCallback((key: string, title: string, position: number, duration: number) => {
    // Don't save if too short or almost finished
    if (position < 30 || duration < 60) return
    if (position > duration * 0.95) {
      // Video is almost finished, remove from resume list
      setPositions(prev => prev.filter(p => p.key !== key))
      return
    }

    setPositions(prev => {
      const filtered = prev.filter(p => p.key !== key)
      const newItem: ResumePosition = {
        key,
        title,
        position,
        duration,
        updatedAt: Date.now()
      }
      return [newItem, ...filtered].slice(0, MAX_ITEMS)
    })
  }, [])

  /**
   * Get saved position for a file or URL
   * Returns null if not found or position is too old (>30 days)
   */
  const getPosition = useCallback((key: string): ResumePosition | null => {
    const item = positions.find(p => p.key === key)
    if (!item) return null
    
    // Expire after 30 days
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    if (Date.now() - item.updatedAt > thirtyDays) {
      return null
    }
    
    return item
  }, [positions])

  /**
   * Remove position for a file (e.g. when user says "Start from beginning")
   */
  const clearPosition = useCallback((key: string) => {
    setPositions(prev => prev.filter(p => p.key !== key))
  }, [])

  /**
   * Clear all positions
   */
  const clearAllPositions = useCallback(() => {
    setPositions([])
  }, [])

  return {
    positions,
    savePosition,
    getPosition,
    clearPosition,
    clearAllPositions,
    isInitialized
  }
}

/**
 * Format seconds to readable time string
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}
