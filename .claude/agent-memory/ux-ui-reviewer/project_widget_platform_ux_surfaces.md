---
name: widget-platform-ux-surfaces
description: UX gotchas + req mappings for the unified widget platform (scene canvas + Command Center board) on feat/unify-widget-platform
metadata:
  type: project
---

The `feat/unify-widget-platform` branch routes EVERY widget through one `WidgetView` render path
(`apps/gm/src/lib/gui/ux-canvas/widgets/WidgetView.svelte` → `widget-registry.ts` → template/builtin/custom).

**Surface → spec mapping:** scene canvas + map widgets are governed by `04-canvas-scene-widgets.md`
(UX-CANVAS, esp. -007 widget chrome/binding states, -008 binding affordances, -011 player-view preview)
and `06-maps.md` (UX-MAP, esp. -010/-018 POI + deep-link, -007 hidden-layer redaction).

**Scene-canvas inert-body pattern (deliberate, do NOT flag as "missing interactivity"):**
`scene/[id]/+page.svelte` passes a `tileBody` snippet to `CanvasViewport`; it renders an inert,
`pointer-events:none` `WidgetView surface="scene"` inside a tile. `CanvasViewport` sets
`aria-hidden='true'` on `.canvas-world` whenever `tileContent` is absent (line ~729) — the scene uses
`tileBody`, not `tileContent`, so the world is aria-hidden. Interactive WidgetView lives in the widget
cards + Customize dialog.

**Gotcha — player-view preview body is NOT actor-filtered:** during preview (`previewActive`),
`displayTiles = previewTiles` (correctly visibility-filtered, chrome/title stripped), BUT the `tileBody`
snippet still looks up `rawScene.widgets` and renders `WidgetView` with the RAW config + renderers that
resolve via `runtime.defaultActorId` (the DM). So on-canvas widget BODIES in the "player view" preview
show DM-actor data (e.g. MapWidget reads raw `state.maps.maps[id].regions`). The preview's no-leak
comment only ever covered the tile chrome. Fix: gate `tileBody` on `!previewActive`.

**Round-1 over-corrected the preview gate → blank bodies (UX-CANVAS-011 still PARTIAL).** The gate is now
`{#if !previewActive ...}` inside `tileBody` (`scene/[id]/+page.svelte:1113`). Because `tileBody` is ALWAYS
passed, CanvasViewport's `{:else if tileBody}` branch (`CanvasViewport.svelte:872`) fires during preview and
the `{:else}<p class="canvas-tile-title">` fallback is SHADOWED → the `.canvas-tile-body` is an empty box.
Leak is gone (good) but UX-CANVAS-011's "player-visible widgets render with player-appropriate data" is unmet;
the preview shows titled-but-empty tiles. Root cause: WidgetView + all renderers hardcode `runtime.defaultActorId`,
so there is NO actor-scoped body render. Scene preview DOES know the player (`playerPreviewId`, default
`actor-player`). Real fix = plumb an actor override into WidgetView; interim = render `tile.title` so it isn't blank.

**Compact (mobile) vs board atlas DRIFT — Round-1 polish landed only on the board.** The DM home renders the
active-map controls TWICE: board = `AtlasWidget.svelte`, compact = inline `activeMapSection` snippet in
`+page.svelte:673` (duplication is KNOWN-INTENTIONAL for testid stability). Round-1 made "Project to players"
the PRIMARY CTA on the board (`class="button"`, "Set active map" → `button secondary`) but the compact twin
(`+page.svelte:732/741`) still styles "Set active map" primary and "Project to players" as a plain button —
inverted emphasis on the whole mobile profile. Also board added `title={projectionDisabledHint}` on disabled
Project/Queue; compact has none (and `title` doesn't surface on touch anyway → disabled reason should be a
visible inline hint, not a tooltip). When reviewing CC, always diff the board widget against its compact snippet.

**Deep-link convention:** the Atlas page (`routes/atlas/+page.svelte`) deep-links via `?map=<id>` (and
`&poi=`). Widgets that link to bare `/atlas/` (AtlasWidget thumbnails, MapWidget "Open Atlas") are an
info-scent/navigability gap — named cards that don't open their map. Correct href: `/atlas/?map=${id}`.

**`actor-player` / "Demo Player" is an app-wide demo fixture** (defined in
`lib/canvas-runtime/runtime.svelte.ts`, also hardcoded in `routes/+page.svelte`, `SessionWidget`,
`SessionPrivacyStatus`). Do NOT flag it as scaffolding-leaked-into-prod; it's the deliberate demo data.

**Heading hierarchy:** `dashboard/DashboardBlock.svelte` renders `<h2 class="dash-block-title">` per
CC widget block. Widgets that render their own `<h2>` (e.g. AtlasWidget `<h2>Active map</h2>`) nest an
h2 under an h2 — should be `<h3>`.

**Undo scope:** `UNDOABLE_COMMAND_TYPES` (packages/core/src/lifecycle/command-lifecycle.ts) does NOT
include `scene.configure-widget` or `scene.resize-widget` — Customize-panel edits are not undoable and
do not pollute the history. (Verified; don't claim undo-pollution for those.)

**Round-3 resolution of the preview blank-body:** `scene/[id]/+page.svelte` `tileBody` now renders a
neutral `.canvas-widget-preview` ("Content hidden in preview", icon ◌) when `previewActive`, else the
inert `WidgetView` — no-leak preserved, no longer blank. The card-list title now reads
`def?.displayName ?? w.type` (UX-CANVAS-007 satisfied on the accessible card path).

**Gate blind-spot variant (durable) — preview-only + aria-hidden text escapes BOTH contrast scans.**
The `.canvas-widget-preview` placeholder text uses `--color-text-tertiary` (#6b7280) on the canvas
(#111418/#1c2128) ≈ 3.3–3.8:1, BELOW the 4.5:1 1.4.3 floor for 12px text. It passed the green gate
because (a) it only renders when the DM toggles preview, so the default-state CI scan never sees it, and
(b) it is `aria-hidden`, which excludes it from axe's color-contrast rule. Green ≠ verified here. The
sibling NEW element `.active-map-hint` correctly uses `--color-text-secondary` (#a89888 ≈ 5.8:1) — so
the one-line fix is to align the placeholder to `--color-text-secondary`. Generalize: any element gated
behind a mode toggle or `aria-hidden` can carry a 1.4.3 shortfall past CI — check it manually. (Sibling
of the disabled-by-default blind spot in [[widget-customize-flow]].)
</content>
</invoke>
