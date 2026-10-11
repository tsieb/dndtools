# RC-SES-7.2 — Show the scene to everyone: a default for what players see

Run journal. Branch `dispatch/dndtools/a0f5dd555cc84e209603`, rebased onto `e97943c2`.
No push, promotion, dispatcher-state change or additional agent.

## Design (as of attempt 3)

- **Core command `session.project-table-view`** (`commands/player-view.ts`). Payload
  `{ sceneId: string | null }`. DM-only. A scene sets the TABLE VIEW (`session.tableView`, the
  default for what players see) and, in the same accepted result, assigns that scene to every
  registered player and observer (one `session.project-player-view` op per participant, so the
  mobile catch-up classifier and the per-player reads need no change, plus one
  `session.project-table-view` op for the default). `null` clears the default and revokes every
  assignment. Refused fail-closed (`hidden-target`) for a DM-only scene, a template and a default
  GM workspace (RC-CAN-7.8), the same set the Stage panel already leaves out.
- **The per-player command stays** for exceptions: a later per-player assignment overwrites that
  one participant only; the next "Everyone" choice replaces every assignment again.
- **Later joiners inherit** the table view: `inheritTableView` (player-view.ts) wraps
  `permission.add-players` and `permission.assign-role` in `dispatch.ts` (a manifest companion), and
  assigns the default to any participant who became a player/observer in that command and has no
  view of their own.
- **Start session** shows the table the active scene: `applyTableViewOnWorkflow` (player-view.ts)
  wraps `session.set-workflow` in `dispatch.ts`. A start (Standby or Prep → Live) on a scene
  players may see assigns it to the whole table in the same accepted result, unless the payload
  passes `showToTable: false` (new optional field on `setSessionWorkflowInputSchema`, a companion
  path) or a table view chosen in Prep is already set. A DM-only scene starts with nothing shown.
  A resume (`paused → active`) is not a start. Every reset transition (`idle`, `recap`,
  `archived`) clears the table view, as the core's reset clears the assignments.
- **Storage**: `SessionState.tableView?: SessionTableView | null`, declared by module augmentation
  in the owned `queries/player-view-control.ts` (beside `SessionTableView` and its only reader).
  Optional and additive, so a persisted vault hydrates unchanged (coreStore and SceneRuntime spread
  the persisted session).
- **UI**: Stage panel "Everyone" row (`TableViewRow` in `ProjectionControl.tsx`, mounted first in
  `ActiveMap.tsx`), companion `Home.tsx` "Your {gm} has not shown a scene yet." when live and empty.

## Progress log

- **Attempt 1.** Core command, joiner inheritance, Everyone row, Start-session checkbox in the
  dialog, companion copy, reducer + e2e + docs. Verified: core 5348/5348, related e2e 156/156 on
  both profiles, visual 264/264 in the pinned container (no baseline changed), `pnpm lint` exit 0.
- **Attempt 2** (gate: rebase onto `e97943c2` conflicted in FEATURE-GAPS.md). My sentence widened
  the Session cell past the table's longest, so prettier re-padded all 24 rows. Rebased, took the
  integration branch's file and re-applied the note inside the cell's existing padding (one-line
  diff).
- **Attempt 3** (gate: four paths outside the claim — `SessionBody.tsx`, `Lifecycle.tsx`,
  `session-control.ts`, `session-state.ts`). None is needed for the acceptance criteria, so all
  four are reverted to `e97943c2` and the behaviour moved in-claim:
  - `session-state.ts` → the `tableView` field is a module augmentation in the owned query file.
  - `session-control.ts` (reset clears the table view) → `applyTableViewOnWorkflow` clears it on
    every reset transition, wired in the companion `dispatch.ts`.
  - `Lifecycle.tsx` / `SessionBody.tsx` (the dialog checkbox and its dispatch) → the core applies
    "Show <scene> to the table"'s default to the start itself, so every Start session (the dialog,
    the top bar) shows a shared scene to the table with no app-side dispatch. The top bar's own
    follow-up dispatch was removed; the unused `session.start.showToTable*` keys were dropped (EN,
    ES, pseudo regenerated).
  - Reducer suite `packages/core/tests/player-view-table.test.ts` now 11 tests: the 8 from attempt
    1 plus Start session shows a shared scene in the same result; `showToTable: false` and a
    DM-only scene start with nothing shown; a Prep-chosen table view is kept and a resume is not a
    start.
  - e2e `table-view.spec.ts`: the acceptance test drives the dialog's Start session on the shared
    scene, with no Stage-panel interaction, then overrides one player from their row; the second
    test starts on the DM-only scene (companion says the {gm} has not shown a scene yet, Everyone
    row empty) and fills the stage from the Everyone row.
  - Verified: core `tsc` clean, core 295 files / 5348 tests (the RC-SES-6.1 lockstep test caught a
    `session.workflow === 'active'` read in commands/; the hook now reads the requested transition
    from the payload instead). App `tsc` clean; app session/play/i18n/net unit tests 92/92 (Session
    baseline snapshots unchanged from attempt 1: only the Everyone row). e2e `table-view` 4/4 on
    both profiles; negative control (start hook short-circuited) fails the acceptance test with the
    stage reading "Your DM has not shown a scene yet." Related e2e (player-view, session-lifecycle,
    golden-path, first-session-guide, session-standby, player-join-first, companion-sheet,
    companion-preview, collab, combat) 224/224 on both profiles. Changed paths are now all owned or
    manifest companions.

## Handoffs

- `packages/core/src/lifecycle/session-workflow.ts` does not list `session.project-table-view` in
  `SESSION_COMMAND_AVAILABILITY` (a `Partial` map; nothing reads it for this command). Adding
  `'always'` beside `session.project-player-view` is a one-line follow-up for the owner.

## Review revision — Start-session opt-out

- Independent review confirmed the missing checkbox is required. The explicit revision request
  supersedes the earlier attempt's decision to defer the two UI files outside the original claim.
- Added the localized “Show {scene} to the table” checkbox to `Lifecycle.tsx` and forwarded its
  boolean through `SessionBody.tsx`. Eligibility uses core `canShowSceneToTable`; shared scenes
  default checked, private scenes are unchecked and disabled. Choices persist per scene while the
  dialog is open and reset on reopen.
- Extended fake-LAN acceptance coverage to assert the default, private-scene refusal in the UI,
  and an unchecked start leaving the connected companion live with an empty stage.
- Validation completed for this revision (original command logs inspected):
  - `pnpm --filter @dndtools/core exec vitest run tests/player-view-table.test.ts tests/player-view-control.test.ts`: 15 passed.
  - `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/table-view.spec.ts --workers=2`: 6 passed, desktop and mobile over fake LAN.
  - `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/i18n`: 47 passed.
  - `pnpm --filter @dndtools/gm-react typecheck`: passed.
  - Targeted ESLint, Prettier check for all eight changed files, and `git diff --check`: passed.
  - `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh -g session`:
    30 passed in the pinned container; no baseline changes. This focused visual run covers the
    Session screen; the new dialog checkbox is exercised by the fake-LAN tests.
- Full wrapper gates and independent review remain the central operator's next step. No push,
  promotion, dispatcher control-state edit, or additional agent.

## Claim self-heal round 1

- The scheduler widened the claim to include `app/widgets/builtin/SessionBody.tsx` and
  `screens/session/Lifecycle.tsx`. Verified that implementation commit `618f933db` is still HEAD
  and the working tree was clean at resumption. Both UI changes are retained unchanged; they
  implement the required Start-session sharing option and its command payload only.
- The reported blocker was the claim fence, not a functional or validation failure. No additional
  product changes are necessary for this feedback. The focused validation recorded above applies
  to the unchanged implementation; this round updates only this journal and checks its formatting.
- Ready for the central operator's wrapper gates and independent review under the widened claim.

## App-gate repair — actor-scoped sharing status

- Read the original app-gate log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/cdc2ba18-b2df-4919-bd7e-42344757321a/output.log`.
  Its eight failures are all in `widgets/parity.test.ts`: the checkbox introduced three unexposed
  reads (`canShowSceneToTable`, `scenes.scenes`, and its dynamic entry) in the Session builtin.
- `SessionBody.tsx` now uses the existing actor-scoped `listScenesForActor` query to identify
  shared scenes among the already-filtered startable choices. Templates and GM workspaces remain
  excluded by `useSessionScenes`; core command validation remains authoritative. The checkbox,
  default, opt-out payload, and translations are retained. No parity ledger exception or gate
  relaxation was added.
- Verified from original command logs and process exit status:
  - Focused `widgets/parity.test.ts`: 41 passed.
  - `pnpm test:app`: 187 files / 2278 tests passed (exit 0).
  - Fake-LAN `table-view.spec.ts`: 6 passed across desktop and mobile, including default sharing,
    private-scene refusal, per-player override, and unchecked start (exit 0).
  - App typecheck, targeted ESLint, changed-file Prettier, and `git diff --check`: passed.
- This repair changes only the sharing-status query and this journal. No rendering or baseline
  change, core edit, parity exception, or dispatcher mutation. Central wrapper validation and
  independent review remain pending for the new commit.
