# Validation report — Jorge Engine Vault v1

Validation date: 2026-07-15

## Results

- Strict TypeScript: **PASS — 6/6 packages**
- Automated tests: **PASS — 12 test files, 40 tests**
- Production builds: **PASS — 6/6 packages**
- Compiled ESM import smoke: **PASS — 6/6 packages**
- Production dependency audit: **PASS — 0 vulnerabilities**

## Test totals

| Engine | Test files | Tests |
|---|---:|---:|
| Northstar Creative | 7 | 14 |
| BridgeDrop LAN | 1 | 7 |
| SoundWeave Audio | 1 | 5 |
| MediaVault | 1 | 5 |
| FrameLogic Visual | 1 | 4 |
| PromptGate AI | 1 | 5 |
| **Total** | **12** | **40** |

## High-value runtime checks

- BridgeDrop QR matrix decoded back to the exact pairing URL with `jsQR`.
- BridgeDrop launched a real temporary HTTP server and served a brand-injected mobile page.
- MediaVault copied bytes into managed storage and detected duplicates by SHA-256 content.
- PromptGate deduplicated concurrent calls, validated schemas, enforced ceilings, and timed out stalled transports.
- SoundWeave produced deterministic serialized mix plans and reported narration overflow instead of silently hiding it.
- FrameLogic produced deterministic renderer-neutral visual plans without adjacent layout repetition.
- Northstar preserved complete nested serialization and deterministic seeded output.

## Honest boundary

This report certifies the included local code and tests, not future host integrations. Platform firewalls, real AI providers, codecs, renderers, and social APIs require separate integration testing in the application that consumes these engines.
