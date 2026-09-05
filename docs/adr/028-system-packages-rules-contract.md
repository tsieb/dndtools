# ADR-028: System Packages as the Rules Contract

- Status: Accepted
- Date: 2026-09-04
- Deciders: Engineering
- Consulted: Product, Design
- Supersedes: N/A
- Amends: ADR-014 (see note below) and the System Package contract described in
  `docs/design-package/readme.md` ("SYSTEM PACKAGES" section, informally "the widget brief").

## Context

The design package (`docs/design-package/readme.md`) specifies that DND Tools is system-agnostic:
the rules vocabulary a table plays by — attributes, resources, conditions, dice model, action
economy, creature schema, terminology, advancement model — comes from a swappable **System
Package**, with D&D 5e and a Generic/narrative package shipping built-in and community packages
(e.g. Pathfinder 2e) arriving as data.

The live code does not implement that contract. `WidgetPackageState.activeSystemPackageId`
(`packages/core/src/state/widget-package-state.ts:302`) is a plain id field bolted onto the
**widget**-package slice; nothing declares a `SystemPackage` record, and there is no `systems`
durable slice. 5e is hardcoded across `character-*`, `combat-tracker`, `encounter`, the design
system's `CONDITIONS` registry, and CharBuilder (roadmap `docs/planning/RC_ROADMAP.md` §1 finding
G1). The only real machinery today is the system-**switch** dry-run
(`packages/core/src/queries/system-switch-query.ts`), which is well-shaped but operates on
`WidgetPackageState` and compares `WidgetPackageDefinition.package.widgets` — the widget-type
manifest a _widget_ package declares — not a rules contract.

Two install/trust lifecycles are being conflated by the current shape: a **widget package**
carries sandboxed, potentially executable UI (custom-html-js widgets, host permissions, iframe
review) per ADR-030's future host model; a **system package** is pure rules data with no code and
no host permissions. Putting the active system id on the widget slice, and the widget-vocabulary
mapping as the _only_ dry-run axis, blocks a community rules-only package (e.g. a Pathfinder 2e
data pack with no widgets at all) from having a sensible install/trust/switch story of its own.

A decision is needed before any P1 System-workstream story (SYS lane) can build the System Package
picker, the built-in 5e/Generic packages, or the character/combat/condition rendering that reads
from them.

**Note on ADR-014.** ADR-014 (superseded by ADR-016/018; its stack/boundary decisions otherwise
remain in force) predates the System Package concept entirely and contains no literal
"campaignSystem" text — the roadmap's cross-reference points at the informal `campaignSystem`
module name used in `docs/design-package/readme.md:68`, not at ADR-014's body. This ADR amends that
design-package framing directly; ADR-014 gets a pointer note only, no content change, since none of
its actual decisions (SvelteKit-era scaffold, storage, testing) speak to rules vocabulary.

## Decision

### A `SystemPackage` record, owned by core

Add a `SystemPackage` type (zod-validated, `packages/core/src/state/`) declaring the contract from
the design package, nothing more:

- `id`, `name`, `version`
- `attributes: AttributeDef[]` — scored sheet cells (5e: STR…CHA + mod/save; Generic: empty)
- `resources: ResourceDef[]` — depletable/restorable pools (5e: HP, spell slots, hit dice)
- `conditions: ConditionDef[]` — status registry, each with a distinct icon shape
- `diceModel: DiceModelDef` — roll/result vocabulary (5e: d20 + mods/advantage; pool-based systems:
  dice pools/successes)
- `actionEconomy: ActionEconomyDef` — turn structure (5e: standard/bonus/reaction; PF2e: three
  actions; narrative: none)
- `creatureSchema: CreatureFieldDef[]` — stat-block/sheet fields (5e: full monster block; Generic:
  freeform)
- `vocabulary: SystemVocabulary` — chrome word substitutions (GM/DM/Keeper, "spell"/"power", etc.)
  and the advancement model (`xp | milestone | none`)
- `widgetVocabulary: { type: string; version: number }[]` — the widget types this system expects to
  exist, in the SAME `{type, version}` shape `WidgetPackageDefinition.widgets` already uses. This is
  the only overlap with widget packages, and it exists solely so the existing keep/remap/drop
  dry-run algorithm (`previewSystemSwitch`) has something to diff; a system package does not carry
  widget implementations or sandboxed code.

### A new `systems` durable slice, schema v1

Add `SystemState` (`packages/core/src/state/system-state.ts`), `SYSTEM_STATE_SCHEMA_VERSION = 1`:

```
interface SystemPackageRecord {
  package: SystemPackage;
  trust: WidgetPackageTrustReview;      // reused shape: trust state, decisions per install
  enabled: boolean;
  removedAt: string | null;
  installedAt: string;
  updatedAt: string;
  revision: number;
  migrationStatus: WidgetPackageMigrationStatus; // reused shape
  diagnostics: WidgetDiagnostic[];               // reused shape
}
interface SystemState {
  packages: Record<string, SystemPackageRecord>;
  activeSystemPackageId: string | null;
  schemaVersion: 1;
}
```

Reusing the trust/migration/diagnostic record shapes (not the widget-package slice itself) keeps
the review UX and Settings surface consistent between "Extensions" (widgets) and "Campaign system"
(rules) without merging their lifecycles. `systems` joins `DURABLE_STATE_DOCUMENT_IDS` /
`TARGET_SCHEMA_VERSIONS` (`packages/core/src/migration/schema-versions.ts`) as its own document.

### The active id moves off `WidgetPackageState`

`WidgetPackageState.activeSystemPackageId` is removed. `WIDGET_PACKAGE_STATE_SCHEMA_VERSION` bumps
1 → 2 with a migration that reads the old field (if present) and seeds
`SystemState.activeSystemPackageId` on first load, then drops the field from the widget document —
an explicit migration + test per guardrail 3, not a silent additive change, because it changes what
the widget document persists.

### Built-in packages ship in code; community packages are data

`system.5e` and `system.generic` are code-defined `SystemPackage` constants, always `trusted` and
`enabled`, exactly mirroring today's rule that only code-defined `system.*` **widget** packages are
trusted by default (roadmap finding G5). Community/community-forked packages arrive as data through
a parallel command family — `system.package.install`, `system.package.review`, `system.package.remove`
— structurally identical to `widget.package.install`/`widget.package.review-permissions` but
operating on `SystemState`, because a system package has no host permissions to grant (it is inert
data: no code, no sandbox, no `WidgetHostPermission`). Trust review for a system package is a single
DM accept/reject of the parsed contract, not a per-permission grant.

### Switching keeps running the existing dry-run

`system.package.switch` wraps the same two-part check `previewSystemSwitch` already performs:

1. The PLAT-008 vault migration dry-run (unchanged — `planMigration`).
2. The widget-vocabulary keep/remap/drop mapping (unchanged algorithm), now sourced from the
   FROM/TO `SystemPackage.widgetVocabulary` lists instead of `WidgetPackageDefinition.package.widgets`,
   against live Scene widget instances exactly as today.

The command remains fail-closed on `package-not-found` / `package-removed` / `package-disabled` /
`already-active`, and destructive (drop with live instances) switches require explicit DM
acknowledgment, unchanged from today's contract.

## Consequences

### Positive

- Rules vocabulary becomes a real, testable, core-owned contract instead of an implicit assumption
  baked into `character-*`/`combat-tracker`/CharBuilder — the precondition every SYS-lane story
  needs.
- System packages and widget packages get lifecycles proportional to their actual risk: rules data
  reviews as data, sandboxed widget code reviews with host-permission scrutiny. Neither blocks the
  other from installing independently.
- The existing, already-tested dry-run algorithm is reused verbatim (relocated inputs only), so the
  switching UX and its safety guarantees do not regress.

### Negative

- Two parallel package-record shapes (widget, system) sharing trust/migration/diagnostic sub-types
  add a small amount of duplication versus one unified "package" concept.
- The `WidgetPackageState` schema bump (1→2) requires a migration and test before any SYS-lane
  story can land, adding sequencing weight to the first implementation story.
- `widgetVocabulary` on `SystemPackage` is a second place a widget `{type, version}` pair can be
  declared (the other being `WidgetPackageDefinition.widgets`); the two lists can drift for a
  package author who forgets to keep them in sync, surfaced only at switch-preview time.

## Rejected Alternatives

| Alternative                                                                                        | Why Rejected                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `activeSystemPackageId` on `WidgetPackageState`, add fields alongside it                      | Conflates two different install/trust lifecycles (sandboxed code vs. inert rules data) in one slice and one Settings surface.                                                                                     |
| Make `SystemPackage` a subtype/extension of `WidgetPackageDefinition`                              | Widget packages carry sandbox/runtime/host-permission concerns (ADR-030) that are meaningless for pure rules data and would force every system package through code-review UX.                                    |
| Compare FROM/TO system packages' full creature/attribute schemas at switch time (not just widgets) | Out of scope for a dry-run whose job is to protect existing Scene content; attribute/resource remapping is a content-authoring concern the DM handles when adopting a new system, not a blocking migration check. |
| Skip a dedicated `systems` slice; derive the active system from the installed widget package set   | Leaves "which system is active" un-persisted when no widget package happens to encode it (e.g. before any community package is installed) — fails closed incorrectly for the built-in case.                       |

## Migration Impact

- New `systems` document, schema v1, added to `DURABLE_STATE_DOCUMENT_IDS`/`TARGET_SCHEMA_VERSIONS`.
- `WidgetPackageState` schema bump 1 → 2: migration removes `activeSystemPackageId`, seeding it into
  the new `systems` document on first load; ships with a migration test (byte-for-byte round-trip
  aside from the moved field, per guardrail 3/4).
- `widget.package.switch-system` is retired in favor of `system.package.switch`; `previewSystemSwitch`
  is regeneralized to take a `SystemState`-shaped input instead of `WidgetPackageState`, keeping its
  exported findings/preview types unchanged so callers (Settings › Extensions & systems) only rewire
  their input source.
- ADR-014 gets a one-line "Amended by ADR-028" pointer; no content change.

## Rollback Plan

If the split proves unworkable during implementation: keep `activeSystemPackageId` on
`WidgetPackageState`, do not add the `systems` slice, and continue hardcoding 5e in the affected
screens. No user-durable data is at risk either way — the migration only moves one id field between
two already-versioned documents, and it is reversible by the inverse migration before the schema
version advances further.

## Verification and Evidence

- `packages/core/src/state/widget-package-state.ts:294-304` — current `WidgetPackageState` shape
  and the `activeSystemPackageId` field this ADR relocates.
- `packages/core/src/queries/system-switch-query.ts` — the existing dry-run this ADR reuses.
- `docs/design-package/readme.md:36-90` ("SYSTEM PACKAGES") — the product contract this ADR
  formalizes in core.
- `docs/planning/RC_ROADMAP.md` §1 finding G1, G5; §5 (workstream SYS).

Validation required when the implementing story lands: `pnpm typecheck`, `pnpm test:critical`
(new `systems` slice + migration tests), boundary lint (`scripts/boundary-lint.ts`).

## Implementation Note — RC-SYS-1.3 (2026-09-05)

Two details of this ADR were settled differently when the commands landed. Both are recorded here
rather than in a new ADR because neither reverses the decision above; they refine how it is spelled.

**Command names.** This ADR anticipated one command, `system.package.switch`, replacing
`widget.package.switch-system`. `docs/planning/RC_ROADMAP.md` (RC-SYS-1.3) instead specifies five —
`system.select`, `system.define`, `system.update`, `system.delete`, `system.fork` — because the DM
now authors packages, not just picks between them. `widget.package.switch-system` is NOT retired: it
still governs `systems.activeWidgetPackageId`, the legacy widget-package id carried across by
RC-SYS-1.1, and its widget-instance dry-run answers a question the rules commands do not ask.
`previewSystemSwitch` therefore keeps its `WidgetPackageState` input unchanged.

**The rules dry-run.** The Rejected Alternatives table above rules out comparing FROM/TO
attribute/resource schemas _in the widget-content dry-run_, and that still holds —
`previewSystemSwitch` is unchanged. RC-SYS-1.3 adds a SECOND, separate dry-run,
`previewSystemPackageSelect` (`packages/core/src/queries/system-switch-query.ts`), which does exactly
that comparison for `system.select`: every attribute, resource, condition and skill the active
package declares is classified `keep`/`remap`/`drop` against the target, with a count of the
characters carrying data under each key. A `drop` with characters behind it is destructive and
`system.select` fails closed on it unless the DM sends `acknowledgeLoss`. The rejected alternative
was about not BLOCKING a widget migration on rules concerns; it was not a decision to let a system
change strand character data silently.

Authoring is confined to the `custom:` id namespace (ADR-023's rule, applied to systems): the
built-in packages ship with the build and are re-seeded by `hydrateSystemsState` on every load, so a
define/update/delete against one would be silently reverted at the next hydrate. `system.fork` is
the sanctioned way to base a homebrew system on a built-in one.

Evidence: `packages/core/src/commands/system-package.ts`,
`packages/core/tests/system-package-commands.test.ts` (66 tests).
