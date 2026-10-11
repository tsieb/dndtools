# RC-CAN-7.9 — Retire the bespoke run screens — run journal

## Session 1 — 2026-10-10, base `a5f7c9ef`

Deps on the base: CAN-7.4 (`2be9dacf`), CAN-7.6 (`1e642795` … `515d714c`) and CAN-7.8 (`803b6ec5` …
`f4b4d6eb`) are all ancestors of HEAD. No Headroom tools were exposed in this session; command
output was read directly.

### What was still bespoke

CAN-7.6 and CAN-7.8 had already turned `/` and `/session` into reading-mode renderers of their
default flow screens (`FlowViewTile` over the flow placement; no hub or console markup left in
either file). One bespoke run surface was left: the `/board` page itself.

- `Board()` took an optional `screen`. Without one it rendered the vault's home board with no screen
  header ("GM screen" / "· your home board"), provisioned it with its own `command-center.ensure-home`
  effect, and carried that path's `screen?.… ?? t('board.title')` fallbacks.
- `BoardAlias` (`/board`) rendered that page whenever the actor was not the GM or the alias's
  provisioning write had failed. A failed write therefore put the old `/board` page on screen,
  which retried by itself and, once it succeeded, re-rendered the board outside any screen until
  the redirect fired.

### Changes

- `screens/Board.tsx`: `screen` is required, so the engine only ever renders a screen
  `/screen/:id` hands it. Deleted the provisioning effect, `ensuringRef`, the home-scene fallback
  and the `board.title` / `board.widgetCount` / `'home'` header fallbacks. The `!homeSceneId`
  guards are gone because the scene id is always set. Presets and safe points still key off
  `isHomeBoard` (the GM screen).
- `screens/screen/ScreenView.tsx` (**outside the claim, deliberately**): `BoardAlias` no longer renders
  `<Board />`. A non-GM gets `BoardPlayerNotice` as before. A failed provisioning write gets an
  honest `EmptyState` ("The {gm} screen couldn't be set up on this device.") whose Retry remounts
  the alias, so `useEnsureHomeScreen` asks again; this matches what `/` and `/session` do. This file
  was the only caller of `<Board />` without a screen, so making `screen` required breaks typecheck
  unless this file changes; it is the smallest crossing that meets "no route renders a bespoke run
  screen". Flagged for the operator.
- i18n (companion): `board.setupFailed` added (EN, ES). Four dead keys removed: `board.emptyHint`,
  `board.emptyTemplatesHint` and `board.useTemplate` have been unused since the illustrated
  first-tile onboarding (`64e71ce7`), and `session.live.badge` was unused too. No source,
  test or script references any of them. `qps-ploc.ts` regenerated with
  `tsx scripts/i18n-catalog.ts pseudo`.
- `screens/screen/BoardAlias.test.tsx` (new): covers three cases. A non-GM gets the notice and
  nothing is dispatched. A GM's successful write renders nothing (the redirect owns it). A failed
  write shows the failure with no board toolbar or widget frames, and Retry dispatches
  `ensure-home` a second time and clears it.
- Docs: NAVIGATION.md (route table wording; a new RC-CAN-7.9 paragraph replacing "`/`, `/session` and
  `/scene/:id` still render their own screens until CAN-7.6 and CAN-7.8"), WIDGETS.md §7 (the engine
  serves `/screen/:id`; flow ships; no run route draws widgets outside a screen) and the Add-gallery
  line, FEATURE-GAPS rows for Command Center, Board and Session (the table re-aligned under
  prettier; anchors unchanged, `pnpm feature-audit` 40 limits / 0 stale).

### Tried and reverted: one renderer for `/` and `/session`

`CommandCenter.tsx` and `session/index.tsx` repeat the same provisioning hook and flow-grid code.
I folded them into one exported `FlowScreenGrid` + `useProvisionedScreen` in `CommandCenter.tsx`.
Unit baselines stayed byte-identical, but the shared renderer lands in the eager `/` chunk and grew
the boot bundle by +18 B gzip (level 6, the budget script's metric) even after trimming. That breaks
"the boot bundle does not grow", so both files are back at base. The dedupe is a candidate for the
flow board's owner if `FlowBoard.tsx` grows a view-mode export.

### Boot bundle (acceptance: does not grow)

Production `vite build` of base vs candidate (`tmp/dist-*`, removed afterwards), with eager assets
classified from `index.html` exactly as `scripts/check-bundle-budget.ts` does:

- gzip level 6 (`gzipSync` default): core **1,104,682 → 1,104,634 B (−48 B)**.
- `check-bundle-budget --dist`: base 1078.8 KiB, candidate 1078.8 KiB, verdict pass.
- Per asset: `en` −50 B (four dead keys out, one key in), `index` −4 B, every other eager asset ±3 B
  (hash-name noise). Board and ScreenView are lazy.

### Local checks

- `pnpm typecheck` (app) exit 0.
- `pnpm test:app`: 182 files / 2248 tests, exit 0. This includes the CommandCenter and Session
  baselines (unchanged) and the new BoardAlias test.
- `pnpm lint` exit 0 (15 warnings, none in changed files). An earlier run was red only because my
  `tmp/dist-*` build output sat in the worktree `tmp/`, which `eslint .` scans; it passed once that
  was removed.
- `pnpm gates` exit 0 (file-size warnings only; Board.tsx is 682 lines, down from 714).
- `pnpm feature-audit` exit 0. Prettier is clean on every changed file.

### E2E

All runs used `DNDTOOLS_E2E_PORT=<free port>` and `--workers=4`, on candidate `e758a4d1` (the same
tree as this commit apart from the journal).

- Targeted, both profiles: `screens`, `session-action-bar`, `board-layouts`, `pinned-screens`,
  `canvas`, `add-panel`, `scene-templates`, `session-quick-panel-routes` and
  `command-center-polish`. **141 passed, 9 skipped** (profile-specific), exit 0.
- **Full suite, both profiles** (`--project=desktop-chromium --project=mobile-chromium`, 2,020
  tests, 30.5 min): **1,976 passed, 43 skipped, 1 failed**. The failure was
  `tile-resize.spec.ts:120` "a builtin inspector offers working Small, Medium and Large presets"
  (desktop). It timed out waiting for the inspector's Transform tab after Enter on a focused tile
  in the **scene editor** (`/scene/:id`), which this change does not touch.
- That test is a base flake. Candidate, `tile-resize.spec.ts` ×5 on both profiles: 29 passed,
  1 failed (the same test, mobile). **Base `a5f7c9ef`** (base sources restored in the working
  tree, then put back): `tile-resize.spec.ts:120` ×15 on both profiles gave **6 failed / 24 passed**
  (20%) with the same timeout. Not caused by this change, and not fixed here (`sceneEditor` is
  outside the claim). It looks like the keyboard-listener race in
  `project_combat_keyboard_listener_race`: Enter on a just-focused frame before the listener is
  attached.

### Left for the operator

- **POL surfaces**: the RC_ROADMAP POL story texts (RC-POL-1.1 "Command Center", RC-POL-1.2 "GM Screen
  board", RC-POL-1.4 "Session") still describe the surfaces by their old names. `RC_ROADMAP.md` is
  neither owned nor a companion path, and the wording is not an acceptance item, so it is unchanged.
  NAVIGATION.md's POL gap table (`/session` → RC-POL-1.4) is still accurate.
- **Run the table entries**: `sectionPath` (CAN-7.4, `app/shell/sections.ts`, not owned) already
  opens the Command Center and Session screens' `/screen/:id`. Its GM-screen lookup asks for a
  `gm-screen` default origin that provisioning never writes, so the GM Screen entry opens `/board`,
  which resolves to the same `/screen/:id` in one replaced entry. No user-visible gap, but the
  dead key is CAN-7.4's to tidy.
- No push, promotion, loop launch, extra agents or dispatcher control-state change.

## Session 2 — claim-fence rework — 2026-10-10, base `a5f7c9ef`

Gate feedback: the candidate changed `apps/gm-react/src/screens/screen/ScreenView.tsx`, which is
outside the claim. The acceptance criteria do not need that file, so it is **reverted to base**.
The base `BoardAlias` is unchanged and still renders `<Board />` for a non-GM or after a failed
provisioning write. What it gets back is now decided entirely inside the owned `Board.tsx`:

- `Board({ screen })` takes an optional `screen` again, but only to choose between two components.
  `ScreenBoard` (the engine, which needs a screen) renders when one is handed in.
  `GmScreenUnavailable` renders when none is: a non-GM gets `BoardPlayerNotice`; for the GM it is
  the honest "The {gm} screen couldn't be set up on this device." with a Retry. Retry dispatches
  `command-center.ensure-home` and is disabled while that write is in flight. Once the write is
  accepted it renders nothing, and `ScreenRouteAliases` takes `/board` to the screen.
- The bespoke page stays deleted: no home-scene fallback, no provisioning effect of its own, and no
  board without a screen header. No path outside the claim changes. The companion paths still
  touched are the i18n catalogs, `BoardAlias.test.tsx` and NAVIGATION/WIDGETS.
- `BoardAlias.test.tsx` mounts the **base** `BoardAlias`. The test docblock was reworded, and its
  three cases pass. Negative control: with the base `Board.tsx` swapped in, the failed-write case
  fails (the bespoke board renders), 1 failed / 2 passed. The candidate was restored afterwards.
- NAVIGATION.md: the `/board` sentence now names `GmScreenUnavailable` for the two fallback states.

### Checks on the reworked tree

- `pnpm typecheck` (app) exit 0; `pnpm test:app` 182 files / 2248 tests, exit 0; `pnpm lint` 0
  errors (15 warnings, none in changed files); `pnpm gates` passed; Prettier clean.
- Boot bundle: core **1,104,629 B** gzip (level 6), base 1,104,682 (**−53 B**); `check-bundle-budget`
  1078.8 KiB, pass. `tmp/dist-after` was removed afterwards.
- E2E on both profiles (`--workers=4`, free `DNDTOOLS_E2E_PORT`): `screens`, `session-action-bar`,
  `board-layouts`, `pinned-screens`, `canvas`, `add-panel`, `scene-templates`,
  `session-quick-panel-routes`, `command-center-polish`, `responsive`, `combat-tile` and
  `demo-vault` gave **310 passed, 16 skipped, 0 failed**. The only dev-server console error is the
  existing React `border`/`borderColor` shorthand warning; this change adds no styles.
- The Session 1 full-suite run (1,976 passed, 1 base flake) predates this rework. Since then the
  only differences are the screen-less branch of `Board` and the reverted `ScreenView.tsx`;
  `/screen/:id` renders exactly as in that run.

## Session 3 — post-rebase visual-gate feedback — 2026-10-10

Starting HEAD: `d0ba30c20ebdc59778e4f49b9e6736dd834c777f`; worktree clean.
No dispatch Headroom tools are exposed; diagnostics below use original command output.

Read the supplied gate log at
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/8076025e-3eb5-4a73-8b51-a4d1ec9b6199/output.log`.
It reports 544 passed / 2 failed: desktop dungeon keyboard shortcuts and rail high-contrast
Extensions. Both failures time out after 5 seconds waiting for element stability during screenshot
capture, after fonts load; neither reports a pixel difference. These surfaces are outside the task
claim. No baselines, tolerances, retries or shared test configuration have been changed.

Added a BoardAlias regression case covering an in-flight Retry, suppression of duplicate clicks,
a second storage failure, and successful recovery on the next attempt. Throughout failure and
pending states no board toolbar or widget is mounted. FEATURE-GAPS now explicitly maps
RC-POL-1.1/1.2/1.4 to the replacement screen surfaces and preserves shell ownership under POL-1.23.
No runtime source changed in this follow-up, so it cannot change the measured boot bundle.

Validation in progress:

- Repeated pinned-container palette/help and Extensions specs, all three tiers, 3 repetitions,
  2 workers: `/var/tmp/rc-can-7.9-visual-focused.log`.
- Full functional e2e, desktop and mobile, 4 workers:
  `/var/tmp/rc-can-7.9-e2e.log`.
- Focused BoardAlias unit test: `/var/tmp/rc-can-7.9-unit.log`.
- Feature inventory audit: `/var/tmp/rc-can-7.9-feature-audit.log`.

The initial two-worker functional run was deliberately interrupted to use the repository's
four-worker local cap. Its output is retained at `/var/tmp/rc-can-7.9-e2e-interrupted.log`; it is
not a passing run. The four-worker run starts the full suite from scratch.

Completed checks: BoardAlias 4/4 tests passed; feature-audit all 40 limit anchors valid;
`pnpm gates` passed (existing file-size warnings only); changed-file Prettier and focused ESLint
passed.

App `typecheck` passed (exit 0). Repeated focused pinned visual comparison completed with
**180 passed**, exit 0, in 11.6 minutes. This includes each originally failing case three times
in its reported tier and both files across all three tiers; neither timeout reproduced.
Started the complete pinned gate with `--update-snapshots=none --workers=2`, original output
at `/var/tmp/rc-can-7.9-visual-full.log`. The full functional run is still in progress.

The full functional run reproduced `tile-resize.spec.ts:120` on desktop. The original failure
artifact (`apps/gm-react/test-results/tile-resize-a-builtin-insp-af9f2-ll-Medium-and-Large-presets-desktop-chromium/error-context.md`)
shows `Edit layout`, not `Done`: the editor was not editing when Enter was pressed. Inspection of
`gotoRoute` shows it waits for the runtime and an attached shell h1, not the destination route.
The previous board has the same Edit layout button and tile IDs, so the test can interact with
that outgoing board while the lazy editor mounts. This evidence supports a navigation-readiness
race rather than Session 1's tentative keyboard-listener explanation.

Companion e2e repair: wait for `scene-editor-stage` after navigating, then assert `Done` after
clicking Edit layout. All keyboard selection and resize/persistence assertions remain intact;
no sleeps, retries, application changes or relaxed checks. Repeating the affected case 15 times
on each profile with an isolated port/output directory:
`/var/tmp/rc-can-7.9-resize.log`. The in-progress full run remains recorded as a failure even if
its remaining tests pass; a focused rerun does not turn it into a green full-suite result.

The repaired resize case passed **30/30** (15 desktop + 15 mobile), exit 0, in 2.1 minutes.
The full run's original desktop failure and this separate focused result are kept distinct.

The complete visual run hit a different case: phone `atlas empty dungeon`. The original error
context, preserved at `/var/tmp/rc-can-7.9-atlas-error-context.md`, reports a 5-second
`toBeVisible` timeout for the map-library illustration; the page still reads "Loading your vault…".
It failed before screenshot comparison, not on pixel differences. No Atlas or shared visual-test
source has changed. Both originally reported visual failures passed in this full run.

Later in the full visual run, phone high-contrast `/board` and `/characters` reported pixel
mismatches. Inspected both actual PNGs: each captured the shell around "Loading your vault…",
not route content. `App.tsx` uses the same Boot status for its lazy-route Suspense fallback, so
`window.__rt.loaded`, a shell heading, fonts and network idle do not prove the route has rendered.
Added an explicit assertion that this status is hidden, using the existing 20-second boot budget,
in the golden-route settle helper and Atlas open helper. No application code, snapshot, pixel
tolerance, retry count or global timeout changed. These companion visual fixtures now fail on an
unresolved loading state instead of comparing it to the completed route.

Both long-running command sessions returned exit 143 before their summaries; the functional log
stops during the phone navigator cases, so that full e2e run is incomplete. The pinned visual
container itself remained running after its attached command exited. Capturing its original
container output and exit status separately at `/var/tmp/rc-can-7.9-visual-full-container.log`
and `/var/tmp/rc-can-7.9-visual-full-container.exit` to recover its actual result.

Recovered complete visual result: **543 passed / 3 failed**, container exit **1**, 31.1 minutes.
Only the Atlas and two golden-route loading-state cases above failed. Original artifacts are
preserved under `/var/tmp/rc-can-7.9-visual-failures/`. Rerunning both repaired visual files,
all themes and all three tiers, with snapshot updates disabled:
`/var/tmp/rc-can-7.9-visual-repaired.log`.

### Final follow-up results and handoff

- Repaired Atlas + golden-route visual files: **225 passed**, exit 0, 7.9 minutes, all three
  tiers and every theme in those files; `--update-snapshots=none --workers=2`.
- Originally reported palette/help + Extensions cases: **180 passed**, exit 0, three repetitions
  across all tiers. No snapshot was changed.
- Resize inspector after route-readiness repair: **30 passed**, exit 0 (15 per functional profile).
- BoardAlias recovery coverage: **4 passed**, exit 0.
- App typecheck, feature-audit (40 valid limit anchors), quality gates, changed-file formatting,
  focused ESLint and `git diff --check` passed. Final command outputs are under
  `/var/tmp/rc-can-7.9-{gates-final,format-final,lint-final}.log`.
- The interrupted full e2e output contains 1,643 passes, 36 skips and the pre-repair desktop
  resize failure. It is **not** a completed or green full-suite result. Central validation must
  rerun the full suite on both profiles at the committed head.
- The recovered full visual gate was 543/546 before the readiness fixes. Its failures are all
  included in the subsequent 225/225 repaired-file run, but that run is not a second full gate.
- The retirement implementation from the prior commits remains intact. This follow-up changes
  test fixtures, POL mapping documentation and this journal only, so the boot bundle is unchanged
  from the starting candidate. No push, promotion, additional agent, dispatcher control-state
  mutation or new dispatcher loop was performed.
