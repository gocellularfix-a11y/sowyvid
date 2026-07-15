import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerHandlers } from './ipc/registerHandlers'
import { getAppPaths } from './paths'

// SowyVid brands the app and its app-data folder explicitly, independent of the
// package name, so user data lives under a stable "SowyVid" directory.
app.setName('SowyVid')

const isDev = !app.isPackaged
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#0a0a0f',
    title: 'SowyVid',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // --- Security baseline (see docs/SECURITY.md) ---
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Never let the renderer navigate to arbitrary origins or spawn windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = RENDERER_DEV_URL && url.startsWith(RENDERER_DEV_URL)
    if (!allowed) event.preventDefault()
  })

  if (isDev && RENDERER_DEV_URL) {
    void win.loadURL(RENDERER_DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Ensure the app-data directory tree exists before any handler runs.
  getAppPaths()
  registerHandlers()

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Harden against unexpected navigations / webview attachment globally.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
