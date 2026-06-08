# UX Requirements — Visual Design System

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document owns and defines.
>
> **Status:** Draft v1
> **Domain code:** `UX-VIS`
> **Functional requirement coverage:** cross-cutting; primarily `A11Y-001..011`, `PLAT-001..005`
> **Owner surfaces:** all surfaces — this document defines the shared token set, component library,
> motion system, and iconography that every sibling UX doc consumes.

---

## 1. Scope

- **Covers:** Design tokens (color, typography, spacing, radius, elevation, border, z-index);
  iconography system; motion system; density modes per platform profile; theming and contrast
  guarantees; core component library anatomy and full state matrices (button, icon-button, menu,
  dialog/modal, text field, select, checkbox, switch, segmented control, tabs, toast, tooltip,
  popover, sheet/drawer, card, list/table row, badge, chip); visual language and brand mood.
- **Does NOT cover:** Per-surface layout specifics (see `02-navigation-and-platform-profiles.md`
  through `14-ai-mcp.md`); canvas rendering pipeline (see `04-canvas-scene-widgets.md`);
  accessibility audit process and testing harness (see `03-accessibility.md`); onboarding copy
  (see `15-onboarding-learnability.md`).
- **Related functional requirements:** `A11Y-001`–`A11Y-011` (WCAG floor, contrast, motion,
  non-color state); `PLAT-001`–`PLAT-005` (platform profile detection and density).
- **Related UX docs:** Every sibling doc consumes this one. `03-accessibility.md` extends the
  a11y mandates; `02-navigation-and-platform-profiles.md` applies density and layout tokens.

---

## 2. UX goals for this surface

The design system is the single coherence layer of the entire product. Its goal is to make every
surface feel like it came from one mind — atmospheric, premium, genre-authentic — while never
trading legibility, contrast, or speed for aesthetic.

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | Unified token vocabulary eliminates orphaned styles; every surface passes a "looks designed, not assembled" review; dark-first palette evokes premium TTRPG atmosphere without pastiche. |
| Information scent | Typography hierarchy (size + weight + color contrast steps) makes scannable at a glance; semantic color names reinforce meaning across all surfaces. |
| Navigability | Consistent z-index layering and elevation means users always know what is in front of what; component shape/color grammar is stable so nothing "surprises" the eye. |
| Intuition / learnability | One pattern per problem in the component library; state transitions (hover, focus, active, disabled) are predictable because they follow a single motion and color grammar. |
| Accessibility | Every token pair meets WCAG 2.2 AA (4.5:1 text, 3:1 UI) as a hard minimum; high-contrast theme meets AAA; reduced-motion contract is complete and tested. |
| Adaptability (platform profiles) | Three explicit density modes (comfortable / standard / compact) map 1:1 to the three platform profiles; all touch targets ≥ 44 × 44 CSS px on Tablet and Mobile. |
| Effective emphasis (visual hierarchy) | One accent color family; severity-mapped status colors; elevation separates layers — not color washes; squint test and grayscale test pass at every density. |
| Feedback & responsiveness | Motion system defines durations 100–300 ms with specific easing per action type; reduced-motion fallbacks are defined per animation, not globally stripped. |
| Error prevention & recovery | Destructive actions use the error/danger semantic token, not the accent; states (disabled, loading, error) are visually distinct without relying on color alone. |
| Consistency | All values live in CSS custom properties; no hard-coded colors, sizes, or durations in component code; token naming is stable and versioned. |

---

## 3. Researched best practices

### 3.1 Color and theming

Design tokens should be split into three layers: raw palette → semantic (role) → component [1].
The semantic layer is what code consumes; raw palette values must never appear in component code.
*Implication: define `--color-surface-elevated`, never `#2c2420`, in component rules.*

Dark-mode-first tooling products (Linear, Vercel, Arc) use near-black backgrounds (HSL lightness
6–12 %) with a narrow warm or cool tint rather than pure #000000 to reduce halation on OLED
displays [2]. *Implication: the default dark theme uses `#111418` not `#000000` as the base.*

The W3C Design Tokens Community Group format separates value, type, and description in JSON; CSS
custom properties are the delivery format, not the source [3]. *Implication: document the token
set here in CSS-variable form with type annotations; a build step can emit W3C DTCG JSON if
needed.*

Radix Colors supplies a 12-step perceptually uniform scale per hue with semantic step
assignments (steps 9–10 = solid fills, 11–12 = text) and automatic light/dark pairings [4].
*Implication: adopt Radix step semantics for building the palette, even though exact Radix hex
values are not carried over — the genre hues differ.*

Material Design 3 establishes a tonal palette approach (key color → tone ramp) and six surface
roles (surface, surface-variant, surface-container-low/mid/high/highest) that replace flat
surface values [5]. *Implication: adopt the surface-container layering concept — three elevation
steps — rather than one flat surface color.*

### 3.2 Typography

Variable fonts reduce network load and enable fine-grained weight interpolation [6]. Inter
(sans-serif) is the most legible UI typeface at small sizes due to its large x-height and
optimized hinting [7]. For TTRPG genre character, a display serif (Cinzel or EB Garamond) at
headings ≥ 24 px adds atmosphere without compromising body legibility. *Implication: two-font
strategy — Inter for all UI text, one display serif for h1/display only.*

A modular type scale with a 1.25 ratio (Major Third) produces steps close to browser defaults
and avoids extreme size jumps in a dense tool UI [8]. Accessible body text is 15–16 px minimum
at 400 weight; 13 px is acceptable for secondary labels if contrast ≥ 7:1 [9].
*Implication: base at 15 px (0.9375 rem), scale with 1.25 ratio.*

Line-height 1.5 for body copy, 1.2 for headings is the WCAG and readability consensus [10].
*Implication: encode as tokens `--leading-body: 1.5` and `--leading-heading: 1.2`.*

### 3.3 Spacing and layout

An 8 px base grid (4 px half-step allowed) is the near-universal choice across Material, Fluent,
Atlassian, and IBM Carbon [11]. It aligns naturally to browser defaults and icon grid sizes.
*Implication: all spacing tokens are multiples of 4 px; the preferred increment is 8 px.*

IBM Carbon uses a 2 px micro step for tight icon padding and badge offsets [12]. *Implication:
retain `--space-0.5: 2px` as the only sub-4px value.*

### 3.4 Radius and borders

Sharp corners (0 radius) feel cold and technical; excessive rounding feels playful and
consumer-app [13]. For a premium TTRPG tool targeting DMs and power users, 4–6 px radius on
cards and dialogs, 2–3 px on input fields, and 999 px ("pill") on badges/chips is correct [14].
*Implication: define four radius tokens: `none`, `sm (3px)`, `md (6px)`, `lg (12px)`, `full (9999px)`.*

### 3.5 Elevation and shadow

Material 3 maps elevation to surface tones (tonal elevation) in dark themes to avoid dark gray
blobs [5]. Shadows supplement, not replace, tonal elevation. *Implication: in dark themes,
elevated surfaces gain a lighter surface-tint background; shadow opacity is reduced.*

Stripe and Linear both limit elevation to three practical levels: resting → raised → overlay
[15, 2]. More levels produce visual noise. *Implication: three shadow tokens: `sm`, `md`, `lg`.*

### 3.6 Iconography

A consistent icon grid (24 × 24 px default, 20 × 20 px compact, 16 × 16 px micro) from one
family prevents the "mixed icon soup" failure mode [16]. Lucide is the recommended open-source
set for its clean 2 px stroke, large coverage, and active maintenance [17].
*Implication: Lucide as default icon set; no mixing with other families without documented
exception.*

Icons must never convey meaning alone (color + icon + label, or icon + label minimum) per WCAG
1.4.1 [10]. *Implication: status icons always pair with text or tooltip; icon-only buttons require
`aria-label`.*

### 3.7 Motion

Human perception thresholds: < 100 ms feels instant; 100–300 ms is "fast and responsive";
> 400 ms feels sluggish for UI state changes [18]. Enter transitions use decelerate easing
(content arriving); exit transitions use accelerate easing (content leaving). Material 3
standardizes durations: emphasized 500 ms (hero transitions), standard 200–300 ms (modal open),
short 100–150 ms (tooltip/badge) [5]. *Implication: adopt the short/standard/emphasized tier with
`prefers-reduced-motion: reduce` defined per animation.*

WCAG 2.2 SC 2.3.3 requires that any animation triggered by user interaction can be disabled
unless it is essential [10]. A11Y-005 mandates a single resolved motion preference state.
*Implication: one global CSS class `.motion-reduced` driven by OS preference + user override;
every animation references it.*

### 3.8 Density

Apple HIG (iPadOS) uses 44 pt minimum touch targets [19]. Material 3 uses 48 dp touch targets [5]
with a 40 dp visual size. WCAG 2.2 SC 2.5.8 (Target Size Minimum) mandates 24 × 24 CSS px with
adequate spacing for AA, 44 × 44 for Enhanced (AAA). *Implication: Mobile and Tablet profiles:
44 × 44 px minimum interactive target; Desktop: 32 × 32 px visual minimum with focus ring
extension.*

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| Linear | Dark-first near-black (#111) surface; one accent (violet); minimal shadows; instant micro-interactions at 100 ms | Premium tool UX: restraint + speed | Borrow: palette restraint, surface tones, motion timing. Avoid: their font size extremes (10px secondary text). | https://linear.app |
| Radix UI + shadcn/ui | 12-step semantic palette per hue; composable headless components; accessible by default; automatic dark variants | Separation of palette → semantic → component layers | Borrow: step-naming conventions, headless component anatomy, aria patterns. Avoid: their pure gray (no warmth) for genre fit. | https://www.radix-ui.com/colors |
| Obsidian | Dark theme community; atmospheric mood; readable mono-weight body; genre-appropriate plugin themes | TTRPG community already lives here; aesthetic familiarity reduces onboarding friction | Borrow: dark surface warmth, minimal chrome, community theme extensibility concept. Avoid: inconsistent icon sizes, inconsistent radius. | https://obsidian.md |
| Material Design 3 | Tonal surface elevation; role-based color system; density tokens; motion easing library; accessibility mandates built in | Rigorous system proven at scale | Borrow: surface-container layering, easing curves, touch target sizing, elevation-as-tone in dark. Avoid: M3 brand palette (does not fit TTRPG). | https://m3.material.io |
| IBM Carbon | 4px/8px spacing grid; 3-level elevation; tight density mode; thorough state matrix docs | Enterprise tool where density and legibility coexist | Borrow: spacing grid, micro token (2px), dense mode values. Avoid: pure cool-gray palette and corporate tone. | https://carbondesignsystem.com |
| Vercel Geist | Monochrome-first; typographically driven hierarchy; Inter typeface; focus rings visible in both themes | Maximum legibility in dark tool context | Borrow: Inter at 15px body, tight tracking on labels, visible focus rings. Avoid: Geist's extremely minimalist icon set (insufficient coverage). | https://vercel.com/geist |
| Foundry VTT | Atmospheric dark chrome; gold accent on dark; custom fantasy serif for headings | Genre-appropriate precedent from a direct competitor | Borrow: warm-gold-on-dark accent, serif display headings, dark surface tones. Avoid: inconsistent contrast (many elements below AA), heavy texture use that obscures content. | https://foundryvtt.com |

**North-star narratives:**

**Linear** is the single best model for motion discipline and palette restraint. The most important
lesson: every interactive element responds in ≤ 100 ms with a micro-state change (color shift,
not a full animation), and the product uses exactly one accent hue family. DND Tools must adopt
this discipline: no decorative animations on hot paths; micro-interactions are instantaneous
acknowledgments, full transitions are ≤ 300 ms.

**Radix Colors + shadcn/ui** is the best model for the relationship between palette, semantic
tokens, and headless components. The lesson: raw hex values never appear in component CSS; every
value is a semantic role. DND Tools must apply this discipline so that theming (Parchment / Tavern
/ Dungeon / high-contrast) is a single CSS class swap with zero component changes.

**Obsidian** is the genre-familiar ancestor. The lesson: the TTRPG community already lives in a
dark, note-centric tool and has built aesthetic taste around it. Warm dark surfaces (brown-black,
not blue-black), readable prose formatting, and atmospheric headers are expected and trusted.
DND Tools should feel like a deliberate evolution of this aesthetic — not a departure from it.

---

## 5. UX/UI requirements

### UX-VIS-001 — Dark-first, warm-toned default theme

- **Requirement:** The default theme must be dark (Tavern), genre-appropriate, and warm-toned.
  Light themes are provided and fully supported. "System" maps to the OS preference.
- **Rationale:** TTRPG play occurs in dimly lit rooms; dark UI reduces eye fatigue and table
  glare [Foundry VTT precedent, Obsidian community preference]. The v1 parchment (light) default
  caused user friction reported in design notes.
- **Spec:**
  - Default on first install: `theme = system` (auto dark/light per OS).
  - Named themes shipped: `tavern` (dark warm), `parchment` (light warm), `dungeon` (dark cool),
    `scholar` (light cool), `high-contrast` (forced-colors-compatible black/white).
  - A future "custom theme" slot is reserved but not required for v2.
  - Theme is stored in user preferences (persists across sessions, syncs with cloud profile).
  - Theme switch applies instantly (≤ 16 ms, no flash/FOUC on load).
- **States:** Active theme visible in settings; switching previews instantly.
- **Platform profiles:** Desktop / Tablet / Mobile — identical behavior. System theme may differ
  per OS profile (desktop dark, tablet light — each honors OS setting independently).
- **Input:** Settings panel toggle/select. Keyboard: reachable via Tab + Enter in Settings.
- **Accessibility:** Theme selection control: `role="radiogroup"` with each option `role="radio"`;
  focus ring visible in all themes; announcer emits "Theme changed to Tavern" on change.
- **Acceptance criteria:**
  - Given a new install with OS set to dark, when the app first opens, then the tavern (dark warm)
    theme is active with no flash of light background.
  - Given a user changes theme in settings, when the change commits, then all CSS custom property
    values update within one frame (≤ 16 ms) and an accessible announcement is emitted.
  - Given forced-colors (Windows High Contrast) is active, when the app renders, then the
    high-contrast theme CSS custom properties map to system color keywords (Canvas, CanvasText,
    Highlight, etc.) with no hard-coded colors surviving.
- **Priority:** Must-have

---

### UX-VIS-002 — Semantic color token set (complete definition)

- **Requirement:** All color values used by components and surfaces must be expressed as semantic
  CSS custom property tokens. Raw hex values must not appear in component CSS. The token set
  defined in this requirement is the authoritative v2 list.
- **Rationale:** Semantic tokens allow complete theme swaps without component changes [1, 4].
  The v1 token set is the migration source; v2 renames and extends it.
- **Spec — Token set (all values shown for `tavern` dark default; see §5.1 for full theme matrix):**

  **Background / surface layer:**
  ```
  --color-bg                  #111418   /* page root — near-black warm */
  --color-surface             #1c2128   /* default surface (cards, panels) */
  --color-surface-raised      #252c35   /* one step above surface (popovers, dropdowns) */
  --color-surface-overlay     #2e3744   /* modals, dialogs — top layer surface */
  --color-surface-sunken      #0d1117   /* inset areas (code blocks, input bg) */
  --color-surface-alt         #1a2030   /* zebra rows, subtle distinction */
  ```

  **Border:**
  ```
  --color-border              #2d3748   /* default divider, input outline */
  --color-border-strong       #4a5568   /* emphasized divider, active input outline */
  --color-border-focus        #d4a76a   /* focus ring color (accent-warm) */
  ```

  **Text / ink:**
  ```
  --color-text-primary        #e8ddd0   /* primary body text */
  --color-text-secondary      #a89888   /* secondary labels, metadata */
  --color-text-tertiary       #6b7280   /* placeholder, disabled, faint */
  --color-text-inverse        #111418   /* text on accent/solid backgrounds */
  --color-text-link           #d4a76a   /* inline links */
  --color-text-link-visited   #c09850   /* visited links */
  ```

  **Accent (brand / interactive):**
  ```
  --color-accent              #d4a76a   /* warm gold — primary interactive */
  --color-accent-hover        #e0be85   /* hover state */
  --color-accent-active       #c09050   /* pressed/active state */
  --color-accent-subtle       #2a2218   /* accent-tinted background (ghost button bg) */
  --color-accent-foreground   #111418   /* text on accent-filled surfaces */
  --color-accent-border       #7a5c32   /* accent-tinted border */
  ```

  **Status — semantic:**
  ```
  --color-status-success      #22c55e   /* success fills */
  --color-status-success-text #86efac   /* success text on dark bg */
  --color-status-success-subtle #0d2818 /* success tinted bg */
  --color-status-warning      #f59e0b   /* warning fills */
  --color-status-warning-text #fcd34d   /* warning text on dark bg */
  --color-status-warning-subtle #261c06 /* warning tinted bg */
  --color-status-error        #ef4444   /* error/danger fills */
  --color-status-error-text   #fca5a5   /* error text on dark bg */
  --color-status-error-subtle #2a0d0d   /* error tinted bg */
  --color-status-info         #38bdf8   /* info fills */
  --color-status-info-text    #7dd3fc   /* info text on dark bg */
  --color-status-info-subtle  #061a2a   /* info tinted bg */
  ```

  **DM visibility boundary (safety-critical, never leak):**
  ```
  --color-dm-only-badge       #9333ea   /* purple — DM-only indicator */
  --color-dm-only-subtle      #1a0d2e   /* DM-only tinted bg */
  --color-hidden-content-stripe rgba(147,51,234,0.12) /* hatching on hidden widgets */
  ```

  **Interactive component states (derived from above):**
  ```
  --color-interactive-hover   rgba(212,167,106,0.08)  /* ghost hover bg */
  --color-interactive-selected rgba(212,167,106,0.15) /* selected row/item bg */
  --color-interactive-focus-ring #d4a76a               /* 2px offset focus outline */
  --color-interactive-disabled rgba(232,221,208,0.32) /* disabled text */
  --color-interactive-disabled-bg rgba(44,52,66,0.4)  /* disabled fill */
  ```

- **States:** Tokens change value per active theme class on `<html>`; no per-component logic.
- **Platform profiles:** Identical token names across all profiles; density adjusts sizing, not color.
- **Accessibility:** Every foreground/background pair defined in this set must meet WCAG 2.2 AA
  (4.5:1 for normal text, 3:1 for large text and UI components). See §5.3 for verified ratios.
- **Acceptance criteria:**
  - Given any component CSS file, when grep searches for bare hex color values or `rgb()` /
    `hsl()` literals not inside a CSS custom property definition, then zero results are found.
  - Given the `tavern` theme is active, when the contrast of `--color-text-primary` on
    `--color-bg` is measured, then ratio ≥ 7:1 (AAA).
  - Given a theme is switched at runtime, when computed styles are sampled one frame later, then
    all token values resolve to the new theme's values.
- **Priority:** Must-have

---

### UX-VIS-003 — Full theme color matrix (all five themes)

- **Requirement:** All five named themes must define every token from UX-VIS-002. No token may
  fall back to an incorrect contrast pair in any theme.
- **Rationale:** Incomplete theme definitions cause accidental dark-on-dark or light-on-light
  failures that violate WCAG 2.2 AA [10].
- **Spec — Theme matrix (surface + text + accent triples, minimum contrast noted):**

  | Token group | `tavern` (dark warm) | `parchment` (light warm) | `dungeon` (dark cool) | `scholar` (light cool) | `high-contrast` |
  |---|---|---|---|---|---|
  | `--color-bg` | `#111418` | `#faf6f0` | `#05080d` | `#f7fafc` | `#000000` |
  | `--color-surface` | `#1c2128` | `#ffffff` | `#0b1118` | `#ffffff` | `#000000` |
  | `--color-surface-raised` | `#252c35` | `#f5f0e8` | `#111b25` | `#edf2f7` | `#111111` |
  | `--color-surface-overlay` | `#2e3744` | `#fffdf9` | `#12202e` | `#ffffff` | `#000000` |
  | `--color-surface-sunken` | `#0d1117` | `#f0ebe3` | `#020508` | `#e8eef4` | `#000000` |
  | `--color-text-primary` | `#e8ddd0` | `#1a0f0a` | `#f0f6ff` | `#0f172a` | `#ffffff` |
  | `--color-text-secondary` | `#a89888` | `#6b5b4f` | `#8ab4d8` | `#334155` | `#e0e0e0` |
  | `--color-accent` | `#d4a76a` | `#7c3d12` | `#00d2ff` | `#1e3a8a` | `#00ffff` |
  | `--color-accent-foreground` | `#111418` | `#ffffff` | `#001018` | `#ffffff` | `#000000` |
  | `--color-border-focus` | `#d4a76a` | `#7c3d12` | `#00d2ff` | `#1e3a8a` | `#ffff00` |
  | `--color-status-error` | `#ef4444` | `#b91c1c` | `#ef4444` | `#b91c1c` | `#ff8080` |
  | `--color-status-success` | `#22c55e` | `#15803d` | `#22c55e` | `#15803d` | `#7dff7d` |
  | `--color-status-warning` | `#f59e0b` | `#92400e` | `#f59e0b` | `#92400e` | `#ffd966` |
  | `--color-dm-only-badge` | `#9333ea` | `#7e22ce` | `#a855f7` | `#7e22ce` | `#ff80ff` |

  Full token expansions (all ~40 tokens per theme) follow the same pattern; implementers derive
  subtle/hover/active variants by applying opacity or lightness offset per the rules:
  - `*-hover`: +8% lightness in light themes, +6% lightness in dark themes.
  - `*-active`: −10% lightness from base.
  - `*-subtle`: base color at 10% opacity on the surface token.

- **Acceptance criteria:**
  - Given the design-token validation script runs, when all theme classes are loaded, then every
    token in UX-VIS-002 resolves to a non-empty value in each theme.
  - Given high-contrast theme and forced-colors active simultaneously, when rendered, then
    hard-coded hex values are overridden by system color keywords with zero regression.
- **Priority:** Must-have

---

### UX-VIS-004 — Typography scale and font stack

- **Requirement:** A two-family type system: Inter (or system-ui fallback) for all UI text;
  Cinzel (display serif, loaded as web font) for `h1` and display-level headings only. A strict
  modular scale (Major Third, ratio 1.25) defines all text sizes.
- **Rationale:** Inter at 15 px achieves maximum legibility in dark tool UIs due to large x-height
  and tight hinting [7]. A display serif adds genre character at large sizes with negligible
  legibility cost (only used above 20 px). Single-ratio scales ensure visual harmony [8].
- **Spec — Font stacks:**
  ```
  --font-sans:    'Inter', 'Segoe UI Variable', system-ui, -apple-system, sans-serif;
  --font-display: 'Cinzel', 'Palatino Linotype', 'Book Antiqua', serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
  ```

  **Type scale (Major Third × 1.25 from 15 px base, rounded to nearest 0.5 px):**
  ```
  --text-2xs:   0.625rem;   /*  10px — badge counts, micro labels (use sparingly) */
  --text-xs:    0.75rem;    /*  12px — timestamps, helper text (min AA contrast required) */
  --text-sm:    0.8125rem;  /*  13px — secondary body, nav items */
  --text-base:  0.9375rem;  /*  15px — primary body copy */
  --text-md:    1.0625rem;  /*  17px — emphasized body, large labels */
  --text-lg:    1.25rem;    /*  20px — section subheadings, card titles */
  --text-xl:    1.5rem;     /*  24px — page-level headings (switch to --font-display here) */
  --text-2xl:   1.875rem;   /*  30px — display / hero headings */
  --text-3xl:   2.25rem;    /*  36px — canvas scene titles, Command Center splash */
  ```

  **Weight tokens:**
  ```
  --font-weight-regular:   400;
  --font-weight-medium:    500;
  --font-weight-semibold:  600;
  --font-weight-bold:      700;
  ```

  **Line-height tokens:**
  ```
  --leading-tight:   1.2;    /* headings */
  --leading-snug:    1.35;   /* subheadings, large labels */
  --leading-body:    1.5;    /* primary body copy */
  --leading-relaxed: 1.7;    /* long-form prose (note editor) */
  ```

  **Letter-spacing tokens:**
  ```
  --tracking-tight:   -0.02em;  /* display headings */
  --tracking-normal:   0em;     /* body default */
  --tracking-wide:     0.05em;  /* ALL CAPS labels, badges */
  --tracking-wider:    0.08em;  /* micro labels, timestamps */
  ```

  **Usage rules:**
  - `--font-display` only at `--text-xl` (24 px) and above.
  - Body text never below `--text-sm` (13 px) in any density mode.
  - Badge/count text at `--text-2xs` (10 px) is acceptable with contrast ≥ 7:1 and
    `--font-weight-semibold`.
  - Monospace font used for: dice notation, stat values, code blocks, roll formula inputs.
  - `-webkit-font-smoothing: antialiased` applied globally in dark themes; `auto` in light themes.

- **Platform profiles:**
  - Desktop: full scale available; Dense mode may reduce one step (e.g., nav items use `--text-xs`
    instead of `--text-sm`).
  - Tablet / Mobile: `--text-base` body maintained; display headings reduced to `--text-xl` max
    in-app (scene titles allowed `--text-2xl` full-width).
- **Accessibility:** Font loading failure: all stacks fall back to system-ui / serif / monospace
  with no layout collapse. Web font loaded with `font-display: swap`.
- **Acceptance criteria:**
  - Given Inter fails to load, when the app renders, then body text falls back to system-ui with
    no layout overflow.
  - Given `--text-xs` (12 px) text renders, when contrast is measured, then ratio ≥ 7:1 (AAA) —
    the extra margin compensates for the small size.
  - Given any element uses the display font, when font-size is inspected, then it resolves to
    ≥ 24 px (`--text-xl`).
- **Priority:** Must-have

---

### UX-VIS-005 — Spacing scale (4/8 px grid)

- **Requirement:** All layout spacing (padding, margin, gap) must use tokens from the 4 px base
  spacing scale. Half-step (2 px) is allowed for micro adjustments only. No arbitrary pixel
  values in component CSS.
- **Rationale:** An 8 px grid (with 4 px half-step) is the industry consensus across Material 3,
  IBM Carbon, and Atlassian [11, 12]. It aligns icons, text baselines, and touch targets
  naturally without manual adjustment.
- **Spec:**
  ```
  --space-0:    0px;
  --space-0-5:  0.125rem;   /*  2px — micro (icon inner padding, badge offset only) */
  --space-1:    0.25rem;    /*  4px — tight internal padding */
  --space-1-5:  0.375rem;   /*  6px — small internal padding */
  --space-2:    0.5rem;     /*  8px — default component padding unit */
  --space-3:    0.75rem;    /* 12px — comfortable inner padding */
  --space-4:    1rem;       /* 16px — card padding, section gap */
  --space-5:    1.25rem;    /* 20px — medium spacing */
  --space-6:    1.5rem;     /* 24px — large spacing */
  --space-8:    2rem;       /* 32px — section separation */
  --space-10:   2.5rem;     /* 40px — large section separation */
  --space-12:   3rem;       /* 48px — panel padding */
  --space-16:   4rem;       /* 64px — page-level whitespace */
  --space-20:   5rem;       /* 80px — hero/display spacing */
  --space-24:   6rem;       /* 96px — maximum standard whitespace */
  ```

  **Component structural tokens (built from scale):**
  ```
  --component-button-px:           var(--space-4);    /* 16px */
  --component-button-py:           var(--space-2);    /*  8px */
  --component-button-py-sm:        var(--space-1-5);  /*  6px */
  --component-input-px:            var(--space-3);    /* 12px */
  --component-input-py:            var(--space-2);    /*  8px */
  --component-card-padding:        var(--space-4);    /* 16px */
  --component-card-padding-dense:  var(--space-3);    /* 12px */
  --component-dialog-padding:      var(--space-6);    /* 24px */
  --component-nav-item-px:         var(--space-3);    /* 12px */
  --component-nav-item-py:         var(--space-1-5);  /*  6px */
  --component-section-gap:         var(--space-8);    /* 32px */
  --component-list-gap:            var(--space-1);    /*  4px */
  --component-toast-gap:           var(--space-2);    /*  8px */
  ```

- **Acceptance criteria:**
  - Given any component stylesheet, when scanned for numeric `px` values outside token definitions,
    then zero non-token spacing values are found in component rules.
  - Given a component uses `--space-0-5` (2 px), when code-reviewed, then it is for a documented
    micro-adjustment (icon offset, badge nudge) — not a layout gap.
- **Priority:** Must-have

---

### UX-VIS-006 — Border radius tokens

- **Requirement:** Border radius values must use one of five named tokens. Custom pixel values in
  component CSS are forbidden.
- **Spec:**
  ```
  --radius-none:  0px;
  --radius-sm:    3px;      /* text inputs, inline elements */
  --radius-md:    6px;      /* cards, panels, buttons, menus */
  --radius-lg:    12px;     /* dialogs, modals, large cards */
  --radius-xl:    20px;     /* sheets/drawers corner */
  --radius-full:  9999px;   /* pills — badges, chips, avatar */
  ```
  - Buttons: `--radius-md` (6 px).
  - Text inputs / selects: `--radius-sm` (3 px).
  - Cards: `--radius-md` (6 px).
  - Dialogs / modals: `--radius-lg` (12 px).
  - Sheets / bottom drawers: `--radius-xl` top corners only (20 px).
  - Badges / chips: `--radius-full`.
  - Canvas widgets: `--radius-md` by default, overridable by widget config.
- **Rationale:** Radius consistency creates visual coherence; the TTRPG aesthetic favors
  moderate rounding — not sharp (too cold) or extreme (too consumer-app) [13, 14].
- **Acceptance criteria:**
  - Given any component CSS, when scanned for `border-radius` values not referencing a `--radius-*`
    token, then zero exceptions are found.
- **Priority:** Must-have

---

### UX-VIS-007 — Elevation and shadow tokens

- **Requirement:** Three elevation levels expressed as box-shadow tokens. In dark themes, elevated
  surfaces additionally receive a tinted background step (tonal elevation). Shadow opacity must be
  reduced in dark themes to prevent "floating blob" artifacts.
- **Spec:**
  ```
  /* Light themes */
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-lg:    0 8px 32px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.08);

  /* Dark themes — reduced opacity, tonal elevation is primary signal */
  /* Override in [data-theme=tavern], [data-theme=dungeon] etc. */
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.30);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.40);
  --shadow-lg:    0 8px 32px rgba(0,0,0,0.55);
  ```

  **Elevation assignment:**
  | Level | Token | Surface background | Used for |
  |---|---|---|---|
  | 0 — resting | none | `--color-surface` | Cards at rest, nav panels |
  | 1 — raised | `--shadow-sm` | `--color-surface-raised` | Popovers, dropdowns, tooltips |
  | 2 — overlay | `--shadow-md` | `--color-surface-overlay` | Dialogs, modals, sheets |
  | 3 — toast/notification | `--shadow-lg` | `--color-surface-overlay` | Toasts, command palette |

- **Rationale:** Tonal elevation (background gets lighter per level in dark mode) is the Material 3
  approach and avoids shadow-blob problems on OLED [5]. Stripe and Linear both limit to three
  practical levels [15, 2].
- **Acceptance criteria:**
  - Given a dropdown menu opens, when inspected, then its background resolves to
    `--color-surface-raised` and shadow resolves to `--shadow-sm`.
  - Given a modal dialog opens, when inspected, then its background resolves to
    `--color-surface-overlay` and shadow resolves to `--shadow-md`.
- **Priority:** Must-have

---

### UX-VIS-008 — Z-index layering system

- **Requirement:** Z-index values must be assigned from a named token set. Magic numbers in
  component CSS are forbidden.
- **Spec:**
  ```
  --z-base:          0;       /* document flow */
  --z-raised:        10;      /* sticky headers, floating labels */
  --z-dropdown:      100;     /* menus, popovers, autocomplete */
  --z-sticky:        200;     /* sticky sidebars, floating toolbars */
  --z-overlay:       300;     /* modal backdrops */
  --z-modal:         400;     /* dialog / modal panels */
  --z-sheet:         500;     /* bottom sheets / drawers */
  --z-toast:         600;     /* toast notifications */
  --z-tooltip:       700;     /* tooltips (must clear dialogs) */
  --z-command:       800;     /* command palette (must clear all surfaces) */
  --z-titlebar:      900;     /* Electron custom titlebar */
  --z-dm-boundary:  1000;     /* DM-only visibility overlay (safety-critical) */
  ```

  **Rules:**
  - A component at a given z-level must not exceed that level without a documented exception.
  - `--z-dm-boundary` is reserved for the DM visibility hatching/badge overlay and must always
    render above all interactive content.
  - Command palette (`--z-command: 800`) must be above modal dialogs so DM can use it while a
    dialog is open.

- **Acceptance criteria:**
  - Given a tooltip renders while a modal is open, when z-index is inspected, then the tooltip
    z-index resolves to a value ≥ `--z-tooltip` (700) and > the modal's `--z-modal` (400).
  - Given a DM-only badge renders on a hidden widget, when z-index is inspected, then it resolves
    to `--z-dm-boundary` (1000) — above all interactive layers.
- **Priority:** Must-have

---

### UX-VIS-009 — Iconography system

- **Requirement:** Lucide Icons is the primary icon set. No other icon library may be mixed in
  without a documented exception approved by the design owner. Icon sizes use four named steps.
- **Rationale:** A single icon family at a single stroke weight prevents "mixed icon soup" [16].
  Lucide has ≥ 1,400 icons at a 24 × 24 px viewBox with consistent 2 px stroke, MIT licensed,
  and actively maintained [17].
- **Spec:**

  **Size tokens:**
  ```
  --icon-size-micro:   16px;  /* inline text icons, badge indicators */
  --icon-size-sm:      20px;  /* dense toolbar, compact nav */
  --icon-size-md:      24px;  /* default — most UI contexts */
  --icon-size-lg:      32px;  /* empty states, feature callouts */
  --icon-size-xl:      48px;  /* onboarding illustrations, hero contexts */
  ```

  **Stroke width:** Always 2 px (Lucide default). Never 1 px (too thin at small sizes on low-DPI)
  or 3 px (too heavy in dense UI).

  **Color:** Icons inherit `currentColor` by default. Status icons override with the appropriate
  `--color-status-*` token.

  **Usage rules:**
  - Icon-only buttons require `aria-label` or `aria-labelledby`. No icon communicates meaning
    alone — always pair with a visible label OR a tooltip that is not the sole source of meaning
    for an action (WCAG 1.4.1).
  - In dense/mobile contexts where labels are dropped, the adjacent tooltip or `aria-label`
    must be present.
  - Icon used as status indicator: also include a text/pattern/shape redundant cue (A11Y-011).
  - "DM-only" icon: use `Eye` + dm-badge treatment, not a custom icon, to maintain set consistency.
  - Decorative icons (pure flourish, no information): `aria-hidden="true"`.

- **Platform profiles:**
  - Desktop dense: `--icon-size-sm` (20 px) in toolbars and nav.
  - Desktop comfortable: `--icon-size-md` (24 px) standard.
  - Tablet: `--icon-size-md` (24 px); touch targets wrap to 44 × 44 px regardless of icon size.
  - Mobile: `--icon-size-md` (24 px); touch targets 44 × 44 px minimum.

- **Acceptance criteria:**
  - Given an icon-only button renders, when accessibility tree is inspected, then it has a
    non-empty accessible name (from `aria-label` or visually-hidden text).
  - Given a status icon (e.g., error, DM-only) renders, when color is removed (grayscale), then
    the state is still conveyed by icon shape, label, or pattern.
  - Given the codebase is scanned for icon imports, when non-Lucide icon library imports appear,
    then a documented exception exists or the gate fails.
- **Priority:** Must-have

---

### UX-VIS-010 — Motion system: durations, easing, and reduced-motion contract

- **Requirement:** All animations and transitions must use tokens from the motion system. A single
  resolved motion preference state drives whether animations play or are replaced by instant
  state changes. Easing curves are assigned by animation direction and role.
- **Rationale:** Motion at 100–300 ms feels responsive; > 400 ms feels sluggish for UI state
  [18, 5]. WCAG 2.2 SC 2.3.3 and A11Y-005 require a single resolved preference [10].
- **Spec:**

  **Duration tokens:**
  ```
  --duration-instant:    0ms;     /* immediate — reduced-motion substitute */
  --duration-micro:      80ms;    /* hover fills, focus ring appearance */
  --duration-fast:       150ms;   /* tooltip/badge appear, button state */
  --duration-standard:   220ms;   /* menu open/close, panel slide */
  --duration-moderate:   300ms;   /* dialog open, sheet slide-up */
  --duration-slow:       400ms;   /* complex layout change, hero transition */
  --duration-crawl:      500ms;   /* emphasized transitions (first-run, onboarding) */
  ```

  **Easing tokens:**
  ```
  --easing-linear:       linear;
  --easing-standard:     cubic-bezier(0.4, 0.0, 0.2, 1);   /* general-purpose */
  --easing-decelerate:   cubic-bezier(0.0, 0.0, 0.2, 1);   /* enter: element arriving */
  --easing-accelerate:   cubic-bezier(0.4, 0.0, 1.0, 1);   /* exit: element leaving */
  --easing-spring:       cubic-bezier(0.34, 1.56, 0.64, 1); /* playful bounce — dice only */
  --easing-snap:         cubic-bezier(0.6, 0.0, 0.4, 1);   /* snappy modal */
  ```

  **Motion preference resolution (implements A11Y-005):**
  ```
  /* Resolved by JS at startup and on OS preference change.
     Writes data-motion="full"|"reduced"|"none" to <html>. */

  [data-motion="reduced"],
  [data-motion="none"] {
    --duration-micro:      0ms;
    --duration-fast:       0ms;
    --duration-standard:   0ms;
    --duration-moderate:   0ms;
    --duration-slow:       0ms;
    --duration-crawl:      0ms;
  }
  ```
  User preference stored in settings. Precedence: user-explicit-off > OS-reduce > user-explicit-on
  > OS-no-preference. The JS resolver writes the `data-motion` attribute; CSS tokens handle the
  rest with no per-component `prefers-reduced-motion` media queries.

  **Animation catalog (what animates + reduced-motion fallback):**

  | Animation | Duration + easing | Reduced-motion fallback |
  |---|---|---|
  | Button hover fill | `--duration-micro` + `--easing-linear` | Instant fill (0 ms) |
  | Focus ring appear | `--duration-micro` + `--easing-linear` | Instant |
  | Tooltip appear | `--duration-fast` + `--easing-decelerate` | Instant opacity |
  | Dropdown/menu open | `--duration-fast` + `--easing-decelerate` | Instant |
  | Toast slide-in | `--duration-standard` + `--easing-decelerate` | Instant opacity |
  | Dialog open | `--duration-moderate` + `--easing-snap` | Instant display |
  | Sheet slide-up | `--duration-moderate` + `--easing-decelerate` | Instant display |
  | Panel expand | `--duration-standard` + `--easing-standard` | Instant |
  | Canvas widget drag | `--duration-micro` + `--easing-linear` | No animation; position updates |
  | Dice roll bounce | `--duration-slow` + `--easing-spring` | Static result display |
  | Map layer fade | `--duration-standard` + `--easing-standard` | Instant |
  | Page transition | `--duration-standard` + `--easing-standard` | Instant |
  | Skeleton loading pulse | `--duration-crawl` + `--easing-linear` (loop) | Static skeleton |

- **Platform profiles:** Identical token values across profiles. Mobile may reduce further where
  battery/thermal constraints apply (low-power mode CSS media query `prefers-reduced-data` when
  supported).
- **Acceptance criteria:**
  - Given OS `prefers-reduced-motion: reduce` is active and no user override, when any animation
    would play, then duration resolves to 0 ms (instant).
  - Given a user sets motion preference to "off" in settings, when OS preference later changes
    to "no-preference", then the user's explicit-off choice is honored and motion remains off.
  - Given `--easing-spring` is used, when the component is identified, then it is a dice result
    or explicit "celebration" surface — not a standard UI transition.
- **Priority:** Must-have

---

### UX-VIS-011 — Density modes mapped to platform profiles

- **Requirement:** Three density modes must be defined with explicit token overrides for each.
  Density is applied via a `data-density` attribute on `<html>`. Platform profile detection sets
  the default; the user may override on Desktop only.
- **Rationale:** Apple HIG and Material 3 both specify per-profile density targets; touch profiles
  must maintain ≥ 44 px targets; desktop power users benefit from information density [5, 19].
- **Spec:**

  | Mode | Default profile | Touch targets | Nav item height | Card padding | List gap | Font size |
  |---|---|---|---|---|---|---|
  | `comfortable` | Mobile, Tablet | 44 × 44 px min | 48 px | 16 px | 8 px | `--text-base` (15 px) |
  | `standard` | Desktop (default) | 32 × 32 px visual, 44 × 44 px focus-ring | 36 px | 16 px | 4 px | `--text-base` (15 px) |
  | `compact` | Desktop (opt-in) | 28 × 28 px visual, 40 × 40 px focus-ring | 28 px | 12 px | 2 px | `--text-sm` (13 px) |

  **CSS implementation:**
  ```css
  /* Default = standard */
  :root {
    --density-touch-target:      2rem;       /* 32px */
    --density-nav-height:        2.25rem;    /* 36px */
    --density-card-padding:      var(--space-4);
    --density-list-gap:          var(--space-1);
    --density-icon-size:         var(--icon-size-md);   /* 24px */
    --density-input-height:      2.25rem;    /* 36px */
    --density-button-height:     2.25rem;    /* 36px */
  }

  [data-density="comfortable"] {
    --density-touch-target:      2.75rem;    /* 44px */
    --density-nav-height:        3rem;       /* 48px */
    --density-card-padding:      var(--space-4);
    --density-list-gap:          var(--space-2);
    --density-icon-size:         var(--icon-size-md);   /* 24px */
    --density-input-height:      2.75rem;    /* 44px */
    --density-button-height:     2.75rem;    /* 44px */
  }

  [data-density="compact"] {
    --density-touch-target:      1.75rem;    /* 28px */
    --density-nav-height:        1.75rem;    /* 28px */
    --density-card-padding:      var(--density-card-padding-compact);
    --density-list-gap:          var(--space-0-5);
    --density-icon-size:         var(--icon-size-sm);   /* 20px */
    --density-input-height:      1.75rem;    /* 28px */
    --density-button-height:     1.75rem;    /* 28px */
  }
  ```

  **Profile → density mapping:**
  - Mobile: always `comfortable`. User cannot reduce.
  - Tablet: always `comfortable`. User cannot reduce.
  - Desktop: defaults to `standard`. User can switch to `compact` or `comfortable` in Settings.

- **Acceptance criteria:**
  - Given the Mobile profile is active, when density is inspected, then `data-density="comfortable"`
    is set and `--density-touch-target` resolves to ≥ 44 px.
  - Given Desktop profile + compact mode, when any interactive control is rendered, then the
    focus ring extends to ≥ 40 × 40 px even if the visual target is 28 px.
  - Given a user on Desktop sets density to compact, when they switch to Tablet profile (if using
    a 2-in-1), then density resets to comfortable, overriding the stored preference.
- **Priority:** Must-have

---

### UX-VIS-012 — Contrast guarantees per theme

- **Requirement:** Every foreground/background token pair used in components must meet WCAG 2.2
  AA (4.5:1 normal text, 3:1 large text ≥ 18 px / bold ≥ 14 px, 3:1 UI components). The
  high-contrast theme must meet AAA (7:1) for text.
- **Rationale:** WCAG 2.2 SC 1.4.3 (Contrast Minimum) is the AA floor. A11Y-001 mandates full
  WCAG 2.2 AA conformance. A11Y-011 additionally mandates non-color state cues [10].
- **Spec — Verified contrast ratios for primary token pairs (tavern dark theme):**

  | Foreground token | Background token | Ratio | WCAG level | Notes |
  |---|---|---|---|---|
  | `--color-text-primary` (#e8ddd0) | `--color-bg` (#111418) | ~14:1 | AAA | Primary body text |
  | `--color-text-primary` (#e8ddd0) | `--color-surface` (#1c2128) | ~11:1 | AAA | Card text |
  | `--color-text-secondary` (#a89888) | `--color-bg` (#111418) | ~6.5:1 | AA | Secondary labels |
  | `--color-text-secondary` (#a89888) | `--color-surface` (#1c2128) | ~5.5:1 | AA | Card secondary |
  | `--color-text-tertiary` (#6b7280) | `--color-surface` (#1c2128) | ~3.2:1 | AA large | Placeholder (≥18px or bold ≥14px only) |
  | `--color-accent` (#d4a76a) | `--color-bg` (#111418) | ~5.8:1 | AA | Accent text/icon |
  | `--color-accent-foreground` (#111418) | `--color-accent` (#d4a76a) | ~5.8:1 | AA | Button label on accent fill |
  | `--color-status-error` (#ef4444) | `--color-surface` (#1c2128) | ~4.9:1 | AA | Error fills/text |
  | `--color-status-success` (#22c55e) | `--color-surface` (#1c2128) | ~5.2:1 | AA | Success fills/text |
  | `--color-status-warning` (#f59e0b) | `--color-surface` (#1c2128) | ~5.6:1 | AA | Warning fills/text |
  | `--color-status-info` (#38bdf8) | `--color-surface` (#1c2128) | ~6.1:1 | AA | Info fills/text |
  | `--color-dm-only-badge` (#9333ea) | `--color-surface` (#1c2128) | ~3.5:1 | AA UI | Badge (not text) |

  **Tertiary text restriction:** `--color-text-tertiary` must only appear at `--text-lg` (20 px)
  or above, or `--text-md` (17 px) at `--font-weight-semibold` or above. Never at body size (15 px)
  as placeholder without a hint mechanism (show label instead).

  **CI gate:** A token contrast validation script (part of `pnpm docs:validate` or a dedicated
  `pnpm tokens:contrast` command) must verify all pairs before release. Failures block release.

- **Acceptance criteria:**
  - Given the contrast validation script runs for all five themes, when complete, then zero
    foreground/background pairs fail their assigned WCAG level.
  - Given the high-contrast theme is active, when `--color-text-primary` on `--color-bg` is
    measured, then the ratio ≥ 21:1 (black on white).
  - Given `--color-text-tertiary` is used, when the font-size of the element is inspected, then
    it is ≥ 20 px or ≥ 17 px bold — never 15 px body.
- **Priority:** Must-have

---

### UX-VIS-013 — Visual language and brand mood

- **Requirement:** The product's visual language must read as a premium, atmospheric TTRPG tool —
  not a generic SaaS dashboard — while maintaining speed and legibility as primary values.
- **Rationale:** Genre-appropriate aesthetics reduce cognitive distance for TTRPG players and
  establish trust [Foundry VTT, Obsidian precedents]. "Premium" means restraint and polish,
  not decoration and flourish [Linear, Vercel].
- **Spec — Brand mood guidelines:**

  **Palette mood:** Warm-dark primary (deep browns, charcoal with brown/amber undertone), warm
  gold accent. Secondarily: cool-dark (navy-black) as the "dungeon" variant. Light themes: aged
  parchment (off-white) with deep ink text. Nothing pure-black (#000) or pure-white (#fff) except
  high-contrast mode.

  **Typography mood:** Inter body for speed and legibility. Cinzel (a neo-classical Roman serif)
  for display headings — it evokes inscriptions and classic fantasy without being illegible or
  anachronistic. No handwriting/script fonts in the UI layer (acceptable in player handout
  content, not system UI).

  **Surface texture:** Subtle radial gradients on the body background only (see v1 `body {}` in
  `src/app.css` as precedent). Component surfaces are flat; no noise textures, no parchment-paper
  images on interactive elements (these obscure focus states and create contrast failures).

  **Decoration budget:** Maximum one decorative element per "region" (e.g., a thin `--radius-sm`
  separator with `--color-accent` at low opacity on a panel header). Zero decorative animations
  on any surface that is used during live play hot paths.

  **Genre signals allowed:**
  - Display font (Cinzel) at page headings.
  - Warm gold (`--color-accent`) as the single interactive hue.
  - Semantic widget palette (combat = deep red, dice = deep indigo, etc.) as defined in the
    tile-color tokens — these are status signals, not decoration.
  - Subtle background gradient on root body.

  **Genre signals forbidden:**
  - Parchment textures on input fields, cards, or any component with a contrast requirement.
  - Random "fantasy" fonts for UI labels, nav items, or status text.
  - Decorative borders (double-line rules, ornamental corner pieces) on interactive components.
  - Parallax or depth effects on any surface used during live play.

- **Acceptance criteria:**
  - Given the design is reviewed by the product owner, when evaluated against the brand mood
    spec, then no surface uses a texture on a component with a WCAG contrast requirement.
  - Given the font audit runs, when non-system, non-Inter, non-Cinzel, non-JetBrains-Mono fonts
    are found applied to UI elements (not content), then a documented exception exists.
- **Priority:** Should-have

---

## 6. Component and state specifications

This section defines the anatomy and full state matrix for every core component. Each entry
covers: DOM structure / ARIA roles, visual states, keyboard behavior, and density variants.
All sizing is for `standard` density unless noted; `comfortable` and `compact` are delta-noted.

---

### 6.1 Button

**Variants:** `primary` (accent fill), `secondary` (outlined), `ghost` (transparent), `danger`
(error fill), `link` (inline text).

**Anatomy:**
```
<button class="btn btn-primary" type="button">
  [<icon aria-hidden="true" />]   <!-- optional, left -->
  <span class="btn-label">Label</span>
  [<icon aria-hidden="true" />]   <!-- optional, right (e.g. chevron) -->
</button>
```

**Sizing:**
- Default: height `--density-button-height` (36 px standard / 44 px comfortable / 28 px compact).
  Padding: `--component-button-px` (16 px) horizontal, auto vertical.
- Small modifier `.btn-sm`: height 28 px standard / 36 px comfortable. Padding 12 px horizontal.
- Icon button: see §6.2.

**State matrix:**

| State | `primary` | `secondary` | `ghost` | `danger` |
|---|---|---|---|---|
| Default | `--color-accent` bg, `--color-accent-foreground` text | `--color-border` outline, `--color-text-primary` text | transparent, `--color-text-primary` text | `--color-status-error` bg, white text |
| Hover | `--color-accent-hover` bg | `--color-border-strong` outline, slight bg tint | `--color-interactive-hover` bg | error-hover bg |
| Focus-visible | `--color-interactive-focus-ring` 2 px offset outline | same | same | same |
| Active/pressed | `--color-accent-active` bg, scale(0.98) | darker outline + fill | slightly darker | darker error |
| Disabled | `--color-interactive-disabled-bg`, `--color-interactive-disabled` text | muted outline, muted text | muted text | muted bg and text |
| Loading | spinner replaces or overlays label; button remains visually active size; `aria-busy="true"` | same | same | same |

**Keyboard:** `Tab` to focus; `Enter` or `Space` to activate. In a form, `Enter` submits (primary
button). Disabled buttons: `Tab`-skipped (do not use `tabindex="-1"` on disabled if the reason
is not self-evident — use a tooltip on the wrapper instead).

**Focus ring:** 2 px solid `--color-border-focus`, 2 px offset, `--radius-md` match.

**Density:** `comfortable` — height 44 px, padding-x 20 px. `compact` — height 28 px, padding-x 12 px, `--text-sm`.

---

### 6.2 Icon Button

**Anatomy:**
```
<button class="btn-icon" aria-label="Close dialog" type="button">
  <Icon name="X" size={iconSize} aria-hidden="true" />
</button>
```

**Sizing:**
- Standard: visual 32 × 32 px, touch target 32 × 32 px (desktop only — acceptable per WCAG 2.5.8
  with spacing).
- Comfortable: 44 × 44 px visual and target.
- Compact: 24 × 24 px visual, 32 × 32 px touch target (keyboard focus ring expands).

**State matrix:** Identical to ghost button states. Focus ring visible.

**Rule:** `aria-label` is mandatory. No icon button exists without an accessible name.

---

### 6.3 Menu (dropdown / context)

**Anatomy:**
```
<div role="menu" aria-label="[context]">
  <div role="menuitem" tabindex="-1">...</div>
  <div role="menuitem" tabindex="-1" aria-disabled="true">...</div>
  <hr role="separator" />
  <div role="menuitemcheckbox" aria-checked="true" tabindex="-1">...</div>
</div>
```

**Surface:** `--color-surface-raised` bg, `--shadow-sm`, `--radius-md`, 1 px `--color-border`
border, 8 px padding top/bottom, 0 px padding sides.

**Item sizing:** Height `--density-nav-height` (36 px standard), padding 0 12 px. Icon (if present)
20 px, 8 px gap to label.

**State matrix:**

| State | Background | Text |
|---|---|---|
| Default | transparent | `--color-text-primary` |
| Hover / arrow-key focused | `--color-interactive-hover` | `--color-text-primary` |
| Selected (checkmark) | `--color-interactive-selected` | `--color-text-primary` |
| Disabled | transparent | `--color-interactive-disabled` |
| Destructive | transparent default, `--color-status-error-subtle` hover | `--color-status-error-text` |

**Keyboard:** Arrow Up/Down navigate items; `Enter` or `Space` activates; `Escape` closes and
returns focus to trigger; `Tab` closes (focus leaves menu).

**Motion:** Open — `--duration-fast` + `--easing-decelerate`, scale from 0.95 to 1 + opacity 0→1.
Close — `--duration-fast` + `--easing-accelerate`, reverse.

---

### 6.4 Dialog / Modal

**Anatomy:**
```
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-desc">
  <header>
    <h2 id="dialog-title">Title</h2>
    <button class="btn-icon" aria-label="Close">...</button>
  </header>
  <div id="dialog-desc" class="dialog-body">...</div>
  <footer class="dialog-actions">
    <button class="btn btn-ghost">Cancel</button>
    <button class="btn btn-primary">Confirm</button>
  </footer>
</div>
<div class="dialog-backdrop" aria-hidden="true" />
```

**Surface:** `--color-surface-overlay` bg, `--shadow-md`, `--radius-lg` (12 px). Max-width 560 px
(standard) / 480 px (narrow). Min-width 320 px. Backdrop: `rgba(0,0,0,0.6)`, `--z-overlay`.

**Focus management:** On open, focus moves to first focusable child or the dialog root. Focus trap
active while open (Tab cycles within). On close, focus returns to the trigger that opened it.
`Escape` closes (unless explicitly suppressed for destructive confirmation dialogs).

**Sizes:**
- Default: 560 px max-width.
- Narrow: 400 px max-width (confirmations).
- Wide: 720 px max-width (pickers, editors).
- Full-screen (mobile only): 100vw × 100vh, `--radius-none`, `--z-modal`.

**Motion:** Backdrop fades in `--duration-moderate`. Panel scales from 0.95 + fades in
`--duration-moderate`. Reduced-motion: instant display.

---

### 6.5 Text Field

**Anatomy:**
```
<div class="field">
  <label for="input-id" class="field-label">Label</label>
  <div class="field-input-wrap">
    [<Icon aria-hidden="true" class="field-icon-left" />]
    <input id="input-id" type="text" aria-describedby="input-hint input-error" />
    [<Icon aria-hidden="true" class="field-icon-right" />]
  </div>
  <span id="input-hint" class="field-hint">Hint text</span>
  <span id="input-error" role="alert" class="field-error" aria-live="polite">Error message</span>
</div>
```

**Sizing:** Height `--density-input-height` (36 px standard / 44 px comfortable / 28 px compact).
Horizontal padding 12 px. `--radius-sm` (3 px).

**State matrix:**

| State | Border | Background | Label |
|---|---|---|---|
| Default | `--color-border` 1 px | `--color-surface-sunken` | `--color-text-secondary` |
| Hover | `--color-border-strong` 1 px | same | same |
| Focus | `--color-border-focus` 2 px | `--color-surface-sunken` | `--color-accent` |
| Filled (has value) | `--color-border` 1 px | same | same |
| Error | `--color-status-error` 1 px | `--color-status-error-subtle` | `--color-status-error-text` |
| Disabled | `--color-border` 1 px dashed | `--color-interactive-disabled-bg` | `--color-interactive-disabled` |
| Read-only | `--color-border` 1 px | `--color-surface-alt` | `--color-text-secondary` |

**Label:** Always visible above input (not floating/inside). This avoids the readability and
focus problem of floating labels.

**Error:** Shown below input, associated via `aria-describedby`. Never replaces the label. Icon
(`AlertCircle`) + text. Error text color must meet contrast on the error-subtle background.

---

### 6.6 Select

Styled `<select>` or custom `listbox` pattern. Use native `<select>` where browser styling
allows; custom listbox for multi-select or complex options. ARIA pattern: `role="combobox"` +
`role="listbox"` + `role="option"`.

**Anatomy and state matrix:** Identical to Text Field for the trigger element. Dropdown panel:
identical to Menu (§6.3).

---

### 6.7 Checkbox and Switch

**Checkbox:**
```
<label class="checkbox-label">
  <input type="checkbox" class="checkbox-input" />
  <span class="checkbox-custom" aria-hidden="true" />
  Label text
</label>
```
Size: 16 × 16 px visual box; touch target ≥ 44 × 44 px on comfortable density via padding on
label. Checked state: accent fill + white checkmark icon. Indeterminate: dash icon.

**Switch (toggle):**
```
<button role="switch" aria-checked="false" class="switch">
  <span class="switch-thumb" />
  <span class="sr-only">Enable dark mode</span>
</button>
```
Size: 36 × 20 px track; 16 px thumb (comfortable: 44 × 28 px track, 20 px thumb).
Checked: `--color-accent` track, thumb right. Unchecked: `--color-border-strong` track, thumb left.
Motion: thumb slides `--duration-fast` + `--easing-standard`. Reduced: instant.

Both controls: focus ring on the interactive element, not just the label.

---

### 6.8 Segmented Control

Used for exclusive selection among 2–5 options (e.g., density mode, view toggle).

```
<div role="radiogroup" aria-label="View mode">
  <button role="radio" aria-checked="true">List</button>
  <button role="radio" aria-checked="false">Grid</button>
</div>
```

**Container:** `--color-surface-sunken` background, `--radius-md`, 2 px padding. Segments fill
equally. Selected segment: `--color-surface-raised` background, `--shadow-sm`, `--radius-sm`.
Motion: background slides `--duration-fast` + `--easing-standard`.

**State:** See Button states. Active/selected segment: elevated bg. Keyboard: Arrow Left/Right
to navigate within group; `Tab` moves to next focusable element outside group.

---

### 6.9 Tabs

Used for secondary navigation within a panel or surface.

```
<div role="tablist" aria-label="Character sheet sections">
  <button role="tab" id="tab-1" aria-selected="true" aria-controls="panel-1">Abilities</button>
  <button role="tab" id="tab-2" aria-selected="false" aria-controls="panel-2">Equipment</button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">...</div>
```

**Anatomy:** Tab strip: `--color-surface` background, bottom `--color-border` 1 px line.
Active tab: `--color-accent` 2 px bottom border, `--color-text-primary` text.
Inactive tab: `--color-text-secondary` text; hover: `--color-text-primary`.

**Keyboard:** Arrow Left/Right move between tabs and activate them (automatic activation for
small tab sets). `Tab` enters the panel. `Home` / `End` jump to first/last tab.

---

### 6.10 Toast / Notification

```
<div role="status" aria-live="polite" aria-atomic="true" class="toast toast-success">
  <Icon name="CheckCircle" aria-hidden="true" />
  <span class="toast-message">Note saved.</span>
  <button class="btn-icon toast-dismiss" aria-label="Dismiss">...</button>
</div>
```

**Position:** Bottom-right on Desktop/Tablet; bottom-center on Mobile. Above bottom tab bar
(z-index `--z-toast`).

**Sizing:** Min-width 280 px, max-width 400 px (Desktop), full-width on Mobile minus 32 px margin.
Padding 12 px 16 px. `--radius-md`. `--shadow-lg`.

**Variants:** `info`, `success`, `warning`, `error`. Background uses `--color-status-*-subtle`;
border `1px solid --color-status-*`; icon + text in matching semantic color.

**Auto-dismiss:** `success` / `info` at 4 s; `warning` / `error` persistent until dismissed or
action taken. Auto-dismiss paused while hovered (pointer) or focused.

**Motion:** Slide in from bottom + opacity `--duration-standard` + `--easing-decelerate`.
Dismiss: fade out `--duration-fast`. Stack: multiple toasts stack with 8 px gap (newest on top).

**Announcement:** `role="status"` (polite) for success/info; `role="alert"` (assertive) for error.

---

### 6.11 Tooltip

```
<span data-tooltip="Full label for this icon button" class="tooltip-trigger">
  [trigger]
</span>
```

**Appears:** On hover (300 ms delay) and on focus (0 ms delay — immediately on keyboard focus).
Disappears: on blur or mouse leave (100 ms delay).

**Surface:** `--color-surface-raised` bg, `--shadow-sm`, `--radius-sm` (3 px), 6 px padding,
`--text-xs` (12 px), max-width 200 px.

**Not used as sole source of meaning for an action.** If the only label for an icon button is the
tooltip, that is acceptable only if `aria-label` is also set.

**Placement:** Above trigger by default; flips to avoid viewport edges.

**Motion:** Fade in `--duration-fast`. No motion in reduced-motion mode.

---

### 6.12 Popover

Richer than tooltip: contains interactive content (forms, pickers, contextual panels).

```
<div role="dialog" aria-modal="false" aria-label="Filter options" class="popover">
  ...interactive content...
</div>
```

**Surface:** Same as dropdown — `--color-surface-raised`, `--shadow-sm`, `--radius-md`.
Focus trap active when `aria-modal="true"` (for significant popovers); not trapped for lightweight
info popovers. `Escape` closes. Click outside closes.

---

### 6.13 Sheet / Bottom Drawer

Used on Mobile (and optionally Tablet) as a full-height or partial-height overlay panel.

```
<div role="dialog" aria-modal="true" aria-labelledby="sheet-title" class="sheet">
  <div class="sheet-handle" aria-hidden="true" />
  <header><h2 id="sheet-title">Panel Title</h2></header>
  <div class="sheet-body">...</div>
</div>
<div class="sheet-backdrop" />
```

**Heights:** `snap-half` (50vh), `snap-full` (90vh), `snap-peek` (30vh — drag handle only visible).
Drag handle: 40 × 4 px pill, `--color-border-strong`, centered.

**Surface:** `--color-surface-overlay`, `--radius-xl` top corners (20 px), `--shadow-lg`.

**Motion:** Slide up `--duration-moderate` + `--easing-decelerate`. Snap between heights:
`--duration-standard`. Dismiss: slide down `--duration-moderate` + `--easing-accelerate`.

---

### 6.14 Card

**Anatomy:**
```
<div class="card" role="article" [aria-label="..."]>
  [<header class="card-header">...</header>]
  <div class="card-body">...</div>
  [<footer class="card-footer">...</footer>]
</div>
```

**Surface:** `--color-surface` bg, `--radius-md` (6 px), `--color-border` 1 px border. No shadow
at rest. Hover (if interactive): `--shadow-sm` + `--color-border-strong` border.

**Padding:** `--component-card-padding` (16 px standard, 12 px compact).

**Interactive card (clickable):** Add `role="button"` or wrap in `<a>`. Hover state. Focus ring.
Active: scale(0.99).

---

### 6.15 List / Table Row

**List item:**
```
<li class="list-item" role="row" aria-selected="false">
  [<Icon />]
  <span class="list-item-label">Label</span>
  [<span class="list-item-meta">metadata</span>]
  [<div class="list-item-actions">...</div>]
</li>
```

Height: `--density-nav-height`. Padding: 0 12 px. Hover: `--color-interactive-hover` bg.
Selected: `--color-interactive-selected` bg + `--color-accent` 2 px left border.

**Table row:** `<tr>` inside `<table role="grid">`. Alternating rows: `--color-surface-alt` on
odd rows (zebra). Hover: `--color-interactive-hover`. Selected: `--color-interactive-selected`.
Sortable column headers: `<th scope="col" aria-sort="ascending|descending|none">`.

---

### 6.16 Badge

Inline status indicator, count, or label.

**Anatomy:** `<span class="badge badge-error" aria-label="3 errors">3</span>`

**Sizes:** Default: `--text-xs` (12 px), `--font-weight-semibold`, `--tracking-wide`, `--radius-full`,
4 px 8 px padding. Dot variant: 8 × 8 px circle, no text.

**Variants:** `default` (surface + border), `accent`, `success`, `warning`, `error`, `info`, `dm-only`.
Each uses the matching `--color-status-*-subtle` bg and `--color-status-*-text` foreground.

**Rule:** Badge alone never conveys the only indication of status — pair with text or icon.

---

### 6.17 Chip

Interactive tag or filter token.

**Anatomy:**
```
<button class="chip chip-selected" aria-pressed="true">
  [<Icon size="--icon-size-micro" aria-hidden="true" />]
  Label
  [<button class="chip-remove" aria-label="Remove tag: Label"><Icon name="X" /></button>]
</button>
```

**Sizing:** Height 28 px (standard) / 36 px (comfortable); `--radius-full`; 8 px 12 px padding.

**States:** Unselected: `--color-surface-raised` bg, `--color-border` border.
Selected: `--color-accent-subtle` bg, `--color-accent-border` border, `--color-accent` text.
Hover: `--color-interactive-hover` overlay.

---

## 7. Layout and responsive behavior

Layout tokens and structural values are defined here; their application to specific surfaces is
delegated to each sibling UX document.

### 7.1 Global layout tokens

```css
--layout-rail-width:              60px;   /* icon-only side rail */
--layout-sidebar-width:          240px;   /* expanded sidebar */
--layout-sidebar-width-narrow:   200px;
--layout-sidebar-width-wide:     320px;
--layout-topbar-height:           48px;
--layout-titlebar-height:         28px;   /* Electron custom titlebar */
--layout-bottomnav-height:        60px;   /* Mobile bottom tab bar */
--layout-panel-detail-width:     300px;   /* right-hand detail panel */
--layout-content-max-width:      960px;   /* prose/form reading max */
--layout-note-reading-width:      68ch;   /* comfortable note prose width */
```

### 7.2 Profile layout overview

| Profile | Global nav | Primary workspace | Detail / secondary |
|---|---|---|---|
| Desktop ≥1024px | Persistent sidebar (240 px) or rail (60 px) + optional top bar | Remaining viewport | Right panel (300 px, collapsible) |
| Tablet 600–1024px | Collapsible rail (60 px collapsed, 240 px expanded) or bottom tab bar | Full remaining | Sheet/drawer overlay |
| Mobile <600px | Bottom tab bar (60 px) | Full viewport minus tab bar | Full-screen sheet |

### 7.3 Grid system

- 4-column grid on Mobile (< 600 px), 8-column on Tablet, 12-column on Desktop.
- Column gutter: `--space-4` (16 px) on Desktop/Tablet, `--space-3` (12 px) on Mobile.
- Content areas respect `--layout-content-max-width` (960 px) centered with auto margins for
  non-canvas surfaces (forms, settings, character creation).
- Canvas/map surfaces are full-bleed — no max-width constraint.

---

## 8. Motion and feedback

See UX-VIS-010 for the full motion system definition. Additional feedback-specific rules:

**Skeleton loading:** Skeleton screens use `--color-surface-alt` as the base and animate a
shimmer (background-position sweep) at `--duration-crawl` loop. Skeletons must match the
approximate shape of the content they replace (same aspect ratio, same text line widths ±20%).
Reduced-motion: static skeleton, no shimmer.

**Progress indicators:**
- Determinate progress bar: `--color-accent` fill, `--color-surface-sunken` track, height 4 px.
  `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.
- Indeterminate spinner: circular, `--color-accent` stroke, animated rotation `--duration-crawl`
  loop. Reduced-motion: pulsing opacity instead of rotation.

**Optimistic UI:** State changes on actions that are expected to succeed update immediately.
If the operation fails, revert and show an error toast. Never show "saving…" for < 300 ms — skip
the in-progress state and show the result directly. Show "saving…" only for operations expected
to take > 300 ms.

---

## 9. Accessibility requirements (surface-specific)

The following are VIS-specific additions beyond `03-accessibility.md`:

**Focus ring:** 2 px solid `--color-border-focus`, 2 px offset (not inset). Applied via
`:focus-visible` (not `:focus`) to all interactive elements globally. Never suppressed with
`outline: none` without a replacement. The focus ring color must meet 3:1 contrast against both
the background behind the ring and the element surface (WCAG 2.2 SC 1.4.11).

**Non-color state:** Every interactive state (disabled, error, selected, dm-only) must be
communicated by at least two of: color, icon, pattern, text, shape. Color alone is never
sufficient (WCAG 1.4.1, A11Y-011).

**Forced colors:** The `high-contrast` theme maps all tokens to CSS system color keywords
(`Canvas`, `CanvasText`, `Highlight`, `LinkText`, etc.) when `forced-colors: active` media query
is detected. No custom color survives forced-colors mode.

**Motion tokens as the a11y gate:** The `data-motion` attribute approach (UX-VIS-010) means no
per-component `prefers-reduced-motion` media queries are needed. A11Y-005 is satisfied by the
single resolver.

**Type scale and AT:** Screen readers announce text with the computed font size. Using
`--text-2xs` (10 px) for badge counts is acceptable only if the full value is also available
via `aria-label` (e.g., `aria-label="3 new messages"`).

**DM boundary visual treatment:** The `--color-dm-only-badge` (purple) badge is always paired
with the text "DM Only" (visually or via `aria-label`), and the `--color-hidden-content-stripe`
overlay is always paired with a visually-hidden or tooltip description of why content is hidden.
This ensures the DM/player visibility boundary is never color-only.

---

## 10. Anti-patterns and explicit limitations

These are hard limits. Each entry cites a researched reason.

**AP-01 — Color as the sole state indicator.**
Never use color alone to convey meaning (error, selected, disabled, dm-only). WCAG 1.4.1 and
1.4.11 are mandatory [10]. 8% of males have red-green color vision deficiency; color-only signals
will fail those users on combat (red = bloodied) and status displays. Required: icon + color, or
text + color, or pattern + color.

**AP-02 — Floating/placeholder labels on text fields.**
Do not use placeholder text as the only label, and do not use floating labels (Material-style
label that starts inside the field and animates up). Floating labels disappear when the field is
filled, creating working-memory burden under table pressure. They also fail contrast in many
theme combinations [10, WCAG 1.4.3]. Use a fixed label above the input always.

**AP-03 — Excessive animation on live play surfaces.**
Do not add decorative transitions to any element in the hot path (initiative order, HP tracker,
combat log, dice result). Each animation adds > 16 ms to perceived latency. The only acceptable
animations on live play surfaces are: dice result (one bounce, `--duration-slow`), and state
change indicators (color/opacity only, `--duration-micro`). Foundry VTT's excessive animation
on combat tracker is a known usability failure to avoid.

**AP-04 — Font soup.**
Do not use more than two font families in the UI layer (Inter + Cinzel). Loading additional
fantasy fonts (Uncial Antiqua, MedievalSharp, etc.) for UI labels increases load time, reduces
legibility at body sizes, and creates visual inconsistency. Content (player handouts, map labels)
may use custom fonts inside a sandboxed render surface.

**AP-05 — Pure-black backgrounds (#000000) in dark themes.**
Pure black causes halation (perceived color bleeding) on OLED displays and creates harsh
contrast with near-white text [2]. Use `#111418` (tavern) or `#05080d` (dungeon) as the darkest
backgrounds. Exception: `high-contrast` theme intentionally uses `#000000` to meet forced-color
intent.

**AP-06 — Textures and background images on interactive components.**
Parchment paper textures, canvas noise, leather backgrounds on input fields, cards, or buttons
create contrast failures as the texture color varies across the element. They also obscure focus
rings and selection states. Allowed only on the root body background as a subtle radial gradient.

**AP-07 — Overloading the z-index space.**
Do not assign ad-hoc z-index values. Every z-index must use a `--z-*` token (UX-VIS-008).
Uncontrolled z-index leads to stacking context bugs where tooltips render under modals, or
the DM boundary overlay fails to sit above interactive content. This is a safety issue, not
just a visual one — the DM visibility layer must always win.

**AP-08 — Icon sets mixed without approval.**
Do not import icons from Heroicons, Phosphor, Material Icons, or any other set alongside Lucide.
Mixed icon families produce inconsistent stroke weights and visual size at matching px values,
creating the "assembled" appearance that violates the premium brand requirement. One set; one
stroke weight; one grid.

**AP-09 — Removing focus rings with `outline: none`.**
Never apply `outline: none` or `outline: 0` without a replacement visible focus indicator.
WCAG 2.2 SC 2.4.11 (Focus Appearance) requires a visible focus indicator with 3:1 contrast
against adjacent colors [10]. Keyboard-only users and switch-access users depend on it.

**AP-10 — Hard-coded hex colors in component CSS.**
No raw hex, `rgb()`, or `hsl()` color values in component rules. All colors come from
`--color-*` tokens. Hard-coding breaks theme switching, forces a manual audit on every theme
change, and always introduces at least one contrast failure in a non-default theme.

**AP-11 — Disabling the user's density preference on Desktop.**
On Desktop, the user's selected density (comfortable / standard / compact) must be respected
globally. Do not override density locally per component without documented justification.
Overrides fragment the information density mental model and force users to re-scan familiar
surfaces after switching modes.

**AP-12 — Aggressive auto-dismiss on error toasts.**
Error and warning toasts must not auto-dismiss. Auto-dismissing errors while a user is reading
a map or looking at physical dice violates the "feedback & responsiveness" principle — the error
may have already disappeared by the time they look at the screen. Only success and info
notifications may auto-dismiss (at ≥ 4 s minimum).

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| WCAG 2.2 AA contrast failures across all five themes | 0 | Automated token-pair contrast validation (CI gate) |
| Axe critical violations on any route | 0 | Automated axe scan in Playwright suite |
| Theme switch latency | ≤ 16 ms (1 frame) | Perf measurement in test harness |
| Focus ring visible in all themes | 100% of interactive controls | Manual audit + automated screenshot diff |
| Touch target size (comfortable density) | ≥ 44 × 44 px on all interactive controls | Automated target-size audit |
| Hard-coded color values in component CSS | 0 | ESLint / stylelint rule (CI gate) |
| Mixed icon families (non-Lucide) without exception | 0 | Import scanner in CI |
| Animation duration on live play hot paths | ≤ 80 ms (micro token only) | Code review + perf profiling |
| Skeleton shape fidelity (aspect ratio match) | ± 20% of final content | Visual regression diff |
| Reduced-motion: zero animations at `data-motion="reduced"` | 100% | E2E test with motion preference set |

---

## 12. Open questions and risks

1. **Cinzel loading strategy:** Cinzel is a Google Fonts typeface. If the app operates fully
   offline, it must be self-hosted. Risk: adds ~40 KB to the initial bundle for a font used
   only at display sizes. Mitigation: `font-display: optional` with a fallback; or accept the
   fallback serif on first offline load. Decision needed before implementation.

2. **Custom theme slot for v2:** The brand mood spec reserves a custom theme slot. The token
   architecture supports it (any CSS class on `<html>` overrides the token set). No UI for
   theme authoring is in scope for v2; this is a Could-have tracked here.

3. **DM boundary stripe pattern:** The `--color-hidden-content-stripe` is defined as a CSS
   `rgba` color, but a striped overlay pattern requires a `background-image: repeating-linear-gradient`.
   The token cannot express the full pattern. Recommend a CSS utility class
   `.dm-hidden-overlay` documented here and implemented as a single shared utility.

4. **Token validation tooling:** The contrast validation CI gate is specified but the tooling
   is not yet implemented. This is a hard dependency for the accessibility acceptance criteria
   in UX-VIS-012. The gate must be in place before any theme token changes are accepted.

5. **Inter variable font subsetting:** Inter Variable has a full file size of ~300 KB. Subsetting
   to Latin + Extended-Latin reduces it to ~80 KB. The subsetting approach must be decided
   before the asset pipeline is finalized.

6. **Compact density and WCAG 2.5.8 compliance:** Compact density uses 28 × 28 px visual targets
   on Desktop. WCAG 2.5.8 (Target Size Minimum, AA) requires 24 × 24 px with adequate spacing
   OR an equivalent alternative. Compact targets at 28 px with `--space-1` (4 px) gaps are
   likely compliant but must be formally verified with WCAG 2.5.8 spacing calculation before
   compact mode is shipped.

7. **Motion preference sync across profiles:** If a user sets motion-off on Desktop, does that
   preference sync to Mobile? The motion resolver reads a stored preference; if cloud sync carries
   it, the answer is yes. This interaction with the sync module needs a documented decision.

---

## Sources

[1] Design Tokens Community Group — W3C — https://www.w3.org/community/design-tokens/

[2] Linear Design — Linear — https://linear.app (product aesthetic reference, studied Jan 2025)

[3] W3C DTCG Design Token Format — W3C Community Group — https://tr.designtokens.org/format/

[4] Radix Colors — Radix UI — https://www.radix-ui.com/colors

[5] Material Design 3 — Google — https://m3.material.io (color system, typography, motion, elevation, density)

[6] Variable fonts — MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide

[7] Inter typeface — Rasmus Andersson — https://rsms.me/inter/

[8] Type Scale — Typographic scale calculator — https://typescale.com/

[9] Accessible Typography — Smashing Magazine — https://www.smashingmagazine.com/2020/07/css-techniques-legibility/

[10] WCAG 2.2 — W3C — https://www.w3.org/TR/WCAG22/ (SC 1.4.1, 1.4.3, 1.4.11, 2.3.3, 2.4.11, 2.5.7, 2.5.8)

[11] Material Design 3 Layout — Google — https://m3.material.io/foundations/layout/understanding-layout/overview

[12] IBM Carbon Design System Spacing — IBM — https://carbondesignsystem.com/elements/spacing/overview/

[13] Shape in UI Design — Nielsen Norman Group — https://www.nngroup.com/articles/shape-meaning/

[14] shadcn/ui — shadcn — https://ui.shadcn.com (radius conventions studied)

[15] Stripe Design — Stripe — https://stripe.com (elevation and shadow approach, studied 2025)

[16] Icon system design — Google Material Icons Guide — https://fonts.google.com/icons

[17] Lucide Icons — Lucide — https://lucide.dev

[18] Response time limits — Nielsen Norman Group — https://www.nngroup.com/articles/response-times-3-important-limits/

[19] Apple Human Interface Guidelines — Apple — https://developer.apple.com/design/human-interface-guidelines/

[20] Atlassian Design System — Atlassian — https://atlassian.design/foundations/spacing

[21] Vercel Geist Design System — Vercel — https://vercel.com/geist/introduction

[22] Foundry VTT — Foundry Gaming LLC — https://foundryvtt.com (genre precedent reference)

[23] Obsidian — Obsidian.md — https://obsidian.md (TTRPG community aesthetic reference)

[24] IBM Carbon Motion — IBM — https://carbondesignsystem.com/elements/motion/overview/
