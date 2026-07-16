# SowyVid — Engine Vault Catalog

Authoritative map of the **Jorge Engine Vault v1.0.0** and its integration state
in SowyVid. Consult this at the start of every phase before integrating an engine.

## Source artifact (protected — never modified)

| | |
|---|---|
| ZIP | `C:\Users\GO CELLULAR\Documents\ENGINES\Jorge-Engine-Vault-v1.0.0.zip` |
| SHA-256 | `8174539688688D78DF698109A31680235F20523B094D72D9881452FD8996C2F0` |
| Size | 286,956 bytes |
| Audit extraction (read-only) | `C:\Users\GO CELLULAR\Documents\ENGINES\Jorge-Engine-Vault-v1-Audit` |
| Vault manifest validation (per vault docs) | typecheck PASS 6/6 · 12 test files · 40 tests · builds 6/6 · 0 prod vulns |

### Isolated-validation note (honest)

The vault's own `npm install` **could not complete in this environment** — npm
aborted with `Exit handler never called!` (an npm/environment failure while
installing the 6-package workspace), so `tsc`/`vitest` were unavailable and the
vault's own typecheck/test/build **could not be reproduced here**. `npm audit`
succeeded: **0 vulnerabilities**. The vault's documented validation (40 tests,
6/6 builds) is taken from its own reports. Northstar (the only engine integrated
so far) was instead verified under **SowyVid's** toolchain (TS 5.7 + vitest 2.1),
where its 7 original test files (14 tests) pass — see `docs/CREATIVE-ENGINE-INTEGRATION.md`.

Status legend: `AVAILABLE` `AUDITED` `READY` `INTEGRATED` `DEFERRED` `BLOCKED` `REJECTED`.

---

## 1. Northstar Creative Engine — **INTEGRATED**

| Field | Value |
|---|---|
| Package | `@jorge-engines/northstar-creative` |
| Version | 1.0.0 (internal `ENGINE_VERSION` 2.0.0) |
| Source dir (audit) | `packages/northstar-creative-engine` |
| Vendored into SowyVid | `packages/northstar-creative-engine/` |
| Purpose | Deterministic creative planning: classification, family/variant selection, scene planning, pacing, media assignment, diversity, serialization, renderer-neutral compile |
| Public API | `developConcepts`, `developAllConcepts`, `buildCreativePlan`, `compileCreativePlan`, `adaptRenderPlan`, `remotionAdapter` (subpath), `evaluatePlanDiversity`, `compareRenderFingerprints`, `classifyPromotion`, `rankFamilies`, `serialize/validateCreativePlan`, `serialize/validateRenderPlan`, `planSignature` |
| Input contract | `DirectorInput` (businessName, productOrService, offer, locale en/es/pt, objective, media[], platformIntent, requestedDurationSec) + `CommercialContent` |
| Output contract | `CreativePlan` (5 families × 3 variants; CTA-final; durations == target) → `CommercialRenderPlan` (scene timeline, platform preset, audio direction) |
| Dependencies | `zod` only |
| Test result | 7 files / 14 tests **PASS under SowyVid vitest** |
| Build result | Compiled with SowyVid's electron-vite build (consumed from source) |
| Prod vulnerabilities | 0 |
| Known limitations | Plans only — does not render, analyze pixels, generate AI copy, or manage files |
| SowyVid phase | **A (current)** |
| Integrated | **Yes** |
| Adapter required | `ProjectToCreativeInputAdapter`, `CreativeEngineService`, `CreativePlanToRendererAdapter` (in `src/features/creative/`) |
| Must not import | React, Electron, SQLite, UI, product branding, filesystem |

## 2. MediaVault Engine — **DEFERRED**

| Field | Value |
|---|---|
| Package | `@jorge-engines/mediavault` v1.0.0 |
| Source dir | `packages/mediavault-engine` (src: contracts, probe, classify, store, catalog) |
| Purpose | Managed media import: magic-byte validation, SHA-256 content IDs, dedup, byte-copy into managed storage, EN/ES/PT classification, license-gated catalog selection |
| Public API | `contracts`, `probe` (signature detect), `classify`, `store` (import/dedup), `catalog` (license-gated selection) |
| Input/Output | File bytes + metadata → managed asset records with content IDs |
| Dependencies | `zod` |
| Test/Build (vault docs) | 1 file / 5 tests PASS · build PASS · 0 vulns |
| SowyVid phase | **B (media import)** |
| Integrated | No — deferred until Phase 6 (media pipeline) |
| Adapter required | `MediaImportAdapter`, `ManagedStorageAdapter`, `MediaMetadataRepository`, `MediaIdResolver` |
| Must not import | React, Electron, database, cloud, AI |

## 3. FrameLogic Visual Engine — **DEFERRED**

| Field | Value |
|---|---|
| Package | `@jorge-engines/framelogic-visual` v1.0.0 |
| Source dir | `packages/framelogic-visual-engine` (src: index) |
| Purpose | Renderer-neutral visual direction: art direction, 7 motion profiles, grades, crops, layout rhythm (no adjacent repetition), safe text frames → `VisualDirectionPlan` |
| Public API | `resolveArtDirection`, `getMotionProfile`, `resolveGrade`, `planSceneLayouts`, `resolvePolishedTextFrame`, `createVisualDirectionPlan` |
| Input/Output | Creative scene intents + seed → JSON-safe visual plan |
| Dependencies | `zod` |
| Test/Build (vault docs) | 1 file / 4 tests PASS · build PASS · 0 vulns |
| SowyVid phase | **C (visual/Remotion render)** |
| Integrated | No — deferred until rendering phase |
| Adapter required | `CreativePlan → FrameLogic → VisualPlan → Remotion adapter` (Remotion stays app-side) |
| Must not import | React, Remotion, branding |

## 4. SoundWeave Audio Engine — **DEFERRED**

| Field | Value |
|---|---|
| Package | `@jorge-engines/soundweave-audio` v1.0.0 |
| Source dir | `packages/soundweave-audio-engine` (src: index) |
| Purpose | Deterministic audio planning: music/narration/clip placement, fades, ducking under narration, frame envelopes, narration-overflow reconciliation |
| Public API | `resolveAudioMix`, `placeNarration`, `reconcileNarration`, `duckWeightAt`, `musicVolumeAt`, `clipVolumeAt`, `AudioPlan`/`AudioMixPlan` schemas |
| Input/Output | `AudioPlan` + scene windows + fps + asset resolver → `AudioMixPlan` (frame-accurate) |
| Dependencies | `zod` |
| Test/Build (vault docs) | 1 file / 5 tests PASS · build PASS · 0 vulns |
| SowyVid phase | **D (audio, after preview stable)** |
| Integrated | No |
| Adapter required | `CreativePlan + ProjectAudioSettings → SoundWeave → AudioPlan → Remotion audio adapter` |
| Must not import | React, Remotion, Electron, filesystem, TTS |

## 5. BridgeDrop LAN Engine — **DEFERRED**

| Field | Value |
|---|---|
| Package | `@jorge-engines/bridgedrop-lan` v1.0.0 |
| Source dir | `packages/bridgedrop-lan-engine` (src: session, network, media, page, qr, server, types) |
| Purpose | Secure temporary phone→desktop uploads over LAN: pairing sessions, 128-bit tokens, constant-time compare, QR, magic-byte validation, sanitized names, mobile page, no-store headers |
| Dependencies | `qrcode`, `zod` (dev: `jsqr`, `@types/qrcode`) |
| Test/Build (vault docs) | 1 file / 7 tests PASS (real temp HTTP server + QR decode) · build PASS · 0 vulns |
| SowyVid phase | **E (phone import, after MediaVault)** |
| Integrated | No |
| Adapter required | Phone → BridgeDrop temp upload → owner approval → **MediaVault** import → project media (BridgeDrop is not a permanent store) |
| Platform boundary | Requires OS firewall to allow the temporary port; genuinely opens a local HTTP server (isolated transport) |
| Must not import | React, Electron, database, UI; product branding is **injected** |

## 6. PromptGate AI Engine — **DEFERRED**

| Field | Value |
|---|---|
| Package | `@jorge-engines/promptgate-ai` v1.0.0 |
| Source dir | `packages/promptgate-ai-engine` (src: index) |
| Purpose | Provider-neutral structured AI gateway: transport injection, Zod-validated JSON, cache, in-flight dedupe, monthly request/token ceilings, timeouts, retry bounds, usage metadata |
| Public API | `AiGateway`, `AiTransport`, `MemoryAiCache`, `MemoryUsageStore`, `UsagePolicy`, `createDeterministicMockTransport`, `MarketingScenePlan` schema |
| Dependencies | `zod` (uses `node:crypto`) |
| Test/Build (vault docs) | 1 file / 5 tests PASS · build PASS · 0 vulns |
| SowyVid phase | **F (AI, last — after deterministic workflow works)** |
| Integrated | No |
| Adapter required | Host supplies a real provider transport; SowyVid injects credentials outside the package |
| Must not import | Any vendor SDK in-core; real credentials stay host-side |
| Note | Real AI calls need a host-supplied transport; the mock transport is clearly non-production |

## Not promoted into the vault (per its EXTRACTION-MAP)

Electron monolith, `Stage0Video.tsx` composition, Facebook/social publishing
(needs live Meta API + OAuth + review), asset-factory mocks, empty media corpus,
business connectors (interfaces only). SowyVid treats social publishing as
**BLOCKED** (honest manual export until credentials exist).
