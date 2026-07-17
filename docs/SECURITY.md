# SowyVid — Security

> Status: **Baseline implemented** (Electron hardening, IPC validation, CSP).
> Credential storage and the phone-import server are **designed, not yet built**.

## Threat model (local desktop app)

SowyVid is local-first: no account, no cloud, no telemetry by default. The main
risks for a desktop Electron app are (1) a compromised/renderer-side script
gaining Node/filesystem access, (2) malicious media or IPC payloads, (3) later,
the local phone-upload server exposing the filesystem or the network, and (4)
leaking API keys / OAuth secrets. The design addresses each.

## Electron process boundaries (implemented)

`src/electron/main.ts` creates the window with:

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Renderer and preload run in separate worlds |
| `nodeIntegration` | `false` | No Node/`require` in the renderer |
| `sandbox` | `true` | Renderer + preload run sandboxed |
| `webSecurity` | `true` | Same-origin + resource policy enforced |
| `allowRunningInsecureContent` | `false` | No mixed content |

Additional hardening:
- `setWindowOpenHandler` denies all `window.open`; only `https:` URLs are handed
  to the OS browser via `shell.openExternal`.
- `will-navigate` is blocked except to the dev renderer URL.
- `will-attach-webview` is globally prevented.
- The menu bar is auto-hidden; the window has a fixed background.

## Preload bridge (implemented)

`src/electron/preload.ts` exposes **only** a typed `window.sowyvid` object via
`contextBridge` — a fixed whitelist of methods (`app`, `projects`, `templates`,
`plan`, and a filtered `on`). The renderer never receives `ipcRenderer`,
`require`, or Node globals. Event subscriptions are limited to an allowlist of
channels.

## IPC input validation (implemented)

Every handler goes through `handle(channel, zodSchema, fn)`
(`src/electron/ipc/registry.ts`):
- The payload is **Zod-validated** before the handler runs; invalid input returns
  a `VALIDATION` error, never reaching business logic.
- Handlers return a `Result<T>` and never throw across the bridge; unexpected
  throws are caught and returned as `INTERNAL` (logged server-side, never leaked
  as a stack trace to the owner).

## Content Security Policy (implemented)

`src/app/index.html` sets a strict CSP: `default-src 'self'`, images/media limited
to `self`/`data:`/`blob:`, scripts to `'self'`, connections to `self` + the local
dev server only. No remote script or style origins.

## Filesystem & media handling

- Managed media uses **relative** paths under the per-project folder; absolute
  dev paths are never persisted into project data.
- **Media import validation is implemented** (MediaVault, `docs/MEDIAVAULT-INTEGRATION.md`):
  every file must have a supported extension AND matching magic bytes
  (extension-spoof rejection); empty and > 300 MB files are rejected; filenames are
  sanitized to a basename and stored content-addressed (`<sha256>.<ext>`), so path
  traversal and executable uploads are not possible. The import dialog is
  restricted to the supported extensions.
- **SVG is rejected.** Unrestricted SVG can carry scripts, external references, and
  active content that renders differently/unsafely in Electron/browser. A future
  SVG path must sanitize + rasterize to PNG before import.
- **Media analysis** invokes ffprobe/ffmpeg via `execFile` with **argument arrays**
  over validated managed paths — never a shell string, never user-controlled
  command construction (`docs/MEDIA-ANALYSIS.md`).
- **Controlled media protocol.** The renderer never receives raw filesystem paths.
  It references stable media IDs through a privileged `sowyvid-media://` scheme; the
  main-process handler (`src/electron/mediaProtocol.ts`) resolves only well-formed
  IDs (`media_<64hex>`) belonging to the requested project, restricted to that
  project's `media/` directory with a path-traversal guard (`resolveManagedMediaPath`).
  Invalid IDs and traversal attempts return 404 (unit-tested).
  The handler also honors single **byte ranges** (206 + `Content-Range`), which live
  video seeking requires; range parsing is pure and unit-tested, and multi-range
  degrades to a full 200 rather than being answered incorrectly.
- No shell strings are built from user input; no arbitrary command execution.

### Render-time media access (implemented — see MP4-EXPORT.md)

The export does **not** run inside Electron: `@remotion/renderer` drives its own
headless Chrome, which has no `sowyvid-media://` scheme. Rewriting media to
`file://` would have put real filesystem paths into the composition props,
defeating the controlled protocol. Instead each render starts an **ephemeral
loopback server** (`src/features/render/mediaServer.node.ts`) with the same
guarantees plus render-specific containment:

- assets addressed by **stable ID only**, resolved through the same
  `resolveManagedMediaPath` traversal guard; anything else → 404
- bound to **127.0.0.1** on an OS-assigned port — never reachable off-machine
- a **per-render random token** in every URL; stale or guessed URLs 404
- **closed on every exit path** (success, failure, cancel)

No filesystem path enters the composition props at any point.

### Render IPC (implemented — see MP4-EXPORT.md)

The export surface never accepts capability from the renderer: payloads are
`{ projectId, presetId }` / `{ jobId }` / `{ exportId }` only, Zod-validated.
Filesystem source paths, shell commands, bundle paths, composition modules and
executable arguments cannot cross the bridge — the main process reconstructs
the entire render request from persisted project data, and the destination
comes from a native save dialog it shows itself. Open-file/open-folder use
`shell.openPath` / `shell.showItemInFolder` on a persisted, re-validated record
path — never a shell string. Test seams (`SOWYVID_E2E_EXPORT_DIR`,
`SOWYVID_E2E_SUPPRESS_OPEN`, `SOWYVID_E2E_USER_DATA`) are env-gated and change
where a dialog answer comes from or whether a final window opens — never the
render path; redirecting one's own local app data is not a security boundary.

### Render cache deletion (implemented — see RENDER-BUNDLE-CACHE.md)

Refreshing a stale render bundle means deleting a directory, and a delete that
follows a junction is how a cache refresh destroys the owner's media. On Windows
a directory junction is trivially created and looks like an ordinary folder.
`safeRemoveDir` refuses to remove through a symlink/junction (rejected *before*
resolving), outside the cache root, or the root itself. Verified against **real
junctions**, with the test first proving the environment can actually create one
so the guarantee is not vacuously green. The render cache lives under the app's
`userData`, isolated from all project media.

## Local-network upload security (designed — see PHONE-IMPORT-ARCHITECTURE.md)

Random session token, expiring sessions, pairing confirmation, file-type/MIME/
size validation, sanitized filenames, no directory traversal, no executable
uploads, no permanent server after the session closes, no public internet
exposure, owner approval before files join the project.

## Credential storage (designed — see SOCIAL-CONNECTOR-ARCHITECTURE.md)

OAuth secrets and refresh tokens will live **only** in the main process, encrypted
with the OS secure store (e.g. Electron `safeStorage` / DPAPI on Windows). No
secrets in the renderer, none in source control (`.env*` and `*.key`/`*.pem` are
gitignored), none in plaintext.

## Known limitations (current)

- Media-import sanitization and the phone-upload server are not yet implemented;
  those controls exist as design, not code.
- Secure credential storage is not yet wired (no social publishing yet).
- These gaps are tracked in `docs/CURRENT-STATUS.md` and none are presented in the
  UI as finished.
