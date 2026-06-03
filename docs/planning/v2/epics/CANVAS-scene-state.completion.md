# CANVAS-scene-state — Completion Evidence

Epic packet: `docs/planning/v2/epics/CANVAS-scene-state.yaml`
Workpack status: `complete` (see `docs/planning/v2/status.yaml`).
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

## Demo Path

1. From repo root: `pnpm install` (installs the new `@dndtools/v2-app` and `@dndtools/v2-core`
   workspace packages).
2. `pnpm v2:dev` to open the SvelteKit prototype at `http://localhost:5183/`.
3. The landing route is the Scene list. Create a Scene by filling the form (name, optional
   description, tags, visibility) and clicking **Create Scene**. The Scene appears in the list
   immediately and persists to IndexedDB under database `dndtools-v2`.
4. Click a Scene name to open `/scene/<id>/`. From there the DM can add widgets, move them with
   directional buttons (CANVAS-003 — keyboard-accessible alternative to drag), pin/unpin, remove,
   and save the Scene as a template (CANVAS-004).
5. Reload the browser. Both the Scene list and any in-scene widgets are re-hydrated from the local
   operation log + state document (CANVAS-001 restart criterion).

For headless verification: `pnpm v2:e2e` runs the same flow against both `desktop-chromium`
(1280×720) and `mobile-chromium` (Pixel 5) projects. The mobile project exercises the slim profile
form factor (CANVAS-003 mobile criterion).

## Requirement Traceability

| Requirement | Acceptance criterion | Implementation | Test                                                                                          |
| ----------- | -------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| CANVAS-001  | Create Scene with full metadata, persisted offline | `commands/scene-meta.ts:handleCreateScene`, `schemas/commands.ts:createSceneInputSchema`, `lib/platform/storage/scene-store.ts:persistFullState` | `tests/scene-create.test.ts: "persists name, description…"`, `tests/scene-create.test.ts: "appears in DM Scene selection after persistence and rehydration"`, `tests/unit/scene-store.test.ts: "persists a created Scene and rehydrates…"`, e2e `scene-create.spec.ts: "DM creates a Scene and sees it persist across a reload"` |
| CANVAS-001  | Player session sees no DM-only Scene without projection/share | `permissions/visibility.ts:evaluateSceneVisibility`, `queries/scene.ts:listScenesForActor` | `tests/scene-create.test.ts: "returns no Scene data to a player while a DM-only Scene exists…"` |
| CANVAS-001  | Missing required fields → no partial commit | `schemas/commands.ts:createSceneInputSchema`, `commands/helpers.ts:parseInput`, `commands/scene-meta.ts:handleCreateScene` | `tests/scene-create.test.ts: "rejects payloads missing required schema fields…"` |
| CANVAS-003  | Resize widget → scene revision changes, bound entity unchanged | `commands/widget.ts:handleResizeWidget`, reducer keeps binding object untouched | `tests/widget-layout.test.ts: "resizing a character widget does not touch the bound entity"` |
| CANVAS-003  | Two users edit different widget positions → independent or field-specific conflict | Operation-log records emit `{path: widgets/<id>/layout/position}` with `beforeRevision`/`afterRevision` allowing field-level merge | `tests/widget-layout.test.ts: "produces operation records for sync replay…"` |
| CANVAS-003  | Group transform preserves z-order and positions | `commands/widget.ts:handleGroupWidgets` + `handleMoveGroup` | `tests/widget-layout.test.ts: "groups and moves widgets together…"` |
| CANVAS-003  | Slim profile dock/pin uses the same command | Same handler dispatches `scene.dock-widget` / `scene.pin-widget` regardless of GUI; mobile Playwright project verifies the GUI works in compact viewport | `tests/widget-layout.test.ts: "move/resize/layer/dock/pin operations all flow through the same command surface"`, e2e `scene-create.spec.ts` (mobile-chromium project) |
| CANVAS-004  | Template instantiation produces new widget instances bound to same canonical entities | `commands/scene-meta.ts:handleSaveSceneTemplate` + `handleInstantiateSceneTemplate` clone widget IDs but preserve `binding.source.entityId` | `tests/scene-template.test.ts: "instantiation creates new widget instances bound to the same canonical entities"` |
| CANVAS-004  | Deleted binding target → widget renders `missing` without leaking cached content | `queries/scene.ts:getSceneForActor` returns `{kind: 'missing'}` payloads when resolver does not know the entity | `tests/scene-template.test.ts: "renders a missing state for widgets whose binding target is unknown…"` |
| CANVAS-013  | Player on `shared` Scene with assignment sees Scene shell; widget bindings still actor-filtered | `permissions/visibility.ts` + `queries/scene.ts:getSceneForActor` with `BindingResolver.isHiddenForActor` | `tests/scene-visibility.test.ts: "player assigned to a shared Scene sees the Scene shell…"` |
| CANVAS-013  | Tag/background changes leave widget bindings and canonical entities untouched | `commands/scene-meta.ts:handleUpdateSceneMetadata` only mutates Scene fields | `tests/scene-visibility.test.ts: "changing tags or background does not touch widget bindings…"` |
| CANVAS-013  | DM-only authoring distinction | DM check in `requireDm` helper used by all metadata commands | `tests/scene-visibility.test.ts: "non-DM editors cannot author Scene metadata"` |
| CANVAS-018  | Sections persist as layout metadata, not separate widget owners | `commands/scene-meta.ts:handleSetSceneSections`; `state/scene-state.ts:SectionLayoutRegion` lives on Scene | `tests/scene-sections.test.ts: "persists sections as layout metadata on the Scene document…"` |
| CANVAS-018  | Section projection narrows widget delivery while preserving actor filtering | `queries/scene.ts:getSceneForActor` honours `PlayerViewAssignment.sectionIds` and still runs binding filter | `tests/scene-sections.test.ts: "narrows player payload to assigned section widgets…"` |
| CANVAS-018  | Reject sections that reference unknown widget ids | `handleSetSceneSections` validates membership before commit | `tests/scene-sections.test.ts: "rejects sections that reference unknown widget ids"` |

## Architecture Contracts Satisfied

- **Contract 1 (Processing/Display Decoupling)** — `@dndtools/v2-core` has no Svelte/DOM/Node/v1
  imports (enforced by `scripts/v2-boundary-lint.ts` + `tests/boundary.test.ts`). All durable
  mutations enter through `dispatchCommand`; the GUI is a thin render+dispatch layer.
- **Contract 3 (Role/Visibility/Permission Grants)** — `Scene` carries explicit `visibility`,
  `sharingTargets`, `playerViewAssignments`. `evaluateSceneVisibility` runs at the query layer
  before any non-DM data leaves the core. DM-only commands fail closed for players/observers.
- **Contract 4 (Scene & Widget)** — `SceneState` owns layout (position, size, z, group, dock, pin),
  scene template metadata, and section layout regions. Widgets own configuration + bindings; the
  reducer never mutates bound entity revisions. Operation log records carry
  `path = widgets/<id>/layout/<field>` for future field-level merge.

## Verification Run

Commands run during handoff:

```
pnpm v2:workpack:validate    # passes
pnpm v2:lint                  # boundary lint passes
pnpm v2:typecheck             # core + app both clean
pnpm v2:test                  # 40 core + 3 app unit tests
pnpm v2:e2e                   # 4 Playwright tests (desktop + mobile)
pnpm v2:check                 # bundles all of the above
```

## Known Gaps / Deferred

- Multi-user sync transport is not wired (per ADR-014 the operation log is single-device for now).
  The operation records include `vaultId`, `sourceId`, `actorId`, `beforeRevision`,
  `afterRevision`, and `path`, leaving the merge contract ready for a later SYNC epic.
- `WidgetBinding` filtering hooks exist (`BindingResolver.isHiddenForActor` returns `hidden`
  payload state) but the actual entity-data layer is out of scope. Real filtering belongs to
  `CANVAS-widget-data-safety` (CANVAS-009/010).
- Scene `co-editor` grant authoring is implemented for evaluation
  (`actorCanCoEditScene`) but no UI in this slice exposes player-authored layout writes — that
  surface belongs to `CANVAS-player-view-and-projection`.
- Visual settings only support the four enumerated backgrounds; theming work beyond that is
  deliberately out of scope.
- The `apps/v2` workspace uses `peerDependencies`/`workspace:*` for inter-package coupling but
  ships only as source (no `tsup`/`tsc` build for `@dndtools/v2-core`); Vite resolves source
  directly. A publishable build step is a later concern.
