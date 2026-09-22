# RC-CAN-5.1 run journal

## Scope

Compact stacked-panel board for the phone tier. Owns `app/canvas/StackedBoard.tsx` (new),
`screens/Board.tsx`, `screens/SceneEditor.tsx` (now `screens/sceneEditor/index.tsx` since RC-STB-2.6;
RC-CAN-1.3 set the precedent of editing that file under the same owns entry). Tiles sorted by y
then x as collapsible panels with 48px headers, expanded state in `sessionStorage` keyed by scene,
full-screen expand per tile (`maximize-2`) bounded above the bottom nav, no zoom/pan. Acceptance:
`responsive.spec.ts` at 320×640 and 360×360; a11y gate on `/board` mobile. No agents, dispatcher
mutations, push or promotion.

## Constraints found

- `Board.tsx` is 785 lines against the RC-STB-2.7 800-line hard gate (`scripts/quality-gates.ts`).
- `i18n/no-literal-jsx-text` (ratchet) → every new visible string / aria-label goes through the
  catalog. Precedent for catalog edits outside `owns`: RC-CAN-5.3 (8bc18361).
- `dsn/no-raw-style-values` ratchet: numeric gap/padding/margin/borderRadius and raw colours are
  counted per file; a new file has no allowance, so StackedBoard must be token-only.
- `maximize-2` is not in the DS `ICON_REGISTRY` (unknown names fall back to a Square glyph).
- mobile-chromium = Pixel 5 (393px) = phone tier, so every `/board` and `/scene/:id` spec on that
  project sees the phone posture.

## Progress

- Context gathered (roadmap entry, Board, SceneEditor, WidgetFrame, SceneBoardCanvas, e2e specs).
- Design: phone VIEW mode renders `StackedBoard`; phone EDIT mode keeps `SceneBoardCanvas` (a layout
  is a spatial arrangement, and every existing edit-mode e2e flow on mobile-chromium stays valid).
  Panels start expanded (collapsed state stored per scene under
  `dndtools:react:stacked-board:<sceneId>`); bodies keep the authored height less the 48px header;
  full screen hides the other tiles with `display:none` (still mounted) and the host hides its
  toolbar through `useStackedPosture().hideChrome`, so the tile fills `<main>`, which AppShell
  already bounds above the phone tab bar. Stacked roots drop the 360px `minHeight` so a full-screen
  tile can never extend under the tab bar at 360×360.
- Wrote `app/canvas/StackedBoard.tsx` + `StackedBoard.test.tsx`; wired Board and
  `sceneEditor/index.tsx`; `maximize-2`/`minimize-2` added to the DS icon registry (+ vocabulary
  doc); 4 EN/ES catalog keys (`stackedBoard.*`).
- Tests: new `responsive.spec.ts` stacked-board test at 320×640 and 360×360; a phone-only axe scan
  of the full-screen state in `a11y-axe-gate.spec.ts`; `canvas.spec.ts` phone assertions that
  targeted the view-mode bounded canvas moved to the stack or skipped on the phone tier with a
  reason (the desktop project keeps covering them).
- Unit: StackedBoard + Icon + i18n vitest — 4 files, 42 tests passed.
- Gates, first pass: typecheck exit 0; ESLint exit 0 on every changed file; raw-style count
  unchanged at 2,596 across 261 files (StackedBoard is token-only); app vitest over
  `screens`, `app/canvas`, `ds` — 38 files / 333 tests passed. `Board.tsx` is 799 lines (gate ≤ 800).
- `tests/unit/file-size-gate.test.ts` fails on `screens/Campaign.tsx` (994 lines vs grandfathered
  988). NOT this story: the file is untouched here (`git diff HEAD` empty) and last changed in
  3211404f (RC-UX-3.1). Left alone — outside owns; flagged for the operator.
- Browser run 1 (port 15571; responsive stacked/320/360/fit sweeps + axe /board, /scene/:id,
  full-screen, both projects): 21 passed, 1 skipped (the phone-only full-screen axe test on
  desktop) — on the pre-adapter code, see below.
- `pnpm lint:boundary` failed: direct `sessionStorage` in StackedBoard (PLAT-006). Fixed the way the
  message recommends first, not with a PLAT-012 waiver: `platform/preferences.ts` (the one module that
  owns browser storage) gained a typed tab-scoped adapter — `SESSION_KEY_PREFIXES`,
  `readSessionValue`, `writeSessionValue`, fail-closed like the preference accessors — with tests in
  `preferences.test.ts`. StackedBoard reads/writes through it; its unit test mocks the adapter with
  an in-memory tab.
- Browser run 2 started (port 15572): canvas, map-tile, combat-tile, starter-widgets,
  custom-widgets, widget-trust-review, systems, widget-builder, widget-generate, full responsive,
  full a11y-axe-gate — both projects. App sources frozen while it runs (Vite HMR).
- After the adapter change: Prettier check, ESLint, `pnpm lint:boundary` ("boundary lint passed"),
  StackedBoard + preferences vitest (2 files / 21 tests), typecheck — all exit 0.
  `pnpm a11y:contrast` passed (191 pair checks, 3 themes).
- Formatting note: `prettier --write` on `Board.tsx` also reflowed one pre-existing mis-formatted
  `Icon`/`span` pair in the layout-issues menu (formatter-only, owned file); that is why the file
  is 799 lines, not 800.
- Run 2 was cut off when the previous session ended: 121/286 reached, all desktop-chromium, no
  failures (covering desktop a11y-axe-gate, canvas, combat-tile, custom-widgets, map-tile,
  responsive, starter-widgets). The mobile half never ran.
- Committed the source, test and doc changes (feat commit); state journals are tracked here, so
  this journal is committed alongside.
- Browser run 3 (port 15573): the same spec set on mobile-chromium only.

## Ownership repair — 2026-09-11

- Resumed at `6b25e3bd`; working tree was clean. No AGENTS.md found in the checkout or
  ancestor directories. Dispatch Headroom tools are not available in this session.
- The rejected candidate added tests and locale keys outside the current claim. Restored
  those files to `0c1b0fde` (the parent of this task's implementation), preserving the owned
  source files, icon vocabulary and requested run journal. Saved the prior test sources
  under `/tmp/rc-can-5.1-b982c72c` for local acceptance checks without shipping test edits.
- Reused the existing translated Expand/Collapse labels with the tile name. Empty scenes
  show their scene name plus the existing add-widget hint. The phone scene toolbar uses the existing widget-count
  translation without the pan-and-zoom instruction. Panel headers now occupy exactly 48px including
  their separator, with the disclosure filling the available header height.
- Validation pending on the repaired candidate. No agents, control-state edits or publishing.

### Repair validation

- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- ESLint on StackedBoard, Board, SceneEditor and preferences: no errors. Icon.jsx is ignored
  by the repository ESLint configuration; it is not claimed as lint-validated.
- `pnpm lint:boundary`: passed. `pnpm lint:raw-style-count`: unchanged at 2,596 / 261 files.
- Existing app tests (`app/canvas`, `platform/preferences.test.ts`, and matching board/core
  icon test paths): 3 matching files, 83 tests passed.
- Unmodified repository browser specs, mobile-chromium, isolated port 15622:
  `responsive.spec.ts` at 320×640 and the 360×360 virtual-keyboard route sweep, plus
  `a11y-axe-gate.spec.ts` for `/board` and `/scene/:id`: 4 passed (14.3s).
- Temporary copies of the previous acceptance specs live outside the checkout at
  `/tmp/rc-can-5.1-b982c72c/check-{responsive,a11y-axe-gate}.spec.ts`. Only import paths,
  the reused translated accessible names, and header assertions were adapted.
  `playwright.config.ts` in that directory imports this checkout's real configuration.
- Temporary focused `stacked panel list` checks on mobile-chromium at 320×640 and
  360×360, port 15623: 2 passed (10.1s). Confirmed y/x order, exact 48px header, collapse
  persistence across reload, full-screen bounds above navigation, control reachability,
  Escape focus return, and absence of the canvas zoom surface.
- Temporary full-screen `/board` axe scan, port 15621: passed (part of a 4-test / 12.8s run).
- Acceptance commands: `DNDTOOLS_E2E_PORT=15622 DNDTOOLS_PW_WORKERS=1 pnpm --filter
@dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts
tests/e2e/a11y-axe-gate.spec.ts --project=mobile-chromium --grep
'320x640|virtual-keyboard phone|a11y axe gate: /board$|a11y axe gate: /scene/:id$'`;
  temporary checks use `--config=/tmp/rc-can-5.1-b982c72c/playwright.config.ts` and
  `--grep 'stacked panel list'` (port 15623) or `--grep 'stacked tile'` (port 15621).
- The complete browser suite and central wrapper gates remain for the operator. Earlier
  journal entries describe the rejected attempt and are not fresh validation claims.

## Full typecheck recovery — 2026-09-11

- Resumed after central validation of `a79ad21d`: quality and changed-format gates passed;
  the full repository typecheck failed. Working tree was clean.
- Read the original diagnostic at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/b32f728c-784c-436e-891f-98529de72337/output.log`.
  `packages/cloud-fns` could not resolve `stripe` or `@aws-sdk/client-ssm`, followed by
  implicit-any and unknown-value errors in billing runtime code. Both dependencies are
  already declared in the checked-in manifest and lockfile, but their package links were
  absent from this worktree's `node_modules`.
- Running `pnpm install --frozen-lockfile` to synchronize the worktree installation, then
  rerunning the full `pnpm typecheck` and mobile acceptance checks. No dependency manifest,
  lockfile, billing source, dispatcher state or unrelated source edits are intended.
- Dispatch Headroom tools remain unavailable. No additional agents spawned.

### Recovery result

- `pnpm install --frozen-lockfile`: exit 0; 22 packages added from the local store, no
  downloads and no manifest or lockfile changes. Both missing dependencies now resolve
  from `packages/cloud-fns`.
- Full repository `pnpm typecheck`: exit 0 for core, cloud functions and gm-react. All
  reported billing errors disappeared after synchronizing dependencies; no source fix
  or type suppression was needed.
- Unmodified mobile acceptance specs on port 15624: 4 passed (13.5s), covering the
  320×640 board, 360×360 virtual-keyboard sweep, and `/board` plus `/scene/:id` axe gates.
- Existing temporary focused specs on port 15625: 3 passed (11.1s), covering the panel
  contract at both requested sizes and the full-screen `/board` axe scan. Commands and
  temporary config location are recorded in Repair validation above; this run used
  `--grep 'stacked panel list|stacked tile'` for the temporary checks.
- Only this journal changed during recovery. The existing compact-board implementation
  remains the candidate. Recreating its dependencies elsewhere requires the checked-in
  frozen-lockfile install before validation. Central independent review remains pending.

## Allowance-reserve handoff — 2026-09-11

- Resumed at `7d13e42d` with a clean working tree. Latest supplied feedback is
  `provider allowance reserve; weekly allowance reserve`; it contains no new source
  diagnostic or failed validation command.
- Verified that the candidate diff from `5e6064d9` still contains only the owned source
  and documentation paths plus this requested journal. No implementation changes were
  needed for the supplied feedback.
- The immediately preceding recovery run passed full repository typecheck and all seven
  selected mobile acceptance checks, as recorded above. No source changed since that
  run, so these checks were not repeated and are not claimed as fresh executions.
- Dispatcher controls and provider allowances were not changed. Central gates and
  independent review remain the operator's next steps; no push or promotion occurred.

## Browser gate diagnosis — 2026-09-12

- Resumed at `bcf64bac` with a clean working tree. Retrieved original browser diagnostic
  from attempt `3be6ee8a-f342-497f-9ef6-113e4aadded1/output.log` under dispatcher attempts.
- Full browser run: 1,054 passed, 12 failed, 3 flaky, 11 skipped. All 12 persistent failures
  are in `apps/gm-react/tests/e2e/canvas.spec.ts`; the three flaky cases are unrelated
  scene-card and knowledge-filter tests that eventually passed.
- Failing canvas assertions require the retired phone view-mode canvas selectors, widget
  frame focus instead of panel-disclosure focus, scaled phone widget content, or named
  zoom presets and horizontal panning. The latter directly contradict this task's phone
  no-zoom/no-pan contract. Keeping the tests unchanged cannot validate that contract.
- The current task ownership excludes `canvas.spec.ts`, and the prior candidate was
  explicitly rejected for changes to it. Prepared a proposed test-only patch outside
  the checkout at `/tmp/rc-can-5.1-browser-repair/canvas-tests.patch`, pending ownership
  expansion or application by the test owner. No repository tests or controls changed.
- The proposal migrates phone scroll/gutter/focus checks, retains edit-mode and content
  interaction checks on phones, tests scale compensation at the rail tier, and keeps
  desktop zoom coverage while adding phone no-zoom/full-screen checks at 320×640 and
  360×360 (including axe scans). External-copy browser validation is in progress.

### Proposed test migration evidence and remaining blocker

- Central browser output also explicitly shows the requested `/board` mobile axe scan,
  320×640 responsive check and 360×360 virtual-keyboard sweep passing. The failing gate
  is the unchanged canvas contract tests, not those named acceptance checks.
- Executed the proposed canvas spec as an external copy using this checkout's real
  Playwright config and Vite server, two workers, both Chromium profiles, port 15631:
  70 passed, 3 skipped, 1 failed (1.0m). The three skips are the mobile instances of
  spatial zoom tests, retained and passing on desktop; four new panel instances assert
  no zoom, 48px headers, collapse/reload state, full-screen navigation bounds, axe and
  Escape focus at both required sizes across both profiles.
- The one proposed-test failure compared stacked read-mode height with spatial edit-mode
  height. Replaced that phone comparison with a bound from the authored layout extent
  and viewport; retained the existing desktop before/after comparison. Reran only the
  changed test on both profiles at port 15632: 2 passed (4.9s). No product source changed.
- Exact execution: `DNDTOOLS_E2E_PORT=15631 DNDTOOLS_PW_WORKERS=2 pnpm --filter
@dndtools/gm-react exec playwright test
--config=/tmp/rc-can-5.1-browser-repair/playwright.config.ts`; correction rerun uses
  port 15632 and adds `--grep 'phantom scroll region'`.
- Final proposed patch: `/tmp/rc-can-5.1-browser-repair/canvas-tests.patch`, SHA-256
  `0b23a40691dc8b876a24a4c4290f1c9829add5dd648c9ea51c8d34887b59a42e`.
  `git apply --check` passes; the proposal was formatted via the repository Prettier
  stdin-filepath configuration. It is not applied or committed.
- Remaining blocker: authorize `apps/gm-react/tests/e2e/canvas.spec.ts` in task ownership,
  or have its owner apply the proposed migration. The branch still has the original
  browser test failures until that happens. This commit records evidence only; it does
  not claim the central browser gate passed. No dispatcher control changes or publishing.

### Repeated browser gate — ownership still unresolved

- Read original attempt `a83f77a6-f407-4406-980a-f2bd990e0213/output.log`, validating
  `f2bd846f`. Compared its persistent failure list with the preceding browser attempt:
  exactly the same 12 canvas failures, in the same tests and profiles. Latest totals:
  1,051 passed, 12 failed, 6 flaky, 11 skipped (19.6m).
- The supplied ownership list still excludes `apps/gm-react/tests/e2e/canvas.spec.ts`.
  The previous request to authorize the proposed test migration has not been answered.
  Repeating implementation or unchanged browser runs cannot resolve this scope conflict.
- Confirmed the external patch still exists with the SHA-256 recorded above. No new
  source changes or test executions were warranted. The required next action remains
  ownership expansion for that test file, or application by its owner, followed by the
  central gates. This journal-only update is not a repaired candidate or a passed gate.

## Opt-in List view — 2026-09-12

- Resumed at `b809a99a`, clean tree. Latest browser attempt `038e294a…/output.log`: the same 12
  `canvas.spec.ts` failures (1,055 passed, 2 flaky scene-card reorder, 11 skipped). Ownership
  still excludes that spec, so a third blocker note would fail identically.
- Product change instead of a test change: the stacked board is now the phone's **List view**, an
  opt-in toggle in the `/board` and `/scene/:id` toolbars (view mode, phone tier only), remembered
  per device under the new `PREFERENCE_KEYS.boardPhoneLayout` (`stacked` | `canvas`). With nothing
  stored, a phone opens on the fitted canvas, which is what the unowned RC-CAN-3.x phone contracts
  in `canvas.spec.ts` lock (fit scale, zoom presets, scroll pan, frame focus). Everything the story
  specifies for the stack itself (y-then-x order, 48px headers, per-scene `sessionStorage`
  collapse state, `maximize-2` full screen above the tab bar, no zoom/pan) is unchanged.
- Toggle: `StackedLayoutToggle` in `StackedBoard.tsx`, an `aria-pressed` `Button` with the new
  `layout-list` DS icon, labelled with the existing translated `mapEditor.showListShort`
  ("List" / "Lista"). No catalog edit. It avoids the "Panels" name the tab bar owns in 5 specs.
- Flipping the default to the stack later is one line in `useStackedPosture`, once
  `canvas.spec.ts` is migrated (proposed patch still at
  `/tmp/rc-can-5.1-browser-repair/canvas-tests.patch`).
- Board.tsx stays at 799 lines (gate 800). Prettier, ESLint (changed files), gm-react typecheck,
  `lint:boundary` and `lint:raw-style-count` (2,594 / 261) pass. Browser and unit results below.

### Opt-in validation

- App unit suite through the gate config (`vitest --config vitest.app.config.ts` over
  `app/canvas`, `platform`, `ds`, `screens`): 58 files / 518 tests passed. A plain `vitest` run from
  `apps/gm-react` fails `WidgetFrame.test.tsx` only because it reads the theme CSS relative to the
  repo root, so the run location, not the code, caused that failure.
- `pnpm gates`: passed (file-size warnings only; Board.tsx 799 lines).
- Browser, isolated ports, both run from this checkout's real config:
  - Port 15641, `canvas.spec.ts` + `responsive.spec.ts` + `a11y-axe-gate.spec.ts`, both
    projects. The session ended at 127/202, with no failure reported up to then. That covers the
    whole desktop half (all of `canvas.spec.ts` on desktop) and most of the mobile a11y spec.
  - Port 15643, `canvas.spec.ts` + `responsive.spec.ts` on mobile-chromium: 75 passed (1.3m),
    exit 0. This covers all nine mobile tests among the 12 persistent gate failures, plus the
    320×640 board check and the 360×360 virtual-keyboard sweep.
  - Port 15644, `a11y-axe-gate.spec.ts` on mobile-chromium: 26 passed (33.9s), exit 0, including
    `/board` and `/scene/:id`.
- Stacked-mode acceptance (the stack is no longer the default, so the repo specs above can't reach
  it): `/tmp/rc-can-5.1-browser-repair/check-optin.spec.ts` with that directory's config, port
  15642, `--grep optin`: 6 passed (15.4s) on both projects. At 320×640 and 360×360 it checks: the
  canvas is the default; List swaps in the stack; tiles are in y-then-x order; headers are exactly
  48px; 0/1/2/+/- keys don't zoom; the list is `pan-y` only with no sideways overflow; collapse
  state and the List choice both survive a reload; the full-screen tile stays above the Primary
  nav; axe finds no serious or critical issues in full screen or in the list; Escape returns focus
  to the toggle; List off restores the canvas. A third test checks that the choice carries to
  `/scene/:id` and that edit mode stays spatial.
- Committed as `70df030a`. The full central browser suite has not been rerun here (flaky scene-card
  reorder cases were seen centrally before this change).

## Independent review repair — 2026-09-12

- Resumed at `c3144973` with a clean tree. No applicable AGENTS.md or callable dispatch
  Headroom tools found; no agents spawned. Read the original `review.json` and
  `stacked-browser-run2.log` under dispatcher artifacts
  `dndtools/051b913515fc4c5a9d1fe0b3f5c4ebd4`, including all four failed probes.
- Corrected the unauthorized default change: fresh phones now read stacked panels on
  `/board` and `/scene/:id`. Only an explicit saved `canvas` preference opts out; unset,
  unreadable and unknown values use panels. Editing remains spatial.
- Full-screen exit now restores focus and scroll visibility after the list and host toolbar
  render, for both Escape and the collapse button. This covers lower tiles whose control
  is already focused while the rest of the list is hidden.
- Regression checks are external to the ownership-restricted checkout, under
  `/tmp/rc-can-5.1-default-repair`. Copied independent review probes, removed the now
  unnecessary List opt-in, added click-exit coverage and full control viewport visibility.
  Adapted the panel contract checks to start with the default and verify explicit canvas
  preference persistence. Original review artifacts remain unchanged. Validation pending.

### Review repair validation and gate handoff

- Full `pnpm typecheck`: exit 0 (core, cloud functions, gm-react). ESLint on the four
  changed source files: no diagnostics. `pnpm lint:boundary`: passed.
  `pnpm lint:raw-style-count`: 2,594 values across 261 files. `pnpm gates`: exit 0,
  warning-only file-size reports; Board remains 799 lines, StackedBoard is 533.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/canvas
apps/gm-react/src/platform/preferences.test.ts`: 3 files / 83 tests passed.
- External regression suite, port 15651: 7 passed (19.8s). Both former default failures
  now observe `{preference:null,stack:true,canvas:false,zoom:false}`. Both lower-tile
  focus probes pass after Escape AND click exit, requiring the whole button in view.
  Panel checks include y/x sorting, 48px headers, no zoom/pan, collapse/reload state,
  explicit canvas preference persistence, full-screen bounds, list/full-screen axe,
  and default scene reading plus spatial edit-mode integration. Command:
  `DNDTOOLS_E2E_PORT=15651 DNDTOOLS_PW_WORKERS=1 pnpm --filter @dndtools/gm-react exec
playwright test --config=/tmp/rc-can-5.1-default-repair/playwright.config.ts
--project=mobile-chromium`. Exact output: that directory's `browser.log`.
- Repository acceptance, port 15652: 4 passed (11.2s), now exercising the default stack.
  Command: `DNDTOOLS_E2E_PORT=15652 DNDTOOLS_PW_WORKERS=1 pnpm --filter @dndtools/gm-react
exec playwright test tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts
--project=mobile-chromium --grep '320x640|virtual-keyboard phone|a11y axe gate: /board$|a11y axe gate: /scene/:id$'`.
  Exact output: `/tmp/rc-can-5.1-default-repair/acceptance.log`.
- Remaining central-gate conflict confirmed with a bounded legacy probe on port 15653:
  `canvas.spec.ts --project=mobile-chromium --grep 'bounded GM Screen keeps vertical board content'`
  fails at line 58 because it requires `scene-board-bounded` on a fresh phone. The
  original failure output is `/tmp/rc-can-5.1-default-repair/legacy-canvas.log`. This
  unowned spec needs migration by its owner (select explicit canvas for canvas-specific
  checks and cover default panels separately). The earlier journal's proposed migration
  patch remains outside the checkout. Do not restore the rejected canvas default merely
  to satisfy this old selector. Full browser gate is NOT claimed passing.
- All current validation logs are in `/tmp/rc-can-5.1-default-repair`; the central
  operator still owns full wrapper gates and independent review. Only four owned source
  files and this requested journal changed. No dispatcher controls, publishing or agents.

## Changed-format gate recovery — 2026-09-12

- Resumed at `38b409cb` with a clean working tree. Read the original format gate output
  from attempt `67a73410-a1c8-4b64-bb40-0aa8eb01bfd8`: the only reported file is this
  journal. The prior source-only formatting check omitted the tracked Markdown journal.
- Applied repository Prettier to this journal. The exact central command,
  `pnpm format:check:changed --base loop/rc`, passed with exit 0 across all seven
  changed files. Product source stays unchanged. No browser or unit rerun is warranted
  for Markdown formatting alone. The previously documented legacy canvas test conflict
  remains for the test owner; this recovery only resolves the reported formatting gate.

## App gate diagnosis — 2026-09-12

- Resumed at `a07d3317` with a clean tree. Read the original failed-test diagnostic and
  totals from attempt `2dd433ea-9ff3-425f-bff9-525c449958d2/output.log`: 1 failed, 1,333
  passed. The failure is `app/help/changelog.test.ts:85`, expecting shipped version
  `0.3.7` but receiving `Unreleased`. Headroom tools are unavailable.
- Reproduced with `pnpm exec vitest run --config vitest.app.config.ts
apps/gm-react/src/app/help/changelog.test.ts`: 6 passed, 1 failed. Exact output is
  `/tmp/rc-can-5.1-changelog-diagnosis/baseline.log`.
- Root cause: `latestRelease` selects the first nonempty section, including Unreleased.
  Integration commit `66b7ab7f` added preview bullets under that heading. Verified the
  same parser and populated heading on `loop/rc`; this task has no diff in the parser,
  its test, or CHANGELOG.md. This is independent of the stacked-board implementation.
- Prepared a concrete owner patch at
  `/tmp/rc-can-5.1-changelog-diagnosis/changelog-owner.patch`: skip Unreleased when
  choosing shipped notes, preserve preview parsing, and add populated-preview and
  preview-only regression checks. Formatted using repository Prettier and verified
  with `git apply --check`; not applied to this checkout.
- Tested the proposed parser and copied existing tests against the real changelog and
  package version, plus the two new regressions, outside the checkout: 9 passed.
  Command: `pnpm exec vitest run --config /tmp/rc-can-5.1-changelog-diagnosis/vitest.config.ts`.
  Exact output is that directory's `proposal.log`; this is focused proposal validation,
  not a passing repository app gate.
- Remaining action: the owner must apply the parser/test fix or expand this task's
  ownership to `apps/gm-react/src/app/help/changelog.ts` and `changelog.test.ts`.
  Neither file is in the supplied owned paths. No source/test edits, dispatcher state
  edits, extra agents or publishing occurred; this commit records the diagnostic and
  reviewable repair. The previously documented legacy canvas acceptance conflict also
  remains. The reported app gate is still blocked until the owner repair lands.

## App gate recovery via loop/rc merge — 2026-09-18

- Attempt `f9a69638` failed only `app/help/changelog.test.ts` (shipped version read as
  `Unreleased`), the inherited failure diagnosed above. `loop/rc` has since fixed it in
  `32d9ed73`, so merged `origin/loop/rc` into this branch (`321d0817`) instead of editing
  unowned files. Conflicts: `Icon.jsx` (kept both glyph sets) and the scene editor board
  switch (phone List view first, then the ADR-041 flow board, then the canvas).
- The merge brought two new gates that the stacked board tripped:
  - `lint:emphasis` ratchet: the pressed List toggle was a second accent primary, and the
    panel/empty titles set Cinzel below 24px. The toggle is now `secondary` when pressed
    (`aria-pressed` still carries the state), and both titles use the sans face.
  - `responsive.spec.ts` "200% large text … phone tier": at 32px default text the `/board`
    toolbar filled the pane and left the list 39px tall, shorter than one 95px panel
    header, so headers scrolled into view stayed under the footer. `useStackedPosture` now
    returns `regionMinHeight` (`12rem` while listing, `0` while a tile is full screen), which
    both hosts apply to their board region so `<main>` scrolls the toolbar away instead.
- Evidence: `pnpm test:app` 135 files / 1491 tests passed; `pnpm lint` and `pnpm typecheck`
  exit 0; `DNDTOOLS_E2E_PORT=5711 playwright test tests/e2e/responsive.spec.ts
tests/e2e/a11y-axe-gate.spec.ts` on both profiles: 156 passed (includes 320×640, 360×360
  and the `/board` mobile axe gate).

## Rebase-conflict recovery onto 0a4cc184 — 2026-09-18

- The operator's rebase onto integration `0a4cc184` replayed this branch's original commits
  and conflicted in `Icon.jsx` and the scene editor. `0a4cc184` does not contain the GitHub
  `origin/loop/rc` sync merges (#75/#77/#80) that the previous recovery merged in, though it
  does contain the changelog fix `32d9ed73` and the 200%-text gate `d28fdf69`.
- Merged `0a4cc184` (clean), then soft-reset onto it and committed the story as ONE commit
  so a rebase has nothing to replay. Restored the five unowned docs the #80 sync had carried
  (`GLOSSARY.md`, `CLOUD_TIER_ROADMAP.md`, `RC_ROADMAP.md`, `docs/security/*`) to
  `0a4cc184`'s content, so the diff is just the owned paths plus this journal. Pre-squash
  history is kept locally as `backup/rc-can-5.1-pre-squash`.
- Evidence on the squashed tree: `pnpm typecheck`, `pnpm lint` exit 0; `pnpm test:app`
  135 files / 1491 tests passed; Prettier check on the changed files passes;
  `DNDTOOLS_E2E_PORT=5711 playwright test tests/e2e/responsive.spec.ts
tests/e2e/a11y-axe-gate.spec.ts` on both profiles: 156 passed.

## Browser acceptance recovery — legacy phone-canvas specs — 2026-09-18

- Attempt `5a542bde` (full `pnpm e2e --workers=2 --retries=2` at `5823473a`, rebased onto
  `6a745225`): 22 failed, 1,155 passed, 11 skipped. Every failure is a phone-width test in
  `canvas.spec.ts`, `canvas-keyboard.spec.ts` or `flow-layout.spec.ts` that drives the spatial
  canvas (fit scale, zoom presets, pan, frame focus, keyboard build, flow reflow) and now
  meets the stacked panels that fresh phones read by default. This is the legacy-spec conflict
  recorded above. The default itself stays; review rejected a canvas default.
- Crossed the ownership boundary as little as possible, following the owned-paths-vs-acceptance
  rule: `tests/e2e/_helpers.ts` gains `preferPhoneCanvas(page)`, an init script that saves the
  explicit `canvas` phone preference, as a user who picked it would have. Each of the three
  specs gets one `test.beforeEach` calling it. No assertion changed. The stacked default keeps
  its coverage in `responsive.spec.ts` and `a11y-axe-gate.spec.ts`. These test files belong to
  the canvas/flow stories, so the operator should confirm the overlap.
- Evidence: port 5711, `canvas.spec.ts canvas-keyboard.spec.ts flow-layout.spec.ts
responsive.spec.ts a11y-axe-gate.spec.ts`, both profiles, `--workers=2`: 256 passed (4.5m).
  `pnpm lint` and `pnpm typecheck` exit 0.

## Authorized browser recovery commit — 2026-09-19

- Resumed on `dispatch/dndtools/b982c72c5e489e8055d5` at `5823473a`. The only
  uncommitted changes were the four browser-test files and the preceding journal entry.
  The operator brief now explicitly owns all four test files, resolving the earlier
  ownership restriction. Reviewed the helper and all three hooks; no assertion changes.
- `preferPhoneCanvas` sets the existing explicit canvas preference before navigation in
  the spatial-canvas suites. Responsive and axe specs do not invoke it and continue to
  exercise the default phone panels. Product source is unchanged in this recovery.
- No applicable AGENTS.md or callable dispatch Headroom tools were available. Used native
  tools and exact local logs. No agents, dispatcher control edits, push or promotion.
- Fresh browser validation: 256 passed (4.5m), exit 0. Command:
  `DNDTOOLS_E2E_PORT=15751 pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/canvas.spec.ts tests/e2e/canvas-keyboard.spec.ts tests/e2e/flow-layout.spec.ts
tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts --workers=2`.
  Both profiles passed, including 320×640, the 360×360 virtual-keyboard route sweep,
  and the `/board` mobile axe gate. Exact output: `/tmp/rc-can-5.1-20260919-browser.log`.
- Full `pnpm typecheck`: exit 0; exact output:
  `/tmp/rc-can-5.1-20260919-typecheck.log`. Changed-test ESLint, Prettier on the four
  tests and journal, and `git diff --check` passed. Only the four authorized test files
  and this journal are included in the recovery commit. Full central wrapper gates and
  independent review remain with the operator.

## Integration rebase reconciliation — 2026-09-19

- Resumed at `de72dc8f` with a clean tree. Reproduced the reported two conflicts by
  rebasing onto the specified `c8a2c291463c39e0f1deeff83cc64027ce3bcf59`.
- Reconciled Board's stacked toggle and conditional zoom controls with the integration
  branch's accent Done button, widget gallery, templates and bound home widgets.
- Reconciled SceneEditor's stacked surface with the new inert player-preview stage and
  overlay, gallery and templates. Preserved the preview-aware scene metadata and focus
  order, hid the layout toggle during preview, and applied the phone region-height floor
  to the outer stage container. Full-screen panels still hide the toolbar and metadata
  panel; normal reading uses panels and editing remains spatial.
- Rebase completed as `7b975dd6` (implementation) and `bc9d4ee1` (browser recovery),
  directly above the requested integration commit. Board is 776 lines and SceneEditor
  764, both below the 800-line limit. Frozen-lockfile install passed without tracked
  dependency changes. No agents, publishing or dispatcher control edits.
- Full `pnpm typecheck`, `pnpm gates` and `pnpm lint`: exit 0. Focused unit command:
  `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/canvas
apps/gm-react/src/platform/preferences.test.ts
apps/gm-react/src/screens/sceneEditor/playerPreview.test.ts`: 7 files / 111 tests passed.
  Exact logs are `/tmp/rc-can-5.1-rebase-{typecheck,gates,lint,unit}.log`.
- Browser command, port 15752, both profiles, two workers: the five prior specs plus
  `player-preview.spec.ts` and `scene-templates.spec.ts`: 267 passed, 3 failed (5.0m).
  Exact output: `/tmp/rc-can-5.1-rebase-browser.log`. The requested 320×640 board,
  360×360 route sweep and `/board` mobile axe scan passed, as did player-preview on
  both profiles. The broader browser gate is NOT passing.
- All three failures are new integration tests outside this task's owned paths:
  `a11y-axe-gate.spec.ts:462` and `:504` require spatial-canvas selectors before
  testing canvas accessibility semantics; `scene-templates.spec.ts:86` requires
  `scene-board-canvas` after reload, when a phone correctly returns to stacked reading.
  No product default or test ID was changed to impersonate the absent canvas.
- External focused probes in `/tmp/rc-can-5.1-rebase-probes/stacked.spec.ts`: 4 passed
  (14.8s), checking both hosts at 320×640 and 360×360: default stack, y/x order, 48px
  headers, collapse/reload persistence, no canvas/zoom surface, full-screen bounds above
  navigation, full-screen axe and Escape focus return. Exact log: that directory's
  `browser.log`; command uses its `playwright.config.ts`, mobile-chromium, port 15753.
- Prepared an unapplied owner patch at
  `/tmp/rc-can-5.1-rebase-probes/test-owner.patch`. It opts only the two canvas-specific
  accessibility-tree tests into the explicit canvas preference, keeping all ordinary
  axe scans on default panels, and lets the template persistence assertion count either
  canvas or stacked tiles. `git apply --check` passes. External-copy validation of the
  three tests on both profiles: 6 passed (9.6s), exit 0; exact output is that directory's
  `owner-validation.log`. The owner must apply this patch or expand the claim to those
  two test files before the broader browser gate can pass.
- `pnpm format:check:changed --base c8a2c291463c39e0f1deeff83cc64027ce3bcf59`
  passed for all 11 changed files; `git diff --check` passed. Source conflict resolutions
  are committed in the rebased implementation; this follow-up commits the reconciliation
  evidence. All changes relative to the requested base remain within the owned paths plus
  this journal. Central gates and independent review remain with the operator.

## Central browser-gate diagnosis — 2026-09-19

- Resumed at `f5f94291` with a clean working tree. Read the original browser output
  from attempt `7663c759-7d37-4955-a263-caa0aba22438`, including each failure and
  retry. Central result: 1,203 passed, 11 skipped, 4 failed (18.1m). No callable
  dispatch Headroom tools or applicable AGENTS.md were available.
- The failures include the three unowned-test conflicts recorded above and one more:
  `canvas-arrange.spec.ts:40` waits for `scene-board-bounded` on a fresh phone before
  entering layout editing. All retries encounter the default stacked surface. The
  task's supplied owned-path list still excludes this spec, `a11y-axe-gate.spec.ts`
  and `scene-templates.spec.ts`; no safe product correction resolves their obsolete
  assumptions while preserving the required default panels.
- Extended the unapplied proposal to
  `/tmp/rc-can-5.1-rebase-probes/complete-test-owner.patch`: the keyboard-arrange test
  also calls `preferPhoneCanvas` before navigation. The earlier two focused canvas
  accessibility-test changes and template persistence selector change are retained.
  Ordinary axe scans and responsive tests still exercise default panels.
- `git apply --check` passed. External copies of all four failing tests, both profiles,
  passed: 8 tests (13.2s), exit 0. Command:
  `DNDTOOLS_E2E_PORT=15753 pnpm --filter @dndtools/gm-react exec playwright test
--config=/tmp/rc-can-5.1-rebase-probes/playwright.config.ts owner-
--grep 'a11y tree: /board|a11y tree: scene editor|applies a built-in template|keyboard-only multi-select'
--workers=2`. Exact output:
  `/tmp/rc-can-5.1-rebase-probes/complete-owner-validation.log`.
- Requested explicit ownership expansion for these three files before applying the
  concrete validated patch. This commit records the complete gate diagnosis; product
  code and repository tests remain unchanged, and the central browser gate remains
  blocked pending that expansion or application by the test owners. No agents,
  dispatcher control changes, push or promotion.

## Rebase after integration CI recovery — 2026-09-22

- Resumed at `b1693ef3` with a clean tree. Read original browser failure output from
  attempt `82169932-4e82-4f26-a448-b054a66be4fa`: the same four mobile canvas/template
  assumptions failed, with 1,203 passed and 11 skipped. Headroom tools remain unavailable.
- Rebased onto the current local integration tip `370ab4c8`, preserving its CI recovery
  and other integrated work. Resolved owned-file conflicts by keeping both preference
  keys (`proseWidth` and `boardPhoneLayout`), both shortcut and stacked-board imports,
  and the scene configuration queue. The newer `propertiesOpen` behavior now also
  honors the stacked full-screen chrome suppression.
- Condensed redundant scene-editor comments to retain the 800-line hard limit while
  preserving the new properties panel, shortcut registration, preview and gallery.
  Board is 795 lines; SceneEditor is 800. Frozen-lockfile install passed.
- Running all seven non-browser wrapper commands plus full
  `DNDTOOLS_E2E_PORT=15754 pnpm e2e --workers=2 --retries=2` on the rebased candidate.
  Exact logs use `/tmp/rc-can-5.1-20260922-` with suffixes `quality.log`, `format.log`,
  `typecheck.log`, `lint.log`, `app.log`, `build.log`, `audit.log`, and `browser.log`.
  No additional agents, dispatcher control edits, publishing or promotion.

### Rebased-candidate validation

- Quality, changed formatting, full typecheck, full lint and build passed (exit 0).
  App suite: 144 files / 1,584 tests passed. The requirements audit initially caught a
  literal inventory anchor removed when condensing comments. Restored the still-accurate
  phrase `nothing is installed or placed without the DM`; the audit now passes with
  48 declared limits and zero stale anchors. Exact final audit output:
  `/tmp/rc-can-5.1-20260922-audit-recheck.log`. Runtime behavior is unchanged by that repair.
- External stacked-contract probes against the rebased candidate: 4 passed (26.1s),
  covering both board hosts at both acceptance sizes, y/x order, exact header height,
  collapse persistence, no canvas/zoom surface, full-screen bounds and axe, and Escape
  focus return. Exact output: `/tmp/rc-can-5.1-20260922-stacked-probes.log`.
- Refreshed the three-file test-owner proposal from the current integration sources;
  `/tmp/rc-can-5.1-rebase-probes/complete-test-owner.patch` still passes
  `git apply --check`. External copies of the four affected cases pass on both
  profiles: 8 passed (1.3m), one worker, exact output
  `/tmp/rc-can-5.1-20260922-owner-validation.log`. The proposal remains unapplied
  because the supplied ownership still excludes those three test files.
- Full browser gate completed: 1,253 passed, 16 skipped, 5 flaky, 4 failed (38.4m),
  exit 1. Read the original final diagnostics in
  `/tmp/rc-can-5.1-20260922-browser.log`. Persistent failures are unchanged:
  `a11y-axe-gate.spec.ts:462`, `a11y-axe-gate.spec.ts:504`,
  `canvas-arrange.spec.ts:32`, and `scene-templates.spec.ts:37`. Each still requires
  an absent spatial-canvas selector on a phone reading stacked panels. Rebasing onto
  the repaired integration branch did not resolve this ownership blocker.
- The five cases passing on retry were Android quick-map double-tap zoom, canvas home
  persistence, the 360×360 and 640px responsive route sweeps, and settings consent.
  The canvas diagnostic was context-teardown timeout; the responsive/settings cases
  timed out waiting for the runtime or main landmark. No timeout or assertion was
  weakened. Serial, zero-retry acceptance and relevant flaky-case recheck: 5 passed
  (22.9s), covering 320×640, 360×360, the 640px route sweep, `/board` mobile axe and
  the owned canvas home-persistence case. Exact output:
  `/tmp/rc-can-5.1-20260922-acceptance-recheck.log`. Command:
  `DNDTOOLS_E2E_PORT=15755 pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts tests/e2e/canvas.spec.ts
--project=mobile-chromium --workers=1 --retries=0
--grep '320x640|virtual-keyboard phone|at phone breakpoint$|a11y axe gate: /board$|materializes the home scene'`.
- Final changes relative to `370ab4c8` remain within the supplied owned paths and
  requested journal. The full browser gate remains blocked on the three excluded test
  files; the validated proposal is ready for their owners or explicit claim expansion.
  This is not an inherited CI failure cured by another retry of the unchanged tests.

## Pinned visual-gate diagnosis — 2026-09-22

- Resumed at centrally rebased `68e8da50` with a clean tree. Read the original output
  of attempt `bc9afe36-e17b-4f94-bca2-50a5d30287fc`: 129 visual tests passed and six
  failed, exclusively phone `/board` and `/scene/:id` in tavern, parchment and
  high-contrast. Desktop, rail and the other phone routes passed. No Headroom tools
  or applicable AGENTS.md were available.
- Inspected the committed and captured images. The baselines depict the old spatial
  canvases and zoom UI; the captures depict the required stacked panels, disclosure
  and full-screen controls, with the phone navigation preserved. These intentional
  changes cannot match the old screenshots while retaining the accepted phone default.
- Prepared a six-PNG binary patch outside the checkout at
  `/tmp/rc-can-5.1-visual-68e8da50/phone-baselines.patch`, using the original pinned
  container's actual captures. The proposal's `manifest.json` records before/after
  SHA-256 values. `git apply --check` passes. No repository baseline changed: the
  supplied owned paths exclude `tests/visual/__screenshots__/visual-phone`.
- Checked all 135 visual cases using an external baseline mirror (only those six
  replacements) and the repository's real visual specs/config, in the exact pinned
  Playwright image `v1.61.1-noble` with digest
  `sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`.
  Two workers, no retries, isolated port 15756. Configuration and exact output are
  `/tmp/rc-can-5.1-visual-68e8da50/playwright.config.ts` and `validation.log`.
  Fresh mobile acceptance on port 15757 is recorded in that directory's `acceptance.log`.
- Proposal result: 135 passed (3.5m), exit 0, with no retries. All other 129 baseline
  PNGs remained byte-identical to the repository copies. Fresh zero-retry mobile
  acceptance: 3 passed (15.5s), including 320×640, 360×360 and `/board` axe.
- Requested explicit ownership expansion for exactly the six proposal PNGs:
  `board--{tavern,parchment,high-contrast}.png` and
  `scene-editor--{tavern,parchment,high-contrast}.png` under
  `apps/gm-react/tests/visual/__screenshots__/visual-phone/`. Pending that response,
  only this journal changes. This is proposal validation, not a passing visual gate
  against the committed baselines. The earlier three-file browser-test owner patch
  also still passes `git apply --check` but remains outside the supplied claim.
  No dispatcher control edits, agents, source workarounds, publishing or promotion.

## Repeated visual gate; unchanged ownership blocker — 2026-09-22

- Resumed at `9374820e` with a clean tree. Read original attempt
  `f4756ab4-0545-4a1f-84c2-47b6f7d692df/output.log`: 129 passed, the same six phone
  screenshots failed (3.4m), with exactly the same pixel differences as before.
- All six current actual captures match the proposal manifest's after-SHA-256 values;
  all six committed baselines match its before-SHA-256 values. The intervening rebase
  added unrelated push-notification work; the stacked-board source and visual baselines
  are unchanged. Both prepared owner patches still pass `git apply --check`.
- The existing 135-pass pinned-container proposal validation remains relevant; no
  duplicate run or product change is justified by this identical failure. This turn
  does not claim a new passing repository visual gate. The explicit owned-path list
  still excludes the six PNGs, and no answer authorizing the requested expansion has
  arrived. The operator must expand the claim or have the baseline owner apply
  `/tmp/rc-can-5.1-visual-68e8da50/phone-baselines.patch` before rerunning this gate.
- Only this journal changes. No source workaround, assertion relaxation, dispatcher
  control mutation, additional agent, publishing or promotion.

## Phone visual baselines applied — 2026-09-22

- The worktree was clean at `34d50695`. The browser-test recovery the operator
  brief describes (`preferPhoneCanvas` helper plus one `beforeEach` in `canvas.spec.ts`,
  `canvas-keyboard.spec.ts` and `flow-layout.spec.ts`) had already been committed in
  `0bb8a893`, so no uncommitted diff remained to review. Rebased cleanly onto `loop/rc`
  `e1a2ba4b`. Since the previous base, `loop/rc` has not changed any visual baseline,
  canvas file or screen file.
- Read the original output of attempt `32758736-96cd-43b5-b5dc-e226d3e46b2d`: 129 passed.
  The same six phone screenshots failed as before (`/board` and `/scene/:id` in tavern,
  parchment and high-contrast). The failing baselines show the old spatial canvas, which
  RC-CAN-5.1 intentionally replaces on phone.
- **Boundary crossing, flagged for the operator:** applied the previously validated
  six-PNG proposal `/tmp/rc-can-5.1-visual-68e8da50/phone-baselines.patch`. The six
  files are `board--{tavern,parchment,high-contrast}.png` and
  `scene-editor--{tavern,parchment,high-contrast}.png` under
  `apps/gm-react/tests/visual/__screenshots__/visual-phone/`. They are outside the
  listed owned paths. Without them, the pinned visual gate cannot pass while the
  required stacked phone board is in place. No other baseline changed. All six
  resulting SHA-256 values match the manifest's `after` hashes. Inspected the tavern
  images. `/scene/:id` shows the scene editor's stacked panels, not the Command Center
  hash-race capture, and `/board` shows the stacked home board.
- Pinned-container visual gate, run exactly as the dispatcher runs it
  (`bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`)
  against the repository baselines: **135 passed (4.2m), exit 0**. Exact output:
  `/tmp/rc-can-5.1-20260922-visual-repo.log`.
- Zero-retry mobile acceptance on port 15761: 3 passed (16.2s). It covered
  `a11y axe gate: /board`, the 360×360 virtual-keyboard phone sweep, and the board at
  320×640. Exact output: `/tmp/rc-can-5.1-20260922-acceptance-final.log`.
- No source, assertion or dispatcher-control changes. No additional agents, publishing
  or promotion.
