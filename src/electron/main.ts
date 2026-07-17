import { app, BrowserWindow, shell, dialog, protocol } from 'electron'
import { join } from 'node:path'
import { registerHandlers } from './ipc/registerHandlers'
import { getAppPaths } from './paths'
import { openPersistentDatabase, ProjectRepository } from '@database/index'
import { MEDIA_SCHEME, registerMediaProtocol } from './mediaProtocol'
import { branding } from '@config/branding'

// The controlled media scheme must be declared privileged BEFORE app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

// Brand the app and its app-data folder from the single branding config,
// independent of the package name, so user data lives under a stable directory.
app.setName(branding.dataDirectoryName)

// Test seam: allow the real-Electron integration test to point user data at a
// throwaway directory. Honored only in unpackaged (dev/test) runs — never in a
// packaged production build.
if (!app.isPackaged && process.env.SOWYVID_USER_DATA) {
  app.setPath('userData', process.env.SOWYVID_USER_DATA)
}

// Packaged-validation seam: the packaged E2E suite must exercise the REAL .exe
// without ever touching the owner's actual data, so a separate, deliberately
// named variable is honored even when packaged. Redirecting one's own local
// app data is already in any local user's power (it is not a security
// boundary); the distinct name exists so no production tooling sets it by
// accident.
if (app.isPackaged && process.env.SOWYVID_E2E_USER_DATA) {
  app.setPath('userData', process.env.SOWYVID_E2E_USER_DATA)
}

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
    title: branding.windowTitle,
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

app.whenReady().then(async () => {
  // Ensure the app-data directory tree exists before any handler runs.
  const paths = getAppPaths()

  try {
    const db = await openPersistentDatabase(join(paths.database, 'sowyvid.db'))
    const repo = new ProjectRepository(db)
    registerMediaProtocol(repo)
    registerHandlers({ db, repo })
  } catch (e) {
    // A database that cannot open is fatal, but the owner should get a calm
    // message — not a stack trace — and their data is untouched.
    const message = e instanceof Error ? e.message : String(e)
    console.error('[SowyVid] database init failed:', message)
    dialog.showErrorBox(
      'SowyVid no pudo iniciar',
      'No fue posible abrir el almacenamiento local. Tus proyectos están seguros. Intenta abrir SowyVid de nuevo.',
    )
    app.quit()
    return
  }

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
