# RC-DSN-2.2 run journal

## Scope

Resume preserved missing-primitives implementation. No agents, dispatcher mutations, push or promotion.

## Progress

- Inspected preserved edits and design source map; no Headroom tools available.
- Completed primitive behavior and accessibility, exports, production screen integrations and tests.
- Screen consumers: ScenesCreator (ListItem, TagInput, Figure), Settings Tools (RadioCard, HelpTip, FeatureSpotlight), Settings Accessibility (Kbd), Board (Menu, Toolbar, Callout), SystemBuilder (Stepper).
- Validation completed; results below.

## Completed implementation

- All eleven primitives have colocated `.test.tsx` coverage and production screen consumers.
- Added public runtime/type exports and component reference entries in `docs/design-package/components/missing-primitives.md`, linked from the package readme.
- Repaired preserved duplicate imports/props, TagInput callback corruption, missing exports and invalid selection attributes. TagInput uses controlled values with deduplication and limits; menu/toolbar keyboard navigation is covered.
- Stepper supports vertical layout, sizes, connectors and bounded progress indices.
- Added a browser regression proving scene tag entry, save-on-blur and persistence after reload.

## Validation results

- `pnpm test:app`: 114 files, 1,112 tests passed on final component tree. First run caught undeclared `--space-2-5` usage; replaced with existing `--space-2`, then reran the full suite successfully.
- Typechecking: core and cloud passed the root command; app passed after fixing preserved test prop declarations, and passed again with the browser regression added.
- `pnpm lint`: passed, including boundary lint and non-text contrast. Fifteen warnings remain in unrelated existing files; no warnings in task files.
- Playwright Settings and shortcuts: 22 passed across desktop/mobile Chromium, isolated port 15473.
- Playwright missing-primitives scene-tag regression: 2 passed across desktop/mobile Chromium, isolated port 15474.
- `git diff --check`: passed.
- No push, promotion, additional loop, agent delegation or dispatcher control changes.

## Browser gate follow-up

- Central gate at `064d3e12`: typecheck, lint, app tests, build and requirements audit passed; full browser suite reported 8 failures, 11 skipped, 1,041 passed.
- Read original browser gate diagnostics from attempt `e2546ec3-4056-4e58-be87-4e7570b0bca4/output.log`.
- Targeted reproduction (port 15475): six failures reproduce; Android safe-area checks pass in isolation. Comparing the parent commit in an isolated temporary worktree before changing product code.
- Verified parent `75c76bd1` with the same dependency/font assets and an isolated Vite server (port 15476): exactly the same six failures, one skip, three passes. Read original diagnostics and completion output for both runs.
- Added `state/RC-DSN-2.2.browser-baseline.md` with commands, per-test comparison, diagnostics and disposition. The implementation remains intact; no evidence links these reproducible failures to the primitive changes.
- Browser acceptance remains failed. Two Android bounds failures from the broad gate pass on both revisions in isolation and need suite-order investigation by the central operator.

## Gate repair follow-up

- Latest broad gate repeated the same eight failures. Proceeding with narrow fixes to the inherited gate blockers.
- Map tile action controls now use the existing board-scale compensation token, preserving touch hit areas when zoomed out.
- Compact initiative tile scrolls its full content instead of collapsing the combatant list beneath the header.
- Quick-map tool changes no longer reopen a dismissed details sheet; only a new selection or generation opens it.
- Equipment preview test now asserts the existing read-only contract and checks that edit controls return after exiting preview; command-level owner/DM/stranger authority assertions remain intact.
- Targeted browser revalidation running.
- First repair run: all board touch/axe checks, compact HP interaction and equipment preview tests passed (7 passes, one existing desktop skip); quick-map movement passed and exposed a stale later import step in the same test.
- Updated quick-map import test to traverse the actual raster alignment, scale and wall-tracing steps before preview, retaining fingerprint, durable import and preservation checks.
- The raster wizard exposed another inherited blocker: SVG dimensions were explicitly skipped, making its alignment Next button permanently disabled. SVG files now decode through an Image object and a revoked object URL, preserving the image-only rendering boundary and supplying intrinsic dimensions.

## Gate repair validation

- Quick-map full workflow: 2/2 passed on desktop/mobile, including movement, fog, generation, SVG alignment/import and preservation.
- Full browser run with `DNDTOOLS_E2E_PORT=15475 pnpm e2e --workers=2`: 1,048 passed, 11 existing skips, one failure. All eight original gate failures passed in this run.
- The one newly exposed failure was mobile map-tile zoom clipping after enlarging its action hit areas. Fixed by scrolling the map tile content and reserving enough map height for all three scale-compensated zoom controls.
- Final map-layout browser run (port 15477): 16/16 passed across desktop/mobile, covering the previously failing zoom control, map rebinding, overlay toggling, projection, fog, board axe and Android safe-area/touch bounds.
- Full app suite before the final map-layout adjustment: 114 files, 1,112 tests passed. Final map-tile/token tests, typecheck, lint and production build rechecked after that adjustment.
- Original full and targeted browser logs retained at `/tmp/rc-dsn-browser-full.log` and `/tmp/rc-dsn-map-layout.log`. The full suite was not rerun after the final layout fix; the final affected suite passed. The central operator retains the full final-tree gate.
- Changes are limited to four UI implementation files, two existing browser tests, and this journal/baseline note. No test skips or timeout increases added. Equipment command-authority checks remain intact; the preview UI assertion now matches its explicit read-only contract and checks edit controls return after preview.

## Integration-base recovery (2026-09-10)

- First command was `git rebase loop/rc`; resolved all five conflicts and replayed all four task commits onto `23309972`.
- Kept upstream SVG width/height/viewBox parsing, quick-map selection/generation transition tracking, scaled Select height and action classes, import wizard steps/assertions, and read-only equipment preview assertions. Upstream marker pointer-event repair, dense initiative chip and Android CSS specificity remain intact. Retained task map scrolling/zoom-control space and compact-tile scrolling.
- All eleven primitives still have colocated tests, docs entries and the production consumers listed above. Original acceptance is already satisfied by the preserved implementation plus upstream Stepper consumers; no reimplementation was needed.
- The fourth replayed commit (`c73c14c6`) already repairs Board menu ownership with action buttons instead of list rows. Added an open-menu browser regression for axe, initial focus, Home/End, Escape focus return and selection, alongside the existing durable layout repair assertions.
- No Headroom tools are available. Validation results for the rebased tree follow below.

- Rebased static validation passed: app suite 114 files / 1,115 tests, core/cloud/app typechecks, quality gates, root production build (including production runtime-seam exclusion), and root lint with boundary/non-text contrast checks (15 existing warnings, no errors). The validation selector recognized five checks; app typecheck and root lint were run separately because their selector names differ.
- Open-menu browser regression passed on desktop and mobile (2/2): zero axe violations, focus enters the first menu action, Home/End navigation, Escape focus return, activation closes the menu, and Fix layout still separates the committed widget positions.
- Broader affected browser suites running on isolated port 15582 with two workers (388 cases). Original logs: `/tmp/rc-dsn-rebase-browser.log`, `/tmp/rc-dsn-rebase-menu.log`, `/tmp/rc-dsn-rebase-static.log`, `/tmp/rc-dsn-rebase-lint.log`, `/tmp/rc-dsn-rebase-typecheck.log`; per-check static logs in `test-results/validation/logs/`.

## Rebased final validation

- Affected Playwright suites: **378 passed, 10 existing skips, 0 failed** (7.3 minutes), desktop and mobile Chromium. Command: `DNDTOOLS_E2E_PORT=15582 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/canvas.spec.ts tests/e2e/android-quick-map.spec.ts tests/e2e/equipment.spec.ts tests/e2e/map-tile.spec.ts tests/e2e/combat-tile.spec.ts tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts tests/e2e/missing-primitives.spec.ts tests/e2e/settings.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/atlas.spec.ts tests/e2e/map-editor.spec.ts --workers=2`.
- This includes the open layout-issues menu regression on both profiles, all upstream conflict-related browser scenarios, scene-tag persistence, settings/shortcuts, board accessibility, map layout and Android bounds. No skips, timeout increases or weakened assertions were introduced.
- `pnpm a11y:report` passed. The full repository browser suite remains the central operator's gate; this run covers the twelve affected suites above.
- Verified the upstream map importer/editor, map marker pointer handling, widget-body dense chip, NextTurnControl, Popover and Android CSS are unchanged relative to `loop/rc`; the upstream quick-map test is also unchanged. `git merge-base --is-ancestor loop/rc HEAD` and `git diff --check` passed.
- Final commit adds regression evidence and this journal update; the rebase retains all primitive implementations and the prior Board accessibility repair. No push, promotion, dispatcher state changes or additional agents.

## Review follow-up: interactive ListItem list semantics (2026-09-10)

- Review of `fde484ef` rejected one medium defect in the documented interactive `ListItem` API (RC_ROADMAP §0.3 item 8, WCAG 2.2 AA floor). No high or critical findings were open.
- `loop/rc` had advanced 6 commits (Android preflight, CI browser setup, RC-ENG-2.5 journal) since the reviewed base `23309972`. None touch task paths. `git rebase loop/rc` replayed all five task commits cleanly onto `fe023479`, and `loop/rc` is an ancestor again.
- Reproduced the defect before changing code: axe-core 4.12.1 (the version the browser gate uses), run in jsdom against the markup the component rendered, reported a **serious `list` violation (WCAG 1.3.1)** for both enabled and disabled interactive rows. `<li role="button">` stops being a list item, so the parent `ul` contains a non-listitem child. The one production consumer (ScenesCreator) uses static rows, so the gate's axe routes never exercised the `interactive` path. Script: `/tmp/rc-dsn-listitem-axe.cjs`.
- Fix: the `li` always keeps its listitem role. `interactive` now renders a native `type="button"` toggle inside the item: `selected` becomes `aria-pressed`, `disabled` disables the button natively, Enter/Space and focus are native (the global `:focus-visible` ring applies), and `onSelect`/`onClick` fire on activation. Static rows no longer get a stray `tabindex="-1"` when disabled. The design-package mirror is byte-identical, and the component doc row describes the new contract, including that children form the button's accessible name.
- Rendering the real component with `react-dom/server` and running axe on the output gave zero violations for interactive, interactive-disabled and static rows (`/tmp/rc-dsn-listitem-render-axe.mjs`). The unit test now pins list semantics (every `ul` child is an `li` with no role or tabindex override, a native button carries `aria-pressed`), plus activation and disabled behavior.
- Gates on the fixed tree: `pnpm test:app` 114 files / 1,117 tests passed; `pnpm --filter @dndtools/gm-react typecheck` passed; `pnpm lint` passed with 0 errors and the same 15 existing warnings, none in task files; `pnpm format:fix:changed` made no changes; `git diff --check` passed. Logs: `/tmp/rc-dsn-listitem-testapp.log`, `/tmp/rc-dsn-listitem-lint.log`.
- Browser, desktop and mobile Chromium: `DNDTOOLS_E2E_PORT=15593 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/missing-primitives.spec.ts tests/e2e/scene-cards.spec.ts tests/e2e/a11y-axe-gate.spec.ts --workers=2` gave **82 passed, 0 failed, exit 0**. That covers scene-tag persistence on the ListItem consumer and every axe-gate route. An earlier background run of the same command (port 15591) was cut off when the session ended at 55 passes with no failures, so it is not counted. Log: `/tmp/rc-dsn-listitem-e2e2.log`. The full repository browser suite remains the central operator's gate.
- Acceptance is unchanged: all eleven primitives keep their tests, doc entries and production screen consumers. This follow-up only changes ListItem's interactive rendering, its test and its doc/mirror. No push, promotion, dispatcher state changes or additional agents.

## Integration-base recovery #2: RC-DSN-1.1 landed on loop/rc (2026-09-10)

- The dispatcher's automatic rebase stopped at `7cc810ed` (3/6). The brief names `a7651deb` vs `64ea76e7`, but that conflict was resolved in recovery #1 above: `64ea76e7` was already an ancestor of the task branch. The new upstream commits are the eight RC-DSN-1.1 commits `5d3bf1ea..d4f2e5a9` on top of `fe023479` (raw-style lint ratchet, widget placeholder tokens, and `096428ee` board/map browser repairs).
- First step was `git rebase loop/rc`. One content conflict: `app/widgets/builtin/Map.tsx`, on the map-canvas wrapper style. Upstream `096428ee` changed its `borderRadius` from `'var(--radius-sm)'` to `T.radius.sm`, and task commit `7cc810ed` changed `flex`/`minHeight` on the same object so all three scale-compensated zoom controls fit a short widget. Resolved by keeping both: the task's `flex: '1 0 auto'` and the interactive `minHeight`, with upstream's `T.radius.sm`.
- `tests/e2e/equipment.spec.ts` auto-merged. The result is byte-identical to `loop/rc`: upstream's read-only preview comment and its two added assertions (Thieves' Tools stays visible, the Item field returns after preview) subsume the task's one-line comment. The other four commits replayed cleanly. `git merge-base --is-ancestor loop/rc HEAD` passes.
- Upstream fixes survive: of every file `64ea76e7` and `096428ee` touch, only `Map.tsx` and `InitiativeTracker.tsx` differ from `loop/rc`. Those hunks are the task's own (map action hit areas, tile scroll, zoom-control height; compact tile scroll), and upstream's `T.radius.sm`, dense chip, marker pointer-events, importer, editor, Popover and quick-map test are untouched.
- The new RC-DSN-1.1 ratchet (`dsn/no-raw-style-values`) failed `pnpm lint` on the rebased tree with 4 errors, all interactions with task changes:
  - `ScenesCreator.tsx` went over its allowance of 2. The task's ListItem `ul` added `margin: 0, padding: 0` (a lone `0` counts as raw); both pre-existing `gap: 6` values are what the allowance covers. Tokenized the `ul` to `T.space.zero` (`--space-0: 0px`, identical rendering), which returns the file to exactly 2.
  - `Board.tsx` (9 → 8) and `settings/Experience.tsx` (14 → 12) came in _under_ their allowances, because the task's Menu/Callout/Toolbar and settings rewrites removed raw values, and the rule rejects a stale allowance. Lowered both entries in `scripts/eslint-rules/no-raw-style-values.allow.js`. **This file is outside the task's owned paths.** The edit is two lowered numbers and nothing else; the ratchet's own header and error message prescribe exactly this, and the alternative (re-adding raw values to meet stale counts) would reverse the migration. No allowance was raised.
- Board layout-issues menu (the standing review rejection): the `a4ba9a3a` repair (formerly `1b2d8a21`) replayed unchanged. `Menu` renders `role="menu"` inside the Popover's `role="dialog"`, and every child the Board passes is a `Button role="menuitem"` (behind one role-less layout `div`). No `li`/list wrapper separates a menuitem from its menu, so neither `aria-required-children` nor `aria-required-parent` can fire. The open-menu axe regression in `canvas.spec.ts` (`f3ee8250`) is part of the browser run below.
- Acceptance: the rebase leaves the original acceptance already satisfied by the preserved implementation. All eleven primitives keep their colocated tests, doc entries and the production consumers listed under Progress. Nothing was re-implemented. The only new code change is the `ScenesCreator` token swap, committed as `a71d9659`.

### Post-rebase validation (final tree)

- `pnpm lint`: 0 errors, 15 warnings. The warnings are the same existing ones, none in task files; `MapEditor.tsx` is unchanged from `loop/rc`. Includes the raw-style count (2,596 values across 261 files), the ratchet, boundary lint and non-text contrast. The first run on the unfixed rebase failed with the 4 ratchet errors above. Logs: `/tmp/rc-dsn22-rebase2-lint.log` (failing) and `/tmp/rc-dsn22-rebase2-lint2.log` (passing).
- `pnpm --filter @dndtools/gm-react typecheck`: passed, before and after the ScenesCreator import change.
- `pnpm test:app`: 114 files / 1,117 tests passed, before and after the ratchet fixes (`/tmp/rc-dsn22-rebase2-testapp2.log`).
- `pnpm build`: passed (`/tmp/rc-dsn22-rebase2-build.log`).
- `pnpm format:check:changed` and `git diff --check`: passed.
- Browser, desktop and mobile Chromium, isolated port 15611: `DNDTOOLS_E2E_PORT=15611 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/canvas.spec.ts tests/e2e/map-tile.spec.ts tests/e2e/combat-tile.spec.ts tests/e2e/android-quick-map.spec.ts tests/e2e/equipment.spec.ts tests/e2e/missing-primitives.spec.ts tests/e2e/scene-cards.spec.ts tests/e2e/settings.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts --workers=2` gave **301 passed, 5 skipped, 0 failed, exit 0** in 7.4 minutes (`/tmp/rc-dsn22-rebase2-e2e.log`). The open-menu regression (`canvas.spec.ts:464`, axe scan of the open layout-issues menu with an empty-violations assertion) passed on both profiles. Also covered: the conflicted map tile, compact initiative tile, quick-map import, equipment preview, scene tags on the ListItem/TagInput consumer, settings consumers and every axe-gate route. The task adds no skips, fixme markers or timeout changes to any e2e file. The full repository browser suite remains the central operator's gate.
- No push, promotion, dispatcher control-state changes or additional agents.

## Ownership-feedback recovery (2026-09-10)

- First command: `git rebase loop/rc`; Git reported the current task branch is up to date. `loop/rc` is `d4f2e5a9` and is an ancestor of HEAD. The requested conflicts were already resolved by the preserved commits; no new conflict resolution or primitive reimplementation is needed. Original acceptance remains satisfied by the task implementation and upstream Stepper consumers.
- The current task explicitly owns `scripts/eslint-rules/no-raw-style-values.allow.js`, superseding the earlier ownership rejection and the historical out-of-scope note above. Retained its two allowance reductions (Board 9 to 8; Experience 14 to 12); no lint allowance is increased.
- Inspected production consumers, component docs, Menu implementation and the Board open-menu axe regression. ImportMapDialog, MapEditor, android-quick-map and equipment tests are byte-identical to `loop/rc`. Map retains upstream tokenization and action classes alongside task touch-target/scroll fixes; compact initiative retains its whole-tile scroll fix.
- No Headroom tools are available. Fresh validation completed; original logs use `/tmp/rc-dsn22-resume-*.log`.
- Static checks passed: `pnpm test:app` (114 files, 1,117 tests), `pnpm lint` (0 errors, 15 existing warnings), `pnpm typecheck` (core/cloud/app), `pnpm build` (including production runtime-seam exclusion), `pnpm gates`, `pnpm format:check:changed`, and `git diff --check`. Read original log summaries and confirmed process exit 0.
- Fresh affected browser command: `DNDTOOLS_E2E_PORT=15623 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/canvas.spec.ts tests/e2e/map-tile.spec.ts tests/e2e/combat-tile.spec.ts tests/e2e/android-quick-map.spec.ts tests/e2e/equipment.spec.ts tests/e2e/missing-primitives.spec.ts tests/e2e/scene-cards.spec.ts tests/e2e/settings.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts --workers=2`: **297 passed, 5 skipped, 4 failed**, exit 1, 14.6 minutes. Both open-menu axe/focus regressions passed, as did upstream regression cases and scene-tag persistence.
- Read original browser failure diagnostics: Settings motion preference timed out on both profiles (desktop at the final reload; mobile reports the overall test timeout), desktop analytics consent timed out in setup navigation, and mobile hidden-section navigation timed out in setup. Host load average was 147.13 with swap nearly full during the run. Resource pressure is a plausible contributor, not a proven root cause; no product assertions or timeouts were weakened.
- Isolated unchanged Settings rerun: `DNDTOOLS_E2E_PORT=15625 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/settings.spec.ts --workers=1 --output=/tmp/rc-dsn22-resume-settings-results`: **16 passed, 0 failed**, exit 0, 39.2 seconds. This includes all four timed-out cases. Original log: `/tmp/rc-dsn22-resume-settings.log`. The broader run remains recorded as failed; the full final-tree browser gate remains with the central operator.
- `pnpm a11y:report` passed: 54 route/profile scans, zero critical/serious violations (6 moderate findings). All eleven primitive tests/docs/mirrors and production consumers were verified. All 60 candidate paths are within the current explicit ownership list, including the lint allowance file.
- This recovery adds validation and ownership evidence only; the existing committed implementation already satisfies acceptance. No push, promotion, dispatcher control-state changes, additional agents, or new loop.
