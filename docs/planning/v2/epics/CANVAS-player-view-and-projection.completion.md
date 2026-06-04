# CANVAS-player-view-and-projection - Completion Evidence

Epic packet: `docs/planning/v2/epics/CANVAS-player-view-and-projection.yaml`
Workpack status: `complete`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **CANVAS-005**, **CANVAS-006**, **CANVAS-007**, **CANVAS-015**.

## Demo Path

1. From repo root, run `pnpm v2:dev` and open `http://localhost:5183/`.
2. Open `Scenes`, create a Scene, then open `/scene/<id>/`.
3. Add widget type `note` at version `1.0.0`.
4. Select the widget checkbox, set Player View target to `Handout`, and click `Project`.
   The Player View preview for `actor-player` shows `handout`, `delivered`, and the projected
   widget count.
5. Click `Queue` to simulate offline remote delivery. The same preview shows `queued` and
   `offline`; the assignment remains session-owned.
6. Click `Revoke`. The Player View preview returns to `No active Player View`, while the original
   Scene widget remains on the DM Scene.

The Playwright e2e spec `apps/v2/app/tests/e2e/player-view-projection.spec.ts` exercises this
path in desktop Chromium and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation | Test evidence |
| ----------- | -------------- | ------------- |
| CANVAS-005 | `SessionState` now stores active `playerViewAssignments` with projection target kind, scoped Scene/widget/section data, and `delivered` or `queued` delivery status. `session.project-player-view` validates DM authority, players, scenes, sections, widgets, and records session sync operations. `getPlayerViewForActor` scopes the assigned Player View before widget binding resolution. | `apps/v2/packages/core/tests/player-view-projection.test.ts` covers connected handout projection, offline queued delivery, revocation, scoped widget delivery, and visible+hidden binding filtering. Playwright covers project/queue/revoke UI. |
| CANVAS-006 | Player-view payload generation uses core-owned actor-filtered binding resolution before returning data to the GUI. No session assignment returns `unassigned`; uncached assigned content resolves to explicit `missing` state instead of stale data. | Core tests cover no default DM layout, DM-only character field omission, hidden values absent from serialized payloads, and missing offline content. |
| CANVAS-007 | Scene mutation authorization now allows DM or visible Scene `co-editor` actors. Non-DM widget add/configure paths check entity binding capability; existing widget reconfiguration also requires widget `manager`. `shared` Scene visibility now recognizes scene viewer/co-editor grants. | Core tests cover co-editor map-widget add with map viewer rights, rebind rejection without widget manager, and co-editor layout operation records with field-specific sync paths. |
| CANVAS-015 | Projection visibility is kept separate from permission grants and Scene sharing. Widget command validation treats projected widgets as visible for command routing, but command capability is still checked independently; revoke removes only the session assignment. | Core tests cover projected timer operation rejection without `operator`, no grants created by projection, revocation removing catch-up visibility, and widgets/entities remaining intact. |

## Architecture Contracts Satisfied

- **Contract 1: Processing / Display Decoupling** - Projection, revocation, co-editor mutations,
  binding filtering, and command permission checks are core commands/queries. The Svelte UI only
  dispatches commands and renders core view models.
- **Contract 3: Role, Visibility & Permission Grant Model** - Visibility is evaluated before
  player payloads leave the core, grants remain additive and separate, observers/players receive no
  writes from projection, and co-editor/widget/entity permissions are enforced at command time.
- **Contract 4: Scene and Widget Contract** - Scene widget layout/configuration remain Scene-owned,
  widget commands dispatch through declared core descriptors, hidden/missing/conflicted binding
  states are explicit, and Player View projection narrows delivery without mutating bound entities.

## Verification Run

```bash
pnpm --filter @dndtools/v2-core test
pnpm --filter @dndtools/v2-app test
pnpm v2:typecheck
pnpm v2:lint
pnpm v2:workpack:validate
pnpm v2:check
pnpm --filter @dndtools/v2-app e2e
```

Observed results:

- `pnpm v2:check`: workpack validation passed; v2 boundary lint passed; core/app typecheck passed;
  core tests 16 files / 133 tests passed; app tests 3 files / 9 tests passed.
- `pnpm --filter @dndtools/v2-app e2e`: 32 passed, 6 existing skips across desktop and mobile
  Chromium. The new projection spec passed in both projects.

## Quality Review

- **Correctness:** All mapped acceptance criteria have direct command/query tests or e2e coverage.
- **Architecture:** No v1 runtime imports; core owns durable state, authorization, and filtering.
- **Tests:** Unit, integration-style core query tests, typecheck, boundary lint, aggregate v2 check,
  and Playwright desktop/mobile coverage were run.
- **Accessibility:** Projection UI uses native inputs/buttons and participates in the existing
  keyboard-reachable Scene editor. Existing layout accessibility e2e remains green.
- **Performance:** Player-view filtering is linear over delivered Scene widgets and uses existing
  binding-resolution structures; no new render loop or browser-only processing path was added.
- **Security/privacy:** Hidden fields and hidden entities are redacted/omitted before GUI payloads;
  projection does not write permission grants or Scene sharing metadata.
- **Permissions:** DM-only projection/revocation; co-editor, widget manager, and entity viewer
  grants are evaluated in the Processing Core.
- **Persistence:** Session assignments persist through `SessionState` and the IndexedDB adapter
  hydrates older records with an empty `playerViewAssignments` map.
- **Sync/offline:** Offline projection records `queued` delivery status and local operation-log
  entries. Full remote provider replay remains future sync scope.
- **UX:** The Scene editor includes project, queue, revoke, and actor-filtered preview states with
  empty/denied/assigned outcomes.
- **Maintainability:** Changes are scoped to v2 core/session/query/widget command surfaces and the
  Scene UI prototype.
- **Docs/planning:** Evidence file added; workpack status commands run through the generator.

## Known Gaps / Deferred

- Cloud transport, remote reconnect delivery, and actual conflict replay are not implemented in
  this epic. The accepted local operations carry entity, path, revision, dependencies, and queued
  status for later sync/provider epics.
- The prototype supports one active Player View assignment per actor. Historical delivery audit
  beyond operation-log records belongs to later session/collaboration work.
- The UI seeds a demo `actor-player` so the local prototype can demonstrate projection without a
  session invite workflow. Real participant identity and invitations are assigned to later session
  and collaboration epics.

## Git Evidence

Branch: `epic/CANVAS-player-view-and-projection`.

Epic-owned implementation files:

```text
apps/v2/packages/core/src/state/session-state.ts
apps/v2/packages/core/src/schemas/commands.ts
apps/v2/packages/core/src/commands/player-view.ts
apps/v2/packages/core/src/commands/dispatch.ts
apps/v2/packages/core/src/commands/types.ts
apps/v2/packages/core/src/commands/widget.ts
apps/v2/packages/core/src/commands/widget-command.ts
apps/v2/packages/core/src/permissions/visibility.ts
apps/v2/packages/core/src/queries/scene.ts
apps/v2/packages/core/src/queries/command-actions.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/commands/helpers.ts
apps/v2/packages/core/src/testing/fixtures.ts
apps/v2/packages/core/tests/player-view-projection.test.ts
apps/v2/packages/core/tests/command-actions.test.ts
apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
apps/v2/app/src/lib/platform/storage/scene-store.ts
apps/v2/app/src/lib/gui/CommandPalette.svelte
apps/v2/app/src/routes/scene/[id]/+page.svelte
apps/v2/app/src/routes/styles.css
apps/v2/app/tests/unit/widget-library-store.test.ts
apps/v2/app/tests/e2e/player-view-projection.spec.ts
docs/planning/v2/epics/CANVAS-player-view-and-projection.completion.md
```

Generated planning files updated by workpack commands:
`docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`, and
`docs/planning/v2/epics/CANVAS-player-view-and-projection.yaml`.

Unrelated maintenance changes present before this epic and committed separately per handoff
request include dependency/tooling, workpack precedence, circular import audit, docs, and icon
vocabulary updates.

Commit/PR: final local commit hash is recorded in the handoff after completion and commit.

Final `git status --short` evidence expected after final commits:

```text
```

