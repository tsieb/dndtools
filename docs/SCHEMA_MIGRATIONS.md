# Schema Migrations

This document defines the schema versioning and migration policy for notes, objects, and `.vault` metadata.

## Version Targets

- Note schema version key: frontmatter `dndtoolsSchemaVersion`
- Object schema version key: frontmatter `dndtools.object.schemaVersion`
- Metadata schema version key: top-level `version` in `.vault/*.json`

Current target versions are defined in `mcp/migrations.ts`:

- notes: `2`
- objects: `2`
- metadata: `2`

## Policy

1. Every persistent schema change must bump the relevant target version in `mcp/migrations.ts`.
2. Every schema bump must include:
   - a migration step with dry-run support
   - checkpoint-backed rollback behavior
   - integration tests against realistic fixture vaults
3. Desktop startup must guard against stale schemas by running migration preflight and applying required migrations before normal runtime initialization.

## Engine Behavior

The migration engine is implemented in `mcp/migrations.ts` and provides:

- `getSchemaMigrationReport(vaultDir)` for dry-run analysis
- `runSchemaMigrations(vaultDir, options)` for applying migrations

Report output includes:

- changed files
- step-by-step pending/applied counts
- warnings
- failures
- checkpoint directory (when created)
- rollback flag

## Rollback and Checkpoints

When applying migrations with checkpoints enabled:

- backups are written under `.vault/checkpoints/schema-migration-<timestamp>-<id>/`
- on failure, touched files are restored from checkpoint
- newly created files are removed during rollback

## Desktop Guardrail

Electron bootstrap enforces migration guardrails in two places:

- `electron/main.ts` vault selection/bootstrap preflight — blocks vault-too-new and auto-migrates on vault change
- `src/lib/runtime/bootstrap.ts` runtime preflight — throws `MigrationRequiredError` when upgrade is needed; re-throws on vault-too-new

`RuntimeState` (`src/lib/state/runtime.svelte.ts`) intercepts `MigrationRequiredError` and exposes:

- `migrationReport` — the dry-run report (shown in the readiness screen)
- `applyMigration()` — applies the migration after user approval and re-bootstraps

`+layout.svelte` renders `MigrationReadinessScreen` when `migrationReport` is non-null, blocking all vault access until the user approves or cancels.

---

## Migration Checkpoints (Restore Path)

Checkpoints are created under `.vault/checkpoints/schema-migration-<timestamp>-<id>/`.

`FileSystemAdapter` exposes:

- `listMigrationCheckpoints()` — scans for checkpoint directories
- `restoreMigrationCheckpoint(name)` — copies backed-up files back and reloads in-memory state

IPC: `dndtools:schema:list-checkpoints` / `dndtools:schema:restore-checkpoint`
Bridge: `listDesktopMigrationCheckpoints()` / `restoreDesktopMigrationCheckpoint(name)`
UI: Settings → System Health → "Schema Migration Checkpoints" section

---

## Story Implementation Status (Epic 1.2)

> Status key: ✅ Complete | 🔄 Partial | ❌ Not started

| Story  | Description                                  | Status | Notes                                                                                                                                                                                                                                                                                          |
| ------ | -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1.2.1 | Schema versioning contract                   | ✅     | Version keys defined; policy doc exists; `vaultTooNew` detection in `mcp/migrations.ts`; `electron/main.ts` and `bootstrap.ts` refuse vaults with schema newer than `CURRENT_SCHEMA_VERSION`                                                                                                   |
| S1.2.2 | Migration runner with dry-run mode           | ✅     | `getSchemaMigrationReport` (dry-run) and `runSchemaMigrations` implemented in `mcp/migrations.ts`; UI surfaces the dry-run report in `MigrationReadinessScreen` before any write is attempted                                                                                                  |
| S1.2.3 | Rollback checkpoint and restore              | ✅     | Checkpoint backup on every migration run; rollback on failure; `listMigrationCheckpoints` + `restoreMigrationCheckpoint` on `FileSystemAdapter`; IPC handlers + bridge functions; one-click restore UI in Settings → System Health → "Schema Migration Checkpoints"                            |
| S1.2.4 | Migration integration test fixtures          | ✅     | `mcp/fixtures/schema-v1/` fixture vault; `mcp/migrations.integration.test.ts` covers dry-run, apply+checkpoint, adapter init, `vaultTooNew` (metadata version), `vaultTooNew` (note frontmatter version), no-apply when too-new, and rollback-on-failure (via `writeJsonAtomic` mock)          |
| S1.2.5 | "Vault upgrade required" bootstrap guardrail | ✅     | `bootstrap.ts` throws `MigrationRequiredError` instead of auto-applying; `RuntimeState` exposes `migrationReport` + `applyMigration()`; `MigrationReadinessScreen` component renders dry-run preview, backup notice, warnings, and Apply/Cancel controls; `+layout.svelte` gates on this state |
