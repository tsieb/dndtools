# Completion Evidence: SES-session-lifecycle

Epic: `SES-session-lifecycle` — SES: Session lifecycle
Requirement IDs: SES-001, SES-010, SES-011
Branch: `epic/SES-session-lifecycle` (created from `epic/SES-prep-recap-and-calendar-continuity` HEAD `a787520`).

## Summary

FORMALIZED the session lifecycle that the existing SES slices already use, without regressing any of
them. The work adds an explicit, typed state machine and a recover capability, then surfaces both in
the Command Center — it EXTENDS the existing workflow rather than replacing it. The pre-existing
behavior (the `workflow === 'active'` gate on combat/dice/handout/timer commands, the recap/archive
snapshot, the PLAT-018 command lifecycle) is reused unchanged.

- **SES-011 — workflow state machine.** A single pure module
  (`apps/v2/packages/core/src/lifecycle/session-workflow.ts`) defines the seven canonical states
  (`idle`, `prep`, `active`, `paused`, `ending`, `recap`, `archived`) as an EXPLICIT
  ALLOWED-TRANSITION TABLE (`SESSION_WORKFLOW_TRANSITIONS`) plus a PER-STATE COMMAND-AVAILABILITY map
  (`SESSION_COMMAND_AVAILABILITY`). `handleSetSessionWorkflow` now validates every transition against
  the table and rejects a disallowed move FAIL-CLOSED with a non-leaking `invalid-state` result
  (SES-011 AC1). Command availability formalizes the existing gate: the `live-session` category is the
  set of commands accepted ONLY while `active` — and a regression test asserts that set matches every
  `workflow === 'active'` guard in the command layer, so the machine and the per-command guards can
  never drift. `active` remains the only live-session state; its gate's meaning is unchanged.
- **SES-001 — lifecycle commands + Session State persistence.** The DM can START, PREP, PAUSE, RESUME,
  END, RECAP, ARCHIVE, RESET, and now RECOVER a session. Session State is the existing application-level
  aggregate (active scene, combat, dice history, timers, party/active-map, workflow state, handout log);
  the lifecycle commands aggregate those slices and never duplicate them. ARCHIVE snapshots the live
  session durably into a `SessionArchiveSnapshot` (existing); the new `session.recover` command
  RESTORES a snapshot back into `recap` review — reusing the same snapshot-as-rollback-target pattern as
  the PLAT-008 migration write-ahead/safety-snapshot recovery. Each lifecycle command is a durable
  op-log transition validated against the SES-011 transition table.
- **SES-010 — standard async action model.** The PLAT-018 command-lifecycle
  (`apps/v2/packages/core/src/lifecycle/command-lifecycle.ts`) is the standard async action model and is
  already wired into the runtime dispatch (`apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts`):
  every dispatched session command surfaces PENDING → SUCCESS/FAILURE, and FAILURE offers RETRY while a
  committed undoable command offers UNDO. This epic proves the session tools use it: the new tests
  exercise pending→success, failure→retry (a live command rejected by the active gate, then retried from
  `active`), and undo (project-player-view restored via its `session.revoke-player-view` inverse). Undo
  is correctly NOT fabricated for the `session.set-workflow` transition (it is not a reversible edit).

## Architecture

- Pure Processing-Core policy: the transition table, command-availability predicates, and lifecycle
  reducers are deterministic functions of explicit inputs (no DOM/storage/clock/random). The GUI reads
  the computed availability (`isTransitionAllowed`) to disable illegal transition buttons; the
  Processing-Core command guards remain authoritative (Architecture Contract 1).
- Durable writes (`session.set-workflow`, `session.recover`) enter through core commands and append
  op-log records; the GUI dispatches intents and renders computed models, never touching storage. The
  recover op carries only the archive reference (`session-archive:<id>`), not snapshot content.
- No v1 runtime imports; the v2 boundary lint and gates stay green.

## Files Changed

### Core — new modules

- `apps/v2/packages/core/src/lifecycle/session-workflow.ts` — SES-011 the session workflow state
  machine: the 7-state allowed-transition table (`SESSION_WORKFLOW_TRANSITIONS`), `isTransitionAllowed`
  / `allowedTransitionsFrom`, the lifecycle-intent target map (`SESSION_INTENT_TARGET`,
  `isLifecycleIntentAllowed`), and per-state command availability (`SESSION_COMMAND_AVAILABILITY`,
  `isSessionCommandAvailable`, `availableSessionCommands`). Pure deterministic policy.

### Core — modified

- `apps/v2/packages/core/src/commands/session-control.ts` — SES-011 transition validation in
  `handleSetSessionWorkflow` (fail-closed `invalid-state` on a disallowed move) and the SES-001
  `handleRecoverSession` command (restore a `SessionArchiveSnapshot` into `recap`; DM-only;
  transition-table-validated; fail-closed when no archive / unknown archive id).
- `apps/v2/packages/core/src/commands/dispatch.ts` — wired the `session.recover` command handler.
- `apps/v2/packages/core/src/commands/types.ts` — added the `session.recover` `CoreCommand` variant and
  the `session.recovered` `CoreEvent` variant.
- `apps/v2/packages/core/src/schemas/commands.ts` — added `recoverSessionInputSchema` (optional
  `archiveId`).
- `apps/v2/packages/core/src/index.ts` — exported the SES-011 workflow-machine surface and the
  `recoverSessionInputSchema`.

### App — modified

- `apps/v2/app/src/routes/+page.svelte` — the Command Center workflow strip now DISABLES disallowed
  transition buttons using `isTransitionAllowed` (SES-011 per-state availability made visible), and adds
  a "Recover archived session" control (`session-recover`) that dispatches `session.recover` (SES-001).

### Tests — new + modified

- `apps/v2/packages/core/tests/session-lifecycle.test.ts` — SES-001/010/011 unit suite: the full 7-state
  transition table (every allowed transition succeeds; every disallowed pair fails closed; self-
  transitions; happy-path sequence preserved); per-state command availability; set-workflow rejecting
  out-of-order moves with a non-leaking result; the lifecycle persist/archive/recover round-trip plus
  recover negative cases (no archive, unknown id, non-DM); reconnect availability matching workflow
  state (SES-001 AC3); the standard async action model (pending/success, failure→retry, undo via
  inverse, no-fabricated-undo for transitions); and the active-gate regression that the `live-session`
  availability set matches every `workflow === 'active'` guard and that combat/dice/handout commands
  still work while `active`.
- `apps/v2/app/tests/e2e/command-center.spec.ts` — added two e2e tests (run on BOTH Playwright
  projects): disallowed transition buttons are disabled per state (SES-011), and the archived → recover
  → recap round-trip through the GUI (SES-001).

### Planning (generated via workpack commands; not hand-edited)

- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/SES-session-lifecycle.yaml`.

## Traceability

| Requirement | Implementation | Tests |
| --- | --- | --- |
| SES-001 (start/pause/resume/end/archive/recover a session; aggregate Session State persisted) | `apps/v2/packages/core/src/commands/session-control.ts` (`handleSetSessionWorkflow`, `handleRecoverSession`); GUI `apps/v2/app/src/routes/+page.svelte` | `apps/v2/packages/core/tests/session-lifecycle.test.ts`; `apps/v2/app/tests/e2e/command-center.spec.ts` |
| SES-001 AC1 (start from idle ⇒ active + records active Scene) | `handleSetSessionWorkflow` (active requires an active Scene) | `apps/v2/packages/core/tests/session-lifecycle.test.ts` ("starting from idle enters active and records the active Scene") |
| SES-001 AC2 (restart during active ⇒ state restored or explicit recovery) | `handleRecoverSession` restoring a `SessionArchiveSnapshot`; existing `ensureSessionState` fail-closed hydrate | `apps/v2/packages/core/tests/session-lifecycle.test.ts` ("aggregates ... into the archive on recap, then recovers them back") |
| SES-001 AC3 (paused/ending/recap ⇒ available commands match workflow; no stale active commands) | the `live-session` gate + transition table | `apps/v2/packages/core/tests/session-lifecycle.test.ts` ("stale active-session commands are rejected outside active") |
| SES-010 (pending/success/failure/retry/undo standard async action model for durable session commands) | `apps/v2/packages/core/src/lifecycle/command-lifecycle.ts` (reused); runtime wiring `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` | `apps/v2/packages/core/tests/session-lifecycle.test.ts`; `apps/v2/packages/core/tests/command-lifecycle.test.ts` |
| SES-010 AC1 (failed session tool command clears pending + shows retry) | `markFailure` + `canRetry` + `recoveryAction` | `apps/v2/packages/core/tests/session-lifecycle.test.ts` ("a rejected session command clears pending, records no op, and offers retry") |
| SES-010 AC2 (undo applies a recorded inverse / restores the committed before state) | `UNDOABLE_COMMAND_TYPES` (`session.project-player-view` → `session.revoke-player-view`) | `apps/v2/packages/core/tests/session-lifecycle.test.ts` ("an undoable session command ... restores via its inverse") |
| SES-011 (7 states + explicit allowed transitions + per-state command availability) | `apps/v2/packages/core/src/lifecycle/session-workflow.ts`; transition guard in `apps/v2/packages/core/src/commands/session-control.ts` | `apps/v2/packages/core/tests/session-lifecycle.test.ts`; `apps/v2/app/tests/e2e/command-center.spec.ts` |
| SES-011 AC1 (idle + stale active-combat command ⇒ rejected, non-leaking invalid-state) | transition-table guard + `live-session` gate (fail-closed `invalid-state`) | `apps/v2/packages/core/tests/session-lifecycle.test.ts` ("rejects an out-of-order transition with a non-leaking invalid-state result", "a player submitting an active-combat command from idle is rejected") |
| SES-011 AC2 (recap ⇒ archived references are read-only inputs unless a separate edit command is accepted) | recover restores into `recap` (read-only review); live writes still gated to `active` | `apps/v2/packages/core/tests/session-lifecycle.test.ts` (recover round-trip lands in `recap`; live commands rejected in recap) |

## Demo

Path (visible behavior; runs identically on desktop and compact profiles):

1. Go to `/` (Command Center). The "Session workflow" strip shows the seven state buttons. From `idle`,
   the `paused` and `ending` buttons are DISABLED (not reachable in one step — SES-011), while `active`
   and `prep` are enabled.
2. Click `active` — the session starts (idle → active), the status reads "active", and now `paused` /
   `ending` become enabled and `prep` is disabled (active cannot return to prep).
3. Optionally select and bind an active map, run combat / record dice — these live-session commands are
   accepted only because the workflow is `active` (the formalized gate).
4. Click `recap` — the live state is archived; an "Archive …" line and a "Recover archived session"
   button appear. Click `archived` to durably archive.
5. Click "Recover archived session" — the workflow returns to `recap` review with the archived live
   state restored (SES-001 recover). Recovery is rejected fail-closed by the core if no archive exists.
6. SES-010: every workflow/recover/session command dispatched through the runtime surfaces the standard
   pending → success / failure lifecycle (`runtime.lastLifecycle`); a rejected command clears pending and
   exposes retry guidance.

Requirement IDs exercised by the demo: SES-001, SES-010, SES-011.

## Quality Review

- **Correctness:** Every AC for SES-001/010/011 is implemented and covered by unit and/or e2e tests,
  including fail-closed negative cases (disallowed transitions, recover with no/unknown archive, non-DM).
- **Architecture:** Pure deterministic policy module; durable writes via commands + op-log; the GUI reads
  computed availability and dispatches intents, never touching storage (Contract 1). The formalized
  machine EXTENDS the existing workflow — the `active` gate's meaning is unchanged and a regression test
  pins the `live-session` set to the existing command guards. Boundary lint + v2 gates green; no v1
  imports.
- **Tests:** 38 new core unit tests + 2 new e2e tests (on both Playwright projects). Hard assertions on
  the full transition matrix, per-state availability, the active-gate regression, and the
  archive/recover round-trip.
- **Accessibility:** Disabled transition buttons carry a `title` explaining why a move is unavailable;
  the workflow strip remains a labelled `role="toolbar"`. The recover control is a labelled button. Runs
  on the compact profile.
- **Performance:** Pure synchronous predicates over already-loaded state; the transition table and
  availability map are frozen constants.
- **Security / Permissions / Data-safety:** Workflow control and recover are DM-only. Disallowed
  transitions and stale active-session commands fail closed with a non-leaking `invalid-state` result
  (no entity ids/content in the message). Recover validates the archive exists before restoring.
- **Sync/offline:** Lifecycle transitions and recover append operation-shaped op-log records; the
  archive snapshot is the durable rollback target (same pattern as the migration safety snapshot).
- **Persistence:** Session State (including `archives`) is the existing durable session document; recover
  restores from it. No new durable state shape, so no migration was needed.
- **UX:** Empty (idle), live (active), degraded (paused), and archived/recap states render; illegal
  transitions are visibly disabled rather than silently rejected.
- **Docs:** This completion file; thorough module/command doc comments tying code to SES-001/010/011.

## Tests Run

- `pnpm lint` (full: `eslint . && lint:navigation && lint:tokens && audit:repo`) — passed.
- `pnpm docs:validate` — passed.
- `pnpm v2:typecheck` — 0 errors.
- `pnpm v2:lint` (boundary) — passed.
- `pnpm v2:gates` — passed.
- Core unit suite (`@dndtools/v2-core` vitest) — 93 files, 1306 tests passed.
- App unit suite (`@dndtools/v2-app` vitest) — 12 files, 55 tests passed.
- Full Playwright on BOTH projects (`desktop-chromium` + `mobile-chromium`) — 378 passed, 18 skipped, 0
  failed (base was 374 passed; +4 from the 2 new tests across both projects).
- `pnpm v2:workpack:validate` — passed before and after `complete`.

## Known Gaps / Deferred

- The lifecycle is exposed through the Command Center workflow strip + recover button rather than as a
  set of separate named lifecycle buttons (START/PAUSE/RESUME/…); the named `SessionLifecycleIntent`
  mapping is exported from core for any future surface that wants intent-labelled controls, but the
  existing strip already drives every transition.
- Multi-user reconnect catch-up (re-evaluating a remote participant's available commands on reconnect) is
  proven at the policy layer (per-state command availability + the `live-session` gate) per ADR-014's
  single-device-local stance; live remote transport is out of scope and deferred to a later sync epic.

## Git

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SES-session-lifecycle`).

- Branch: `epic/SES-session-lifecycle` (from `epic/SES-prep-recap-and-calendar-continuity` HEAD `a787520`).
- Implementation commit SHA: recorded in the follow-up docs commit below.
- Final `git status --short`: clean (after the docs commit recording the SHA).

Final `git status --short` after the implementation commit:

```
(clean)
```
