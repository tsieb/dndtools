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

- Recovery artifact follow-up: the initial patch's tab-indented context caused `git diff --check` whitespace diagnostics. Regenerated it with zero context and documented `git apply --unidiff-zero`. Both the exact apply check and the staged whitespace check now pass; proposed source and compiler result are unchanged.

## Repeated gate blocker — operator action required

- Read original gate `/home/trinkle/Programming/agent-dispatcher/.state/attempts/015756da-9431-4477-a06d-a804cc1519df/output.log` at candidate `8a2781e79f0449d0723e8950cdf7c96706b02d56`. Core/cloud pass; app fails with the same two TS2345 errors at `AbilitiesPanel.tsx:95` and `:139`. No new diagnostic or ownership expansion was supplied.
- BLOCKED RC-DSN-2.1: the same scope blocker now spans three consecutive task turns. The DS conversion and repair proposal are committed; further DS-only changes cannot fix the consumer without violating the package string-return contract or concealing its types.
- Required operator action: grant `apps/gm-react/src/screens/characters/sheet/AbilitiesPanel.tsx` and authorize its numeric-arithmetic correction, or route the committed `src/ds/handoff/AbilitiesPanel.patch` to that file's owner. The prepared patch remains applicable; use the documented `--unidiff-zero` option.
- This turn changes only the journal. No runtime files changed, no suites were repeated, and no dispatcher control state was edited. Actual typecheck remains failed; the task is not ready for integration.

## Integration reconciliation — eafbce28

- DONE: explicitly requested rebase onto `eafbce28a4f78231185cbf44ccbd603ad489415a`; replayed all four task commits and resolved the nine reported conflicts. No push, promotion, dispatcher mutations or agents.
- DONE: retained upstream icon vocabulary/aliases and tests, dice drama, visibility preference/vocabulary hooks, nested overlay focus traps and tests, Skeleton list/canvas variants, and ProgressMeter ETA behavior.
- DONE: migrated newly integrated `overlay/focus.js` to typed `focus.ts`; extended public props for the upstream additions, accepted readonly dice readouts, and typed dice-drama fixtures directly.
- DONE: preserved numeric IDs from `Toaster.show` when callers omit a custom ID using overloads; custom string IDs still work. The implementation body is unchanged.
- DONE: standalone DS compiler config resolves core's existing Node declarations for the platform preference dependency, without adding dependencies or ambient shims.
- Initial reconciliation checks: standalone DS compiler passed; 29 DS files / 234 tests passed before replay of the six AbilityScore tests. Final gates pending below.
- Whole-app typecheck exposed new gallery consumer typing gaps alongside the previously documented character-sheet arithmetic errors. DS-owned readonly dice and generated-toast ID contracts are fixed; final diagnostics pending.
- Headroom tools are now available; command originals are retained by artifact ID and retrieved before diagnostic conclusions.

### Reconciliation validation findings

- Compared all 74 implementation modules against integration using normalized esbuild output with exact catalog values inlined: 72 matched exactly. Reviewed the remaining diffs: DiceResult adds a logically redundant non-null guard for control-flow narrowing; Toast moves the unchanged show body into an overloaded function. Subsequently split the unchanged semantic icon registry/aliases into `core/icon-registry.ts` to satisfy the 800-line gate without expanding allowances.
- Full app tests initially passed 1,556/1,557; the sole failure was the motion test's `.jsx` filename allowlist. Updated that test to `.tsx` under the automatic test ownership grant. Final rerun pending.
- HANDOFF RC-DSN-2.1 → apps/gm-react/src/screens/DsGallery.tsx: concrete tabs/value and optional required-flag types through the generic props record; prepared unapplied `src/ds/handoff/DsGallery.patch`. The prior AbilitiesPanel arithmetic handoff remains.
- HANDOFF RC-DSN-2.1 → scripts/emphasis-baseline.json: migrate ten DS baseline keys to their TSX paths with unchanged counts. This is the only remaining lint failure after ESLint and boundary lint pass; changing the actual component styles would violate no-behavior-change.
- HANDOFF RC-DSN-2.1 → scripts/check-prod-bundle.mjs, apps/gm-react/scripts/check-prod-bundle.mjs, docs/design/COMPONENTS.md: migrate gallery source paths, update coverage derivation from the removed facade to typed modules, regenerate the reference (77 stale links), and cover TSX source markers in the production exclusion check.
- Final checks run on the reconciled tree below; integration remains blocked by these explicit out-of-scope consumer/tooling dependencies.

### Final reconciliation report

- PASS: full app suite, 143 files / 1,557 tests; exact completion `/tmp/dsn-rebase-app-final.log`, Headroom original `70773e9b459e415bad4de1bd46fbf489` retrieved.
- PASS: standalone DS contract compiler; original `c4fa219613df49afaa426058f87430b0` retrieved. Typed fixture covers incoming drama, readonly dice, visibility options, loading variants, ETA, and generated numeric toast IDs.
- PASS: production build and runtime/gallery exclusion across 85 JS assets; `/tmp/dsn-rebase-build.log`, original `cfc0d9cc9703442fb7613be4f91d122f` retrieved.
- PASS: zero whole-word escape-type tokens and zero JS/JSX files under DS; deleted facade stays absent. Git diff whitespace and both unapplied consumer patches' apply checks pass.
- PASS (proposal only): both exact consumer patch hunks applied through an in-memory compiler host produce zero app diagnostics. Original `32519acea8844597bc972665752df03c`; no consumer file was written.
- BLOCKED: real `pnpm typecheck` exits 2, exactly four errors: gallery lines 118/130 and character-sheet lines 95/139. Original `5103eceb513f4ba49c9897b0c460b624` retrieved. The two committed handoff patches resolve these when their owners apply them.
- BLOCKED: `pnpm gates` exits 1 only for 77 obsolete generated component links; icon file-size error is fixed by the registry split. Original `181bd1d7276844eab6e7a6727ed9c34a`, full `/tmp/dsn-rebase-gates.log`.
- BLOCKED: `pnpm lint` passes ESLint (19 inherited warnings) and boundary lint, then fails emphasis baseline matching for ten renamed DS paths. Original `ae096d756f1a4aff8f4860481ef399a7` retrieved. No allowance or visual behavior changed.
- PARTIAL RC-DSN-2.1: conflicts reconciled and owned conversion/zero-escape debt reduction complete; consumer and tooling ownership handoffs prevent green whole-repository gates. Current branch descends from requested `eafbce28`; no push, promotion, agents or dispatcher control writes.

## Central quality-gate retry — ff228708

- Read and retrieved the complete original gate log for run `0cceeac5-9f16-40ff-b129-18ed3071c579` at candidate `ff2287088a7ab67466c3a6c6f18a9d9bfd99c9a7`. Headroom artifact `f8da461d89164973bbb41acf82e76757`; all 19,562 original bytes inspected.
- The gate fails exclusively on 77 obsolete JSX source links in generated `docs/design/COMPONENTS.md`. File-size findings are warnings; the prior Icon hard-limit failure is absent. No new DS implementation diagnostic was supplied.
- Reconfirmed roadmap §0.2's write fence and worker rule 10's explicit HANDOFF requirement. This retry supplies the same DS-only ownership and does not grant the generated reference or its generator files. Restoring JSX placeholders or the deleted declaration facade would violate the migration acceptance and conceal the missing integration work.
- HANDOFF RC-DSN-2.1 → central operator / gallery-tooling owner: grant or separately repair `scripts/check-prod-bundle.mjs`, `apps/gm-react/scripts/check-prod-bundle.mjs`, and `docs/design/COMPONENTS.md` as described in `src/ds/handoff/README.md`. Regenerate from typed implementations and new source paths, then rerun gates. The existing consumer patches and emphasis-baseline handoff remain required for subsequent validation stages.
- No runtime source changed in this retry. Existing owned implementation and acceptance checks remain committed. Repeating the unchanged ownership assignment cannot repair this generated-document gate; integration remains BLOCKED pending that dependency.
