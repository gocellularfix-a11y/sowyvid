# SowyVid — Mockup Analysis

> **Source of truth:** `C:\Users\GO CELLULAR\Downloads\ChatGPT Image Jul 15, 2026, 03_03_51 PM.png`
> (located and studied before any interface code was written).
> This document is authoritative for the interface. Where the implementation
> deviates, the deviation and its reason are recorded here.

## 0. Overall read

A **premium, dark, calm, Spanish-language** desktop app for creating a business
commercial. The defining idea: the **entire creation journey is visible on one
screen** as four numbered steps laid out left-to-right. There is no wizard that
hides steps, no timeline, no settings wall. This directly serves the product
goal of being *impossible to get lost in*.

- **Palette:** near-black background (`#0a0a0f`) with a faint cool tint, a single
  vivid **violet** accent (`~#7c5cff`), white primary text, muted gray secondary
  text.
- **Shape language:** generous rounded corners (cards ~16–20px, controls ~12px),
  soft shadows, thin low-contrast dividers.
- **Typography:** clean grotesque sans; semibold section titles ~19px, 14px body,
  12–13px captions.
- **Tone:** spacious, guided, reassuring. Plain business language, never jargon.

## 1. Global regions

### 1.1 Header (top bar)
- **Purpose:** brand presence + always-available help/settings/account.
- **Left:** brand mark + wordmark. *(Mockup shows a hummingbird + "Tu Comercial".)*
- **Right:** `Ayuda` (help, `?` icon), `Ajustes` (settings, gear icon), circular
  avatar `JO`.
- **Behavior:** static; help/settings open panels (not yet built → marked
  "disponible pronto").
- **Components:** `AppHeader`, `IconButton`/text action, avatar chip.

### 1.2 Left sidebar (primary navigation)
- **Purpose:** switch between the three top-level areas; reinforce brand value.
- **Items:** `Inicio` (active, violet-tinted pill with accent border),
  `Mis comerciales` (folder), `Material` (image).
- **Bottom promo card:** brand mark + *"Comerciales que venden por ti"* +
  supporting line + a small storefront thumbnail ("TU NEGOCIO").
- **State:** exactly one item active; active item uses accent surface + border.
- **Components:** `Sidebar`, nav button, promo card, `MediaThumb`.

### 1.3 Main workspace — the 4-step guided flow
One large rounded panel containing four equal columns separated by thin vertical
dividers, with a trust bar footer inside the same panel.

**Step 1 — `Cuéntanos qué quieres promocionar`**
- Purpose: capture, in plain words, what to promote.
- Hierarchy: numbered badge + title → subtitle → single multiline input
  (placeholder *"Ejemplo: Reparación de pantallas de iPhone el mismo día"*) →
  primary `Continuar →` button → decorative product image (hand + cracked phone).
- State/behavior: `Continuar` is the primary action; disabled until text entered.
- Primary-workflow role: **the single required input** to begin. Everything else
  has smart defaults.

**Step 2 — `Agrega tu material`**
- Purpose: bring in the owner's real photos/videos.
- Hierarchy: title → subtitle → large dashed **drop zone** (cloud icon,
  *"Arrastra aquí o selecciona"*) → three source buttons (`Este equipo`,
  `Mi teléfono`, `Material guardado`) → a tip card.
- State/behavior: drop zone + sources trigger import (media pipeline = Phase 6;
  currently marked unavailable, never presented as done).
- Reusable components: drop zone, `sourceBtn`, tip card.

**Step 3 — `Elige tu estilo`**
- Purpose: pick the creative direction; the app makes production decisions.
- Hierarchy: title → subtitle *("Creamos 3 versiones diferentes para ti.")* →
  three **style option cards** (video thumbnail + play + name + one-line
  description + radio), first selected → secondary `Ver las 3 versiones` button.
- Styles: `Directo y rápido`, `Confianza y calidad`, `Antes y después`.
- State/behavior: single-select radio group (fully working). Maps later to
  template + motion profile in the deterministic engine.

**Step 4 — `Tu comercial está listo`**
- Purpose: deliver the result.
- Hierarchy: title → subtitle → large **preview** (image + big play) → primary
  `Descargar video` → secondary `Crear otra versión`.
- State/behavior: has **empty / loading / ready** states. Preview + real download
  depend on the render pipeline (Phase 9); the shell simulates ready state and
  marks download unavailable until then.

### 1.4 Trust bar (footer, inside the workspace panel)
- Three reassurance items with icons:
  `Hecho con tu material` · `Listo para redes sociales` · `Sin experiencia necesaria`.
- Purpose: reduce anxiety for non-technical owners. Static.

## 2. Interaction & state inventory

| Element | Working now | State handling |
|---|---|---|
| Step 1 textarea + Continuar | ✅ | disabled when empty; enables generation |
| Step 2 drop zone / sources | ⛔ marked "disponible pronto" | honest unavailable (Phase 6) |
| Step 3 style radio group | ✅ | selected / hover / focus |
| Step 4 preview | ✅ shell sim | empty / loading / ready |
| Step 4 download | ⛔ marked unavailable | (Phase 9 render) |
| Sidebar nav | ✅ | active + section switch |
| Header help/settings | ⛔ toast "pronto" | honest |

## 3. Ambiguities resolved

1. **Brand name vs. mockup header.** The mockup header reads *"Tu Comercial"* next
   to a hummingbird. The specification mandates the product be **SowyVid**
   everywhere. **Resolution:** the header wordmark is **SowyVid**; *"tu comercial"*
   is preserved as a *concept* in step titles and copy ("Tu comercial está listo"),
   not as the brand.
2. **The hummingbird logo = Colibrí.** *Colibrí* is Spanish for *hummingbird*; the
   mockup's bird is the old project's identity. The spec forbids reusing Colibrí.
   **Resolution / deviation:** SowyVid ships a **new, distinct brand mark** — a
   stylized *swift in motion / play-triangle hybrid* in the same violet, occupying
   the same header/sidebar slots — so the visual composition matches the mockup
   without reusing the Colibrí identity. See `SowyvidMark` in `src/app/ui/Icon.tsx`.
3. **Photographic content.** The mockup uses photos (repair bench, technician,
   storefront). Remote/copyrighted images are disallowed. **Resolution:** local,
   deterministic `MediaThumb` placeholders with scene-evoking gradients stand in
   for photos in the shell; real imported media replaces them in Phase 6.
4. **"3 versiones".** Step 3 offers 3 styles and step 4 shows one result. We treat
   the 3 styles as 3 creative directions; generating produces the selected one,
   with `Ver las 3 versiones` / `Crear otra versión` to explore alternates.

## 4. Deviations from the mockup (and why)

| Deviation | Reason |
|---|---|
| New swift brand mark instead of the hummingbird | Spec forbids reusing the Colibrí (hummingbird) identity |
| Wordmark "SowyVid" instead of "Tu Comercial" | Mandatory product naming |
| Gradient `MediaThumb` placeholders instead of photos | No remote/copyrighted assets; local-first |
| System font stack (Segoe UI Variable / Inter fallback) | Offline/CSP — no remote font fetch; keeps premium feel on Windows |
| A small "preview mode" banner appears in browser-only mode | Honesty: signals no filesystem/render in that mode; never shown in the real app |

## 5. Fidelity checklist (implemented in the shell)

- [x] Header: brand + Ayuda + Ajustes + avatar
- [x] Sidebar: Inicio (active) / Mis comerciales / Material + promo card
- [x] 4-column single-screen guided flow with dividers
- [x] Step 1 input + Continuar
- [x] Step 2 drop zone + 3 sources + tip
- [x] Step 3 three style cards with thumbnails, play, radio, selection
- [x] Step 4 preview with empty/loading/ready + download/create-another
- [x] Trust bar with three items
- [x] Violet accent, dark surfaces, radii, spacing, typography scale
- [x] Focus states, keyboard-operable controls, tooltips on icon actions
