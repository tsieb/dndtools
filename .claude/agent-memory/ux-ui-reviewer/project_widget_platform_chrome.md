---
name: widget-platform-chrome-split
description: Unified WidgetView shares body render across CC board + scene canvas, but chrome (title/icon) is surface-owned and drifts
metadata:
  type: project
---

On `feat/unify-widget-platform`, every widget renders its BODY through one shared `WidgetView`
(`apps/gm/src/lib/gui/ux-canvas/widgets/WidgetView.svelte`) on both surfaces. Consistent by
construction: fail-soft placeholder, `--widget-*` token machinery (styleAttr), and
`resolveWidgetConfig` all live in WidgetView, so they match across surfaces.

The drift is in the SURFACE-OWNED CHROME wrapped around WidgetView, not WidgetView itself:
- **CC board** uses `DashboardBlock.svelte` head → shows `blockTitle` (config override → `displayName`).
- **Scene canvas** uses CanvasViewport's built-in `.canvas-tile-head`. ROUND-1 FIXED the canvas head
  via a `tileTypeLabel` prop (`CanvasViewport.svelte:803` → scene passes `displayName`), so the on-canvas
  tile now reads "Active Session". BUT the adjacent scene CARD-LIST title was MISSED: `widgetCard` still
  renders `<strong>{w.type}</strong>` (`scene/[id]/+page.svelte:1329`) = raw "initiative-tracker", even
  though `def` (with `.displayName`) is in scope at line 1318. Same-surface inconsistency; the card is the
  ACCESSIBLE path (canvas world is aria-hidden). Still fails UX-CANVAS-007. One-line fix: `def?.displayName ?? w.type`.

**Why:** raw-`type` head is PRE-EXISTING CanvasViewport code; the branch created the inconsistency by
routing the scene body through WidgetView without aligning the head to displayName. Fix lands in
pre-existing CanvasViewport code.

Other observed cross-surface / shared issues on this branch:
- `onCommand` dispatcher is passed only by the scene CARD invocation, NOT by the CC board invocation
  (`+page.svelte` WidgetView has no onCommand). Templates disable actions when onCommand absent. LATENT
  only: all command-center-placed defs use `builtinEntrypoint` and self-dispatch via runtime context;
  the only onCommand-consuming templates (dice/timer) are SCENE_PLACEMENT-scoped → disjoint sets, zero
  current impact. Becomes a real bug if a template/action widget ever gets command-center placement.
- The `surface` style token (defined for every system widget in
  `packages/core/src/state/widget-package-state.ts` defaultWidgetStyle) is applied as `--widget-surface`
  on both surfaces but consumed ONLY by `CustomWidgetFrame.svelte`. No template/builtin uses it →
  the "Widget background surface" color control in `WidgetCustomizePanel.svelte` is a silent no-op for
  every system/CC widget.

**Surface scoping:** scene widgets = `SCENE_PLACEMENT`; CC widgets = `COMMAND_CENTER_PLACEMENT`
(`libraryListed:false`). Default sets are DISJOINT — the same widget type does not literally appear on
both surfaces by default, so "drift" here is about the shared platform's chrome/wiring symmetry, not a
single instance shown twice.

Related: [[ux-requirements-map]]
