# Manual Suno Workflow

> Status: **Brief generation implemented and tested; the interface is NOT wired
> yet.** The "Crear en Suno" / "Copiar" / "Abrir Suno" buttons do not exist in
> the UI. The logic that produces the brief does, and is covered by tests.

## The position

SowyVid **does not generate music**. It writes a good brief and hands it to the
owner, who creates the track **in their own Suno account, under their own
terms**, downloads it, and imports it.

**There is no Suno API here, and that is deliberate.** Suno has no official
public API SowyVid is authorized to use. The only available options are
unofficial reverse-engineered endpoints and third-party resellers. Using either
would mean driving the owner's account through an unsanctioned channel, against
Suno's terms, with their credentials, on a contract that can vanish without
notice.

So `ManualSunoWorkflow` has **no `generateTrack` method at all**. Its absence is
the safeguard: there is nothing to enable, not even a feature flag. `available`
is `false` and stays false until an **official, authorized** API exists.

Explicitly **not permitted**, by design and policy:

- automating or scripting Suno's website
- scraping Suno
- unofficial / third-party Suno API services

## The workflow

```
Northstar commercial intent
        +
FrameLogic visual energy
        +
SoundWeave duration and mood
        ↓
SowyVid generates a music brief          ← implemented (musicProviders.ts)
        ↓
Owner clicks "Crear en Suno"             ← NOT wired
        ↓
SowyVid opens Suno in the owner's browser
        ↓
Owner creates and downloads the music under their OWN account
        ↓
Owner imports the downloaded file        ← works (existing import)
        ↓
MediaVault stores it                     ← works
        ↓
SoundWeave synchronizes it               ← works (select as musicId → AudioPlan)
```

The tail of this pipeline already works today: an imported mp3/wav becomes a
managed asset, and selecting it as the project's music produces a real AudioPlan
with fades, looping and ducking. This is proven in
`e2e-electron/audio-preview.spec.ts` with a genuine mp3.

## The brief

`src/features/audio/musicProviders.ts` → `musicBriefFor()`

Inputs come from the real plans, not from guesses:

| Brief field | Source |
|---|---|
| duration | **SoundWeave/VisualPlan timeline** (`totalDurationInFrames / fps`) — the bed must cover the whole commercial |
| energy + tempo | **FrameLogic**: motion zoom range and cut rhythm → calm (70–90 BPM) / balanced (95–115) / energetic (120–140) |
| tone | **FrameLogic** art direction |
| industry, product, business | the owner's brief |

The prompt is **deterministic** — the same commercial always briefs the same, so
regenerating is consistent.

It always asks for:

- **instrumental** — no vocals, no lyrics; the owner's message carries the words
- music that **sits under a voice and on-screen text**: no sudden drops, no long
  silence, midrange kept light so speech stays intelligible
- a **clean, loopable structure with a clear ending** (SoundWeave loops a short
  bed under a longer commercial)

Written in **English on purpose** — music generators respond best to English
prompts, even though SowyVid's interface is Spanish.

Example (Go Cellular, 20s, energetic):

> Instrumental background music for a 20-second phone-electronics advertisement.
> Mood: high-energy, punchy, driving, confident. Tone: premium-dark. Tempo:
> 120-140 BPM. Purpose: background bed for a short commercial promoting
> teléfonos certificados. The music must sit UNDER a voice and on-screen text:
> no vocals, no lyrics, no sudden drops, no long silence, and a clean loopable
> structure with a clear ending. Keep the mix light in the midrange so speech
> stays intelligible.

## Licensing

SowyVid **never claims ownership or licensing** for any track, and never
auto-fills it. `AudioMetadata.licenseNote` (and `creator`, `source`) store only
what the **owner** typed. An empty field means "not stated" — never "cleared for
use". See `docs/MUSIC-GENERATION-PROVIDERS.md`.

## Not done

- **UI**: the brief is not shown anywhere; there is no copy button and no
  "Abrir Suno" button. `SUNO_CREATE_URL` is defined but nothing opens it.
  (Electron's window-open handler already routes `https://` to the system
  browser, so wiring it is small.)
- The metadata fields exist on the schema but there is no form to fill them in.
