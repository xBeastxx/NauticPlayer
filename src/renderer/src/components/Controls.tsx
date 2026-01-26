import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2, Minimize2, Monitor, Settings, Globe, Sparkles, Music, FolderOpen, Lock, Loader2, History, ChevronLeft, ChevronRight, ListMusic, Smartphone, Users } from 'lucide-react'
import SettingsMenu from './SettingsMenu'
import HistoryPanel from './HistoryPanel'
import LocalQueuePanel from './LocalQueuePanel'

import { useHistory } from '../hooks/useHistory'
import { usePlaylist } from '../hooks/usePlaylist'
import { useLocalQueue } from '../hooks/useLocalQueue'

// Use window.require for Electron in Vite context
const { ipcRenderer } = (window as any).require('electron')

// Define the shape of our buttons
const FloatingButton = ({ children, onClick, hero = false, ...props }: any) => (
    <button
        className={`floating-btn ${hero ? 'hero-btn' : ''}`}
        onClick={onClick}
        {...props}
        style={{
            padding: hero ? '12px' : '8px',
            background: 'transparent',
            backdropFilter: 'none',
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
            transition: 'all 0.2s ease',
            pointerEvents: 'auto',
        }}
    >
        {children}
    </button>
)

// Helper to format seconds to mm:ss or h:mm:ss
const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// ... imports

export default function Controls({ showSettings, setShowSettings, filename, onMouseEnter, onMouseLeave, isLoadingUrl, setIsLoadingUrl, showUrlInput, setShowUrlInput, toggleRemote, remoteConnected, toggleWatchParty, watchPartyActive }: any): JSX.Element {
    // Playback State
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [mpvReady, setMpvReady] = useState(false)

    // Volume State
    const [showVolume, setShowVolume] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [volume, setVolume] = useState(60)
    const [prevVolume, setPrevVolume] = useState(60)
    const volumeShowTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    // URL Input State (Lifted to App)
    const [streamUrl, setStreamUrl] = useState('')
    // const [isLoadingUrl, setIsLoadingUrl] = useState(false) <-- Lifted to App
    const isLoadingUrlRef = useRef(false) // Ref to access current state in listeners

    // Sync REF with PROP
    useEffect(() => {
        isLoadingUrlRef.current = isLoadingUrl
    }, [isLoadingUrl])

    const [isShaderOn, setIsShaderOn] = useState(false)
    // Settings State
    // const [showSettings, setShowSettings] = useState(false) <-- Lifted to App
    const [tracks, setTracks] = useState<any[]>([])

    // Persistent Settings (Lifted from SettingsMenu)
    const [hwDec, setHwDec] = useState(true)
    const [anime4K, setAnime4K] = useState(false)
    const [loopState, setLoopState] = useState<'none' | 'inf' | 'one'>('none')
    const [alwaysOnTop, setAlwaysOnTop] = useState(false)

    // Stats State
    const [showStats, setShowStats] = useState(false)

    const [isFullscreen, setIsFullscreen] = useState(false)

    // History State
    const [showHistory, setShowHistory] = useState(false)

    const {
        history,
        searchQuery,
        setSearchQuery,
        addToHistory,
        removeFromHistory,
        clearHistory
    } = useHistory()

    // Playlist State (YouTube)
    const { playlist, currentIndex, isPlaylistActive, totalItems, playNext, playPrevious, playIndex } = usePlaylist()

    // Local Queue State
    const [showQueue, setShowQueue] = useState(false)
    const localQueue = useLocalQueue()

    // Drag State
    const [isDraggingTime, setIsDraggingTime] = useState(false)
    const [isDraggingVolume, setIsDraggingVolume] = useState(false)
    const timelineRef = useRef<HTMLDivElement>(null)
    const volumeRef = useRef<HTMLDivElement>(null)

    // === MPV Event Listeners ===
    useEffect(() => {
        const onMpvReady = () => {
            console.log('MPV Ready!')
            setMpvReady(true)
            ipcRenderer.send('mpv-command', ['set_property', 'volume', 60])
        }

        const onMpvTime = (_event: any, time: number) => {
            if (!isDraggingTime) setCurrentTime(time)
            // If we receive ANY time update, playback has definitely started
            if (isLoadingUrlRef.current) {
                setIsLoadingUrl(false)
                setShowUrlInput(false)
            }
        }

        const onMpvDuration = (_event: any, dur: number) => {
            setDuration(dur)
            // When we get a valid duration, loading is complete
            if (dur > 0 && isLoadingUrlRef.current) {
                setIsLoadingUrl(false)
                setShowUrlInput(false)
            }
        }

        const onMpvError = () => {
            // If error occurs, reset loading state so user isn't stuck
            if (isLoadingUrlRef.current) {
                setIsLoadingUrl(false)
                // Don't close input on error so user can retry
            }
        }

        const onMpvPaused = (_event: any, paused: boolean) => {
            setIsPlaying(!paused)
        }

        const onMpvVolume = (_event: any, vol: number) => {
            setVolume(vol)
            // Briefly show volume bar when volume changes
            setShowVolume(true)
            if (volumeShowTimeoutRef.current) clearTimeout(volumeShowTimeoutRef.current)
            volumeShowTimeoutRef.current = setTimeout(() => setShowVolume(false), 1500)
        }

        const onMpvTracks = (_event: any, trackList: any[]) => {
            setTracks(trackList)
            // If we get tracks, file is loaded
            if (trackList.length > 0 && isLoadingUrlRef.current) {
                setIsLoadingUrl(false)
                setShowUrlInput(false)
            }
        }

        ipcRenderer.on('mpv-ready', onMpvReady)
        ipcRenderer.on('mpv-time', onMpvTime)
        ipcRenderer.on('mpv-duration', onMpvDuration)
        ipcRenderer.on('mpv-paused', onMpvPaused)
        ipcRenderer.on('mpv-volume', onMpvVolume)
        ipcRenderer.on('mpv-tracks', onMpvTracks)
        ipcRenderer.on('mpv-error', onMpvError)

        // Listen for mute state changes
        const onMpvMute = (_event: any, muted: boolean) => {
            setIsMuted(muted)
        }
        ipcRenderer.on('mpv-mute', onMpvMute)

        return () => {
            ipcRenderer.removeListener('mpv-ready', onMpvReady)
            ipcRenderer.removeListener('mpv-time', onMpvTime)
            ipcRenderer.removeListener('mpv-duration', onMpvDuration)
            ipcRenderer.removeListener('mpv-paused', onMpvPaused)
            ipcRenderer.removeListener('mpv-volume', onMpvVolume)
            ipcRenderer.removeListener('mpv-tracks', onMpvTracks)
            ipcRenderer.removeListener('mpv-error', onMpvError)
            ipcRenderer.removeListener('mpv-mute', onMpvMute)
        }
    }, [isDraggingTime])

    // Listen for YouTube metadata to save to history
    useEffect(() => {
        const onYouTubeMetadata = (_event: any, metadata: any) => {
            if (metadata && metadata.url && metadata.title) {
                addToHistory({
                    id: metadata.id || crypto.randomUUID(),
                    url: metadata.url,
                    title: metadata.title,
                    thumbnail: metadata.thumbnail || '',
                    channel: metadata.channel || 'Unknown',
                    duration: metadata.duration || 0
                })
            }
        }

        ipcRenderer.on('youtube-metadata', onYouTubeMetadata)

        return () => {
            ipcRenderer.removeListener('youtube-metadata', onYouTubeMetadata)
        }
    }, [addToHistory])

    // === Control Handlers ===
    const togglePlay = () => {
        ipcRenderer.send('mpv-toggle')
    }

    const toggleMute = () => {
        if (isMuted) {
            setIsMuted(false)
            const newVol = prevVolume > 0 ? prevVolume : 100
            setVolume(newVol)
            ipcRenderer.send('mpv-volume', newVol)
            ipcRenderer.send('mpv-mute', false)
        } else {
            setPrevVolume(volume)
            setVolume(0)
            setIsMuted(true)
            ipcRenderer.send('mpv-mute', true)
        }
    }

    const toggleStats = () => {
        const newVal = !showStats
        setShowStats(newVal)
        ipcRenderer.send('mpv-command', ['script-binding', 'stats/display-stats-toggle'])
    }

    // Timeline Drag Handlers
    const handleTimelineInteraction = (clientX: number) => {
        if (!timelineRef.current || duration === 0) return
        const rect = timelineRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const newTime = percent * duration
        setCurrentTime(newTime)
    }

    const handleTimelineMouseDown = (e: React.MouseEvent) => {
        setIsDraggingTime(true)
        handleTimelineInteraction(e.clientX)
    }

    const handleTimelineMouseUp = () => {
        if (isDraggingTime) {
            ipcRenderer.send('mpv-seek-to', currentTime)
        }
        setIsDraggingTime(false)
    }

    // Volume Drag Handlers
    const handleVolumeInteraction = (clientX: number) => {
        if (!volumeRef.current) return
        const rect = volumeRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const newVol = Math.min(100, Math.round(percent * 100)) // Clamp to 100
        setVolume(newVol)
        ipcRenderer.send('mpv-command', ['set_property', 'volume', newVol])
        if (newVol > 0) setIsMuted(false)
        if (newVol === 0) setIsMuted(true)
    }

    const handleVolumeMouseDown = (e: React.MouseEvent) => {
        setIsDraggingVolume(true)
        handleVolumeInteraction(e.clientX)
    }

    // Global Mouse Move/Up for Drag
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingTime) handleTimelineInteraction(e.clientX)
            if (isDraggingVolume) handleVolumeInteraction(e.clientX)
        }
        const handleMouseUp = () => {
            if (isDraggingTime) handleTimelineMouseUp()
            setIsDraggingVolume(false)
        }

        if (isDraggingTime || isDraggingVolume) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDraggingTime, isDraggingVolume, currentTime])

    const timePercent = duration > 0 ? (currentTime / duration) * 100 : 0
    const noop = () => { }

    // Click outside to close URL input and Settings Menu
    // Click outside to close URL input and Settings Menu
    const urlInputRef = useRef<HTMLDivElement>(null)
    const settingsMenuRef = useRef<HTMLDivElement>(null)
    const settingsButtonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Close URL input if clicking outside
            if (showUrlInput && urlInputRef.current && !urlInputRef.current.contains(e.target as Node)) {
                // Don't close if clicking the globe button
                const globeButton = document.querySelector('[data-globe-button]')
                // Check if the target or any of its parents is the globe button
                const targetNode = e.target as Node;
                const isGlobeClick = (targetNode as Element).closest && (targetNode as Element).closest('[data-globe-button]');

                if (isGlobeClick) {
                    return
                }

                setShowUrlInput(false)
            }

            // Close settings if clicking outside
            if (showSettings) {
                // Handle text nodes (e.g. clicking text inside a button)
                let target = e.target as Node
                if (target.nodeType === 3 && target.parentNode) { // Node.TEXT_NODE
                    target = target.parentNode
                }

                const targetEl = target as Element

                // Use ref for menu, fallback to data attribute for button if ref not attached
                const isClickInsideMenu = settingsMenuRef.current?.contains(target)
                const isClickOnButton = settingsButtonRef.current?.contains(target) ||
                    (document.querySelector('[data-settings-button]')?.contains(target))
                const isClickInPortal = targetEl.closest && targetEl.closest('[data-dropdown-portal]')

                if (!isClickInsideMenu && !isClickOnButton && !isClickInPortal) {
                    setShowSettings(false)
                }
            }
        }

        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showUrlInput, showSettings])

    // Wheel listener removed (moved to App.tsx)

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (streamUrl && !isLoadingUrl) {
            setIsLoadingUrl(true)
            ipcRenderer.send('mpv-load', streamUrl)
            // Close input immediately as requested
            setShowUrlInput(false)
            setStreamUrl('')
        }
    }

    const handleOpenFile = async () => {
        const filePath = await ipcRenderer.invoke('open-file-dialog')
        if (filePath) {
            ipcRenderer.send('mpv-load', filePath)
        }
    }

    // ... (existing handlers)

    return (
        <div style={{
            position: 'absolute',
            bottom: '15px',
            left: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            zIndex: 50,
        }}>
            {/* Smoke/Fog overlay for visibility on bright videos */}
            <div style={{
                position: 'absolute',
                bottom: '-15px',
                left: 0,
                right: 0,
                height: '280px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.15) 75%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: -1,
                maskImage: 'radial-gradient(ellipse 140% 100% at 50% 100%, black 30%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse 140% 100% at 50% 100%, black 30%, transparent 80%)'
            }} />

            {/* Stream URL Input Overlay */}
            {/* Stream URL Input - Floating above timeline */}
            {showUrlInput && (
                <div
                    ref={urlInputRef}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    style={{
                        position: 'absolute',
                        bottom: '85px',
                        background: '#121212', // Solid background (requested: "no transparente")
                        padding: '8px 12px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        pointerEvents: 'auto',
                        zIndex: 100
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: 0 }}>
                        <Lock size={14} color="rgba(255,255,255,0.3)" style={{ opacity: streamUrl.startsWith('https') ? 1 : 0 }} />
                        <input
                            type="text"
                            placeholder="Enter Stream URL..."
                            value={streamUrl}
                            onChange={(e) => setStreamUrl(e.target.value)}
                            autoFocus
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                fontSize: '13px',
                                width: '220px',
                                outline: 'none',
                                fontFamily: 'Inter, sans-serif'
                            }}
                        />
                        <button type="submit" style={{
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}>Go</button>
                    </form>
                </div>
            )}

            {/* Controls Wrapper - catches hover events for the whole bottom area */}
            <div
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '20px', // Spacing between timeline and buttons
                    pointerEvents: 'auto', // Catch clicks/hover in this area
                    paddingBottom: '15px' // Extra hit area at bottom
                }}
            >
                {/* Floating Timeline */}
                <div
                    ref={timelineRef}
                    onMouseDown={handleTimelineMouseDown}
                    style={{
                        width: '60%',
                        maxWidth: '600px',
                        height: '4px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        position: 'relative',
                        cursor: 'pointer',
                        marginBottom: '10px'
                    }}
                >
                    {/* ... (Timeline Content) ... */}
                    <div style={{
                        width: `${timePercent}%`,
                        height: '100%',
                        background: '#fff',
                        borderRadius: '2px',
                        boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                    }}></div>

                    <div style={{
                        width: '12px',
                        height: '12px',
                        background: '#fff',
                        borderRadius: '50%',
                        position: 'absolute',
                        left: `${timePercent}%`,
                        transform: 'translateX(-50%)',
                        boxShadow: '0 0 15px #fff',
                        cursor: 'grab'
                    }}></div>

                    <span style={{ position: 'absolute', left: -45, fontSize: '12px', fontFamily: 'Inter', opacity: 0.7 }}>{formatTime(currentTime)}</span>
                    <span style={{ position: 'absolute', right: -45, fontSize: '12px', fontFamily: 'Inter', opacity: 0.7 }}>{formatTime(duration)}</span>
                </div>

                {/* Floating Buttons Cluster */}
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: '30px' }}
                >

                    {/* Left Tools */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

                        {/* Queue Toggle Button */}
                        <FloatingButton onClick={(e: any) => { e.stopPropagation(); setShowQueue(!showQueue) }} data-queue-button="true">
                            <ListMusic size={18} color={showQueue || localQueue.isQueueActive ? "#fff" : "rgba(255,255,255,0.7)"} />
                        </FloatingButton>

                        {/* Expandable Volume Control */}
                        <div
                            onMouseEnter={() => setShowVolume(true)}
                            onMouseLeave={() => !isDraggingVolume && setShowVolume(false)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: showVolume ? 'rgba(0,0,0,0.2)' : 'transparent',
                                borderRadius: '30px',
                                paddingRight: showVolume ? '12px' : '0',
                                transition: 'all 0.3s ease',
                                pointerEvents: 'auto'
                            }}
                        >
                            <FloatingButton onClick={toggleMute}>
                                {isMuted || volume === 0 ? <VolumeX size={18} color="#ff5555" /> : <Volume2 size={18} />}
                            </FloatingButton>

                            <div
                                style={{
                                    width: showVolume ? '80px' : '0px',
                                    opacity: showVolume ? 1 : 0,
                                    overflow: 'visible',
                                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginLeft: '5px'
                                }}
                            >
                                <div
                                    ref={volumeRef}
                                    onMouseDown={handleVolumeMouseDown}
                                    style={{
                                        width: '100%',
                                        height: '4px',
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: '2px',
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{
                                        width: `${isMuted ? 0 : Math.min(100, volume)}%`,
                                        height: '100%',
                                        background: '#fff',
                                        borderRadius: '2px',
                                        boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                                    }}></div>

                                    <div style={{
                                        width: '10px',
                                        height: '10px',
                                        background: '#fff',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        left: `${isMuted ? 0 : Math.min(100, volume)}%`,
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        boxShadow: '0 0 12px #fff',
                                        cursor: 'grab'
                                    }}></div>
                                </div>

                                <span style={{
                                    fontSize: '11px',
                                    fontFamily: 'Inter',
                                    opacity: 0.7,
                                    marginLeft: '8px',
                                    minWidth: '32px',
                                    textAlign: 'right'
                                }}>
                                    {isMuted ? '0' : Math.round(volume)}%
                                </span>
                            </div>
                        </div>

                        <FloatingButton onClick={handleOpenFile}>
                            <FolderOpen size={18} color="rgba(255,255,255,0.7)" />
                        </FloatingButton>

                        <FloatingButton onClick={(e: any) => {
                            console.log('Globe button clicked!', { isLoadingUrl, showUrl: showUrlInput });
                            e.stopPropagation();
                            if (!isLoadingUrl) {
                                console.log('Toggling showUrlInput to:', !showUrlInput);
                                setShowUrlInput(!showUrlInput)
                            } else {
                                console.log('Action blocked: isLoadingUrl is true');
                            }
                        }} data-globe-button="true">
                            {isLoadingUrl ? (
                                <div className="loader"></div>
                            ) : (
                                <Globe size={18} color={showUrlInput ? "#fff" : "rgba(255,255,255,0.7)"} />
                            )}
                        </FloatingButton>
                    </div>

                    {/* Playback Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {/* Previous in Playlist or Local Queue */}
                        {(isPlaylistActive || localQueue.isQueueActive) && (
                            <FloatingButton
                                onClick={() => {
                                    if (isPlaylistActive) playPrevious()
                                    else localQueue.playPrevious()
                                }}
                                style={{ opacity: (isPlaylistActive ? currentIndex > 0 : localQueue.currentIndex > 0) ? 1 : 0.3 }}
                            >
                                <ChevronLeft size={20} />
                            </FloatingButton>
                        )}

                        <FloatingButton onClick={() => ipcRenderer.send('mpv-jump', -10)}><SkipBack size={24} fill="#fff" /></FloatingButton>

                        <FloatingButton onClick={togglePlay} hero>
                            {isPlaying ? (
                                <Pause size={28} fill="#fff" stroke="none" />
                            ) : (
                                <Play size={28} fill="#fff" stroke="none" style={{ marginLeft: '4px' }} />
                            )}
                        </FloatingButton>

                        <FloatingButton onClick={() => ipcRenderer.send('mpv-jump', 10)}><SkipForward size={24} fill="#fff" /></FloatingButton>

                        {(isPlaylistActive || localQueue.isQueueActive) && (
                            <FloatingButton
                                onClick={() => {
                                    if (isPlaylistActive) playNext()
                                    else localQueue.playNext()
                                }}
                                style={{ opacity: (isPlaylistActive ? currentIndex < totalItems - 1 : localQueue.currentIndex < localQueue.totalItems - 1) ? 1 : 0.3 }}
                            >
                                <ChevronRight size={20} />
                            </FloatingButton>
                        )}
                    </div>


                    {/* Right Tools - Cleaner, just Settings + Fullscreen */}
                    <div style={{ display: 'flex', gap: '15px' }}>

                        {/* Watch Party Button with Active Indicator */}
                        <FloatingButton onClick={(e: any) => {
                            e.stopPropagation();
                            toggleWatchParty();
                            setShowHistory(false);
                            setShowSettings(false);
                        }} data-watch-party-button="true">
                            <Users size={20} color={watchPartyActive ? "#8b5cf6" : "rgba(255,255,255,0.7)"} style={watchPartyActive ? { filter: 'drop-shadow(0 0 5px #8b5cf6)' } : {}} />
                        </FloatingButton>

                        <FloatingButton onClick={(e: any) => {
                            e.stopPropagation();
                            toggleRemote();
                            setShowHistory(false); // Close History
                            setShowSettings(false); // Close Settings (if open)
                        }} data-remote-button="true">
                            <Smartphone size={20} color={remoteConnected ? "#3b82f6" : "rgba(255,255,255,0.7)"} style={remoteConnected ? { filter: 'drop-shadow(0 0 5px #3b82f6)' } : {}} />
                        </FloatingButton>

                        <FloatingButton onClick={(e: any) => {
                            e.stopPropagation();
                            setShowHistory(!showHistory);
                            if (!showHistory) setShowSettings(false); // Close Settings if opening History 
                        }} data-history-button="true">
                            <History size={20} color={showHistory ? "#fff" : "rgba(255,255,255,0.7)"} />
                        </FloatingButton>

                        <FloatingButton onClick={(e: any) => {
                            e.stopPropagation();
                            setShowSettings(!showSettings);
                            if (!showSettings) setShowHistory(false); // Close History if opening Settings
                        }} data-settings-button="true">
                            <Settings size={20} color={showSettings ? "#fff" : "rgba(255,255,255,0.7)"} />
                        </FloatingButton>

                        <FloatingButton onClick={() => { ipcRenderer.send('toggle-fullscreen'); setIsFullscreen(!isFullscreen) }}>
                            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                        </FloatingButton>
                    </div>
                </div>
            </div>



            {/* Settings Menu Overlay */}
            {
                showSettings && (
                    <div ref={settingsMenuRef} style={{ display: 'contents' }}>
                        <SettingsMenu
                            onClose={() => setShowSettings(false)}
                            currentTracks={tracks}
                            showStats={showStats}
                            toggleStats={toggleStats}
                            hwDec={hwDec}
                            setHwDec={setHwDec}
                            anime4K={anime4K}
                            setAnime4K={setAnime4K}
                            loopState={loopState}
                            setLoopState={setLoopState}
                            filename={filename}
                            alwaysOnTop={alwaysOnTop}
                            setAlwaysOnTop={setAlwaysOnTop}
                            isPlaying={isPlaying}
                        />
                    </div>
                )
            }

            {/* History Panel */}
            <HistoryPanel
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                history={history}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onPlayItem={(url) => {
                    setIsLoadingUrl(true)
                    ipcRenderer.send('mpv-load', url)
                    setShowHistory(false)
                }}
                onRemoveItem={removeFromHistory}
                onClearAll={clearHistory}
            />

            {/* Local Queue Panel (Left Side) */}
            <LocalQueuePanel
                isOpen={showQueue}
                onClose={() => setShowQueue(false)}
                queue={localQueue.queue}
                currentIndex={localQueue.currentIndex}
                onPlayIndex={localQueue.playIndex}
                onAddFiles={localQueue.addFiles}
                onRemoveItem={localQueue.removeItem}
                onClearQueue={localQueue.clearQueue}
                onReorder={localQueue.reorder}
            />
            {/* Remote Modal (Moved to App.tsx) */}
        </div>
    )
}
