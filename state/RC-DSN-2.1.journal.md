# RC-DSN-2.1 run journal

## Plan

- Convert all 14 DS groups to TSX using vendored package declarations and existing runtime extensions.
- Replace the permissive barrel with inferred implementation exports and retain public event aliases.
- Preserve runtime behavior; run typecheck, DS/app tests, lint and build before committing.

## Ledger

- `apps/gm-react/src/ds/components/` — package contract extraction and TSX conversion completed — DONE.
- `apps/gm-react/src/ds/index.d.ts` — facade removed in favor of typed barrel — DONE.

## Decisions

- No Headroom tools are available; native tools and exact command logs are used.
- No agents, dispatcher mutations, branch changes, push or promotion.
- Central scheduling requests one current-branch task commit, so all 14 groups are handled in this candidate; PR grouping belongs to the central operator.
- DEBT-2026-002 is already listed as resolved in the out-of-scope root register. This task removes the remaining DS facade and records its replacement here.
- HANDOFF RC-DSN-2.1 → DEBT.md and docs/design/README.md: replace references to the deleted DS facade with the typed implementation/barrel once integrated; those docs are outside this task's ownership.

## Edits made

- Extracted package interfaces/types into corresponding implementation modules and annotated exported props.
- Migrated component and test imports to extensionless paths; renamed runtime barrel to TypeScript.

## Gates run

- Initial typecheck underway to identify package/runtime contract differences.

## Contract and lint reconciliation

- Converted 72 component modules plus the condition catalog (73 implementation modules), across all 14 groups. No explicit type escape tokens remain in DS source.
- Retained package types plus shipped extensions: keyboard activation, focus return, system condition/dice/attribute models, generic table rows and selection values, toast IDs and pause state.
- TSX enables previously inapplicable lint rules. Moved 127 exact English source strings into the source message catalog and read them directly, preserving the existing fixed-language DS behavior; localization changes are deliberately separate. The roadmap §0.2 automatically grants message catalogs and tests. Fixed newly checked unused expressions with explicit `void`, and renamed an unused local/import binding. No rule suppressions or allowance changes.
- Normalized emitted-code comparison agrees for 69/73 modules initially; differences were two binding renames, Tooltip's ref initializer, and one escaped ampersand. Restored the Tooltip null initializer and decoded the source ampersand; final comparison pending.
- DS lint now reports zero errors, four inherited hook warnings made visible by TSX.
- Whole-app typecheck is down to two errors, both in `screens/characters/sheet/AbilitiesPanel.tsx`: the old facade declared `abilityModifier` numeric, but its unchanged implementation returns signed strings. Arithmetic in that screen concatenates strings and the resulting value conflicts with numeric `sgn`. No dishonest numeric annotation was introduced.
- HANDOFF RC-DSN-2.1 → apps/gm-react/src/screens/characters/sheet/AbilitiesPanel.tsx: use the numeric core ability-modifier query for saving throw/skill arithmetic. This unowned consumer needs a behavior fix and a regression test; the DS conversion preserves the signed-string helper. Whole-app typecheck remains blocked until that separate fix lands.
- Updated the token-reference test's two source paths for TSX. Full app tests running; exact log `/tmp/dsn-app-tests.log`.

## Final validation and report

- DONE: all 72 JSX component modules across 14 groups are TSX; the condition catalog is TS. The barrel is `index.ts`; `index.d.ts` is deleted. The DS keyword and whole-word escape-token counts are both zero.
- DONE: `contracts.typecheck.tsx` and the standalone DS `tsconfig.json` exercise real public types, including rejected unknown props and invalid callbacks. `pnpm exec tsc -p apps/gm-react/src/ds/tsconfig.json` exited 0; original output `/tmp/dsn-contract-types.log`.
- DONE: normalized emitted-code comparison matched 73/73 implementation modules. The comparison inlined the exact source catalog values, normalized extension changes and the two lint-required binding renames, then compared esbuild output with identifiers preserved. Original output `/tmp/dsn-equivalence.log`; comparison script `/tmp/dsn-equivalence.cjs`. An escaped ampersand found by this check was corrected before final tests.
- DONE: `pnpm test:app` on the final implementation exited 0: 123 files, 1,287 tests passed. Original completion output `/tmp/dsn-app-final.log`.
- DONE: `pnpm lint` exited 0, including boundary lint and 191 non-text contrast pairs / 16 forced-color checks. Nineteen warnings remain, including four inherited DS hook patterns newly checked as TSX. Original output `/tmp/dsn-root-lint.log`.
- DONE: `pnpm build` exited 0, including the production runtime-seam exclusion check on 86 assets. Original output `/tmp/dsn-build.log`. No browser tests run for this behavior-preserving conversion; central gates and independent review remain operator-owned.
- DONE: `git diff --cached --check` passed. Prettier ran on all touched implementation, catalog, test and journal files.
- BLOCKED: whole-app typecheck reports the two previously masked signed-string arithmetic errors in the unowned `AbilitiesPanel.tsx` (lines 95 and 139). The DS standalone check passes. Original final diagnostic `/tmp/dsn-types-final.log`; the required behavior correction is recorded in the HANDOFF above. No errors were suppressed and the numeric facade lie was not retained.
- PARTIAL RC-DSN-2.1: the full owned conversion and debt reduction are implemented; the unowned numeric consumer must be fixed before app-wide typecheck/integration can pass. Root debt/design documentation references also remain an owner handoff.
- Nothing was pushed or promoted; no agents, additional loops, branch changes or dispatcher control mutations occurred.

## Central typecheck recovery

- Read the original failed gate log at `/home/trinkle/Programming/agent-dispatcher/.state/attempts/cf6dab1e-a1df-424d-ba0e-2524c2fe7151/output.log`. Core and cloud typechecking passed; app reports exactly the two previously recorded `AbilitiesPanel.tsx` errors. Headroom tools remain unavailable.
- Verified the vendored `docs/design-package/components/creature/AbilityScore.d.ts` explicitly declares a signed string return. A numeric overload, cast, suppression or changed DS return value would violate the task's typed-package/no-behavior-change contract.
- Verified ownership constraints in roadmap §0.2 and `tools/loop/prompts/worker.md` rule 10: consumer source is outside the write fence and requires a HANDOFF. No ownership expansion is present in this retry.
- Added `components/creature/AbilityScore.test.tsx` to lock signed output for positive/zero/negative scores and authored display overrides.
- Prepared `src/ds/handoff/AbilitiesPanel.patch`: import the numeric core helper under an alias and use it at the two arithmetic sites, retaining the string helper for presentation. `git apply --check` passes; the patch has not been applied.
- Also found the same string-helper arithmetic pattern in unowned `screens/characters/index.tsx:213`; recorded it for the character owner without widening the gate patch.
- Proposed fix verification and final scoped checks pending below. Actual integration remains blocked on consumer ownership/behavior-fix authorization.

### Recovery validation and disposition

- `git apply --check apps/gm-react/src/ds/handoff/AbilitiesPanel.patch` passed. The proposed source was formatted with repository Prettier settings before producing the patch.
- In-memory app compiler check of the exact formatted proposed source exited 0 with zero diagnostics; the consumer file remained byte-identical. Original output `/tmp/dsn-gate-overlay.log`. This does not mean the actual repository typecheck passed.
- Standalone DS typecheck exited 0 (`/tmp/dsn-recovery-types.log`); DS tests exited 0 with 29 files / 205 tests, including six new package-contract checks (`/tmp/dsn-recovery-tests.log`); ESLint on the new test exited 0 (`/tmp/dsn-recovery-lint.log`).
- No runtime source changed in this recovery. The original whole-app failure remains valid; resolving it needs the central operator to grant the narrow consumer path and authorize its arithmetic correction, or land that fix through the character owner.
- HANDOFF RC-DSN-2.1 → central operator: grant `apps/gm-react/src/screens/characters/sheet/AbilitiesPanel.tsx` for the prepared numeric-consumer fix, then apply the committed patch and run real whole-repository gates. Repeating the unchanged DS-only task cannot legally resolve that gate.
