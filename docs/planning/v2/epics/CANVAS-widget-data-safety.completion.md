# CANVAS-widget-data-safety - Completion Evidence

Epic packet: `docs/planning/v2/epics/CANVAS-widget-data-safety.yaml`
Workpack status: `complete`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

## Scope

This epic delivers the **widget data safety** capability branch: full actor-scoped widget binding
resolution owned by the Processing Core (CANVAS-009) and validated durable command dispatch
(CANVAS-010). It closes the gap explicitly deferred by `CANVAS-widget-lifecycle`:

> "Full actor-scoped entity binding resolution remains in CANVAS-widget-data-safety."

CANVAS-010 was first implemented in `CANVAS-widget-lifecycle` (declared timer command + hidden
binding rejection). This epic re-verifies both CANVAS-010 acceptance criteria and strengthens the
command validator to share one Processing-Core-owned binding-safety helper with the query path.

## Demo Path

1. From repo root, run `pnpm v2:dev` and open `http://localhost:5183/`.
2. Create a Scene from the Scene list, then open `/scene/<id>/`.
3. In **Add widget**, set Type `character`, Bind entity type `character`, Bind entity id `pc-1`,
   Bind selector `conflicted:hp`, and click **Add widget**. The widget renders the explicit
   `binding conflicted: hp` placeholder — the Processing Core never resolves a conflicted binding
   to one version's value.
4. Add another widget with Type `note`, Bind entity id `ghost`, Bind selector `missing:ghost`.
   The widget renders the explicit `binding missing` placeholder with no leaked content.
5. Add a `timer` widget with no binding and click **Start**. The declared `timer.start` command is
   validated by the core (actor, Scene visibility, widget grant, schema, revision, idempotency,
   binding safety) before the session timer state changes.

The Playwright spec `apps/v2/app/tests/e2e/scene-create.spec.ts` exercises the conflicted/missing
binding states (CANVAS-009) and the timer command path (CANVAS-010) in desktop and mobile Chromium.

Hidden binding behavior is player-context-only (the app's default actor is the DM, who correctly
sees hidden data) and is proven by unit coverage in
`apps/v2/packages/core/tests/widget-data-safety.test.ts`.

## Requirement Traceability

| Requirement | Acceptance criteria | Implementation | Test evidence |
| ----------- | ------------------- | -------------- | ------------- |
| CANVAS-009 | (1) hidden data in a player context → `hidden` state, not the value. (2) entity with an unresolved conflict → `conflicted` state, does not silently choose a version. | `apps/v2/packages/core/src/queries/binding.ts` defines `WidgetDataEnvironment`/`EntityBindingRecord` and `resolveWidgetBinding`, which checks visibility (fail closed) before conflict before existence and returns `available`/`unbound`/`missing`/`hidden`/`conflicted`. `apps/v2/packages/core/src/queries/scene.ts` resolves each widget binding per actor through this resolver when a `dataEnvironment` is supplied, adding `conflicted` and `unbound` to `WidgetBindingPayload`. `apps/v2/app/src/routes/scene/[id]/+page.svelte` activates the resolver and renders non-leaking placeholders. | `widget-data-safety.test.ts` (`CANVAS-009: resolveWidgetBinding ...` and `CANVAS-009: getSceneForActor ...`) covers AC1 (player hidden + DM available + no leaked value), AC2 (conflicted with paths, no chosen version), visibility-before-conflict, shared/observer, field redaction, missing, and unbound. `scene-create.spec.ts` covers visible conflicted/missing placeholders. |
| CANVAS-010 | (1) authorized player `operator` command starts a timer and session state changes. (2) command for a hidden entity path → rejected before mutation. | `apps/v2/packages/core/src/commands/widget-command.ts` validates actor, Scene visibility, expected revision, widget existence, package enabled state, declared command descriptor, capability grant, payload schema, idempotency key, and binding safety via the shared `commandBindingBlock` (rejects `hidden-target` and `conflicted-target`) before mutating `SessionState`. New `conflicted-target` rejection code added in `commands/types.ts`. | `widget-data-safety.test.ts` (`CANVAS-010: ...`) covers AC1 (authorized operator timer start), AC2 (hidden-target rejection before mutation), plus conflicted-target rejection, missing-grant rejection, and stale-revision rejection. `widget-lifecycle.test.ts` retains the original CANVAS-010 timer/idempotency/hidden coverage. |

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** binding visibility/conflict resolution is owned
  by the Processing Core (`resolveWidgetBinding`), not by GUI-supplied predicates; the GUI only
  renders resolved states and dispatches commands. Durable mutations stay behind `dispatchCommand`.
- **Contract 2 (Cloud Sync & Offline Model):** conflict is a first-class binding state; a conflicted
  binding is never silently resolved to one revision and durable commands against it are rejected.
  The model is declarative/serializable and local-first (no network dependency). No CRDT/cloud code
  was added, consistent with ADR-014's deferred sync stance.
- **Contract 3 (Role, Visibility & Permission Grant Model):** binding resolution checks visibility
  before permission; `dm-only`/`player-visible`/`shared` are evaluated per actor at the data layer;
  non-DM field redaction is applied to returned values; the DM is never restricted.
- **Contract 4 (Widget / Canvas Contract):** widgets read app data only through actor-scoped
  bindings, and missing/hidden/deleted/conflicted/unbound bindings produce the contract's explicit
  states with non-leaking placeholders. Durable changes flow only through declared commands.

## Verification Run

```bash
pnpm --filter @dndtools/v2-core typecheck      # tsc --noEmit, clean
pnpm --filter @dndtools/v2-core test           # 87 tests passed (15 new in widget-data-safety.test.ts)
pnpm --filter @dndtools/v2-app typecheck       # svelte-check: 0 errors, 0 warnings
pnpm --filter @dndtools/v2-app test            # 7 tests passed
pnpm --filter @dndtools/v2-app e2e             # 15 passed, 3 pre-existing skips (desktop + mobile Chromium)
pnpm v2:lint                                   # v2 boundary lint passed
pnpm v2:typecheck                              # clean
pnpm v2:workpack:validate                      # v2 workpack validation passed
pnpm v2:workpack:complete -- --epic CANVAS-widget-data-safety
pnpm v2:workpack:validate                      # re-validated after complete
```

The Playwright preview server binds a local port; it required running with the sandbox relaxed so
the preview server could bind `localhost:4183`, matching the note recorded for the prior CANVAS epic.

## Changed Files

Epic-owned implementation, UI, and test files:

```text
 M apps/v2/app/src/routes/scene/[id]/+page.svelte        # optional binding inputs + render conflicted/unbound; activate resolver
 M apps/v2/app/tests/e2e/scene-create.spec.ts            # CANVAS-009 conflicted/missing placeholder e2e
 M apps/v2/packages/core/src/commands/types.ts           # conflicted-target rejection code
 M apps/v2/packages/core/src/commands/widget-command.ts  # shared commandBindingBlock for hidden/conflicted
 M apps/v2/packages/core/src/index.ts                     # export binding resolver public API
 M apps/v2/packages/core/src/queries/scene.ts             # dataEnvironment resolution + conflicted/unbound payloads; drop dead helper
?? apps/v2/packages/core/src/queries/binding.ts           # Processing-Core actor-scoped binding resolver
?? apps/v2/packages/core/tests/widget-data-safety.test.ts # CANVAS-009 + CANVAS-010 coverage
```

Generated planning files updated by the workpack commands: `docs/planning/v2/workpack-state.yaml`,
`docs/planning/v2/status.yaml`, `docs/planning/v2/parallel-batches.yaml`,
`docs/planning/v2/requirements-index.yaml`, `docs/planning/v2/initiative-map.yaml`, and
`docs/planning/v2/epics/*.yaml` (including this epic packet and completion evidence link).

## Requirement Coverage

- CANVAS-009: implemented and fully covered (both acceptance criteria + edge cases).
- CANVAS-010: re-verified (both acceptance criteria) and strengthened with conflicted-target
  rejection; original coverage retained in `widget-lifecycle.test.ts`.

## Known Gaps / Deferred

- The `WidgetDataEnvironment` is the declarative seam future `VaultState`/`MapState`/`SessionState`
  slices will populate. The first prototype keeps it empty and lets binding selector markers
  (`hidden:`, `conflicted:`, `missing:`) simulate states until real entity stores land in the CHAR,
  MAP, and CONTENT domains. No real entity store is in scope here (ADR-014).
- Conflict records, sync/CRDT machinery, and multi-user replication remain deferred by ADR-014.
  This epic only models the conflicted binding state and fail-closed command behavior, not conflict
  detection or resolution commands.
- The `unbound` state is reachable for widgets whose definition declares required bindings; system
  widgets declare none, so `unbound` is proven via a custom package in unit tests rather than the
  default demo widgets.
- Player-context hidden rendering is proven by unit tests; the in-app player-view surface is owned
  by `CANVAS-player-view-and-projection`.

## Git Evidence

Branch: `epic/CANVAS-widget-data-safety` (based on the completed v2 work at `233ba58`).

Final `git status --short` after `pnpm v2:workpack:complete -- --epic CANVAS-widget-data-safety`
and committing the epic shows a clean tree:

```text
(clean)
```

Commit hash is recorded in the handoff summary.
