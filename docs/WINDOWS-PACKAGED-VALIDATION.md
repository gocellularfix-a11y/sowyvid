# Windows Packaged Validation

> Status: **Validated — owner's path only.** The packaged `SowyVid.exe`
> (win-unpacked) produced and validated a real audiovisual MP4 using ONLY the
> owner's buttons (Continuar → Este equipo → Descargar video), from a planted
> stale cache, with measured audio, and the export history is visible in the UI
> after a packaged restart. What remains unvalidated is listed at the end.
>
> **Post-mortem note:** the first version of this suite set the music selection
> through `window.sowyvid` — a path the owner does not have — and went green
> while Jorge's real exports were silent (an imported mp3 was never selected as
> music) and his history was invisible after restart (no UI state restoration).
> The suite now drives the owner's actual buttons, asserts the auto-selection,
> and asserts what is VISIBLE after restart, not what the bridge can fetch.
> Test what the owner can do, not what the test harness can do.

## How to run it

```bash
npm run test:e2e:packaged
```

That command **builds** the app (`electron-vite build`), **prebuilds the render
bundle** (`scripts/prepare-render-bundle.ts`), **packages** a Windows unpacked
build (`electron-builder --win --dir` → `release/win-unpacked/SowyVid.exe`),
then launches THE PACKAGED EXECUTABLE — never Electron from `node_modules` —
and drives the full owner workflow. `npm run verify:render` is development
verification and is **not** a substitute for this.

## Measured evidence (real packaged run)

```json
{
  "exe": "release/win-unpacked/SowyVid.exe",
  "outputPath": "<temp>/comercial-Teléfonos certificados con garantía.mp4",
  "bytes": 5025409,
  "resolution": "1080x1920",
  "durationSec": 18.048,
  "fps": "30/1",
  "videoCodec": "h264",
  "audioCodec": "aac",
  "sampleRate": "48000",
  "channels": 2,
  "meanVolumeDb": -26.9,
  "staleCacheRepaired": true
}
```

Also asserted in the same run: packaged ffprobe/ffmpeg really analyzed the
imported media (duration + poster produced), the preview mounted, five frames
sampled across the timeline were neither black nor blank and visibly changed,
open-file/open-folder resolved through the packaged IPC, and the export history
survived a restart of the packaged app.

## The packaged resource map

| Resource | Where it ships | Why |
|---|---|---|
| App code (main/preload/renderer) | `resources/app.asar` | standard electron-builder |
| **Prebuilt render bundle** + fingerprint stamp | `resources/render-bundle/` | the app renders by COPYING this into its fingerprinted cache — no webpack, no repository source, no `@remotion/bundler` at runtime |
| **Chrome Headless Shell** | `resources/chrome-headless-shell/` | development downloads it into `node_modules/.remotion`; a packaged app has no such directory and must not download at runtime. The exact browser used in development ships. |
| Remotion compositor (`remotion.exe` + its own ffmpeg dlls) | `app.asar.unpacked/node_modules/@remotion/compositor-win32-x64-msvc/` | native binaries cannot spawn from inside an asar |
| `@remotion/renderer` | asar, unpacked | production dependency (moved from devDependencies — a packaged app cannot import a dev dep) |
| ffmpeg-static / ffprobe-static | `app.asar.unpacked/node_modules/…` | media analysis at import time |
| sql.js wasm | asar, unpacked (`**/*.wasm`) | sql.js engine |
| **Excluded**: `@remotion/bundler`, webpack | not shipped | dev-only, loaded via dynamic import on the development render path exclusively |

## Development vs packaged path resolution

`src/electron/renderEnvironment.ts` is the single switch:

| | Development | Packaged (`app.isPackaged`) |
|---|---|---|
| Composition source | compiled at render time from `src/render/remotionEntry.ts` (repo) by `@remotion/bundler` | **prebuilt bundle copied from resources** |
| Fingerprint | content hash of the render sources + Remotion versions | the shipped stamp's fingerprint (computed at package time from the same sources by the same function; the shipped bundle is immutable per installed version) |
| Browser | Remotion's own download (`node_modules/.remotion`) | `resources/chrome-headless-shell/chrome-headless-shell.exe` via `browserExecutable` |
| Compositor | Remotion resolves its platform package | `app.asar.unpacked/...compositor-win32-x64-msvc` via `binariesDirectory` |
| ffmpeg/ffprobe (analysis) | module-reported path | same path **rewritten `app.asar` → `app.asar.unpacked`** (`unpackedBinaryPath`) |
| Render cache / temp | `<userData>/render-cache`, `<userData>/render-temp` | identical |

### The bug §11 predicted, found and fixed

The first packaged run failed with:

```
spawn C:\…\resources\app.asar\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe ENOENT
```

Electron's patched `fs` transparently redirects *reads* of asar-unpacked files,
but `spawn`/`execFile` do not — the binary genuinely lives in
`app.asar.unpacked`, and the module reports the asar path. Fixed centrally in
`unpackedBinaryPath()` (pure, unit-tested) and, for Remotion's compositor, by
passing `binariesDirectory` instead of letting it self-resolve into the asar.

## The cache safeguard, packaged (§12)

The fingerprint → compare → refresh → stamp flow is IDENTICAL in both modes
(`docs/RENDER-BUNDLE-CACHE.md`); only "build" differs (compile vs copy). The
packaged test **plants the Colibrí failure** in the fresh user-data directory —
a cache directory at exactly the shipped fingerprint's name containing a
pre-audio `index.html` and a June stamp — and asserts the packaged app replaced
it before rendering, then measures the audio anyway. Render cache lives under
`userData/render-cache`, physically separate from `userData/projects/<id>/media`;
refresh deletion remains junction-guarded (`safeRemove.node.ts`).

## Test seams (explicit, env-gated, no production effect)

| Variable | Effect | Scope |
|---|---|---|
| `SOWYVID_E2E_USER_DATA` | redirects `userData` in a **packaged** app | so the packaged suite never touches real owner data. Redirecting one's own local app data is already in a local user's power; the distinct name exists so nothing sets it by accident. |
| `SOWYVID_USER_DATA` | redirects `userData` in **unpackaged** runs only | pre-existing dev/test seam |
| `SOWYVID_E2E_EXPORT_DIR` | replaces the save dialog's ANSWER with a numbered filename in that directory | the render path is byte-for-byte identical |
| `SOWYVID_E2E_IMPORT_PATHS` | replaces the OPEN dialog's answer when the real "Este equipo" button is clicked | the import pipeline is identical; lets tests drive the owner's actual buttons |
| `SOWYVID_E2E_SUPPRESS_OPEN` | skips the final `shell.openPath`/`showItemInFolder` side effect after all validation passed | automated runs must not spawn video players/Explorer windows |

## Remaining limitations (do not claim these)

- **The NSIS installer is not validated.** Everything above ran against the
  `--dir` unpacked build. The installer target exists in `electron-builder.yml`
  but no installed-from-setup.exe run has been performed.
- **`shell.openPath` side effect is suppressed in automation.** The path
  validation, existence check and IPC wiring are exercised; the actual
  window-opening call is skipped under `SOWYVID_E2E_SUPPRESS_OPEN`. Jorge
  clicking "Abrir video" and seeing his player open — and *hearing* the audio —
  remains the human gate.
- **Package size is ~1.1 GB unpacked**, dominated by the shipped browser
  (~270 MB) and Electron itself. Fine for validation; a distributable would
  want trimming (e.g. exclude compositor platforms for other OSes, prune maps).
- **Code signing is not configured** (unsigned binaries; SmartScreen will warn).
- The provisional "SowyVid" brand still applies — do not distribute publicly
  (`docs/BRANDING.md`).
