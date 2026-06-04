# CMD-active-session-control - Completion Evidence

Epic packet: `docs/planning/v2/epics/CMD-active-session-control.yaml`
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CMD-active-session-control`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **CMD-003**, **CMD-006**.

## Demo Path

Run `pnpm v2:dev` from the repo root and open `http://localhost:5183/` (the Command Center home).

### CMD-003 - active map embed and player-safe projection

1. In **Active map**, choose **Ruined Keep** and **Ground Floor**, then click **Set active map**.
2. The Command Center active map preview shows **Ruined Keep** and the DM-local layer list,
   including the DM-only **Secret Ambush** layer.
3. Click **active** in **Session workflow**, then click **Project** in **Active map**.
4. The **Demo Player** preview shows the delivered projected map with **Rooms** and **Fog of War**.
   It does not show **Secret Ambush** or any hidden layer payload.
5. Choose **Western Reaches**, click **Set active map**, and the map widget binding plus
   `SessionState.activeMap` move to the new map.

### CMD-006 - workflow switching and Session State preservation

1. Click each workflow button: `idle`, `prep`, `active`, `paused`, `ending`, `recap`, and
   `archived`. The Command Center status reflects the application-level workflow.
2. Start `active`, set an active map, then navigate to **Scenes** and back to **Command Center**.
   The active workflow and active map remain intact because they live in persisted Session State.
3. Click `paused`. The Demo Player status changes to `paused-degraded`; live session projection
   controls disable until the workflow resumes.
4. Click `ending`, then `recap`. The previous live session state is archived under
   `recapArchiveId`, live Session State is reset, and session-owned widgets render archived mode.

The Playwright spec `apps/v2/app/tests/e2e/command-center.spec.ts` drives the CMD-003/CMD-006 demo
path in desktop and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CMD-003     | `MapState` and demo local map records in `apps/v2/packages/core/src/state/map-state.ts`; active map selection/projection reducers in `apps/v2/packages/core/src/commands/session-control.ts`; actor-filtered active map query in `apps/v2/packages/core/src/queries/session-control.ts`; default Command Center includes a `map` widget and the `session.set-active-map` command binds that widget while recording `SessionState.activeMap`. GUI controls render and dispatch only core commands from `apps/v2/app/src/routes/+page.svelte`.                                                                                                                                                                                                                                   | `apps/v2/packages/core/tests/active-session-control.test.ts` covers switching between two maps, Command Center map widget binding updates, Session State active map recording, DM-only rejection, and player projection redacting DM-only layers. `apps/v2/app/tests/unit/command-center-store.test.ts` persists active map across reload. `apps/v2/app/tests/e2e/command-center.spec.ts` verifies visible active map switching and player-safe projection.                            |
| CMD-006     | `SessionState` now includes workflow, active Scene, active map, combat state, dice history, timers, player-view/projection state, archive snapshots, and recap archive pointer (`apps/v2/packages/core/src/state/session-state.ts`). `session.set-workflow`, `session.update-combat`, and `session.record-dice` are core commands with operation-log entries. Session widget commands fail closed outside `active` workflow (`apps/v2/packages/core/src/commands/widget-command.ts`). `getSessionWidgetMode` and `getSessionParticipantStatus` expose draft/live/paused/archived read models. The Command Center workflow controls are in `apps/v2/app/src/routes/+page.svelte`; shell navigation links are absolute so navigation away/back preserves the same runtime state. | `apps/v2/packages/core/tests/active-session-control.test.ts` covers every workflow state, pause/resume preservation of combat/dice/timers/active Scene, paused/degraded participant status, blocked live commands while paused, recap archive/reset behavior, and prep draft mode. `apps/v2/app/tests/unit/command-center-store.test.ts` persists workflow, active Scene, combat, dice, timers, and active map across reload. e2e verifies route navigation away/back and recap reset. |

## Architecture Contracts Satisfied

- **Contract 3 (Role, Visibility & Permission Grant Model):** Active map and workflow commands are
  DM-only. Player projection is stored as session delivery state, not as a permission grant. The
  player active-map query evaluates actor role and projection state before returning data; DM-only
  layers are omitted from player payloads and absent from serialized player views.
- **Contract 4 (Scene and Widget Contract):** The active map is a Scene widget embed whose binding
  points at the map entity; embedding does not clone map data. Projection is Session-owned
  delivery state. Session-owned widgets mutate live state only through core commands and only while
  the workflow is `active`; prep/recap expose draft or archived read models.
- **ADR-014 boundary:** All durable mutation semantics live in `@dndtools/v2-core`; the Svelte app
  renders query results and dispatches `CoreCommand`s. `@dndtools/v2-core` imports no Svelte, DOM,
  browser, Electron, MCP, cloud, or v1 runtime modules. The app owns IndexedDB persistence only.

## Verification Run

```bash
pnpm --filter @dndtools/v2-core test                  # 17 files, 143 tests passed
pnpm --filter @dndtools/v2-app test                   # 3 files, 10 tests passed
pnpm v2:typecheck                                     # core tsc + app svelte-check passed
pnpm --filter @dndtools/v2-app e2e -- command-center.spec.ts
# 7 passed, 3 profile-skipped across desktop + mobile Chromium
pnpm v2:check                                         # workpack validate + lint + typecheck + unit tests passed
pnpm v2:workpack:complete -- --epic CMD-active-session-control
pnpm v2:workpack:validate                            # run after completion
```

## Quality Review Summary

- **Correctness:** Both CMD-003 acceptance criteria and all four CMD-006 acceptance criteria are
  implemented and test-covered. Session workflow transitions are explicit and operation logged.
- **Architecture:** Processing/display boundary preserved; state documents remain core-owned;
  no v1 runtime imports; no server/cloud/native assumptions introduced.
- **Tests:** Added focused reducer/query tests, storage round-trip coverage, and desktop/mobile
  e2e coverage for the visible Command Center controls. Existing timer command tests were updated
  to start an active workflow before expecting live Session State mutation.
- **Accessibility:** Workflow buttons expose `aria-pressed`; active-map controls are labelled
  selects/buttons; projection status uses `role="status"`; controls remain available on compact
  profiles and are covered by mobile Chromium e2e.
- **Performance:** Queries are pure in-memory scans over small session/map collections. No new
  background I/O or render loop was added.
- **Security:** Non-DM actors cannot execute active map or workflow commands. Hidden layer names
  and values are not returned in player projection payloads.
- **Permissions:** Projection does not create grants and does not bypass visibility; `shared`
  layers require projection, `dm-only` layers remain hidden.
- **Persistence:** IndexedDB now stores `MapState` plus widened `SessionState`, with safe defaults
  for older local prototype records. Durable state changes still require accepted core operations.
- **Sync/offline:** All behavior is local-first and offline-capable. Accepted commands append local
  sync-shaped operations with actor, entity, path, revision, and dependency metadata. Remote
  transport remains intentionally out of scope.
- **UX:** Command Center has visible empty/missing/status states for active maps, disabled live
  projection controls outside active workflow, and recap archive status after ending.
- **Maintainability:** New code is contained to session-control/map state and existing Command
  Center surfaces; no unrelated refactor or package boundary change.
- **Docs:** Completion evidence recorded here; generated workpack files updated through the
  documented commands.

## Known Gaps / Deferred

- Map authoring/import is not implemented in this CMD epic. The app uses two local prototype map
  records until MAP epics add real map creation and asset pipelines.
- Active map projection targets the seeded local `actor-player` demo participant because real
  collaboration identity/transport belongs to COLLAB/SYNC epics.
- Cloud sync, CRDT/provider choice, player-device cache sealing, and remote reconnect transport
  remain deferred by ADR-014 and later sync/collaboration epics. This slice records operation-shaped
  local state and fail-closed actor filtering.
- Session combat and dice controls are minimal core commands for preserving Session State; rich
  combat tracker, dice UI, and session lifecycle recovery workflows are owned by SES/CHAR sibling
  epics.

## Git Evidence

Branch: `epic/CMD-active-session-control`.

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic CMD-active-session-control --status active
pnpm v2:workpack:complete -- --epic CMD-active-session-control
```

Changed files:

```text
apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
apps/v2/app/src/lib/platform/storage/scene-store.ts
apps/v2/app/src/routes/+layout.svelte
apps/v2/app/src/routes/+page.svelte
apps/v2/app/src/routes/styles.css
apps/v2/app/tests/e2e/command-center.spec.ts
apps/v2/app/tests/unit/command-center-store.test.ts
apps/v2/packages/core/src/commands/dispatch.ts
apps/v2/packages/core/src/commands/helpers.ts
apps/v2/packages/core/src/commands/session-control.ts
apps/v2/packages/core/src/commands/types.ts
apps/v2/packages/core/src/commands/widget-command.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/session-control.ts
apps/v2/packages/core/src/schemas/commands.ts
apps/v2/packages/core/src/state/command-center-state.ts
apps/v2/packages/core/src/state/map-state.ts
apps/v2/packages/core/src/state/session-state.ts
apps/v2/packages/core/src/testing/fixtures.ts
apps/v2/packages/core/tests/active-session-control.test.ts
apps/v2/packages/core/tests/widget-data-safety.test.ts
apps/v2/packages/core/tests/widget-lifecycle.test.ts
docs/planning/v2/epics/CMD-active-session-control.completion.md
docs/planning/v2/epics/CMD-active-session-control.yaml
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after completion and before commit:

```text
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/lib/platform/storage/scene-store.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/command-center.spec.ts
 M apps/v2/app/tests/unit/command-center-store.test.ts
 M apps/v2/packages/core/src/commands/dispatch.ts
 M apps/v2/packages/core/src/commands/helpers.ts
 M apps/v2/packages/core/src/commands/types.ts
 M apps/v2/packages/core/src/commands/widget-command.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/schemas/commands.ts
 M apps/v2/packages/core/src/state/command-center-state.ts
 M apps/v2/packages/core/src/state/session-state.ts
 M apps/v2/packages/core/src/testing/fixtures.ts
 M apps/v2/packages/core/tests/widget-data-safety.test.ts
 M apps/v2/packages/core/tests/widget-lifecycle.test.ts
 M docs/planning/v2/epics/CMD-active-session-control.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/packages/core/src/commands/session-control.ts
?? apps/v2/packages/core/src/queries/session-control.ts
?? apps/v2/packages/core/src/state/map-state.ts
?? apps/v2/packages/core/tests/active-session-control.test.ts
?? docs/planning/v2/epics/CMD-active-session-control.completion.md
```
