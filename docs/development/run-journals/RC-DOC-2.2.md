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

## Retry verification — 2026-09-12

- Started at `07898d2f43a594f3981df45f9488dc6f2950432d`, with a clean worktree. The prior
  implementation is already committed; no checker rewrite was needed. No Headroom tools were
  available in this session, so commands used native execution with full fixture logs retained.
- Current-tree `pnpm gates`: exit 1, exactly one docs problem. At `docs/adr/README.md:52`,
  ADR-040's index cell is `Accepted (amends ADR-004, ADR-024)`, but its document's Status line is
  `Accepted`. This is actual source drift, not the earlier verification-capacity timeout.
- Both ADR paths are outside this task's four owned paths. Requested authorization for the
  one-line document Status correction; did not change either file or weaken status equality.
- Isolated fixture: copied `docs/` into a temporary repository root and symlinked the other
  top-level entries back to this worktree. Changed only ADR-040's Status line in the copy to
  match its index. `pnpm gates --docs-root <fixture>` exited 0: 6 quality gates passed,
  251 docs files reachable, 161 relative links resolved.
- Appended `[Broken-link acceptance fixture](RC-DOC-2.2-missing.md)` to the fixture's docs
  index. The same command exited 1 with exactly one docs problem:
  `[broken-link] docs/README.md:57: RC-DOC-2.2-missing.md does not exist`.
- Original command output is retained locally at `/tmp/rc-doc-2.2-evxn2vw9/current-tree.log`,
  `/tmp/rc-doc-2.2-evxn2vw9/fixture-status-aligned.log`, and
  `/tmp/rc-doc-2.2-evxn2vw9/fixture-broken-link.log` (temporary evidence, not repository assets).
- `pnpm test:tooling`: exit 0, 24 files / 162 tests passed in 6.27 seconds.
- Acceptance remains blocked on the real-tree ADR-040 mismatch. The passing fixture does not
  establish that the real tree passes. No push, promotion, loop launch, or dispatcher-state edit.

## Rebase retry — 2026-09-16

- The prior attempt failed in `git rebase`, not in the checker. Rebasing the two commits onto
  `loop/rc` (`f38d7a47`) conflicted once, in `docs/development/TESTING.md`: both sides appended a
  new `## 6`. Upstream added §6 "Execution context was destroyed" (RC-ENG-2.6); this story added
  §6 "Docs check". Resolved by keeping both and renumbering the docs-check section to §7.
- `docs/README.md`'s pointer to the docs-check section was updated `§6` → `§7` to match.
  `apps/gm-react/playwright.config.ts:62` also cites "TESTING.md §6", but it means the RC-ENG-2.6
  section, which kept its number, so it was left alone. Those are the only two section references
  in the repository.
- The ADR-040 mismatch that blocked the previous attempt is gone: upstream now has
  `Accepted (amends ADR-004, ADR-024)` in both the document and the index cell. No ADR file was
  touched here, and status equality was not weakened.
- One new real failure on the rebased tree: `docs/design/COMPONENTS.md` (the generated component
  reference from RC-DSN-2.3) was unreachable from `docs/README.md`. Fixed inside an owned path by
  adding a "Component reference (DEV gallery)" row to the docs index map. The checker found genuine
  drift that landed after this story was written, which is the behaviour the story asks for.
- Fixture construction gotcha: the first fixture copied `docs/` and symlinked the other top-level
  entries with `for e in *`, which skips dotfiles, so `.github` was absent and
  `DEVELOPMENT.md:81`'s `../../.github/pull_request_template.md` reported a false broken link.
  Symlinking dotted entries too (excluding `.git`) makes the fixture baseline match the real tree.

### Verification (all commands re-run on the rebased tree)

- `pnpm gates` on the tree: exit 0 — "docs check passed: 253 file(s) reachable from
  docs/README.md, 259 relative link(s) resolved."
- `pnpm gates --docs-root <fixture>` on an unmodified fixture: exit 0, same 253/259 counts.
- Broken-link acceptance: appending `[Broken-link acceptance fixture](RC-DOC-2.2-missing.md)` to
  the fixture's docs index gave exit 1 with exactly one problem,
  `[broken-link] docs/README.md:58: RC-DOC-2.2-missing.md does not exist`.
- The other three kinds still fire together in one fixture run (exit 1, exactly three problems):
  `unreachable-doc` for an added `docs/orphan.md`, `missing-coupling-string` for a removed
  `test:cloud`, and `adr-index-drift` at `docs/adr/README.md:19` for ADR-007 set to Deprecated.
- `pnpm test:tooling`: exit 0, 25 files / 187 tests. ESLint and `prettier --check` on the changed
  files: exit 0.
- Original command output retained locally under `/tmp/rc-doc-2.2-run/` (temporary evidence, not
  repository assets). No push, promotion, loop launch, or dispatcher-state edit.
