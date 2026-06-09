# Completion — UX-CANVAS-viewport-rendering-and-performance

UX workpack status: `complete`

Epic: Canvas Viewport, Rendering, and Performance (phase "03 Canvas and Command Center", P0).
Requirement coverage: `UX-CANVAS-001` (story `UX-CANVAS-001-S01`), `UX-CANVAS-014`
(`UX-CANVAS-014-S01`), `UX-CANVAS-016` (`UX-CANVAS-016-S01`).

## Summary

Built the production, **reusable** spatial canvas viewport that Command Center, Scenes, maps, and
player views will all consume — a clean pan/zoom runtime plus a viewport-control API, not a one-off.
It is the **DOM/CSS render baseline** mandated by the consolidated canvas-renderer gating decision
(`docs/planning/v2/ux/architecture-decisions.md` §4 — *"DEFERRED (final engine) with an accepted
interim default … normal HTML/Svelte/CSS layout … keep a renderer-abstraction boundary so a GPU
backend can replace the DOM baseline without changing widget, binding, or Scene Outline contracts"*;
echoed in `docs/remake-review/ux-requirements/16-ideal-gui-architecture.md` §10.1 item 3 and ADR-014).
No dedicated WebGL/Canvas/Pixi/Konva engine was introduced. The `ViewportController` is the
renderer-abstraction boundary: it computes a single affine transform `{ tx, ty, scale }`; the surface
applies it however it renders.

The render-engine decision was confirmed **resolved** before any runtime code (per the Stop-Condition
gate): it is explicitly recorded in the UX-ARCH completion doc and architecture-decisions §4, so this
epic built on it rather than re-deciding it.

## Demo path / surfaces

Open any Scene to drive the viewport: `/scenes` → create a Scene → open it (`/scene/:id`). The new
**Scene canvas viewport** section (`data-testid="scene-canvas-section"`) renders above the existing
widget management UI on every profile; the existing widget grid / focused-view / Scene Outline are
unchanged.

- **Desktop (expanded):** mouse-wheel zoom-to-pointer, drag-to-pan, full keyboard set, persistent
  bottom-right minimap (160×120) with a draggable viewport rect, always-visible zoom −/+/Fit/1:1
  controls and an editable zoom-percent field.
- **Tablet (medium):** two-finger pinch (zoom about the midpoint) + two-finger/one-finger drag pan
  with inertia; minimap is toggleable via a "Map" button in the controls; same on-screen zoom
  controls.
- **Mobile (compact):** pinch + drag pan with inertia; minimap hidden by default (UX-CANVAS-001
  §Minimap); the on-screen zoom −/+/Fit/1:1 controls and editable zoom field are **always present**,
  so the viewport is never desktop-only.

Reuse: keyboard arrow→direction matching goes through the shared a11y `canvas-keyboard.arrowDirection`
helper; pointer-cancellation (WCAG 2.5.2) reuses `drag-alternative.shouldCommitPointer`; reduced
motion is read from the platform `MotionStore`; zoom-% announcements use the shared `LiveAnnouncer`;
DM-only tiles use the existing design tokens (`--color-dm-only-badge`, `--color-hidden-content-stripe`).

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-CANVAS-001** cursor/pinch-anchored zoom | `viewport.ts` `zoomToScale`/`zoomByFactor` keep the world point under the anchor fixed; wheel in `CanvasViewport.onWheel`; pinch in `gestures.resolvePinch` | `canvas-viewport.test.ts` (anchor invariance), `canvas-gestures.test.ts` (pinch midpoint fixed), e2e zoom-to-pointer via wheel/buttons |
| UX-CANVAS-001 discrete snap stops 10–400% | `ZOOM_STOPS`, `nextZoomStop`/`prevZoomStop`; range 5%–800% via `clampZoom`/`ZOOM_MIN`/`ZOOM_MAX` | `canvas-viewport.test.ts`, e2e `100→150→200→150→100` |
| UX-CANVAS-001 zoom-to-fit / zoom-to-selection (48px pad) | `fitBounds`; controller `zoomToFit`/`zoomToSelection`; key `0`/`Shift+0`; Fit button | `canvas-viewport.test.ts`, `canvas-viewport-controller.test.ts`, e2e key `0` |
| UX-CANVAS-001 minimap (persistent/toggle/hidden) + draggable rect | `CanvasViewport` minimap geometry + `panToWorldPoint`; profile mode in `/scene/[id]/+page.svelte` `minimapMode` | e2e minimap-per-profile |
| UX-CANVAS-001 zoom indicator (editable, preset) + 500ms announce | editable `canvas-zoom-input`; debounced `LiveAnnouncer` announce | e2e zoom field type+Enter |
| UX-CANVAS-001 keyboard (+/−/0/Shift+0/1/2/5, arrows 32/128) | `resolveViewportKey` (via shared `arrowDirection`); controller `handleKey` | `canvas-viewport.test.ts`, `canvas-viewport-controller.test.ts`, e2e keyboard parity |
| UX-CANVAS-001 pan inertia (400ms ease-out, off under reduced-motion) | `gestures.inertiaDisplacement`/`easeOutCubic`; `CanvasViewport.startInertia` gated on `reduced` | `canvas-gestures.test.ts` |
| UX-CANVAS-001 reduced-motion instant snap | durations via `--duration-*` tokens (0ms under `data-motion=reduced`); inertia gated | `motion`-token contract (existing); component `data-reduced-motion` |
| **UX-CANVAS-014** virtualization + 1-viewport bleed | `virtualize.cullToViewport`/`renderRegion`; controller `cull`; `CanvasViewport` renders `visibleTiles` only | `canvas-virtualize.test.ts`, `canvas-viewport-controller.test.ts`, e2e rendered/total readout |
| UX-CANVAS-014 poster-frame on >3 slow frames + calm indicator | `perf.FrameMonitor`/`shouldDegrade`; `canvas-poster-frame` aria-live status; `simulateJank` exerciser | `canvas-perf.test.ts`, e2e simulate-jank flips `data-active` |
| UX-CANVAS-014 acknowledge ≤100ms | `perf.InteractionTracker`; controller `#apply` measures every hot op; diagnostics `canvas-perf-ack` | `canvas-perf.test.ts`, `canvas-viewport-controller.test.ts`, e2e `≤100ms` after pan |
| UX-CANVAS-014 skeleton (layout-matched, no spinner; shimmer off under reduced-motion) | `CanvasViewport` skeleton tiles + `canvas-shimmer` keyframe gated by motion tokens | e2e skeleton toggle |
| UX-CANVAS-014 >150-widget soft warning | `perf.widgetCountWarning`; controller `widgetWarning`; `canvas-widget-warning` banner | `canvas-perf.test.ts`, `canvas-viewport-controller.test.ts` |
| UX-CANVAS-014 performance mode (reduce chrome) | `canvas-perf-mode-toggle` → `data-perf-mode` hides tile chrome | covered in component; e2e toggles present |
| **UX-CANVAS-016** every gesture has a non-gesture + keyboard alternative | pinch↔buttons/keys/field; drag-pan↔arrows/minimap; on-screen controls present on **all** profiles | e2e "on-screen zoom alternative exists on every profile" (desktop + mobile) |
| UX-CANVAS-016 touch targets ≥44×44 | `--touch-target-min` on `.canvas-btn`, zoom field, minimap | e2e boundingBox ≥44 |
| UX-CANVAS-016 pointer cancellation (WCAG 2.5.2) | re-exported `shouldCommitPointer`; pinch/pan release semantics | `canvas-gestures.test.ts` |
| UX-CANVAS-015 `role="application"` + name + roledescription | `CanvasViewport` region; structural path is the Scene Outline | e2e axe scan (no critical/serious) |

## Keyboard + non-gesture alternative evidence (UX-CANVAS-016 acceptance bar)

Every Must-have viewport action is reachable three ways — none is gesture-only, pointer-only, or
desktop-only:

| Action | Keyboard | On-screen (non-gesture) pointer | Gesture |
|---|---|---|---|
| Zoom in/out | `+`/`−` (one stop) | `canvas-zoom-in`/`canvas-zoom-out` buttons; zoom field | wheel / pinch |
| Set absolute zoom | `1`=100%, `2`=200%, `5`=50% | editable `canvas-zoom-input` (type + Enter) | — |
| Zoom to fit / selection | `0` / `Shift+0` | `canvas-zoom-fit` button | — |
| Pan | arrows (32px) / Shift+arrows (128px) | minimap drag; (mouse drag) | one/two-finger drag |
| Navigate overview | arrow pan + Fit | minimap (Enter = fit) | — |

The mobile e2e asserts the zoom controls are present and ≥44px on `mobile-chromium`, proving the
viewport is operable without a pointer-precise minimap and without a hardware keyboard.

## Performance evidence (UX-CANVAS-014)

- **Acknowledge ≤100ms:** every controller hot op wraps the synchronous transform in
  `InteractionTracker`; `canvas-perf-ack` reports the latency and a `✓ ≤100ms` flag. Unit test asserts
  `lastAckMs ≤ 100` and `withinBudget`; e2e asserts the readout shows `≤100ms` after a keyboard pan.
- **Virtualization:** `cullToViewport` renders only viewport+bleed tiles (unit-tested: far tiles
  culled, bleed tiles kept, zoom-out reveals more); e2e shows `rendered / total`.
- **Poster-frame degradation:** `FrameMonitor` enters poster-frame after >3 consecutive >20ms frames
  and recovers on a fast frame (unit-tested); the `Simulate slow frames` diagnostic deterministically
  flips the calm `aria-live` "Canvas rendering, please wait." indicator (e2e).
- **Skeleton / perceived performance:** layout-matched skeleton tiles with token-driven shimmer that
  is suppressed under reduced motion.
- **Soft 150-widget advisory:** non-blocking warning (unit-tested).

## Actor-safety / no-leak evidence

Canvas tiles are built from the actor-FILTERED scene summary and gated by the same DM-only rule the
Scene Outline uses (`/scene/[id]/+page.svelte` `canvasTiles` filters `dm-only` widgets out for any
non-DM viewer), so a player's canvas never renders a DM-only widget; the DM-only badge is a redundant
non-color signal (icon + label + diagonal stripe). The axe scan of the open scene route reports no
critical/serious violations.

## Tests / gates run

- Targeted vitest (canvas math/gesture/perf/controller): `canvas-viewport.test.ts`,
  `canvas-virtualize.test.ts`, `canvas-perf.test.ts`, `canvas-gestures.test.ts`,
  `canvas-viewport-controller.test.ts` — **53 tests, all pass**.
- Full app vitest — **344 tests pass (43 files)** (includes the 5 new canvas test files).
- Playwright `canvas-viewport.spec.ts` — **10 tests pass** (5 × desktop-chromium + 5 ×
  mobile-chromium), including a direct axe scan of the scene route.
- Playwright `route-accessibility.spec.ts` — 8 pass both profiles (Scene route single-h1 intact).
- Playwright `scene-create` / `scene-accessibility` / `scene-outline-no-leak` — pass in isolation on
  both profiles. **One pre-existing, unrelated flake** (`scene-create.spec.ts` "Timer widget
  dispatches its declared command through the core") surfaces only under a combined multi-spec run
  (session-active state leaks between specs); it **passes in isolation** (verified: `1 passed`) and is
  untouched by this epic (additive read-only derives on the scene route; no timer/session/command
  changes).
- `pnpm v2:lint` (boundary) — PASS.
- `pnpm lint` (eslint + nav + tokens + a11y:contrast + audit:repo) — PASS.
- `pnpm docs:validate` — PASS.
- `pnpm a11y:axe` — PASS (16/16, both profiles).
- `svelte-check` — 0 errors (2 advisory `state_referenced_locally` warnings silenced with justified
  `svelte-ignore`; the intentional `role="application"` region keeps justified `svelte-ignore`).
- `pnpm v2:ux-workpack:validate` — PASS (after `complete`).

## Files changed

New — reusable canvas runtime (pure, unit-tested):
- `apps/v2/app/src/lib/canvas-runtime/viewport.ts`
- `apps/v2/app/src/lib/canvas-runtime/virtualize.ts`
- `apps/v2/app/src/lib/canvas-runtime/perf.ts`
- `apps/v2/app/src/lib/canvas-runtime/gestures.ts`
- `apps/v2/app/src/lib/canvas-runtime/viewport-controller.svelte.ts`
- `apps/v2/app/src/lib/canvas-runtime/index.ts`

New — reusable viewport component:
- `apps/v2/app/src/lib/gui/canvas/CanvasViewport.svelte`
- `apps/v2/app/src/lib/gui/canvas/types.ts`

New — tests:
- `apps/v2/app/tests/unit/canvas-viewport.test.ts`
- `apps/v2/app/tests/unit/canvas-virtualize.test.ts`
- `apps/v2/app/tests/unit/canvas-perf.test.ts`
- `apps/v2/app/tests/unit/canvas-gestures.test.ts`
- `apps/v2/app/tests/unit/canvas-viewport-controller.test.ts`
- `apps/v2/app/tests/e2e/canvas-viewport.spec.ts`

Modified — host route (additive spatial canvas section):
- `apps/v2/app/src/routes/scene/[id]/+page.svelte`

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CANVAS-viewport-rendering-and-performance.yaml`

## Known gaps / deferred

- Final render engine remains DEFERRED per architecture-decisions §4 (DOM/CSS baseline shipped behind
  the `ViewportController` abstraction; a GPU backend is a later ADR). 60fps profiling against the
  explicit frame budget is approximated by the live `FrameMonitor` + poster-frame logic rather than a
  CI GPU benchmark.
- Snap/grid, smart guides, marquee select, grouping, rotation, widget chrome, binding affordances,
  templates, and the empty-canvas teaching state are **other** UX-CANVAS requirements (002–013) owned
  by later epics; this epic delivers only the viewport/perf/gesture foundation (001/014/016).
- Poster-frame degradation under genuine sustained jank is exercised via a deterministic diagnostic
  hook; the binding decision logic is unit-tested. The skeleton "data-pending" state is demonstrable
  via a diagnostics toggle because the Processing Core resolves bindings synchronously (no real async
  pending state in this build).

## Git evidence

- Branch: `ux/UX-CANVAS-viewport-rendering-and-performance` (off chain tip
  `ux/UX-SHELL-command-surface-and-shortcuts` @ a444ab6).
- Commit: recorded in the orchestrator handoff (committed after this evidence file + regenerated UX
  state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M docs/planning/v2/ux/epics/UX-CANVAS-viewport-rendering-and-performance.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/canvas-runtime/gestures.ts
?? apps/v2/app/src/lib/canvas-runtime/index.ts
?? apps/v2/app/src/lib/canvas-runtime/perf.ts
?? apps/v2/app/src/lib/canvas-runtime/viewport-controller.svelte.ts
?? apps/v2/app/src/lib/canvas-runtime/viewport.ts
?? apps/v2/app/src/lib/canvas-runtime/virtualize.ts
?? apps/v2/app/src/lib/gui/canvas/CanvasViewport.svelte
?? apps/v2/app/src/lib/gui/canvas/types.ts
?? apps/v2/app/tests/e2e/canvas-viewport.spec.ts
?? apps/v2/app/tests/unit/canvas-gestures.test.ts
?? apps/v2/app/tests/unit/canvas-perf.test.ts
?? apps/v2/app/tests/unit/canvas-viewport-controller.test.ts
?? apps/v2/app/tests/unit/canvas-viewport.test.ts
?? apps/v2/app/tests/unit/canvas-virtualize.test.ts
?? docs/planning/v2/ux/epics/UX-CANVAS-viewport-rendering-and-performance.completion.md
```
