import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { X, Smartphone, Wifi } from 'lucide-react'
import { createPortal } from 'react-dom'

// IPC Renderer
const { ipcRenderer } = (window as any).require('electron')

interface RemoteModalProps {
    onClose: () => void;
}

export default function RemoteModal({ onClose }: RemoteModalProps) {
    const [qrSrc, setQrSrc] = useState('')
    const [ips, setIps] = useState<string[]>([])
    const [selectedIp, setSelectedIp] = useState('')
    const [port, setPort] = useState(5678)

    useEffect(() => {
        ipcRenderer.invoke('get-remote-info').then((info: any) => {
            if (info) {
                const ipList = info.ips || []
                setIps(ipList)
                if (ipList.length > 0) setSelectedIp(ipList[0])
                setPort(info.port)
            }
        })
    }, [])

    useEffect(() => {
        if (selectedIp && port) {
            const url = `http://${selectedIp}:${port}`
            QRCode.toDataURL(url, {
                width: 300, margin: 1,
                color: { dark: '#000000', light: '#ffffff' }
            }).then(setQrSrc).catch(console.error)
        }
    }, [selectedIp, port])

    const currentUrl = `http://${selectedIp}:${port}`

    return createPortal(
        <div style={{
            position: 'fixed',
            inset: 0, // Top/Left/Right/Bottom: 0
            zIndex: 99999,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'grid',         // Grid centering is very robust
            placeItems: 'center',    // Perfectly centers child
            animation: 'fadeInOverlay 0.2s ease-out'
        }} onClick={onClose} onWheel={e => e.stopPropagation()}>
            <style>{`
                @keyframes fadeInOverlay {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes popInCenter {
                    0% { opacity: 0; transform: scale(0.8); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>

            <div style={{
                background: '#1a1a1a',
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '24px',
                width: '280px', // Smaller Width
                maxWidth: '90vw',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                position: 'relative',
                transformOrigin: 'center center',
                animation: 'popInCenter 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }} onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '15px', right: '15px',
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        color: 'rgba(255,255,255,0.7)',
                        borderRadius: '50%',
                        width: '28px', height: '28px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,50,50,0.2)'; e.currentTarget.style.color = '#ff5050' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                >
                    <X size={16} />
                </button>

                {/* Title */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        borderRadius: '10px',
                        width: '40px', height: '40px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.5)',
                        marginBottom: '4px'
                    }}>
                        <Smartphone size={20} color="#fff" />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>Nautic Remote</h2>
                    <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Control from your phone</p>
                </div>

                {/* QR Code Frame */}
                <div style={{
                    background: '#fff',
                    padding: '8px',
                    borderRadius: '14px',
                    width: '150px', height: '150px', // Smaller QR
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 0 4px rgba(255,255,255,0.1)'
                }}>
                    {qrSrc ? (
                        <img src={qrSrc} alt="Link QR" style={{ width: '100%', height: '100%', display: 'block', borderRadius: '4px' }} />
                    ) : (
                        <span style={{ color: '#000', fontSize: '10px' }}>Loading...</span>
                    )}
                </div>

                {/* IP Selection (if multi) */}
                {ips.length > 1 && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {ips.map(ip => (
                            <button key={ip} onClick={() => setSelectedIp(ip)} style={{
                                background: selectedIp === ip ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                border: `1px solid ${selectedIp === ip ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                                color: selectedIp === ip ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                                borderRadius: '6px', padding: '4px 8px', fontSize: '10px',
                                cursor: 'pointer', fontFamily: 'monospace'
                            }}>
                                {ip}
                            </button>
                        ))}
                    </div>
                )}

                {/* URL Pill */}
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '50px',
                    padding: '6px 14px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '11px',
                    maxWidth: '100%'
                }}>
                    <Wifi size={12} />
                    <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        {currentUrl.replace('http://', '')}
                    </span>
                </div>

            </div>
        </div>,
        document.body
    )
}
