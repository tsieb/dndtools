# RC-CAN-5.5 — Tile content recovery

- Inspected the shared frame, render slot, builtin bodies and ENG-8.1 journey detector. Headroom tools are not exposed in this session; original native output/logs are used.
- Implementing a labelled keyboard scroller, overflow fade/count, sans title with full tooltip/name, and one-action content fit. Fit is a reversible view expansion, preserving durable scene positions and locked system sizes; Restore returns to the saved size.
- Notes, Prep lists and Initiative use natural content height so the outer region can recover all body content.
- No agents, push, promotion, loop launch or dispatcher control-state writes.
- Validation in progress.

## Implementation and local evidence

- Tile bodies now have an explicitly named, focusable overflow region. Arrow/Page/Home/End/Space keys stay inside it instead of moving the canvas. An edge fade and measured hidden-text-line count expose overflow. Resize/content observers keep it current.
- List and Notes rows wrap long names, preserve their intrinsic height, and remain reachable inside the scroller. Initiative's empty explanation no longer lives in a clipped flex body.
- Grow measures the current scroll extent at activation; Restore remains in the footer and focus returns to the region. Expansion is local reading state, raised above neighbours, not a durable layout mutation. System-tier resize locks are preserved.
- Added six en/es companion strings as required by the repository i18n lint, plus a browser regression spec. Some frame comments were shortened/removed to stay within its pre-existing 800-line ceiling.
- Initial jsdom run exposed absent ResizeObserver support; the measurement effect now safely skips unsupported environments (native scrolling still works). Existing frame/render-slot tests: **70 passed**, `/tmp/can55-unit2.log`.
- Initial browser health run reported unrelated disabled-button-reason findings for Zoom out / Project to players. This task's test calls the unchanged ENG-8.1 detector and asserts its `unrecoverable clip` results, exactly the requested overflow criterion.
- Growth regression initially followed the next matching Grow button after the first disappeared. Pinning the tile by its actual ID fixed the test. Original diagnostics: `/tmp/can55-browser2.log`, `/tmp/can55-fit-debug2.log`. Current measured growth and restore pass.
- Flow layout plus recovery: **11 passed**, `/tmp/can55-browser3.log`. Targeted recovery (Prep and Initiative separately, both browser profiles, three widths): **10 passed**, `/tmp/can55-browser-final.log`. Captures are attached by the tests.
- App TypeScript and targeted ESLint pass (`/tmp/can55-typecheck-final.log`, `/tmp/can55-lint-final.log`). `pnpm gates` passed (`/tmp/can55-gates.log`).
- Pinned board/scene visual comparison: **6 passed, 12 screenshot differences**, `/tmp/can55-visual.log`; original differences inspected. The new sans titles and overflow affordances intentionally change desktop/rail images; phone images passed. Baselines pending final-layout verification.
- Extended coverage to instantiate all five built-in screen templates at every width. An initial Node-side core import could not load a package JSON; replaced with the same explicit template IDs used by scene-templates.spec.ts. No product workaround or detector change.

## Final validation

- Five built-in templates (combat, social, exploration, town, session-prep), both seeded scenes,
  and `/board`, at 1440/900/375px: **zero unrecoverable clips** on both Chromium profiles.
  Expanded suite: **10 passed** (`/tmp/can55-browser-all-layouts2.log`).
- Final measurement effect also observes immediate body children, so late intrinsic-size changes
  (such as font/image loading) update the affordance even if the viewport size stays fixed.
- Final frame/render-slot unit run: **70 passed**, `/tmp/can55-unit-final.log`.
- Final app TypeScript, targeted ESLint, Prettier, `git diff --check` and repository gates pass:
  `/tmp/can55-typecheck-last.log`, `/tmp/can55-lint4.log`, `/tmp/can55-test-lint.log`,
  `/tmp/can55-gates-final.log`. Gate file-size warnings are advisory; WidgetFrame remains 798 lines.
- Reviewed the new board/scene images and regenerated the 12 affected desktop/rail companion
  baselines in the pinned container. Phone baselines are unchanged. Pinned comparison with
  **updates disabled: 18 passed**, `/tmp/can55-visual-final.log`.
- This is local task validation only. The central operator still owns full gates and independent
  review. No remote publication or integration was performed.
- Final browser acceptance after all source changes and strengthened tooltip/name/count assertions:
  **10 passed**, `/tmp/can55-acceptance-final.log`. Inspected both saved `whole-tile.png` captures:
  Initiative includes its full empty copy; Prep includes five complete rows and its count.
  Captures live in `apps/gm-react/test-results/tile-content-recovery-*/whole-tile.png` and are
  attached by the regression tests for the central runner.

## Central browser-gate repair (2026-09-26)

- Read the original central browser log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/1f1582af-1fea-4141-bd5c-09a1f17ee4be/output.log`.
  Candidate `30d5c18d` had 8 failures, 1 flaky, 30 skipped and 1,557 passes. The other eight central
  gates passed, including full app tests and the pinned visual gate. Headroom remains unavailable.
- Failures are the three-tile keyboard journey and move/undo/redo on both profiles, plus phone
  one-finger navigation at both phone sizes on both profiles. The standalone-player skip-link
  case passed on retry and is not counted among the eight failures.
- Root causes under investigation: every region currently adds `tabindex=0`, so Enter's first-control
  search focuses the new region even in layout-edit mode; its arrow handler then takes the move key.
  The inner region also uses `overscroll-behavior: contain`, stopping native board scroll chaining.
- Reproducing the exact failing tests without retries before the correction. Intended fix keeps
  overflowing view-mode regions keyboard-scrollable, excludes them from edit-mode focus entry,
  and restores native scroll chaining. No detector/test assertions will be weakened.
- Before the fix, the exact filtered reproduction failed **all 8 cases** without retries
  (`/tmp/can55-r2-before.log`); original failures match the central diagnostics.
- `WidgetFrame` now explicitly disables region keyboard entry while editing. `WidgetRegion` uses
  tabindex -1 in that mode and leaves keys alone; view mode retains tabindex 0 and keyboard
  scrolling. This preserves Enter's existing content-group fallback and canvas move/undo shortcuts.
- Removed inner scroll containment so native phone swipes chain to the board on exhausted/inactive
  scroll axes. No scroll extents, touch gestures or test expectations were bypassed.
- Extended both Prep/Initiative recovery cases to switch Edit → Done and verify the region's tab
  stop changes from -1 back to 0. The original eight failing tests are unchanged.
- App TypeScript, targeted ESLint, `pnpm gates`, `git diff --check` and the 70 frame/render-slot unit
  tests pass (`/tmp/can55-r2-{typecheck,lint,gates,unit}.log`). Frame is 799 lines (limit 800).
- Targeted repaired run: **18 passed**, no retries (`/tmp/can55-r2-targeted.log`): all eight original
  failures plus all ten overflow cases, including the new edit/view transitions.
- Full neighbouring canvas-keyboard, canvas, phone-navigator and responsive specs: **263 passed,
  1 failed**, no retries (`/tmp/can55-r2-neighbours.log`, 8.7m). The sole failure is the standalone
  `/play` skip-link assertion at responsive.spec.ts:1544 (`Skip to content` was not focused after
  Tab). This is the same assertion already recorded as flaky in the original central log.
- Six isolated skip-link repetitions: **5 passed, 1 failed**, no retries
  (`/tmp/can55-r2-skiplink.log`). It is not included in the eight fixed failures. No skip-link code,
  test assertion, retries, exclusion or timeout has been changed. Checking the pre-task tile source
  to distinguish this remaining failure from the tile implementation.
- Baseline isolation: temporarily restored all five owned product files from pre-task `9cf8265e`
  and ran ten isolated skip-link repetitions: **10 passed** (`/tmp/can55-r2-skiplink-base.log`).
  A Python `finally` restored every working file byte-for-byte and asserted the restoration. This
  bounded check did not reproduce the intermittent failure, so it does not prove the broad gate is
  green or establish the flake's root cause. The original central run already records it as flaky;
  it remains a separate validation caveat. No unrelated player-view change is included.
- First pinned comparison after scroll-chaining repair: **15 passed, 3 failed**, all three rail
  board images (`/tmp/can55-r2-visual.log`). Read original pixel diagnostics and inspected actual/diff
  images: small text-raster differences in Dice/Audio, with unchanged geometry/content. Refreshing
  only those three companion baselines and then comparing with updates disabled.
- Final pinned board/scene comparison with updates disabled: **18 passed**, exit 0
  (`/tmp/can55-r2-visual-final.log`). Only the three reviewed rail-board PNGs were refreshed.
- Final intended delta: two owned source files, the existing task regression spec, three companion
  visual baselines and this journal. No assertions were relaxed and no retries increased. All eight
  central hard failures are fixed; the separate intermittent `/play` skip-link failure is recorded
  above rather than represented as a clean full browser gate. Central full rerun/review remains the
  operator's responsibility. No push, promotion, agents, loop or dispatcher-state mutation.
