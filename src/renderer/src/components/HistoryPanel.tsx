import React from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Trash2, Clock, Play } from 'lucide-react'
import { HistoryItem } from '../hooks/useHistory'

const { ipcRenderer } = (window as any).require('electron')

interface HistoryPanelProps {
    isOpen: boolean
    onClose: () => void
    history: HistoryItem[]
    searchQuery: string
    setSearchQuery: (query: string) => void
    onPlayItem: (url: string) => void
    onRemoveItem: (id: string) => void
    onClearAll: () => void
}

/**
 * Format duration in seconds to mm:ss or hh:mm:ss
 */
function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '--:--'

    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format timestamp to relative time (e.g., "2h ago", "Yesterday")
 */
function formatRelativeTime(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`

    return new Date(timestamp).toLocaleDateString()
}

export default function HistoryPanel({
    isOpen,
    onClose,
    history,
    searchQuery,
    setSearchQuery,
    onPlayItem,
    onRemoveItem,
    onClearAll
}: HistoryPanelProps) {
    if (!isOpen) return null

    const panelContent = (
        <div
            style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: 'clamp(260px, 38vw, 340px)',
                maxWidth: '90vw',
                height: '100vh',
                background: 'rgba(12, 12, 12, 0.98)',
                backdropFilter: 'blur(20px)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInRight 0.3s ease-out',
                pointerEvents: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div style={{
                padding: 'clamp(12px, 2.5vw, 20px)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 1vw, 10px)' }}>
                    <Clock size={18} color="rgba(255,255,255,0.7)" />
                    <h2 style={{
                        margin: 0,
                        fontSize: 'clamp(12px, 1.8vw, 16px)',
                        fontWeight: 600,
                        color: '#fff',
                        fontFamily: 'Inter, sans-serif'
                    }}>
                        History
                    </h2>
                    {history.length > 0 && (
                        <span style={{
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.4)',
                            background: 'rgba(255,255,255,0.1)',
                            padding: '2px 8px',
                            borderRadius: '10px'
                        }}>
                            {history.length}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    {history.length > 0 && (
                        <button
                            onClick={onClearAll}
                            style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                color: 'rgba(255,255,255,0.6)',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,60,60,0.9)'; e.currentTarget.style.color = '#fff' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                        >
                            <Trash2 size={12} />
                            Clear
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderRadius: '8px',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'rgba(255,255,255,0.6)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '12px 20px' }}>
                <div style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <Search
                        size={16}
                        color="rgba(255,255,255,0.4)"
                        style={{ position: 'absolute', left: '12px' }}
                    />
                    <input
                        type="text"
                        placeholder="Search history..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px',
                            padding: '10px 12px 10px 38px',
                            color: '#fff',
                            fontSize: '13px',
                            fontFamily: 'Inter, sans-serif',
                            outline: 'none',
                            transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                </div>
            </div>

            {/* History List */}
            <div
                className="custom-scroll settings-content"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '0 12px 20px'
                }}
            >
                {history.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '200px',
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: '13px',
                        textAlign: 'center'
                    }}>
                        <Clock size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                        {searchQuery ? 'No results found' : 'No history yet'}
                    </div>
                ) : (
                    history.map((item) => (
                        <HistoryItemCard
                            key={item.id}
                            item={item}
                            onPlay={() => onPlayItem(item.url)}
                            onRemove={() => onRemoveItem(item.id)}
                        />
                    ))
                )}
            </div>
        </div>
    )

    return createPortal(panelContent, document.body)
}

/**
 * Individual history item card
 */
function HistoryItemCard({
    item,
    onPlay,
    onRemove
}: {
    item: HistoryItem
    onPlay: () => void
    onRemove: () => void
}) {
    const [isHovered, setIsHovered] = React.useState(false)

    return (
        <div
            onClick={onPlay}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                gap: '12px',
                padding: '10px',
                marginBottom: '6px',
                borderRadius: '10px',
                background: isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isHovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
            }}
        >
            {/* Thumbnail */}
            <div style={{
                width: '80px',
                height: '45px',
                borderRadius: '6px',
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.08)',
                flexShrink: 0,
                position: 'relative'
            }}>
                {item.thumbnail ? (
                    <img
                        src={item.thumbnail}
                        alt=""
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                        onError={(e) => {
                            e.currentTarget.style.display = 'none'
                        }}
                    />
                ) : (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Play size={20} color="rgba(255,255,255,0.3)" />
                    </div>
                )}

                {/* Duration badge */}
                <span style={{
                    position: 'absolute',
                    bottom: '3px',
                    right: '3px',
                    background: 'rgba(0,0,0,0.8)',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 600,
                    padding: '2px 4px',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                }}>
                    {formatDuration(item.duration)}
                </span>
            </div>

            {/* Info */}
            <div style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '4px',
                paddingRight: isHovered ? '28px' : '0'
            }}>
                <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontFamily: 'Inter, sans-serif'
                }}>
                    {item.title}
                </div>
                <div style={{
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.4)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {item.channel} • {formatRelativeTime(item.watchedAt)}
                </div>
            </div>

            {/* Delete Button - Only visible on hover */}
            {isHovered && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove()
                    }}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        right: '8px',
                        transform: 'translateY(-50%)',
                        background: 'rgba(255,80,80,0.15)',
                        border: 'none',
                        borderRadius: '6px',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#ff6b6b',
                        transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,80,80,0.3)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,80,80,0.15)'
                    }}
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    )
}
