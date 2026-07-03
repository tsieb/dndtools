# Applying the DND Tools design system to `apps/gm`

This is the migration runbook for landing the **warm "candle-lit" redesign** on the production
SvelteKit app. The work is two phases: a **token reskin** (low-risk, reskins the whole app at once)
and an incremental **component port** (lifts the crafted treatment into specific Svelte components).

The design system was authored *from* this app's own token architecture, so token **names match
1:1** — applying the redesign changes values, never names or contracts.

---

## Phase 1 — Token reskin (do this first; ~30 min, fully reversible)

This single step reskins every surface that already consumes `var(--color-*)` — which is all of
them. No component code changes.

### 1.1 Land the token override
Paste the entire contents of **`redesign.tokens.css`** at the **bottom** of
`apps/gm/src/routes/styles.css` (after the component rules).

Because it redefines tokens under the same `:root` / `[data-theme=…]` selectors that appear earlier
in the file, equal specificity means the **later** rule wins — the original values are overridden
with no edits to the existing blocks. To revert, delete the pasted block.

> Prefer a clean diff? Instead of appending, replace the value bodies of the `:root`,
> `[data-theme='tavern']`, `[data-theme='parchment']`, and `[data-theme='high-contrast']` blocks in
> section 1–2 with the matching blocks from `redesign.tokens.css`, and add the MAP TOKENS block.
> Same result, smaller file.

### 1.2 Add the fonts
The app references `Inter`, `Cinzel`, and `JetBrains Mono` by family name but ships no `@font-face`.
A CSS `@import` must be the **first** statement in a stylesheet, so it cannot go in the appended
block. Pick one:

- **Recommended — preconnect + link in `app.html` `<head>`** (fastest first paint):
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" />
  ```
- **Or** add that same URL as `@import url(...)` on the very first line of `styles.css`.
- **Or, for offline/self-hosted:** drop the `.woff2` files in `apps/gm/static/fonts/` and write
  local `@font-face` rules (Inter 400–800, Cinzel 400–900, JetBrains Mono 400–700).

### 1.3 Theme decision — `dungeon` & `scholar`
The redesign restyles **tavern** (hero), **parchment**, and **high-contrast**. The override does
**not** touch `dungeon` (cool navy/cyan) or `scholar` (clean white/navy) — the brief calls cool/navy
off-brand, but these are *user-selected* themes, so silently rewriting them would override a
deliberate choice. Decide one:

- **A (recommended) — keep them as-is.** Five distinct moods; tavern leads, the cool pair stays as
  opt-in alternates. No action.
- **B — warm their neutrals only.** Keep each theme's accent (cyan / navy) but shift its surface
  ramp toward warm-neutral so nothing reads "blue panel." A focused follow-up.
- **C — retire them.** Remove the two blocks here and from the `NAMED`/`DARK` maps in `app.html`
  and the theme picker. Only if product wants three themes total.

### 1.4 Verify
- Run the repo's contrast gate (`pnpm a11y:contrast` per the styles.css comments) — the warm values
  were chosen to hold AA, but re-run it.
- Sweep all five themes (`data-theme` on `<html>`) × three densities × `data-motion=reduced`.
- Confirm the pre-paint boot scripts in `app.html` still resolve correctly (theme/motion/density are
  unchanged contracts).

---

## Phase 2 — Component port (incremental; token-styled, so each is independent)

The DS ships **React** reference components under `components/<group>/`; the app is **Svelte 5**.
They are the *spec*, not drop-ins: port the markup + token usage into the matching Svelte component,
matching the prop shape in each `.d.ts`. Both sides read the same CSS variables, so a faithful port
inherits the look for free. Work bottom-up.

| DS reference (`components/`) | App target (`apps/gm/src/lib/gui/` unless noted) | Notes |
|---|---|---|
| `core/Icon.jsx` + `Icon.d.ts` | `Icon.svelte` | Same Lucide registry; confirm semantic-name → glyph parity with `lib/gui/icons.ts`. |
| `core/Button.jsx`, `IconButton.jsx` | (shared button styles in `styles.css`) | Lift variant/size/state treatment; keep token-only. |
| `core/Card.jsx` / `CardHeader` | card surfaces across routes | Primary card = gold border + `--shadow-md`; supporting tiles flat/sunken. |
| `core/Tabs`, `Breadcrumb`, `Popover`, `Stepper` | `Breadcrumbs.svelte`, palette/popover surfaces | Match focus-ring + selected treatments. |
| `forms/*` (Field, Input, Select, Checkbox, Switch, SegmentedControl, Slider) | form controls app-wide | Honor `--density-input-height`; 44px on touch. |
| `feedback/Badge, Chip, StatusDot` | badges/chips app-wide | Status = color **+** distinct shape (grayscale-safe). |
| `feedback/VisibilityChip` | DM-only / player-visible markers | The safety-critical purple signal — keep redundant icon + label. |
| `domain/HPBar, StatPill, InitiativeRow, DiceResult` | `CombatTracker.svelte`, `DiceTools.svelte`, `CharacterCombatResources.svelte` | The live-play hot path — highest table-time payoff. Numbers in mono. |
| `map/LayerPanel, LayerRow, LayerTypeBadge` | `MapLayerPanel.svelte` | Needs the **new** map tokens (already in `redesign.tokens.css`); badge bg mixes from the `--layer-*` token against the surface. |
| `map/ToolPalette, FogControls, GenerationPanel, MapCreationForm, ImportWizard, Minimap, POIMarker, POIPopover` | `MapAuthoringPanel.svelte`, `MapAnnotationsPanel.svelte`, `MapNestedAreas.svelte` | Fog opacity differs DM (`0.2`) vs player (`0.95`). |

**Suggested order:** Icon → Button/Card/form primitives → feedback (Badge/Chip/StatusDot/Visibility)
→ domain (combat hot path) → map suite. Each PR is small and independently shippable because the
token layer already carries the palette.

**Templates & the prototype as targets:** `templates/dm-session-screen` and `templates/map-editor`
(DS), plus the separate **Dndtools design system prototype** (claude.ai/design — the full assembled
app), are the target-state references — build the Svelte screens (`routes/home`, `routes/session`,
`routes/knowledge`, `routes/atlas`) *toward* them. For the scene-canvas edit mode + tiered inspector,
the prototype's `Scene & Widget System` entry is the spec. They are reference, not code to paste.
*(The in-system `ui_kits/command-center/` cards were retired 2026-06-23 once the prototype superseded
them.)*

---

## What changed, at a glance (tavern)

| Token | Before (navy) | After (espresso) |
|---|---|---|
| `--color-bg` | `#111418` | `#14100b` |
| `--color-surface` | `#1c2128` | `#1f1810` |
| `--color-border` | `#2d3748` | `#3a2e20` |
| `--color-accent` | `#d4a76a` | `#e0b06f` (brighter, more presence) |
| `--shadow-md` | `0 4px 12px /.4` | `0 6px 18px /.5` (deeper, warmer) |

The neutral ramp moved from cool blue-grey to warm brown-black across the board; the gold accent was
brightened and given more presence; status/DM-only hues were retuned to sit in the warm palette
while holding their semantic meaning. Full values are in `redesign.tokens.css`.
