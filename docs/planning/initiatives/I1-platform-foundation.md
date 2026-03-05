# Initiative 1 — Platform Foundation & Trust

**Outcome:** Every byte written by the application is safe from crash, corruption, and
undetected decay. The schema evolves predictably. The IPC surface is audited and narrow.
DMs can trust this application with campaigns they have worked on for years.

**Why first:** Without data integrity, nothing else matters. A DM who loses three
sessions of notes will never use this tool again.

---

## Epic 1.1 — Atomic Filesystem Writes

**Goal:** Eliminate all scenarios where a crash, power interruption, or process kill can
produce a partial or corrupted file in the vault.

**Stories:**

- **S1.1.1 — Safe write primitive for note files**
  Implement `safeWriteFile(path, content)` using a temp-file + fsync + atomic rename
  pattern in `mcp/storage.ts`. All note writes must go through this primitive. No direct
  `writeFile` call remains for vault-owned paths.

- **S1.1.2 — Safe write for `.vault/*.json` metadata files**
  Apply the same atomic write strategy to `index.json`, `settings.json`,
  `session-boards.json`, `objects.json`, `object-history.json`, and
  `mcp-changelog.json`. Each metadata file gets its own write helper that validates the
  new JSON parses correctly before committing the rename.

- **S1.1.3 — Write-ahead journal for in-flight operations**
  Add a lightweight crash journal (`/.vault/write-journal.json`) that records the
  intent of an operation before it begins and is cleared on successful commit. On startup,
  replay or rollback any incomplete journal entries before loading the vault.

- **S1.1.4 — Data-loss regression test suite**
  Add a test fixture that simulates mid-write process kill for each file category (note,
  index, settings, changelog) and asserts that the vault loads correctly and the previous
  state is recovered. This suite must run in CI and block merges on failure.

---

## Epic 1.2 — Schema Migration Engine

**Goal:** Vault schema changes are applied predictably, reversibly, and with a complete
audit trail. No migration is silent; no migration is irreversible without a checkpoint.

**Stories:**

- **S1.2.1 — Schema versioning contract**
  Define a `schemaVersion` field in `.vault/index.json` and a canonical policy doc in
  `docs/SCHEMA_MIGRATIONS.md`. Every schema shape change bumps a version. The app
  refuses to open a vault with a newer schema than it understands.

- **S1.2.2 — Migration runner with dry-run mode**
  Implement `mcp/migrations.ts` as the authoritative migration runner. Support
  `--dry-run` to produce a report of what would change without writing anything. The UI
  shows this report before applying any migration.

- **S1.2.3 — Rollback checkpoint and restore**
  Before any migration runs, capture a complete vault snapshot to
  `.vault/checkpoints/schema-migration-{timestamp}-{id}/`. Add a one-click restore path
  accessible from Settings → System Health if the migration fails or the user regrets
  the upgrade.

- **S1.2.4 — Migration integration test fixtures**
  For every schema version bump, add a fixture vault in `mcp/fixtures/` at the old
  schema version and an assertion that migrating it produces the expected output.
  Migration tests must be deterministic and runnable without a running Electron shell.

- **S1.2.5 — "Vault upgrade required" bootstrap guardrail**
  When the app detects a schema version mismatch at startup, gate all vault operations
  and show a clear migration readiness screen with dry-run preview, backup status, and
  apply/cancel controls before any reads or writes proceed.

---

## Epic 1.3 — Integrity Verification & Self-Repair

**Goal:** The app proactively detects and guides recovery from vault corruption, stale
indexes, and metadata inconsistencies — before they become user-visible data loss.

**Stories:**

- **S1.3.1 — Startup integrity scanner**
  At bootstrap, run a fast structural validity check on all `.vault/*.json` files:
  parse as JSON, validate required fields, check cross-reference consistency between
  `index.json` note IDs and files on disk. Surface a warning badge in the status bar
  if any check fails; never silently proceed with a known-bad state.

- **S1.3.2 — Note checksum validation**
  Store a content hash alongside each note entry in `index.json`. On read, verify the
  hash matches the file contents. On write, update the hash atomically. Add a CLI
  command `pnpm vault:verify` that walks the vault and reports any checksum mismatches
  without writing anything.

- **S1.3.3 — "Repair Vault" workflow in Settings**
  Add a Settings → System Health → Repair flow that runs the full integrity scan, shows
  a structured report of all detected issues grouped by severity, and offers one-click
  automatic repair for recoverable issues (rebuild index, clear stale changelog entries)
  with manual guidance for issues that need user decisions.

- **S1.3.4 — Automated backup cadence**
  Add backup settings (hourly/daily/on-close/manual) that snapshot the vault to a
  configurable local directory. Include a restore browser in Settings that lists
  available snapshots with size, date, and health status. "Safety snapshot" is also
  offered before any high-risk operation (bulk import, mass delete, migration).

---

## Epic 1.4 — IPC Hardening & Security Model

**Goal:** The Electron IPC surface is minimal, typed, explicitly validated, and
documented in a threat model. No generic dispatch patterns remain.

**Stories:**

- **S1.4.1 — Replace generic storage IPC dispatcher**
  Remove the `dndtools:storage` dynamic method dispatch. Replace with explicitly named
  IPC channels (one per `StorageAdapter` method) declared in a shared type contract
  imported by both `electron/main.ts` and `src/lib/platform/storage/electron-adapter.ts`.
  Every handler is individually registered and individually validated.

- **S1.4.2 — IPC payload schema validation**
  Add Zod schemas for every IPC request and response payload. Validation runs in the
  main process handler before any business logic executes. Invalid payloads return a
  structured error without crashing the main process.

- **S1.4.3 — Threat model document**
  Write `docs/SECURITY.md` covering: vault filesystem attack surface, IPC injection
  vectors, MCP sidecar trust boundary, local-only vs cloud-connected threat profiles,
  and mitigation status for each. Include a risk register with owner and remediation
  target for any open items.

- **S1.4.4 — Security regression test suite for IPC**
  Add tests that assert: oversized payloads are rejected, path traversal attempts in
  file paths are blocked, unexpected method names on dynamic handlers are rejected,
  and renderer cannot invoke privileged operations not exposed in preload.

---

## Epic 1.5 — Diagnostic Telemetry & Health Dashboard

**Goal:** Operators and users can understand the runtime health of the application at any
moment and export a structured diagnostics bundle that accelerates support resolution.

**Stories:**

- **S1.5.1 — Structured error taxonomy across all subsystems**
  Complete `src/lib/domain/error-taxonomy.ts` to cover storage, IPC, MCP sidecar, UI
  runtime, and markdown pipeline error categories. Every thrown error in the app maps
  to a taxonomy entry with a code, human message, recovery hint, and severity level.

- **S1.5.2 — System Health settings page**
  Build Settings → System Health as a first-class page showing: subsystem status grid
  (storage, search index, link graph, MCP sidecar, sync), last successful operation
  timestamps per subsystem, and actionable fix links for any failed state.

- **S1.5.3 — Diagnostics bundle export**
  Add "Export Diagnostics" to the health page. The bundle includes: structured log tail,
  runtime environment metadata, vault health scan results, subsystem timestamps, and
  MCP sidecar status — with all user content redacted. The bundle is a timestamped zip
  suitable for attaching to a GitHub issue.

- **S1.5.4 — MCP sidecar lifecycle telemetry**
  In `electron/mcp-sidecar.ts`, record all lifecycle events (spawn, ready, restart,
  crash + exit code + reason) to a rotating in-memory ring buffer and persist the last
  N events to `.vault/sidecar-log.json`. Surface these in the System Health page with
  a "View sidecar log" expander.

---

---
