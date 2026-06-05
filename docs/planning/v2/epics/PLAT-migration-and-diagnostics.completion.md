# PLAT-migration-and-diagnostics - Completion Evidence

Epic packet: `docs/planning/v2/epics/PLAT-migration-and-diagnostics.yaml`
Workpack status: `complete` after
`pnpm v2:workpack:complete -- --epic PLAT-migration-and-diagnostics`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **PLAT-008**, **PLAT-009**, **PLAT-017**.

## Summary

This epic delivers the PLAT "migration and diagnostics" capability branch: vault/durable-state
migration with dry-run, integrity verification, safety snapshots, and write-ahead recovery
(PLAT-008); a DM/admin diagnostics surface with redacted, permission-gated support bundles
(PLAT-009); and a participant-safe status surface that never leaks DM diagnostics, secrets, paths,
or hidden content (PLAT-017). All decisions — schema classification, recovery action, health
derivation, redaction, and the permission/visibility boundary — are pure Processing-Core functions;
Platform Services derive raw facts and perform storage writes the core asks for, and the GUI only
renders the returned, already-filtered models (Contract 1).

Core (`@dndtools/v2-core`):

- `apps/v2/packages/core/src/migration/schema-versions.ts` — the six durable state documents (`scenes`, `maps`,
  `permissions`, `session`, `widgets`, `commandCenter`) and their build-target schema versions,
  derived from each state module's `*_SCHEMA_VERSION`. The sync operation log carries its own
  per-operation version and is replayed, not migrated, so it is excluded.
- `apps/v2/packages/core/src/migration/dry-run.ts` (PLAT-008 AC1) — `planMigration(persistedVersions)` classifies each
  document (`current` / `absent` / `needs-upgrade` / `unknown-version` / `future-version`) and
  returns the required changes **and** blocking issues before any mutation. Fails closed: a
  future-build version or an unreadable/below-minimum version is a **blocking issue with
  remediation**, never a silent upgrade (Contract 2 Sync Security rule 5).
- `apps/v2/packages/core/src/migration/integrity.ts` (PLAT-008) — `verifyIntegrity(records)` flags a partially written
  (mid-write) vault, a missing schema version, or an unreadable payload. A fully fresh or fully
  present vault is consistent; a mix is the corruption state.
- `apps/v2/packages/core/src/migration/write-ahead.ts` (PLAT-008 AC2) — `beginMigration` captures a **safety snapshot**
  of the pre-migration documents and writes a write-ahead journal entry in phase `pending` before
  any mutation; `markCommitting`/`markCommitted` advance it. `recoverFromJournal(entry)` is the pure
  restart decision: `pending` → clear (nothing written), `committing` → **roll back to the snapshot**
  (a mid-write crash), `committed`/`rolled-back` → clear.
- `apps/v2/packages/core/src/diagnostics/redaction.ts` (PLAT-009 AC2 / PLAT-017 AC3) — `redactValue` recursively redacts
  secret-named keys, absolute filesystem paths, file URLs, and bearer tokens by default;
  `includeSecrets` returns raw values only on explicit user opt-in. `containsSensitiveData` is the
  fail-closed assertion used in tests.
- `apps/v2/packages/core/src/diagnostics/health.ts` — shared diagnostics inputs and `deriveHealthLevel`
  (`healthy`/`degraded`/`unhealthy`) plus per-source remediation.
- `apps/v2/packages/core/src/diagnostics/dm-diagnostics.ts` (PLAT-009) — `getDmDiagnostics` (system health, sync/source
  status + remediation, capability status, schema/migration health) and `exportSupportBundle`
  (redacted by default; `includeSecrets` opt-in). Both fail closed: `actorCanViewDmDiagnostics`
  allows only the DM or an actor holding the explicit `diagnostics-admin` grant on the
  `diagnostics/system` entity; everyone else is `denied`.
- `apps/v2/packages/core/src/diagnostics/participant-status.ts` (PLAT-017) — `getParticipantStatus` returns a
  participant-only view: connection (`live`/`reconnecting`/`offline`/`stale`/`unavailable`), sync,
  session delivery, and per-capability availability, each with a **generic, action-oriented**
  message. It drops every DM-facing capability detail and never includes a source id, path, hidden
  entity name, or DM diagnostic. The DM is denied this surface (`not-a-participant`).
  `toParticipantSafeSummary` reduces the view for safe embedding in a DM bundle (PLAT-017 AC3).

App (`@dndtools/v2-app`):

- `apps/v2/app/src/lib/platform/storage/scene-store.ts` — adds a Dexie `migrationJournal` table (DB version 2,
  preserving v1 stores), `writeMigrationJournal`, and `recoverPendingMigration`, which applies the
  core's recovery decision to real storage: a `roll-back` restores every snapshot document, others
  clear the journal. `loadCoreState` runs recovery **before** trusting persisted documents (PLAT-008
  AC2). `resetCoreStorage` also clears the journal.
- `apps/v2/app/src/lib/platform/diagnostics-context.ts` — derives the `DiagnosticsContextInput` from the runtime
  slice + platform profile: the local-vault sync source, capability availability (local storage /
  filesystem / cloud-sync deferred), and schema health computed via the core migration planner so
  diagnostics and dry-run agree.
- `apps/v2/app/src/lib/gui/DiagnosticsPanel.svelte` (PLAT-009) — DM-facing panel: health, sync/source status +
  remediation, capabilities, schema/migration, and a support-bundle export with an explicit
  "include raw secrets and paths" opt-in. Fails closed via `getDmDiagnostics`/`exportSupportBundle`.
- `apps/v2/app/src/lib/gui/ParticipantStatusPanel.svelte` (PLAT-017) — participant-facing status panel; renders
  only the core's participant-safe view.
- `apps/v2/app/src/routes/settings/+page.svelte` — mounts the DM panel for the DM and the participant panel for
  players/observers on the PLAT-owned, all-roles `/settings` route. Rendering by role here is an
  ergonomic hint; the authoritative permission and redaction enforcement is in the core.

The diagnostics surfaces live on the existing `/settings` section (owner `PLAT`) rather than a new
top-level route, so the NAV-owned canonical IA registry and route audit are untouched (no cross-epic
churn) while the fail-closed core gates still enforce role correctness.

## Demo Path

Run `pnpm v2:dev` from the repo root and open the app (dev port 5183; preview/e2e port 4183). Open
**Settings** (`/settings/`).

1. **DM diagnostics + redacted support bundle (PLAT-009 AC1/AC2).** As the default DM, the Settings
   page shows **System health & diagnostics**: a health level, the Local Vault sync source with its
   state/remediation, platform capabilities (local persistence available; filesystem and cloud sync
   unsupported in the prototype), and schema/migration health per document. Click **Generate support
   bundle** — the JSON shows `Secrets included: no (redacted)` and contains no absolute path or
   secret value. Tick **Include raw secrets and paths** and regenerate — `Secrets included: yes`.
2. **Diagnostics denied to participants (PLAT-009 AC3).** Switch **View as → Demo Player** (or an
   observer). The DM diagnostics panel and the **Generate support bundle** button are gone; the
   `getDmDiagnostics`/`exportSupportBundle` core gate returns `denied` for any non-DM actor without
   an explicit `diagnostics-admin` grant.
3. **Participant-safe status (PLAT-017 AC1/AC2).** As the Demo Player, Settings shows **Your session
   status**: connection, sync, shared-content delivery, and on-device feature availability, each with
   a generic, action-oriented message. No source path, hidden entity name, or DM diagnostic appears.
   Take the browser offline (or with no active session) to see `offline` / `unavailable` states.
4. **Migration dry-run + write-ahead recovery (PLAT-008).** Exercised by tests: `planMigration`
   reports required changes/blocking issues before mutation; a `committing` write-ahead journal makes
   `loadCoreState` roll the persisted Scene document back to its pre-migration snapshot on the next
   start (`migration-recovery.test.ts`).

Playwright spec `diagnostics.spec.ts` drives steps 1–3 on desktop and mobile Chromium.

## Requirement Traceability

| Requirement                                                                                                                                   | Implementation                                                                                                                                                                                                 | Test evidence                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PLAT-008** — migration, integrity verification, safety snapshots, write-ahead recovery, and dry-run upgrade checks for vault/durable state  | Core `migration/{schema-versions,dry-run,integrity,write-ahead}.ts`; app `scene-store.ts` journal table + `recoverPendingMigration` + recovery-on-load; `diagnostics-context.ts` schema health via the planner | Core `migration.test.ts` (dry-run required changes + fail-closed blocking; integrity fresh/full/partial/unreadable; write-ahead pending/committing/committed/rolled-back recovery). App `migration-recovery.test.ts` (Dexie roll-back to snapshot on restart; pending clear; clean no-op).                                                                                    |
| **PLAT-009** — DM/admin system health, diagnostics, sync/source status, capability status, exportable support bundles without leaking secrets | Core `diagnostics/{health,dm-diagnostics,redaction}.ts`; app `DiagnosticsPanel.svelte`, `diagnostics-context.ts`, Settings page                                                                                | Core `dm-diagnostics.test.ts` (health from failed source/migration/blocked schema; deny player/observer/unknown for view + export; allow on explicit grant; reject wrong grant; redact secrets+paths by default; opt-in raw). E2e `diagnostics.spec.ts` (DM sees health/sources/capabilities/schema; default redacted bundle, opt-in raw).                                    |
| **PLAT-017** — participants view non-leaking connection/sync/capability/delivery status without DM diagnostics or support bundles             | Core `diagnostics/participant-status.ts` (+ `toParticipantSafeSummary` for bundle embedding); app `ParticipantStatusPanel.svelte`, Settings page                                                               | Core `participant-status.test.ts` (live/offline/stale/reconnecting/unavailable; generic messages, no path/name leak; dropped capability detail; pending delivery hides scene id; DM denied, observer served, unknown denied; AC3 bundle summary has no actor id/secrets). E2e `diagnostics.spec.ts` (player sees own status; no DM panel/export/bundle; no path/secret leak). |

### Acceptance criteria

- **PLAT-008 AC1** — "a vault needs migration → dry-run returns required changes and blocking issues
  before mutation." `planMigration` returns `requiredChanges` and `blockingIssues` without touching
  storage; covered by `migration.test.ts` (needs-upgrade required change; future/unknown version is a
  blocking issue with remediation and is excluded from required changes).
- **PLAT-008 AC2** — "migration fails mid-write → restart restores a consistent state via write-ahead
  recovery or rollback." `recoverFromJournal` returns `roll-back` for a `committing` journal;
  `recoverPendingMigration` restores the snapshot documents; `loadCoreState` runs it before trusting
  state. Covered at unit level (core `recoverFromJournal`; app Dexie `migration-recovery.test.ts`
  restores the pre-migration Scene after a clobbering write).
- **PLAT-009 AC1** — "a sync source fails → system health shows source status and remediation."
  `getDmDiagnostics` returns `unhealthy` with the source state and `remediation`; covered by
  `dm-diagnostics.test.ts` and the e2e source list.
- **PLAT-009 AC2** — "diagnostics exported → secrets and raw absolute paths redacted unless explicitly
  included." `exportSupportBundle` redacts by default and includes raw values only with
  `includeSecrets`; covered by core unit (env token/path redacted; source detail path redacted; raw
  on opt-in) and e2e (default bundle has no `/Users/` or `sk-secret`; opt-in toggles to `yes`).
- **PLAT-009 AC3** — "a player or observer requests a support bundle → denied unless an explicit
  DM/admin diagnostic grant exists." `exportSupportBundle`/`getDmDiagnostics` deny non-DM actors;
  allow only with the `diagnostics-admin` grant on `diagnostics/system`; covered by core unit (deny
  player/observer/unknown; allow on grant; reject wrong-capability grant) and e2e (no export control
  for a player).
- **PLAT-017 AC1** — "a disconnected/stale player opens status → reconnecting/offline/stale/unavailable
  without hidden entity names, source paths, or DM diagnostics." `getParticipantStatus` derives these
  states with generic messages; covered by core unit (each state; no leak) and e2e.
- **PLAT-017 AC2** — "a handout/projection/source unavailable to a participant → a generic,
  action-oriented reason without revealing whether hidden content exists." Delivery is `pending` with
  a generic message; the hidden scene id never appears; capability detail is dropped. Covered by core
  unit (`scene-secret` absent; generic note) and e2e.
- **PLAT-017 AC3** — "the DM exports diagnostics with participant-safe status → excludes secrets, raw
  paths, hidden titles, and private player content by default." `toParticipantSafeSummary` drops the
  actor id and capability detail; the bundle embeds only generic summaries; covered by core unit
  (`containsSensitiveData` clean; no actor id in the bundle).

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** migration classification/recovery decisions,
  health derivation, redaction, and the diagnostics/participant permission boundary are pure core
  functions. Platform Services derive raw facts (online state, profile, persisted versions) and
  perform the storage writes the core's recovery decision asks for; the GUI renders the returned,
  already-filtered models and makes no policy decision. The app reads `src/routes` only in tests.
- **Contract 2 (Cloud Sync & Offline Model):** migration/diagnostics are fully local-first and
  offline — schema health, dry-run, integrity, and recovery operate on local durable state with no
  network. Sync payload versioning fails closed: a future/unreadable schema version is a blocking
  upgrade-required issue, never partial parsing (Sync Security rule 5). The support bundle keeps raw
  vault paths and secrets device-local by default (Cloud Storage "must not contain" rules); cloud
  sync is reported `unsupported` rather than faked (ADR-014 defers it).
- **Contract 4 (Scene and Widget Contract):** session delivery status reuses the existing
  player-view-assignment/active-map-projection delivery state without mutating durable Scene/session
  data; the participant view never receives a hidden widget-bound entity field merely because an
  assignment exists (Player View rule 5).
- **ADR-014 boundary:** new core modules import only core types/modules (no Svelte/DOM/platform/Node/
  v1 imports); the app imports core only through its public API. The migration journal uses the
  existing Dexie adapter behind the app storage boundary. Boundary lint passes (51 core source files).
  No cloud transport, CRDT, native shell, MCP runtime, or v1 migration code was added.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic PLAT-migration-and-diagnostics --status active
pnpm v2:workpack:validate                              # v2 workpack validation passed
pnpm v2:lint                                           # v2 boundary lint passed
pnpm v2:typecheck                                      # core tsc + app svelte-check: 0 errors
pnpm --filter @dndtools/v2-core test                   # 28 files, 294 tests passed (51 new across 3 files)
pnpm --filter @dndtools/v2-app test                    # 8 files, 28 tests passed (3 new migration-recovery)
pnpm exec prettier --check <changed files>             # all matched files use Prettier style
pnpm --filter @dndtools/v2-app exec playwright test tests/e2e/diagnostics.spec.ts
# 8 passed across desktop + mobile (new PLAT-009/017 spec)
pnpm --filter @dndtools/v2-app exec playwright test
# 100 passed, 8 profile-skipped (full v2 e2e suite, no regressions; the 8 skips are the pre-existing
# widget-library mobile-only skip)
pnpm v2:check                                          # workpack validate + lint + typecheck + unit tests all green
pnpm v2:workpack:complete -- --epic PLAT-migration-and-diagnostics
pnpm v2:workpack:validate                              # passed (no drift)
```

## Quality Review Summary

- **Correctness:** PLAT-008/009/017 and all eight acceptance criteria are implemented and covered at
  unit and e2e level, including dry-run required-changes/blocking, write-ahead roll-back to snapshot,
  failed-source remediation, default redaction + opt-in, the participant/observer/unknown denial
  matrix, and the no-leak participant view.
- **Architecture:** every policy decision is a core-owned pure function; the app derives raw facts and
  performs only the storage writes the core asks for. No parallel source of truth — schema health is
  computed by the same planner the dry-run uses, and target versions come from the state modules.
- **Tests:** 51 new core unit tests (`migration`, `dm-diagnostics`, `participant-status`), 3 new app
  unit tests (`migration-recovery`, real Dexie roll-back), 8 new e2e cases (`diagnostics.spec.ts`,
  desktop + mobile). All prior core (243), app-unit (25), and the full e2e suite pass unchanged.
- **Accessibility:** both panels use semantic headings, labelled regions/lists, a `role="status"`
  denial message and `role="alert"` export error; the export preview is a focusable region. The
  surfaces render under both desktop and compact (mobile) profiles (e2e covers both).
- **Performance:** all core functions are in-memory transforms over a handful of documents/sources;
  recovery is a one-time read + bounded writes at load. No network, render loop, or background work.
- **Security / Permissions:** diagnostics view and support-bundle export are fail-closed — only the DM
  or an explicit `diagnostics-admin` grantee passes; redaction strips secret-named keys, absolute
  paths, file URLs, and bearer tokens by default and exposes raw values only on explicit opt-in. The
  participant view drops DM-facing capability detail, source ids/paths, and hidden entity names;
  `containsSensitiveData` is asserted clean across views and bundles.
- **Persistence / Sync/offline:** the write-ahead journal + safety snapshot make a mid-write
  migration crash recoverable on restart; recovery runs before any persisted document is trusted.
  Everything is local-first/offline; future schema versions fail closed rather than partial-parse.
  No new sync units or cloud writes were introduced.
- **UX:** the DM sees an at-a-glance health/source/capability/schema view with per-source remediation
  and a clearly-labelled, redacted-by-default export with an explicit opt-in. Participants see a
  calm, generic, action-oriented status of their own session with no alarming internals.
- **Maintainability:** small, cohesive, typed modules — four migration files and four diagnostics
  files, each with focused public functions — plus two thin GUI panels and one app-side context
  builder. The document set, capability list, and message tables are data-driven; no speculative
  abstractions or unrelated refactors.
- **Docs:** this evidence file records traceability, demo path, verification, contracts, quality
  review, and gaps; module doc comments tie each function to its requirement and the relevant
  contract rule.

## Known Gaps / Deferred

- **Migration _transforms_ are dry-run + recovery only, not document upgraders.** The current durable
  documents are all at schema v1 (the build target), so no real `v1→v2` transform exists yet. The
  full pipeline is in place — classification, required-change reporting, fail-closed blocking, safety
  snapshot, write-ahead journal, and roll-back — so each future schema bump adds its transform behind
  the existing dry-run/commit/recover machinery without new architecture.
- **Diagnostics surfaces are hosted on `/settings`, not a dedicated Diagnostics route.** Adding a new
  top-level route would change the NAV-owned canonical IA registry and route audit (cross-epic
  churn). The PLAT-owned Settings section hosts both panels today; a future NAV/PLAT change can
  promote a standalone Diagnostics section if desired.
- **Sync-source set is the local-vault prototype only.** `diagnostics-context.ts` reports one
  local-vault source and marks filesystem/cloud-sync capabilities `unsupported`, consistent with
  ADR-014's deferral of cloud transport and external source adapters. The core diagnostics view
  already accepts an arbitrary set of sources, so Obsidian/Google Docs sources surface here when those
  adapter epics land.
- **Participant input facts (online/stale/reconnecting/queued) are device-provided.** The prototype
  passes `navigator.onLine` and `0` queued ops; richer presence/staleness comes from the COLLAB
  presence epic. The participant view contract and states are in place for it to feed.
- **No axe-core scan added.** The panels are covered by targeted structural e2e assertions and
  semantic markup; a broader automated axe pass over v2 routes remains a future cross-cutting task,
  consistent with prior v2 epics and ADR-014.

## Git Evidence

Branch: `epic/PLAT-migration-and-diagnostics`, created from the current completed v2 epic chain HEAD
`3b6ed785649f46d8783a627abaaa7d26104679f8` (the `NAV-route-aliases-and-deep-links` HEAD). Not branched
from `master`.

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic PLAT-migration-and-diagnostics --status active
pnpm v2:workpack:complete -- --epic PLAT-migration-and-diagnostics
```

Changed files (epic scope):

```text
apps/v2/app/src/lib/gui/DiagnosticsPanel.svelte
apps/v2/app/src/lib/gui/ParticipantStatusPanel.svelte
apps/v2/app/src/lib/platform/diagnostics-context.ts
apps/v2/app/src/lib/platform/storage/scene-store.ts
apps/v2/app/src/routes/settings/+page.svelte
apps/v2/app/tests/e2e/diagnostics.spec.ts
apps/v2/app/tests/unit/migration-recovery.test.ts
apps/v2/packages/core/src/diagnostics/dm-diagnostics.ts
apps/v2/packages/core/src/diagnostics/health.ts
apps/v2/packages/core/src/diagnostics/index.ts
apps/v2/packages/core/src/diagnostics/participant-status.ts
apps/v2/packages/core/src/diagnostics/redaction.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/migration/dry-run.ts
apps/v2/packages/core/src/migration/index.ts
apps/v2/packages/core/src/migration/integrity.ts
apps/v2/packages/core/src/migration/schema-versions.ts
apps/v2/packages/core/src/migration/write-ahead.ts
apps/v2/packages/core/tests/dm-diagnostics.test.ts
apps/v2/packages/core/tests/migration.test.ts
apps/v2/packages/core/tests/participant-status.test.ts
docs/planning/v2/epics/PLAT-migration-and-diagnostics.yaml
docs/planning/v2/epics/PLAT-migration-and-diagnostics.completion.md
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; the final handoff reports the branch HEAD SHA.

Final `git status --short` after `pnpm v2:workpack:complete` and before the final commit is recorded
in the handoff. After the final commit, `git status --short` is clean (no untracked or unstaged
files).
