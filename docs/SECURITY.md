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
  traversal and executable uploads are not possible; `resolveFile` guards against
  escaping the vault root. The import dialog is restricted to the supported
  extensions.
- No shell strings are built from user input; no arbitrary command execution.

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
