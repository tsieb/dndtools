# RC-SES-7.2 — Show the scene to everyone: a default for what players see

Run journal, attempt 1. Branch `dispatch/dndtools/a0f5dd555cc84e209603`, based on `961797370`.
No push, promotion, dispatcher-state change or additional agent.

## Design

- **Core command `session.project-table-view`** (`commands/player-view.ts`). Payload
  `{ sceneId: string | null }`. DM-only. A scene sets the TABLE VIEW (`session.tableView`, the
  default for what players see) and, in the same accepted result, assigns that scene to every
  registered player and observer (one `session.project-player-view` op per participant, so the
  mobile catch-up classifier and the per-player reads need no change, plus one
  `session.project-table-view` op for the default). `null` clears the default and revokes every
  assignment. Refused fail-closed (`hidden-target`) for a DM-only scene, a template, and a default
  GM workspace (RC-CAN-7.8) — the same set the Stage panel already leaves out.
- **The per-player command stays** for exceptions: a later per-player assignment overwrites that
  one participant only; the next "Everyone" choice replaces every assignment again.
- **Later joiners inherit** the table view: `inheritTableView` (player-view.ts) wraps
  `permission.add-players` and `permission.assign-role` in `dispatch.ts` (a manifest companion), and
  assigns the default to any participant who became a player/observer in that command and has no
  view of their own.
- **Storage**: `SessionState.tableView?: SessionTableView | null` — optional and additive, so a
  persisted vault hydrates unchanged (coreStore and SceneRuntime spread the persisted session). A
  session reset (`resetLiveSessionFields`) clears it with the assignments it seeded.

## Progress log

- **Core** (`71ee3b74`). `session.project-table-view` + `inheritTableView` + controller
  `tableView`/`shareable` fields. New reducer suite `packages/core/tests/player-view-table.test.ts`
  (8 tests): atomic assignment (one table op + one op per participant, one result), replacement on a
  new table scene, DM-only refused `hidden-target` with `nextState === state`, unknown scene /
  player / observer refused, later joiner inherits via `permission.add-players` and via
  `permission.assign-role` (co-DM → observer), no inheritance without a table view, per-player
  override survives the table view and a later joiner, `null` takes it down, an `idle` reset clears
  it. Full core suite: 295 files / 5348 tests pass.
- **UI** (`506bc2cc`). `TableViewRow` (Everyone row, only shareable scenes, "— none —" clears) at
  the top of the Stage panel (`ActiveMap.tsx`); `ShowToTableOption` on the Start-session dialog,
  checked by default, disabled with the reason for a DM-only scene; the top bar's one-press start
  takes the default; companion `Home.tsx` says "Your {gm} has not shown a scene yet." when live and
  empty. EN/ES keys + regenerated `qps-ploc.ts`. Session baseline DOM snapshots gain only the
  Everyone row (checked by diffing every changed line before `-u`).
- **e2e** `apps/gm-react/tests/e2e/table-view.spec.ts`, both profiles, fake LAN: 4/4 pass.
  Negative control: with the start-time dispatch disabled, the acceptance test fails with the stage
  reading "Your DM has not shown a scene yet." Related specs (player-view, session-lifecycle,
  golden-path, first-session-guide, session-standby, player-join-first, companion-sheet,
  companion-preview, collab): 156/156 pass on both profiles.
- **Docs** (`2776a352`). ARCHITECTURE.md §2 "What players see"; FEATURE-GAPS Session row.
- **Visual** (pinned container, `session-polish`, `golden-routes`, `play-polish`, `player-polish`
  on all three tiers): 264/264 pass, no baseline changed. Repo `pnpm lint` exit 0 (pre-existing
  emphasis warnings only); `format:check:changed` clean after formatting this journal.

## Crossings (outside `Owns`, each needed by an acceptance criterion)

- `packages/core/src/state/session-state.ts` — the optional `tableView` field and its type. "Later
  joiners inherit the table view" needs the default stored somewhere durable; a session with no
  players yet (the usual Start session) has no assignment to derive it from.
- `packages/core/src/commands/session-control.ts` — one line in `resetLiveSessionFields` so a reset
  clears the table view with the assignments it seeded (otherwise next week's joiners would inherit
  an ended session's scene).
- `apps/gm-react/src/screens/session/Lifecycle.tsx` and `apps/gm-react/src/app/widgets/builtin/SessionBody.tsx` — the Start-session dialog and its dispatch, which is the "Start session" the
  acceptance e2e drives. The option component itself lives in the owned `ProjectionControl.tsx`;
  these two files only mount it and dispatch after an accepted start.

## Handoffs

- `packages/core/src/lifecycle/session-workflow.ts` does not list `session.project-table-view` in
  `SESSION_COMMAND_AVAILABILITY` (a `Partial` map; nothing reads it for this command). Adding
  `'always'` beside `session.project-player-view` is a one-line follow-up for the owner.

## Attempt 2 — rebase onto `e97943c2`

- Gate feedback: rebasing onto `e97943c2` conflicted in `docs/requirements/FEATURE-GAPS.md`. Cause:
  my sentence widened the Session cell past the table's longest, so prettier re-padded all 24 rows
  and collided with the integration branch's own table edits.
- Rebased onto `e97943c2`; resolved by taking the integration branch's file and re-applying the
  note inside the Session cell's existing padding (93 of 97 spare characters), so the edit is now a
  one-line diff that cannot re-pad the table. No other conflicts; `qps-ploc.ts` regenerates
  unchanged.
- Post-rebase checks: core `tsc` clean, core suite 295 files / 5348 tests pass; app `tsc` clean;
  app session/play/i18n unit tests 92/92 (Session baseline snapshots unchanged); e2e
  `table-view`, `player-view`, `session-lifecycle`, `player-join-first` on both profiles 46/46.
