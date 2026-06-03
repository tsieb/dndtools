# CANVAS-widget-lifecycle - Completion Evidence

Epic packet: `docs/planning/v2/epics/CANVAS-widget-lifecycle.yaml`
Workpack status: `complete`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

## Demo Path

1. From repo root, run `pnpm v2:dev` and open `http://localhost:5183/`.
2. On the Scene list route, use **Widget Packages** to install **Weather Panel**. The package
   review row shows requested host permission `network: denied` by default.
3. Enable the Weather Panel package, export it, and inspect the export preview. The export includes
   package id, version, schemas, assets, trust metadata, migration status, and portability
   diagnostics.
4. Create a Scene, open `/scene/<id>/`, add widget type `weather-panel` at version `1.0.0`, and
   observe the degraded widget state because network permission remains denied.
5. Return to the Scene list, remove the Weather Panel package, reopen the Scene, and observe the
   recoverable disabled widget placeholder.
6. Add widget type `timer` at version `1.0.0` and click **Start**. The timer dispatches the
   declared `timer.start` command through the Processing Core and the Scene shows `timer running`.

The Playwright e2e test `apps/v2/app/tests/e2e/scene-create.spec.ts` exercises this demo path in
desktop Chromium and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation                                                                                                                                                                                                                                                                                                                                                                   | Test evidence                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CANVAS-002  | `scene.add-widget` validates installed/enabled widget definitions, schema-valid configuration, initial layout, configuration, binding placeholder, local state, and operation log records in `apps/v2/packages/core/src/commands/widget.ts`. The IndexedDB adapter rejects durable state writes without new operations in `apps/v2/app/src/lib/platform/storage/scene-store.ts`. | `apps/v2/packages/core/tests/widget-lifecycle.test.ts` covers accepted map widget creation and unknown package rejection. `apps/v2/app/tests/unit/scene-store.test.ts` covers bypass rejection. |
| CANVAS-008  | Versioned widget package manifests are modeled in `apps/v2/packages/core/src/state/widget-package-state.ts` and validated by `apps/v2/packages/core/src/schemas/widget-package.ts` plus `apps/v2/packages/core/src/commands/widget-package.ts`. Scene queries render degraded widgets when declared host permissions are denied.                                                 | `widget-lifecycle.test.ts` covers missing configuration schema diagnostics and denied-network degraded rendering.                                                                               |
| CANVAS-010  | `widget.dispatch-command` validates actor, Scene visibility, widget grants, enabled package state, declared command descriptor, payload schema, Scene revision, idempotency key, hidden binding selector, and operation-log dependencies before mutating `SessionState` timers.                                                                                                  | `widget-lifecycle.test.ts` covers authorized player timer start and hidden binding rejection. Playwright covers the visible timer start path.                                                   |
| CANVAS-011  | `widget.package.upgrade` applies declared migration records to existing widget configuration, updates widget versions on success, and leaves migration failures as recoverable disabled widget instances with diagnostics.                                                                                                                                                       | `widget-lifecycle.test.ts` covers successful key migration and migration-failed disabled state.                                                                                                 |
| CANVAS-014  | `scene.destroy-widget` removes only the widget instance, section references, and widget-local state. Strict payload validation rejects attempts to smuggle bound-entity deletion into destroy.                                                                                                                                                                                   | `widget-lifecycle.test.ts` covers destroy operation shape and extra delete payload rejection.                                                                                                   |
| CANVAS-017  | Package install, review, enable, disable, remove, and export are core-owned administrative actions. The Scene list UI exposes review, enable/disable/remove, and export controls; Scene queries keep removed/disabled package widgets as disabled placeholders.                                                                                                                  | `widget-lifecycle.test.ts` covers disabled/removed placeholders and export filtering. Playwright covers package review, export, degraded state, and removed-package placeholder.                |

## Architecture Contracts Satisfied

- Contract 1: durable mutations enter through `dispatchCommand`; app storage rejects Scene/package/session changes that bypass accepted operations.
- Contract 2: package, Scene, and session timer mutations append local operation-log records with actor, entity, path, revision, and dependency metadata.
- Contract 3: widget command dispatch evaluates Scene visibility before permission grants; non-DM timer operation requires a widget `operator` grant.
- Contract 4: widget lifecycle is represented as create, display/degraded/disabled, operate, upgrade, destroy, and package administration without mutating bound entities.

## Verification Run

Commands run during handoff:

```bash
pnpm --filter @dndtools/v2-core typecheck
pnpm --filter @dndtools/v2-core test
pnpm --filter @dndtools/v2-app typecheck
pnpm --filter @dndtools/v2-app test
pnpm --filter @dndtools/v2-app e2e
pnpm v2:workpack:complete -- --epic CANVAS-widget-lifecycle
pnpm v2:workpack:validate
pnpm v2:lint
pnpm v2:typecheck
pnpm v2:test
```

The first Playwright attempt could not bind `::1:4183` inside the sandbox (`EPERM`); the same
command passed after escalation allowed the local preview server to bind.

## Known Gaps / Deferred

- Custom widget code sandbox execution is still a future architecture decision; this epic models
  manifests, trust state, host permission decisions, and non-execution placeholder/degraded states.
- Timer command coverage is the minimal declared-command slice for CANVAS-010. Broader session
  timer history and reusable timer entities belong to later session/tool epics.
- Host permission approval UI currently shows requested permissions and keeps them denied by
  default; approving individual host permissions is intentionally not exposed until the widget host
  security policy is selected.
- Entity data visibility is represented here by Scene visibility and hidden binding selectors.
  Full actor-scoped entity binding resolution remains in CANVAS-widget-data-safety.

## Git Evidence

Final `git status --short` after `pnpm v2:workpack:complete -- --epic CANVAS-widget-lifecycle`
and build artifact cleanup was non-empty. Epic-owned implementation files were:

```text
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/lib/platform/storage/scene-store.ts
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/scene-create.spec.ts
 M apps/v2/app/tests/unit/scene-store.test.ts
 M apps/v2/packages/core/src/commands/dispatch.ts
 M apps/v2/packages/core/src/commands/helpers.ts
 M apps/v2/packages/core/src/commands/scene-meta.ts
 M apps/v2/packages/core/src/commands/types.ts
 M apps/v2/packages/core/src/commands/widget.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/scene.ts
 M apps/v2/packages/core/src/schemas/commands.ts
 M apps/v2/packages/core/src/schemas/scene.ts
 M apps/v2/packages/core/src/state/scene-state.ts
 M apps/v2/packages/core/src/testing/fixtures.ts
 M apps/v2/packages/core/tests/scene-sections.test.ts
?? apps/v2/packages/core/src/commands/widget-command.ts
?? apps/v2/packages/core/src/commands/widget-package.ts
?? apps/v2/packages/core/src/schemas/widget-package.ts
?? apps/v2/packages/core/src/state/session-state.ts
?? apps/v2/packages/core/src/state/widget-package-state.ts
?? apps/v2/packages/core/tests/widget-lifecycle.test.ts
?? docs/planning/v2/epics/CANVAS-widget-lifecycle.completion.md
```

Generated workpack status files also changed after the complete command, including
`docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`, and regenerated
`docs/planning/v2/epics/*.yaml`. The worktree additionally contains broader workpack automation
changes outside the widget lifecycle implementation (`scripts/v2-workpack.ts`, workpack tests,
templates, and package scripts).
