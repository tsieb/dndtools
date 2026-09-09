# System Packages

> **Status:** As-built reference for the SYS-lane rules-vocabulary slice.
> **Decision record:** `docs/adr/028-system-packages-rules-contract.md` (ADR-028). This doc
> tracks the shipped code, including several places the implementation (RC-SYS-1.3, noted in
> the ADR's own "Implementation Note") settled differently than the original decision text.
> **Audience:** Engineers touching character sheets, combat, conditions, or anything that
> currently hardcodes D&D 5e assumptions.

## 1. The problem this closes

The product is meant to be system-agnostic — the words, stats, conditions, dice model, and
turn structure a table plays by should come from a swappable package, with D&D 5e and a
Generic package built in. Before this slice, `activeSystemPackageId` was a bare id field on
the **widget**-package state with nothing behind it: no `SystemPackage` type, no `systems`
durable slice, and 5e hardcoded across character/combat/condition code.

## 2. The `SystemPackage` shape

`SystemPackage` (`packages/core/src/state/system-package.ts:492`) is pure, JSON-serializable
data — no functions, no classes:

```
id, version, displayName, summary
vocabulary: SystemVocabulary        // chrome word substitutions (GM/DM/Keeper, "spell"/"power"…)
attributes: SystemAttribute[]       // scored sheet cells (5e: STR…CHA; Generic: empty)
resources: SystemResource[]         // depletable/restorable pools (5e: HP, spell slots, hit dice)
conditions: SystemCondition[]       // status registry
dice: SystemDice                    // roll/result vocabulary
turnModel: SystemTurnModel          // turn/action structure
creatureSchema: SystemCreatureField[]
advancement: SystemAdvancement      // xp | milestone | none
skills: SystemSkill[]
derived: SystemDerivedValue[]
```

Field names as shipped differ from the ADR's proposal in two places worth knowing if you go
looking for them: `dice`/`turnModel`, not `diceModel`/`actionEconomy`. **`widgetVocabulary`
does not exist on `SystemPackage`** — see §4.

Anywhere a system needs arithmetic (an ability modifier, a resource max) it declares a
`SystemFormula` — a tiny expression grammar (`floor((score-10)/2)`, decimal numbers,
identifiers, `+ - * /`, `floor`/`ceil`/`round`/`abs`/`min`/`max`) evaluated by the pure
`evaluateFormula` (`system-package.ts:261`). The grammar has no variable it is not
explicitly given and no host call, so an untrusted package cannot execute anything — the
formula IS the sandbox for system packages, in place of a runtime permission model.

## 3. The `systems` durable slice

`SystemsState` (`system-package.ts:519`), `SYSTEMS_STATE_SCHEMA_VERSION = 1`:

```ts
interface SystemsState {
	packages: Record<string, SystemPackage>;
	activePackageId: string;
	activeWidgetPackageId: string | null; // legacy bridge, see below
	schemaVersion: 1;
}
```

**This is flatter than ADR-028 proposed, and deliberately.** The ADR's decision text
describes a `SystemPackageRecord` wrapper per package carrying `trust`, `enabled`,
`removedAt`, `migrationStatus`, and `diagnostics` — mirroring the widget-package install/trust
lifecycle. As shipped, `SystemsState.packages` is a flat `Record<string, SystemPackage>` with
no wrapper, no trust review, and no install/enable/disable/remove command family. There is
also no `system.package.install` / `system.package.review` — the ADR's "community packages
arrive as data through a parallel command family" is not built. What exists instead is
DM-authored packages in the `custom:` id namespace (§5) plus two built-ins, `system.5e` and
`system.generic` (via `DND5E_SYSTEM_PACKAGE_ID = 'builtin:dnd5e'`,
`packages/core/src/systems/{dnd5e,generic}.ts`), re-seeded on every hydrate
(`hydrateSystemsState`, `system-package.ts:596`) so they can never be edited or deleted by a
stray command. A vault with no `systems` document, or an `activePackageId` that no longer
resolves, falls back to the built-in D&D 5e package — fail closed to a working system, never
to an empty one.

`activeWidgetPackageId` is a **legacy bridge**, not the widget-vocabulary comparison field the
ADR called `widgetVocabulary`: it is the pre-SYS-1.1 `WidgetPackageState.activeSystemPackageId`
value, carried across so `widget.package.switch-system` keeps working unmodified while
`system.select` (§5) governs `activePackageId` independently. The two id namespaces are never
conflated — see the ADR's own "Implementation Note — RC-SYS-1.3" for why both commands still
exist side by side.

## 4. What did NOT get built: the widget-vocabulary dry-run merge

ADR-028 proposed one `system.package.switch` reusing the existing widget-vocabulary
keep/remap/drop preview (`previewSystemSwitch`) against a `SystemPackage.widgetVocabulary`
list. That field and that merged command do not exist. Instead, as the ADR's own
"Implementation Note" records, there are **two separate, unmerged dry-runs**:

- `previewSystemSwitch` (`packages/core/src/queries/system-switch-query.ts:98`) — unchanged,
  still keyed off `WidgetPackageState`, still answers "what happens to widget instances if the
  active **widget** package changes."
- `previewSystemPackageSelect` (`system-switch-query.ts:339`) — new, answers the rules
  question: every attribute/resource/condition/skill the active `SystemPackage` declares is
  classified `keep`/`remap`/`drop` against the target, with a count of characters carrying
  data under each key. `system.select` fails closed on a destructive `drop` unless the caller
  sends `acknowledgeLoss`.

## 5. Commands

Five commands, not the ADR's proposed one (`commands/system-package.ts:50-54`,
`commands/types.ts:133-137`):

| Command         | Handler                              | Purpose                                                              |
| --------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `system.select` | `handleSelectSystemPackage` (`:138`) | Switch `activePackageId`, gated by `previewSystemPackageSelect`      |
| `system.define` | `handleDefineSystemPackage` (`:204`) | Author a new `custom:` package                                       |
| `system.update` | `handleUpdateSystemPackage` (`:246`) | Edit an existing `custom:` package                                   |
| `system.delete` | `handleDeleteSystemPackage` (`:293`) | Remove a `custom:` package                                           |
| `system.fork`   | `handleForkSystemPackage` (`:361`)   | Clone a built-in (or another custom) package into a new `custom:` id |

Authoring is confined to `custom:` ids (`CUSTOM_SYSTEM_PACKAGE_ID_PATTERN`,
`system-package.ts:43`) — the ADR-023 rule applied here: a `define`/`update`/`delete` against a
`builtin:` id is meaningless, since `hydrateSystemsState` re-seeds built-ins on every load.
`system.fork` is the sanctioned way to base a homebrew system on D&D 5e or Generic.

## 6. Where the app reads it

`getActiveSystemForActor` / `resolveVocabulary` (`packages/core/src/queries/system-query.ts:43,64`)
are the actor-scoped reads. On the app side, `screens/extensions/System.tsx` +
`SystemBuilder.tsx` (Settings › Extensions & systems) are the real, wired UI: they call
`activeSystemPackage`, `previewSystemPackageSelect`, and `STARTER_SYSTEM_LIBRARY` directly
from `@dndtools/core`, and drive `system.select`/`system.define`/`system.update` through the
normal dispatch path (`app/systemBuilder/draft.ts`). `screens/extensions/systemVocab.ts` maps
package data to picker chips/labels. `app/character/LevelUp.tsx` and
`app/charImport/ddbJson.ts` are early consumers on the character side; combat and condition
rendering (`packages/core/src/state/combat-tracker.ts`, the design system's `CONDITIONS`
registry) have **not** been repointed off their hardcoded 5e assumptions yet — that remains
open SYS-lane work per the roadmap's finding G1.

## 7. Where to look in code

| Concern                                      | Location                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SystemPackage` type, formula grammar        | `packages/core/src/state/system-package.ts`                                                                                           |
| `SystemsState`, hydration, built-in fallback | `packages/core/src/state/system-package.ts:519,596`                                                                                   |
| Built-in packages (5e, Generic)              | `packages/core/src/systems/{dnd5e,generic}.ts`                                                                                        |
| Commands                                     | `packages/core/src/commands/system-package.ts`                                                                                        |
| Widget-vocabulary dry-run (legacy, unmerged) | `packages/core/src/queries/system-switch-query.ts:98`                                                                                 |
| Rules-schema dry-run (new)                   | `packages/core/src/queries/system-switch-query.ts:339`                                                                                |
| Actor-scoped reads                           | `packages/core/src/queries/system-query.ts`                                                                                           |
| App UI                                       | `apps/gm-react/src/screens/extensions/{System,SystemBuilder,systemVocab}.tsx`, `apps/gm-react/src/app/systemBuilder/draft.ts`         |
| Decision record                              | `docs/adr/028-system-packages-rules-contract.md` (see "Implementation Note — RC-SYS-1.3" for the command-name and dry-run divergence) |
