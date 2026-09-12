# RC-SES-6.1 run journal

- Scope: the twelve owned core/app files plus companion tests; no delegation, push, promotion or dispatcher changes.
- Native Bash/Read used for reads and command output (dispatch Headroom tools not loaded). Full logs kept at `/tmp/rc-ses-6-1-{core,app,tooling}.log`.

## What changed

- `lifecycle/session-workflow.ts`: every former `live-session` and `dm-admin` command is `always`; the category type is now `lifecycle | always`. New `SESSION_LIVE_ONLY_EFFECTS` (session clock, audio automation + SFX, session-start triggers), `isLiveWorkflow`, the additive `SessionWorkflowStamp` field, `stampWorkflow` and `happenedLive`.
- Guards removed from dice, combat (incl. combatant management), character combat resources, handout delivery, `session.record-dice`, `session.project-active-map`, the quick-panel timer and session-writing widget commands. The palette's "Project active map" no longer requires live.
- Records stamped with the workflow they happened in: every dice roll (incl. legacy `record-dice`), every new encounter-log entry (stamped centrally in `combat.ts` `withCombat`, so tracker-generated expiry entries are covered too) and every handout delivery.
- Archive on recap/archived keeps only live records: rolls, encounter-log entries, and handouts with at least one live delivery. Capture and recap both read this archive, so neither sees a Standby roll.
- `state/audio-automation.ts`: `AudioAutomationTrigger.sessionWorkflow`; a trigger fired outside `active` resolves no rule. Absent = a hand-run resolution ("Run now", outcome preview), which is not gated. `combat-audio-automation.ts` passes the current workflow.
- `queries/session-control.ts`: `canMutateActiveSession` / `canExecuteLiveCommands` are true in every workflow; new `recording` flag (live only); prep/idle/ending report `ready`, recap/archived stay `read-only`.

## Decisions

- "Live" means `active` only, matching the story wording and the existing `mode: 'live'`. A roll made while paused or ending counts as outside a session.
- A record with no stamp predates this story, when every writing command was refused outside `active`, so `happenedLive` reads it as live.

## Outside the claim (follow-ups)

- `state/session-state.ts` / `state/combat-tracker.ts` are not owned, so the field is declared in `SessionWorkflowStamp` and not yet on `SessionDiceRoll`, `CombatLogEntry` or `HandoutDeliveryRecord`.
- `apps/gm-react/src/runtime/sfx-events.ts` is not owned. It must pass `sessionWorkflow: nextState.session.workflow` for SFX events to wait for Go live; the core gate is ready.
- The "Outside a session" history label needs the UI (`DiceTray.tsx`, owned by RC-SES-6.2) or `queries/dice-history.ts` to read `happenedLive`. No i18n key was added, to avoid an unused key.

## Validation

- `pnpm --filter @dndtools/core typecheck` and `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- Core vitest: 274 files / 4944 tests passed (was 4779; the new `session-standby-permits-everything.test.ts` covers 22 commands × 7 workflow states). After formatting and the import fix, a targeted re-run of the 9 touched core test files passed 380/380.
- App vitest (`vitest.app.config.ts`): 126 files / 1336 tests passed; targeted re-run of `combat-audio-automation` + `sfx-events` passed 17/17.
- Root tooling vitest: 24 files / 162 tests passed. `pnpm lint:boundary`: passed. ESLint on changed files: exit 0.
- Prettier: files clean at HEAD are formatted. Five files were already unformatted at HEAD; only my hunks were formatted, and their pre-existing lines are left alone.
