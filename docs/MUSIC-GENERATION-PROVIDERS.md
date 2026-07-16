# Music Generation Providers

> Status: **Contract + registry implemented and tested.** No provider can
> generate music from inside SowyVid today, by design. The manual Suno workflow
> is the only entry: `docs/SUNO-MANUAL-WORKFLOW.md`.

## The contract

`src/features/audio/musicProviders.ts`

```ts
interface MusicGenerationProvider {
  id: string
  label: string
  /** True ONLY when this provider can legitimately generate from inside SowyVid. */
  available: boolean
  /** Every provider can write a brief. This part SowyVid always owns. */
  generatePrompt(input: MusicPromptInput): MusicPromptResult
  /** Optional. Present ONLY with an official, authorized API. */
  generateTrack?(input: MusicGenerationInput): Promise<GeneratedTrack>
}
```

`generateTrack` is **optional on purpose**. A manual provider does not implement
it at all — there is no disabled code path, no flag, and nothing to switch on
with an unofficial endpoint. Absence is the safeguard.

## Registry

`MUSIC_PROVIDERS` is the single place providers are declared, so an official
music API can be added later **without touching** brief generation, MediaVault
import, or SoundWeave synchronization.

| Provider | `available` | `generateTrack` |
|---|---|---|
| `suno-manual` (`ManualSunoWorkflow`) | ❌ false | **absent** |

`availableGenerators()` returns only providers that are both `available` and
actually implement `generateTrack`. Today it returns `[]`, and a test asserts
that any provider exposing `generateTrack` must have `available === true` — the
two can never disagree.

## Adding an official provider later

1. Implement `MusicGenerationProvider` with a real `generateTrack`, set
   `available: true`, and add it to `MUSIC_PROVIDERS`.
2. `generateTrack` returns a **local file path**; hand it to the existing import
   path so MediaVault stores it and SoundWeave picks it up. Nothing downstream
   changes.
3. Credentials belong to the owner. SowyVid must not ship or proxy shared keys.

Requirements before any provider may set `available: true`:

- an **official, documented, authorized** API
- terms that permit this use
- the owner's own account/credentials, entered by them

## Licensing and ownership

> SowyVid does **not** claim ownership or licensing for any track, and never
> infers it.

`AudioMetadata` (`src/shared/domain/media.ts`) stores **only owner-provided**
information: `title`, `creator`, `source`, `mood`, `energy`, `licenseNote`,
`tags` (plus `importedAt` as the date added). Every field is entered by the
owner and stored verbatim.

An empty `licenseNote` means **"not stated"** — never "cleared for use". SowyVid
does not detect, assert, or clear rights for anything the owner imports.

## Reference safety

Audio selected by a saved AudioPlan is a managed asset like any other, so the
existing media-reference safety system already covers it: a referenced track
cannot be silently removed, and a missing one is reported as an explicit
**missing-track state** in the AudioPlan rather than degrading to silence
(`docs/SOUNDWEAVE-INTEGRATION.md`).

## Not done

- No provider UI. The brief is generated but not displayed; there is no copy
  button and no "Abrir Suno" button.
- No metadata form — `audioMeta` exists on the schema with no way to fill it in.
- No music library interface (choose / preview / replace / remove a track).
