/**
 * Watch Party Modal
 * UI for creating, joining, and managing synchronized viewing sessions
 */

import { useState, useEffect } from 'react'
import { Users, Copy, Check, X, UserPlus, Crown, Loader2, AlertCircle, Globe } from 'lucide-react'
import { PartyState, PartyGuest } from '../hooks/useWatchParty'

// ============================================================================
// TYPES
// ============================================================================

interface WatchPartyModalProps {
    isOpen: boolean
    onClose: () => void
    party: PartyState
    currentFilename: string
    currentDuration: number
    currentTime: number
    onCreateParty: (name: string, enableInternet: boolean) => Promise<{ success: boolean; shareUrl?: string; publicShareUrl?: string; error?: string }>

    onLeaveParty: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WatchPartyModal({
    isOpen,
    onClose,
    party,
    currentFilename,
    currentDuration,
    currentTime,
    onCreateParty,
    onLeaveParty
}: WatchPartyModalProps) {
    const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
    const [name, setName] = useState('')

    const [copied, setCopied] = useState(false)
    const [copiedPublic, setCopiedPublic] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            if (party.active) {
                setMode('menu') // Show active party view
            } else {
                setMode('menu')
            }
            setError(null)
            setCopied(false)
        }
    }, [isOpen, party.active])

    // Copy share URL to clipboard
    const copyShareUrl = async (isPublic: boolean = false) => {
        const urlToCopy = isPublic ? party.publicShareUrl : party.shareUrl
        if (urlToCopy) {
            try {
                await navigator.clipboard.writeText(urlToCopy)
                if (isPublic) {
                    setCopiedPublic(true)
                    setTimeout(() => setCopiedPublic(false), 2000)
                } else {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                }
            } catch (err) {
                console.error('Failed to copy:', err)
            }
        }
    }

    // Handle create party
    const handleCreate = async () => {
        if (!name.trim()) {
            setError('Please enter your name')
            return
        }
        if (!currentFilename || currentFilename === 'No Media') {
            setError('Please open a video first')
            return
        }

        setError(null)
        // Always enable internet for both LAN and global access
        const result = await onCreateParty(name.trim(), true)

        if (!result.success) {
            setError(result.error || 'Failed to create party')
        }
    }



    // Handle leave/end party
    const handleLeave = () => {
        onLeaveParty()
        setMode('menu')
    }

    if (!isOpen) return null

    return (
        <div className="watch-party-modal-overlay" onClick={onClose} onWheel={e => e.stopPropagation()}>
            <div className="watch-party-modal" onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
                {/* Header */}
                <div className="watch-party-header">
                    <div className="watch-party-title">
                        <Users size={24} />
                        <span>Watch Party</span>
                    </div>
                    <button className="watch-party-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="watch-party-content">
                    {/* Error Message */}
                    {(error || party.error) && (
                        <div className="watch-party-error">
                            <AlertCircle size={16} />
                            <span>{error || party.error}</span>
                        </div>
                    )}

                    {/* Loading State */}
                    {party.connecting && (
                        <div className="watch-party-loading">
                            <Loader2 size={32} className="spin" />
                            <span>Connecting...</span>
                        </div>
                    )}

                    {/* Active Party View */}
                    {party.active && !party.connecting && (
                        <div className="watch-party-active">
                            {/* Party Info */}
                            <div className="watch-party-info">
                                <div className="party-role">
                                    {party.isHost ? (
                                        <>
                                            <Crown size={18} className="host-icon" />
                                            <span>You are the Host</span>
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus size={18} />
                                            <span>Connected to {party.hostName || 'Host'}</span>
                                        </>
                                    )}
                                </div>

                                {party.roomId && (
                                    <div className="party-room-id">
                                        Room: <span className="code">{party.roomId}</span>
                                    </div>
                                )}
                            </div>

                            {/* Share URL (Host only) */}
                            {party.isHost && party.shareUrl && (
                                <div className="watch-party-share">
                                    {/* Show network type labels only if tunnel is active */}
                                    {party.tunnelActive ? (
                                        <>
                                            {/* LAN URL */}
                                            <label>🏠 LAN (Same Network):</label>
                                            <div className="share-url-box">
                                                <input
                                                    type="text"
                                                    value={party.shareUrl}
                                                    readOnly
                                                    className="share-url-input"
                                                />
                                                <button
                                                    className={`copy-btn ${copied ? 'copied' : ''}`}
                                                    onClick={() => copyShareUrl(false)}
                                                >
                                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                                </button>
                                            </div>

                                            {/* Internet URL */}
                                            {party.publicShareUrl && (
                                                <>
                                                    <label style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Globe size={14} style={{ color: '#22c55e' }} />
                                                        Internet (Anywhere):
                                                    </label>
                                                    <div className="share-url-box">
                                                        <input
                                                            type="text"
                                                            value={party.publicShareUrl}
                                                            readOnly
                                                            className="share-url-input"
                                                            style={{ color: '#4ade80' }}
                                                        />
                                                        <button
                                                            className={`copy-btn ${copiedPublic ? 'copied' : ''}`}
                                                            onClick={() => copyShareUrl(true)}
                                                        >
                                                            {copiedPublic ? <Check size={18} /> : <Copy size={18} />}
                                                        </button>
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'rgba(34, 197, 94, 0.8)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <div style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%' }} />
                                                        Tunnel active
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {/* Simple URL - no labels when LAN only */}
                                            <label>Share with friends:</label>
                                            <div className="share-url-box">
                                                <input
                                                    type="text"
                                                    value={party.shareUrl}
                                                    readOnly
                                                    className="share-url-input"
                                                />
                                                <button
                                                    className={`copy-btn ${copied ? 'copied' : ''}`}
                                                    onClick={() => copyShareUrl(false)}
                                                >
                                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}


                            {/* Guest List */}
                            <div className="watch-party-guests">
                                <div className="guests-header">
                                    <Users size={16} />
                                    <span>Viewers ({party.guests.length + 1}/6)</span>
                                </div>
                                <ul className="guests-list">
                                    {/* Host */}
                                    <li className="guest-item host">
                                        <Crown size={14} />
                                        <span>{party.isHost ? 'You' : party.hostName || 'Host'}</span>
                                    </li>
                                    {/* Guests */}
                                    {party.guests.map((guest, idx) => (
                                        <li key={idx} className="guest-item">
                                            <UserPlus size={14} />
                                            <span>{guest.name}</span>
                                        </li>
                                    ))}
                                    {/* If you're a guest, show yourself */}
                                    {!party.isHost && (
                                        <li className="guest-item you">
                                            <UserPlus size={14} />
                                            <span>You</span>
                                        </li>
                                    )}
                                </ul>
                            </div>

                            {/* Leave Button */}
                            <button className="watch-party-btn danger" onClick={handleLeave}>
                                {party.isHost ? 'End Party' : 'Leave Party'}
                            </button>
                        </div>
                    )}

                    {/* Menu View (Not in party) */}
                    {!party.active && !party.connecting && mode === 'menu' && (
                        <div className="watch-party-menu">
                            <p className="menu-description">
                                Watch videos together with friends in real-time sync!
                            </p>

                            <button
                                className="watch-party-btn primary"
                                onClick={() => setMode('create')}
                                disabled={!currentFilename || currentFilename === 'No Media'}
                            >
                                <Crown size={18} />
                                <span>Create Party</span>
                            </button>



                            {(!currentFilename || currentFilename === 'No Media') && (
                                <p className="menu-hint">Open a video to create a party</p>
                            )}
                        </div>
                    )}

                    {/* Create Party View */}
                    {!party.active && !party.connecting && mode === 'create' && (
                        <div className="watch-party-form">
                            <button className="back-btn" onClick={() => setMode('menu')}>
                                ← Back
                            </button>

                            <h3>Create Watch Party</h3>

                            <div className="form-group">
                                <label>Your Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Enter your name..."
                                    maxLength={20}
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label>Now Playing</label>
                                <div className="now-playing">
                                    {currentFilename || 'No media loaded'}
                                </div>
                            </div>

                            <button
                                className="watch-party-btn primary"
                                onClick={handleCreate}
                                disabled={!name.trim()}
                            >
                                <Users size={18} />
                                <span>Start Party</span>
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
