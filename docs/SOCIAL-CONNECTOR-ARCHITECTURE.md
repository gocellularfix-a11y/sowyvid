# Social Connector Architecture

> Status: Not yet implemented — design only.

This document describes the planned **publishing domain** for **SowyVid**: platform
adapters (Instagram, Facebook, TikTok, YouTube), the credential boundary, the publishing
queue, and — importantly — an **honest manual-export fallback**. Real automated
publishing is blocked without official API access; the initial product exports valid,
platform-ready media regardless. Contracts only; no code here exists yet.

Intended module locations:

- `src/features/publish/` — publish UI, account status, queue view, history, manual
  export flow.
- `src/electron/publish/` — adapters, OAuth handling, secure credential storage, queue
  worker.

## 1. Honesty first

> SowyVid will **not fake successful publishing.** Direct posting to any platform
> requires official API access, an approved app, valid OAuth credentials, and platform
> review. Until those exist for a platform, that platform's adapter reports
> `unavailable`, and the user is guided to the **manual export** path, which produces a
> correct, ready-to-upload file. No status is ever reported as "published" unless a
> platform API actually confirmed it.

## 2. Input: a validated export

The publishing domain consumes a validated MP4 from the render subsystem
(`ExportHistoryEntry` in `RENDERING.md`) plus a `PublishRequest`. It never renders; it
distributes what render already produced and validated.

```ts
interface PublishRequest {
  projectId: string;
  exportRef: string;            // ExportHistoryEntry.jobId
  platform: PlatformId;
  caption: string;
  hashtags: string[];
  thumbnailRelPath?: string;    // optional custom cover
  scheduledTime?: string;       // ISO-8601; null = as soon as possible
}

type PlatformId = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
```

## 3. Platform adapter contract

Every platform implements one contract. The rest of the app depends on the contract, not
on any specific platform.

```ts
interface PlatformAdapter {
  readonly id: PlatformId;
  // Whether real publishing is possible right now (creds + approved app present):
  availability(): Promise<PublishAvailability>;
  // What the platform requires for a valid post (drives export presets & validation):
  requirements(): PlatformRequirements;
  connect(): Promise<Result<AccountConnection>>;    // OAuth flow (main process)
  disconnect(): Promise<Result<void>>;
  validate(req: PublishRequest): Promise<Result<void>>; // caption len, media specs…
  publish(req: PublishRequest): Promise<Result<PublishReceipt>>; // real API call
}

interface PublishAvailability {
  state: 'available' | 'unavailable';
  reason?: 'no_api_access' | 'app_not_approved' | 'not_connected' | 'token_expired';
}

interface PlatformRequirements {
  aspectRatios: string[];       // e.g. ['9:16'] — maps to render presets
  maxDurationSec: number;
  captionMaxLen: number;
  hashtagMax: number;
  thumbnail: 'required' | 'optional' | 'unsupported';
  supportsScheduling: boolean;
}
```

`requirements()` feeds back into the export presets (see `RENDERING.md`) so the media a
user creates already matches the destination platform's specs.

## 4. Account connection status

```ts
interface AccountConnection {
  platform: PlatformId;
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  displayName?: string;         // shown to user, e.g. handle
  connectedAt?: string;
}
```

Connection is surfaced per platform in the UI (Spanish). A platform can be
`disconnected` yet still fully usable via manual export.

## 5. Credential boundary (secrets never in the renderer)

| Rule | Detail |
| --- | --- |
| OAuth in main | The OAuth authorization flow runs in the main process, not the renderer. |
| Secrets out of renderer | Access tokens, **refresh tokens**, and client secrets never cross the IPC bridge to the renderer. |
| OS secure storage | Tokens are encrypted at rest via the OS secure storage (Keychain / Credential Vault / libsecret). |
| Renderer sees status only | The renderer receives connection **status** and non-sensitive display fields, never raw tokens. |
| Refresh in main | Token refresh happens in main; the renderer only observes `connected/expired`. |

```ts
// Stored ONLY in main, encrypted via OS secure storage — never sent to renderer:
interface StoredCredential {
  platform: PlatformId;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: string;
  scope: string[];
}
```

The design is **OAuth-ready**: the boundary exists now so that, once a platform grants
API access and an approved app, wiring real OAuth requires no renderer changes.

## 6. Export requirements per post

Before queueing, a request is validated against the adapter's `requirements()`:

| Requirement | Source |
| --- | --- |
| Caption / hashtags within limits | `captionMaxLen`, `hashtagMax` |
| Media aspect & duration valid | `aspectRatios`, `maxDurationSec` |
| Thumbnail present if required | `thumbnail` |
| Scheduled time supported | `supportsScheduling` |

Validation failures return stable codes in Spanish and never enter the queue.

## 7. Publishing queue

```ts
interface PublishJob {
  jobId: string;
  platform: PlatformId;
  exportRef: string;
  status: 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'manual';
  attempts: number;
  scheduledTime?: string;
  failureReason?: string;       // honest, human-readable
  receipt?: PublishReceipt;     // only when a real API confirmed
  createdAt: string;
  updatedAt: string;
}

interface PublishReceipt {
  platform: PlatformId;
  remoteId: string;             // platform-side post id — proof of real publish
  url?: string;
}
```

| Concern | Behavior |
| --- | --- |
| Retry | Bounded retries with backoff for transient API failures. |
| Status | Each job reports its true state; `published` requires a real `receipt`. |
| Failure reason | Stored verbatim and shown honestly; no silent success. |
| History | Completed/failed/manual jobs are retained for the user to review. |
| No dup posting | A given `exportRef`+platform is guarded against double submission. |

When an adapter is `unavailable`, a job created for it goes to status **`manual`**, not a
fake `published` — see below.

## 8. Manual-export fallback (honest path)

When direct publishing is unavailable (no API access / app not approved / not
connected), SowyVid does the useful, honest thing:

1. Produces a platform-correct MP4 (right aspect, duration, codec) via render presets.
2. Assembles the caption + hashtags as copy-ready text.
3. Prepares the optional thumbnail.
4. Reveals the file in the OS file manager and copies the caption to the clipboard so
   the user can upload it themselves in the platform's own app.

```ts
interface ManualExportPackage {
  platform: PlatformId;
  mediaRelPath: string;         // relative, portable
  captionText: string;          // caption + hashtags, ready to paste
  thumbnailRelPath?: string;
  notes: string;                // Spanish guidance for uploading manually
}
```

This guarantees the product is **valuable on day one**: it always yields platform-ready
media even when automated publishing is not yet possible.

## 9. IPC surface

```ts
interface PublishBridge {
  listAdapters(): Promise<Result<{ platform: PlatformId; availability: PublishAvailability }[]>>;
  getConnections(): Promise<Result<AccountConnection[]>>;
  connect(platform: PlatformId): Promise<Result<AccountConnection>>;   // OAuth in main
  disconnect(platform: PlatformId): Promise<Result<void>>;
  validate(req: PublishRequest): Promise<Result<void>>;
  enqueue(req: PublishRequest): Promise<Result<{ jobId: string }>>;
  prepareManual(req: PublishRequest): Promise<Result<ManualExportPackage>>;
  listJobs(projectId: string): Promise<Result<PublishJob[]>>;
  onJobEvent(cb: (e: { jobId: string; status: PublishJob['status']; failureReason?: string }) => void): () => void;
}
```

Credentials and OAuth stay in the main process behind OS secure storage; the renderer
sees only status and non-sensitive fields. All boundaries validate with Zod. No job is
ever reported `published` without a real platform `receipt`.
