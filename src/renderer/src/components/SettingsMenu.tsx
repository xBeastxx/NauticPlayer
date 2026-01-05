import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
    Settings, X, Monitor, Volume2, Subtitles, PlayCircle,
    Zap, Camera, Layers, FileVideo, ChevronDown, Check, RefreshCw,
    Search, Download, Globe, Link, FolderOpen
} from 'lucide-react'

import LegalModal from './LegalModal'

const { ipcRenderer } = (window as any).require('electron')

interface SettingsMenuProps {
    onClose: () => void;
    currentTracks: any[];
    showStats: boolean;
    toggleStats: () => void;
    hwDec: boolean;
    setHwDec: (val: boolean) => void;
    anime4K: boolean;
    setAnime4K: (val: boolean) => void;
    loopState: 'none' | 'inf' | 'one';
    setLoopState: (val: 'none' | 'inf' | 'one') => void;
    alwaysOnTop: boolean;
    setAlwaysOnTop: (val: boolean) => void;
    filename?: string;
    isPlaying: boolean;
}

export default function SettingsMenu({
    onClose, currentTracks, showStats, toggleStats,
    hwDec, setHwDec, anime4K, setAnime4K, loopState, setLoopState,
    alwaysOnTop, setAlwaysOnTop, filename, isPlaying
}: SettingsMenuProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'subs' | 'playback' | 'general' | 'online'>('video')
    const [legalDoc, setLegalDoc] = useState<{ file: string, title: string } | null>(null) // Legal Modal State

    // Video States (Lifted)
    // Audio States
    const [audioDelay, setAudioDelay] = useState(0)

    // Subtitle States
    const [subDelay, setSubDelay] = useState(0)
    const [subScale, setSubScale] = useState(() => {
        const saved = localStorage.getItem('nautic-sub-scale')
        return saved ? parseFloat(saved) : 1.0
    })

    // Video States
    const [aspectRatio, setAspectRatio] = useState(() => {
        const saved = localStorage.getItem('nautic-aspect-ratio')
        return saved || 'default'
    })

    // Playback States
    const [speed, setSpeed] = useState(1.0)
    // Loop State (Lifted)

    // Subtitle Search State
    const [searchQuery, setSearchQuery] = useState(filename || '')
    const [subCheck, setSubCheck] = useState(false)
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [downloadingId, setDownloadingId] = useState<string | null>(null)

    // Derived Track Lists
    const audioTracks = currentTracks.filter(t => t.type === 'audio')
    const subTracks = currentTracks.filter(t => t.type === 'sub')

    useEffect(() => {
        // Listen for MPV state updates
        const onSpeed = (_: any, val: number) => setSpeed(val)
        const onAudioDelay = (_: any, val: number) => setAudioDelay(val)
        const onSubDelay = (_: any, val: number) => setSubDelay(val)

        ipcRenderer.on('mpv-speed', onSpeed)
        ipcRenderer.on('mpv-audio-delay', onAudioDelay)
        ipcRenderer.on('mpv-sub-delay', onSubDelay)

        // Apply saved subtitle scale on mount
        const savedSubScale = localStorage.getItem('nautic-sub-scale')
        if (savedSubScale) {
            const scale = parseFloat(savedSubScale)
            ipcRenderer.send('mpv-command', ['set_property', 'sub-scale', scale])
        }

        // Apply saved aspect ratio on mount
        const savedAspect = localStorage.getItem('nautic-aspect-ratio')
        if (savedAspect && savedAspect !== 'default') {
            ipcRenderer.send('mpv-command', ['set_property', 'panscan', 0])
            ipcRenderer.send('mpv-command', ['set_property', 'video-aspect-override', savedAspect])
        }

        return () => {
            ipcRenderer.removeAllListeners('mpv-speed')
            ipcRenderer.removeAllListeners('mpv-audio-delay')
            ipcRenderer.removeAllListeners('mpv-sub-delay')
        }
    }, [])

    // Auto-fill filename when it changes
    useEffect(() => {
        if (filename && !subCheck) {
            setSearchQuery(filename.replace(/\.(mp4|mkv|avi|mov)$/i, ''))
            setSubCheck(true)
        }
    }, [filename, subCheck])

    const handleSearchSubs = async () => {
        if (!searchQuery.trim()) return
        setIsSearching(true)
        setSearchResults([])
        try {
            const results = await ipcRenderer.invoke('search-subs', { query: searchQuery, lang: 'all' })
            setSearchResults(results)
        } catch (e) {
            console.error(e)
        } finally {
            setIsSearching(false)
        }
    }

    const handleDownloadSub = async (sub: any) => {
        setDownloadingId(sub.id) // unique id from OS or just use url
        try {
            const path = await ipcRenderer.invoke('download-sub', { url: sub.url, name: sub.filename })
            ipcRenderer.send('mpv-add-sub', path)
            ipcRenderer.send('mpv-msg', 'Subtitle Loaded!')
        } catch (e) {
            ipcRenderer.send('mpv-msg', 'Download Failed')
        } finally {
            setDownloadingId(null)
        }
    }

    const handleTabClick = (tab: any) => setActiveTab(tab)

    // Command Helpers
    const toggleHwDec = () => {
        const newVal = !hwDec
        setHwDec(newVal)
        ipcRenderer.send('mpv-command', ['set_property', 'hwdec', newVal ? 'auto' : 'no'])
    }

    const toggleAnime4K = () => {
        const newVal = !anime4K
        setAnime4K(newVal)
        ipcRenderer.send('mpv-toggle-shader', newVal)
    }

    const setAudioTrack = (id: number) => {
        ipcRenderer.send('mpv-set-audio', id)
    }

    const setSubTrack = (id: number | string) => {
        ipcRenderer.send('mpv-set-sub', id)
    }

    const adjustAudioDelay = (val: number) => {
        setAudioDelay(val)
        ipcRenderer.send('mpv-command', ['set_property', 'audio-delay', val])
    }

    const adjustSubDelay = (val: number) => {
        setSubDelay(val)
        ipcRenderer.send('mpv-command', ['set_property', 'sub-delay', val])
    }

    const changeSubScale = (val: number) => {
        setSubScale(val)
        localStorage.setItem('nautic-sub-scale', val.toString())
        ipcRenderer.send('mpv-command', ['set_property', 'sub-scale', val])
    }

    const changeAspectRatio = (val: string) => {
        setAspectRatio(val)
        localStorage.setItem('nautic-aspect-ratio', val)
        if (val === 'default') {
            // Reset to original aspect ratio and restore panscan
            ipcRenderer.send('mpv-command', ['set_property', 'video-aspect-override', '-1'])
            ipcRenderer.send('mpv-command', ['set_property', 'panscan', 1.0])
        } else {
            // Disable panscan when forcing aspect ratio to avoid conflicts
            ipcRenderer.send('mpv-command', ['set_property', 'panscan', 0])
            ipcRenderer.send('mpv-command', ['set_property', 'video-aspect-override', val])
        }
    }

    const changeSpeed = (val: number) => {
        setSpeed(val)
        ipcRenderer.send('mpv-command', ['set_property', 'speed', val])
    }

    const toggleLoop = () => {
        const next = loopState === 'none' ? 'inf' : 'none'
        setLoopState(next)
        ipcRenderer.send('mpv-command', ['set_property', 'loop-file', next])
    }

    const takeScreenshot = () => {
        ipcRenderer.send('mpv-command', ['screenshot'])
    }

    const toggleAlwaysOnTop = () => {
        const newValue = !alwaysOnTop
        setAlwaysOnTop(newValue)
        ipcRenderer.send('set-always-on-top', newValue)
    }

    const openConfig = () => {
        ipcRenderer.send('open-config-folder')
    }

    // Helper to format track names more intelligently
    const formatTrackLabel = (track: any, index: number) => {
        const langMap: Record<string, string> = {
            'jpn': 'Japanese', 'eng': 'English', 'spa': 'Spanish', 'fre': 'French',
            'ger': 'German', 'ita': 'Italian', 'kor': 'Korean', 'chn': 'Chinese',
            'rus': 'Russian', 'por': 'Portuguese', 'hin': 'Hindi', 'ben': 'Bengali',
            'ara': 'Arabic', 'ind': 'Indonesian', 'tha': 'Thai', 'vie': 'Vietnamese',
            'lat': 'Latin American'
        }

        const langCode = (track.lang || '').toLowerCase()
        const langName = langMap[langCode.substring(0, 3)] || (track.lang ? track.lang.toUpperCase() : '')

        // Clean Title Logic
        let title = track.title || ''
        const spam = ['Toonworld4all.me', 'und', 'iso'] // Removed 'stereo', checking logic below
        const hasSpam = spam.some(s => title.toLowerCase().includes(s.toLowerCase()))
        if (hasSpam) title = ''

        // Format: "Language - Title" or just "Title" or "Language"
        let parts: string[] = []
        if (langName) parts.push(langName)
        if (title) parts.push(title)

        if (parts.length > 0) {
            return parts.join(' - ')
        }

        return `Track ${index + 1} (ID: ${track.id})`
    }

    // Prepare options for Select
    const audioOptions = audioTracks.map((t, i) => ({
        value: t.id,
        label: formatTrackLabel(t, i),
        selected: t.selected
    }))

    const subOptions = [
        { value: 'no', label: 'None', selected: !subTracks.some(t => t.selected) },
        ...subTracks.map((t, i) => ({
            value: t.id,
            label: formatTrackLabel(t, i),
            selected: t.selected
        }))
    ]

    // Find current values for Select
    const currentAudio = audioOptions.find(o => o.selected)
    const currentSub = subOptions.find(o => o.selected)

    return (
        <div
            data-settings-menu="true"
            style={{
                position: 'fixed',
                bottom: 'clamp(8px, 2vh, 15px)',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'clamp(320px, 92vw, 700px)',
                height: 'clamp(280px, 80vh, 500px)',
                maxHeight: '85vh',
                backgroundColor: '#0a0a0a',
                backdropFilter: 'none',
                borderRadius: 'clamp(12px, 3vw, 24px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 40px 80px rgba(0, 0, 0, 0.6)',
                zIndex: 600,
                display: 'flex',
                overflow: 'hidden',
                fontFamily: "'Outfit', 'Inter', sans-serif",
                pointerEvents: 'auto',
                fontSize: 'clamp(11px, 1.4vw, 14px)'
            }}
        >
            {/* Sidebar - Compact on small screens */}
            <div style={{
                width: 'clamp(50px, 20vw, 200px)',
                minWidth: '50px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                padding: 'clamp(12px, 3vh, 30px) clamp(6px, 1.5vw, 15px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'clamp(4px, 1vh, 8px)',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '0 clamp(4px, 1vw, 15px) clamp(8px, 2vh, 20px)',
                    fontSize: 'clamp(8px, 1.2vw, 11px)',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.3)',
                    textTransform: 'uppercase',
                    letterSpacing: 'clamp(0.5px, 0.2vw, 2px)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    Settings
                </div>

                <TabButton active={activeTab === 'video'} onClick={() => handleTabClick('video')} icon={Monitor} label="Video" />
                <TabButton active={activeTab === 'audio'} onClick={() => handleTabClick('audio')} icon={Volume2} label="Audio" />
                <TabButton active={activeTab === 'subs'} onClick={() => handleTabClick('subs')} icon={Subtitles} label="Subtitles" />
                <TabButton active={activeTab === 'playback'} onClick={() => handleTabClick('playback')} icon={PlayCircle} label="Playback" />
                <TabButton active={activeTab === 'general'} onClick={() => handleTabClick('general')} icon={Settings} label="General" />
            </div >

            {/* Content Area */}
            <div className="settings-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                {
                    activeTab === 'video' && (
                        <>
                            <div style={{ padding: 'clamp(12px, 2.5vh, 24px) clamp(16px, 3vw, 32px) clamp(6px, 1vh, 12px)', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Display</h2>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 clamp(16px, 3vw, 32px) clamp(12px, 2vh, 24px)' }} className="custom-scroll">
                                <SettingItem label="Hardware Acceleration" description="Use GPU for smoother 4K/HDR playback.">
                                    <Toggle checked={hwDec} onChange={toggleHwDec} />
                                </SettingItem>

                                <SettingItem label="Anime4K Upscaling" description="Real-time anime upscaling algorithm (High GPU usage).">
                                    <Toggle checked={anime4K} onChange={toggleAnime4K} />
                                </SettingItem>

                                <div style={{ marginTop: '8px' }}>
                                    <label style={labelStyle}>Aspect Ratio</label>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {[
                                            { value: 'default', label: 'Auto' },
                                            { value: '16:9', label: '16:9' },
                                            { value: '4:3', label: '4:3' },
                                            { value: '21:9', label: '21:9' },
                                            { value: '1:1', label: '1:1' }
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => changeAspectRatio(opt.value)}
                                                style={{
                                                    padding: 'clamp(6px, 1vh, 8px) clamp(10px, 2vw, 14px)',
                                                    background: aspectRatio === opt.value ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                                    color: aspectRatio === opt.value ? '#fff' : 'rgba(255,255,255,0.7)',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: 'clamp(10px, 1.2vw, 12px)',
                                                    fontWeight: aspectRatio === opt.value ? 600 : 400,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'audio' && (
                        <>
                            <div style={{ padding: 'clamp(12px, 2.5vh, 24px) clamp(16px, 3vw, 32px) clamp(6px, 1vh, 12px)', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Sound</h2>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 clamp(16px, 3vw, 32px) clamp(12px, 2vh, 24px)' }} className="custom-scroll">
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={labelStyle}>Audio Track</label>
                                    <CustomSelect
                                        options={audioOptions}
                                        value={currentAudio}
                                        onChange={(val: any) => setAudioTrack(val)}
                                        placeholder="Select Audio Track"
                                    />
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <label style={{ ...labelStyle, marginBottom: 0 }}>Sync Adjustment</label>
                                        <span style={{ color: '#3b82f6', fontSize: '12px', fontWeight: 600 }}>{audioDelay > 0 ? '+' : ''}{audioDelay}s</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-2" max="2" step="0.1"
                                        value={audioDelay}
                                        onChange={(e) => adjustAudioDelay(Number(e.target.value))}
                                        style={rangeStyle}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '5px' }}>
                                        <span>Earlier (-2s)</span>
                                        <span>Default</span>
                                        <span>Later (+2s)</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'subs' && (
                        <>
                            <div style={{ padding: 'clamp(12px, 2.5vh, 24px) clamp(16px, 3vw, 32px) clamp(6px, 1vh, 12px)', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Subtitles</h2>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 clamp(16px, 3vw, 32px) clamp(12px, 2vh, 24px)' }} className="custom-scroll">
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={labelStyle}>Subtitle Track</label>
                                    <CustomSelect
                                        options={subOptions}
                                        value={currentSub}
                                        onChange={(val: any) => setSubTrack(val)}
                                        placeholder="Select Subtitle Track"
                                    />
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <label style={labelStyle}>Subtitle Sync Adjustment</label>
                                        <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 600 }}>{subDelay > 0 ? '+' : ''}{subDelay}s</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-2" max="2" step="0.1"
                                        value={subDelay}
                                        onChange={(e) => adjustSubDelay(Number(e.target.value))}
                                        style={rangeStyle}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '5px' }}>
                                        <span>Earlier (-2s)</span>
                                        <span>Default</span>
                                        <span>Later (+2s)</span>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <label style={{ ...labelStyle, marginBottom: 0 }}>Subtitle Size</label>
                                        <span style={{ color: '#3b82f6', fontSize: '12px', fontWeight: 600 }}>{subScale.toFixed(1)}x</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5" max="2" step="0.1"
                                        value={subScale}
                                        onChange={(e) => changeSubScale(Number(e.target.value))}
                                        style={rangeStyle}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '5px' }}>
                                        <span>Small (0.5x)</span>
                                        <span>Default</span>
                                        <span>Large (2x)</span>
                                    </div>
                                </div>

                                {/* Load Local Subtitle */}
                                <div style={{ marginTop: '8px' }}>
                                    <button
                                        onClick={async () => {
                                            const filePath = await ipcRenderer.invoke('open-subtitle-dialog')
                                            if (filePath) {
                                                ipcRenderer.send('mpv-add-sub', filePath)
                                                ipcRenderer.send('mpv-msg', '✅ Subtitle Loaded!')
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '10px',
                                            padding: '12px 16px',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    >
                                        <FolderOpen size={16} />
                                        Load from file...
                                    </button>
                                </div>

                                {/* Online Sources */}
                                <div style={{ marginTop: '16px' }}>
                                    <label style={labelStyle}>Find Online</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => ipcRenderer.invoke('open-opensubtitles')}
                                            style={{
                                                flex: 1,
                                                background: 'rgba(255,255,255,0.05)',
                                                color: 'rgba(255,255,255,0.8)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: '8px',
                                                padding: '10px',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                        >
                                            OpenSubtitles
                                        </button>
                                        <button
                                            onClick={() => ipcRenderer.invoke('open-subdivx')}
                                            style={{
                                                flex: 1,
                                                background: 'rgba(255,255,255,0.05)',
                                                color: 'rgba(255,255,255,0.8)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: '8px',
                                                padding: '10px',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                        >
                                            Subdivx
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'playback' && (
                        <>
                            <div style={{ padding: 'clamp(12px, 2.5vh, 24px) clamp(16px, 3vw, 32px) clamp(6px, 1vh, 12px)', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Playback</h2>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 clamp(16px, 3vw, 32px) clamp(12px, 2vh, 24px)' }} className="custom-scroll">
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Speed</label>
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                        {[0.5, 1.0, 1.25, 1.5, 2.0].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => changeSpeed(s)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    background: speed === s ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                                                    color: speed === s ? '#fff' : 'rgba(255,255,255,0.7)',
                                                    border: 'none',
                                                    fontWeight: speed === s ? 600 : 400,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {s}x
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <SettingItem label="Loop Video" description="Automatically replay video when it ends.">
                                    <Toggle checked={loopState === 'inf'} onChange={toggleLoop} />
                                </SettingItem>

                                <SettingItem label="Nerd Stats Overlay" description="Display technical playback statistics.">
                                    <Toggle checked={showStats} onChange={toggleStats} />
                                </SettingItem>

                                <div style={{ marginTop: '16px' }}>
                                    <button onClick={takeScreenshot} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 16px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        transition: 'all 0.2s'
                                    }}>
                                        <Camera size={14} /> Screenshot
                                    </button>
                                </div>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'general' && (
                        <>
                            <div style={{ padding: 'clamp(12px, 2.5vh, 24px) clamp(16px, 3vw, 32px) clamp(6px, 1vh, 12px)', flexShrink: 0 }}>
                                <h2 style={headerStyle}>General</h2>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 clamp(16px, 3vw, 32px) clamp(12px, 2vh, 24px)' }} className="custom-scroll">
                                <SettingItem label="Always on Top" description="Keep player above other windows">
                                    <Toggle checked={alwaysOnTop} onChange={toggleAlwaysOnTop} />
                                </SettingItem>

                                <div style={{ marginTop: '16px' }}>
                                    <label style={labelStyle}>Legal</label>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {[
                                            { file: 'TERMS.md', title: 'Terms of Service', label: 'Terms' },
                                            { file: 'PRIVACY.md', title: 'Privacy Policy', label: 'Privacy' },
                                            { file: 'EULA.txt', title: 'End User License Agreement', label: 'EULA' },
                                            { file: 'CREDITS.md', title: 'Open Source Credits', label: 'Credits' }
                                        ].map(doc => (
                                            <button
                                                key={doc.file}
                                                onClick={() => setLegalDoc({ file: doc.file, title: doc.title })}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: '6px',
                                                    color: 'rgba(255,255,255,0.7)',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {doc.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={openConfig}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '10px 14px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '8px',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <FileVideo size={14} /> MPV Folder
                                    </button>
                                    <button
                                        onClick={() => ipcRenderer.send('mpv-update-ytdl')}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '10px 14px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '8px',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <RefreshCw size={14} /> Update Engines
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: '12px 32px', fontSize: '10px', color: 'rgba(255,255,255,0.15)', textAlign: 'center' }}>
                                NauticPlayer v1.0.2 • NauticGames™
                            </div>
                        </>
                    )
                }

                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: 'clamp(8px, 1.5vh, 25px)',
                        right: 'clamp(8px, 1.5vw, 25px)',
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        borderRadius: '50%',
                        width: 'clamp(24px, 4vw, 32px)',
                        height: 'clamp(24px, 4vw, 32px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'rgba(255,255,255,0.7)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        zIndex: 610
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                >
                    <X size={14} />
                </button>

                {legalDoc && (
                    <LegalModal
                        filename={legalDoc.file}
                        title={legalDoc.title}
                        onClose={() => setLegalDoc(null)}
                    />
                )}
            </div >
        </div >
    )
}

// === CUSTOM SELECT COMPONENT ===

const CustomSelect = ({ options, value, onChange, placeholder }: any) => {
    const [isOpen, setIsOpen] = useState(false)
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, maxHeight: 200 })
    const containerRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const toggleOpen = () => {
        if (!isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            // Ensure we have a gap from the bottom edge (e.g., 40px)
            const spaceBelow = window.innerHeight - rect.bottom - 40
            const calculatedMaxHeight = Math.min(250, Math.max(50, spaceBelow))

            setCoords({
                top: rect.bottom + 8,
                left: rect.left,
                width: rect.width,
                maxHeight: calculatedMaxHeight
            })
        }
        setIsOpen(!isOpen)
    }

    useEffect(() => {
        const onScroll = (e: Event) => {
            if (isOpen) {
                // Resize always closes
                if (e.type === 'resize') {
                    setIsOpen(false)
                    return
                }
                // Scroll: only close if scrolling HAPPENS OUTSIDE the dropdown
                const target = e.target as Node
                if (dropdownRef.current && !dropdownRef.current.contains(target)) {
                    setIsOpen(false)
                }
            }
        }

        if (isOpen) {
            window.addEventListener('scroll', onScroll, true)
            window.addEventListener('resize', onScroll)
            // Global click listener to close
            const closeMenu = (event: MouseEvent) => {
                const target = event.target as Node
                // Close if click is outside both trigger (containerRef) and dropdown (dropdownRef)
                if (
                    containerRef.current && !containerRef.current.contains(target) &&
                    dropdownRef.current && !dropdownRef.current.contains(target)
                ) {
                    setIsOpen(false)
                }
            }
            // Delay adding to avoid immediate close on the click that opened it
            setTimeout(() => window.addEventListener('click', closeMenu), 0)
            return () => {
                window.removeEventListener('scroll', onScroll, true)
                window.removeEventListener('resize', onScroll)
                window.removeEventListener('click', closeMenu)
            }
        }
    }, [isOpen])

    const dropdown = (
        <div
            ref={dropdownRef}
            onClick={(e) => e.stopPropagation()} // Keep this as backup
            style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                width: coords.width,
                maxHeight: `${coords.maxHeight}px`,
                overflowY: 'auto',
                background: 'rgba(20, 20, 20, 0.98)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                zIndex: 99999,
                padding: '6px',
                backdropFilter: 'blur(10px)'
            }}
            className="custom-scroll"
            data-dropdown-portal="true"
        >
            {options.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>No options available</div>
            ) : (
                options.map((opt: any) => (
                    <div
                        key={opt.value}
                        onClick={(e) => {
                            e.stopPropagation() // Prevent closing parent menus or triggering outside clicks
                            onChange(opt.value)
                            setIsOpen(false)
                        }}
                        style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: opt.selected ? '#3b82f6' : 'rgba(255,255,255,0.9)',
                            background: opt.selected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '2px'
                        }}
                        onMouseEnter={(e) => {
                            if (!opt.selected) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                        }}
                        onMouseLeave={(e) => {
                            if (!opt.selected) e.currentTarget.style.background = 'transparent'
                        }}
                    >
                        <span>{opt.label}</span>
                        {opt.selected && <Check size={16} color="#3b82f6" />}
                    </div>
                ))
            )}
        </div>
    )

    return (
        <>
            <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
                <div
                    onClick={(e) => {
                        e.stopPropagation() // Prevent global click listener from firing immediately
                        toggleOpen()
                    }}
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'rgba(0,0,0,0.4)',
                        border: isOpen ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <span style={{ color: value ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                        {value ? value.label : placeholder || 'Select...'}
                    </span>
                    <ChevronDown size={16} color={isOpen ? '#3b82f6' : 'rgba(255,255,255,0.5)'} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
            </div>
            {isOpen && createPortal(dropdown, document.body)}
        </>
    )
}

// Sub-components & Styles

const TabButton = ({ active, onClick, icon: Icon, label }: any) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(4px, 1vw, 12px)',
            padding: 'clamp(8px, 1.5vh, 14px) clamp(8px, 1.5vw, 20px)',
            background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            border: 'none',
            borderRadius: 'clamp(6px, 1vw, 12px)',
            color: active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 'clamp(10px, 1.3vw, 14px)',
            fontWeight: active ? 600 : 500,
            transition: 'all 0.2s ease',
            position: 'relative',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden'
        }}
    >
        <Icon size={16} strokeWidth={active ? 2.5 : 2} style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }} />
        <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block'
        }}>
            {label}
        </span>
        {active && <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            height: 'clamp(12px, 2vh, 20px)', width: '3px', background: '#3b82f6', borderRadius: '0 4px 4px 0'
        }} />}
    </button>
)

const SettingItem = ({ label, description, children }: any) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'clamp(10px, 1.5vh, 14px) clamp(10px, 1.5vw, 16px)',
        marginBottom: 'clamp(4px, 1vh, 8px)',
        borderRadius: 'clamp(6px, 1vw, 10px)',
        background: 'rgba(255,255,255,0.03)',
        transition: 'background 0.2s ease',
        gap: 'clamp(8px, 1vw, 16px)'
    }}
        onMouseEnter={(e: any) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={(e: any) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
        <div style={{ paddingRight: 'clamp(8px, 1vw, 16px)', flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 'clamp(12px, 1.4vw, 14px)', fontWeight: 500 }}>{label}</div>
            {description && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(9px, 1.1vw, 11px)', marginTop: 'clamp(2px, 0.5vh, 4px)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{description}</div>}
        </div>
        <div style={{ flexShrink: 0 }}>
            {children}
        </div>
    </div>
)

const Toggle = ({ checked, onChange }: any) => (
    <div
        onClick={onChange}
        style={{
            width: '46px',
            height: '28px',
            background: checked ? '#3b82f6' : 'rgba(255,255,255,0.1)',
            borderRadius: '14px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
    >
        <div style={{
            position: 'absolute',
            top: '3px',
            left: checked ? '21px' : '3px',
            width: '22px',
            height: '22px',
            background: '#fff',
            borderRadius: '50%',
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }} />
    </div>
)

const headerStyle = {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 16px 4px'
}

const labelStyle = {
    display: 'block',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '11px',
    marginBottom: '8px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
}

const rangeStyle = {
    width: '100%',
    cursor: 'pointer',
    accentColor: '#3b82f6',
    height: '4px',
    borderRadius: '2px'
}

const buttonStyle = {
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s ease'
}

const actionButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 24px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '10px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease'
}
