# Render Bundle Cache

> Status: **Implemented and verified.** This is a safety document. It exists
> because of a specific, expensive failure — read the first section before
> changing anything here.

## The failure this prevents

A previous Remotion application (Colibrí) shipped **silent videos for a month**.

- Its render worker copied a compiled bundle into a serve directory, guarded by:
  *"does `index.html` already exist? → don't copy."*
- The directory had existed since **June 16**. Everything compiled afterwards —
  including all audio support — never reached it. Production rendered for a
  month with the June engine, which did not know how to place music.
- **The diabolical part:** music *selection* still worked. It picked the track,
  copied it, and reported "there is music". Remotion started in audio mode…
  while the stale composition rendered no `<Audio>` elements. Remotion filled
  the gap with a **phantom silent track**. No error. No warning. Perfect mute.
- **Why every test passed:** the proof scripts bundled into a *fresh* directory
  each run. Production used the rotten cache. The test and the reality never
  shared a path — "works on my machine", institutionalized.

Two lessons, both encoded below:

1. **Invalidate by fingerprint, not by existence.**
2. **Tests must run the same path production runs**, with a stale cache present.

## The rule

SowyVid never asks *"does the directory exist?"*. It asks:

> **Is the bundle on disk built from exactly the code I am running right now?**

```
current bundle fingerprint
        ↓
compare with the cached bundle's stamp
        ↓
different / missing / unreadable / old format
        ↓
safely refresh the render work directory
        ↓
record the new fingerprint (only after a successful build)
```

## The fingerprint

`src/features/render/bundleFingerprint.ts` — pure, no filesystem, fully tested.

A SHA-256 over:

| Input | Why |
|---|---|
| Every source file under `src/render`, `src/features/audio`, `packages/soundweave-audio-engine/src` | anything the composition can reach at runtime |
| Versions of `remotion`, `@remotion/bundler`, `@remotion/renderer`, `react` | a Remotion upgrade must invalidate the cache even if our source is untouched |

Properties, each with a test:

- **Content-based**, not size+mtime. Colibrí used size+mtime of `bundle.js`;
  mtime survives copies and sizes can coincide. A content hash cannot.
- **Order-independent** — directory traversal order can never change it.
- **Separator-independent** — the same code fingerprints identically on Windows and POSIX.
- **Length-prefixed** — moving bytes across a file boundary still changes it.
- **Rename-sensitive** — identical content at a new path is a new fingerprint.
- Tests are excluded: they never reach the bundle, so including them would churn the cache for nothing.

**The fingerprint IS the directory name** (`bundle-<first16>`), so a stale hit is
not merely unlikely — it is unrepresentable.

## The stamp

Each built bundle carries `sowyvid-bundle.json`:

```json
{ "fingerprint": "…", "stampVersion": 1, "builtAt": "…" }
```

Written **only after a successful build**, so a crashed or interrupted build can
never be mistaken for a valid cache.

`decideCache()` is the one function allowed to say "reuse", and it never says it
out of optimism:

| Situation | Decision |
|---|---|
| stamp matches current fingerprint | **reuse** |
| no bundle / no `index.html` | build (`missing`) |
| **directory exists but has no stamp** | build (`no-stamp`) — *the Colibrí bug* |
| stamp unreadable / foreign / not an object | build (`unreadable-stamp`) |
| `stampVersion` not current | build (`stale-version`) |
| fingerprint differs | **rebuild** (`fingerprint-mismatch`) |

**Self-repairing:** an old cache from a previous SowyVid has no stamp (or an old
one), so the first render after upgrading refreshes it automatically. Nobody
ever has to be told "delete this folder".

## Safe refresh (this is where a bug becomes data loss)

Refreshing means **deleting**, and a delete that follows a junction is how a
cache refresh destroys the owner's photos. On Windows a directory junction is
easy to create by accident and looks like an ordinary folder.

`src/features/render/safeRemove.node.ts` removes a directory only when **all** hold:

- it is **not** a symlink/junction — rejected *before* resolving, so a link
  pointing at user media is never traversed even if it would resolve somewhere
  innocuous
- its real path is **strictly inside** the cache root (both sides resolved, so a
  redirected profile still works and a shared prefix like `/a/bcache` vs `/a/b`
  cannot sneak through)
- it is **not** the cache root itself
- it is a real directory

Node's `fs.rm({recursive:true})` unlinks nested symlinks rather than following
them, so nested links cannot escape either.

Tested with **real junctions** on this machine (the test first proves the
environment can actually create one, so the guarantee is never vacuously green):
a junction into user media is refused and the media survives.

## Packaged mode (prebuilt bundle)

A packaged app has no repository, no webpack and no `@remotion/bundler`. At
package time, `scripts/prepare-render-bundle.ts` compiles the bundle **with the
same compiler and stamps it with the same fingerprint function** used in
development, and electron-builder ships it as `resources/render-bundle`. At
runtime, `ensureRenderBundle` in prebuilt mode treats the shipped stamp's
fingerprint as current (the shipped bundle is immutable per installed version)
and "building" means **copying** the shipped bundle into the fingerprinted
cache. Everything else — the decision table, the stamp-after-success rule, the
guarded deletion, the self-repair of stale/unstamped caches — is byte-for-byte
the same code path.

Verified against the packaged `.exe` with a **planted stale cache** at exactly
the shipped fingerprint's directory name: the packaged app replaced it before
rendering and the output was measurably audible
(`docs/WINDOWS-PACKAGED-VALIDATION.md`).

## Isolation

The render cache lives in the app's **userData** directory
(`<userData>/render-cache/bundle-<fingerprint>/`) — never inside a project's
media folder. Render scratch lives in a separate temp root and is removed on
success, failure and cancel.

## Preview and export share composition code

`src/render/Root.tsx` registers `<CommercialComposition>`; the preview `<Player>`
mounts the *same* component with props from the *same* adapters
(`remotionProps.ts` / `remotionAudio.ts`). There is no second composition to
drift out of sync.

## How this is verified

`src/features/render/realRender.test.ts` — run it with `npm run verify:render`.

It **plants the Colibrí failure**: a bundle directory at exactly the fingerprint
the render is about to want, containing a pre-audio `index.html` and a stamp
from `2026-06-16`. Then it drives **`runRenderJob`, the real production
function** — not a private fresh bundle — and asserts:

- the stale bundle was **replaced** (`bundleRebuilt === true`), its stamp now
  matches, and its `index.html` no longer contains the stale marker
- the rendered MP4's audio is **measurably audible** (RMS, not "ffprobe says AAC")
- a **second** render reuses the bundle (`bundleRebuilt === false`) **and is
  still audible** — a reused bundle must never mean a silent export

Measured on a real run: `mean_volume -26.8 dBFS` (threshold −50).
