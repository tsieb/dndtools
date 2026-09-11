# RC-DOC-2.2 run journal

- Scope: `scripts/validate/docs-links.ts` (new), wired into `scripts/quality-gates.ts`; docs in
  `docs/README.md` and `docs/development/TESTING.md`.
- `GateProblemKind` in `packages/core/src/platform/quality-gates.ts` is a closed union and core is
  not owned by this story, so docs problems carry their own `DocsProblem` type and `runCli` reports
  them beside the gate problems.
- No test file under `tests/unit/` is owned either, so the broken-link acceptance runs through
  `pnpm gates --docs-root <fixture>` against a copied tree.
- Coupling strings come from their consumers: `tests/unit/ci-guardrails.test.ts` asserts the four
  backticked script names in TESTING.md; `tests/unit/i18n-catalog.test.ts` asserts
  `i18n-catalog.ts export` / `import` in LOCALIZATION.md.
- The adr skill's Python index checker matches `| ADR-NNN |` rows, but the index uses
  `| [NNN](./NNN-slug.md) |`, so it matches nothing; the new checker parses the real row format.
  Its "no `docs:validate` script ... nothing mechanically enforces the index" line is now stale;
  `.claude/skills/adr/SKILL.md` is not owned here, so it is left for a follow-up.
- First scan of the tree: 156 links all resolved, ADR index matched all 39 files, couplings present.
  Only failures were the two unlinked run journals; fixed by a directory link to
  `development/run-journals/` in `docs/README.md`, which also covers journals later tasks write.
  `docs/design-package/` is reached through the existing directory link in `docs/design/README.md`.

## Verification

- `pnpm gates` on the tree: exit 0; "docs check passed: 250 file(s) reachable from docs/README.md,
  158 relative link(s) resolved."
- Broken-link fixture (`/tmp` copy of `docs/`, every other top-level entry symlinked to the
  worktree): `pnpm gates --docs-root <fixture>` exit 0 before the edit; after appending
  `[the missing page](NOT-THERE.md)` to TESTING.md, exit 1 with exactly one problem,
  `[broken-link] docs/development/TESTING.md:121: NOT-THERE.md does not exist`.
- Second fixture: an orphan `docs/orphan.md`, the backticked `test:cloud` removed from TESTING.md,
  and ADR-007's Status set to Deprecated gave exit 1 with exactly those three problems
  (`unreachable-doc`, `missing-coupling-string`, `adr-index-drift` at `docs/adr/README.md:19`). Two
  links inside code spans in the same fixture, one wrapping across a line, were not flagged.
- `pnpm test:tooling`: 24 files / 162 tests passed (includes `file-size-gate.test.ts`, which imports
  `scripts/quality-gates.ts`).
- ESLint and `prettier --check` on the changed files: clean.
- No tsconfig covers `scripts/`, so both scripts were typechecked standalone
  (`tsc --noEmit --strict --module esnext --moduleResolution bundler --allowImportingTsExtensions`,
  `@types/node` from `packages/core`): exit 0, no errors.
