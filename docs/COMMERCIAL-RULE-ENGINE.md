# SowyVid — Commercial Creative Engine

> **Superseded.** The temporary in-repo deterministic engine described here in an
> earlier milestone has been **removed**. SowyVid's canonical creative brain is now
> the **Northstar Creative Engine** (`@jorge-engines/northstar-creative`), vendored
> from the Jorge Engine Vault.

See:

- **`docs/CREATIVE-ENGINE-INTEGRATION.md`** — how Northstar is integrated, the
  adapters, persistence, reproducibility, and migration behavior.
- **`docs/ENGINE-VAULT-CATALOG.md`** — Northstar's public API, contracts, versions,
  and validation.
- **`docs/ENGINE-INTEGRATION-ARCHITECTURE.md`** — the adapter pattern and import
  strategy.

## One-paragraph summary

Northstar deterministically converts a promotional brief + local media metadata
into a validated, reproducible `CreativePlan` (5 creative families × 3 structural
variants), then compiles it into a renderer-neutral `CommercialRenderPlan`
(CTA-final; scene durations sum exactly to the target; sequential frame timeline).
No AI and no randomness: identical normalized inputs + seed + engine version
produce byte-identical plans. SowyVid persists `engineVersion`, `family`,
`variantId`, `conceptId`, `seed`, and an `inputFingerprint` with each project for
reproducibility. The engine imports nothing from SowyVid/React/Electron/Remotion;
the app consumes it only through `src/features/creative/`.
