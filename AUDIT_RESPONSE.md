# DND Tools — Audit Response & Remediation Prompt

You have been given `docs/AUDIT_REPORT.md`, the completed output of `AUDIT_PROMPT.md`.
Your task is to remediate every finding rated `[PARTIAL]`, `[FAIL]`, or
`[NOT IMPLEMENTED]` across all eleven audit dimensions. You are the engineer of record.
Own the full fix — code, tests, docs, and side effects — for every item you touch.

---

## 0. Before You Write a Single Line of Code

### 0.1 Read First

You must read every file relevant to a finding before modifying it. No exceptions.
If you cannot explain what a function does after reading it, keep reading before editing.
Never assume that documentation accurately describes what the code does — verify in source.

### 0.2 Triage

Extract all findings from `docs/AUDIT_REPORT.md`. Build an ordered remediation list
grouped by severity tier:

1. **Critical** — data loss or corruption risk, security boundary breach, build-blocking
2. **High** — silent regression risk, security gap, user-visible feature failure
3. **Medium** — test coverage gap, documentation drift, partial implementation
4. **Low** — style/convention gap, minor documentation inaccuracy

Work strictly top-down through the tiers. Do not start a Medium fix while a Critical
fix is unverified. Do not batch fixes across different subsystems in a single commit.

### 0.3 Branch

Before any code change:

```bash
git checkout master && git pull
git checkout -b fix/audit-remediation-<YYYY-MM-DD>
```

All remediation work goes on this branch. If the scope of work spans multiple
independently releasable areas (e.g., security fixes vs. documentation drift),
open separate branches so CI can gate them independently.

---

## 1. Universal Rules — Non-Negotiable for Every Fix

These rules apply to every single change regardless of finding category. Violating
any of them is itself a defect.

### 1.1 TypeScript

- **No `any`**. Use `unknown` + narrowing, Zod parse, or a proper type. If you find
  yourself fighting the type system, the design is wrong — fix the design.
- **No type assertions (`as X`) as a substitute for runtime validation**. Type
  assertions are only acceptable where TypeScript's control flow analysis fails to
  narrow a type that you have already proven correct by other means.
- **Strict mode is always on.** `tsconfig.json` is not negotiable.

### 1.2 Runtime Boundaries

Never cross these boundaries under any circumstances:

| Boundary                                  | Rule                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/` renderer                           | No Node.js API imports. All persistence via `StorageAdapter`. Desktop APIs via `window.dndtoolsDesktop` only. |
| `electron/` main                          | No Svelte imports. No renderer-only modules except shared `src/lib/types/`.                                   |
| `mcp/` sidecar                            | No Svelte imports. No renderer stores or components. Shared types from `src/lib/types/` only.                 |
| Route components `src/routes/**/*.svelte` | No direct adapter imports. All data access through `src/lib/state/` stores.                                   |

If a boundary fix requires introducing a shared type, add it to `src/lib/types/`
and import from there in both directions. Do not create a parallel type in `mcp/`.

### 1.3 Write Safety

Every vault write — without exception — must use the atomic pattern:

- **Note files and `.vault/*.json`** in `mcp/storage.ts`: use `safeWriteFile` from
  `mcp/safe-write.ts`. Never call `fs.writeFile` directly for vault-owned paths.
- **Any new write path** you add must be listed in the write-journal before it begins
  and cleared from the journal on successful commit.
- **Any new `.vault/` metadata file** must be added to the integrity scanner's
  validation list in the startup check.

### 1.4 Svelte 5 Runes

All new state in `src/lib/state/` uses Svelte 5 runes classes (`$state`, `$derived`,
`$effect`). Do not introduce legacy `writable` stores. Do not mutate rune state
outside the owning class.

### 1.5 Sizing

- Fix exactly what the finding says. Do not refactor surrounding code.
- Do not add error handling for cases that cannot happen in the current call graph.
- Do not add new configuration flags for behavior that is always-on or always-off.
- Do not create helper functions or abstractions used in only one place unless the
  finding specifically requires an abstraction (e.g., a missing `WorkerBridge`).
- Do not add comments or docstrings to code you did not change.
- Three nearly-identical lines of code are preferable to a premature abstraction.

### 1.6 No Bypassing Hooks

Never use `--no-verify`. Never use `-c commit.gpgsign=false`. If a hook fails,
diagnose and fix the root cause. The hooks exist because the CI enforces the same
checks — bypassing locally means the PR will still fail.

---

## 2. Side-Effect Protocol — What Else Must Change

Every fix has a mandatory side-effect checklist. Work through the applicable checklist
for every finding before marking it done.

### 2.A — IPC Handler Fix

When you fix, add, or remove an IPC handler in `electron/main.ts`:

- [ ] Update or add the corresponding Zod schema in `electron/ipc-schemas.ts`
- [ ] Update the corresponding preload exposure in `electron/preload.ts`
- [ ] Update the renderer call site in `src/lib/platform/storage/electron-adapter.ts`
- [ ] Add or update the security test in `electron/ipc-security.test.ts`
- [ ] Update `docs/ARCHITECTURE.md` §7 if the channel inventory changes
- [ ] If a generic dispatch handler is narrowed or removed, update ADR-003

### 2.B — MCP Tool Fix (existing tool)

When you fix a bug or gap in an existing tool under `mcp/tools/`:

- [ ] Verify or add a dedicated test file for this tool
- [ ] Ensure the tool's contract classification in `contracts.ts` is accurate after
      the fix
- [ ] If the fix changes the output schema, update the corresponding MCP tool call
      in `docs/AGENTIC_NOTES_WORKFLOW.md`
- [ ] Run `pnpm mcp:build` and verify the build passes

### 2.C — New MCP Tool

When a finding requires adding a missing tool:

- [ ] Place the file in the correct `mcp/tools/<domain>/` folder
- [ ] Register it in `mcp/tools/index.ts`
- [ ] Add `idempotencyKey?: string` to the input schema if the tool is non-idempotent
- [ ] Assign an explicit contract classification in `contracts.ts`
- [ ] Add a dedicated test file covering: valid input, invalid input, edge cases
- [ ] Update `docs/AGENTIC_NOTES_WORKFLOW.md` if the tool is part of an agent workflow
- [ ] Run `pnpm mcp:build`

### 2.D — Storage / Data Model Fix

When you change a persisted data shape, add a field, or remove a field:

- [ ] Update `src/lib/types/` (authoritative type)
- [ ] Update **both** adapters: `src/lib/storage/indexeddb-adapter.ts` and
      `mcp/storage.ts`
- [ ] Update `electron/` adapter bridge if the change is surfaced over IPC
- [ ] Add a migration in `mcp/migrations.ts` with a version bump
- [ ] Add a fixture vault at the old schema version in `mcp/fixtures/`
- [ ] Update `docs/DATA_MODEL.md` to reflect the new shape
- [ ] Update `docs/SCHEMA_MIGRATIONS.md` version list

### 2.E — Write Path Fix

When you fix or add any write path (atomic write, journal, recovery):

- [ ] Verify the write uses `safeWriteFile` from `mcp/safe-write.ts`
- [ ] Add or extend the recovery test in `mcp/recovery.test.ts`
- [ ] If a new `.vault/` file is introduced, add it to the integrity scanner

### 2.F — Security Fix

When you fix an IPC validation gap, path traversal, or trust boundary issue:

- [ ] Add a regression test in `electron/ipc-security.test.ts` that would have caught
      the original gap
- [ ] Update `docs/SECURITY.md` risk register: close the item or update its status
- [ ] Verify `pnpm lint` still passes (boundary rules must not be loosened)

### 2.G — ESLint / Boundary Rule Fix

When you add or fix an ESLint rule:

- [ ] Verify the rule fails on a synthetic violating file before committing
- [ ] Verify the rule passes on all existing code (`pnpm lint` green)
- [ ] Update `docs/DEVELOPMENT.md` §4 if the boundary description changes

### 2.H — Test Fix (missing or incorrect test)

When you add tests:

- [ ] Tests must be real — no stubs, no skipped cases, no `expect(true).toBe(true)`
- [ ] Each write-capable MCP tool test must cover: valid input, invalid input
      (should return structured error, not throw), and at least one edge case
- [ ] Each staged-storage test must use a real tmp filesystem, not mocks of mocks
- [ ] After adding tests, run `pnpm test` and confirm all pass

### 2.I — CI Workflow Fix

When you edit `.github/workflows/`:

- [ ] Verify the YAML is syntactically valid (use `actionlint` or a YAML linter)
- [ ] Confirm the new job is wired as a required status check for PRs if it is a
      quality gate
- [ ] Update `docs/DEVELOPMENT.md` §2 if a new `pnpm` script is added to the pipeline

### 2.J — Documentation Fix

When you update any file in `docs/`:

- [ ] All file paths referenced in the updated doc must exist on disk — run
      `pnpm docs:validate` after the change
- [ ] Any `TODO(APP)` annotation must include `reason`, `target`, and `risk` fields
- [ ] Do not say something is "implemented" unless you have read the implementation
      and confirmed it. If implementation is partial, say "partially implemented".
- [ ] Do not delete documentation for behavior that still exists in code.

### 2.K — ADR Update

When a fix materially reverses or supersedes an architectural decision:

- [ ] Update the relevant ADR's status to `Superseded by ADR-XXX`
- [ ] Write a new ADR covering the revised decision
- [ ] Update `docs/adr/README.md` index

### 2.L — Performance Fix

When you add `performance.mark` instrumentation or fix a Worker offload:

- [ ] Verify the mark name matches the key in `src/lib/types/diagnostics.ts`
      `PERFORMANCE_BUDGETS`
- [ ] Confirm the aggregation logic in the System Health page reads the new mark
- [ ] Add or update the corresponding benchmark in
      `tests/e2e-desktop/performance.spec.ts`

### 2.M — DEBT.md

When a finding cannot be fully resolved in this remediation pass:

- [ ] Add or update a `DEBT.md` entry with all five required fields: `ID`, `Severity`,
      `Impact`, `Owner`, `Resolution Window`
- [ ] Add a `// TODO(APP) reason=... target=... risk=...` annotation at the deferral
      site in code
- [ ] Never defer a Critical or High finding — if you cannot fix it, escalate
      before closing the finding

---

## 3. Dimension-Specific Remediation Guidance

These rules are additive to the universal rules and side-effect protocol above.
Apply them when working on findings from the corresponding audit dimension.

### 3.1 Architecture & Runtime Boundary Violations

When a boundary violation is found in `src/`:

1. Remove the offending import.
2. Route the dependency through the correct channel:
   - Filesystem access → `window.dndtoolsDesktop.<method>` via IPC
   - Data access → `StorageAdapter` method via the store
   - Shared computation → move the function to `src/lib/utils/` (pure, no Node APIs)
3. Add an ESLint rule that prevents re-introduction (see Side Effect 2.G).
4. Do not leave the boundary violation in place with a comment explaining it — remove
   it entirely.

When a boundary violation is found in `mcp/`:

1. If it imports from `src/lib/state/` or `src/lib/ui/` — extract the shared logic
   to `src/lib/types/` or `src/lib/utils/` if pure, or duplicate the minimal logic
   inside `mcp/`.
2. Never import a Svelte component or store from the MCP process.

### 3.2 Data Integrity Gaps

Atomic write gaps are Critical. Fix them before any other finding.

- Replace every bare `fs.writeFile` in vault-owned paths with `safeWriteFile`.
- Do not add a wrapper that calls `fs.writeFile` internally — the temp-file-rename
  pattern must reach the filesystem layer.
- After fixing, add a test that kills the process mid-write (using a write interceptor)
  and asserts the vault loads correctly from the previous state.
- Integrity scanner gaps: add the missing validation check inline in the scanner.
  Do not add a separate validation pass — the scanner is the single place.

Schema migration gaps:

- Every migration must be reversible or have an explicit note in `SCHEMA_MIGRATIONS.md`
  explaining why it is one-way (with owner sign-off).
- The `--dry-run` flag must produce human-readable output to stdout, not just a
  process exit code.

### 3.3 Security Gaps

IPC payload validation gaps are Critical if the handler performs filesystem operations.
High otherwise.

- Zod schemas go in `electron/ipc-schemas.ts`. The handler calls `schema.parse(payload)`
  as the first line after channel extraction. The error path returns a structured error
  object, never throws to the renderer.
- Path traversal: use `path.resolve` + confirm the result starts with the vault root.
  Do not rely on string operations like `includes('..')` — these are bypassable.
- `docs/SECURITY.md` updates must reflect the current IPC surface, not a hypothetical
  future one. If a handler was fixed, update the risk register entry to `Mitigated`.

### 3.4 CI & Engineering Excellence Gaps

CI workflow gaps are High if they allow a broken build to merge.

- Every new workflow job must have `runs-on` specified and `needs:` dependencies wired
  correctly so it cannot be skipped.
- The desktop build matrix (windows/ubuntu/macos) must emit an artifact and run a
  smoke check against that artifact — not just assert the build command exits 0.
- ADR status drift: if an ADR describes a decision that has been reversed, mark it
  `Superseded` and write the replacement ADR in the same PR. Never delete ADRs.

### 3.5 Test Pyramid Gaps

Write-capable MCP tool coverage is High. Every write tool needs its own test file.

When writing a new tool test:

```
mcp/tools/<domain>/<tool-name>.test.ts
```

Each test file must include at minimum:

1. A test with a valid input fixture vault that asserts the correct output and
   verifies the vault state after the operation.
2. A test with a missing required parameter that asserts the structured error
   envelope is returned (not thrown).
3. A test with a vault edge case relevant to this tool (empty vault, note not found,
   duplicate, etc.).
4. If the tool is `write-staged`, a test that asserts a staged record is created
   and the underlying vault is NOT modified until the change is approved.

For E2E coverage gaps: add the missing Playwright test to the appropriate spec file
under `tests/`. Do not create a new spec file for a single workflow — append to the
existing domain spec.

For performance benchmark gaps: add the missing operation to
`tests/e2e-desktop/performance.spec.ts` with the budget from
`src/lib/types/diagnostics.ts`. The test must fail if the operation exceeds the
budget × 1.2 (20% tolerance).

### 3.6 Core Knowledge Architecture Gaps

Object type gaps: if a type has a TypeScript definition but no Zod schema, add the
schema to `mcp/tools/shared/object-schema.ts` first — this is the authoritative
validation layer. The TypeScript type is derived from the schema via `z.infer`.
Do not write the TypeScript type manually if you have a Zod schema.

Search operator gaps: if an operator is absent, implement it in `src/lib/domain/search.ts`
with a unit test before adding any UI affordance. The operator must be correct on the
service layer before it is surfaced in the UI.

Incremental link graph: if the audit found a full-rebuild-on-save pattern, the fix must
demonstrate O(links in note) complexity by measuring before and after on a 1k-note
fixture. Do not claim the fix is incremental without a test that would catch a
regression to full-rebuild.

### 3.7 Session-Time Command Center Gaps

Tile type rendering gaps: if a tile type is declared in `session-board.ts` but has no
component, the fix requires both:

1. The rendering component in `src/lib/ui/board/tiles/`
2. The dispatch case in the tile host component
3. Persistence verified via a Playwright test that creates the tile, reloads, and
   asserts state is restored

Player view visibility enforcement: the filter must be applied in the storage layer,
not in the UI. Audit every code path that returns notes or objects to the renderer and
confirm `visibility: 'dm_only'` items are excluded before the data reaches Svelte.
A UI-layer-only filter is not acceptable — it is bypassable via DevTools store access.

Encounter builder gaps: CR math must be implemented exactly per the D&D 5e SRD
multiplier table (not approximated). If the implementation uses a different formula,
document the deviation in a code comment citing the source and add a test matrix that
verifies the known thresholds for a 4-player party at levels 1, 5, 10, 15, and 20.

### 3.8 MCP Tool Contract Integrity Gaps

Misclassified tools (performs writes but classified `read-only`): fix the classification
first, then verify the staged-storage enforcement path rejects a direct write call in
staged mode. The test is: call the tool in staged mode and assert the vault file is
unchanged and a pending record exists in `mcp-changelog.json`.

Missing idempotency keys: add `idempotencyKey?: string` to the Zod input schema of
the tool. The tool implementation must use the key to deduplicate: if a record with
the same key already exists in the changelog, return the existing result without
re-executing the write.

Conflict detection gaps: the conflict check must compare the `updatedAt` timestamp of
the staged record's `before` snapshot against the current live note's `updatedAt`. If
they differ, the change is conflicted. Do not use content comparison alone — it is too
slow and misses metadata-only edits.

### 3.9 Performance Architecture Gaps

Worker offload gaps: when moving an operation to a Worker, the `WorkerBridge` in
`src/lib/runtime/worker-bridge.ts` is the only acceptable abstraction layer. Do not
introduce a second message-passing utility. The bootstrap sequence in
`src/lib/runtime/bootstrap.ts` must await the Worker result before marking the
subsystem as ready.

Performance mark gaps: mark names must match the keys in `PERFORMANCE_BUDGETS` exactly
so the aggregation logic can correlate them without string manipulation. Use the
constants, not string literals.

CodeMirror lazy-load: verify the import is inside a dynamic `import()` inside the
editor component or a `+page.ts` `load` function. The editor must not appear in the
initial JS chunk. Verify with `pnpm build` and inspect the chunk manifest — the
CodeMirror chunk must not be listed as a preload for any non-editor route.

### 3.10 Documentation Drift

The rule for documentation fixes: **sync docs to implementation, not the reverse**.
If code and docs disagree, the code is authoritative for what is currently implemented.
Update the docs to match. If the docs describe something that should exist but does not,
either implement it (if it is required by the story) or add a `[NOT IMPLEMENTED]` note
with a `DEBT.md` reference.

`TODO(APP)` annotations in docs must follow the format:

```
TODO(APP) reason="<why this is deferred>" target="<epic/story ID>" risk="<Critical|High|Medium|Low>"
```

Do not write `// TODO: fix later` — this will fail `pnpm docs:validate`.

`SCHEMA_MIGRATIONS.md` must list every version in `mcp/migrations.ts` in order. If a
migration exists without documentation, write the documentation. If the doc lists a
version that does not exist in code, remove it from the doc.

### 3.11 Guiding Principle Alignment

These findings address systemic risks, not discrete bugs. Treat them as scope-defining:

- **Principle 1 (Data is sacred)**: Any remaining crash-unsafe write path is Critical.
  Treat it as Dimension 2 work.
- **Principle 2 (Speed is a feature)**: If performance budgets are not measured in CI,
  add the benchmark suite as a High priority — a budget without measurement is
  decoration.
- **Principle 4 (AI partnership)**: Any MCP write path that bypasses staging in the
  default configuration is Critical. Staged mode must be the default; trusted mode is
  opt-in per agent.
- **Principle 9 (Privacy by design)**: Any network call without explicit user opt-in
  is Critical. Remove or gate it unconditionally — do not add a settings toggle as a
  substitute for not making the call.
- **Principle 11 (Two users)**: Any visibility leak is Critical. The filter belongs
  in the `StorageAdapter` implementation, upstream of any store or component. If it
  is currently in the UI, move it and add a test that calls the adapter directly and
  asserts `dm_only` content is absent.

---

## 4. Commit Protocol

One finding (or tightly related cluster of findings) per commit. Never mix subsystem
concerns in a single commit.

Format:

```
<type>(<scope>): <imperative summary>

<optional body explaining the finding, root cause, and fix strategy>
<side effects addressed: list each>
```

Types: `fix`, `test`, `docs`, `chore`, `feat` (only if implementing genuinely missing
functionality required by the story spec).

Scopes: `mcp`, `renderer`, `electron`, `storage`, `ui`, `ci`, `security`, `docs`.

Before staging any commit:

```bash
pnpm format
pnpm lint
pnpm typecheck
```

If any of these fail, fix the failure before staging. Do not stage with known lint or
type errors present.

---

## 5. Verification Sequence

After completing all fixes in a severity tier, run the full verification sequence
before starting the next tier:

```bash
pnpm check              # lint + typecheck + unit tests
pnpm mcp:build          # if any mcp/ file changed
pnpm desktop:build      # if any electron/ file or storage contract changed
pnpm test:e2e:desktop:critical   # if any UI behavior or data path changed
```

Do not proceed to Medium findings if any Critical or High verification step fails.

For CI-specific fixes (workflow YAML), push the branch and verify the workflow runs
correctly before declaring the finding resolved.

---

## 6. Definition of Done

A finding is done only when all of the following are true:

- [ ] The defect described in the finding no longer exists in the code
- [ ] A test exists that would catch a regression to the broken state
- [ ] All applicable side effects from Section 2 are addressed
- [ ] `pnpm check` passes with no suppressions introduced
- [ ] Relevant documentation accurately reflects the current implementation
- [ ] No new `any` types, boundary violations, or bare `writeFile` calls introduced
- [ ] No deferral without a `DEBT.md` entry and `TODO(APP)` annotation

If you cannot satisfy all six criteria for a finding, do not mark it done. Add a
`DEBT.md` entry and move on — but never close a Critical or High finding with deferred
status without explicit escalation.

---

## 7. Pull Request & Merge

When all findings are resolved or formally deferred:

```bash
pnpm format
git push -u origin fix/audit-remediation-<YYYY-MM-DD>
gh pr create \
  --title "fix(audit): remediate I1–I4 audit findings [Audit 2026-03-03]" \
  --base master \
  --body "..."
gh pr merge --auto --squash
```

The PR body must include:

1. A table of every finding addressed, its original severity, and its resolution status
2. A table of every finding deferred, with the `DEBT.md` ID for each
3. The output of `pnpm check` (pass/fail summary)
4. Any performance budget changes (before/after if measurements changed)

Auto-merge is permitted once CI passes. Do not merge manually to bypass a failing check.

---

## 8. What Not to Do

These are recurring failure modes in this codebase. Treat any impulse to do the
following as a signal to stop and reconsider.

| Impulse                                                                  | Why it is wrong                         | Correct action                                 |
| ------------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------- |
| Add `as unknown as TargetType` to silence a type error                   | Runtime safety is gone                  | Fix the design so the type is provably correct |
| Write a `// TODO: fix properly` and ship                                 | Debt without tracking                   | Add a DEBT.md entry with all five fields       |
| Fix the bug by disabling the ESLint rule inline                          | Rule exists to prevent the pattern      | Fix the code, not the rule                     |
| Write a test that mocks the filesystem to test a filesystem write        | You are not testing the actual behavior | Use a real tmp directory                       |
| Update a doc to say something is "complete" when the code is partial     | The doc becomes a lie                   | Document exactly what is implemented           |
| Add a feature flag for behavior that should always be on                 | Unnecessary complexity                  | Just implement it unconditionally              |
| Refactor unrelated code while fixing an audit finding                    | Scope creep, review noise               | Fix only what the finding says                 |
| Use `--no-verify` when a hook fails                                      | Masks the root cause                    | Fix the hook failure                           |
| Move a filter from the storage layer to the UI "temporarily"             | Visibility leaks are security issues    | Fix it in the storage layer                    |
| Call `safeWriteFile` and then also call `fs.writeFile` for the same path | Breaks atomicity                        | Remove the direct call                         |
