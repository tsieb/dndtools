# RC-CAN-8.4 run journal

## 2026-10-11 — implementation

- Clean task worktree at start; no Headroom tools exposed. Native command output is the evidence.
- Inspected the screen board, separate editor, alias handling, title hook, seed command, and dispatcher companion-path list (read only).
- Consolidating editor tools into the screen board while retaining its bounded/flow engine, layouts, safe points, and undo behavior. `/scene/:id` screen bookmarks will replace history with `/screen/:id?edit=1`; template editing stays separate.
- Scope gap: `app/shell/TopBar.tsx` and core `state/command-center-state.ts` are outside owns + companions. Asked for explicit authorization; dependent edits pending. No dispatcher state changes.
- Validation pending.

### Implemented within the fence

- Screen bookmarks redirect outside Suspense, preserving query parameters and navigation state,
  replacing history, and adding `edit=1`. A listed screen never mounts the separate scene editor;
  template scenes retain it. The screen-open-editor action is removed.
- The screen board's URL controls edit mode. One toolbar now exposes layout policy, details and
  player preview. The shared details/background and selected tile/binding inspectors use the
  board's existing commands and undo stack. Preview uses the actor-filtered read and makes the
  stage inert; a DM-only screen and unsaved details remain mounted and return on exit.
- The library/switcher/board use the stored scene name. Screens-library and `/board` provisioning
  supply `DM screen`; existing names are preserved. App's ENG-9.1 title hook reads the same name.
- NAVIGATION.md records the new route/edit contract. New two-profile e2e covers the redirect,
  single toolbar, aria controls, title, metadata/background/layout persistence, preview draft
  preservation, screen switching, and tile binding/transform access.

### Validation so far

- Focused screen unit tests: 19 passed (`/var/tmp/rc-can-8.4-unit-final.log`).
- App typecheck: passed (`/var/tmp/rc-can-8.4-typecheck-final.log`).
- Focused ESLint: clean (`/var/tmp/rc-can-8.4-lint-final.log`).
- Quality gates initially rejected Board.tsx over 800 lines. Extracted its presentational toolbar
  into the owned SceneToolbar.tsx; rerun passes (`/var/tmp/rc-can-8.4-gates-final.log`).
- Final screen-editing + screens + board-layouts e2e: 22 passed on desktop/mobile
  (`/var/tmp/rc-can-8.4-e2e-final.log`). The earlier six failures were incorrect accessible-name
  expectations in the new test; the test now uses the existing control's actual label.
- Pinned visual comparison of `/board` and `/scene/:id`, all three themes/tiers: 18 pixel
  mismatches (`/var/tmp/rc-can-8.4-visual.log`). Inspected phone actual images: the old editor link
  is gone and the scene bookmark now opens screen edit mode as intended. Baselines are unchanged;
  finish the pending shell/header work before reviewing and refreshing these goldens. This is
  not a passing visual gate. The final compact details icon follows this comparison.
- Full app suite and updated player-preview e2e are running; outcomes to follow.

### Pending claim decision

The missing shell-heading and global seed changes are prepared, but NOT applied, at
`/var/tmp/rc-can-8.4-scope.patch`. TopBar must consume `useScreenRouteName()` instead of only the
section label. The home-board builder must seed `DM screen` while leaving the distinct default
Command Center flow screen's name intact. These require the two paths requested above. No answer
has arrived; permission has not been inferred. Existing route-title e2e still expects section
labels and will need the new named-header expectations when that patch is authorized. Legacy
scene-editor e2e and visual fixtures also need migration to the unified screen route.

### Broader checks

- Full `pnpm test:app`: **187 files / 2,278 tests passed**, exit 0
  (`/var/tmp/rc-can-8.4-app.log`). Deliberate error-boundary test stderr is not a suite failure.
- The updated player-preview tests initially passed the shared-scene isolation cases and failed
  the two DM-only cases. The original error contexts show the library still displayed when
  preview began: its card heading satisfied the old readiness assertion before the screen
  committed. Added an explicit `screen-stage` readiness assertion before entering preview;
  the rerun is `/var/tmp/rc-can-8.4-preview-final.log`. No timeout or retry was relaxed.

- Updated player-preview isolation e2e: **4 passed**, both profiles, exit 0 after the explicit
  stage-readiness fix. Original rerun output: `/var/tmp/rc-can-8.4-preview-final.log`.
- Changed-file Prettier and `git diff --check` pass. No snapshots were rewritten.
- **Incomplete acceptance / handoff:** the shell still reads `Screens`, because its owner file is
  outside the claim. The global home seed (including provisioning initiated outside useScreens)
  still uses its prior core default. The two-path authorization request remains unanswered.
  Do not promote this as completed RC-CAN-8.4. Apply/review the prepared patch only after the claim
  is extended, migrate the remaining old scene-editor route expectations, then run the exact-head
  functional and pinned visual gates and review updated baselines.
- No push, promotion, new loop, additional agent, or dispatcher control-state mutation occurred.

## 2026-10-11 — visual gate follow-up

Starting at clean `d1e033c7`. No Headroom tools exposed. Read the original central gate log
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/648ac893-1b26-496a-ae10-88307b77899b/output.log`
and preserved its available artifacts under `/var/tmp/rc-can-8.4-followup/central-visual`.

Confirmed obsolete visual fixture behavior: `/scene/:id` now redirects into edit mode, so the
inspector spec must assert Done instead of clicking Edit layout, use the single screen toolbar,
and open the details drawer explicitly. The obsolete phone More editing tools menu is replaced
by coverage of the screen's preview menu. Golden bookmark captures now explicitly await the
canonical URL and editor toolbar. No tolerances, retries or global timeouts change.

The companion-path list still excludes TopBar.tsx and command-center-state.ts. The pending scope
request was not answered by this gate-feedback message; these files remain unchanged.

### Follow-up fixes and evidence

- Migrated the focused binding, section-preview, flow, and tile-resize tests to the canonical
  screen route. Wait for the committed edit toolbar before keyboard input; preview is an edit-mode
  control, so binding coverage closes the inspector rather than leaving edit mode first.
- Review of the first generated phone menu image caught clipping: the right-aligned preview menu
  hung left of the viewport when its trigger wrapped to the start of a row. Moved the trigger to
  the trailing edge in the owned ScreenToolbar and added an on-screen bounds assertion before the
  menu screenshot. Reviewed the corrected phone menu/toolbar, details/inspector, rail editor,
  library, and Layouts captures. Replaced the five obsolete phone More-tools captures with preview
  menu captures. The add-panel scholar delta is at its rounded corners over the changed toolbar.
- Focused functional checks exposed a real flow integration defect: Board applied the canvas's
  nonnegative y clamp to flow reading-order keys. Move-back before row zero needs a negative key;
  clamping produced tied positions and UUID-dependent ordering. Flow now preserves both keys,
  and the drag/menu e2e asserts the durable negative ordering as well as DOM order.
- Tile-menu tests now scroll a tile into view before opening its scroll-dismissed menu. Content
  containment checks read both rectangles in the same browser frame, preserving the 1px bounds
  while avoiding comparing different points during the post-edit scroll. Size preset coverage
  positions its fixture in the first bounded column, where every preset fits.
- Original rerun diagnostics are retained in `e2e-rerun.log` and `interaction-fix.log` under
  `/var/tmp/rc-can-8.4-followup`; the latter passed 19/20 with the sole remaining rectangle timing
  failure. No tolerance, retry, or global timeout was relaxed.
- Final focused unit run: 3 files / 24 tests passed (`unit.log`). App typecheck and quality gates
  exited 0 (`typecheck.log`, `gates.log`); focused ESLint is clean (`lint.log`).
- Final reviewed snapshot update: 42 passed (`visual-menu-fix.log`); panel updates: 18 passed
  (`visual-panels-update.log`). These are update runs, not evidence of a passing comparison.
- The first broad comparison was stopped after the phone-menu review required a source fix.
  The final full pinned comparison is `visual-final.log`, running with snapshots disabled and
  four workers. Final focused two-profile functional run is `e2e-final.log`; outcomes pending.

- Final focused functional verification: **52/52 passed**, desktop and mobile, exit 0
  (`/var/tmp/rc-can-8.4-followup/e2e-final.log`). This covers screen aliases, titles, one toolbar,
  details/preview, stored naming, bindings, actor isolation, flow movement, resizing, and layouts.
- Focused ESLint, changed-file Prettier and `git diff --check` pass. Typecheck and quality gates
  also passed after the two source fixes. The existing MapTile overflow shorthand warning appears
  during preview but did not fail these tests; its source is unchanged.

### Final visual result and handoff

- Full pinned visual comparison, snapshots disabled: **546/546 passed in 12.4m**. Original output:
  `/var/tmp/rc-can-8.4-followup/visual-final.log`. Playwright `.last-run.json` reports `passed`
  with no failed tests. Original Podman events in `container-events.jsonl` confirm container
  `91339a2d1f4e8d880e839bdf015e4b6e7760ca75968e761a7903461e9bebb97e` exited **0**.
- The outer exec session nevertheless reported **143** on collection. Preserve that discrepancy:
  the browser suite and container passed; do not describe the outer command as exit 0. Central
  validation must still run its wrapper on the committed candidate.
- All changed paths checked against owns + companions; none outside the fence. No push,
  promotion, additional worker, new loop, or dispatcher control-state edits.
- **Acceptance still incomplete:** the shell heading and global default home seed require the
  excluded `apps/gm-react/src/app/shell/TopBar.tsx` and
  `packages/core/src/state/command-center-state.ts`. The claim decision recorded above remains
  pending. The visual regression feedback is addressed, but this is not a completed RC-CAN-8.4
  until those authorized source changes and the named-header assertions land.
