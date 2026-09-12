# Typed design-system components

The runtime barrel is `index.ts`. Each component owns its prop types, derived from the matching
`docs/design-package/components/<group>/*.d.ts` contract and extended to describe the shipped
implementation. There is no separate permissive declaration facade. The existing `DSChangeEvent`,
`DSKeyboardEvent`, `DSFieldElement` and `DSBadgeStatus` aliases remain available.

Run the standalone public-contract check with:

```sh
pnpm exec tsc -p apps/gm-react/src/ds/tsconfig.json
```

`contracts.typecheck.tsx` checks native event inference, generic table rows and selection values,
and rejects unknown props, wrong callback arguments and unsupported sizes. Existing runtime tests
retain their adapters for incomplete or malformed fixtures; those adapters are not public types.

The implementation preserves native attribute forwarding, fallback handling for data-driven
status/category strings, CSS coordinates, keyboard activation callbacks and system-package models.
`DataTable<Row>` types row callbacks and cell values from its rows. Its string column keys also
support computed columns. `RadioCard` and `SegmentedControl` retain the caller's value union.

Several runtime details differ from the old package declarations: toast IDs can be strings;
`abilityModifier` returns signed **text**; and native refs passed as props to `Input`/`Textarea`
retain the existing React 18 behavior (the components do not forward them). This migration does
not repair existing unsupported combinations such as numeric progress markers or nonnumeric HP
fallbacks. The local types document compatibility where existing consumers require it.

The migration moves existing JSX copy into the English source message catalog. Components read
those exact strings directly to preserve the DS's existing language behavior. Locale adoption is
separate work. No translations, event behavior, styles or persistent state changed.

RC-DSN-2.1 removes the DS facade portion of DEBT-2026-002: all 14 groups are TypeScript, with zero
explicit untyped escape tokens. The root debt/design documents need their old facade references
updated by their owner. The conversion also exposes an existing numeric-consumer mismatch in
`screens/characters/sheet/AbilitiesPanel.tsx`: saving throw/skill arithmetic must use a numeric
modifier query instead of the signed-text DS helper. That behavior fix is outside this DS scope.
