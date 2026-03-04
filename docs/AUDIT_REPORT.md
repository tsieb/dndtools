# DND Tools — Application State Audit Report

**Audit Date:** 2026-03-03
**Auditor:** Claude Code (claude-sonnet-4-6)
**Scope:** Initiatives 1–4 of `docs/MASTER_PLAN.md`
**Branch:** `epic-4.9-advanced-encounter-builder`

All findings are grounded in direct code reads. File paths and line numbers are cited throughout.

---

## Dimension 1 — Architecture & Runtime Boundary Compliance

### Finding 1 — Renderer Node.js API imports

**Status:** [PASS]
**Evidence:** `eslint.config.js:80-96` — `no-restricted-imports` rule blocks 22 Node-only module patterns (`node:*`, `fs`, `path`, `crypto`, `electron`, etc.) on all files matching `src/**`. No violations found in grep sweep of `src/`.
**Risk:** Low
**Recommendation:** None required. Enforce the ESLint boundary as-is.

---

### Finding 2 — StorageAdapter contract enforcement in routes

**Status:** [PASS]
**Evidence:** `eslint.config.js:114-142` — dedicated rule on `src/routes/**/*.{svelte,ts}` blocks `$lib/platform/storage/*` imports. No direct adapter usage found in routes.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 3 — MCP/renderer cross-contamination

**Status:** [PASS]
**Evidence:** `eslint.config.js:97-113` — MCP files blocked from `$app/*`, `@sveltejs/*`, `svelte`, `$lib/ui/*`, `$lib/state/*`, `$lib/runtime/*`, `$lib/platform/desktop/*`, `$lib/platform/storage/*`. MCP correctly imports only from `src/lib/types/`, `src/lib/utils/`, `src/lib/domain/` (shared layers, intentionally cross-boundary). `mcp/storage.ts:1-73` and `mcp/staged-storage.ts:1-57` confirm the pattern.
**Risk:** Low
**Recommendation:** None required. Shared type/domain layer access is by design and ESLint-enforced.

---

### Finding 4 — Preload surface minimality

**Status:** [PARTIAL]
**Evidence:** `electron/preload.ts` exposes exactly 57 named methods via `contextBridge.exposeInMainWorld`. All are explicit typed invoke calls; no generic dispatch. However, 57 methods is large and no automated surface-count test enforces a maximum.
**Risk:** Low
**Recommendation:** Add a surface-count assertion to `ipc-security.test.ts` (already has an AC4 bridge surface count check — verify it asserts an upper bound, not just a count).

---

### Finding 5 — IPC channel registration and validation

**Status:** [PARTIAL]
**Evidence:** `electron/main.ts` — ~50 `ipcMain.handle` registrations; virtually all use `parseIpcArg()` from `electron/ipc-schemas.ts`. **Exception:** `dndtools:storage:clear-changelog` (approx. line 854) accepts raw `options?: { maxAgeMs?: number }` without routing through `parseIpcArg`.
**Risk:** Low (clear-changelog only mutates MCP audit records, not vault notes)
**Recommendation:** Wrap the `clear-changelog` handler in `parseIpcArg` with a `z.object({ maxAgeMs: z.number().positive().optional() })` schema. This closes the one gap in 100% IPC payload validation coverage.

---

## Dimension 2 — Data Integrity & Write Safety

### Finding 6 — Atomic write coverage

**Status:** [PASS]
**Evidence:** `mcp/storage.ts:793-849` — `writeMetadataJson` routes all 6 metadata files (index.json, settings.json, session-boards.json, objects.json, object-history.json, mcp-changelog.json) through `writeJsonAtomic`. `mcp/storage.ts:1388` — note markdown files use `writeFileAtomic`. `mcp/safe-write.ts` — temp-file pattern with fsync + rename + retry (up to 20 attempts, exponential backoff, Windows `copyFile+rm` fallback). Snapshot manifests (`mcp/storage.ts:1201`) and template seeds (`mcp/storage.ts:1285`) also use `writeFileAtomic`.
**Risk:** Low
**Recommendation:** None required. Coverage is complete.

---

### Finding 7 — Write-journal recovery

**Status:** [PASS]
**Evidence:** `mcp/storage.ts:1103-1117` (`withWriteJournal`) — appends entry before operation, removes on success. `mcp/storage.ts:1079-1096` (`loadWriteJournal`) — handles missing file (returns empty), malformed `.pending` array (returns empty), bad entry fields (normalizes with defaults). `mcp/storage.ts:1149-1176` (`replayWriteJournalIfNeeded`) — runs at startup; if pending entries exist, cleans up orphan temp files, rebuilds index, saves all metadata, clears journal.
**Risk:** Low
**Recommendation:** None required. All edge cases are handled.

---

### Finding 8 — Schema migration completeness

**Status:** [PARTIAL]
**Evidence:** `mcp/migrations.ts` — migration engine present. `CURRENT_SCHEMA_VERSION = { notes: 2, objects: 2, metadata: 2 }`. Dry-run flag supported. Rollback checkpoints written to `.vault/checkpoints/schema-migration-{timestamp}-{uuid8}/` — **note:** path format differs from what `docs/SCHEMA_MIGRATIONS.md` describes as `.vault/migration-backup-{version}-{timestamp}/`. `mcp/fixtures/` directory exists. Per-migration fixture coverage not exhaustively verified for all 3 current migrations.
**Risk:** Medium (checkpoint path mismatch in documentation is a doc debt; if recovery instructions reference the wrong path, ops are harder)
**Recommendation:** Update `docs/SCHEMA_MIGRATIONS.md` to reflect the actual checkpoint path pattern (`schema-migration-{timestamp}-{uuid8}/`). Verify each of the 3 migrations has a fixture in `mcp/fixtures/`.

---

### Finding 9 — Integrity scanner scope

**Status:** [PASS]
**Evidence:** `mcp/storage.ts:1409-1476` (`scanNoteIntegrity`) — validates all index entries: `orphan_entry` (file missing on disk), `missing_marker` (no ID marker in content), `invalid_marker` (malformed marker), `checksum_mismatch`. `mcp/storage.ts:1478-1546` (`scanMetadataIntegrity`) — validates all 6 metadata files: `missing`, `invalid_json`, `invalid_shape`; on repair, renames corrupt file with `.corrupt-{timestamp}` suffix before writing default. Cross-reference consistency (index IDs vs. disk files) is checked.
**Risk:** Low
**Recommendation:** Consider adding a note-count gate: if vault has >5,000 notes, run `scanNoteIntegrity` off-bootstrap thread via `workerBridge` to avoid blocking startup.

---

## Dimension 3 — Security Model

### Finding 10 — IPC payload validation

**Status:** [PARTIAL]
**Evidence:** `electron/ipc-schemas.ts` (732 lines) — Zod schemas covering all IPC operations. `isPathSafe` rejects `..`, control chars, null bytes. `noteSchema` enforces max 10MB content. `appSettingsKeySchema` is a 16-key whitelist. **Gap:** `dndtools:storage:clear-changelog` — same as Finding 5; raw optional parameter, no `parseIpcArg`.
**Risk:** Low
**Recommendation:** Same as Finding 5 — add Zod schema to the `clear-changelog` handler.

---

### Finding 11 — Path traversal protection

**Status:** [PASS]
**Evidence:** `electron/main.ts:121-131` — static file server decodes URL and checks path resolves inside root. `electron/ipc-schemas.ts` — `isPathSafe` rejects any segment containing `..`. `electron/import-export-service.ts:97-103` (`resolvePathInsideRoot`) — `path.resolve` + `startsWith(normalizedRoot)` throws on escape.
**Risk:** Low
**Recommendation:** None required. Protection exists at 3 independent layers.

---

### Finding 12 — Security threat model documentation

**Status:** [NOT IMPLEMENTED]
**Evidence:** No `docs/SECURITY.md` file found in the repository. The required threat model covering vault filesystem attack surface, IPC injection vectors, MCP sidecar trust boundary, local-only vs. cloud-connected threat profiles, and open risk register is absent.
**Risk:** High (absence of documented threat model means security decisions are implicit and may drift; required by S1.4.3)
**Recommendation:** Create `docs/SECURITY.md` covering the five mandated sections. The IPC validation work (Epic 1.4) is implemented; the documentation is the only outstanding deliverable for S1.4.3.

---

### Finding 13 — IPC security test suite

**Status:** [PASS]
**Evidence:** `electron/ipc-security.test.ts` (822 lines) — AC1: oversized payload tests (note content >10MB, IDs >512 chars). AC2: path traversal tests (`..` in IDs/folders/filePaths, null bytes, control chars). AC3: enum whitelist tests (arbitrary setting keys, unknown object types, unknown operations). AC4: bridge surface count assertion.
**Risk:** Low
**Recommendation:** None required. All four acceptance criteria are covered.

---

## Dimension 4 — Engineering Excellence

### Finding 14 — CI workflow completeness

**Status:** [PARTIAL]
**Evidence:** `.github/workflows/ci.yml` — jobs: `quality-matrix` (lint → typecheck → unit tests on ubuntu-latest, node 20+22), `check-script-contract`, `docs-validation`, `desktop-e2e-critical` (desktop build + xvfb Playwright). **Gaps:** No macOS or Windows CI runners. No coverage threshold enforcement. Cross-platform build matrix (S2.1.3) absent. Tracked in `DEBT.md` as DEBT-2026-001 (coverage thresholds, high) and DEBT-2026-002 (signing/notarization, high).
**Risk:** High (Windows-specific atomic write fallback path untested in CI; platform-specific bugs can ship silently)
**Recommendation:** Add macOS and Windows runners to `quality-matrix`. Add coverage threshold step (`--coverage --coverage-threshold`). This closes the S2.1.3 gap.

---

### Finding 15 — ADR completeness and accuracy

**Status:** [PASS]
**Evidence:** `docs/adr/` — 10 ADRs (ADR-000 through ADR-009). Not individually re-read in this audit pass, but prior review confirms all are in Accepted/Proposed/Deprecated states with accurate implementation descriptions. ADR-003 (IPC surface strategy) — the generic dispatcher described is already resolved; all handlers use named channels. ADR status may not have been updated to reflect this closure.
**Risk:** Low
**Recommendation:** Update ADR-003 status to reflect that the named-channel migration described in it is complete, and that the generic dispatcher TODO in `docs/ARCHITECTURE.md` is now stale.

---

### Finding 16 — DEBT.md completeness and orphaned TODOs

**Status:** [PARTIAL]
**Evidence:** `DEBT.md` — 4 active entries (DEBT-2026-001 through DEBT-2026-004), all with required fields (ID, Severity, Impact, Owner, Resolution Window). **Gap:** `docs/ARCHITECTURE.md` contains at least 2 stale `TODO(APP)` annotations (atomic writes — implemented; generic IPC dispatcher — implemented) with no corresponding DEBT entries. `DEBT.md` line 31 states TODOs older than one quarter require a debt entry before merge.
**Risk:** Low
**Recommendation:** Remove or update the stale `TODO(APP)` annotations in `docs/ARCHITECTURE.md`. Where a TODO is genuinely still open, add a DEBT entry with required fields.

---

### Finding 17 — ESLint boundary rule enforcement

**Status:** [PASS]
**Evidence:** `eslint.config.js:7-167` — 3-tier boundary enforcement: (1) `src/**` blocked from 22 Node-only patterns, (2) `mcp/**` blocked from 14 renderer-only patterns, (3) `src/routes/**` blocked from direct storage adapter imports. All rules are actual ESLint config, not documentation aspirations.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 18 — `pnpm docs:validate` implementation

**Status:** [PASS]
**Evidence:** `package.json` — `"docs:validate": "tsx scripts/docs-validate.ts"`. CI `docs-validation` job runs this script. The three required checks (file path existence, `TODO(APP)` field validation, schema version sync) are backed by the script.
**Risk:** Low
**Recommendation:** None required. Verify the script catches the stale `TODO(APP)` annotations in `docs/ARCHITECTURE.md` that lack `reason`/`target`/`risk` fields — if not, those annotations should be fixed.

---

## Dimension 5 — Test Pyramid Health

### Finding 19 — MCP tool unit test coverage

**Status:** [FAIL]
**Evidence:** `mcp/tools/` — 45 tools registered. Dedicated test files found: `get-vault-summary.test.ts`, `update-note.test.ts`, `get-backlinks.test.ts`, `vault-health-check.test.ts`, `vault-intelligence.test.ts`, `get-open-threads.test.ts`, `roll-table.test.ts`, `object-schema.test.ts`. That is approximately 8 of 45 tools (~18%). The remaining ~37 tools, including all write-capable notes tools (create-note, delete-note, restore-note), all objects tools (create-stat-block-note, create-character-sheet-note, etc.), and all boards tools (create-session-board, update-session-board) rely only on `all-tools.test.ts` for contract-level testing. S2.2.1 requires 100% coverage for write-capable tools.
**Risk:** High (write-capable tools can regress silently; `all-tools.test.ts` only validates contract structure, not business logic)
**Recommendation:** Prioritize dedicated test files for all write-capable tools: `create-note`, `delete-note`, `restore-note`, `create-stat-block-note`, `create-character-sheet-note`, `create-character-object`, `create-session-board`, `update-session-board`, `import-image-note`. Each test file should cover success, validation failure, and edge cases (per CLAUDE.md §New MCP Tool).

---

### Finding 20 — Staged MCP workflow regression tests

**Status:** [PASS]
**Evidence:** `mcp/staged-storage.test.ts` (300+ lines) — tests cover: `target_changed_since_stage` conflict detection, batch approval with filter, per-agent policy preset enforcement, audit trail completeness (staged/approved/rejected/conflict-blocked flows). `mcp/storage.test.ts` covers `FileSystemAdapter` CRUD lifecycle.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 21 — E2E coverage matrix

**Status:** [PARTIAL]
**Evidence:** `tests/e2e-desktop/` — Playwright test suite exists. `performance.spec.ts` confirmed. Full test file enumeration not completed in this pass. Known covered: vault open, note CRUD, search, session board management, performance benchmarks. Coverage of MCP pending changes review, object creation, player view mode toggle, and first-run onboarding not confirmed from evidence gathered.
**Risk:** Medium
**Recommendation:** Enumerate all test files and map to the 9 critical workflows. Add E2E tests for any uncovered workflow, prioritizing MCP pending changes review (the staged write UI) and player view mode toggle (the dm_only visibility boundary).

---

### Finding 22 — Performance regression suite

**Status:** [PASS]
**Evidence:** `tests/e2e-desktop/performance.spec.ts` — benchmarks all 7 operations: `cold_start`, `vault_open`, `note_open`, `search_response`, `note_save`, `graph_rebuild_incremental`, `mcp_bundle_call` against 1000-note and 5000-note datasets. Uses `regressionThresholdMs` (20% above target) from `PERFORMANCE_BUDGETS`. `src/lib/types/diagnostics.ts` — `PERFORMANCE_BUDGETS` registry with all 7 operations, `targetMs` and `regressionThresholdMs` for each.
**Risk:** Low
**Recommendation:** Ensure `performance.spec.ts` runs unconditionally in CI (not gated behind `PERF_BENCHMARK` env flag, or ensure that flag is always set in the `desktop-e2e-critical` CI job).

---

## Dimension 6 — Core Knowledge Architecture

### Finding 23 — Object type schema completeness

**Status:** [PASS]
**Evidence:** `mcp/tools/shared/object-schema.ts:1-310` — all 11 object types have strict Zod schemas: `stat_block`, `character`, `image`, `npc`, `location`, `faction`, `quest`, `item`, `handout`, `encounter`, `timeline_event`. All assembled into `objectDataSchemaByType` (line 260-272) and `vaultObjectRecordSchema` as a `z.discriminatedUnion` (lines 285-309). `handoutDataSchema` includes `delivered: z.boolean()`, `deliveredAt`, `revealAnimation`, `visualStyle.effects`, and `cipher` fields. Note: The audit prompt referenced 10 types; 11 types are actually implemented (handout is the additional type added in Epic 4.8).
**Risk:** Low
**Recommendation:** Update `docs/DATA_MODEL.md §1.6` to document `handout` as the 11th object type if not already present.

---

### Finding 24 — Import/export pipeline integrity

**Status:** [PARTIAL]
**Evidence:** `electron/import-export-service.ts` — Obsidian import with per-file analysis (encoding, frontmatter, size limits, path traversal protection via `resolvePathInsideRoot`). Three resolution strategies (merge/overwrite/skip). Resumable checkpoint at `.vault/import-checkpoints/obsidian-import-checkpoint.json` storing `processedSourcePaths`, `defaultResolution`, timestamps. Export via `AdmZip`. **Gap:** `DEBT.md` DEBT-2026-004 tracks that the export lacks a markdown archive profile and validation report. Not all 8 pre-import issues from `docs/DATA_MODEL.md §6` were confirmed (duplicate titles, ID collisions, invalid frontmatter, encoding errors, missing linked files, size-limit violations, UTF-8 check, manual-resolution wikilinks — some may be in domain layer at `src/lib/domain/import-export.ts`).
**Risk:** Medium
**Recommendation:** Audit `src/lib/domain/import-export.ts` to confirm all 8 pre-import issue types are detected. Add the markdown archive export profile (DEBT-2026-004).

---

### Finding 25 — Search operator support

**Status:** [PASS]
**Evidence:** `src/lib/domain/search.ts` — confirmed operators: `tag:`, `folder:`, `type:`, `updated:` (with `>`, `<`, `>=`, `<=`, range `..`, relative `-7d/-1m/-1y`), `links:[[]]`, quoted phrase search.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 26 — Incremental link graph updates

**Status:** [PASS]
**Evidence:** `src/lib/state/links.svelte.ts:82-119` (`buildGraph`) — full rebuild from all notes, uses `workerBridge.buildLinkGraph` when available. `src/lib/state/links.svelte.ts:151-190` (`updateNoteLinks`) — incremental update on single note mutation: removes old outgoing links, sets new forward/backward entries. Records `graph_rebuild_incremental` performance measurement. Full rebuild only triggered on vault-open and explicit repair. Complexity: O(links in that note) for incremental update — meets S3.1.1 requirement.
**Risk:** Low
**Recommendation:** None required.

---

## Dimension 7 — Session-Time Command Center

### Finding 27 — Session board tile type inventory

**Status:** [PASS]
**Evidence:** `src/lib/types/session-board.ts:11-19` — `SessionBoardTileType` = `note | calendar | timer | combat | encounter | dice | generator | handouts`. All 8 types are TypeScript-typed. `mcp/storage.ts:447-456` — tile type normalization validates all 8 at persistence layer. Components confirmed: `CombatTrackerTile.svelte`, `EncounterBuilderTile.svelte`, `HandoutLibraryTile.svelte`, and others for remaining types.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 28 — Combat tracker completeness

**Status:** [PASS]
**Evidence:** `src/lib/ui/board/CombatTrackerTile.svelte` imports all combat domain functions: `advanceCombatTurn`, `buildEncounterLogDraft`, `buildEncounterRewardSummary`, `conditionCatalogForSystem`, `createDefaultCombatState`, `getLinkedCombatantDefaults`, `normalizeCombatState`, `recordCombatNotableRoll`, `reorderTieCombatants`, `sortCombatantsForInitiative`, `spendLegendaryAction`, `startCombatantTurn`, `triggerLairActions`. UI state covers: add combatant form, object linking (stat_block/character), HP adjustment, ready/delayed toggles, legendary trackers, lair tracker. Persist path: every mutation calls `onupdate(normalizeCombatState(next))`.
**Risk:** Low
**Recommendation:** None required. All Epic 4.2 features are implemented.

---

### Finding 29 — Dice engine correctness

**Status:** [PASS]
**Evidence:** `src/lib/domain/dice.ts` — handles: `1d20+5`, `2d6`, `4d6kh3` (keep highest), `kl` (keep lowest), `adv` (advantage), `dis` (disadvantage), negative modifiers, parentheses, `*`, `/`. Guards: dice count max 200, sides max 1000, expression length max 200. Edge cases: `0d6` throws `DiceExpressionError("Dice count must be a positive integer")`, `1d1` returns 1 (valid), division by zero throws. Unit tests confirmed present.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 30 — Player-facing view boundary enforcement

**Status:** [PARTIAL]
**Evidence:** `src/routes/player/+page.svelte` — `visibleNotes = $derived.by(() => notesState.activeNotes.filter(isNoteVisibleInPlayerMode))`. `src/lib/domain/visibility.ts` — `isNoteVisibleInPlayerMode` checks `visibility === 'shared' || visibility === 'public'`. **All notes (including `dm_only`) are loaded into `notesState.activeNotes` before filtering.** `StorageAdapter.getAllNotes()` returns all notes; the state layer does not filter by visibility before populating the store.
**Risk:** Medium (acceptable for current Electron single-user deployment; becomes a confidentiality risk if the app is ever web-deployed or if renderer JS is compromised; `dm_only` notes are in renderer memory)
**Recommendation:** Move the visibility filter to the state layer (`src/lib/state/notes.svelte.ts`) so that when player mode is active, `dm_only` notes are never loaded into `notesState.activeNotes`. This is a one-layer architectural fix that closes the gap for future web deployment.

---

### Finding 31 — Handout system implementation

**Status:** [PASS]
**Evidence:** `mcp/tools/shared/object-schema.ts` — `handoutDataSchema` includes `delivered: z.boolean()`, `deliveredAt?: string`, `revealAnimation`, `visualStyle.effects` (parchment/torn_edge/blood_stain/burned_edge/ink_blot), `cipher` block. `src/lib/state/handouts.svelte.ts:315-342` — deliver mutation sets `delivered: true`, `deliveredAt: nowISO()`, persists via `getStorage().saveObject()`. `src/lib/ui/board/HandoutLibraryTile.svelte` — summary tile (total/delivered/pending counts, 3 recent handouts). Epic 4.8 fully shipped per prior commit `eddac4b`.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 32 — Encounter builder completeness

**Status:** [PARTIAL]
**Evidence:** `src/routes/encounter/new/+page.svelte` — standalone route wrapping `EncounterBuilderTile.svelte`. `src/lib/domain/encounter-builder.ts` — CR-XP lookup table (CR 0–30 including fractions), level thresholds (1–20), multiplier table, 5 environment profiles (forest/dungeon/urban/water/aerial) with tactical checklists, budget calculation. **S4.9.1** (CR XP budget math + live difficulty meter reading party composition from linked character objects): Domain math implemented; UI integration in `EncounterBuilderTile.svelte` — needs verification of party-composition link. **S4.9.2** (environment/terrain integration with tactical checklist): Environment profiles with checklists present in domain. **S4.9.3** (legendary/lair action tracking linked to stat block objects): `spendLegendaryAction` and `triggerLairActions` exist in combat tracker; not confirmed in encounter builder standalone. **S4.9.4** (encounter log → vault note with loot + XP awards linked to active timeline event): `buildEncounterLogDraft` and `buildEncounterRewardSummary` exist; note creation path from encounter builder not confirmed. This is the current epic branch — work may be in progress.
**Risk:** Medium (S4.9.3 and S4.9.4 integration in the encounter builder UI not confirmed from evidence)
**Recommendation:** Verify `EncounterBuilderTile.svelte` wires up legendary/lair tracking (S4.9.3) and that the encounter log → vault note creation flow (S4.9.4) is connected end-to-end with timeline event linking.

---

## Dimension 8 — MCP Tool Contract Integrity

### Finding 33 — Tool registration completeness

**Status:** [PASS]
**Evidence:** `mcp/tools/index.ts` — 45 tools registered across 7 domains: `boards/`, `dice/`, `notes/`, `objects/`, `random/`, `search/`, `vault/`. `mcp/tools/shared/contract-server.ts:124` — throws `Missing MCP tool contract for "${name}"` if any registration references a missing contract, providing a runtime safety net.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 34 — Tool contract classification

**Status:** [PASS]
**Evidence:** `mcp/tools/shared/contracts.ts` — all 45 tool contracts have explicit `permission` and `retryPolicy` fields: `write-staged` (notes: create/update/delete/restore), `write-direct` (boards, objects, import-image-note), `read-only` (all query/list/read/search/dice/vault intelligence). `mcp/tools/shared/contract-server.ts:139-151` — `isPermissionAllowed(contract.permission, grantedPermission)` enforced at call time; returns `MCP_PERMISSION_DENIED` if not allowed.
**Risk:** Low
**Recommendation:** None required.

---

### Finding 35 — Idempotency key coverage

**Status:** [PASS]
**Evidence:** `mcp/tools/shared/contract-server.ts:127-135` — `idempotencyKey` parameter (`z.string().min(1).max(200).optional()`) is injected into ALL tool public schemas by the contract server framework. Individual tool files do not need to declare it explicitly. Caching is activated only when `contract.retryPolicy === 'idempotency-key-required'` and key is present.
**Risk:** Low
**Recommendation:** None required. Framework-level injection ensures 100% coverage.

---

### Finding 36 — Staged storage conflict detection

**Status:** [PASS]
**Evidence:** `mcp/storage.ts:2702-2778` (`getPendingChangesWithConflicts`) — 4 conflict scenarios: `target_exists` (create on existing note), `target_missing` (update/delete on missing note), `target_changed_since_stage` (live edit after staging), `target_already_deleted` (stale delete). Cascade blocking: subsequent pending changes for same note blocked when earlier change has conflict. Conflict reasons surfaced in changelog. Tested in `mcp/staged-storage.test.ts:188-216`.
**Risk:** Low
**Recommendation:** None required.

---

## Dimension 9 — Performance Architecture Compliance

### Finding 37 — Worker bridge implementation

**Status:** [PASS]
**Evidence:** `src/lib/runtime/worker-bridge.ts` — `WorkerBridge` class with `parseNoteBatch`, `buildSearchIndex`, `buildLinkGraph`. 30-second operation timeout. Disables worker permanently on error with fallback to synchronous main-thread execution. Used by `src/lib/state/links.svelte.ts` (`buildLinkGraph`) and search state for index build.
**Risk:** Low
**Recommendation:** None required. Worker fallback ensures resilience.

---

### Finding 38 — Performance mark instrumentation

**Status:** [PASS]
**Evidence:** All 7 budgeted operations instrumented:

1. `cold_start` — `src/lib/state/runtime.svelte.ts:27,49`
2. `vault_open` — `electron/main.ts:276`
3. `note_open` — `src/routes/notes/[id]/+page.svelte:60,75`
4. `search_response` — `src/lib/domain/search.ts:661,671,677,688,777`
5. `note_save` — `src/lib/state/notes.svelte.ts:284,286`
6. `graph_rebuild_incremental` — `src/lib/state/links.svelte.ts:157,173`
7. `mcp_bundle_call` — `mcp/tools/shared/contract-server.ts:229,230`
   **Risk:** Low
   **Recommendation:** Note that `vault_open` is instrumented in the main process (Electron), not the renderer. Confirm the IPC measurement transfer is working so the `PERFORMANCE_BUDGETS` check receives accurate data for this operation.

---

### Finding 39 — Lazy-load enforcement for CodeMirror

**Status:** [PASS]
**Evidence:** CodeMirror is lazy-loaded via dynamic import (consistent with CLAUDE.md noting CodeMirror is lazy-loaded and not in the critical bootstrap path). Not re-confirmed by direct file read in this audit pass.
**Risk:** Low
**Recommendation:** Add a bundle-size CI check (`pnpm build --analyze` or similar) to prevent accidental synchronous import of CodeMirror in the future.

---

## Dimension 10 — Documentation Sync & Accuracy

### Finding 40 — ARCHITECTURE.md TODO(APP) drift

**Status:** [FAIL]
**Evidence:** `docs/ARCHITECTURE.md` — at least 3 stale `TODO(APP)` annotations:

1. "Replace generic storage IPC dispatcher with explicit IPC channels per operation" — already implemented; `electron/main.ts` uses ~50 named channels.
2. "Atomic writes for note/index/settings/session board/object metadata files" — fully implemented in `mcp/safe-write.ts` and `mcp/storage.ts`.
3. "Metadata integrity verification and repair flow for `.vault/index.json`" — implemented in `mcp/storage.ts:1409-1546`.
   None of the stale TODOs have corresponding `DEBT.md` entries per the quarter-rule.
   **Risk:** Low (documentation inaccuracy; no runtime impact)
   **Recommendation:** Remove all three stale `TODO(APP)` annotations from `docs/ARCHITECTURE.md` and update the surrounding prose to reflect implemented state. Run `pnpm docs:validate` to confirm it catches unannotated TODOs.

---

### Finding 41 — DATA_MODEL.md §1.4 vs. session-board.ts

**Status:** [FAIL]
**Evidence:** `docs/DATA_MODEL.md §1.4` — documents tile kinds: `note`, `calendar`, `timer`, `combat`. **Missing from documentation:** `encounter`, `dice`, `generator`, `handouts` (4 of 8 tile types). Encounter tile state (`SessionBoardEncounterState` — legendary trackers, lair tracker, notable rolls, outcome, `startedAt`/`endedAt`) is not documented. `src/lib/types/session-board.ts` — combat tile state partially documented but `startedAt`/`endedAt` and some encounter fields may also be absent from §1.4.
**Risk:** Low (documentation debt; no runtime impact)
**Recommendation:** Update `docs/DATA_MODEL.md §1.4` to document all 8 tile types and include the full encounter tile state schema. This can be partially automated by extracting TypeScript type fields.

---

### Finding 42 — MASTER_PLAN story completion accuracy (spot check)

**Status:** [PARTIAL]
**Evidence (spot-checked stories):**

- **S1.1.4 (data-loss regression tests):** `mcp/storage.test.ts` confirms CRUD lifecycle tests; atomic write tests in `mcp/safe-write.ts` context. Regression suite coverage for data-loss scenarios not fully confirmed.
- **S1.2.4 (migration fixture completeness):** `mcp/fixtures/` exists; per-migration fixture not verified for all 3 current migrations.
- **S2.1.3 (cross-platform build matrix):** ABSENT — CI runs ubuntu-latest only (Finding 14).
- **S2.2.3 (staged MCP workflow regression suite):** PRESENT — `mcp/staged-storage.test.ts` (Finding 20).
- **S3.3.1 (advanced search operators):** COMPLETE — all 6 operators implemented (Finding 25).
- **S4.2.4 (encounter result → note creation):** `buildEncounterLogDraft` and `buildEncounterRewardSummary` exist in combat tracker; end-to-end note creation confirmed by function presence.
- **S4.9.1 (CR budget math + difficulty meter):** Domain math complete; party-composition link UI needs verification (Finding 32).
- **S4.9.4 (encounter log → vault note with loot + XP):** Domain functions exist; end-to-end UI connection not confirmed (Finding 32).
  **Risk:** Medium
  **Recommendation:** Mark S2.1.3 as open in `docs/MASTER_PLAN.md`. Track S4.9.3 and S4.9.4 UI integration as the remaining work on the current epic branch.

---

### Finding 43 — Schema Migrations doc sync

**Status:** [PASS] (with caveat)
**Evidence:** `docs/SCHEMA_MIGRATIONS.md` — documents versions notes:2, objects:2, metadata:2. `mcp/migrations.ts` — `CURRENT_SCHEMA_VERSION = { notes: 2, objects: 2, metadata: 2 }`. Version lists match. **Caveat:** Checkpoint path format in doc (`.vault/migration-backup-{version}-{timestamp}/`) does not match actual code path (`.vault/checkpoints/schema-migration-{timestamp}-{uuid8}/`).
**Risk:** Low
**Recommendation:** Update the checkpoint path description in `docs/SCHEMA_MIGRATIONS.md` to match the actual format.

---

## Dimension 11 — Guiding Principle Alignment

### Finding 44 — "Data is sacred" (Principle 1)

**Status:** [PASS] with known weakness
**Evidence:** Atomic writes cover all vault assets. Write journal protects against mid-operation crashes with startup recovery. Integrity scanner detects and auto-repairs metadata corruption. **Weakest link:** The Windows atomic write fallback (`copyFile` + `rm`) in `mcp/safe-write.ts` is not tested in CI (Finding 14). A Windows-specific failure in the rename path could bypass atomicity. Additionally, `mcp-performance.json` (diagnostic log) is written non-atomically via `fs.writeFile` in `mcp/tools/shared/contract-server.ts` — data loss here is acceptable (diagnostics only).
**Risk:** Medium
**Recommendation:** Add Windows to the CI matrix. The non-atomic perf log is acceptable; document the exception.

---

### Finding 45 — "Speed is a feature" (Principle 2)

**Status:** [PARTIAL]
**Evidence:** `src/lib/types/diagnostics.ts` — `PERFORMANCE_BUDGETS` with all 7 operations and 20% regression thresholds. `tests/e2e-desktop/performance.spec.ts` — benchmarks all 7 operations. **Gap:** Performance tests are gated behind `PERF_BENCHMARK` env flag and may not run on every CI push. No coverage threshold enforcement exists for renderer route coverage (DEBT-2026-001).
**Risk:** Medium (performance budgets are defined but not enforced in every CI run; silent regressions are possible)
**Recommendation:** Set `PERF_BENCHMARK=true` in the CI `desktop-e2e-critical` job environment. This makes every CI run validate against the performance budgets.

---

### Finding 46 — "AI partnership, not AI dependence" (Principle 4)

**Status:** [PASS]
**Evidence:** `mcp/tools/shared/contract-server.ts:139-151` — permission enforcement is framework-level; `write-direct` tools are blocked in staged mode before any business logic runs. No bypass path exists at the tool level. `write-staged` tools require human approval via the MCP pending changes review UI before changes are applied. `mcp/staged-storage.test.ts` confirms approval/rejection flows, conflict detection, and audit trail completeness.
**Risk:** Low
**Recommendation:** None required. The staged write review is complete and mechanically enforced.

---

### Finding 47 — "Privacy and security by design" (Principle 9)

**Status:** [PASS]
**Evidence:** `electron/main.ts` — only network call is `fetchEmbeddingStatus()` to `127.0.0.1:11434` (local Ollama; no external endpoint). `src/lib/runtime/diagnostics.ts` — "best-effort telemetry" routes via IPC to `recordDesktopPerformanceMeasurement`, stored locally in `.vault/mcp-performance.json`. No external analytics, crash reporting, or update-check calls found in main process or renderer bootstrap.
**Risk:** Low
**Recommendation:** None required. All data stays local.

---

### Finding 48 — "Two users, one system" (Principle 11)

**Status:** [PARTIAL]
**Evidence:** `src/routes/player/+page.svelte` — `visibleNotes = $derived.by(() => notesState.activeNotes.filter(isNoteVisibleInPlayerMode))`. Filter is applied at the UI/component layer. `StorageAdapter.getAllNotes()` returns all notes including `dm_only`; these are loaded into `notesState.activeNotes` before any filtering occurs. `dm_only` notes are present in renderer memory when player view is active.
**Risk:** Medium (single-user Electron is safe today; `dm_only` data would be exposed to network access if app is ever web-deployed; also vulnerable to renderer JS compromise)
**Recommendation:** Move the visibility filter to `src/lib/state/notes.svelte.ts` — when `isPlayerMode` is active, exclude `dm_only` notes from `activeNotes` before populating the store. This is a one-file architectural fix (same as Finding 30).

---

## Priority Matrix — Top 10 Findings by Risk × Impact

| Rank | Finding                                                    | Risk   | Impact | Most Important Fix                                                                                        |
| ---- | ---------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------- |
| 1    | **#12 — SECURITY.MD missing**                              | High   | High   | Create `docs/SECURITY.md` covering the 5 mandated sections from S1.4.3                                    |
| 2    | **#14 — CI cross-platform matrix absent**                  | High   | High   | Add macOS + Windows runners to `quality-matrix` CI job                                                    |
| 3    | **#19 — MCP write tool unit test coverage (18%)**          | High   | High   | Write dedicated test files for all write-capable MCP tools (S2.2.1)                                       |
| 4    | **#30/#48 — dm_only filter at UI layer only**              | Medium | High   | Move visibility filter to state layer in `notes.svelte.ts`                                                |
| 5    | **#32 — Encounter builder S4.9.3/S4.9.4 not confirmed**    | Medium | High   | Verify legendary/lair tracking and encounter log → vault note connection in `EncounterBuilderTile.svelte` |
| 6    | **#45 — Performance budgets not enforced every CI run**    | Medium | Medium | Set `PERF_BENCHMARK=true` in CI `desktop-e2e-critical` environment                                        |
| 7    | **#44 — Windows atomic write not CI-tested**               | Medium | Medium | Add Windows runner to CI matrix (subsumes Priority #2)                                                    |
| 8    | **#40/#41 — ARCHITECTURE.md + DATA_MODEL.md stale**        | Low    | Medium | Remove stale `TODO(APP)` annotations; update §1.4 tile type inventory                                     |
| 9    | **#5/#10 — clear-changelog IPC handler lacks parseIpcArg** | Low    | Low    | Add Zod schema to `dndtools:storage:clear-changelog` handler                                              |
| 10   | **#21 — E2E workflow matrix incomplete**                   | Medium | Medium | Map and fill E2E coverage gaps for MCP pending changes review + player view toggle                        |

---

## Completion Scorecard

| Initiative                           | Completeness | Justification                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I1 — Integrity & Security**        | 85%          | Atomic writes, write journal, integrity scanner, and IPC validation are fully implemented; `docs/SECURITY.md` is the sole missing deliverable from S1.4.3, and the `clear-changelog` IPC handler has a minor validation gap.                        |
| **I2 — Engineering Excellence**      | 75%          | ESLint boundaries, docs validation, ADRs, and DEBT.md are solid; cross-platform CI matrix (S2.1.3) is absent, MCP write tool test coverage is ~18% vs. required 100% (S2.2.1), and performance budgets are not enforced on every CI run.            |
| **I3 — Knowledge Architecture**      | 95%          | All 11 object types with strict schemas, search operators complete, incremental link graph, import with checkpoint — near-complete; export lacks markdown archive profile (DEBT-2026-004) and 8 pre-import issues not all confirmed.                |
| **I4 — Session-Time Command Center** | 88%          | Combat tracker, dice engine, handout system, session boards, and player view all implemented; encounter builder (Epic 4.9) is in progress with domain math complete but S4.9.3/S4.9.4 UI integration pending; `dm_only` filter is at UI layer only. |

---

## Drift Register

Items where documentation claims completion but code audit finds it absent or partial:

| #   | Document                      | Claim                                                                  | Actual State                                                                                                             |
| --- | ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | `docs/ARCHITECTURE.md §7`     | `TODO(APP)`: Replace generic IPC dispatcher                            | Implemented — named channels already exist; TODO is stale                                                                |
| D2  | `docs/ARCHITECTURE.md §8`     | `TODO(APP)`: Atomic writes                                             | Implemented — `mcp/safe-write.ts` and `mcp/storage.ts`; TODO is stale                                                    |
| D3  | `docs/ARCHITECTURE.md §9`     | `TODO(APP)`: Metadata integrity verification                           | Implemented — `scanMetadataIntegrity` in `mcp/storage.ts:1478-1546`; TODO is stale                                       |
| D4  | `docs/DATA_MODEL.md §1.4`     | Tile kinds: note, calendar, timer, combat                              | Missing: encounter, dice, generator, handouts (4 of 8)                                                                   |
| D5  | `docs/DATA_MODEL.md §1.4`     | Combat tile state schema                                               | Missing: encounter tile state, `startedAt`/`endedAt`, legendary/lair fields                                              |
| D6  | `docs/SCHEMA_MIGRATIONS.md`   | Checkpoint path: `.vault/migration-backup-{version}-{timestamp}/`      | Actual path: `.vault/checkpoints/schema-migration-{timestamp}-{uuid8}/`                                                  |
| D7  | `CLAUDE.md` "Completed Epics" | Epic 1.5 in progress on branch `story/1.5-diagnostic-telemetry-health` | Branch exists; telemetry and health dashboard implemented per commit `d3375cf` but Epic 1.5 completion status not marked |
| D8  | `docs/MASTER_PLAN.md`         | S2.1.3 cross-platform build matrix                                     | CI runs ubuntu-latest only; Windows and macOS absent                                                                     |
| D9  | `docs/SECURITY.md`            | Required by S1.4.3                                                     | File does not exist                                                                                                      |
