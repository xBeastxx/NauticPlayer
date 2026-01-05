import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { sendCommand } from './mpvController'

let handlersRegistered = false

export function setupSubtitleController(mainWindow: BrowserWindow): void {
    // Only register handlers once to avoid "second handler" error
    if (handlersRegistered) return
    handlersRegistered = true

    // Open OpenSubtitles main page
    ipcMain.handle('open-opensubtitles', async () => {
        const url = 'https://www.opensubtitles.org'
        await shell.openExternal(url)
        console.log('Opening OpenSubtitles')
    })

    // Open Subdivx main page
    ipcMain.handle('open-subdivx', async () => {
        const url = 'https://www.subdivx.com'
        await shell.openExternal(url)
        console.log('Opening Subdivx')
    })

    // Open file dialog for local subtitles
    ipcMain.handle('open-subtitle-dialog', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Load Subtitle File',
            properties: ['openFile'],
            filters: [
                { name: 'Subtitles', extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt', 'idx'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        })
        if (canceled || filePaths.length === 0) return null
        return filePaths[0]
    })

    // Add subtitle to MPV
    ipcMain.on('mpv-add-sub', (_event, filePath: string) => {
        console.log('[SUBTITLE] Loading subtitle:', filePath)
        sendCommand({ command: ['sub-add', filePath] })
    })
}

