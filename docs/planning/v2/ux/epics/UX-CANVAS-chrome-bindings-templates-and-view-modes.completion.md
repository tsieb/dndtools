# Completion — UX-CANVAS-chrome-bindings-templates-and-view-modes

UX workpack status: `complete`

Epic: Widget Chrome, Bindings, Templates, and View Modes (phase "03 Canvas and Command Center", P0).
Requirement coverage: `UX-CANVAS-007` (`UX-CANVAS-007-S01`), `UX-CANVAS-008` (`UX-CANVAS-008-S01`),
`UX-CANVAS-010` (`UX-CANVAS-010-S01`), `UX-CANVAS-011` (`UX-CANVAS-011-S01`), `UX-CANVAS-013`
(`UX-CANVAS-013-S01`).

## Summary

Completed the reusable widget anatomy and the trustworthy DM/player boundary on top of the existing
editor layer (`UX-CANVAS-widget-manipulation-and-outline`) and the DOM/CSS viewport runtime — without
swapping the render engine (DEFERRED per architecture-decisions §4 / ADR-014 / doc16 §10.1; no
WebGL/Canvas/Pixi/Konva introduced).

Added five pure, unit-tested models in `apps/v2/app/src/lib/gui/ux-canvas/` —
`widget-chrome` (binding-state derivation + the SAFE entity-id choke point + visibility/collapse copy),
`binding-inspector` (entity search/filter + binding-type catalogue + binding builder),
`canvas-templates` (built-in starter recipes + user-template library + missing-binding banner),
`player-view-preview` (preview viewer + the visibility-boundary-backed preview filter), and
`empty-canvas` (teaching-state content) — plus five accessible Svelte surfaces
(`WidgetChromePanel`, `BindingInspector`, `CanvasTemplatesDialog`, `PlayerViewPreviewBanner`,
`EmptyCanvasState`). The shared `CanvasViewport` gained additive widget chrome (collapse chevron, `⋯`
actions, player/DM visibility badges, the chain-link binding indicator, a missing-binding placeholder
with a Rebind action, a Show-bindings overlay, and a teaching empty-state slot). The
`CanvasManipulationController` gained undoable `setVisibility`/`toggleVisibility`/`toggleCollapse`/
`bind`/`unbind` ops, each dispatching the SAME `scene.configure-widget` command the host would, so the
processing core stays the single source of truth.

The DM/player boundary is enforced by a single no-leak choke point (`safeBindingEntityId`): a bound
entity id reaches a tile title, binding badge, outline name, or chrome panel only when the viewer is the
DM or the Processing Core already resolved the binding as `available`/`degraded` for that actor. A
player-visible widget bound to a player-hidden field therefore shows the player an explicit "hidden"
placeholder and never the entity id. The player-view preview filters the DM's already-loaded data
through the same `visibility-boundary` predicate the real player canvas uses (no second data fetch, no
divergent code path).

## Demo path / surfaces

`/scenes` → create a player-visible Scene → open it (`/scene/:id`).

- **UX-CANVAS-007 chrome:** placing a widget selects it; the `WidgetChromePanel` (a labelled
  `role="group"` "[widget] actions") exposes Show/Hide-to-players, Collapse/Expand, and Bind-to-entity.
  Each tile renders muted chrome that brightens on hover/select (FigJam-style), a non-colour visibility
  badge ("DM Only" striped pill / "Players" eye pill), a collapse chevron, a `⋯` trigger, and a
  chain-link indicator; a missing binding shows a "Binding missing" placeholder with a Rebind action.
- **UX-CANVAS-008 bindings:** the `⋯`/"Bind to entity…" path opens the `BindingInspector` — search a
  DM-scoped entity list, pick a declared binding type, confirm; the chain-link reflects
  active/missing/conflicted/hidden; "Show bindings" overlays each binding label on the canvas.
- **UX-CANVAS-010 templates:** the canvas "Templates" button opens a save-as-template form + a unified
  library of read-only "Built-in" starters (Combat Session / Prep Board / Player Handout Canvas) and the
  DM's saved templates; instantiating opens a brand-new canvas (never overwriting the current one); a
  `role="alert"` banner reports any unresolved bindings.
- **UX-CANVAS-011 view modes:** the visibility badge + chrome toggle change a widget's audience in ≤2
  interactions; "Preview player view" / `Shift+P` enters a read-only overlay (orange `role="alert"`
  banner, player selector, editing suspended) showing only the chosen player's actor-filtered tiles;
  `Shift+P`/Esc/Exit leaves.
- **UX-CANVAS-013 empty state:** an empty canvas shows an atmospheric headline + "Add your first widget"
  CTA (opens the library), secondary hints (dropped on compact), and a keyboard hint bar; it disappears
  the moment the first widget is placed.

Platform parity: Desktop (full keyboard: `B` binding panel, `C` collapse, `Shift+P` preview, plus
pointer chrome), Tablet/medium (the same accessible panel + dialog surfaces, touch targets ≥44 px),
Mobile/compact (every chrome/binding/visibility/template/preview action reachable through the chrome
panel, inspector, templates dialog, and command bar — none gesture-only or desktop-only; verified on
`mobile-chromium`).

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-CANVAS-007** widget chrome + anatomy (muted-until-active chrome, DM-only + player badges non-colour, collapse, `⋯` actions, chain-link, missing→placeholder+Rebind) | `widget-chrome.ts` (`bindingState`/`bindingChrome`/`visibilityBadge`/`collapseToggle`/`isCollapsed`), `CanvasViewport.svelte` tile chrome, `WidgetChromePanel.svelte`, controller `toggleCollapse` | `ux-canvas-widget-chrome.test.ts`, `ux-canvas-chrome-controller.test.ts`; e2e "widget chrome…" + "missing binding placeholder + Rebind…" |
| **UX-CANVAS-008** data-binding affordances (discrete Bind-to-entity, binding panel, status states, Show-bindings overlay) | `binding-inspector.ts` (`filterEntities`/`bindingTypesFor`/`buildBinding`/`currentBindingSummary`), `BindingInspector.svelte`, controller `bind`/`unbind` + `#bindingCmd`, `CanvasViewport` chain-link + chip + `showBindings` | `ux-canvas-binding-inspector.test.ts`, `ux-canvas-chrome-controller.test.ts`; e2e "widget chrome: bind via inspector…" |
| **UX-CANVAS-010** templates: save + recall (built-in starters + user templates, instant recall without overwriting, missing-binding banner, Built-in badge no-delete) | `canvas-templates.ts` (`BUILT_IN_TEMPLATES`/`buildTemplateLibrary`/`builtInById`/`missingBindingBanner`), `CanvasTemplatesDialog.svelte`, route `saveTemplateNamed`/`instantiateTemplate` (`scene.save-template`/`scene.instantiate-template`/built-in `scene.create`+`scene.add-widget`) | `ux-canvas-templates.test.ts`; e2e "templates: built-in library + save + instantiate…" |
| **UX-CANVAS-011** DM/player view (non-colour visibility states, ≤2-interaction change, read-only `Shift+P` preview + banner + player selector) | `widget-chrome.ts` `visibilityToggle`/`visibilityBadge`, `player-view-preview.ts` (`previewViewer`/`previewVisible`/`previewBannerText`), `PlayerViewPreviewBanner.svelte`, controller `setVisibility`/`toggleVisibility`, route `enterPreview`/`exitPreview`/`previewTiles` | `ux-canvas-preview.test.ts`, `ux-canvas-widget-chrome.test.ts`, `ux-canvas-chrome-controller.test.ts`; e2e "view modes: visibility toggle + read-only player-view preview" |
| **UX-CANVAS-013** empty-canvas teaching state (headline + CTA, secondary hints dropped on compact, keyboard bar, SR announcement, vanishes on first widget) | `empty-canvas.ts` `emptyCanvasContent`, `EmptyCanvasState.svelte`, `CanvasViewport` `emptyState` slot | `ux-canvas-empty.test.ts`; e2e "empty-canvas teaching state appears…" |

## Actor-safety / no-leak evidence

The single choke point is `widget-chrome.ts › safeBindingEntityId`: every chrome surface that could
name a bound entity (tile title, binding badge/chip, outline name, chrome panel) routes through it. A
DM sees ids; a non-DM sees one only when the Core's per-actor resolution returned the widget
`available`/`degraded`. Unit tests assert that `hidden`/`missing`/`conflicted`/`unbound` resolutions
withhold the id from a player/observer (`ux-canvas-widget-chrome.test.ts`).

The route now derives tile titles, the manipulation labels, AND the Scene Outline names from this choke
point (replacing the previous raw `binding.source.entityId`), closing a latent leak where a
player-visible widget bound to a DM-only entity would have shown that entity id to a player. The
player-view preview reuses `visibility-boundary.isVisibleToViewer`, so the preview can never reveal a
`dm-only` widget or a `shared` widget not delivered to the previewed player, and previews never run
"as DM".

E2E `actor no-leak` (both profiles) proves it end-to-end: a DM creates (a) a **player-visible** note
bound to `forbidden-vault` with a player-hidden field and (b) a **dm-only** map bound to
`forbidden-vault`. As DM both render and `forbidden-vault` is present in the DM's own view; after
switching the rendered actor to a player the canvas command bar, chrome panel, and selection toolbar are
gone, only the player-visible note renders (the dm-only map is absent), the outline reports "1 widget",
and `forbidden-vault` appears nowhere in the scene editor. The axe scan of the chrome/binding route
reports no critical/serious violations.

## Tests / gates run

- Targeted vitest (the 6 new `ux-canvas-*` specs + the updated controller spec) — **49 tests pass (7 files)**.
- Full app vitest — **453 tests pass (56 files)** (includes the new files).
- Core vitest — **2849 tests pass (182 files)** (unchanged; sanity).
- `pnpm v2:typecheck` (core `tsc` + app `svelte-check`) — **0 errors, 0 warnings (4678 files)**.
- `pnpm lint` (eslint + `lint:navigation` [132 files] + `lint:tokens` [132 files] + `a11y:contrast`
  [79 pair checks × 5 themes + 4 forced-colors] + `audit:repo` [5 tests]) — **PASS**.
- `pnpm docs:validate` — **PASS**.
- `pnpm a11y:axe` — **PASS (16/16, both profiles)** against the empty known-violations register.
- Playwright `canvas-chrome-bindings.spec.ts` — **14 pass** (7 × desktop-chromium + 7 × mobile-chromium),
  including the actor no-leak boundary and an axe scan.
- Full Playwright suite (both profiles) — **661 passed, 31 skipped, 0 failures**. (One first-pass
  flake on `command-palette-nav` NAV-010 under full parallel load passed in isolation and on re-run; it
  is navigation-only and untouched by this epic. The two documented pre-existing flakes —
  `character-creation-and-drafts` CHAR-002 mobile and `scene-create` Timer under combined runs — did not
  surface.)
- `pnpm v2:ux-workpack:validate` — **PASS** (after `complete`; no generated-file drift).

## Files changed

New — pure models (`apps/v2/app/src/lib/gui/ux-canvas/`):
- `widget-chrome.ts`, `binding-inspector.ts`, `canvas-templates.ts`, `player-view-preview.ts`,
  `empty-canvas.ts`

New — surfaces (`apps/v2/app/src/lib/gui/ux-canvas/`):
- `WidgetChromePanel.svelte`, `BindingInspector.svelte`, `CanvasTemplatesDialog.svelte`,
  `PlayerViewPreviewBanner.svelte`, `EmptyCanvasState.svelte`

New — tests:
- `apps/v2/app/tests/unit/ux-canvas-widget-chrome.test.ts`, `ux-canvas-binding-inspector.test.ts`,
  `ux-canvas-templates.test.ts`, `ux-canvas-preview.test.ts`, `ux-canvas-empty.test.ts`,
  `ux-canvas-chrome-controller.test.ts`
- `apps/v2/app/tests/e2e/canvas-chrome-bindings.spec.ts`

Modified:
- `apps/v2/app/src/lib/gui/ux-canvas/index.ts` (barrel exports for the new models)
- `apps/v2/app/src/lib/gui/ux-canvas/manipulation-controller.svelte.ts` (visibility/collapse/bind/unbind
  ops + binding command builder; `ManipWidget` gains `visibility`/`collapsed`/`binding`/`bindingState`)
- `apps/v2/app/src/lib/gui/canvas/CanvasViewport.svelte` (additive tile chrome, badges, chain-link,
  Rebind, Show-bindings overlay, empty-state slot, chrome callbacks)
- `apps/v2/app/src/lib/gui/canvas/types.ts` (`CanvasTile` gains `collapsed` + `binding`)
- `apps/v2/app/src/routes/scene/[id]/+page.svelte` (chrome/binding/template/preview/empty integration;
  safe binding labels for tiles + outline + manipulation; `Shift+P`/`B`/`C` keys)
- `apps/v2/app/tests/unit/ux-canvas-controller.test.ts` (widget factory carries the new `ManipWidget`
  fields)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CANVAS-chrome-bindings-templates-and-view-modes.yaml`

## Known gaps / deferred

- **Delete template:** no core `scene.delete` command exists, so the templates library offers no delete
  (built-ins require none per UX-CANVAS-010 §System templates). A core delete-scene command is the
  prerequisite and is out of this UX epic's scope.
- **Proximity-reveal binding anchors / bezier curves** (UX-CANVAS-008 §Proximity anchors) are the
  gesture-FIRST affordance; this epic ships the WCAG-compliant discrete inspector (required path) and a
  DOM/CSS "Show bindings" label overlay rather than drawn bezier curves (the engine is DEFERRED).
- **Inline rename** of the widget name (UX-CANVAS-007 §Widget name double-click) is not wired; the chrome
  panel covers visibility/collapse/bind/settings. Rename storing `configuration.title` is a follow-up.
- **Preview data fidelity:** preview tiles strip binding chrome and entity ids (players see clean
  widgets); a previewed player whose own per-actor binding resolution differs is rendered conservatively
  (no id) rather than with that player's exact resolved values — safe, and faithful to "chrome hidden on
  the player canvas".
- Final render engine remains DEFERRED per architecture-decisions §4 (DOM/CSS baseline behind the
  `ViewportController`); this epic adds no GPU backend.

## Git evidence

- Branch: `ux/UX-CANVAS-chrome-bindings-templates-and-view-modes` (off chain tip
  `ux/UX-CANVAS-widget-manipulation-and-outline` @ `34baf30`).
- Commit: recorded in the orchestrator handoff (committed after this evidence file + regenerated UX
  state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/v2/app/src/lib/gui/canvas/CanvasViewport.svelte
 M apps/v2/app/src/lib/gui/canvas/types.ts
 M apps/v2/app/src/lib/gui/ux-canvas/index.ts
 M apps/v2/app/src/lib/gui/ux-canvas/manipulation-controller.svelte.ts
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M apps/v2/app/tests/unit/ux-canvas-controller.test.ts
 M docs/planning/v2/ux/epics/UX-CANVAS-chrome-bindings-templates-and-view-modes.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/ux-canvas/BindingInspector.svelte
?? apps/v2/app/src/lib/gui/ux-canvas/CanvasTemplatesDialog.svelte
?? apps/v2/app/src/lib/gui/ux-canvas/EmptyCanvasState.svelte
?? apps/v2/app/src/lib/gui/ux-canvas/PlayerViewPreviewBanner.svelte
?? apps/v2/app/src/lib/gui/ux-canvas/WidgetChromePanel.svelte
?? apps/v2/app/src/lib/gui/ux-canvas/binding-inspector.ts
?? apps/v2/app/src/lib/gui/ux-canvas/canvas-templates.ts
?? apps/v2/app/src/lib/gui/ux-canvas/empty-canvas.ts
?? apps/v2/app/src/lib/gui/ux-canvas/player-view-preview.ts
?? apps/v2/app/src/lib/gui/ux-canvas/widget-chrome.ts
?? apps/v2/app/tests/e2e/canvas-chrome-bindings.spec.ts
?? apps/v2/app/tests/unit/ux-canvas-binding-inspector.test.ts
?? apps/v2/app/tests/unit/ux-canvas-chrome-controller.test.ts
?? apps/v2/app/tests/unit/ux-canvas-empty.test.ts
?? apps/v2/app/tests/unit/ux-canvas-preview.test.ts
?? apps/v2/app/tests/unit/ux-canvas-templates.test.ts
?? apps/v2/app/tests/unit/ux-canvas-widget-chrome.test.ts
?? docs/planning/v2/ux/epics/UX-CANVAS-chrome-bindings-templates-and-view-modes.completion.md
```
