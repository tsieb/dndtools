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
