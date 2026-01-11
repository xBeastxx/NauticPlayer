/**
 * LocalQueuePanel - Left-side panel for local file playlist/queue
 */
import React, { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, FolderOpen, File, Trash2, Play, Plus, ListMusic, GripVertical } from 'lucide-react'

const { ipcRenderer } = (window as any).require('electron')

export interface LocalQueueItem {
    id: string
    path: string
    filename: string
    index: number
}

interface LocalQueuePanelProps {
    isOpen: boolean
    onClose: () => void
    queue: LocalQueueItem[]
    currentIndex: number
    onPlayIndex: (index: number) => void
    onAddFiles: (files: LocalQueueItem[]) => void
    onRemoveItem: (index: number) => void
    onClearQueue: () => void
    onReorder: (fromIndex: number, toIndex: number) => void
}

// Video file extensions we support
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ts']

function isVideoFile(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    return VIDEO_EXTENSIONS.includes(ext)
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 11)
}

export default function LocalQueuePanel({
    isOpen,
    onClose,
    queue,
    currentIndex,
    onPlayIndex,
    onAddFiles,
    onRemoveItem,
    onClearQueue,
    onReorder
}: LocalQueuePanelProps) {
    const [isDragOver, setIsDragOver] = useState(false)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

    // Handle file drop
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        const files = Array.from(e.dataTransfer.files)
        const videoFiles: LocalQueueItem[] = []

        files.forEach((file, idx) => {
            // Check if it's a directory (we'll handle this via IPC)
            // For now, just handle files
            if (isVideoFile(file.name)) {
                videoFiles.push({
                    id: generateId(),
                    path: (file as any).path || file.name,
                    filename: file.name,
                    index: queue.length + idx
                })
            }
        })

        if (videoFiles.length > 0) {
            onAddFiles(videoFiles)
        }
    }, [queue, onAddFiles])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }, [])

    // Handle file picker
    const handleAddFiles = async () => {
        const result = await ipcRenderer.invoke('open-file-dialog', {
            title: 'Add Videos to Queue',
            filters: [{ name: 'Video Files', extensions: VIDEO_EXTENSIONS.map(e => e.slice(1)) }],
            properties: ['openFile', 'multiSelections']
        })

        if (result && result.length > 0) {
            const newFiles: LocalQueueItem[] = result.map((filePath: string, idx: number) => ({
                id: generateId(),
                path: filePath,
                filename: filePath.split(/[\\/]/).pop() || filePath,
                index: queue.length + idx
            }))
            onAddFiles(newFiles)
        }
    }

    // Handle folder picker
    const handleAddFolder = async () => {
        const result = await ipcRenderer.invoke('open-folder-dialog', {
            title: 'Add Folder to Queue'
        })

        if (result && result.files && result.files.length > 0) {
            const videoFiles: LocalQueueItem[] = result.files
                .filter((f: string) => isVideoFile(f))
                .map((filePath: string, idx: number) => ({
                    id: generateId(),
                    path: filePath,
                    filename: filePath.split(/[\\/]/).pop() || filePath,
                    index: queue.length + idx
                }))

            if (videoFiles.length > 0) {
                onAddFiles(videoFiles)
            }
        }
    }

    // Drag reorder handlers
    const handleItemDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index)
        // Set custom data so dropping on video area can play the file
        const item = queue[index]
        if (item) {
            e.dataTransfer.setData('text/plain', item.path)
            e.dataTransfer.setData('application/x-nautic-queue-item', JSON.stringify(item))
            e.dataTransfer.effectAllowed = 'move'
        }
    }

    const handleItemDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.stopPropagation() // Prevent reorder conflicts
        if (draggedIndex !== null && draggedIndex !== index) {
            onReorder(draggedIndex, index)
            setDraggedIndex(index)
        }
    }

    const handleItemDragEnd = () => {
        setDraggedIndex(null)
    }

    if (!isOpen) return null

    const panelContent = (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: 'clamp(240px, 35vw, 320px)',
                maxWidth: '90vw',
                height: '100vh',
                background: 'rgba(12, 12, 12, 0.98)',
                backdropFilter: 'blur(20px)',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInLeft 0.3s ease-out',
                pointerEvents: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
            onDrop={(e) => {
                // If dropping within panel, don't let it reach App (which would play)
                e.stopPropagation()
            }}
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
                    <ListMusic size={18} color="rgba(255,255,255,0.7)" />
                    <h2 style={{
                        margin: 0,
                        fontSize: 'clamp(12px, 1.8vw, 16px)',
                        fontWeight: 600,
                        color: '#fff',
                        fontFamily: 'Inter, sans-serif',
                        whiteSpace: 'nowrap'
                    }}>
                        Queue
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s'
                    }}
                >
                    <X size={18} color="rgba(255,255,255,0.7)" />
                </button>
            </div>

            {/* Drop Zone / Add Buttons - Compact when queue has items */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                style={{
                    margin: queue.length > 0 ? 'clamp(4px, 1vw, 8px)' : 'clamp(8px, 1.5vw, 15px)',
                    padding: queue.length > 0 ? 'clamp(6px, 1vw, 10px)' : 'clamp(10px, 2vw, 20px)',
                    border: `2px dashed ${isDragOver ? '#3b82f6' : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: queue.length > 0 ? '8px' : '12px',
                    background: isDragOver ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'center',
                    transition: 'all 0.3s ease'
                }}
            >
                {/* Only show text when queue is empty */}
                {queue.length === 0 && (
                    <p style={{
                        margin: '0 0 8px 0',
                        fontSize: 'clamp(10px, 1.4vw, 13px)',
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: 'Inter, sans-serif'
                    }}>
                        {isDragOver ? 'Drop Here!' : 'Drag files here'}
                    </p>
                )}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleAddFiles}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: queue.length > 0 ? '6px 10px' : '8px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: queue.length > 0 ? '11px' : '12px',
                            fontFamily: 'Inter, sans-serif',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Plus size={queue.length > 0 ? 12 : 14} /> {queue.length > 0 ? '' : 'Files'}
                    </button>
                    <button
                        onClick={handleAddFolder}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: queue.length > 0 ? '6px 10px' : '8px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: queue.length > 0 ? '11px' : '12px',
                            fontFamily: 'Inter, sans-serif',
                            transition: 'all 0.2s'
                        }}
                    >
                        <FolderOpen size={queue.length > 0 ? 12 : 14} /> {queue.length > 0 ? 'Folder' : 'Folder'}
                    </button>
                </div>
            </div>

            {/* Queue List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 15px 15px 15px'
            }} className="custom-scroll">
                {queue.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: '13px',
                        fontFamily: 'Inter, sans-serif'
                    }}>
                        <File size={40} style={{ opacity: 0.3, marginBottom: '10px' }} />
                        <p style={{ margin: 0 }}>La cola está vacía</p>
                        <p style={{ margin: '5px 0 0 0', fontSize: '11px' }}>
                            Arrastra videos o usa los botones de arriba
                        </p>
                    </div>
                ) : (
                    queue.map((item, index) => (
                        <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, index)}
                            onDragOver={(e) => handleItemDragOver(e, index)}
                            onDragEnd={handleItemDragEnd}
                            onClick={() => onPlayIndex(index)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px',
                                marginBottom: '6px',
                                background: index === currentIndex
                                    ? 'rgba(59, 130, 246, 0.2)'
                                    : 'rgba(255,255,255,0.03)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                border: index === currentIndex
                                    ? '1px solid rgba(59, 130, 246, 0.3)'
                                    : '1px solid transparent',
                                transition: 'all 0.2s',
                                opacity: draggedIndex === index ? 0.5 : 1
                            }}
                        >
                            {/* Drag Handle */}
                            <GripVertical
                                size={14}
                                color="rgba(255,255,255,0.3)"
                                style={{ cursor: 'grab', flexShrink: 0 }}
                            />

                            {/* Index */}
                            <span style={{
                                fontSize: '11px',
                                color: 'rgba(255,255,255,0.4)',
                                minWidth: '20px',
                                textAlign: 'center'
                            }}>
                                {index + 1}
                            </span>

                            {/* Play indicator or File icon */}
                            {index === currentIndex ? (
                                <Play size={14} color="#3b82f6" fill="#3b82f6" />
                            ) : (
                                <File size={14} color="rgba(255,255,255,0.4)" />
                            )}

                            {/* Filename */}
                            <span style={{
                                flex: 1,
                                fontSize: '12px',
                                color: index === currentIndex ? '#fff' : 'rgba(255,255,255,0.7)',
                                fontFamily: 'Inter, sans-serif',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {item.filename}
                            </span>

                            {/* Delete Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRemoveItem(index)
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '4px',
                                    cursor: 'pointer',
                                    opacity: 0.5,
                                    transition: 'opacity 0.2s'
                                }}
                            >
                                <Trash2 size={14} color="rgba(255,100,100,0.8)" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Footer - Clear Queue */}
            {queue.length > 0 && (
                <div style={{
                    padding: 'clamp(8px, 1.5vw, 15px)',
                    borderTop: '1px solid rgba(255,255,255,0.08)'
                }}>
                    <button
                        onClick={onClearQueue}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,100,100,0.15)'
                            e.currentTarget.style.borderColor = 'rgba(255,100,100,0.3)'
                            e.currentTarget.style.color = 'rgba(255,100,100,0.9)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                            e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                        }}
                        style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            padding: 'clamp(6px, 1vw, 10px)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 'clamp(10px, 1.3vw, 12px)',
                            fontFamily: 'Inter, sans-serif',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Trash2 size={12} /> Clear ({queue.length})
                    </button>
                </div>
            )}
        </div>
    )

    return createPortal(panelContent, document.body)
}
