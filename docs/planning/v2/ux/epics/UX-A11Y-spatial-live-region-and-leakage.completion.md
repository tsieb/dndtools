# UX-A11Y-spatial-live-region-and-leakage — Completion

UX workpack status: `complete`

Epic: `UX-A11Y-spatial-live-region-and-leakage` (epic 6 of 46, phase "01 Foundations", P0 — LAST of
Foundations). Branch: `ux/UX-A11Y-spatial-live-region-and-leakage` (off chain tip
`ux/UX-A11Y-interaction-primitives-and-help-compliance`).

Foundational, actor-safety-critical engines for spatial/canvas keyboard access, live-region
announcement patterns, and the DM-only NO-LEAK boundary contract every later route/search/preview/
ARIA/error surface must obey. Five reusable, pure engines were added to the a11y primitives library
(`apps/v2/app/src/lib/gui/a11y/`) alongside the epic-5 primitives, plus a `SceneOutline` component wired
to the Scene editor route as the demonstrable visible-route surface.

## Demo path (Desktop / Tablet / Mobile)

Route: `/scene/:id` (the Scene editor). Create a player-visible Scene from `/scenes`, open it, scroll to
the **Scene outline** panel.

- **Desktop (desktop-chromium / expanded):** The Scene outline lists every widget in layer order as an
  ARIA `listbox` (`tree` when grouped) with roving tabindex — Up/Down move focus, Home/End jump, Enter/
  Space activate (scrolls to + focuses the widget on the canvas and announces it through the shared
  announcer). A search box filters by name; the count (`role=status`) re-announces "N widgets". The DM
  sees a per-item "DM only / Shared / Visible" label. Add a DM-only widget, then switch the header
  "View as" select to a player: the DM-only widget is **absent** from the outline DOM (not
  `display:none`), the count drops, and no DM-only label or binding id remains.
- **Tablet (comfortable density):** Same outline panel and ARIA; ≥44px touch targets on the item rows
  and search field (`--touch-target-min`). Hardware-keyboard model identical to Desktop.
- **Mobile (mobile-chromium / Pixel 5, compact):** The outline is profile-independent (it is the
  structural access path, not the dense grid), so it renders and the no-leak boundary holds identically;
  activating an item moves the compact focused-view index to that widget. Verified on mobile-chromium.

## Requirement coverage (every id traced to implementation + tests)

- **UX-A11Y-003 (canvas keyboard model: selection, move, resize, link):**
  `a11y/canvas-keyboard.ts` — `nearestInDirection` (spatial nearest-neighbour), `layerOrderIndex`
  (Tab/Home/End), `initialCanvasState`/`enterActionMode`/`exitActionMode`/`focusWidget`/
  `extendSelection`/`selectAll` (mode + multi-select state machine), `keyboardMove`/`keyboardResize`
  (+ `buildCanvasMoveCommand`/`buildResizeCommand`, delegating geometry to the shared
  `drag-alternative` so keyboard == drag, UX-A11Y-013), the `beginLink`/`selectLinkTarget`/
  `completeLink`/`cancelLink` link operation, and `move/resize/link/empty-canvas/position`
  announcements. Tests: `a11y-canvas-keyboard.test.ts` (24 cases). Operates only on the viewer-filtered
  widget set (no-leak).
- **UX-A11Y-004 (Scene Outline: structural access):** `a11y/scene-outline.ts` (`buildSceneOutline` →
  visibility-filtered, layer-ordered model with ARIA `posinset`/`setsize`, listbox/tree role, count
  label, type/search filtering, empty vs filtered-empty) + `SceneOutline.svelte` (roving tabindex,
  visibility-safe names, live count + activation announcement) wired into
  `routes/scene/[id]/+page.svelte`. Tests: `a11y-scene-outline.test.ts`,
  `scene-outline-no-leak.spec.ts` (keyboard nav + filter, both profiles).
- **UX-A11Y-005 (Maps: non-visual access + fog safety):** `a11y/map-summary.ts` —
  `mapAccessibleLabel` (concise, content-free map label), `buildMapSummary` (visibility-filtered POI/
  route/area lists computed from the player-visible layer; AC1), `fogChangeAnnouncement` (reveal named
  only when now-visible; HIDE never announced to a player — AC3), `poiActivationAnnouncement`. Tests:
  `a11y-map-summary.test.ts` (incl. AC1/AC2/AC3 + leak scan). Engine-level for this Foundations epic;
  route wiring is owned by the phase-06 `UX-MAP-*` epics (see Known gaps).
- **UX-A11Y-006 (Live combat: graduated announcements without leakage):** `a11y/combat-announcer.ts` —
  `combatAnnouncement` (politeness mapping: polite for turn/HP/condition/round, assertive for
  incapacitation + DM reset; suppresses hidden combatants; strips HP values when HP not visible —
  AC1/AC2/AC3), `batchAffected` + `CombatAnnouncerController` (300ms debounce → single "N combatants
  affected" — AC4), on the shared `LiveAnnouncer` (no duplicate live regions — AC5, axe-clean). Tests:
  `a11y-combat-announcer.test.ts` (incl. debounce with fake timers + leak scan). Engine-level; the
  combat surface wiring is owned by the phase-05 `UX-SESSION-*` epics (the polite/assertive live regions
  it writes already exist in the shell and stay axe-clean).
- **UX-A11Y-008 (Visibility boundary in ARIA — the NO-LEAK contract):** `a11y/visibility-boundary.ts`
  — the foundational guard: `Viewer`, `VisibilityClassification`, fail-closed `normalizeVisibility`,
  `isVisibleToViewer`, `filterVisibleForViewer` (the choke-point every engine calls FIRST so a hidden
  item is absent, not `display:none`), `accessibleNameForViewer` (name computed only for a visible
  item), `hiddenCountForViewer` (DM diagnostics only), and the negative guard
  `findLeakedTerms`/`assertNoLeak`. Every other engine builds its actor-facing output through this.
  Tests: `a11y-visibility-boundary.test.ts` (incl. the negative test proving a leak WOULD be caught),
  plus leak scans in the outline/map/combat tests, plus `scene-outline-no-leak.spec.ts` proving a player
  never sees a DM-only widget on a live route (both profiles).

## NO-LEAK contract shipped + proof

- **What:** a single GUI-layer boundary (`visibility-boundary.ts`) that re-applies the core's
  `dm-only`/`player-visible`/`shared` vocabulary, fails closed on absent/unknown visibility, and is the
  mandatory first step in every a11y engine. DM-only content can therefore never reach a player/observer
  accessible name, description, alt text, live-region announcement, spatial-nav target, Scene Outline
  item, map summary item, search result, preview, or skeleton — the item is removed entirely.
- **Negative test (a leak would be caught):** `a11y-visibility-boundary.test.ts` →
  `assertNoLeak('Area hidden: The Guard Post', secrets)` throws naming the offending DM-only term and
  channel; `findLeakedTerms` detects a case-insensitive substring leak. Each engine test also scans its
  full player-facing output (`JSON.stringify(model)` / announcement text) for the session's DM-only
  names and asserts zero hits. The e2e proves it on a real route across both profiles.

## Tests run (pass/fail)

- `pnpm --filter @dndtools/v2-core typecheck` — PASS. `pnpm --filter @dndtools/v2-app typecheck`
  (svelte-check) — PASS (0 errors).
- `pnpm lint` — PASS (eslint + nav-layer + token-compliance + a11y:contrast + audit:repo).
- `pnpm v2:lint` (boundary) — PASS. `pnpm docs:validate` — PASS.
- `pnpm --filter @dndtools/v2-app exec vitest run tests/unit` — PASS (34 files, 262 tests), incl. 5 new
  engine test files (70 new cases).
- `pnpm a11y:axe` — PASS (14/14: 7 routes × desktop-chromium + mobile-chromium). `pnpm a11y:report` —
  PASS (0 critical, 0 serious, 0 blocking, 0 approved known violations; register still empty; 2 moderate
  pre-existing/non-blocking).
- `pnpm --filter @dndtools/v2-app exec playwright test tests/e2e/scene-outline-no-leak.spec.ts
  --project=desktop-chromium --project=mobile-chromium` — PASS (4/4).
- Scene-route regression (`scene-accessibility`, `scene-create`, `platform-profiles`, `widget-library`,
  both profiles) — PASS (22 passed, 10 pre-existing skips).
- FULL e2e suite, both profiles (route touched) — PASS (559 passed, 21 pre-existing skips, 0 failed).
- `pnpm v2:ux-workpack:validate` — PASS (after `complete`).

## Files changed

Code (engines): `apps/v2/app/src/lib/gui/a11y/visibility-boundary.ts`, `canvas-keyboard.ts`,
`scene-outline.ts`, `map-summary.ts`, `combat-announcer.ts`; component
`apps/v2/app/src/lib/gui/a11y/SceneOutline.svelte`; barrel `apps/v2/app/src/lib/gui/a11y/index.ts` (M);
route `apps/v2/app/src/routes/scene/[id]/+page.svelte` (M — Scene outline panel + per-widget visibility
control).
Tests: `apps/v2/app/tests/unit/a11y-visibility-boundary.test.ts`,
`apps/v2/app/tests/unit/a11y-canvas-keyboard.test.ts`,
`apps/v2/app/tests/unit/a11y-scene-outline.test.ts`,
`apps/v2/app/tests/unit/a11y-map-summary.test.ts`,
`apps/v2/app/tests/unit/a11y-combat-announcer.test.ts`;
`apps/v2/app/tests/e2e/scene-outline-no-leak.spec.ts`.
Generated UX planning (via `set-status`/`complete`): `docs/planning/v2/ux/workpack-state.yaml`,
`status.yaml`, `epics/UX-A11Y-spatial-live-region-and-leakage.yaml` and this completion file.

## Actor roles tested

DM (sees all), Player (`actor-player` — no DM-only widget/POI/combatant), Observer (`actor-observer` —
treated as non-DM; `shared` only when delivered to it). Unknown/unidentified viewer fails closed to the
most restrictive non-DM path.

## Known gaps / deferred (with reason)

- **Map summary + combat announcer route wiring** is deferred to the surface epics that own those routes
  (`UX-MAP-pois-fog-projection-combat-and-embeds`, `UX-SESSION-*`). This is a Foundations epic: it ships
  the fully-tested engines those epics consume. The combat live regions already exist in the shell and
  remain axe-clean; the map summary engine is proven by unit tests incl. fog AC1/AC2/AC3.
- **Per-widget visibility model:** the core `WidgetInstance` has no per-widget visibility field yet, so
  the Scene outline classifies each widget from `configuration.visibility` (falling back to the Scene's
  own visibility). This is a forward-compatible GUI mapping; when the canvas epics add a first-class
  widget-visibility field, the outline reads it via the same `OutlineWidgetInput.visibility` contract.
- **Canvas spatial keyboard model UI** (roving focus ring / action mode on the live canvas) is engine +
  unit-test complete here; binding it to the rendered canvas widgets is owned by
  `UX-CANVAS-widget-manipulation-and-outline` (phase 03), which will consume `canvas-keyboard.ts`.
- `/scene/:id` is not in the fixed `a11y-axe-gate` route set (which uses static paths); the outline's
  ARIA is standard listbox/tree/option + `role=status` reusing audited primitives and is validated by
  the e2e (roles, roving, count) and unit tests.

## Git evidence

Branch: `ux/UX-A11Y-spatial-live-region-and-leakage`. Commit: created after this file +
`pnpm v2:ux-workpack:complete` regeneration (hash in final report). `git status --short` at completion
(pre-commit, staged):

```
A  apps/v2/app/src/lib/gui/a11y/SceneOutline.svelte
A  apps/v2/app/src/lib/gui/a11y/canvas-keyboard.ts
A  apps/v2/app/src/lib/gui/a11y/combat-announcer.ts
M  apps/v2/app/src/lib/gui/a11y/index.ts
A  apps/v2/app/src/lib/gui/a11y/map-summary.ts
A  apps/v2/app/src/lib/gui/a11y/scene-outline.ts
A  apps/v2/app/src/lib/gui/a11y/visibility-boundary.ts
M  apps/v2/app/src/routes/scene/[id]/+page.svelte
A  apps/v2/app/tests/e2e/scene-outline-no-leak.spec.ts
A  apps/v2/app/tests/unit/a11y-canvas-keyboard.test.ts
A  apps/v2/app/tests/unit/a11y-combat-announcer.test.ts
A  apps/v2/app/tests/unit/a11y-map-summary.test.ts
A  apps/v2/app/tests/unit/a11y-scene-outline.test.ts
A  apps/v2/app/tests/unit/a11y-visibility-boundary.test.ts
M  docs/planning/v2/ux/epics/UX-A11Y-spatial-live-region-and-leakage.yaml
M  docs/planning/v2/ux/status.yaml
M  docs/planning/v2/ux/workpack-state.yaml
```

(The `complete` command additionally regenerates the planning YAML and adds this `.completion.md`; the
final committed `git status --short` is empty — see final report.)
