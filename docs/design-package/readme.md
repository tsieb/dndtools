# DND Tools — Design System

A canvas-first **command platform for running tabletop RPG (D&D) sessions live**, for the Dungeon
Master. The DM's home is a spatial **Command Center** — a board of live-play widgets (session
status, combat, dice, maps, party vitals, audio, player-view controls), not a document list. Around
it sit seven durable sections: **Command Center · Session · Characters · Atlas · Campaign ·
Knowledge · Settings**. One information architecture runs on desktop, tablet and mobile; only the
presentation changes (sidebar ↔ rail ↔ bottom tab bar).

**Primary user & moment:** a DM at the table, under time pressure. The hot paths — see session
state, advance combat, adjust HP, reveal a map, push a handout — are optimized for **speed and
glanceability**. Prep/authoring can be richer and slower.

This design system delivers the **warm "candle-lit" redesign** described in the brief below: the
underlying token architecture (color, type, spacing, radius, elevation, motion, density, five
themes behind one `data-theme` swap) is excellent and preserved; what was added is the *design* the
original build never received — emphasis hierarchy, intentional color, crafted components, and a
warm, atmospheric mood.

> **Theme decision.** The original "tavern" dark theme read cool/navy. Per the brief we shifted the
> **entire neutral ramp warm** (espresso brown-black) and gave the gold accent more presence.
> Tavern is the hero; parchment is a non-washed light variant; high-contrast is the a11y floor.

---

## Sources

This system was built by reading the product's real code and design materials. If you have access,
explore them to build higher-fidelity work:

- **`gm/`** — the production app (SvelteKit 5 + semantic-token CSS). Source of truth for the token
  system (`gm/src/routes/styles.css`), the seven-section IA, the widget set, and the Lucide icon
  registry (`gm/src/lib/gui/icons.ts`).
- **`redesign/`** — the redesign package: `00-diagnosis.md` (evidence-backed UI/UX diagnosis of the
  current build) and `01-design-brief.md` (the warm, single-focus redesign brief this system
  implements). Plus `evidence/` screenshots of the "before" state.
- **GitHub — [`tsieb/dndtools`](https://github.com/tsieb/dndtools)** — the monorepo (`apps/`,
  `packages/`, `docs/`). Browse `docs/planning/v2/ux/` and `apps/gm/` for the full UX spec, the
  navigation registry, and component code. **Explore this repo to build better DND Tools designs.**

Fonts (Inter, Cinzel, JetBrains Mono) are referenced by name in the app and loaded as webfonts; no
binaries ship in the repo. See **Caveats**.

---

## CONTENT FUNDAMENTALS — how DND Tools writes

The voice is a **calm, competent stage manager**: it hands the DM control and gets out of the way.
It is genre-aware (fantasy domain words: scene, handout, initiative, party, vault) but never
cute — no purple prose, no in-character narration in the chrome.

- **Person.** Address the DM as **you**; refer to the table as **players** / **party**. "Run the
  live session…", "what players currently see", "Push handout to players…".
- **Casing.** Sentence case for everything — buttons, labels, headings, menu items ("Set active
  map", "Push handout", "New note"). **Section/page titles** use the display serif but stay sentence
  case ("Command Center", "Build encounter"). Eyebrows and stat labels are **UPPERCASE, tracked**
  ("CURRENT TURN", "PLAYERS", "HP", "ROUND").
- **Verbs first, terse.** Actions are imperative and short: *Next turn · Deliver · Queue · Revoke ·
  Preview · Reveal area · Project to players*. Prefer one strong verb over a phrase.
- **State is spoken plainly.** "Projecting to 3 players", "Projection queued", "Not projecting",
  "Session live", "Saved". Status is a fact, not a flourish.
- **Safety language is explicit.** The DM-only vs player-visible distinction is always named:
  **DM only · Players · Hidden · Mixed**. Never imply visibility by color alone.
- **No engine jargon to users.** Never print raw IDs, profile names, or internal taxonomy
  ("profile: compact", `region-outpost-yard`). One name per destination (nav label = page title).
- **Emoji:** **none.** Meaning is carried by Lucide icons + text. Unicode glyphs appear only as
  functional marks (e.g. `⌘K` on desktop; never on touch).
- **Numbers** (HP, initiative, AC, dice, XP) are set in the **mono** face for tabular alignment.

*Examples (verbatim from the app):* "Run the live session: build encounters, run combat, and roll
dice or draw tables." · "Push handout…" · "Players are seeing: <scene>" · "No combat running."

---

## VISUAL FOUNDATIONS

**Mood.** Premium, warm, dark-first, genre-appropriate — a candle-lit tool for a fantasy hobby, not
a navy admin panel and not washed-out parchment. The hero is **tavern**: an espresso brown-black
neutral ramp under a single warm-gold accent.

**Color.** Sparing and meaningful. Gold (`--color-accent #e0b06f`) marks the **one** primary action
and active nav per region — never decoration. Status colors (success green, warning amber, error
red, info blue) encode **state/severity only** and *always* pair with a redundant icon shape so
meaning survives grayscale. A distinct **purple** carries the safety-critical DM-only signal. Build
new colors from the token ramps; don't invent fresh hues.

**Typography.** Inter carries ~95% of the UI; **Cinzel** (display serif) is reserved for large
headings (≥24px) and atmospheric accents only; **JetBrains Mono** for all numerals/IDs/dice. A
clear 3–4 step size hierarchy per surface — don't flatten every title to one size.

**Spacing & density.** 4px grid (2px micro half-step). Calm rhythm, not cramped. Three density
modes (`data-density`): standard (desktop), comfortable (≥44px touch — the mobile/tablet lock),
compact. Touch targets ≥44px on touch profiles.

**Backgrounds.** No textures on contrast-bearing components. The **only** decorative surface is a
single subtle warm radial glow on the page root (candlelight from above). Map widgets use a dark
gradient + faint grid as a tactical-map affordance. No photographic imagery in chrome.

**Elevation.** Shadow + surface tone separate primary from secondary — this is how the squint test
is won. Supporting tiles are flat/sunken; the one primary panel is `raised` + an accent border with
`--shadow-md`. Dark shadows are deep warm-black; parchment shadows are soft brown.

**Corners.** `sm` 3px (inputs), `md` 6px (cards, buttons, menus), `lg` 12px (dialogs), `xl` 20px
(sheets), `full` (pills — badges, chips, avatars). Cards: 6px radius, 1px warm border, subtle
shadow; the primary card adds a gold border.

**Borders.** Warm brown hairlines (`--color-border`), stronger for emphasis/controls
(`--color-border-strong`), gold for focus.

**Motion.** Functional, quick, no bounce in standard UI. Durations 80–500ms on a standard easing
`cubic-bezier(.4,0,.2,1)`; `--easing-spring` is reserved for dice-result / celebration surfaces
only. A single resolved motion preference (`data-motion`) collapses every duration to 0ms under
reduce — no per-component media queries. Transitions are fades + small position/size changes.

**Interaction states.** Hover: a faint gold wash (`--color-interactive-hover`) on ghost controls,
a lighter surface on solid ones, gold-brighten on the primary. Selected: a stronger gold tint +
gold left rail. Focus: a 2px gold ring at 2px offset, everywhere. Press: color shift (no shrink).
Disabled: ~50% opacity, no pointer.

**Transparency & blur.** Used sparingly — scrims/backdrops behind modals and sheets; the DM-only
content stripe is a low-alpha purple wash. No glassmorphism on content.

**Imagery vibe.** Warm, dim, candle-lit; tactical maps render as dark gradients with a faint gold
grid. Cool/navy and bluish-purple gradients are explicitly off-brand.

---

## ICONOGRAPHY

**One family: [Lucide](https://lucide.dev).** Clean 2px stroke, `currentColor`, MIT-licensed. The
production app imports Lucide as the *only* icon source through a single registry
(`gm/src/lib/gui/icons.ts`) so there is one family at one weight — never "icon soup". This system
mirrors that registry in `components/core/Icon.jsx` (semantic name → Lucide glyph).

- **Delivery.** Lucide is **CDN-linked** (`https://unpkg.com/lucide@latest/dist/umd/lucide.js`) in
  cards and kits; the `Icon` component reads glyph geometry from `window.lucide.icons[Name]`.
  (Substitution note: the app bundles Lucide via `@lucide/svelte`; we use the CDN UMD build for
  zero-install parity — same glyphs, same stroke.)
- **Sizes** are tokenized: `micro 16 · sm 20 · md 24 · lg 32 · xl 48`; stroke is always 2px.
- **Status icons each have a DISTINCT shape** (check-circle / triangle-alert / x-circle / info) so
  severity reads without color. The DM-only signal uses the eye family.
- **No emoji. No PNG/sprite icons.** Unicode glyphs appear only as functional marks (`⌘K`).
- Meaningful icons carry an accessible name (`role=img` + `aria-label`); decorative icons are
  `aria-hidden` and paired with visible text. Icon-only buttons must always pass a label.

Section icons: home `house` · session `zap` · characters `users` · atlas `map` · campaign `scroll`
· knowledge `book-open` · settings `settings`.

---

## INDEX — what's in this folder

**Foundations**
- `styles.css` — the single entry point consumers link (an `@import` manifest only).
- `tokens/colors.css` · `typography.css` · `spacing.css` · `fonts.css` · `base.css` — the token
  layers and webfont declaration.
- `guidelines/*.card.html` — foundation specimen cards (Colors, Type, Spacing, Brand groups).

**Components** (`components/<group>/` — React primitives + `.d.ts` + `.prompt.md` + a `@dsCard`):
- `core/` — **Icon, Button, IconButton, Card / CardHeader, Avatar, Tabs, Breadcrumb, Popover, Stepper**
- `forms/` — **Field, Input, Textarea, Select, Checkbox, Switch, SegmentedControl, Slider**
- `feedback/` — **Badge, Chip, VisibilityChip, StatusDot**
- `domain/` — **HPBar, StatPill, InitiativeRow, DiceResult** (the live-play vocabulary)
- `map/` — the **Atlas map authoring suite** (actively expanding): the layer system (LayerPanel,
  LayerRow, LayerTypeBadge — render-ordered rows, 13 warm-harmonised type badges, three independent
  display/visibility/opacity controls), the tool rail (ToolPalette), fog-of-war (FogControls),
  procedural generation (GenerationPanel), create/import flows (MapCreationForm, ImportWizard),
  the minimap (Minimap), and points of interest (POIMarker, POIPopover)

Mount in `@dsCard` HTML via `const { Button } = window.DNDToolsDesignSystem_8ae046` after loading
`_ds_bundle.js` (compiler-generated — never hand-edited).

**Templates** (`templates/<slug>/` — copy-to-start Design Components consuming projects can fork):
- `dm-session-screen/` — **DM Session Screen**, a full live-play layout assembled from the
  primitives (`DmSessionScreen.dc.html`, loaded via its `ds-base.js`).

**UI kit** (`ui_kits/command-center/`)
- A click-through recreation of the redesigned DM workspace, each surface its own `@dsCard` in the
  **DND Tools App** group: Command Center cockpit, Session/Combat hot path, Knowledge note editor,
  Atlas map builder, the scene canvas edit mode, plus the authoring (scene / character / widget
  creators) and management (vault / players / permissions) pages. See its `README.md`.

**Other**
- `SKILL.md` — Agent-Skills-compatible entry point.

---

## Caveats

- **Fonts are CDN webfonts, not vendored.** Inter / Cinzel / JetBrains Mono load from Google Fonts
  (`tokens/fonts.css`). The compiler therefore reports 0 bundled `@font-face` binaries — rendering
  is unaffected. *If you want them self-hosted/offline, drop the `.woff2` files in `assets/fonts/`
  and swap the `@import` for local `@font-face` rules.*
- **The "before" evidence screenshots** (`redesign/evidence/`) show the *current* build, which the
  brief deliberately moves away from — use them for IA only, not visual reference.
- This system implements the brief's three highest-leverage surfaces in depth (Command Center,
  Session, Knowledge) plus Atlas; Characters/Campaign/Settings are stubbed in the kit.
