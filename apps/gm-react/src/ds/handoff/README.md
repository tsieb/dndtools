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

Before the integration rebase, the patch passed `git apply --unidiff-zero --check`. An in-memory TypeScript compiler-host overlay applying the
same three substitutions passed app typechecking with zero diagnostics. This is a proposed-fix
check; the actual file remains unchanged, and the actual whole-app gate remains failed.

The DS regression test locks signed strings for positive, zero and negative modifiers and preserves
explicit display overrides. A numeric return annotation or numeric runtime change in the DS would
break the package contract. No unsafe cast or compiler suppression is an acceptable gate repair.

The character roster's initiative calculation in `screens/characters/index.tsx:213` also imports
the DS string helper for arithmetic. It is not one of this gate's two reported errors and is not
included in the narrow patch; its owner should audit it separately.

After rebasing onto `eafbce28`, `DsGallery.tsx` also needs to carry the concrete catalog types
through its generic props record. `DsGallery.patch` supplies the existing tabs/value explicitly
and narrows the existing optional `required` flag without changing their runtime values. The
package requires tabs/value and the native input accepts a boolean; weakening those public
contracts would conceal the consumer errors. This patch is also unapplied and needs the gallery
owner to land it alongside the character-sheet patch before whole-app typechecking can pass.

```sh
git apply --unidiff-zero --check apps/gm-react/src/ds/handoff/DsGallery.patch
git apply --unidiff-zero apps/gm-react/src/ds/handoff/DsGallery.patch
```

The integration branch also introduced two filename-sensitive tooling dependencies outside this
task's write fence:

- `scripts/emphasis-baseline.json`: move the ten DS entries from `.jsx` keys to `.tsx`, preserving
  their existing counts. The unchanged typography/emphasis findings are currently classified as
  new because their source paths changed.
- `scripts/check-prod-bundle.mjs`, `apps/gm-react/scripts/check-prod-bundle.mjs`, and generated
  `docs/design/COMPONENTS.md`: update gallery source paths, derive component coverage from the typed
  barrel/implementations instead of the deleted permissive declaration facade, and regenerate the
  reference. The docs gate currently reports 77 stale links. Update the production source-marker
  check to cover `.tsx` as well.

Do not restore the deleted facade, hide the diagnostics, or change component appearance to satisfy
these filename migrations. The existing debt-register and design-README handoffs still apply.

Both consumer patches pass `git apply --unidiff-zero --check` after the integration rebase.
Applying their exact hunks through an in-memory TypeScript compiler host yields zero app
diagnostics. This validates the proposed repairs only; the real consumer files remain unchanged
and the actual typecheck still reports four errors across those two files.
