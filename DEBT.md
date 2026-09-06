# Technical Debt Register

This file is the canonical debt register for long-lived refactors and deferred architectural work.

Last reviewed: 2026-07-10

## Entry Requirements

Each debt item must include:

- `ID`: stable identifier (for example `DEBT-2026-001`)
- `Severity`: `critical`, `high`, `medium`, or `low`
- `Impact`: concrete risk if deferred
- `Owner`: accountable maintainer
- `Resolution Window`: target quarter/date range
- `Targets`: concrete files/modules
- `Status`: `open`, `in_progress`, or `resolved`

## Active Debt Items

### DEBT-2026-001 — React app lacks a platform-preferences / capability layer

- `Severity`: medium
- `Impact`: The React GM app's GUI surface reads platform primitives (`localStorage`,
  `matchMedia`, `navigator.onLine`, `crypto.randomUUID`) directly instead of routing them through
  a typed platform layer (the analogue of the retired Svelte app's `src/lib/platform`). Each site
  is allow-listed in `apps/gm-react/platform-access-exceptions.json` (PLAT-006/012), so the
  boundary is explicit and owned, but the accesses remain scattered across GUI files.
- `Owner`: platform
- `Resolution Window`: 2026 Q3
- `Targets`: `apps/gm-react/src/app/AppShell.tsx` (matchMedia), `apps/gm-react/src/app/Onboarding.tsx`,
  `apps/gm-react/src/screens/{Settings,Upgrade}.tsx` (localStorage + navigator),
  `apps/gm-react/src/screens/{Board,SceneEditor}.tsx` (crypto.randomUUID idempotency keys).
- `Status`: open

### DEBT-2026-002 — React app carries `any` in runtime/view-model seams

- `Severity`: low
- `Impact`: ~128 `@typescript-eslint/no-explicit-any` sites remain from the design-package port.
  They lint as warnings (not errors), so they do not block the gate, but they weaken type safety
  at the runtime/dispatch and view-model boundaries.
- `Owner`: platform
- `Resolution Window`: 2026 Q4
- `Targets`: `apps/gm-react/src/**` (notably `Settings.tsx`, `Upgrade.tsx`, runtime + net view-models).
- `Status`: resolved (2026-09-06, RC-ENG-4.1). `runtime/*`, `net/*`, `screens/settings/*` and
  `Upgrade.tsx` had already come clean through the STB-2 splits; this pass took the app from 72
  sites to 11, all of them inside `app/compendium/*` (the Open5e external-JSON projector and its
  test), which is RC-SYS-2.5's file. The bulk was DS form controls: the `.jsx` components are typed
  through a facade whose props are `unknown`, so every `onChange` handler had to annotate its own
  parameter and reached for `any`. `ds/index.d.ts` now publishes `DSChangeEvent`,
  `DSKeyboardEvent` and `DSBadgeStatus` for that seam, and the dispatch seams
  (`CharacterSheet.tsx`, `sheet/useAdvancementEditor.ts`, `screens/player/shared.ts`) take a real
  `CoreCommand`.

### DEBT-2026-003 — Port the Svelte E2E corpus to the React app

- `Severity`: high
- `Impact`: The archived Svelte app carried ~88 Playwright e2e specs across every surface. The React
  promotion ports the critical-path specs (collab, sync, canvas, permissions) plus the axe gate; the
  remaining surface coverage (content, maps, sessions, onboarding, navigation) is not yet ported, so
  regressions in those surfaces are caught only by the lighter `verify-*` smoke scripts.
- `Owner`: platform
- `Resolution Window`: 2026 Q3
- `Targets`: `apps/gm-react/tests/e2e/` (port from `archive/gm-svelte/tests/e2e/`).
- `Status`: largely resolved (2026-07-11). The e2e-readiness pass added 14 new specs / 94 tests over
  the previously-thin surfaces — content (knowledge/campaign/graph), shell (command-palette,
  backup-restore, upgrade, join), and every new feature (ai-assistant, co-dm, wiki, scene-cards,
  audio-presets, equipment, custom-types). The suite is now 20 specs / 156 tests on both profiles.
  Residual: onboarding-completion and a dedicated navigation/nav-profile spec are still light.

### DEBT-2026-005 — Preview ("view as") tooling has minor honest-but-confusing edges

- `Severity`: low
- `Impact`: Three non-blocking preview-mode UX warts surfaced while authoring the e2e suite; none is a
  correctness or data bug (each is honest/fail-closed): (a) `SceneRuntime.dispatch()` globally rejects
  writes while previewing, but when previewing as a SPECIFIC owning player the Player sheet's
  Equipment/Currency manage controls still render actionable — a click yields the generic
  preview-read-only toast rather than the controls being hidden/disabled; (b) the generic "view as
  player" (zero-grant preview actor) shows "No character yet" on `/player` because that actor owns no
  PC; (c) `enterPreview({role:'co-dm'})` does not unlock the `/play` elevated tier because
  `PlayerView` hardcodes `viewer = PLAYER_ACTOR_ID` — the tier is role-driven (a real co-dm seat
  unlocks it, which works) and there is no ViewAsControl on `/play`, so the preview seam simply
  doesn't re-point that surface's viewer. Consider hiding manage controls in read-only preview,
  and deciding whether `/play` should honor a co-dm preview actor.
- `Owner`: platform
- `Resolution Window`: 2026 Q4
- `Targets`: `apps/gm-react/src/screens/player/`, `apps/gm-react/src/screens/play/` (the viewer is
  pinned in `play/shared.tsx`), `apps/gm-react/src/runtime/SceneRuntime.ts` (preview write-gate +
  control disabling).
- `Status`: open

### DEBT-2026-004 — Design-system P2 polish deferred from the completion-pass UX review

- `Severity`: low
- `Impact`: The 2026-07-10 design-package conformance review (feature-completion pass) fixed the
  P0/P1 findings; these P2 polish items were deliberately deferred and remain as small
  inconsistencies, not broken UX: (a) `screen-kit`'s token map omits spacing/radius tokens, so
  screens carry one-off px paddings (worst in `Audio.tsx`) — needs a deliberate `--space-*`/
  `--radius-*` decision, not piecemeal edits; (b) MapBuilder/Atlas hand-roll layer panels and an
  import wizard that exist as design-package specs (`LayerPanel`/`LayerRow`/`ImportWizard`);
  (c) a few hand-rolled toggle groups that could be ds `SegmentedControl`; (d) residual raw
  rgba/hex in `app/widget-bodies.tsx` map placeholder tiles.
- `Owner`: platform
- `Resolution Window`: 2026 Q4
- `Targets`: `apps/gm-react/src/app/screen-kit.tsx`, `apps/gm-react/src/app/MapBuilder.tsx`,
  `apps/gm-react/src/screens/Atlas.tsx`, `apps/gm-react/src/app/widget-bodies.tsx`.
- `Status`: open

## Usage Notes

- Reference debt IDs in PR descriptions when deferring architectural work.
- If a code comment uses `TODO(APP)` and remains unresolved for more than one quarter, add/update a
  debt entry here before merge.
