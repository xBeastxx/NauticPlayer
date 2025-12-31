import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const { ipcRenderer } = (window as any).require('electron')

interface LegalModalProps {
    filename: string;
    title: string;
    onClose: () => void;
}

export default function LegalModal({ filename, title, onClose }: LegalModalProps): JSX.Element {
    const [content, setContent] = useState<string>('Loading...')

    useEffect(() => {
        ipcRenderer.invoke('get-legal-content', filename).then(setContent)
    }, [filename])

    // Simple parser to make Markdown look nice without heavy libraries
    const renderContent = (text: string) => {
        return text.split('\n').map((line, i) => {
            if (line.startsWith('# ')) {
                return <h1 key={i} style={{ fontSize: '24px', fontWeight: 700, margin: '25px 0 15px', color: '#fff' }}>{line.replace('# ', '')}</h1>
            }
            if (line.startsWith('## ')) {
                return <h2 key={i} style={{ fontSize: '18px', fontWeight: 600, margin: '20px 0 10px', color: '#3b82f6' }}>{line.replace('## ', '')}</h2>
            }
            if (line.startsWith('### ')) {
                return <h3 key={i} style={{ fontSize: '16px', fontWeight: 600, margin: '15px 0 10px', color: 'rgba(255,255,255,0.9)' }}>{line.replace('### ', '')}</h3>
            }
            if (line.startsWith('- ')) {
                return <li key={i} style={{ marginLeft: '20px', marginBottom: '8px', color: 'rgba(255,255,255,0.8)' }}>{line.replace('- ', '').replace(/\*\*(.*?)\*\*/g, (_, p1) => `<strong>${p1}</strong>`)}</li> // Hacky bold support
            }
            if (line.trim() === '') {
                return <div key={i} style={{ height: '10px' }}></div>
            }
            // Basic Bold parsing for paragraphs
            const parts = line.split(/(\*\*.*?\*\*)/g)
            return (
                <p key={i} style={{ marginBottom: '10px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)' }}>
                    {parts.map((part, j) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={j} style={{ color: '#fff' }}>{part.slice(2, -2)}</strong>
                        }
                        return part
                    })}
                </p>
            )
        })
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999, // Above everything
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                position: 'relative',
                width: '600px',
                maxWidth: '90vw',
                height: '80vh',
                background: '#0f0f0f', // Solid dark base
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 25px 80px rgba(0,0,0,0.7)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
                onClick={(e) => e.stopPropagation()} // Stop click from closing parent if any
            >
                {/* Header */}
                <div style={{
                    padding: '20px 30px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.02)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#fff' }}>{title}</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(255, 80, 80, 0.2)'
                            e.currentTarget.style.color = '#ffaaaa'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="custom-scroll" style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '30px 40px',
                    fontSize: '15px',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    {renderContent(content)}

                    <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                        NauticPlayer Legal Information &bull; &copy; 2024 NauticGames&trade;
                    </div>
                </div>
            </div>
        </div>
    )
}
