# CMD-player-view-control - Completion Evidence

Epic packet: `docs/planning/v2/epics/CMD-player-view-control.yaml`
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CMD-player-view-control`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **CMD-004**.

## Demo Path

Run `pnpm v2:dev` from the repo root and open `http://localhost:5183/` (the Command Center home).

1. Open **Scenes**, create a Scene named `Player One View`, then return to **Command Center**.
2. In **Player views**, inspect the three seeded demo participants: `Demo Player`,
   `Demo Player 2`, and `Demo Player 3`.
3. Assign `Demo Player` to `Player One View` and click **Deliver**. The participant row shows the
   assigned Scene and `delivered`.
4. Assign `Demo Player 2` to `Command Center` and click **Deliver**. The row shows a different
   assigned Scene and `delivered`.
5. Assign `Demo Player 3` to `Command Center` and click **Queue**. The row shows the assignment
   as `queued` and `offline`.
6. Reload the app. The queued assignment is still present from IndexedDB-backed Session State.
7. Click **Deliver** for `Demo Player 3`. The same assignment is marked `delivered`, modeling the
   reconnect delivery path for this local-first prototype.

The Playwright spec `apps/v2/app/tests/e2e/command-center.spec.ts` drives this CMD-004 demo path
in desktop and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CMD-004     | `session.project-player-view` and `session.revoke-player-view` remain the only durable mutation path for Player View assignments in `apps/v2/packages/core/src/commands/player-view.ts`. `getPlayerViewController` in `apps/v2/packages/core/src/queries/player-view-control.ts` exposes a DM-only inspection read model with participants, assignable Scenes, assigned Scene names, delivery status, offline queue state, and missing-Scene reporting. The Command Center controller in `apps/v2/app/src/routes/+page.svelte` renders participant rows and dispatches only core commands. `SceneRuntime` seeds three prototype participants so the local browser demo can exercise multi-participant assignment without collaboration transport. `apps/v2/app/src/lib/platform/storage/scene-store.ts` already persists `SessionState.playerViewAssignments`; this epic added storage coverage for connected and queued assignments. | `apps/v2/packages/core/tests/player-view-control.test.ts` covers three participants, assigning different Scene views to two players, per-actor Player View query isolation, queued offline assignment, reconnect delivery by re-dispatching the same assignment as connected, operation logging, and non-DM denial. `apps/v2/app/tests/unit/command-center-store.test.ts` covers IndexedDB round-trip persistence for delivered and queued assignments. `apps/v2/app/tests/e2e/command-center.spec.ts` covers the visible Command Center controller on desktop and mobile. |

## Architecture Contracts Satisfied

- **Contract 3 (Role, Visibility & Permission Grant Model):** The controller query is DM-only and
  returns `actor-not-authorized` for non-DM actors. Projection is stored as Session delivery state,
  not as a permission grant. Player View reads still go through actor-filtered Scene queries; hidden
  widget-bound entity fields are not delivered merely because a Scene is assigned.
- **Player View rules:** Assignments are participant-filtered, DM-controlled, and can differ per
  participant. Offline assignments remain durable and are delivered when the connected assignment
  command is accepted after reconnect.
- **ADR-014 boundary:** Core owns command validation, reducers, operation log records, and query
  view models. The Svelte app renders query results and dispatches `CoreCommand`s. No v1 runtime,
  DOM, Svelte, Electron, MCP, cloud, or native imports were added to `@dndtools/v2-core`.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic CMD-player-view-control --status active
pnpm v2:workpack:validate
pnpm --filter @dndtools/v2-core test                  # 18 files, 147 tests passed
pnpm --filter @dndtools/v2-app test                   # 3 files, 11 tests passed
pnpm v2:lint                                          # v2 boundary lint passed
pnpm --filter @dndtools/v2-app typecheck              # svelte-check passed
pnpm --filter @dndtools/v2-core typecheck             # tsc passed
pnpm --filter @dndtools/v2-app e2e -- tests/e2e/command-center.spec.ts
# 9 passed, 3 profile-skipped across desktop + mobile Chromium
pnpm v2:workpack:validate
pnpm v2:workpack:complete -- --epic CMD-player-view-control
pnpm v2:workpack:validate
pnpm v2:check # workpack validate + boundary lint + typecheck + unit tests passed
```

## Quality Review Summary

- **Correctness:** CMD-004 acceptance criteria are implemented for multi-participant assignment,
  per-actor Player View delivery, offline queue persistence, and reconnect delivery status.
- **Architecture:** Processing/display split is preserved; no v1 runtime imports or new platform
  dependencies; controller state is a core query, not ad hoc GUI state.
- **Tests:** Added core reducer/query coverage, app IndexedDB persistence coverage, Svelte
  typecheck, boundary lint, and desktop/mobile e2e coverage.
- **Accessibility:** Controller controls are labeled selects/buttons; assignment updates expose a
  `role="status"` message; compact layout stacks controls for mobile.
- **Performance:** The controller query scans current actors and Scenes in memory only; no render
  loop, network, or background sync work was added.
- **Security:** Non-DM actors cannot inspect or mutate Player View assignments from the controller.
  The player-facing view remains actor-filtered and non-leaking.
- **Permissions:** Projection does not grant write permissions. A player still needs explicit
  grants for widget operations, and DM authority remains inherent rather than grant-backed.
- **Persistence:** `SessionState.playerViewAssignments` is persisted and reloaded through the
  existing IndexedDB adapter; old records default safely when assignments are absent.
- **Sync/offline:** Accepted assignment changes append sync-shaped local operations with actor,
  entity, path, revision, dependencies, and delivery status. Remote transport remains deferred.
- **UX:** Rows show empty, assigned, missing-Scene, delivered, queued, and offline states. Controls
  work in desktop and slim mobile profiles.
- **Maintainability:** Changes are contained to CMD/player-view query, Command Center UI, demo
  participant seeding, and focused tests.
- **Docs:** Completion evidence records traceability, demo steps, verification, quality review, and
  gaps.

## Known Gaps / Deferred

- Real collaboration presence, remote reconnect detection, player-device delivery transport, cloud
  sync, cache sealing, CRDT/provider choice, and participant invitations are deferred to
  COLLAB/SYNC/PERM epics and ADR-014 follow-up decisions.
- The Command Center controller assigns whole Scenes. Widget subset/handout/map-region projection
  remains available in the existing Scene editor projection panel and core command, but CMD-004's
  Command Center surface intentionally focuses on Scene assignment.
- The browser prototype seeds three local demo players. Authenticated participant management is
  outside this CMD epic.

## Git Evidence

Branch: `epic/CMD-player-view-control`.

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic CMD-player-view-control --status active
pnpm v2:workpack:complete -- --epic CMD-player-view-control
```

Changed files:

```text
apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
apps/v2/app/src/routes/+page.svelte
apps/v2/app/src/routes/styles.css
apps/v2/app/tests/e2e/command-center.spec.ts
apps/v2/app/tests/unit/command-center-store.test.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/player-view-control.ts
apps/v2/packages/core/tests/player-view-control.test.ts
docs/planning/v2/epics/CMD-player-view-control.completion.md
docs/planning/v2/epics/CMD-player-view-control.yaml
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after completion and before commit:

```text
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/command-center.spec.ts
 M apps/v2/app/tests/unit/command-center-store.test.ts
 M apps/v2/packages/core/src/index.ts
 M docs/planning/v2/epics/CMD-player-view-control.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/packages/core/src/queries/player-view-control.ts
?? apps/v2/packages/core/tests/player-view-control.test.ts
?? docs/planning/v2/epics/CMD-player-view-control.completion.md
```
