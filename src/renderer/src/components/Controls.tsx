import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2, Minimize2, Monitor, Settings, Globe, Sparkles, Music, FolderOpen } from 'lucide-react'
import SettingsMenu from './SettingsMenu'

// Use window.require for Electron in Vite context
const { ipcRenderer } = (window as any).require('electron')

// Define the shape of our buttons
const FloatingButton = ({ children, onClick, hero = false }: any) => (
    <button
        className={`floating-btn ${hero ? 'hero-btn' : ''}`}
        onClick={onClick}
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

// Helper to format seconds to mm:ss
const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// ... imports

export default function Controls({ showSettings, setShowSettings }: any): JSX.Element {
    // Playback State
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [mpvReady, setMpvReady] = useState(false)

    // Volume State
    const [showVolume, setShowVolume] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [volume, setVolume] = useState(100)
    const [prevVolume, setPrevVolume] = useState(100)
    // URL Input State
    const [showUrlInput, setShowUrlInput] = useState(false)
    const [streamUrl, setStreamUrl] = useState('')
    const [isShaderOn, setIsShaderOn] = useState(false)
    // Settings State
    // const [showSettings, setShowSettings] = useState(false) <-- Lifted to App
    const [tracks, setTracks] = useState<any[]>([])

    // Persistent Settings (Lifted from SettingsMenu)
    const [hwDec, setHwDec] = useState(true)
    const [anime4K, setAnime4K] = useState(false)
    const [loopState, setLoopState] = useState<'none' | 'inf' | 'one'>('none')

    // Stats State
    const [showStats, setShowStats] = useState(false)

    const [isFullscreen, setIsFullscreen] = useState(false)

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
        }

        const onMpvTime = (_event: any, time: number) => {
            if (!isDraggingTime) setCurrentTime(time)
        }

        const onMpvDuration = (_event: any, dur: number) => {
            setDuration(dur)
        }

        const onMpvPaused = (_event: any, paused: boolean) => {
            setIsPlaying(!paused)
        }

        const onMpvVolume = (_event: any, vol: number) => {
            setVolume(vol)
        }

        const onMpvTracks = (_event: any, trackList: any[]) => {
            setTracks(trackList)
        }

        ipcRenderer.on('mpv-ready', onMpvReady)
        ipcRenderer.on('mpv-time', onMpvTime)
        ipcRenderer.on('mpv-duration', onMpvDuration)
        ipcRenderer.on('mpv-paused', onMpvPaused)
        ipcRenderer.on('mpv-volume', onMpvVolume)
        ipcRenderer.on('mpv-tracks', onMpvTracks)

        return () => {
            ipcRenderer.removeListener('mpv-ready', onMpvReady)
            ipcRenderer.removeListener('mpv-time', onMpvTime)
            ipcRenderer.removeListener('mpv-duration', onMpvDuration)
            ipcRenderer.removeListener('mpv-paused', onMpvPaused)
            ipcRenderer.removeListener('mpv-volume', onMpvVolume)
            ipcRenderer.removeListener('mpv-tracks', onMpvTracks)
        }
    }, [isDraggingTime])

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
            ipcRenderer.send('mpv-seek', currentTime)
        }
        setIsDraggingTime(false)
    }

    // Volume Drag Handlers
    const handleVolumeInteraction = (clientX: number) => {
        if (!volumeRef.current) return
        const rect = volumeRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const newVol = Math.round(percent * 100)
        setVolume(newVol)
        ipcRenderer.send('mpv-volume', newVol)
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

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (streamUrl) {
            ipcRenderer.send('mpv-load', streamUrl)
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
            pointerEvents: 'none'
        }}>
            {/* Stream URL Input Overlay */}
            {showUrlInput && (
                <div style={{
                    position: 'absolute',
                    bottom: '100px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(10px)',
                    padding: '15px',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    pointerEvents: 'auto',
                    display: 'flex',
                    gap: '10px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Paste YouTube/Twitch URL..."
                            value={streamUrl}
                            onChange={(e) => setStreamUrl(e.target.value)}
                            autoFocus
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#fff',
                                width: '250px',
                                outline: 'none',
                                fontFamily: 'Inter, sans-serif'
                            }}
                        />
                        <button type="submit" style={{
                            background: '#fff',
                            color: '#000',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}>Play</button>
                    </form>
                </div>
            )}

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
                    pointerEvents: 'auto',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>

                {/* Left Tools */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

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
                                    width: `${volume}%`,
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
                                    left: `${volume}%`,
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    boxShadow: '0 0 12px #fff',
                                    cursor: 'grab'
                                }}></div>
                            </div>
                        </div>
                    </div>

                    <FloatingButton onClick={handleOpenFile}>
                        <FolderOpen size={18} color="rgba(255,255,255,0.7)" />
                    </FloatingButton>

                    <FloatingButton onClick={() => setShowUrlInput(!showUrlInput)}>
                        <Globe size={18} color={showUrlInput ? "#fff" : "rgba(255,255,255,0.7)"} />
                    </FloatingButton>
                </div>

                {/* Playback Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <FloatingButton onClick={() => ipcRenderer.send('mpv-seek', currentTime - 10)}><SkipBack size={24} fill="#fff" /></FloatingButton>

                    <FloatingButton onClick={togglePlay} hero>
                        {isPlaying ? (
                            <Pause size={28} fill="#fff" stroke="none" />
                        ) : (
                            <Play size={28} fill="#fff" stroke="none" style={{ marginLeft: '4px' }} />
                        )}
                    </FloatingButton>

                    <FloatingButton onClick={() => ipcRenderer.send('mpv-seek', currentTime + 10)}><SkipForward size={24} fill="#fff" /></FloatingButton>
                </div>


                {/* Right Tools - Cleaner, just Settings + Fullscreen */}
                <div style={{ display: 'flex', gap: '15px' }}>

                    <FloatingButton onClick={() => setShowSettings(!showSettings)}>
                        <Settings size={20} color={showSettings ? "#fff" : "rgba(255,255,255,0.7)"} />
                    </FloatingButton>

                    <FloatingButton onClick={() => { ipcRenderer.send('toggle-fullscreen'); setIsFullscreen(!isFullscreen) }}>
                        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </FloatingButton>
                </div>
            </div>

            {/* URL Input Dialog */}
            {showUrlInput && (
                <div className="url-dialog-overlay" onClick={() => setShowUrlInput(false)}>
                    <div className="url-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>Open Network Stream</h3>
                        <input
                            type="text"
                            placeholder="Enter URL (YouTube, Twitch, direct link...)"
                            value={streamUrl}
                            onChange={(e) => setStreamUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    ipcRenderer.send('mpv-load', streamUrl)
                                    setShowUrlInput(false)
                                    setStreamUrl('')
                                }
                            }}
                            autoFocus
                        />
                        <div className="url-dialog-buttons">
                            <button onClick={() => setShowUrlInput(false)}>Cancel</button>
                            <button onClick={() => {
                                ipcRenderer.send('mpv-load', streamUrl)
                                setShowUrlInput(false)
                                setStreamUrl('')
                            }}>Play</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Menu Overlay */}
            {showSettings && (
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
                />
            )}
        </div>
    )
}
