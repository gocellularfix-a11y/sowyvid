# SowyVid — Templates vs. Creative Families

> **Updated for the Northstar integration.** The earlier "6 built-in templates"
> belonged to the removed temporary engine and no longer exist.

SowyVid keeps **four distinct concepts** — never collapsed into one object:

| Concept | Owner | Meaning | Status |
|---|---|---|---|
| **Creative family** | Northstar engine | Persuasive narrative structure (5 families × 3 variants = 15 concepts) | ✅ integrated |
| **Visual template** | SowyVid (`Project.templateId`) | Visual execution style | 🧩 field exists; catalog lands with FrameLogic |
| **Motion profile** | FrameLogic engine | Bounded movement behavior (7 profiles) | ⬜ deferred (Phase C) |
| **Renderer** | SowyVid + Remotion | Turns a plan into frames | ⬜ deferred |

## Creative families (Northstar)

`problem_solution`, `before_after`, `fast_retail`, `trust_craft`, `social_native`.
Owner-facing Spanish labels live app-side in `src/features/creative/families.ts`
(the engine stays locale/brand-neutral). The mockup's three style cards map to
families via `STYLE_FAMILY` in `HomeWorkspace.tsx`
(`direct→fast_retail`, `trust→trust_craft`, `before-after→before_after`).

Each family produces genuinely different structure/pacing/motion/CTA behavior; the
engine guarantees the final scene is a CTA and that scene durations sum exactly to
the target. See `docs/CREATIVE-ENGINE-INTEGRATION.md` and
`docs/ENGINE-VAULT-CATALOG.md`.

## Visual templates

`Project.templateId` selects a **visual** template (execution style), distinct from
the creative family. The visual template catalog + rules are introduced when the
**FrameLogic Visual Engine** is integrated (Phase C); until then the field is
persisted but not yet driving visuals.
