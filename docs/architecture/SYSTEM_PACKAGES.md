# System Packages

As-built reference for the rules-vocabulary slice. Decision record:
[ADR-028](../adr/028-system-packages-rules-contract.md), whose implementation note records where the
shipped shape differs from the original decision text.

## 1. The shape

`SystemPackage` (`packages/core/src/state/system-package.ts`) is pure JSON data with no functions:

```text
id, version, displayName, summary
vocabulary        chrome word substitutions (GM/DM/Keeper, spell/power, …)
attributes[]      scored sheet cells (5e: STR…CHA; Generic: none)
resources[]       depletable pools with recovery rules (HP, slots, hit dice, class resources)
conditions[]      the status registry, each with a distinct icon
dice              roll and result model
turnModel         initiative | actions-per-turn | popcorn | none
creatureSchema[]  stat-block fields
advancement       xp | milestone | none, with the default mode
skills[]          key, label, attribute
derived[]         proficiency, passive scores, … as formulas
```

Arithmetic is declared as a `SystemFormula` in a tiny expression grammar (`floor((score-10)/2)`,
numbers, identifiers, `+ - * /`, `floor` `ceil` `round` `abs` `min` `max`) and evaluated by the pure
`evaluateFormula`. The grammar has no host calls and no variable it is not given, so the formula is
the sandbox: an untrusted package cannot execute anything.

## 2. The `systems` slice

```ts
interface SystemsState {
	packages: Record<string, SystemPackage>;
	activePackageId: string;
	activeWidgetPackageId: string | null; // legacy bridge for widget.package.switch-system
	schemaVersion: 1;
}
```

Flatter than the ADR proposed: no per-package trust record and no install lifecycle, because a
system package is inert data. Two built-ins, `builtin:dnd5e` and `builtin:generic`
(`packages/core/src/systems/{dnd5e,generic}.ts`), are re-seeded on every hydrate so they can never
be edited or deleted; a vault with no `systems` document or a dangling `activePackageId` falls back
to 5e. `activeWidgetPackageId` carries the pre-existing widget-package id so
`widget.package.switch-system` keeps working; the two id namespaces are never conflated.

## 3. Commands

| Command         | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `system.select` | Switch `activePackageId`, gated by `previewSystemPackageSelect` |
| `system.define` | Author a new `custom:` package                                  |
| `system.update` | Edit an existing `custom:` package                              |
| `system.delete` | Remove a `custom:` package                                      |
| `system.fork`   | Clone a built-in or custom package into a new `custom:` id      |

All DM-only (`packages/core/src/commands/system-package.ts`). Authoring is confined to the
`custom:` namespace (ADR-023's rule applied to systems); `system.fork` is how a homebrew system starts
from 5e. `previewSystemPackageSelect` (`queries/system-switch-query.ts`) classifies every attribute,
resource, condition, and skill the active package declares as `keep` / `remap` / `drop` against the
target with the count of characters carrying data under each key; `system.select` fails closed on a
destructive `drop` unless the caller sends `acknowledgeLoss`. The older `previewSystemSwitch` still
answers the separate widget-instance question for `widget.package.switch-system`.

A package travels as a `.dndmodule` of kind `system-package` (`exportSystemPackageBundle` /
`importSystemPackageFromBundle`); an imported package is always re-homed under a free `custom:` id
and does not become active ([ADR-034](../adr/034-marketplace-listing-kinds-and-module-bundle-format.md)).

## 4. Where the app reads it

`getActiveSystemForActor` / `resolveVocabulary` (`queries/system-query.ts`) are the actor-scoped
reads. Characters read attributes, skills, derived values, resources, and rest recovery from the
package; combat and the design system's condition registry read conditions through
`SystemProvider` (`ds/components/condition/SystemProvider.jsx`); dice and turn models, creature
schema, encounter math, compendium mapping, widget bodies, and the chrome vocabulary
(`{gm}`-style message placeholders, distance units) all resolve from the active package. The
picker and the fork-and-edit builder live in `screens/extensions/{System,SystemBuilder}.tsx` over
`app/systemBuilder/`. A Pathfinder 2e sample ships in the starter library as data.
