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
