# SowyVid — Product Vision

SowyVid is a visual, intelligent commercial-creation app for **ordinary business
owners** — people with no video-editing, marketing, or technical experience. It
should feel extremely easy, visual, fast, sophisticated, friendly, premium, and
**impossible to get lost in**.

> This is a brand-new project. It reuses no code, architecture, components,
> documentation, or decisions from the previous **Colibrí** project — SowyVid is
> fully disconnected. (Colibrí is named here only to state that it must not be
> reused.)

## The promise

The owner makes simple **business** decisions. SowyVid makes the **production**
decisions. The owner should never need to understand timelines, codecs,
rendering settings, aspect ratios, frame rates, audio mixing, or file formats.

## How it communicates

Through previews, templates, thumbnails, visual choices, clear progress states,
plain language, direct manipulation, recommended decisions, before/after
comparisons, and guided actions — not dense forms, jargon, or configuration
screens. Where a pro tool shows ten sliders, SowyVid shows three good choices
(e.g. *Calm / Balanced / Energetic*).

## The core journey

```
Choose what to promote → Choose a visual starting point → Add photos or videos
→ SowyVid creates the commercial → Owner previews it
→ Owner makes simple visual changes → SowyVid renders and exports it
```

The mockup expresses this as a **single-screen, four-step guided flow** (see
`docs/MOCKUP-ANALYSIS.md`) so the whole journey is visible at once.

## First objective: one excellent vertical slice

The first engineering goal is intentionally narrow:

> Produce **one** excellent, publish-ready commercial through **one** coherent,
> reliable workflow.

Not dozens of shallow features. The first complete commercial must look
intentionally designed, not randomly assembled. SowyVid may later grow into a
full marketing/social platform, but only after this slice is genuinely excellent.

## Principles that shape the build

- **Deterministic first.** A rule engine — not AI — makes most production
  decisions, so results are reproducible and free. AI is optional and
  cost-controlled, never required for a click.
- **Local-first.** No account or cloud needed for creation; no telemetry by
  default; user media stays on the machine.
- **Honesty.** Every control either works or is clearly marked unavailable.
  Scaffolding is never described as finished. Publishing and AI are represented
  truthfully.
- **Owner-safe.** Errors explain what happened, what to do, and that the project
  is safe — never a raw stack trace.

## Non-goals (for now)

A professional timeline editor, deep configuration, multi-platform campaign
management, and real social publishing at scale — all deferred until the single
commercial workflow is excellent.
