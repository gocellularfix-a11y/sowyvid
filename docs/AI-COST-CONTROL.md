# AI Cost Control & Gateway

> Status: Not yet implemented — design only.

This document describes the planned **provider-neutral AI gateway** for **SowyVid** and
the cost-control discipline around it. AI is strictly **optional and additive** — it
never gates core creation. Contracts only; no code here exists yet.

Intended module locations:

- `src/features/ai/` — AI status UI, per-feature toggles, usage meter.
- `src/electron/ai/` — gateway, provider adapters, cache, budget ledger.

## 1. Priority order (AI is the last resort)

Every AI-eligible feature must resolve in this order and stop at the first sufficient
answer:

```
1. Deterministic rules        (src/rules/, already built) — free, instant, offline
2. Cached prior result        (same input → reuse; no new call)
3. Local metadata analysis    (dimensions/duration/orientation/hasAudio, heuristics)
4. AI provider                (only when it adds value the above cannot)
```

If steps 1–3 answer the need, **no AI call is made**. AI is invoked only when it
genuinely improves the outcome.

## 2. What AI may do (all optional)

| Responsibility | Example | Fallback when AI is off/unavailable |
| --- | --- | --- |
| Improve copy | Tighten a headline | Keep user/rule-generated copy as-is |
| Alternatives | Extra headline/CTA options | Offer the single rule-generated option |
| Media classification | Guess a photo is "food" vs "product" | Use filename/heuristics or ask the user |
| Media ranking | Suggest a hero image order | Use import order / simple heuristics |

**Hard rule:** none of open, import, template selection, preview, edit, or
render/export ever requires AI. With AI fully disabled, the product still creates and
exports videos end to end.

## 3. Provider-neutral gateway

No vendor is hardcoded. Features request a **capability**; the gateway routes to a
configured provider/model.

```ts
interface AiProvider {
  readonly id: string;                 // e.g. 'mock', 'provider-x'
  readonly isMock: boolean;
  readonly requiresNetwork: boolean;
  readonly requiresCredential: boolean;
  complete(req: AiRequest): Promise<Result<AiResponse>>;
}

interface AiRequest {
  feature: AiFeatureId;                // per-feature model selection key
  input: unknown;                      // validated per feature
  schema: string;                      // expected JSON response schema id (Zod)
  reason: string;                      // why this request was made (stored)
  maxTokens: number;
  timeoutMs: number;
}

interface AiResponse {
  data: unknown;                       // Zod-validated against the feature schema
  usage: { inputTokens: number; outputTokens: number; estimatedCost?: number };
  fromCache: boolean;
  provider: string;
}
```

Per-feature **model selection**: each `AiFeatureId` maps to a configured
provider+model, so cheap features use cheap models and no feature is locked to one
vendor.

## 4. Cost controls

| Control | Mechanism |
| --- | --- |
| Explicit provider interface | All calls go through `AiProvider`; no ad-hoc SDK calls scattered in features. |
| Per-feature model selection | Config maps feature → provider/model; tune cost per use. |
| Request dedup | Identical in-flight requests share one call (coalescing). |
| Response caching | Deterministic cache key from `{feature, normalized input, model}`; cache hit → no call. |
| Structured JSON + Zod | Every response validated; malformed output rejected, not trusted. |
| Retry / token / timeout limits | Bounded retries, `maxTokens`, `timeoutMs` per request. |
| Visible AI status | UI shows idle / thinking / cache-hit / disabled / error. |
| Offline graceful behavior | No network → fall back to rules/local; never block the user. |
| Monthly usage ceiling | Configurable budget; when reached, AI features disable gracefully. |
| Per-op estimated usage | Each op shows an estimate before/after; usage metered. |
| Audit fields | Store `reason` + `fromCache` for every request. |
| Feature disable switch | Global and per-feature off switches. |

## 5. Caching & dedup detail

```ts
type CacheKey = string; // hash of { feature, normalizedInput, provider, model, schema }

interface CacheEntry {
  key: CacheKey;
  response: AiResponse;   // fromCache set true on read
  createdAt: string;
  reason: string;         // why the original request was made
}
```

- Cache key normalizes input (trim, lowercase where safe, stable field order) so
  equivalent requests collide intentionally.
- Dedup coalesces concurrent identical keys into one provider call; all callers get the
  same result flagged appropriately.
- Cached results count as priority step 2 — preferred over any new call.

## 6. Budget ledger

```ts
interface AiBudget {
  monthlyCeiling: number;      // configurable, user-facing
  spentThisMonth: number;      // estimated
  perFeatureEnabled: Record<AiFeatureId, boolean>;
  globallyEnabled: boolean;
}
```

- Before each call the gateway checks the ceiling; if exceeded, the call is skipped and
  the feature falls back to rules/local with a clear Spanish notice.
- Every op records estimated usage so the meter and ceiling stay honest.

## 7. Audit / transparency

For each request the gateway persists:

| Field | Purpose |
| --- | --- |
| `feature` | Which capability asked. |
| `reason` | Why the request was made (human-readable). |
| `fromCache` | Whether it was served without a provider call. |
| `provider` / `model` | What answered. |
| `usage` | Tokens / estimated cost. |
| `createdAt` | When. |

This makes AI spend inspectable and debuggable, and supports the visible AI status UI.

## 8. DEV MOCK provider (default first)

- Development starts with a **clearly labeled mock provider** (`isMock: true`,
  `requiresNetwork:false`, `requiresCredential:false`).
- The UI must **never present mock output as real intelligence** — it is visibly badged
  (Spanish: "Modo demostración — no es IA real"). This keeps the app honest and lets the
  whole gateway (cache, dedup, budget, status, Zod validation) be built and tested
  without any paid vendor.
- A real provider implements the same `AiProvider` interface and swaps in via config;
  nothing else in the app changes. Because features depend only on the interface, no
  vendor is ever hardcoded.

## 9. IPC surface

```ts
interface AiBridge {
  run(feature: AiFeatureId, input: unknown, reason: string): Promise<Result<AiResponse>>;
  getStatus(): Promise<Result<{ providerId: string; isMock: boolean; online: boolean }>>;
  getBudget(): Promise<Result<AiBudget>>;
  setFeatureEnabled(feature: AiFeatureId, enabled: boolean): Promise<Result<void>>;
  setGloballyEnabled(enabled: boolean): Promise<Result<void>>;
}
```

Secrets/credentials for real providers live in the main process only (never the
renderer) and follow the secure-storage boundary described for publishing credentials in
`SOCIAL-CONNECTOR-ARCHITECTURE.md`. All boundaries validate with Zod.
