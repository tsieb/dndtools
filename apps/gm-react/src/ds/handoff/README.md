# RC-DSN-2.1 typecheck handoff

The central typecheck gate at `972e30c6` fails at `AbilitiesPanel.tsx:95` and `:139`.
The DS helper returns signed text, as required by the vendored `AbilityScore.d.ts` contract.
The screen uses it in numeric saving-throw and skill arithmetic. For example, score 16 and
proficiency 2 concatenate to `+32`, then the screen's numeric formatter produces `++32`.
The intended numeric calculation yields `+5`.

`AbilitiesPanel.patch` changes only the two calculations to use the numeric core query. It retains
the DS helper for the ability-score display. Apply it from the repository root after granting
ownership of `apps/gm-react/src/screens/characters/sheet/AbilitiesPanel.tsx` to the repair task:

```sh
git apply --unidiff-zero --check apps/gm-react/src/ds/handoff/AbilitiesPanel.patch
git apply --unidiff-zero apps/gm-react/src/ds/handoff/AbilitiesPanel.patch
pnpm typecheck
pnpm test:app
```

The patch passes `git apply --unidiff-zero --check`. An in-memory TypeScript compiler-host overlay applying the
same three substitutions passes app typechecking with zero diagnostics. This is a proposed-fix
check; the actual file remains unchanged, and the actual whole-app gate remains failed.

The DS regression test locks signed strings for positive, zero and negative modifiers and preserves
explicit display overrides. A numeric return annotation or numeric runtime change in the DS would
break the package contract. No unsafe cast or compiler suppression is an acceptable gate repair.

The character roster's initiative calculation in `screens/characters/index.tsx:213` also imports
the DS string helper for arithmetic. It is not one of this gate's two reported errors and is not
included in the narrow patch; its owner should audit it separately.
