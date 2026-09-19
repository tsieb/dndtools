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

## 5. Author a package, from fork to `.dndmodule`

Start in Extensions → System, choose a starting system and **Build your own**. Give the fork a
name; it receives a new `custom:` id and opens the builder. Work through identity and vocabulary,
attributes and skills, resources, conditions, dice and turns, creature fields, advancement, and
review. Save the package before selecting it. Selection previews character-data changes; review
any remaps or drops before acknowledging them.

For file-based authoring, fork the repository, install its dependencies with `pnpm install`, and
copy `packages/core/src/systems/samples/pf2e.json` to `my-system.json`. This is a complete sample,
including three-action turns, conditions and proficiency formulas. Change `id` to a unique
`custom:my-system`, set `displayName`, `summary` and a version such as `1.0.0`, then edit the rules.
The built-in data in `packages/core/src/systems/dnd5e.ts` and `generic.ts` provide other starting
points; the validator accepts plain package JSON, not TypeScript or a bundle envelope.

Keep every required field, using `null` or an empty array where the schema permits it. Unknown
fields are errors, even inside nested objects. Keep condition keys unique and choose semantic icon
names from `ICON_REGISTRY` in `apps/gm-react/src/ds/components/core/Icon.jsx`, explained in the
[icon vocabulary](../reference/ICON_VOCABULARY.md). Multiple conditions may reuse an icon; unique
keys are required. Skills must reference an existing attribute key, or `null`.

Formulas use the grammar in section 1. Their available inputs depend on the field:

| Field                             | Inputs                                                |
| --------------------------------- | ----------------------------------------------------- |
| `attributes[].derivation.formula` | `score`                                               |
| `resources[].maxFormula`          | `level`, `score`, `modifier`, `proficiency`           |
| `turnModel.initiativeFormula`     | `modifier`, `score`, `level`                          |
| `derived[].formula`               | Only names explicitly listed in that entry's `inputs` |

Validate before packaging:

```sh
pnpm systems:validate my-system.json
pnpm systems:validate # checks 5e, Generic and the PF2e sample
pnpm check            # includes systems:validate before the other gates
```

The CLI prints `PASS` for each schema-validated leaf and a separate result for every formula at
levels 1, 5, 10 and 20, plus each condition's icon and key. Failures name JSON paths such as
`$.resources[0].maxFormula` or `$.vocabulary.typo` and exit with status 1. Multiple file arguments
are supported and all are checked. A schema failure skips that file's semantic checks until its
shape is fixed. File-read and JSON syntax errors also fail the command.

Preview scopes use score 16, modifier 3, and proficiency `2 + floor((level-1)/4)`, matching the
builder's sample character. Derived inputs with other names use 1; each formula row prints the
actual scope. These are synthetic smoke checks, not rules-balance verification or proof that a
formula works for every character. Check representative scores, resource limits and system-specific
proficiency separately. The PF2e sample is a vocabulary scaffold, not a complete implementation of
all Pathfinder rules.

To turn edited JSON into a portable file, use the core bundle helper. Save this temporary script as
`scripts/package-my-system.ts` in your checkout, then run `pnpm exec tsx scripts/package-my-system.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { systemPackageSchema } from '../packages/core/src/schemas/system-package';
import { exportSystemPackageBundle } from '../packages/core/src/commands/system-package';

const pkg = systemPackageSchema.parse(JSON.parse(readFileSync('my-system.json', 'utf8')));
const result = exportSystemPackageBundle(
	{
		packages: { [pkg.id]: pkg },
		activePackageId: pkg.id,
		activeWidgetPackageId: null,
		schemaVersion: 1,
	},
	pkg.id,
);
if (!result.ok) throw new Error(result.reason);
writeFileSync('my-system.dndmodule', JSON.stringify(result.bundle, null, 2) + '\n');
```

The helper creates and validates the `system-package` manifest and payload together. Do not simply
rename raw package JSON to `.dndmodule`. Test the resulting file through the app's module import
flow in a test campaign: import creates a custom package without activating it, and resolves id
collisions without overwriting existing systems. Select it through the System picker, inspect the
change preview, and try a character sheet, resources, conditions and rolls. Share the tested bundle
with its version, author attribution, applicable content license and a short description of the
rules it models. For updates, increment the version and repeat validation and import testing.
