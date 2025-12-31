import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
    Settings, X, Monitor, Volume2, Subtitles, PlayCircle,
    Zap, Camera, Layers, FileVideo, ChevronDown, Check, RefreshCw,
    Search, Download, Globe, Link
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
                position: 'fixed', // Fixed to viewport
                bottom: '15px', // Lowered further
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(700px, 90vw)',
                height: 'min(500px, 85vh)',
                maxHeight: '85vh',
                backgroundColor: '#0a0a0a', // Near black to avoid Windows transparency key bug
                backdropFilter: 'none',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 40px 80px rgba(0, 0, 0, 0.6)',
                zIndex: 600,
                display: 'flex',
                overflow: 'hidden',
                fontFamily: "'Outfit', 'Inter', sans-serif", // Nicer font preference
                pointerEvents: 'auto'
            }}
        >
            {/* Sidebar */}
            <div style={{
                width: '200px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                padding: '30px 15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <div style={{
                    padding: '0 15px 20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.3)',
                    textTransform: 'uppercase',
                    letterSpacing: '2px'
                }}>
                    Device Settings
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
                            <div style={{ padding: '30px 40px 10px', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Video Configuration</h2>
                                <div style={sectionSpacer}></div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 30px' }} className="custom-scroll">
                                <SettingItem label="Hardware Acceleration" description="Use GPU for smoother 4K/HDR playback.">
                                    <Toggle checked={hwDec} onChange={toggleHwDec} />
                                </SettingItem>

                                <SettingItem label="Anime4K Upscaling" description="Real-time anime upscaling algorithm (High GPU usage).">
                                    <Toggle checked={anime4K} onChange={toggleAnime4K} />
                                </SettingItem>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'audio' && (
                        <>
                            <div style={{ padding: '30px 40px 10px', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Audio Configuration</h2>
                                <div style={sectionSpacer}></div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 30px' }} className="custom-scroll">
                                <div style={{ marginBottom: '30px' }}>
                                    <label style={labelStyle}>Active Audio Track</label>
                                    <CustomSelect
                                        options={audioOptions}
                                        value={currentAudio}
                                        onChange={(val: any) => setAudioTrack(val)}
                                        placeholder="Select Audio Track"
                                    />
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <label style={labelStyle}>Audio Sync Adjustment</label>
                                        <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 600 }}>{audioDelay > 0 ? '+' : ''}{audioDelay}s</span>
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
                            <div style={{ padding: '30px 40px 10px', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Subtitle Configuration</h2>
                                <div style={sectionSpacer}></div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 30px' }} className="custom-scroll">
                                <div style={{ marginBottom: '30px' }}>
                                    <label style={labelStyle}>Active Subtitle Track</label>
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

                                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', flex: 1 }}></div>
                                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>SEARCH ONLINE</span>
                                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', flex: 1 }}></div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Movie/Series Name..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && searchQuery.trim()) {
                                                ipcRenderer.invoke('open-opensubtitles', searchQuery)
                                            }
                                        }}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                            padding: '10px 15px',
                                            color: '#fff',
                                            outline: 'none',
                                            fontSize: '13px'
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            if (searchQuery.trim()) {
                                                navigator.clipboard.writeText(searchQuery.trim())
                                                ipcRenderer.send('mpv-msg', 'Copied to clipboard!')
                                            }
                                        }}
                                        disabled={!searchQuery.trim()}
                                        style={{
                                            background: searchQuery.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                                            color: searchQuery.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                            padding: '10px 15px',
                                            cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        📋
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <button
                                        onClick={() => ipcRenderer.invoke('open-opensubtitles')}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.08)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Get in OpenSubtitles
                                    </button>
                                    <button
                                        onClick={() => ipcRenderer.invoke('open-subdivx')}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.08)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Get in Subdivx
                                    </button>
                                </div>

                                <div
                                    style={{
                                        fontSize: '11px',
                                        color: 'rgba(255,255,255,0.4)',
                                        marginTop: '10px',
                                        padding: '10px',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '6px',
                                        lineHeight: '1.5',
                                        transition: 'all 0.3s ease',
                                        cursor: 'help'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.05)'
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                                        e.currentTarget.style.fontSize = '12px'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)'
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                        e.currentTarget.style.fontSize = '11px'
                                    }}
                                >
                                    <div style={{ marginBottom: '5px', color: 'rgba(255,255,255,0.5)' }}>
                                        💡 <strong>Tip:</strong> Clean the title for better search results
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
                                        Instead of: <span style={{ color: 'rgba(255,100,100,0.6)' }}>Get.Smart.2008(@Intermedia™)</span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                                        <strong style={{ color: 'rgba(100,255,100,0.8)' }}>Use instead:</strong> <strong>Get Smart 2008</strong>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        Download the .srt file, then drag and drop it onto the player
                                    </div>
                                </div>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'playback' && (
                        <>
                            <div style={{ padding: '30px 40px 10px', flexShrink: 0 }}>
                                <h2 style={headerStyle}>Playback Controls</h2>
                                <div style={sectionSpacer}></div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 30px' }} className="custom-scroll">
                                <div style={{ marginBottom: '30px' }}>
                                    <label style={labelStyle}>Playback Speed ({speed}x)</label>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                        {[0.5, 1.0, 1.25, 1.5, 2.0].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => changeSpeed(s)}
                                                style={{
                                                    ...buttonStyle,
                                                    flex: 1,
                                                    background: speed === s ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                                                    color: speed === s ? '#fff' : 'rgba(255,255,255,0.7)',
                                                    border: 'none',
                                                    fontWeight: speed === s ? 600 : 400
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

                                <div style={{ marginTop: '25px', display: 'flex', gap: '10px' }}>
                                    <button onClick={takeScreenshot} style={actionButtonStyle}>
                                        <Camera size={16} /> Screenshot
                                    </button>
                                </div>
                            </div>
                        </>
                    )
                }

                {
                    activeTab === 'general' && (
                        <>
                            <div style={{ padding: '30px 40px 10px', flexShrink: 0 }}>
                                <h2 style={headerStyle}>General Settings</h2>
                                <div style={sectionSpacer}></div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 30px' }} className="custom-scroll">
                                <SettingItem label="Always on Top" description="Keep the player window floating above other apps.">
                                    <Toggle checked={alwaysOnTop} onChange={toggleAlwaysOnTop} />
                                </SettingItem>

                                <SettingItem label="Legal Information" description="View license agreements and privacy policy.">
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            onClick={() => setLegalDoc({ file: 'TERMS.md', title: 'Terms of Service' })}
                                            style={{ ...actionButtonStyle, fontSize: '11px', padding: '6px 12px' }}
                                        >
                                            Terms
                                        </button>
                                        <button
                                            onClick={() => setLegalDoc({ file: 'PRIVACY.md', title: 'Privacy Policy' })}
                                            style={{ ...actionButtonStyle, fontSize: '11px', padding: '6px 12px' }}
                                        >
                                            Privacy
                                        </button>
                                        <button
                                            onClick={() => setLegalDoc({ file: 'EULA.txt', title: 'End User License Agreement' })}
                                            style={{ ...actionButtonStyle, fontSize: '11px', padding: '6px 12px' }}
                                        >
                                            EULA
                                        </button>
                                    </div>
                                </SettingItem>

                                <div style={{ marginTop: '25px', display: 'flex', gap: '10px' }}>
                                    <button onClick={openConfig} style={actionButtonStyle}>
                                        <FileVideo size={16} /> Open MPV Folder
                                    </button>
                                    <button onClick={() => ipcRenderer.send('mpv-update-ytdl')} style={actionButtonStyle}>
                                        <RefreshCw size={16} /> Update Engines
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto', paddingTop: '40px', fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                                NauticPlayer Build v1.0.2 &bull; Powered by mpv
                            </div>
                        </>
                    )
                }

                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '25px',
                        right: '25px',
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'rgba(255,255,255,0.7)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        zIndex: 610 // Higher than content
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                >
                    <X size={18} />
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
            gap: '12px',
            padding: '14px 20px',
            background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            border: 'none',
            borderRadius: '12px', // More internal rounding
            color: active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '14px',
            fontWeight: active ? 600 : 500,
            transition: 'all 0.2s ease',
            position: 'relative',
        }}
    >
        <Icon size={18} strokeWidth={active ? 2.5 : 2} style={{ opacity: active ? 1 : 0.7 }} />
        {label}
        {active && <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            height: '20px', width: '3px', background: '#3b82f6', borderRadius: '0 4px 4px 0'
        }} />}
    </button>
)

const SettingItem = ({ label, description, children }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '25px', paddingBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        <div style={{ paddingRight: '20px' }}>
            <div style={{ color: '#fff', fontSize: '15px', fontWeight: 500, letterSpacing: '0.2px' }}>{label}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '6px', lineHeight: '1.4' }}>{description}</div>
        </div>
        <div>
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
    color: '#fff',
    fontSize: '24px',
    fontWeight: 600,
    letterSpacing: '-0.5px',
    margin: 0
}

const sectionSpacer = {
    height: '1px',
    background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)',
    margin: '15px 0 30px 0'
}

const labelStyle = {
    display: 'block',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '12px',
    marginBottom: '10px',
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
