import { ipcMain, BrowserWindow, shell } from 'electron'

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
}

