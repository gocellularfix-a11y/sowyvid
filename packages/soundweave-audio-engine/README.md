# SoundWeave Audio Engine

A renderer-neutral, deterministic audio decision engine extracted from the useful audio foundation in the legacy project and rebuilt without product, Electron, React, Remotion, filesystem, or provider dependencies.

## Owns

- Music, narration, and extra-clip placement
- Frame-accurate fades and volume envelopes
- Music ducking under narration
- Narration overhang validation
- Exact, JSON-serializable mix plans

## Does not own

- Audio decoding
- TTS synthesis
- File storage
- Remotion/FFmpeg playback

```ts
import { resolveAudioMix, musicVolumeAt } from '@jorge-engines/soundweave-audio'
```
