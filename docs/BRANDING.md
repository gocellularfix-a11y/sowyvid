# SowyVid — Branding

**"SowyVid" is a provisional product name.** All product identity flows from one
typed source so the app can be rebranded without hunting through the codebase.

## Canonical source

`src/config/branding.ts` exports a single `branding: BrandingConfig`:

```ts
type BrandingConfig = {
  productName: string       // header wordmark, AppInfo.name, diagnostics
  shortName: string
  internalCodename: string
  tagline: string
  appId: string             // installer / OS app id
  windowTitle: string       // Electron BrowserWindow title
  dataDirectoryName: string // OS userData dir → where projects/DB live
  databaseName: string
  supportEmail?: string
  website?: string
  copyright: string
}
```

### Consumed by (runtime)

| Surface | Source |
|---|---|
| Electron window title | `main.ts` → `branding.windowTitle` |
| App display name / userData dir | `main.ts` → `app.setName(branding.dataDirectoryName)` |
| Header wordmark | `AppHeader.tsx` → `branding.productName` |
| Diagnostics / `AppInfo.name` | `registerHandlers.ts` + browser mock → `branding.productName` |

Engines never import branding — they stay brand-neutral (`docs/ENGINE-INTEGRATION-ARCHITECTURE.md`).

## How to change the final name later

1. Edit **`src/config/branding.ts`** — set `productName`, `windowTitle`, `appId`,
   `dataDirectoryName`, `databaseName`, `copyright`, `tagline`.
   - ⚠️ Changing `dataDirectoryName`/`databaseName` moves where user data lives.
     Ship a migration or a one-time data-move step if renaming after release.
2. Update **build config that cannot import TS**:
   - `electron-builder.yml` (`appId`, `productName`, `copyright`, artifact name).
   - `package.json` `name` (npm identifier) if desired.
   - `src/app/index.html` `<title>` (static fallback before React mounts).
   - The `SowyvidMark` glyph + `SowyvidBridge`/`window.sowyvid` global (see below).
3. Optional: mirror identity into `build/branding.json` for tooling that reads
   JSON at build time, and reference it from build scripts.

## Provisional technical identifiers (intentionally NOT renamed yet)

To avoid risky churn, these keep the `sowyvid` name for now and are documented as
provisional:

- `window.sowyvid` bridge global and the `SowyvidBridge` type.
- `SowyvidMark` / `SowyvidRendererPlan` type names.
- IPC channel strings (`app:*`, `project:*`, `engine:*`) — internal, stable.
- Repo folder name `C:\sowyvid` and the npm package `name: "sowyvid"`.

Renaming these is a mechanical follow-up once the final brand is chosen; it does
not affect product identity shown to users, which is fully driven by
`branding.ts`.

## Do not

- Do not package, sign, publish, or release publicly under the provisional brand.
- Do not scatter hardcoded product-name string literals in new code — import
  `branding` instead.
