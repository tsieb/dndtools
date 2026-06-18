---
name: project-command-center-board
description: Command Center (/ home, DM) board architecture, UX-CMD id↔component map, and recurring CC UX anti-patterns
metadata:
  type: project
---

The DM home (`apps/gm/src/routes/+page.svelte`) renders TWO profiles from one route:
- **Compact** (`profile.isCompact`): stacked document + `cc-tablist` focused-panel pattern, rendered inline in the route.
- **Desktop/Tablet (non-compact)**: a **spatial mission-control board** — a full pan/zoom `CanvasViewport` whose tiles are `DashboardBlock` frames, each hosting ONE widget via the unified `WidgetView`.

**UX-CMD id ↔ component map (board surface):**
- UX-CMD-003 status strip + UX-CMD-010 phase controls + session workflow → `widgets/SessionWidget.svelte` (block `session`, displayName "Active Session"). Wraps `ux-cmd/SessionStatusStrip` + `ux-cmd/SessionPhaseControls`.
- UX-CMD-004 player-view controller (assign/queue/revoke/preview/push) → `widgets/PlayerViewsWidget.svelte` (block `player-views`). Preview+push modals are route-owned, reached via `widgets/command-center-context.ts`.
- UX-CMD-005 preview / UX-CMD-006 push → route-level `ux-cmd/PlayerViewPreviewModal` + `ux-cmd/HandoutPushFlow`.
- UX-CMD-007 active-map projection → `widgets/AtlasWidget.svelte` (block `atlas`).
- UX-CMD-008 presets/auto-save + UX-CMD-009 widget library → both crammed in `widgets/ToolsWidget.svelte` (block `tools`, displayName "Tools & Layouts").
- UX-ONB getting-started/feature-tier → `widgets/GettingStartedWidget.svelte` → `FirstRun.svelte`.

**Recurring CC anti-patterns to check on every review:**
1. **Glance surfaces are not pinned.** The UX-CMD-003 status strip and UX-CMD-010 phase indicator live INSIDE the `session` board tile on a pan/zoom canvas — the DM can pan/zoom them away. Spec demands a fixed, always-visible strip ("never scrolls or collapses"). No phase/turn indicator exists in the persistent floating chrome (identity / actions / zoom groups only). [[feedback-v2-full-e2e-shared-routes]]
2. **Unconfirmed destructive path.** `SessionWidget` renders a raw 7-state workflow `role=toolbar` that dispatches `session.set-workflow` (incl. `ending`/`archived`) with NO confirmation, sitting right beside the spec-correct confirming `SessionPhaseControls` popover. Redundant + a Principle-8 safety bypass.
3. **Compact-document markup reused as board tiles.** The widget files are relocated compact-stacked `<section><h2>` documents; on the board each tile is a small scrolling box (e.g. `tools` default 400×212) holding multiple `<h2>` sections — visual cramming + flat heading outline + block-title/widget-h2 stutter (e.g. "Player Views" head + "Player views" h2).

**Customize path:** the CC board's customize surface is `CanvasPropertiesPanel.svelte` (Edit Mode → select block → docked right overlay). Full fork analysis + anti-patterns (gray-swatch, incomplete tabs ARIA, oninput/onchange divergence, target sizes) is in [[widget-customize-flow]]. CC-board-specific additions: the panel's `.props-panel{overflow:hidden}` + "never scrolls" design assumed the now-DELETED hand-curated `BLOCK_PROPERTY_SCHEMAS` table; with arbitrary data-driven `definition.configFields` (esp. custom widgets) the `.props-body` (no overflow set) can clip fields out of reach. Customizing content/display requires Edit Mode, during which the live widget body is `inert` + dimmed (0.6) — weak feedback loop.

**Scope tip:** `feat/unify-widget-platform` is largely a *relocation refactor* (inline `boardTile` snippets → `WidgetView` widget files). Verify per-finding with `git diff master` whether UX changed or was relocated unchanged — most big CC issues are pre-existing redesign behavior; the new risk is the data-driven Properties/Customize panel.
