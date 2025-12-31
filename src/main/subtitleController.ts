import { ipcMain, BrowserWindow, shell } from 'electron'

export function setupSubtitleController(mainWindow: BrowserWindow): void {

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

