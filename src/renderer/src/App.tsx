import { useState, useEffect } from 'react'
import Player from './components/Player'
import Controls from './components/Controls'
import './assets/premium.css'
import { Minus, X } from 'lucide-react'

const { ipcRenderer } = (window as any).require('electron')

function App(): JSX.Element {
    const [isMaximized, setIsMaximized] = useState(false)

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

    return (
        <div className="container" style={{
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            position: 'relative',
            borderRadius: isMaximized ? '0' : '24px',
            background: 'radial-gradient(circle at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.85) 100%)',
            boxShadow: isMaximized ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.05)',
            transition: 'border-radius 0.3s ease, box-shadow 0.3s ease'
        }}>
            {/* Draggable Title Bar Area */}
            <div className="drag-region" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '40px',
                zIndex: 100,
                WebkitAppRegion: 'drag'
            } as any}></div>

            {/* Window Controls (Top Right) */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '15px',
                display: 'flex',
                gap: '8px',
                zIndex: 200,
                WebkitAppRegion: 'no-drag'
            } as any}>
                {/* Minimize Button */}
                <button
                    onClick={() => ipcRenderer.send('minimize-window')}
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

            {/* Main Player Area */}
            <Player className="player-wrapper" />

            {/* Overlay UI */}
            <Controls />
        </div>
    )
}

export default App
