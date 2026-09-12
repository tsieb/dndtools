# ADR-041: Screens as the run surface

- Status: Accepted
- Date: 2026-09-12
- Deciders: Engineering
- Consulted: Product, Design, Accessibility
- Supersedes: N/A
- Related: [ADR-013](./013-three-layer-navigation-contract.md), [ADR-029](./029-scene-layout-history.md), [ADR-031](./031-custom-widget-runtime-host.md)

## Context

[RC roadmap §1.6 D1 and CAN-7](../planning/RC_ROADMAP.md) decide that Command Center, the GM screen
board and Session become one customizable run surface. Today they overlap in dice, combat and audio,
but the hub and Session are bespoke pages while the board renders a scene of widgets. D1 requires
the default Command Center to retain its appearance and behavior, including player and observer
variants. Where standard widgets cannot reproduce it, extend the public widget builder until they
can; do not hide a bespoke hub behind a widget-shaped wrapper.

This ADR accepts the target contract. The source observations below describe the pre-conversion
implementation; acceptance of this decision does not establish that CAN-7 is implemented.

## Decision

### One scene identity

A **screen is a scene**, a user-created, switchable workspace of widget instances stored in the
existing scene collection. There is no second screen entity, duplicate widget store or parallel
permission model. Keep scene IDs, commands, bindings, sharing, templates and layout history.

Add optional screen metadata to the scene: **pinned**, **pin order**, **layout policy** and
**template origin**. Screen pinning is distinct from `WidgetLayout.pinned`, which describes a tile.
Template origin records provenance, not a live dependency that overwrites a customized screen;
reuse the existing scene-template provenance where applicable. The exact schema belongs to CAN-7.2.
Absent metadata must round-trip byte-identically and resolve to unpinned, existing canvas behavior
without writing defaults into old scenes. Preserve the schema version only if that additive
compatibility is demonstrated; incompatible persisted changes require a migration and version bump.

Durable changes go through core commands, including `scene.set-pinned`, `scene.reorder-pins`,
`scene.set-layout-policy` and `scene.duplicate`. The planned `listScreensForActor` read applies
existing actor visibility rules; players may list only screens visible to them.

### Two layout policies

| Policy   | Behavior                                                                                                                                                                                                                                     | Use                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `flow`   | Responsive column grid; tile heights follow content; resizing chooses a column span. Visual reading order, DOM reading order and keyboard focus order follow the same layout order. Phone collapses to one column without dropping controls. | Default for hub screens, including Command Center.            |
| `canvas` | Today's bounded board for running the table and free scene editor for arranging spatial tiles. Retains coordinates, sizing, grouping and existing canvas focus behavior.                                                                     | Existing boards and spatial screens, including the GM screen. |

Both policies use the same widget instances, render resolver and core mutation path. Drag, keyboard
and menu movement dispatch the same move command. Flow must not use visual-only CSS reordering or
masonry packing that disagrees with reading order. Policy conversion must preserve widget identity,
configuration and bindings; layout undo continues under ADR-029. Canvas's current z-order and
pin/dock traversal is not evidence that flow's reading-order requirement is satisfied.

### Routes and history

The canonical library is `/screens`; an individual screen is `/screen/:id`. Under the existing
HashRouter these are application paths. Preserve old links by resolving them as follows:

| Entry route  | Resolution                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------- |
| `/`          | The vault's home screen, initially Command Center.                                            |
| `/board`     | The GM screen, including the preserved home board in an existing vault.                       |
| `/session`   | The Session screen.                                                                           |
| `/scenes`    | `/screens`, the library.                                                                      |
| `/scene/:id` | `/screen/:id` with the same scene identity; layout editing remains available from the screen. |

One navigation action creates exactly one history entry. Alias normalization replaces the current
entry rather than pushing another; direct bookmarks must not leave an intermediate alias to trap
Back. Library, header switcher, palette and pins use the same resolution. Missing, deleted or
inaccessible IDs require an honest unavailable state with a route back to the library, never a
visibility bypass or an unrelated scene substituted silently.

### Defaults and preservation

Fresh vaults receive three default screens: **Command Center** as home, **GM screen** and
**Session**. Command Center uses flow; the GM screen uses canvas. Session is assembled from standard
widgets with the behavior inventoried in CAN-7.5; its detailed template is owned by CAN-7.8.

For existing vaults, preserve the old `commandCenter.homeSceneId` target as the GM screen. Its ID,
name, widgets, layouts, configuration, local state, bindings and visibility remain untouched. Add
the new Command Center and make it home; retain a stable reference to the old board so `/board`
continues to open it after the home pointer changes. Ensure a Session screen without replacing
existing content. Provisioning must be idempotent on repeated opens and replay, and must not reset
later user customizations. Default GM workspaces start GM-only; creating or pinning one does not
project it to players.

### Vocabulary and navigation layers

Use **Screens** for the GM workspace library and **screen** for a configurable workspace. Retain
**scene** for what is projected to players: opening a GM screen is distinct from projecting a scene.
The core continues to use `Scene` and `scene.*`; these internal names do not require duplicate
product concepts. Render GM/DM terminology through the active System Package vocabulary. Visibility
labels describe visibility (GM only, Shared, Player visible), not editorial status such as Draft or
Ready. Projection still requires an explicit action and actor-filtered data.

Under ADR-013, sidebar pins form a **user-defined Screens group** of workspace shortcuts in the
shell, ordered by the GM. They do not become separately hard-coded primary sections. `nav.ts`
remains the source of global IA, and AppShell owns its rendering. The Run entries resolve to their
default screens; the global IA otherwise stays unchanged. The group provides All screens and a
distinct create action; creation is not a primary navigation destination. Rail pins have accessible
names, and phone More lists pins first. Pin reorder has a keyboard equivalent using the same core
command. Preserve uniquely labelled landmarks and the global/local/contextual distinction.

## Consequences

### Positive

- One model makes library discovery, duplication, templates, pins and customization available to
  all three run surfaces while retaining scene permissions and history.
- Flow accommodates responsive hub content without fixed tile heights; canvas preserves spatial
  work and existing boards.
- Stable identities and compatibility routes protect bookmarks and user-created layouts.

### Negative

- Two layout policies need separate accessibility checks and explicit, lossless conversion rules.
- Moving home requires separate default-screen resolution; the current home pointer alone cannot
  continue serving both `/` and `/board`.
- Full hub and Session parity requires widget-builder work and migration tests before replacement.
  GM-screen versus projected-scene wording must remain clear despite the shared core record.

## Rejected Alternatives

| Alternative                                           | Benefit                                  | Why rejected                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Separate Screen entity                                | Clean product-specific type boundary.    | Duplicates scene storage, widgets, permissions and lifecycle; introduces synchronization and migration risk. |
| Keep three bespoke pages                              | Lowest immediate conversion cost.        | Preserves overlapping features and denies users consistent customization and library behavior.               |
| Canvas only                                           | Reuses today's layout engine throughout. | Fixed spatial layouts cannot preserve responsive hub content and natural reading order reliably.             |
| Flow only                                             | One responsive layout model.             | Discards the spatial board and free editor that existing vaults depend on.                                   |
| Replace or reseed the existing home board             | Simpler default provisioning.            | Destroys user customization; adding a new home is safer.                                                     |
| Hard-code every pinned screen as a global destination | Uses the static route list directly.     | User content would redefine global IA and bypass the ADR-013 shell contract.                                 |
| Remove legacy routes or push redirect chains          | Less alias handling.                     | Breaks bookmarks or violates the single-history-entry navigation contract.                                   |

## Migration Impact

CAN-7.2 first adds metadata, commands, actor-scoped reads and schema/round-trip/isolation tests.
CAN-7.3 and 7.4 implement canonical routes, library, switching and pins; CAN-7.7 adds flow.
CAN-7.5 inventories the existing surfaces before replacement. CAN-7.6 and 7.8 convert Command Center
and Session only after their widget gaps and parity requirements are covered; CAN-7.9 verifies the
integrated result. This ADR changes no runtime or vault data.

Required evidence includes customized-vault preservation and repeated provisioning, alias Back/Forward
behavior, actor isolation, keyboard reorder, labelled landmarks at all tiers, and Command Center
DOM/ARIA plus visual parity across themes and tiers. A GM-built copy must use the public widget
definition surface and pass the same parity checks. Runtime performance must remain within the
declared first-render budget.

## Rollback Plan

If conversion loses content, breaks actor isolation or fails parity, stop rollout and retain the
existing run surfaces. After provisioning, preserve newly created screens and user edits; do not
delete them to undo navigation. Restore the old board's recorded default mapping through the core
command path if necessary. Do not load metadata-bearing vaults into an older strict schema without
a tested compatibility path. Use a pre-migration backup only as an explicit recovery choice, since
restoring it can discard subsequent edits. Route rollback alone does not undo persisted changes.

## Verification and Evidence

Source inspection on 2026-09-12 at commit `8b582677939ad2d89ff843affa60af78bd578ae9`:

- [Scene state](../../packages/core/src/state/scene-state.ts) and its
  [strict schema](../../packages/core/src/schemas/scene.ts) have widgets and template provenance but
  no screen metadata. Widget pinning already exists and must not be confused with screen pins.
- [Home command](../../packages/core/src/commands/command-center.ts) currently ensures one home
  scene and returns unchanged state when it exists. [Board](../../apps/gm-react/src/screens/Board.tsx)
  reads that home pointer; this is the preservation and route-resolution seam.
- [Routes](../../apps/gm-react/src/App.tsx) still mount CommandCenter, Board, Session, ScenesCreator
  and SceneEditor separately. [Navigation](../../apps/gm-react/src/app/nav.ts) still declares the
  existing Run destinations. Canonical screen routes and alias replacement are pending.
- [Home tests](../../packages/core/tests/command-center.test.ts) assert single-scene creation and
  idempotence; [visibility tests](../../packages/core/tests/scene-visibility.test.ts) cover the
  existing actor-scoped model. [Focus tests](../../packages/core/tests/scene-focus-order.test.ts)
  cover canvas metadata traversal, not flow layout. These tests were inspected, not run for this ADR.

Related architecture owners are [NAVIGATION.md](../architecture/NAVIGATION.md) and
[WIDGETS.md](../architecture/WIDGETS.md). Their backlinks to this ADR require a companion change:
CAN-7.1's ownership grants only this ADR and its index. Full cross-link acceptance remains pending
that handoff. Browser behavior, migration, visual parity and performance remain unvalidated by this
documentation-only change; the central operator runs gates and independent review afterward.
