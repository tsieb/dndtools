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

- `electron/main.ts` vault selection/bootstrap preflight
- `src/lib/runtime/bootstrap.ts` runtime preflight

Both paths fail fast if migration is required but cannot be completed successfully.

---

## Story Implementation Status (Epic 1.2)

> Status key: ✅ Complete | 🔄 Partial | ❌ Not started
> An executing agent must verify each item against the actual implementation and update this table.

| Story  | Description                                  | Status | Notes                                                                                                                                                               |
| ------ | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1.2.1 | Schema versioning contract                   | 🔄     | Version keys defined above; policy doc exists; verify app refuses vault with newer schema than supported                                                            |
| S1.2.2 | Migration runner with dry-run mode           | 🔄     | `mcp/migrations.ts` implements `getSchemaMigrationReport` and `runSchemaMigrations`; verify dry-run path is exercised and report surfaced in UI                     |
| S1.2.3 | Rollback checkpoint and restore              | 🔄     | Checkpoint backup path implemented; verify Settings → System Health one-click restore UI exists                                                                     |
| S1.2.4 | Migration integration test fixtures          | 🔄     | `mcp/fixtures/` and `mcp/migrations.integration.test.ts` exist; verify fixture coverage for each version bump                                                       |
| S1.2.5 | "Vault upgrade required" bootstrap guardrail | 🔄     | Electron and renderer bootstrap enforced (see above); verify user-visible migration readiness screen with dry-run preview, backup status, and apply/cancel controls |
