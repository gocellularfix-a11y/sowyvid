# Phone Import Architecture

> Status: Not yet implemented — design only.

This document describes the planned architecture for transferring photos and video
clips from a phone to the **SowyVid** desktop app over the local network, with **no
account, no cloud, and no phone app** to install. It defines contracts and the security
model only; no code here exists yet.

Intended module locations:

- `src/electron/phone-import/` — temporary upload server, session/token lifecycle,
  approval gate.
- `src/electron/phone-import/transport/` — pluggable transport interface (LAN now,
  relay later).
- `src/features/phone-import/` — renderer UI: pairing code, QR, live progress, approval.

## 1. User story

A business owner has product photos on their phone. On the desktop, they open "Importar
desde el teléfono". SowyVid shows a short numeric code and a QR. The owner opens the
phone camera / browser, lands on a plain mobile web page served by the desktop over
Wi-Fi, and selects photos to upload. Files appear on the desktop in a pending tray; the
owner approves them, and only then do they enter the project's media pipeline.

## 2. Design principles

| Principle | Consequence |
| --- | --- |
| No app install | Phone uses its built-in browser; the desktop serves a web page. |
| No account/cloud | Transfer is device-to-device over the LAN; nothing leaves the network. |
| Ephemeral by default | The upload server exists only while a session is open. |
| Owner-in-control | Uploaded files are quarantined until explicit desktop approval. |
| Same pipeline | Approved files flow into the standard media import (see `MEDIA-PIPELINE.md`). |
| Future-proof transport | A relay service can be added behind the same interface without reworking the UX. |

## 3. Session lifecycle

```
idle → starting → listening(paired?) → transferring → review → closing → idle
```

1. **Start** — renderer calls `window.sowyvid.phone.startSession()`. Main picks a free
   port, binds a local HTTP server to the LAN interface (not `0.0.0.0` publicly routable
   beyond the subnet), and mints a session.
2. **Advertise** — returns the URL (`http://<lan-ip>:<port>/s/<token>`), a **short
   numeric pairing code**, and a **QR** encoding the URL.
3. **Pair** — phone opens the URL (via QR or by typing the code on a landing page).
   The session token in the path authorizes the upload page.
4. **Transfer** — phone uploads one or more files; desktop shows live progress.
5. **Review** — each file lands in quarantine (`temp/phone/<sessionId>/`), pending
   owner approval.
6. **Close** — session ends on owner action, inactivity timeout, or app close; the
   server stops listening and quarantine is swept.

```ts
interface PhoneSession {
  sessionId: string;
  url: string;            // LAN URL embedding the token
  pairingCode: string;    // short numeric, e.g. 6 digits
  qrPngDataUrl: string;   // rendered QR for the desktop UI
  expiresAt: string;      // ISO-8601 hard expiry
  status: 'listening' | 'transferring' | 'review' | 'closed';
}
```

## 4. Tokens, codes, and expiry

- **Session token**: a cryptographically random, high-entropy value in the URL path.
  Unguessable; scopes every request to one session.
- **Pairing code**: a short numeric code for humans, used only to reach the landing
  page; it is rate-limited and paired with the token — a correct code alone without the
  token grants nothing durable.
- **Expiry**: every session has a hard `expiresAt` and an idle timeout. On expiry the
  server refuses new requests (`410 Gone`) and the desktop tears down the listener.
- **Single active session** per desktop by default; starting a new one closes the old.

## 5. Mobile web upload page

- Minimal, dependency-light HTML/CSS/JS served by the desktop server; Spanish UI.
- Uses a standard `<input type="file" multiple accept="image/*,video/*">` and a
  drag-friendly layout; no framework required.
- Shows per-file progress and a clear "enviado, esperando aprobación en la computadora"
  state.
- Never receives project data back; it is upload-only. It cannot browse existing media.

## 6. Owner approval gate

Uploaded files are **quarantined** and do not touch the project until approved.

```ts
interface PendingUpload {
  uploadId: string;
  sessionId: string;
  originalName: string;   // sanitized for display
  mimeType: string;       // sniffed server-side
  bytes: number;
  receivedAt: string;
  previewThumbDataUrl?: string; // small preview generated in quarantine
}

interface PhoneBridge {
  startSession(): Promise<Result<PhoneSession>>;
  closeSession(sessionId: string): Promise<Result<void>>;
  listPending(sessionId: string): Promise<Result<PendingUpload[]>>;
  approve(sessionId: string, uploadIds: string[]): Promise<Result<void>>; // -> media pipeline
  reject(sessionId: string, uploadIds: string[]): Promise<Result<void>>;  // -> deleted
  onEvent(cb: (e: PhoneEvent) => void): () => void;
}

type PhoneEvent =
  | { type: 'paired'; sessionId: string }
  | { type: 'uploading'; sessionId: string; uploadId: string; done: number; total: number }
  | { type: 'received'; sessionId: string; upload: PendingUpload }
  | { type: 'expired'; sessionId: string };
```

On **approve**, each file is handed to the media import pipeline (`source: 'phone'`),
where it is hashed, deduped, probed, thumbnailed, and committed exactly like any other
import. On **reject** or session close, quarantined files are deleted.

## 7. Security model

| Threat | Mitigation |
| --- | --- |
| Unauthorized upload | High-entropy session token in URL; short-lived; single session. |
| Guessing the pairing code | Rate limiting + token requirement; code only opens a landing page. |
| Malicious file type | Server-side MIME sniff (magic bytes); allow only image/video; reject everything else, especially executables/scripts. |
| Oversized upload | Per-file and per-session size ceilings; streaming with limits. |
| Directory traversal | Filenames sanitized; storage uses generated names in a quarantine folder; original names kept for display only. |
| Executable delivery | Extension is derived from validated MIME; never honor client-supplied paths/extensions. |
| Persistent exposure | No permanent server — it runs only during an active session and is torn down on close/expiry/app-exit. |
| Public internet exposure | Bound to the LAN interface only; no port forwarding, no external tunnel by default. |
| Silent injection into project | Owner approval is mandatory before any file joins the project. |

All request bodies and metadata are validated with **Zod** at the server boundary
before use.

## 8. Troubleshooting states (surfaced in Spanish)

| State | Cause | Guidance shown |
| --- | --- | --- |
| No aparece la página | Phone not on same Wi-Fi | "Conecta el teléfono a la misma red Wi-Fi que la computadora." |
| Página caducada (410) | Session expired | Offer "Generar nuevo código". |
| No se pudo detectar IP local | No usable LAN interface | Explain Wi-Fi requirement; suggest checking network. |
| Firewall bloquea | OS firewall blocks the port | Explain allowing SowyVid on the local network. |
| Archivo rechazado | Unsupported type/too large | Name the reason (tipo/tamaño). |

The desktop should detect and display its LAN IP and whether a network interface is
available before advertising a session, to catch the most common failure (different
networks) early.

## 9. Transport interface (relay-ready)

The workflow (pair → upload → quarantine → approve → import) is transport-agnostic. LAN
is one transport; a future hosted relay could be another, added **without rewriting the
UX or the approval gate**.

```ts
interface PhoneTransport {
  readonly kind: 'lan' | 'relay';
  start(session: SessionConfig): Promise<TransportHandle>; // begin accepting uploads
  stop(handle: TransportHandle): Promise<void>;
  // Uploads are delivered to the host via a common callback regardless of transport:
  onUpload(handle: TransportHandle, cb: (file: IncomingFile) => Promise<void>): void;
  describeAccess(handle: TransportHandle): AccessInfo; // url + pairingCode + qr
}
```

- **LanTransport** (initial): binds a local HTTP server, serves the upload page, emits
  `IncomingFile`s to the host.
- **RelayTransport** (future): would proxy uploads through an opt-in hosted service for
  when the phone and desktop are not on the same network. It plugs into the same
  `PhoneTransport` contract; the quarantine + approval + media-pipeline stages are
  unchanged. Any relay would be explicitly opt-in and clearly disclosed, preserving the
  no-cloud default.
