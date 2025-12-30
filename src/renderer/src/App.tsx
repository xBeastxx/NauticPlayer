import { useState, useEffect, DragEvent } from 'react'
import Player from './components/Player'
import Controls from './components/Controls'
import './assets/premium.css'
import { Minus, X } from 'lucide-react'

const { ipcRenderer } = (window as any).require('electron')

function App(): JSX.Element {
    const [isMaximized, setIsMaximized] = useState(false)
    const [isDragOver, setIsDragOver] = useState(false)

    // Listen for maximize state changes
    useEffect(() => {
        const handleMaximize = () => setIsMaximized(true)
        const handleUnmaximize = () => setIsMaximized(false)

        ipcRenderer.on('window-maximized', handleMaximize)
        ipcRenderer.on('window-unmaximized', handleUnmaximize)

        return () => {
            ipcRenderer.removeListener('window-maximized', handleMaximize)
            ipcRenderer.removeListener('window-unmaximized', handleUnmaximize)
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
        setIsDragOver(false)
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        const files = e.dataTransfer.files
        if (files.length > 0) {
            const filePath = (files[0] as any).path
            console.log('Loading file:', filePath)
            ipcRenderer.send('mpv-load', filePath)
        }
    }

    // Auto-hide controls logic
    const [showControls, setShowControls] = useState(true)
    let hideTimeout: NodeJS.Timeout | null = null

    const handleMouseMove = () => {
        setShowControls(true)
        document.body.style.cursor = 'default'

        if (hideTimeout) clearTimeout(hideTimeout)

        hideTimeout = setTimeout(() => {
            // Only hide if playing (logic will be handled by Controls sending playing state or assumption)
            // Ideally we'd know if playing here. For now, we'll assume effectively always hide after 3s 
            // EXCEPT if hovering interactive elements (handled by CSS hover usually, but logical hide is better)
            setShowControls(false)
            document.body.style.cursor = 'none'
        }, 3000)
    }

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            if (hideTimeout) clearTimeout(hideTimeout)
        }
    }, [])

    // Placeholder for handleDragEnter, as it's used in the return but not defined in the instruction's function block
    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Optionally set isDragOver to true here if you want visual feedback immediately on enter
        // setIsDragOver(true); 
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
                background: 'transparent',
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
                    background: 'rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 500,
                    borderRadius: 'inherit',
                    pointerEvents: 'none' // Crucial to prevent flickering
                }}>
                    <div style={{
                        fontSize: '24px',
                        fontWeight: 300,
                        color: '#fff',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
                        Drop to Play
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
                {/* Minimize Button */}
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
                {/* Close Button */}
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

            {/* Main Player Area - Removed as MPV handles rendering */}
            {/* <Player className="player-wrapper" /> */}

            {/* Overlay UI */}
            <div style={{
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: showControls ? 'auto' : 'none'
            }}>
                <Controls />
            </div>
        </div>
    )
}

export default App
