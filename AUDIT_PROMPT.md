# DND Tools — Application State Audit Prompt

You are performing a deep-dive audit of the **DND Tools** application — a local-first,
Electron-based TTRPG companion with a SvelteKit renderer, MCP sidecar, and
filesystem-backed vault. The goal is to produce an honest, evidence-based report of
alignment between the documented design intent and the actual implementation state.

**Context:** Initiatives 1–4 of `docs/MASTER_PLAN.md` are considered complete. All
findings must be grounded in actual code reads — do not accept documentation at face
value.

---

## Audit Dimension 1 — Architecture & Runtime Boundary Compliance

Verify that the three-process runtime model (Electron main / Renderer / MCP sidecar)
is correctly enforced in practice.

1. **Renderer boundary violations** — Scan all files under `src/` for direct Node.js
   API imports (`fs`, `path`, `child_process`, `os`, etc.) that bypass the
   `window.dndtoolsDesktop` bridge or `StorageAdapter` interface. Enumerate any
   violations with file path and line number.

2. **StorageAdapter contract enforcement** — Confirm that no Svelte route component
   (files matching `src/routes/**/*.svelte`) directly imports or instantiates storage
   adapter implementations. All persistence must flow through store modules in
   `src/lib/state/`. Identify any direct adapter usage in routes.

3. **MCP/renderer cross-contamination** — Check that `mcp/` never imports from
   `src/lib/` (Svelte runtime), and that `src/lib/` never imports from `mcp/`. Verify
   that shared types live only in `src/lib/types/` and are imported cleanly from both
   sides.

4. **Preload surface minimality** — Read `electron/preload.ts` and enumerate every
   method exposed on `window.dndtoolsDesktop`. Assess whether any exposed method is
   overly broad (e.g., generic dispatch), undocumented, or lacks input validation.
   Cross-reference against the `TODO(APP)` in `docs/ARCHITECTURE.md` §7 about replacing
   the generic `dndtools:storage` dispatcher.

5. **IPC channel registration audit** — In `electron/main.ts`, enumerate every
   `ipcMain.handle` registration. Verify each has: an explicit channel name, payload
   validation before business logic, and a corresponding preload exposure. Flag any that
   use dynamic method dispatch patterns (the Epic 1.4 / S1.4.1 concern).

---

## Audit Dimension 2 — Data Integrity & Write Safety (Initiative 1 Completeness)

Epic 1.1 introduced atomic writes; verify implementation depth and correctness.

6. **Atomic write coverage** — Read `mcp/safe-write.ts` and `mcp/storage.ts`. Confirm
   that every write path for: note files, `index.json`, `settings.json`,
   `session-boards.json`, `objects.json`, `object-history.json`, and
   `mcp-changelog.json` uses the atomic temp-file-then-rename pattern. Identify any
   `writeFile` calls that bypass this.

7. **Write-journal recovery** — Confirm that `.vault/write-journal.json` is written
   _before_ each operation begins and cleared on successful commit. Verify that the
   journal replay/rollback path in `mcp/storage.ts` runs at startup before any vault
   operations. Assess whether the recovery logic handles edge cases: empty journal,
   malformed journal, journal entry for a note that no longer exists.

8. **Schema migration completeness** — Read `mcp/migrations.ts`. Verify: (a) every
   migration has a corresponding fixture in `mcp/fixtures/`, (b) the migration runner
   supports `--dry-run`, (c) the "Vault upgrade required" bootstrap guardrail (S1.2.5)
   blocks all vault operations on version mismatch, (d) rollback checkpoints are written
   to `.vault/migration-backup-{version}-{timestamp}/` before any migration begins.

9. **Integrity scanner scope** — Confirm that the startup integrity scanner validates
   all `.vault/*.json` files: parse as JSON, check required fields, verify
   cross-reference consistency between `index.json` note IDs and actual files on disk.
   Check whether the implementation is fast enough to not block bootstrap for vaults
   with 5,000+ notes. Verify checksum fields exist in `index.json` and are validated on
   note reads.

---

## Audit Dimension 3 — Security Model (Epic 1.4 Completeness)

10. **IPC payload validation** — Read the Zod schema definitions for IPC payloads.
    Verify that every `ipcMain.handle` registered in `electron/main.ts` validates its
    incoming payload before executing business logic. Enumerate any handlers that skip
    validation or use only TypeScript type assertions (which provide no runtime safety).

11. **Path traversal protection** — In the file-serving IPC handlers, verify that
    vault-relative paths from the renderer are normalized and checked against the
    configured vault root before any filesystem operation. Confirm that `../` traversal
    attempts are rejected.

12. **Security threat model** — Read `docs/SECURITY.md`. Verify it covers all six
    required areas from S1.4.3: vault filesystem attack surface, IPC injection vectors,
    MCP sidecar trust boundary, local-only vs. cloud-connected threat profiles, and an
    open risk register with owner + remediation target. Report any section that is
    missing, superficial (< 2 substantive paragraphs), or out of date with the current
    IPC surface.

13. **IPC security test suite** — Read `electron/ipc-security.test.ts`. Verify tests
    exist for: oversized payload rejection, path traversal blocking, unexpected method
    names on dynamic handlers, and renderer inability to invoke privileged operations
    not in preload. Identify any of these four areas with no test coverage.

---

## Audit Dimension 4 — Engineering Excellence (Initiative 2 Completeness)

14. **CI workflow completeness** — Read `.github/workflows/ci.yml` and
    `.github/workflows/e2e.yml`. Verify: lint → format:check → typecheck → unit tests →
    build is a required status check on PRs. Confirm E2E tests run against real Electron
    with xvfb. Check whether the desktop build validation matrix (S2.1.3) exists across
    windows/ubuntu/macos and runs on release branches. Report any gap between MASTER_PLAN
    story definitions and what is actually in the workflows.

15. **ADR completeness and accuracy** — Read all nine ADRs in `docs/adr/`. For each,
    verify: status is accurate (Accepted/Proposed/Deprecated), the implementation
    described matches what actually exists in code, and no decision it references has
    been silently reversed. Pay special attention to ADR-003 (IPC surface strategy)
    given the known TODO about the generic dispatcher.

16. **DEBT.md audit** — Read the root-level `DEBT.md`. Verify that all tracked items
    have `ID`, `Severity`, `Impact`, `Owner`, and `Resolution Window` fields. Check
    whether any source-code `// TODO(APP)` annotations exist beyond one quarter without
    a corresponding `DEBT.md` entry (search `mcp/`, `src/`, `electron/` for
    `TODO(APP)`). Report any orphaned TODOs.

17. **ESLint boundary rule enforcement** — Read `eslint.config.js`. Confirm the boundary
    rules from `docs/DEVELOPMENT.md` §4 are implemented as lint rules: renderer cannot
    import Node-only APIs, MCP cannot import Svelte runtime, route components cannot
    directly import storage adapters. Verify these rules are actually in the ESLint
    config and not just documentation aspirations.

18. **`pnpm docs:validate` implementation** — Read the script that backs
    `pnpm docs:validate`. Verify it checks the three required properties from S2.1.5:
    (a) all file paths referenced in `docs/` exist, (b) all `TODO(APP)` annotations
    include `reason`/`target`/`risk` fields, (c) `SCHEMA_MIGRATIONS.md` version list
    stays in sync with `mcp/migrations.ts`. Report any check that is missing or only
    partially implemented.

---

## Audit Dimension 5 — Test Pyramid Health

19. **MCP tool unit test coverage** — For all tool files under `mcp/tools/**/*.ts`
    (excluding test files and `index.ts`), determine which have a dedicated test file.
    Report the ratio of tools with dedicated tests vs. tools that rely only on
    `mcp/tools/all-tools.test.ts`. Specifically identify which write-capable tools
    (those performing creates/updates/deletes) lack individual test files, as S2.2.1
    requires 100% coverage for write-capable tools.

20. **Staged MCP workflow regression** — Read `mcp/staged-storage.test.ts` if it
    exists. Verify coverage of: concurrent approve+UI edit race condition, batch
    approval with filter, per-agent policy preset enforcement, and audit trail
    completeness. Report which of these scenarios have explicit tests and which are
    absent.

21. **E2E coverage matrix** — Read the Playwright test files under `tests/`. Enumerate
    which of the following critical workflows are covered by an E2E test: vault open,
    note CRUD (create/read/update/delete), wikilink navigation, search, MCP pending
    changes review, session board management, object creation, player view mode toggle,
    first-run onboarding. Report any uncovered workflow.

22. **Performance regression suite** — Read `tests/e2e-desktop/performance.spec.ts`.
    Verify that all seven operations from `docs/ARCHITECTURE.md` §8.1 (cold start, vault
    open, note open, search, save, graph rebuild, MCP bundle call) have a benchmark with
    defined pass/fail thresholds. Confirm the budget registry in
    `src/lib/types/diagnostics.ts` (`PERFORMANCE_BUDGETS`) matches the values in
    `docs/ARCHITECTURE.md`. Report any drift.

---

## Audit Dimension 6 — Core Knowledge Architecture (Initiative 3 Completeness)

23. **Object type schema completeness** — Read `src/lib/types/object.ts` and
    `mcp/tools/shared/object-schema.ts`. Verify all 10 object types documented in
    `docs/DATA_MODEL.md` §1.6 (`stat_block`, `character`, `image`, `npc`, `location`,
    `faction`, `quest`, `item`, `encounter`, `timeline_event`) have: a TypeScript type,
    a Zod validation schema, and a corresponding creation path (either an MCP tool or a
    structured editor component). Report any type that is documented but not fully
    implemented.

24. **Import/export pipeline integrity** — Read `src/lib/domain/import-export.ts` and
    `electron/import-export-service.ts`. Verify that the import analyzer detects all
    eight pre-import issues from `docs/DATA_MODEL.md` §6 (duplicate titles, ID
    collisions, invalid frontmatter, encoding errors, missing linked files, size-limit
    violations, UTF-8 check, manual-resolution wikilinks). Confirm the resumable import
    checkpoint mechanism works: that partial imports are committed and the checkpoint
    survives an app restart.

25. **Search operator support** — Read `src/lib/domain/search.ts` and related files.
    Determine whether advanced query operators from Epic 3.3.1 are implemented: `tag:`,
    `folder:`, `type:`, `updated:>Nd`, `links:[[]]`, and quoted phrase search. Report
    which operators are implemented, which are partially stubbed, and which are absent.

26. **Incremental link graph updates** — Read `src/lib/domain/link-extractor.ts` and
    the state module that manages the link graph. Verify the graph update on single note
    mutation is surgical (does not rebuild the entire graph), as required by S3.1.1.
    Confirm the graph rebuild is only triggered on vault-open and explicit repair.
    Estimate the complexity: does a single-note save touch more than O(links in that
    note) graph operations?

---

## Audit Dimension 7 — Session-Time Command Center (Initiative 4 Completeness)

27. **Session board tile type inventory** — Read `src/lib/types/session-board.ts`.
    Enumerate every tile type currently supported (`note`, `calendar`, `timer`, `combat`,
    `dice`, `generator`, `handouts`). For each tile type, verify: (a) the type is
    defined in the TypeScript interface, (b) there is a rendering component in the UI,
    (c) the tile state is correctly persisted in `session-boards.json`. Flag any tile
    type that is declared in the type system but has no rendering implementation.

28. **Combat tracker completeness** — Read the combat tracker component(s). Verify the
    following features from Epic 4.2 are functional: initiative tracking with
    drag-reorder and tie-breaking, HP/condition tracking per combatant, linked stat block
    embed per combatant, death save tracking for PCs, concentration indicator, and
    encounter result capture to note creation. For each feature, confirm it is fully
    implemented vs. partially stubbed vs. absent.

29. **Dice engine correctness** — Read the dice expression parser/evaluator. Verify it
    correctly handles: `1d20+5`, `2d6`, `4d6kh3` (keep highest), `adv`/`dis`
    (advantage/disadvantage), and inline arithmetic. Confirm the parser is pure
    TypeScript with no side effects and has unit tests for edge cases (e.g., `1d1`,
    `0d6`, negative modifiers, malformed expressions like `abc`).

30. **Player-facing view boundary enforcement** — Read the `/player` route and the
    visibility filtering logic. Verify that `dm_only` notes and objects are never
    included in API responses when the player view is active — not just hidden in the
    UI. Specifically, confirm the filter is applied at the data layer (in the storage
    adapter or service), not purely at the rendering layer where it could be bypassed by
    a direct store read.

31. **Handout system implementation** — Verify the `handout` object type exists in
    `src/lib/types/object.ts` and `mcp/tools/shared/object-schema.ts`. Check that the
    handout library UI is accessible (route or settings panel), the visual aging effects
    are applied via CSS, and the delivery tracking (`delivered` flag) is persisted.
    Report any Epic 4.8 story that remains unimplemented.

32. **Encounter builder completeness** — Read the encounter builder route
    (`/encounter/new`) and any associated components. Verify that all four stories from
    Epic 4.9 are fully implemented: (a) S4.9.1 — encounter composition UI with CR XP
    budget math and live difficulty meter reading party composition from linked character
    objects; (b) S4.9.2 — environment/terrain integration with tactical consideration
    checklist; (c) S4.9.3 — legendary action and lair action tracking linked to stat
    block objects; (d) S4.9.4 — encounter log and vault note creation from template with
    loot and XP awards linked to the active timeline event. For each story, report
    whether it is fully implemented, partially stubbed, or absent.

---

## Audit Dimension 8 — MCP Tool Contract Integrity

33. **Tool registration completeness** — Read `mcp/tools/index.ts`. Verify every tool
    file under `mcp/tools/**/*.ts` (non-test) is registered. Check for any tool file
    that exists but is not registered, and any registration that references a
    non-existent file.

34. **Tool contract classification** — Read `mcp/tools/shared/contracts.ts`. Verify
    every registered tool has an explicit classification (`read-only`, `write-staged`,
    `write-direct`). Confirm that in staged mode, `write-direct` tools are blocked at
    the contract enforcement layer before any business logic runs. Enumerate any tool
    that performs writes but is classified as `read-only`.

35. **Idempotency key coverage** — Verify that all non-idempotent write tools accept an
    optional `idempotencyKey` parameter as required by the contract framework. Search for
    write tools that are missing this parameter.

36. **Staged storage conflict detection** — Read `mcp/staged-storage.ts`. Verify the
    conflict-check logic: that pending change records are validated against live note
    state before approval to prevent overwriting UI edits made after the MCP change was
    staged. Confirm the conflict reason/details are surfaced in the MCP changelog UI.

---

## Audit Dimension 9 — Performance Architecture Compliance

37. **Worker bridge implementation** — Read `src/lib/runtime/worker-bridge.ts`. Verify
    the three operations from `docs/ARCHITECTURE.md` §8 (initial search index build,
    full graph rebuild, large note batch parse) are offloaded to Worker threads. Confirm
    the WorkerBridge abstraction hides message-passing from callers. Check whether the
    cold-start bootstrap sequence actually uses the worker for these operations or still
    runs them on the main thread.

38. **Performance mark instrumentation** — Search `src/` and `mcp/` for
    `performance.mark` and `performance.measure` calls. Verify all seven budgeted
    operations from `docs/ARCHITECTURE.md` §8.1 are instrumented. Confirm the P50/P95
    aggregation is surfaced in the System Health page. Report any budget operation with
    no instrumentation.

39. **Lazy-load enforcement for CodeMirror** — Confirm that the CodeMirror editor is
    loaded lazily (not in the critical bootstrap path). Verify via route-level dynamic
    imports or lazy component loading that the editor bundle is not included in the
    initial JS payload.

---

## Audit Dimension 10 — Documentation Sync & Accuracy

40. **ARCHITECTURE.md vs. implementation drift** — For each `TODO(APP)` annotation in
    `docs/ARCHITECTURE.md`, check whether the referenced code has actually been updated
    since the TODO was written or whether the TODO reflects a still-open gap.
    Specifically audit the generic IPC dispatcher TODO (§7) and the metadata integrity
    TODO (§9).

41. **DATA_MODEL.md freshness** — Read `src/lib/types/session-board.ts`. Compare the
    combat tile state documentation in `docs/DATA_MODEL.md` §1.4 against the actual type
    definition. Report any field in the type that is not documented, or any field
    documented that has been removed.

42. **MASTER_PLAN story completion accuracy** — For each epic in I1–I4, identify two or
    three specific stories that represent the most complex or high-risk implementation.
    Verify the actual code implements what the story specifies, not just a surface-level
    approximation. Pay special attention to: S1.1.4 (data-loss regression tests),
    S1.2.4 (migration fixture completeness), S2.1.3 (cross-platform build matrix),
    S2.2.3 (staged MCP workflow regression suite), S3.3.1 (advanced search operators),
    S4.2.4 (encounter result → note creation), S4.9.1 (CR budget math and difficulty
    meter), S4.9.4 (encounter log → vault note with loot and XP awards).

43. **Schema Migrations doc sync** — Read `docs/SCHEMA_MIGRATIONS.md` and
    `mcp/migrations.ts`. Verify the version list in the doc exactly matches the
    migrations registered in code. Report any migration in code without documentation,
    or any version mentioned in the doc without a corresponding migration implementation.

---

## Audit Dimension 11 — Guiding Principle Alignment

Assess alignment with the eleven guiding principles in `docs/MASTER_PLAN.md` for each
of the following:

44. **"Data is sacred" (Principle 1)** — Given findings from Dimensions 2 and 3,
    provide an honest assessment: could a crash, power loss, or app kill during a common
    operation (note save, import, migration) result in data loss or corruption today?
    What is the weakest link?

45. **"Speed is a feature" (Principle 2)** — Are the performance budgets in
    `docs/ARCHITECTURE.md` §8.1 actually measured in CI today? If not, which budgets are
    at risk of silent regression?

46. **"AI partnership, not AI dependence" (Principle 4)** — Is the staged write review
    workflow complete, friction-appropriate, and impossible to accidentally bypass? Are
    there any MCP write paths that can succeed without creating a staged record in
    default mode?

47. **"Privacy and security by design" (Principle 9)** — Does the current implementation
    have any telemetry, network requests, or external service calls that occur without
    explicit user opt-in? Check for any analytics, crash reporting, or update-check
    calls in `electron/main.ts` or the renderer bootstrap.

48. **"Two users, one system" (Principle 11)** — Is DM-private content
    (`visibility: dm_only`) provably impossible to leak to the player view given the
    current implementation? Identify the specific code path that enforces this and
    assess whether it is enforced at the right layer.

---

## Expected Output Format

Produce the audit report as a structured markdown document with one section per
dimension. For each finding:

- **Status**: `[PASS]`, `[PARTIAL]`, `[FAIL]`, or `[NOT IMPLEMENTED]`
- **Evidence**: File path(s) and line numbers where the finding was confirmed or where
  the gap was observed
- **Risk**: `Critical` / `High` / `Medium` / `Low` — based on data safety, security,
  or user-visible regression potential
- **Recommendation**: Specific, actionable corrective action (not general advice)

At the end, produce:

1. A **Priority Matrix** — top 10 findings ranked by Risk × Impact, with the single
   most important fix for each
2. A **Completion Scorecard** — one row per Initiative (I1–I4), rating completeness as
   a percentage with a one-sentence justification
3. A **Drift Register** — any case where documentation claims something is
   complete/implemented but the code audit shows it is absent or only partially done
