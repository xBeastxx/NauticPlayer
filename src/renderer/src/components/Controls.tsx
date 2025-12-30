import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2, Minimize2, Monitor, Settings } from 'lucide-react'

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

export default function Controls(): JSX.Element {
    // Playback State
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(260) // 4:20 in seconds
    const [duration, setDuration] = useState(765) // 12:45 in seconds

    // Volume State
    const [showVolume, setShowVolume] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [volume, setVolume] = useState(50)
    const [prevVolume, setPrevVolume] = useState(50)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Drag State
    const [isDraggingTime, setIsDraggingTime] = useState(false)
    const [isDraggingVolume, setIsDraggingVolume] = useState(false)
    const timelineRef = useRef<HTMLDivElement>(null)
    const volumeRef = useRef<HTMLDivElement>(null)

    const togglePlay = () => setIsPlaying(!isPlaying)

    const toggleMute = () => {
        if (isMuted) {
            setIsMuted(false)
            setVolume(prevVolume > 0 ? prevVolume : 50)
        } else {
            setPrevVolume(volume)
            setVolume(0)
            setIsMuted(true)
        }
    }

    // Timeline Drag Handlers
    const handleTimelineInteraction = (clientX: number) => {
        if (!timelineRef.current) return
        const rect = timelineRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        setCurrentTime(Math.round(percent * duration))
    }

    const handleTimelineMouseDown = (e: React.MouseEvent) => {
        setIsDraggingTime(true)
        handleTimelineInteraction(e.clientX)
    }

    // Volume Drag Handlers
    const handleVolumeInteraction = (clientX: number) => {
        if (!volumeRef.current) return
        const rect = volumeRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const newVol = Math.round(percent * 100)
        setVolume(newVol)
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
            setIsDraggingTime(false)
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
    }, [isDraggingTime, isDraggingVolume])

    const timePercent = (currentTime / duration) * 100
    const noop = () => { }

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
                {/* Fill with glow */}
                <div style={{
                    width: `${timePercent}%`,
                    height: '100%',
                    background: '#fff',
                    borderRadius: '2px',
                    boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                }}></div>

                {/* Knob */}
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

                {/* Time Labels */}
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
                            {/* Custom Volume Slider */}
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
                                {/* Fill with glow */}
                                <div style={{
                                    width: `${volume}%`,
                                    height: '100%',
                                    background: '#fff',
                                    borderRadius: '2px',
                                    boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                                }}></div>

                                {/* Knob */}
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

                    <FloatingButton onClick={noop}><Monitor size={18} /></FloatingButton>
                </div>

                {/* Playback Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <FloatingButton onClick={noop}><SkipBack size={24} fill="#fff" /></FloatingButton>

                    <FloatingButton onClick={togglePlay} hero>
                        {isPlaying ? (
                            <Pause size={28} fill="#fff" stroke="none" />
                        ) : (
                            <Play size={28} fill="#fff" stroke="none" style={{ marginLeft: '4px' }} />
                        )}
                    </FloatingButton>

                    <FloatingButton onClick={noop}><SkipForward size={24} fill="#fff" /></FloatingButton>
                </div>

                {/* Right Tools */}
                <div style={{ display: 'flex', gap: '15px' }}>
                    <FloatingButton onClick={noop}><Settings size={18} /></FloatingButton>
                    <FloatingButton onClick={() => { ipcRenderer.send('toggle-fullscreen'); setIsFullscreen(!isFullscreen) }}>
                        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </FloatingButton>
                </div>

            </div>

        </div>
    )
}
