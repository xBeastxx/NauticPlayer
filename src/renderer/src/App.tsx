import { useState, useEffect, useRef, DragEvent } from 'react'
import Player from './components/Player'
import Controls from './components/Controls'
import './assets/premium.css'
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react'
import appIcon from './assets/NauticPlayerIcon.ico'
// Note: assuming FondoInicio.png is in assets as verified. If not, fallback to appIcon.
import startupImg from './assets/NauticPlayerHello-.png'

const { ipcRenderer } = (window as any).require('electron')

function App(): JSX.Element {
    const [isMaximized, setIsMaximized] = useState(false)
    const [isDragOver, setIsDragOver] = useState(false)
    const [hasStarted, setHasLoadedFile] = useState(false)
    const [toastMsg, setToastMsg] = useState('')
    const [filename, setFilename] = useState('')

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

    // Toast Listener
    useEffect(() => {
        const onMpvMsg = (_: any, text: string) => {
            setToastMsg(text)
            setTimeout(() => setToastMsg(''), 5000) // 5 seconds
        }
        ipcRenderer.on('mpv-msg', onMpvMsg)

        ipcRenderer.on('mpv-filename', (_: any, name: string) => {
            console.log('Filename update:', name)
            setFilename(name)
        })

        // Listen for files opened via CLI/Open With
        ipcRenderer.on('mpv-load-file', (_: any, filePath: string) => {
            console.log('CLI Open File:', filePath)
            ipcRenderer.send('mpv-load', filePath)
            setHasLoadedFile(true)
        })

        return () => {
            ipcRenderer.removeListener('mpv-msg', onMpvMsg)
            ipcRenderer.removeAllListeners('mpv-filename')
            ipcRenderer.removeAllListeners('mpv-load-file')
        }
    }, [])

    // Drag and Drop handlers - Only show overlay for real FILES, not internal drags
    const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
        // Only show drop overlay if dragging real files (not internal elements)
        if (e.dataTransfer?.types?.includes('Files')) {
            setIsDragOver(true)
        }
    }

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault()

        // Only disable if we are actually leaving the container (not just entering a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false)
        }
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)

        // Check for real files first (from file explorer)
        const files = e.dataTransfer.files
        if (files.length > 0) {
            setHasLoadedFile(true)
            const filePath = (files[0] as any).path
            console.log('Loading file:', filePath)
            ipcRenderer.send('mpv-load', filePath)
            return
        }

        // Check for queue item drop (text/plain contains file path)
        const queueItemPath = e.dataTransfer.getData('text/plain')
        if (queueItemPath && queueItemPath.length > 0) {
            console.log('Loading from queue drop:', queueItemPath)
            setHasLoadedFile(true)
            ipcRenderer.send('mpv-load', queueItemPath)
        }
    }

    // Auto-hide controls logic
    const [showControls, setShowControls] = useState(true)
    const [showSettings, setShowSettings] = useState(false) // Lifted state
    const [isHoveringControls, setIsHoveringControls] = useState(false)
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [subDelay, setSubDelay] = useState(0) // Track subtitle delay

    // URL Loading State (Lifted from Controls to manage visibility)
    const [isLoadingUrl, setIsLoadingUrl] = useState(false)
    const [showUrlInput, setShowUrlInput] = useState(false)

    // Force controls visibility when loading URL or URL Input is open
    useEffect(() => {
        if (isLoadingUrl || showUrlInput) {
            setShowControls(true)
            document.body.style.cursor = 'default'
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
        }
    }, [isLoadingUrl, showUrlInput])

    const handleMouseMove = () => {
        setShowControls(true)
        document.body.style.cursor = 'default'

        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)

        // Only schedule hide if NOT hovering controls, NOT in settings, NOT loading URL, and NOT typing URL
        if (!isHoveringControls && !showSettings && !isLoadingUrl && !showUrlInput) {
            hideTimeoutRef.current = setTimeout(() => {
                setShowControls(false)
                document.body.style.cursor = 'none'
            }, 1500)
        }
    }

    // Effect to cancel/restart timeout when hover state changes
    useEffect(() => {
        if (isHoveringControls) {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
            setShowControls(true)
            document.body.style.cursor = 'default'
        } else {
            // Resume hiding logic if mouse stops moving
            handleMouseMove()
        }
    }, [isHoveringControls])

    // Listen for sub-delay changes from MPV
    useEffect(() => {
        const handleSubDelay = (_: any, delay: number) => {
            setSubDelay(delay)
        }
        ipcRenderer.on('mpv-sub-delay', handleSubDelay)
        return () => {
            ipcRenderer.removeListener('mpv-sub-delay', handleSubDelay)
        }
    }, [])

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

        // Keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return
            }

            // Prevent default for media keys to avoid conflicts
            if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault()
            }

            if (e.key === ' ') {
                // Space = Play/Pause
                ipcRenderer.send('mpv-toggle')
            } else if (e.key === 'ArrowLeft') {
                // Left = Rewind 5s
                ipcRenderer.send('mpv-seek', -5)
            } else if (e.key === 'ArrowRight') {
                // Right = Forward 5s
                ipcRenderer.send('mpv-seek', 5)
            } else if (e.key === 'ArrowUp') {
                // Up = Volume +5%
                ipcRenderer.send('mpv-command', ['add', 'volume', 5])
            } else if (e.key === 'ArrowDown') {
                // Down = Volume -5%
                ipcRenderer.send('mpv-command', ['add', 'volume', -5])
            } else if (e.key === 'g' || e.key === 'G') {
                // G = Advance subtitles (increase delay)
                const newDelay = subDelay + 0.1
                setSubDelay(newDelay)
                ipcRenderer.send('mpv-adjust-sub-delay', 0.1)
                setToastMsg(`Subtitles ${newDelay >= 0 ? '+' : ''}${newDelay.toFixed(1)}s`)
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
                toastTimeoutRef.current = setTimeout(() => setToastMsg(''), 3500)
            } else if (e.key === 'h' || e.key === 'H') {
                // H = Delay subtitles (decrease delay)
                const newDelay = subDelay - 0.1
                setSubDelay(newDelay)
                ipcRenderer.send('mpv-adjust-sub-delay', -0.1)
                setToastMsg(`Subtitles ${newDelay >= 0 ? '+' : ''}${newDelay.toFixed(1)}s`)
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
                toastTimeoutRef.current = setTimeout(() => setToastMsg(''), 3500)
            }
        }

        window.addEventListener('keydown', handleKeyDown)

        // Mouse Wheel Volume Control
        const handleWheel = (e: WheelEvent) => {
            // Allow scrolling in modals/settings if the target is within a scrollable container
            const target = e.target as HTMLElement;
            if (target.closest('.custom-scroll')) {
                return; // Let default scroll happen
            }

            e.preventDefault();

            // Debounce or threshold could be useful, but mpv handles rapid volume changes well.
            if (e.deltaY < 0) {
                // Scroll Up -> Volume Up
                ipcRenderer.send('mpv-command', ['add', 'volume', 5]);
            } else if (e.deltaY > 0) {
                // Scroll Down -> Volume Down
                ipcRenderer.send('mpv-command', ['add', 'volume', -5]);
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('wheel', handleWheel);
        }
    }, [showSettings, subDelay, isHoveringControls, isLoadingUrl, showUrlInput]) // Fixed stale closure 
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
                background: hasStarted ? 'rgba(0, 0, 0, 0.01)' : 'rgba(0, 0, 0, 0.7)',
                backdropFilter: hasStarted ? 'none' : 'blur(20px)',
                boxShadow: 'none'
                // pointerEvents defaults to 'auto' which allows drag/drop to work
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

            {/* Draggable Title Bar Area - Allows drops to pass through */}
            <div className="drag-region"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '30px',
                    zIndex: 700,
                    WebkitAppRegion: 'drag'
                } as any}
                onDragOver={(e) => {
                    e.preventDefault()
                    if (e.dataTransfer?.types?.includes('Files') || e.dataTransfer?.types?.includes('text/plain')) {
                        setIsDragOver(true)
                    }
                }}
                onDrop={(e) => {
                    e.preventDefault()
                    handleDrop(e as any)
                }}
            ></div>

            {/* Now Playing Title (Top Left) */}
            {hasStarted && filename && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '15px',
                    maxWidth: 'calc(100% - 150px)',
                    zIndex: 800,
                    opacity: showControls ? 1 : 0,
                    transition: 'opacity 0.5s ease',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {/* Smoke background */}
                    <div style={{
                        position: 'absolute',
                        top: '-30px',
                        left: '-40px',
                        width: '200px',
                        height: '100px',
                        background: 'radial-gradient(circle at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 70%)',
                        zIndex: -1,
                        pointerEvents: 'none',
                        filter: 'blur(15px)'
                    }}></div>
                    <span style={{
                        fontSize: 'clamp(11px, 1.4vw, 14px)',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500,
                        color: 'rgba(255,255,255,0.85)',
                        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {filename}
                    </span>
                </div>
            )}

            {/* Window Controls (Top Right) */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '15px',
                display: 'flex',
                gap: '8px',
                zIndex: 800, // Ensure controls differ from overlay (600) so they remain clickable
                WebkitAppRegion: 'no-drag',
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: showControls ? 'auto' : 'none'
            } as any}>
                {/* Smoke Fog Background for Controls */}
                <div style={{
                    position: 'absolute',
                    top: '-80px',
                    right: '-80px',
                    width: '180px',
                    height: '180px',
                    background: 'radial-gradient(circle at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)',
                    zIndex: -1,
                    pointerEvents: 'none',
                    filter: 'blur(10px)'
                }}></div>
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
                position: 'absolute', // Changed to absolute to fill the container properly
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 600, // Ensure it sits above Welcome Screen (400) and Window Controls (200)
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: showControls ? 'auto' : 'none'
            }}>
                <Controls
                    showSettings={showSettings}
                    setShowSettings={setShowSettings}
                    filename={filename}
                    onMouseEnter={() => setIsHoveringControls(true)}
                    onMouseLeave={() => setIsHoveringControls(false)}
                    isLoadingUrl={isLoadingUrl}
                    setIsLoadingUrl={setIsLoadingUrl}
                    showUrlInput={showUrlInput}
                    setShowUrlInput={setShowUrlInput}
                />
            </div>

            {/* Toast Notification */}
            {toastMsg && (
                <div style={{
                    position: 'fixed',
                    bottom: '110px',
                    left: '20px',
                    background: 'transparent',
                    color: '#fff',
                    padding: '0',
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    zIndex: 9999,
                    textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                    animation: 'fadeIn 0.2s ease-out',
                    pointerEvents: 'none'
                }}>
                    {toastMsg}
                </div>
            )}
        </div>
    )
}

export default App
