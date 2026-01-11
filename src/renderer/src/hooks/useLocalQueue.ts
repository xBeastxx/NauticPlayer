/**
 * useLocalQueue Hook - Manages local file queue state
 */
import { useState, useCallback, useEffect } from 'react'
import { LocalQueueItem } from '../components/LocalQueuePanel'

const { ipcRenderer } = (window as any).require('electron')

const STORAGE_KEY = 'nautic-local-queue'

export interface UseLocalQueueReturn {
    queue: LocalQueueItem[]
    currentIndex: number
    isQueueActive: boolean
    totalItems: number
    addFiles: (files: LocalQueueItem[]) => void
    removeItem: (index: number) => void
    clearQueue: () => void
    playIndex: (index: number) => void
    playNext: () => void
    playPrevious: () => void
    reorder: (fromIndex: number, toIndex: number) => void
}

export function useLocalQueue(): UseLocalQueueReturn {
    const [queue, setQueue] = useState<LocalQueueItem[]>([])
    const [currentIndex, setCurrentIndex] = useState(-1)
    const [isInitialized, setIsInitialized] = useState(false)

    // Load queue from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                setQueue(parsed.queue || [])
                // Don't restore currentIndex - start fresh
            }
        } catch (e) {
            console.error('[LOCAL_QUEUE] Failed to load from localStorage:', e)
        }
        setIsInitialized(true)
    }, [])

    // Save queue to localStorage when it changes
    useEffect(() => {
        if (isInitialized) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue }))
            } catch (e) {
                console.error('[LOCAL_QUEUE] Failed to save to localStorage:', e)
            }
        }
    }, [queue, isInitialized])

    // Listen for video end to auto-advance (only if local queue is active)
    useEffect(() => {
        const handleVideoEnd = () => {
            if (queue.length > 0 && currentIndex >= 0 && currentIndex < queue.length - 1) {
                console.log('[LOCAL_QUEUE] Video ended, playing next')
                playNext()
            }
        }

        ipcRenderer.on('mpv-file-ended', handleVideoEnd)
        return () => {
            ipcRenderer.removeListener('mpv-file-ended', handleVideoEnd)
        }
    }, [queue, currentIndex])

    const addFiles = useCallback((files: LocalQueueItem[]) => {
        setQueue(prev => {
            const newQueue = [...prev, ...files.map((f, i) => ({
                ...f,
                index: prev.length + i
            }))]
            return newQueue
        })
    }, [])

    const removeItem = useCallback((index: number) => {
        setQueue(prev => {
            const newQueue = prev.filter((_, i) => i !== index)
            // Update indices
            return newQueue.map((item, i) => ({ ...item, index: i }))
        })
        // Adjust currentIndex if needed
        if (index < currentIndex) {
            setCurrentIndex(prev => prev - 1)
        } else if (index === currentIndex) {
            setCurrentIndex(-1) // No longer playing from this queue
        }
    }, [currentIndex])

    const clearQueue = useCallback(() => {
        setQueue([])
        setCurrentIndex(-1)
    }, [])

    const playIndex = useCallback((index: number) => {
        if (index >= 0 && index < queue.length) {
            const item = queue[index]
            setCurrentIndex(index)
            ipcRenderer.send('mpv-load', item.path)
        }
    }, [queue])

    const playNext = useCallback(() => {
        if (currentIndex < queue.length - 1) {
            const nextIndex = currentIndex + 1
            setCurrentIndex(nextIndex)
            const item = queue[nextIndex]
            ipcRenderer.send('mpv-load', item.path)
        }
    }, [queue, currentIndex])

    const playPrevious = useCallback(() => {
        if (currentIndex > 0) {
            const prevIndex = currentIndex - 1
            setCurrentIndex(prevIndex)
            const item = queue[prevIndex]
            ipcRenderer.send('mpv-load', item.path)
        }
    }, [queue, currentIndex])

    const reorder = useCallback((fromIndex: number, toIndex: number) => {
        setQueue(prev => {
            const newQueue = [...prev]
            const [removed] = newQueue.splice(fromIndex, 1)
            newQueue.splice(toIndex, 0, removed)
            // Update indices
            return newQueue.map((item, i) => ({ ...item, index: i }))
        })
        // Update currentIndex if it was affected
        if (currentIndex === fromIndex) {
            setCurrentIndex(toIndex)
        } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
            setCurrentIndex(prev => prev - 1)
        } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
            setCurrentIndex(prev => prev + 1)
        }
    }, [currentIndex])

    return {
        queue,
        currentIndex,
        isQueueActive: queue.length > 0 && currentIndex >= 0,
        totalItems: queue.length,
        addFiles,
        removeItem,
        clearQueue,
        playIndex,
        playNext,
        playPrevious,
        reorder
    }
}
