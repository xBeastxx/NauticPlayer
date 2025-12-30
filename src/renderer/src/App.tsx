import { useState, useEffect, useRef, DragEvent } from 'react'
import Player from './components/Player'
import Controls from './components/Controls'
import './assets/premium.css'
import { Minus, X } from 'lucide-react'
import appIcon from './assets/NauticPlayerIcon.ico'
// Note: assuming FondoInicio.png is in assets as verified. If not, fallback to appIcon.
import startupImg from './assets/NauticPlayerHello-.png'

const { ipcRenderer } = (window as any).require('electron')

function App(): JSX.Element {
    const [isMaximized, setIsMaximized] = useState(false)
    const [isDragOver, setIsDragOver] = useState(false)
    const [hasStarted, setHasLoadedFile] = useState(false)

    // Listen for maximize state changes
    useEffect(() => {
        const handleMaximize = () => setIsMaximized(true)
        const handleUnmaximize = () => setIsMaximized(false)

        // Listen for playback to hide welcome screen
        const onMpvDuration = () => setHasLoadedFile(true)

        ipcRenderer.on('window-maximized', handleMaximize)
        ipcRenderer.on('window-unmaximized', handleUnmaximize)
        ipcRenderer.on('mpv-duration', onMpvDuration)

        return () => {
            ipcRenderer.removeListener('window-maximized', handleMaximize)
            ipcRenderer.removeListener('window-unmaximized', handleUnmaximize)
            ipcRenderer.removeListener('mpv-duration', onMpvDuration)
        }
    }, [])

    // Drag and Drop handlers
    const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        // Only disable if we are actually leaving the container (not just entering a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false)
        }
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
        setHasLoadedFile(true)

        const files = e.dataTransfer.files
        if (files.length > 0) {
            const filePath = (files[0] as any).path
            console.log('Loading file:', filePath)
            ipcRenderer.send('mpv-load', filePath)
        }
    }

    // Auto-hide controls logic
    const [showControls, setShowControls] = useState(true)
    const [showSettings, setShowSettings] = useState(false) // Lifted state
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleMouseMove = () => {
        setShowControls(true)
        document.body.style.cursor = 'default'

        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)

        hideTimeoutRef.current = setTimeout(() => {
            if (!showSettings) { // Only hide if settings are closed
                setShowControls(false)
                document.body.style.cursor = 'none'
            }
        }, 1500)
    }

    // Force controls visible if settings are open
    useEffect(() => {
        if (showSettings) {
            setShowControls(true)
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
            document.body.style.cursor = 'default'
        }
    }, [showSettings])

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
        }
    }, [showSettings]) // Re-bind capability if needed, or better yet, use ref for showSettings or just rely on state closure if we used a ref. 
    // actually handleMouseMove captures the scope variable. 'showSettings' will be stale in the timeout if we don't be careful.
    // Better to use a ref for showSettings or recreate the handler.
    // Simplest is to add showSettings to dependency array.

    // Placeholder for handleDragEnter
    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div
            className="container"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                width: '100vw',
                height: '100vh',
                overflow: 'hidden',
                position: 'relative',
                borderRadius: '0',
                background: hasStarted ? 'transparent' : 'rgba(0, 0, 0, 0.7)',
                backdropFilter: hasStarted ? 'none' : 'blur(20px)',
                boxShadow: 'none',
            }}
        >
            {/* Drag Overlay */}
            {isDragOver && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.0)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 500,
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                    transition: 'all 0.2s ease'
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'scale(1.2)',
                        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}>
                        <div style={{
                            marginBottom: '15px',
                            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))',
                            transform: 'scale(1.1)'
                        }}>
                            <img src={appIcon} alt="Drop to play" style={{ width: '96px', height: '96px' }} />
                        </div>
                        <span style={{
                            fontSize: '18px',
                            fontWeight: 600,
                            color: '#fff',
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                            fontFamily: 'Inter, sans-serif',
                            letterSpacing: '0.5px'
                        }}>
                            Drop File
                        </span>
                    </div>
                </div>
            )}

            {/* Startup/Welcome Overlay */}
            {!isDragOver && !hasStarted && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 400,
                    pointerEvents: 'none'
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.8
                    }}>
                        <div style={{
                            marginBottom: '15px',
                            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))'
                        }}>
                            <img src={startupImg} alt="Welcome" style={{ width: '350px', height: 'auto' }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Draggable Title Bar Area */}
            <div className="drag-region" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '40px',
                zIndex: 100,
                WebkitAppRegion: showControls ? 'drag' : 'no-drag'
            } as any}></div>

            {/* Window Controls (Top Right) */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '15px',
                display: 'flex',
                gap: '8px',
                zIndex: 200,
                WebkitAppRegion: 'no-drag',
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: showControls ? 'auto' : 'none'
            } as any}>
                <button
                    onClick={() => ipcRenderer.send('minimize-window')}
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '0',
                        border: 'none',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                >
                    <Minus size={14} />
                </button>
                <button
                    onClick={() => ipcRenderer.send('close-window')}
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,80,80,0.6)'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Overlay UI */}
            <div style={{
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: showControls ? 'auto' : 'none'
            }}>
                <Controls showSettings={showSettings} setShowSettings={setShowSettings} />
            </div>
        </div>
    )
}

export default App
