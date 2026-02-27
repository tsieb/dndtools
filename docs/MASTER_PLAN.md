# DND Tools — Master Plan

> The definitive TTRPG companion: local-first worldbuilding, live session management,
> AI creative partnership, and cross-device collaborative play.

---

## Vision Statement

DND Tools will be the standard by which all TTRPG digital companions are measured. It
runs offline-first on every platform a DM or player actually uses — desktop, Android,
eventually iOS — with data fully owned by the user. When connected, it enables real-time
collaborative sessions between any participants, with or without a backend, using direct
peer-to-peer links for local play and AWS-backed cloud for remote groups. An AI agent
layer (MCP) operates as a genuine creative partner: it does not merely wrap CRUD
operations but performs deep algorithmic reasoning over the vault and delivers
pre-contextualized, semantically bundled intelligence that dramatically reduces model
overhead. Every feature is keyboard-accessible, screen-reader compatible, and usable
under the stress of a live game session.

---

## Guiding Principles

1. **Data is sacred.** The vault is a DM's life's work. Zero data loss, atomic writes,
   crash-safe recovery, and full user ownership are non-negotiable at every layer.

2. **Speed is a feature.** Fast enough for live sessions under time pressure. Search
   returns in under 150ms. Navigation takes one keystroke. The AI responds in one
   semantic call, not twenty.

3. **Local-first, collaborative when needed.** The app works completely offline. Cloud
   and P2P are enhancements, never requirements.

4. **AI partnership, not AI dependence.** MCP agents augment human creativity; they
   never silently mutate data. Every write is staged, previewed, and human-approved
   unless explicitly trusted.

5. **Platform agnosticism through abstraction.** The `StorageAdapter` boundary and the
   renderer/main separation allow every platform target (desktop, Android, browser) to
   share the same application layer with only the adapter changing.

6. **Extensibility from first principles.** Campaign systems, object types, plugins, and
   themes are designed as first-class module boundaries so the community can contribute
   without forking.

7. **Engineering as a product.** CI gates, ADRs, test coverage targets, and docs
   in-sync with code are not optional polish — they are what makes sustained delivery
   possible.

8. **Observability as a first principle.** Every critical path carries structured
   telemetry, performance marks, and error taxonomy entries. The system surfaces its
   own health in ways both users and developers can understand and act on. Darkness in
   a production system is a bug, not an acceptable state.

9. **Privacy and security by design.** User data is never transmitted without explicit
   consent. At-rest encryption, minimal external dependencies, a published threat model,
   and zero telemetry without opt-in are design inputs from day one — not post-launch
   concerns. The user owns their data absolutely.

10. **Graceful degradation everywhere.** Every feature must define its behavior when
    dependencies are unavailable: network absent means sync queues; AI unavailable means
    client-side algorithmic fallbacks; audio context unavailable means silent mode. Hard
    dependencies between optional features are architectural failures.

11. **Two users, one system.** The DM and the player have fundamentally different mental
    models, permission sets, and session-time needs. Every interface is designed for both
    personas. When in conflict, DM power wins at build time — player clarity and
    immersion win at runtime. The system never accidentally exposes DM-private content.

---

## Initiative Map

| #   | Initiative                    | Priority | Depends On |
| --- | ----------------------------- | -------- | ---------- |
| I1  | Platform Foundation & Trust   | P0       | —          |
| I2  | Engineering Excellence        | P0       | I1         |
| I3  | Core Knowledge Architecture   | P1       | I1, I2     |
| I4  | Session-Time Command Center   | P1       | I3         |
| I5  | AI Creative Partnership       | P1       | I3, I2     |
| I6  | Multi-Platform Distribution   | P1       | I1, I3     |
| I7  | Collaborative Infrastructure  | P2       | I3, I6     |
| I8  | Extensibility & Ecosystem     | P2       | I3, I2     |
| I9  | Maps & Spatial Intelligence   | P1       | I3         |
| I10 | Player Character Suite        | P1       | I3, I4     |
| I11 | Atmosphere, Audio & Immersion | P2       | I4         |
| I12 | Community & Content Ecosystem | P3       | I7, I8     |

Each Initiative contains 3–7 Epics. Each Epic contains 3–7 Stories. Stories are the
atomic reviewable unit of work — one PR, one demonstrable outcome.

---

---

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
  `.vault/migration-backup-{version}-{timestamp}/`. Add a one-click restore path
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

# Initiative 2 — Engineering Excellence

**Outcome:** Every change to DND Tools is gated by automated quality checks. The
codebase has a complete test pyramid, architectural decisions are recorded and reasoned,
and the developer experience makes correct behavior the path of least resistance.

**Why second:** Engineering Excellence is the delivery system for all other Initiatives.
Without CI, test coverage, and ADRs, every subsequent Initiative will drift, regress,
and accumulate hidden debt.

---

## Epic 2.1 — CI/CD Pipeline & Release Automation

**Goal:** No change merges to main without passing a full quality matrix. Releases are
automated, versioned, and reproducible.

**Stories:**

- **S2.1.1 — Core CI workflow (lint + typecheck + unit tests)**
  Add `.github/workflows/ci.yml` running `pnpm check`, `pnpm lint`, and `pnpm test`
  across Node LTS versions. Required status check blocks all PRs. Fail-fast with
  actionable error output per step.

- **S2.1.2 — E2E test stage in CI**
  Add `.github/workflows/e2e.yml` running Playwright tests against a headed Electron
  environment on Ubuntu (with xvfb). Cache playwright browser downloads. Run on all PRs
  that touch `src/`, `electron/`, or `mcp/`.

- **S2.1.3 — Desktop build validation matrix**
  Add `.github/workflows/desktop-build.yml` running `pnpm desktop:build` on
  windows-latest, ubuntu-latest, and macos-latest. Validate the artifact starts and
  opens a test vault without error. Run on release branches and weekly on main.

- **S2.1.4 — Automated changelog and release pipeline**
  Adopt Conventional Commits. Add `release-please` or equivalent to automate version
  bumps, changelog generation, and GitHub Release creation. Each release includes:
  desktop artifacts (signed), MCP build, and a human-reviewed release notes section.

- **S2.1.5 — Docs validation in CI**
  Add a check that verifies: all file paths referenced in `docs/` exist, all `TODO(APP)`
  annotations include reason/target/risk fields, and `SCHEMA_MIGRATIONS.md` stays in
  sync with `mcp/migrations.ts` version list. Fail CI on drift.

---

## Epic 2.2 — Test Pyramid Coverage

**Goal:** The full testing pyramid is healthy: unit tests for domain logic, integration
tests for storage and MCP tools, E2E tests for critical user workflows.

**Stories:**

- **S2.2.1 — MCP tool unit test coverage for all 30+ tools**
  Every tool under `mcp/tools/**` gets a test file covering: valid input → correct
  output, invalid input → deterministic error envelope, edge cases (empty vault, missing
  note, concurrent access). Target: 100% of write-capable tools, 90% of read tools.

- **S2.2.2 — Storage corruption/recovery integration tests**
  Add tests in `mcp/storage.test.ts` and a new `mcp/recovery.test.ts` for: corrupt
  index recovery, partial write recovery via journal replay, checksum mismatch handling,
  and schema migration on fixture vaults. Use real filesystem via `tmp` directories.

- **S2.2.3 — Staged MCP workflow regression suite**
  Add tests in `mcp/staged-storage.test.ts` covering the full approve/reject/conflict
  lifecycle including: concurrent approve+UI edit race condition, batch approval with
  filter, policy preset enforcement per agent, and audit trail completeness.

- **S2.2.4 — Playwright E2E coverage for critical session workflows**
  Add E2E tests for: vault open, note CRUD, wikilink navigation, search, MCP pending
  changes review, session board management, object creation, and first-run onboarding.
  Define a per-route coverage matrix. Block merges if a covered workflow regresses.

- **S2.2.5 — Performance regression suite with hard budgets**
  Define performance budgets in `docs/ARCHITECTURE.md`: cold start ≤ 3s, note open
  ≤ 200ms, search response ≤ 150ms, save latency ≤ 100ms. Add Playwright performance
  benchmarks that run weekly and fail if any budget is exceeded by > 20%.

---

## Epic 2.3 — Architecture Decision Records

**Goal:** Every major architectural decision in the codebase is documented with context,
options considered, and rationale — making onboarding and future changes informed.

**Stories:**

- **S2.3.1 — ADR template and directory**
  Create `docs/adr/` with a standard ADR template covering: status, context, decision,
  consequences, rejected alternatives, and migration impact. Add a README listing all
  ADRs with one-line summaries.

- **S2.3.2 — ADR-001 through ADR-005: Baseline decisions**
  Write ADRs for: (1) Electron filesystem ownership, (2) staged MCP write model,
  (3) IPC surface strategy, (4) StorageAdapter abstraction boundary, and (5) unified
  markdown pipeline. These document the current state, not aspirational future state.

- **S2.3.3 — ADR-006 and ADR-007: Platform strategy**
  Write ADRs for: (6) multi-platform approach (Electron + Capacitor for Android),
  justifying why Capacitor over Tauri/Cordova for the Android target given the
  SvelteKit renderer; (7) cloud backend architecture (AWS Cognito + S3 + API Gateway),
  covering alternatives (Supabase, Firebase, self-hosted) and trade-offs.

- **S2.3.4 — ADR-008: MCP semantic bundling strategy**
  Document the decision to move from fine-grained individual MCP tools toward
  algorithmic pre-processing bundles that reduce LLM context overhead, including the
  trust model, caching strategy, and extension interface.

---

## Epic 2.4 — Developer Tooling & Boundary Enforcement

**Goal:** Developers cannot accidentally violate runtime boundaries. Tooling catches
violations at lint time, not runtime. Fixture generation and debugging flows are
first-class developer experiences.

**Stories:**

- **S2.4.1 — Lint rules for runtime boundary violations**
  Add ESLint rules that detect: renderer code importing Node-only modules, MCP code
  importing renderer-only modules, and direct storage access in route components (must
  go through stores). Fail CI on violations.

- **S2.4.2 — Fixture vault generator script**
  Add `scripts/generate-fixture-vault.ts` that creates a test vault with configurable
  note count, object count, depth, link density, and tag distribution. Used for
  performance benchmarking, migration testing, and manual debugging sessions.

- **S2.4.3 — Code ownership map**
  Add `CODEOWNERS` file and a `docs/OWNERSHIP.md` mapping each major module directory
  to its responsible owner(s) and the architectural boundary it belongs to. Used in PR
  review routing and refactor impact scoping.

- **S2.4.4 — Refactor budget governance process**
  Document a lightweight process in `docs/DEVELOPMENT.md` for tracking technical debt:
  a `DEBT.md` file listing known architectural debts with severity, impact, and planned
  resolution window. Require a debt item for any `// TODO(APP)` that survives more than
  one quarter.

---

## Epic 2.5 — Performance Engineering Excellence

**Goal:** Hard performance budgets are defined for every user-observable operation,
continuously measured in CI, and the codebase has a structured roadmap for addressing
any budget that is exceeded. Performance is treated as a feature, not an afterthought.

**Stories:**

- **S2.5.1 — Hard performance budget definitions and tracking**
  Define and document in `docs/ARCHITECTURE.md` measurable budgets for: cold start
  ≤ 3s, vault open (5k notes) ≤ 2s, note open ≤ 200ms, search response ≤ 150ms,
  note save ≤ 100ms, graph rebuild (incremental) ≤ 50ms, MCP bundle call ≤ 800ms.
  Add a budget registry type in `src/lib/types/diagnostics.ts`. Any budget change
  requires an ADR.

- **S2.5.2 — Real-user performance telemetry with `performance.mark`**
  Instrument all budgeted operations with `performance.mark` and `performance.measure`
  at call sites. Aggregate P50/P95/P99 into the System Health page. Add a performance
  timeline view in Settings → System Health → Performance, surfacing the slowest
  recent operations grouped by type.

- **S2.5.3 — CI performance regression suite with automated comparison**
  Add a Playwright benchmark suite that runs against a standard 1k-note and 5k-note
  fixture vault, measuring all budgeted operations. Store baseline measurements as
  a JSON artifact. A CI job compares new runs against the baseline and fails if any
  metric regresses by more than 20%. Baseline updates require explicit PR approval.

- **S2.5.4 — Main-thread offload strategy for heavy operations**
  Profile and move the three heaviest renderer-thread operations (initial search index
  build, full graph rebuild, large note batch parse) to `Worker` threads. Add a
  `WorkerBridge` abstraction in `src/lib/runtime/` that hides the message-passing
  complexity from callers. Verify cold-start budget is met after offloading.

- **S2.5.5 — Memory profiling and leak detection program**
  Add a memory profiling step to the CI nightly run: open a 5k-note vault, run a
  fixed interaction script (open 50 notes, run 20 searches, save 10 notes), and
  record heap usage before/after. Assert heap growth < 20MB for the script. Add
  a `scripts/memory-profile.ts` for local investigation sessions. Document findings
  and mitigations in `docs/PERFORMANCE.md`.

---

---

# Initiative 3 — Core Knowledge Architecture

**Outcome:** The vault knowledge model is complete, intelligent, and interoperable. Notes
link to structured objects, the graph is always accurate, search is instant and faceted,
templates reduce repetitive work, and vaults move freely in and out of the app.

**Why third:** This is the core product. Session tools, AI, and collaboration all build
on the knowledge model. It must be solid and feature-complete before those layers add
their demands.

---

## Epic 3.1 — Note & Wikilink Graph Engine

**Goal:** The link graph is always accurate, always incremental, and supports rich
resolution including aliases and disambiguation.

**Stories:**

- **S3.1.1 — Incremental link graph updates**
  Replace full-graph rebuilds triggered by single note mutations with surgical update:
  on note save, compute the diff between old and new links, remove stale edges, and
  insert new edges. Full rebuild is reserved for vault-open and explicit repair. Target:
  single note save does not touch more than O(links in note) graph operations.

- **S3.1.2 — Alias-aware link resolution**
  Allow notes to declare `aliases: [...]` in frontmatter. The link resolver checks
  canonical title first, then aliases. Add alias index to `index.json`. MCP `get_backlinks`
  includes alias-matched links with a flag indicating which alias matched.

- **S3.1.3 — Disambiguated link picker**
  When a `[[Title]]` matches multiple notes (by title or alias), the editor shows an
  inline disambiguation picker rather than silently linking to the first match. The
  picker shows folder context for each candidate. The resolved link uses the note ID
  to remain stable across title changes.

- **S3.1.4 — Dead link highlighting and bulk repair**
  In editor, highlight `[[links]]` that resolve to no note in amber. In reading view,
  show an inline "create note" affordance. Add a Settings → Vault Health report listing
  all unresolved links with their source context and a batch "create all" action.

---

## Epic 3.2 — Structured Object System

**Goal:** Every domain entity (NPC, location, faction, quest, item, encounter, timeline
event) has a typed schema, a structured editor, relationship edges, change history, and
a clean embed protocol for notes.

**Stories:**

- **S3.2.1 — Complete object type coverage with typed schemas**
  Finalize schemas for all 10 object types: stat_block, character, npc, location,
  faction, quest, item, encounter, timeline_event, image. Each type has a Zod schema in
  `mcp/tools/shared/object-schema.ts`, a TypeScript type in `src/lib/types/object.ts`,
  and a structured form component in `src/lib/ui/editor/ObjectStructuredEditor.svelte`.

- **S3.2.2 — Object relationship graph with visualization**
  Extend the relationship model beyond `parent/child/ally/enemy/appears_in_session` to
  include custom relationship labels. Add a relationship graph panel on object notes
  showing connected entities with edge type labels. Clicking a node navigates to that
  object's note.

- **S3.2.3 — Object validation, linting, and fix suggestions**
  Run lint on every object save: required fields, broken relationship targets, cycle
  detection in parent/child chains, and duplicate canonical names. Surface lint issues
  in the structured editor with actionable fix buttons, not just error messages.

- **S3.2.4 — Object change history and revert UI**
  Object mutation history is stored in `.vault/object-history.json`. Add a history panel
  on object notes showing timestamped snapshots with delta summaries. One-click revert
  to any snapshot. Revert creates a new history entry (non-destructive).

- **S3.2.5 — Object embed protocol in notes**
  The `[[obj:id|display]]` embed syntax renders a live mini-card in reading view showing
  key fields from the object type (HP/AC for stat blocks, description for locations, etc.).
  Embedded objects auto-update when the source object changes. The card is keyboard
  accessible and navigable.

---

## Epic 3.3 — Advanced Search & Discovery Engine

**Goal:** Users can find any note or entity in the vault within one interaction, using
rich operators, saved queries, and faceted filters.

**Stories:**

- **S3.3.1 — Advanced query operators**
  Support `tag:monster`, `folder:/locations`, `type:npc`, `updated:>7d`,
  `links:[[NPC Name]]`, and quoted phrase search in the search box. Parse operators
  before routing to MiniSearch. Add a query cheat-sheet accessible from the search bar.

- **S3.3.2 — Faceted filter panel with live counts**
  Add a collapsible filter panel next to search results showing: tag facets with counts,
  folder facets, object type facets, and date range presets. Filters are additive and
  show as removable chips. Counts update in real time as other filters are applied.

- **S3.3.3 — Saved searches and smart collections**
  Allow any search query (including operators) to be saved as a named collection. Saved
  searches appear in the sidebar under "Collections" and update dynamically. Examples:
  "Active NPCs", "Orphaned notes", "Updated this week". Collections are stored in
  `settings.json`.

- **S3.3.4 — Search performance monitoring and budget**
  Instrument search with `performance.mark`/`measure`. Surface P50/P95 latency in
  Settings → System Health. Alert the user in the UI if search falls below budget. Add
  benchmark to the performance regression suite.

- **S3.3.5 — Semantic vector search (opt-in, AI-available)**
  When the MCP sidecar is running and a local embedding model is available (e.g.,
  nomic-embed via Ollama), enable a "semantic search" toggle that supplements keyword
  results with semantically similar notes. This is strictly additive — keyword search
  always works without it.

---

## Epic 3.4 — Template & Snippet Library System

**Goal:** Note and object creation is fast, consistent, and campaign-contextual through
a rich template system with variables and a reusable content library.

**Stories:**

- **S3.4.1 — Global and folder-scoped note templates**
  Templates live in `.vault/templates/`. Each template is a markdown file. Folder-scoped
  templates apply automatically when creating a note inside that folder. The "new note"
  flow shows a template picker if more than one template matches.

- **S3.4.2 — Template variable system**
  Templates support `{{date_iso}}`, `{{date_pretty}}`, `{{campaign_name}}`,
  `{{session_number}}`, `{{character_names_csv}}`, and `{{character_names_bullets}}`.
  Variables are resolved at note creation time from campaign settings. Add a variable
  reference table to the template editor toolbar.

- **S3.4.3 — Snippet / reusable block library**
  Users define named snippets (short reusable text fragments) in `.vault/snippets/`.
  The editor insert menu (`/snippets` or toolbar button) shows the snippet library with
  live preview. Snippets support the same variable syntax as templates.

- **S3.4.4 — "Create from template" everywhere**
  Template creation is available from: command palette, toolbar `+` button, right-click
  in folder tree, and the MCP `create_note` tool (via `templateId` param). The MCP
  tool resolves variables at creation time with context from the tool call parameters.

---

## Epic 3.5 — Import/Export & Interoperability

**Goal:** Vaults move freely between DND Tools, Obsidian, plain markdown, and archive
formats with full validation, preview, and rollback at every step.

**Stories:**

- **S3.5.1 — Obsidian compatibility import pack**
  Map Obsidian frontmatter conventions, folder structure, wikilink syntax, and embed
  syntax to DND Tools equivalents during import. Show a pre-import report identifying
  features that will be mapped, ignored, or require manual resolution. Preserve
  unmapped frontmatter keys in `note.frontmatter`.

- **S3.5.2 — Pre-import analyzer with conflict detection**
  Before any import executes, analyze the incoming content for: duplicate titles, ID
  collisions, invalid frontmatter, encoding issues, missing linked files, and size
  limits. Present a structured report with per-issue severity and "skip / overwrite /
  merge" resolution choices.

- **S3.5.3 — Resumable import for large vaults**
  Large imports (> 500 files) run as a background job with a progress indicator. If the
  import fails midway, the completed files are committed and a resume checkpoint is
  stored. The next import session offers to continue from the checkpoint.

- **S3.5.4 — Portable markdown zip export**
  Add a zip export profile that produces: a folder of plain `.md` files, an `assets/`
  folder for images, and a `README.md` describing the export format. This export is
  usable by any markdown tool. Add export validation (broken embeds, unresolved links)
  and a restore-from-export test.

- **S3.5.5 — Deterministic export for version control**
  Add an export mode that produces a canonical, diff-friendly directory structure
  suitable for git. Frontmatter fields are sorted alphabetically, dates are normalized,
  and IDs are stable. This enables power users to maintain their vault in git.

---

## Epic 3.6 — Vault Graph Intelligence

**Goal:** The vault's link graph is a first-class intelligence surface providing
structural insights, quality metrics, and visual exploration.

**Stories:**

- **S3.6.1 — Orphan detection and hub-note insights**
  Compute orphan notes (no inbound or outbound links) and hub notes (high betweenness
  centrality) as derived metrics updated incrementally on graph mutation. Expose both
  in: Settings → Vault Health, the MCP `get_coverage_gaps` tool, and as sidebar badge
  counts.

- **S3.6.2 — Visual graph exploration with filters**
  The graph view (`/graph`) renders an interactive force-directed graph with: tag-based
  color coding, folder-based clustering, link weight by reference count, and a search
  filter that highlights matching nodes. Clicking a node opens a side panel with note
  preview and quick navigation.

- **S3.6.3 — Backlink context snippets**
  The backlinks panel in note reading view shows the two sentences surrounding each
  backlink occurrence, not just the source note title. The MCP `get_backlinks` response
  includes context snippets as part of its payload. These snippets are pre-indexed at
  write time, not computed on read.

- **S3.6.4 — Link quality report in vault health**
  Add a vault link quality report: total links, broken links, alias-matched links, loops
  (A→B→A), and cross-folder link density. The report is accessible via MCP
  `vault_health_check` and Settings → Vault Health. Each item has a one-click drill-
  down to the affected notes.

---

## Epic 3.7 — In-World Calendar & Custom Time System

**Goal:** DMs can define a fully custom calendar for their world — any number of months,
week lengths, moon phases, and named eras. All timeline events, notes, and session logs
reference dates in this calendar. The system respects that every world is different.

**Stories:**

- **S3.7.1 — Calendar definition schema and editor**
  Add a calendar definition format in `.vault/settings.json` under `worldCalendar`:
  months (name, days), week length and day names, leap year rules, era names and
  epoch offsets, and up to 4 moon cycles (name, period in days, phase names). Add a
  Settings → World → Calendar editor UI. The default calendar is the Gregorian
  calendar so existing timeline events are not broken.

- **S3.7.2 — In-world date type and formatting**
  Add a `WorldDate` value type that stores a day offset from the calendar epoch.
  Add formatting functions for any defined calendar: short (`15 Harvestmoon, Year 312`),
  long, and ISO-equivalent (`0312-09-15`). All date fields on timeline events and
  session notes display in the active calendar format. Dates convert correctly when the
  calendar definition changes.

- **S3.7.3 — Moon phase and calendar reference panel**
  Add a collapsible calendar panel (available as a sidebar widget and board tile) showing:
  current in-world date, this month's calendar grid with event indicators, and moon
  phase status for each defined moon. The DM advances the in-world date manually or
  via a session-start workflow. Current date is stored in `.vault/settings.json`.

- **S3.7.4 — Calendar-aware MCP tools**
  Extend `get_session_prep_bundle` and `get_recap_generation_bundle` to accept
  `worldDate` as a context parameter. Timeline events and session notes reference
  in-world dates in their summaries. Add a `get_calendar_events(dateRange)` MCP tool
  that returns all notes and timeline events within an in-world date range. Document
  the calendar schema in `docs/DATA_MODEL.md`.

---

---

# Initiative 4 — Session-Time Command Center

**Outcome:** DND Tools is the best possible tool to have open at the table during a live
game session. Information is instant, action is one keystroke away, and the DM never
loses the thread.

---

## Epic 4.1 — Live Session Dashboard (Boards 2.0)

**Goal:** Session boards are a true DM command center: configurable, content-rich, and
responsive to the shape of the current scene.

**Stories:**

- **S4.1.1 — Board template system for common session layouts**
  Define 3–5 built-in board templates: "Combat Scene", "NPC Encounter", "Exploration",
  "Town Visit". Each pre-configures tile types and sizes for that scenario. Users can
  save custom layouts as personal templates. Templates are stored in `settings.json`
  under `boardTemplates`.

- **S4.1.2 — Live note content preview in tiles**
  Tiles can render the first N lines of a linked note in real time, not just the title.
  The render is the same pipeline as the note reading view (markdown + object embeds).
  Tiles with live preview have a configurable "depth" (title-only → summary → full).

- **S4.1.3 — Pinnable quick-access overlay**
  A global `Ctrl+Shift+B` shortcut opens a floating "session quick panel" showing the
  current active board tiles as a compact overlay over any route. Useful when reading
  a note and needing quick access to the initiative tracker or NPC list without
  navigating away.

- **S4.1.4 — Session timer and countdown widget tile**
  Add a timer tile type with: elapsed session time, optional countdown (to end of
  combat round, session end), lap markers, and a minimal "just the clock" display mode.
  Timer state persists across tab focus changes and navigation.

---

## Epic 4.2 — Combat Tracker & Initiative Management

**Goal:** Initiative order is tracked with zero friction, HP and conditions are live, and
encounter results flow directly into vault notes.

**Stories:**

- **S4.2.1 — Initiative tracker with drag-reorder and tie-breaking**
  Add a combat tracker panel (available as a board tile or standalone route). Supports:
  add combatant by name or linked stat block, set initiative, drag to reorder ties,
  advance turn, and mark ready/delay. Keyboard-first: `n` for next turn, `a` for add.

- **S4.2.2 — HP and condition tracking per combatant**
  Each combatant row shows current/max HP with fast +/- controls, a condition tag list
  (Poisoned, Frightened, etc.), concentration indicator, and death save tracking for
  player characters. Conditions are drawn from a campaign-system-aware list (5e first).

- **S4.2.3 — Linked stat block embed per combatant**
  Each combatant entry can be linked to a vault object (stat_block or character). The
  row shows a collapsed stat block preview. One click expands full stats inline. Max AC
  and initiative modifier are auto-populated from the linked object.

- **S4.2.4 — Encounter result capture → note creation**
  At encounter end, offer a one-click "Save Encounter Log" that creates a new note
  from a template: combatants, round count, outcome summary (who fell, who fled, total
  damage dealt), and loot rolled. Links the note to participating PC and NPC objects.

---

## Epic 4.3 — Quick Reference System

**Goal:** Any NPC, location, item, or rule can be found and previewed within two
keystrokes from anywhere in the app.

**Stories:**

- **S4.3.1 — Command palette entity lookup with inline preview**
  Extend the command palette (`Ctrl+P`) with an "entity" search mode triggered by
  typing `@`. Results show object type icon, name, key stats (AC/HP for monsters,
  type for locations), and a thumbnail of the note content. `Enter` navigates;
  `Ctrl+Enter` opens in a split view without leaving current context.

- **S4.3.2 — Hover cards for wikilinks in reading view**
  Hovering a `[[wikilink]]` in reading view shows a popover with: note title, first 3
  lines of content, and object-type-specific key stats if the note is object-backed.
  The popover is keyboard-triggerable (`Tab` + `Space` on focused links). Debounced to
  avoid flickering during fast cursor movement.

- **S4.3.3 — Session context panel (pinned active entities)**
  A collapsible panel in the sidebar (or as a board tile) showing pinned "session
  context" items: active NPCs, current location, active quest, party roster. These are
  manually pinned by the DM at session start. Context panel is persisted in the active
  session board and restored on next open.

- **S4.3.4 — Global hotkey for quick reference overlay**
  `Ctrl+Shift+Space` opens a floating, dismissible quick reference overlay — like a
  HUD. It shows the session context panel and search in a compact format. Designed for
  use when sharing screen or when the main window is in focus reading mode.

---

## Epic 4.4 — Dice Engine & Roll History

**Goal:** Dice rolling is native to the app, expression-complete, and integrated into
the note-writing workflow so roll results are capturable in session notes.

**Stories:**

- **S4.4.1 — Dice expression parser and roller**
  Implement a dice expression evaluator supporting: `1d20+5`, `2d6`, `4d6kh3`
  (keep highest), `adv` and `dis` (advantage/disadvantage shorthand), and inline
  arithmetic. The parser is pure TypeScript, fully tested, and usable in both UI and
  MCP tools.

- **S4.4.2 — Dice tray panel with roll history**
  Add a dice tray panel (accessible as a board tile, sidebar panel, or `Ctrl+D`
  shortcut) with: expression input, roll button, result with individual dice values
  shown, and a session roll history log. History is session-scoped and can be cleared.

- **S4.4.3 — Dice roll insert into editor**
  In the editor, typing `/roll 1d20+5` or using the insert menu evaluates the expression
  and inserts the result as a formatted markdown line: `> 🎲 1d20+5 = **17** (12 + 5)`.
  The insert is undoable.

- **S4.4.4 — Roll macros for frequent expressions**
  Users define named macros (e.g., "Sneak Attack", "Fireball Save") with a label and
  expression. Macros appear in the dice tray quick-access row and the command palette.
  Macros are stored per-vault in `settings.json` and accessible via MCP.

---

## Epic 4.5 — Campaign Timeline & Progress Tracking

**Goal:** The campaign arc is visible as a structured timeline. DMs can track what has
happened, what is in motion, and what is at risk of being forgotten.

**Stories:**

- **S4.5.1 — Timeline object type and chronological view**
  Add `timeline_event` as a fully realized object type with fields: date (in-world
  calendar), title, description, participants (linked objects), and arc tag. A
  `/timeline` route renders events in chronological order with filter by arc/participant.

- **S4.5.2 — Session log entries with timeline linkage**
  Each session note can be linked to a timeline event (or auto-creates one on save).
  The timeline view shows session log entries inline with world events, giving a dual
  track: what happened in the world vs. what the players discovered in each session.

- **S4.5.3 — "Open threads" tracking**
  A derived view that lists all active quests, NPCs with unresolved status, and
  timeline events marked "pending resolution". Updated from object and note state
  automatically. Available as an MCP tool (`get_open_threads`) and in the sidebar.

---

## Epic 4.6 — Player-Facing View Mode

**Goal:** Players have a first-class view of the content the DM has shared with them,
including their character sheet and session notes, without seeing DM-private content.

**Stories:**

- **S4.6.1 — Content visibility tagging**
  Add a `visibility` field to notes and objects with values `dm_only`, `shared`,
  `public`. DM-only notes are filtered from player view entirely. This is the
  permission primitive for both local player view and future collaborative sharing.

- **S4.6.2 — Player reading mode**
  A `/player` route shows only `shared` and `public` content. Navigation, search, and
  backlinks all operate within the visible content boundary. The mode is toggled from
  the command palette or toolbar and persists across route changes.

- **S4.6.3 — Player character sheet view**
  When a note is backed by a `character` object and visibility is `shared`, the player
  can view a formatted character sheet. DM notes within the object (`dmNotes` field)
  are hidden in player view. The character sheet is printable via CSS print media query.

---

## Epic 4.7 — Random Generation Suite

**Goal:** Every random-generation need a DM faces during prep or live play — names,
encounters, loot, weather, rumors, NPC personalities, dungeon rooms — is built into
the app, vault-context-aware, and immediately actionable.

**Stories:**

- **S4.7.1 — Custom random table authoring and vault storage**
  Define a `RandomTable` format: a markdown note with a special code fence containing
  weighted rows. Tables can reference other tables by name for nested rolls (e.g.,
  a `loot` table that rolls on `weapons` or `valuables`). Tables are stored as vault
  notes, tagged `random-table`, and indexed for instant lookup. The `roll_table(name)`
  MCP tool rolls any table in the vault.

- **S4.7.2 — Built-in D&D 5e table library**
  Ship a bundled library of SRD-compliant random tables: encounter tables by CR and
  terrain (dungeon, wilderness, urban), NPC personality trait / bond / flaw / ideal
  matrices, treasure hoards by CR tier, weather by climate, dungeon room contents,
  and tavern name generators. These tables live in a read-only system folder and can
  be copied into the vault for customization.

- **S4.7.3 — Vault-context-aware generation**
  When rolling on faction affiliation, NPC names, or location names, the generator
  first checks the vault for existing entries and weights them higher. New NPC names
  are checked against the existing NPC roster to prevent duplicates. Location generators
  use the active map region's cultural setting if defined. Context injection is
  computed algorithmically from the link graph, not AI.

- **S4.7.4 — Roll-table insert block in editor**
  In the editor, typing `/table [tableName]` or using the insert menu inserts a roll
  block: `{{roll: TableName}}`. In reading view, the block renders as a clickable die
  icon that rolls the table and displays the result inline. Multiple rolls show a
  history of results below the block. Results can be "accepted" to replace the block
  with the rolled text.

- **S4.7.5 — Dice macro quick-bar and NPC generator panel**
  Add a "Generator" panel accessible as a session board tile or `Ctrl+G` shortcut.
  Shows a tabbed interface: Dice Macros (quick-roll saved expressions), Tables (browse
  and roll any vault table), NPC Quick (generate name + trait + motivation in one
  click with campaign context). Generated NPCs are offered as draft character objects
  for immediate vault creation.

---

## Epic 4.8 — Handout & Digital Prop System

**Goal:** DMs can create, store, and deliver digital handouts to connected players
during a session — written letters, decoded ciphers, map fragments, rumors, and
images. Handouts are vault objects with their own lifecycle and delivery tracking.

**Stories:**

- **S4.8.1 — Handout object type and library**
  Add `handout` as a structured object type with fields: title, content (markdown),
  type (letter, map_fragment, image, cipher, rumor, document), source NPC or location
  reference, and `delivered` flag. Handouts are stored in `.vault/objects.json` and
  displayed in a Settings → Handouts library with filter by type, status, and campaign
  session. The handout list is accessible as a session board tile.

- **S4.8.2 — Handout creator with visual aging effects**
  Add a handout creation workflow in the command palette and toolbar. For text
  handouts, offer visual presentation options: parchment texture, torn-edge border,
  blood stain, burned edge, and ink blot overlays applied via CSS filters. The visual
  style is previewed in the creator before saving. Handout HTML is exportable as a
  self-contained printable document.

- **S4.8.3 — Session delivery and reveal**
  DM right-clicks any handout in the library and selects "Deliver to players". In a
  connected session, the handout appears on all player devices with an animated reveal
  (roll-out scroll, letter unfold). In disconnected mode, the handout is marked
  `delivered` and the DM is prompted to physically hand it to the player. Delivered
  handouts are visible in the player's handout inbox permanently.

- **S4.8.4 — Cipher and decoded handout workflow**
  For cipher handouts, store both encrypted (what players see first) and decoded (what
  the DM reveals when players crack it) text. The DM can reveal the decoded version
  at any time. Cipher handouts show a lock icon in the player inbox until decoded.
  Add a simple substitution cipher generator with key stored in the handout metadata.

---

## Epic 4.9 — Advanced Encounter Builder

**Goal:** The DM can construct, balance, and document encounters directly in the app
using vault stat blocks, party composition, and CR math — without leaving the session
context.

**Stories:**

- **S4.9.1 — Encounter composition UI with CR budget**
  Add an encounter builder panel (route `/encounter/new` and board tile). The DM adds
  combatants by searching vault stat blocks, specifying count per type. The panel
  computes XP budget using D&D 5e encounter difficulty math (easy/medium/hard/deadly
  thresholds for the current party), updates in real time as combatants are added,
  and shows a visual difficulty meter. Party composition is read from linked character
  objects.

- **S4.9.2 — Environment and terrain integration**
  Each encounter has an optional environment field linked to a map or location note.
  Environment type (forest, dungeon, urban, water, aerial) adjusts encounter
  modifiers (difficult terrain, visibility, lair action availability). The builder
  surfaces relevant tactical considerations as checklist items based on environment.
  Linking to a map note auto-populates the environment type from the map's metadata.

- **S4.9.3 — Legendary action and lair action tracking**
  Encounters using legendary creatures display the legendary action tracker below the
  initiative order: charges remaining (reset on the creature's turn start), each action
  as a named button with cost. Lair actions are listed with their initiative count (20)
  and fire on that count automatically. Both are linked to the stat block object and
  editable inline during play.

- **S4.9.4 — Encounter log and vault note creation**
  At encounter end, capture: combatants with HP delta, rounds elapsed, conditions
  applied, notable rolls (crits, death saves), outcome. Create a vault note from a
  template: encounter summary with linked stat block and character objects, loot
  from the CR-appropriate treasure table, and XP awards per participant. The note
  is linked to the active session timeline event.

---

---

# Initiative 5 — AI Creative Partnership

**Outcome:** The MCP agent layer is the most intelligent, context-aware, and
responsibility-respecting AI integration in any TTRPG tool. It reduces model overhead
through deep algorithmic pre-processing, enriches creative work through targeted
generation, and gives the DM complete oversight of every change.

---

## Epic 5.1 — Semantic MCP Architecture (Bundled Intelligence)

**Goal:** Replace fine-grained individual CRUD tool calls with semantically bundled,
algorithmically pre-processed endpoints that deliver rich context in single calls,
dramatically reducing model overhead.

**Stories:**

- **S5.1.1 — Algorithmic bundling strategy and caching layer**
  Design a `VaultIntelligenceCache` (in `mcp/`) that computes and caches derived
  metrics (campaign health score, coverage gap list, stale note index, link centrality
  scores) on a time+mutation budget. Cache invalidates on structural changes. Bundle
  endpoints read from cache first, only recomputing on miss.

- **S5.1.2 — Session prep bundle tool**
  `get_session_prep_bundle` returns in one call: the N most recently updated notes,
  board context for the active session board, notes tagged with current arc, stale-risk
  notes (high-backlink-count but not updated recently), and open threads. The bundle
  is pre-ranked by relevance score, not just recency.

- **S5.1.3 — Recap generation bundle tool**
  `get_recap_generation_bundle` returns: all notes created or updated since the last
  session timestamp, objects with mutations since that timestamp, dice rolls logged
  in-session, combat tracker logs, and a topic momentum score (which entities appeared
  most in recent sessions). Agents can produce a recap with a single bundle call.

- **S5.1.4 — Continuity check bundle tool**
  `get_continuity_check_bundle` returns: inconsistent NPC descriptions (same NPC, two
  conflicting notes), unresolved thread links (quest started but no resolution entry),
  orphaned factions (faction object with no linked NPC or location), and timeline gaps.
  Each inconsistency includes source note IDs and the nature of the conflict.

- **S5.1.5 — Semantic compression for large vault summaries**
  For vaults > 500 notes, bundle tools apply semantic compression: notes are scored by
  relevance to the current request context (using TF-IDF + link graph proximity), and
  only the top-K are included in full. Remaining notes appear as summaries. The model
  can request expansion of any summary via a `expand_note` call.

---

## Epic 5.2 — Vault Intelligence Engine

**Goal:** The MCP layer can quantify the health, completeness, and structural quality of
the campaign vault and surface specific, actionable improvement suggestions.

**Stories:**

- **S5.2.1 — Campaign health score algorithm**
  Compute a 0–100 health score from: link density (% notes with at least 2 links),
  object completeness (% objects with required fields filled), freshness (% recently
  updated notes relative to vault size), coverage (% objects with at least one note
  reference), and tag taxonomy consistency. Expose via `get_campaign_health`.

- **S5.2.2 — Coverage gap detection**
  Identify structural gaps: NPCs without backstory notes, locations without description
  objects, quests without resolution notes, factions without linked members. Each gap
  type has a severity score and an example note to create. `get_coverage_gaps` returns
  gaps grouped by type with count and top examples.

- **S5.2.3 — Stale note detection with recency weighting**
  Compute stale risk as: time since last update × (1 + backlink_count). Notes with many
  inbound links are higher risk when stale because more content depends on them.
  `get_stale_notes` returns notes above a threshold, ordered by stale risk score.

- **S5.2.4 — Thematic cluster analysis**
  Cluster notes by shared tags and link proximity to identify active story arcs vs.
  dormant ones. Each cluster has a "momentum score" (recent mutations / total notes in
  cluster). Surface in `get_session_prep_bundle` as arc context. This is computed via
  graph community detection (Louvain or label propagation), not AI.

---

## Epic 5.3 — Human Oversight & Staged Change Excellence

**Goal:** The staged MCP change workflow is so transparent and friction-appropriate that
DMs trust the AI layer completely — because they can always see exactly what it did and
undo it immediately.

**Stories:**

- **S5.3.1 — Semantic diff preview for all staged writes**
  Staged change previews show: structural change summary (title changed, folder moved,
  frontmatter key added), line delta count, a compact inline diff view, and the set
  of notes whose backlinks will be affected by a title change. The preview is computed
  by `StagedMcpAdapter` before writing to changelog, not lazily on display.

- **S5.3.2 — Per-agent policy configuration UI**
  Settings → MCP → Agents shows a list of agents that have made changes, with a
  per-agent policy selector: `strict_review` (all changes require approval), `balanced`
  (read-only auto-approve, structural writes require review), `trusted` (all writes
  auto-approve with audit trail). Policy is persisted in `mcpPolicySettings.perAgent`.

- **S5.3.3 — Batch approval with semantic grouping**
  The pending changes list in Settings supports: filter by agent, filter by change type
  (create/update/delete), filter by affected folder, text search across change summaries,
  and bulk approve/reject with confirmation. Dangerous operations (bulk delete, folder
  moves) are visually distinguished and require explicit individual approval.

- **S5.3.4 — Audit trail browser**
  A full audit history of all MCP-applied changes (approved, auto-approved, rejected)
  is accessible at Settings → MCP → Audit History. Each entry shows: agent ID,
  operation, affected note, policy that governed it, timestamp, and the before/after
  diff. The audit log is append-only and exportable as JSON.

- **S5.3.5 — Conflict detection and resolution UI**
  When a staged change targets a note that has been edited in the UI since the change
  was staged, flag the change as conflicted with a visual indicator. The conflict UI
  shows a three-way diff: original, AI version, and current UI version. The DM chooses:
  keep AI, keep UI, merge manually, or reject the change.

---

## Epic 5.4 — Content Generation Workflows

**Goal:** Agents can generate campaign content that is richly contextual, vault-aware,
and delivered in ready-to-use note/object format.

**Stories:**

- **S5.4.1 — NPC generation with campaign context injection**
  `create_npc_from_context` tool accepts: faction affiliation, location, personality
  traits, and role. It queries the vault for existing NPCs in that faction/location,
  avoids name collisions, and proposes a character object with backstory note. The
  generated content respects worldbuilding constraints already in the vault.

- **S5.4.2 — Encounter builder with environment and CR awareness**
  `build_encounter` tool accepts: party level, party size, location, desired difficulty,
  and tone (ambush, dramatic, puzzle). Returns a structured encounter object with
  combatant list, environment description, and tactical notes. Uses vault stat blocks
  for creatures already defined in the campaign.

- **S5.4.3 — Story hook generator from active threads**
  `generate_story_hooks` reads the open threads, recent session context, and active
  NPC motivations from the vault, then proposes N story hooks that organically connect
  existing threads. Each hook references specific vault notes as sources.

- **S5.4.4 — Post-session update workflow**
  `get_post_session_update_checklist` analyzes what happened in the session (from
  combat logs, dice history, recently opened notes) and proposes: notes to create,
  notes to update, NPC status changes, and quest progression updates. Returned as a
  structured checklist for DM review before any writes are staged.

---

## Epic 5.5 — Local AI & Offline Intelligence

**Goal:** When internet is unavailable or the user prefers privacy-first operation,
AI features degrade gracefully to powerful client-side computation. When a local LLM
runtime (Ollama, LM Studio) is running, full generative capabilities work offline.

**Stories:**

- **S5.5.1 — Local embedding model integration for offline semantic search**
  Integrate with the Ollama REST API (`/api/embeddings`) to compute local text
  embeddings for vault notes. When a local embedding model is available, the semantic
  search toggle (S3.3.5) routes to the local model instead of a cloud API. The
  embedding index is stored in `.vault/embeddings.bin` (float32 vectors) and updated
  incrementally on note saves. Dimension size adapts to the configured model.

- **S5.5.2 — Local LLM routing and capability detection**
  Implement a `ModelRouter` in `mcp/` that detects available AI backends in priority
  order: Claude API (cloud), Ollama (local), client-side TF-IDF fallback. Each MCP
  tool that calls an AI model accepts a `modelBackend` parameter. The router exposes
  capability flags (`supportsGeneration`, `supportsEmbeddings`, `maxContext`) so tools
  can gracefully skip AI-only features rather than erroring. Backend status is shown
  in Settings → AI → Model Status.

- **S5.5.3 — Client-side algorithmic fallbacks for bundle tools**
  All semantic bundle tools (session prep, recap, continuity check) have a non-AI
  fallback computation path using TF-IDF scoring, recency weighting, link graph
  centrality, and rule-based heuristics. The fallback runs in the renderer process
  without any external call. AI-enhanced versions augment the algorithmic base, not
  replace it. Document the fallback algorithms in `docs/AGENTIC_NOTES_WORKFLOW.md`.

- **S5.5.4 — Ollama model management UI**
  Add Settings → AI → Local Models showing: detected Ollama installation status, list
  of pulled models with their capability tags (chat, embed, vision), and a pull/delete
  UI. Recommend a default set of models: one embed model (`nomic-embed-text`) and one
  chat model (`llama3.2`). Display estimated disk usage and warn if available space
  is low. Link to Ollama download if not detected.

---

---

# Initiative 6 — Multi-Platform Distribution

**Outcome:** DND Tools runs excellently on desktop (Windows, macOS, Linux), Android
(sideloaded APK), and in any modern browser. The desktop experience is polished,
signed, and self-updating. The mobile experience is native-feeling and offline-capable.
The app is fully accessible to users with disabilities.

---

## Epic 6.1 — Desktop Shell Hardening

**Goal:** The packaged desktop app is signed, self-updating, fully self-contained (no
external runtime dependencies), and hardened against common Electron security vectors.

**Stories:**

- **S6.1.1 — Code-signed build pipeline**
  Configure `electron-builder` with code signing for Windows (EV certificate or
  self-signed with install instructions), macOS (Developer ID + Notarization), and
  Linux (AppImage + .deb). Add signing to the CI release pipeline. Document the
  certificate management process in `docs/RELEASE.md`.

- **S6.1.2 — Auto-update with staged rollout**
  Integrate `electron-updater` with GitHub Releases as the update server. Support
  differential updates. Add update readiness UI: Settings → About → "Update available"
  with changelog preview and "Update now / Remind later" controls. Support staged
  rollout (% of users per day) for major releases.

- **S6.1.3 — Bundled MCP sidecar runtime**
  Package a Node.js runtime (via `@yao-pkg/pkg` or Electron's bundled Node) with the
  MCP sidecar so no external `node` binary is required. Update `electron/mcp-sidecar.ts`
  to use the bundled binary path with a fallback to system Node in development mode.
  Add startup validation that the bundled runtime is intact and the correct version.

- **S6.1.4 — Vault lifecycle UX improvements**
  Add: recent vault list with last-opened date and health indicator, graceful handling
  of last vault being unavailable (startup selector, not crash), vault switch with
  progress/rollback, and vault permission checks with clear remediation instructions.

---

## Epic 6.2 — Android Build & Sideload Pipeline

**Goal:** DND Tools ships as an Android APK that can be sideloaded, provides a
first-class mobile experience, and uses the same application code as the desktop app.

**Stories:**

- **S6.2.1 — Capacitor integration and Android project scaffolding**
  Integrate Capacitor into the SvelteKit project. Configure `capacitor.config.ts` for
  DND Tools. Initialize the Android platform (`npx cap add android`). Establish the
  build pipeline: `pnpm build` → `npx cap sync` → Android Studio / Gradle release build.
  Document this in `docs/MOBILE.md`.

- **S6.2.2 — Android filesystem adapter via Capacitor Filesystem plugin**
  Implement a `CapacitorStorageAdapter` in `src/lib/platform/storage/capacitor-adapter.ts`
  that uses the Capacitor Filesystem plugin for vault reads/writes. The adapter
  implements the same `StorageAdapter` interface as the Electron adapter. MCP sidecar
  is not available on Android; vault intelligence features gracefully degrade to
  client-computed equivalents.

- **S6.2.3 — Mobile-first navigation patterns**
  Add a bottom navigation bar for mobile (replacing sidebar in the < 768px breakpoint):
  Notes, Search, Graph, Session, Settings. Add swipe-left/right for back/forward. All
  current sidebar modes (folder tree, recent, favorites) are accessible via a slide-up
  sheet from the bottom bar.

- **S6.2.4 — Virtual keyboard adaptation**
  Detect soft keyboard open/close via `visualViewport` API. Dock the editor toolbar
  above the keyboard. Ensure cursor remains visible with `scrollIntoView`. Disable
  fixed-position elements that interfere with keyboard-obscured layouts. Add E2E
  simulator tests for keyboard layouts.

- **S6.2.5 — APK signing pipeline and sideload guide**
  Generate a release keystore and store it in GitHub Secrets. Configure Gradle release
  signing. Produce a signed APK artifact in CI on release tags. Write `docs/SIDELOAD.md`
  with step-by-step instructions for enabling unknown sources, installing the APK, and
  selecting a vault directory on Android.

---

## Epic 6.3 — Offline-First Sync Architecture

**Goal:** The app works completely without internet access. When connectivity is
available, sync operations are transparent, non-blocking, and conflict-safe.

**Stories:**

- **S6.3.1 — Sync status indicators and offline mode detection**
  Add a persistent sync status indicator in the top bar: online/offline/syncing/error
  states. Offline detection uses `navigator.onLine` + periodic ping. In offline mode,
  all write operations are queued for sync on reconnect. No UI operation is blocked by
  sync state.

- **S6.3.2 — Offline write queue with deferred sync**
  When offline, local writes succeed immediately and are added to a sync queue stored
  in the vault. On reconnect, the queue is replayed against the cloud state with
  conflict detection. The queue is persistent across app restarts.

- **S6.3.3 — Conflict resolution model for offline edits**
  When the same note is modified both locally (offline) and remotely (by another
  client), present a conflict resolution UI: three-way diff (local, remote, ancestor),
  choose winner or merge manually, and a "use latest" automatic mode configurable in
  settings.

---

## Epic 6.4 — Accessibility Compliance Program

**Goal:** DND Tools meets WCAG 2.1 AA across all routes and primary workflows for all
user groups — including users who rely on keyboard navigation, screen readers, or
reduced motion.

**Stories:**

- **S6.4.1 — WCAG 2.1 AA audit and gap register**
  Run automated axe scans on every route and manually audit the 10 highest-impact
  workflows. Document all gaps in `docs/ACCESSIBILITY.md` with WCAG criterion,
  severity (blocker/major/minor), and remediation owner. Update this register after
  every release.

- **S6.4.2 — Automated accessibility tests in CI**
  Integrate `axe-playwright` into the E2E test suite. Assert zero violations at
  `critical` and `serious` severity for all primary routes on every PR. This gate
  blocks merges when it fails. Add to the CI workflow alongside the existing E2E stage.

- **S6.4.3 — Full keyboard reachability for all major workflows**
  Audit and fix: focus traps in modals/dialogs, missing `aria-label` on icon buttons,
  unreachable command palette items, and non-focusable interactive elements. Every
  primary workflow (create note, link, search, open entity, session board) is
  completable keyboard-only.

- **S6.4.4 — Screen reader QA pass**
  Test all primary workflows in NVDA (Windows) and VoiceOver (macOS). Document
  failures. Fix: route change announcements, live region updates for async operations
  (search results, save confirmation), and semantic heading hierarchy per route.

- **S6.4.5 — Touch target and motion audit**
  Enforce minimum 44×44px touch targets across all interactive elements. Audit all
  animations and transitions for `prefers-reduced-motion` compliance. Add a CI check
  that scans for interactive elements below the size threshold.

---

## Epic 6.5 — Progressive Web App & Browser Support

**Goal:** DND Tools is fully functional as an installable PWA in modern browsers —
no Electron required. This enables access from Chromebook, iOS Safari, and any device
without app installation. Storage uses IndexedDB; sync is optional via cloud.

**Stories:**

- **S6.5.1 — Service worker with offline-first cache strategy**
  Add a Vite PWA plugin configuration implementing a `StaleWhileRevalidate` strategy
  for app shell assets and a `CacheFirst` strategy for static resources. The service
  worker pre-caches all route JS/CSS bundles at install time. Vault data reads from
  IndexedDB — no network access required after initial install. Add an "app is offline"
  indicator when the service worker is serving from cache exclusively.

- **S6.5.2 — IndexedDB storage adapter as browser fallback**
  Implement `IndexedDbStorageAdapter` in `src/lib/platform/storage/indexeddb-adapter.ts`
  satisfying the full `StorageAdapter` interface. Vault notes, objects, settings,
  session boards, and changelog all map to Dexie tables. The bootstrap module detects
  the absence of `window.dndtoolsDesktop` and uses the IndexedDB adapter
  automatically. File-based vault operations (import/export) use the browser File
  System Access API with graceful fallback to `<input type="file">`.

- **S6.5.3 — PWA install and manifest**
  Configure `manifest.webmanifest` with: name, short_name, icons (192px, 512px,
  maskable), theme_color, background_color, display: `standalone`, start_url, and
  screenshots for the app store listing. Add an in-app install prompt that appears
  after the user has opened 3 notes (not immediately). Test install flow on Chrome
  Desktop, Chrome Android, Safari iOS, and Edge.

- **S6.5.4 — Browser-mode feature parity audit**
  Document all features that require Electron and are unavailable in browser mode:
  filesystem vault selection, MCP sidecar, auto-update, native notifications. For each
  gap, define the browser-mode behavior: cloud vault replaces filesystem; MCP features
  degrade to client-side algorithmic fallbacks; notifications use Web Notifications
  API. Add a "browser mode" indicator in Settings showing which features are limited.

---

---

# Initiative 7 — Collaborative Infrastructure

**Outcome:** Groups of DMs and players can share a live session from any device. The
DM controls what content is visible, and that content appears in real time for players.
This works over the internet via AWS or over LAN via direct P2P — with no required
server for the local case.

---

## Epic 7.1 — AWS Backend Foundation

**Goal:** A secure, scalable AWS backend enables vault sync, user identity, and the
real-time session channel for remote groups.

**Stories:**

- **S7.1.1 — AWS architecture and infrastructure-as-code**
  Define the AWS infrastructure in CDK or Terraform: Cognito user pool (email + OAuth),
  S3 bucket per user for vault storage (server-side KMS encryption), DynamoDB for vault
  metadata and session state, API Gateway + Lambda for REST endpoints, and API Gateway
  WebSocket for the real-time channel. Infrastructure is committed to `infra/` in the
  repo.

- **S7.1.2 — Authentication flow (sign-up, sign-in, MFA)**
  Implement in-app auth using Cognito: email/password sign-up with email verification,
  sign-in with JWT token management, optional TOTP MFA, and token refresh. Auth state is
  managed in a dedicated auth store, not mixed with vault state. All tokens are stored in
  secure platform storage (Keychain/Credential Store), never localStorage.

- **S7.1.3 — Vault-to-cloud sync with conflict resolution**
  On cloud account connection, vault files sync to the user's S3 bucket with: incremental
  delta sync (only changed files), versioned S3 objects for rollback, and client-side
  encryption before upload using a user-controlled key. Sync status is visible in Settings.

- **S7.1.4 — End-to-end encryption for cloud vault content**
  Derive a per-vault encryption key from the user's password + server-stored salt
  (PBKDF2). Encrypt all vault content before S3 upload. The server never sees
  plaintext vault content. Key rotation is supported with re-encryption workflow.

---

## Epic 7.2 — Real-Time Session Sync

**Goal:** Multiple participants can share a live session view. The DM controls what is
revealed, and players see it in real time.

**Stories:**

- **S7.2.1 — Session channel over WebSocket**
  Implement a session channel using API Gateway WebSocket API. Session lifecycle:
  DM creates session (gets session code), players join with code, DM is session owner
  with elevated permissions. Session state (active board, revealed notes) is stored in
  DynamoDB and pushed to all connected clients on mutation.

- **S7.2.2 — Collaborative session board (DM-controlled)**
  The DM's active session board is mirrored to all connected players in real time. DMs
  can mark individual tiles as "player visible" or "hidden". Players see the board with
  only their permitted tiles. Tile reveal is animated for players (fade in, not flash).

- **S7.2.3 — Live entity reveal workflow**
  DM right-clicks any note or object and selects "Reveal to players". The content
  appears on connected players' devices with a subtle reveal animation. Reveal state
  is persisted in session state so newly joining players see already-revealed content.

- **S7.2.4 — Presence awareness and reconnect handling**
  Show connected player avatars (initials/icon) in the DM's session panel with
  online/away/disconnected status. Clients auto-reconnect with exponential backoff.
  Session state is cached locally so players can continue reading revealed content
  while offline.

---

## Epic 7.3 — P2P Direct Connection (LAN / Serverless)

**Goal:** Local groups can run a full collaborative session entirely without internet
access or AWS account, using direct device-to-device communication.

**Stories:**

- **S7.3.1 — WebRTC P2P session channel**
  Implement a P2P session channel using WebRTC data channels. One device acts as host
  (DM); others join. Data channel carries the same session state protocol as the
  WebSocket channel so the session logic is shared. A STUN server (public) handles
  NAT traversal for LAN scenarios.

- **S7.3.2 — Local network discovery via mDNS**
  On LAN, advertise the session via mDNS (`_dndtools._tcp.local`) so other devices on
  the same network can discover and join without a session code. Show a "devices on
  your network" list in the session join UI. mDNS discovery is Electron-only on
  desktop; mobile uses QR code.

- **S7.3.3 — QR code session invitation**
  The DM's session panel generates a QR code containing the session connection
  parameters (host hint, session ID, auth token). Players scan with the mobile app and
  join instantly. QR codes work for both P2P (encode local address) and cloud sessions
  (encode session code).

- **S7.3.4 — P2P security model (session keys, trust)**
  Each session generates a short-lived symmetric key exchanged via the QR code or
  session code. All P2P data channel messages are encrypted with this key. The DM can
  revoke player access by rotating the session key. Document the threat model in
  `docs/SECURITY.md`.

---

## Epic 7.4 — Player Client Experience

**Goal:** Players have a first-class, purpose-built experience that shows them the right
content at the right time and keeps them engaged between the DM's reveals.

**Stories:**

- **S7.4.1 — Player-optimized UI mode**
  When joining as a player, the app enters player mode: simplified navigation, character
  sheet as the home screen, session board showing only shared tiles, and a "DM is
  typing..." indicator when the DM is updating a shared note. Player mode is also
  available without a connection (for reading pre-shared content).

- **S7.4.2 — Player character sheet synchronization**
  Players edit their own character sheets locally. The DM can view (but not edit)
  player character sheets. When connected, character sheet updates sync in real time.
  HP changes from combat are broadcast to all connected players for the party HP
  overview panel.

- **S7.4.3 — Player private journal**
  Each player has a private notes section that is never shared with the DM or other
  players. Private notes are stored locally only (no sync to DM's vault). The journal
  uses the same markdown editor as the main app.

- **S7.4.4 — Party overview shared panel**
  A shared party panel (visible to all connected participants) shows: party member
  names, current HP bars, conditions, and current location. The DM controls location;
  players control their own HP. This panel is embeddable as a session board tile.

---

## Epic 7.5 — Async Content Sharing & Campaign Wiki

**Goal:** DMs can share specific vault content with players between sessions via a
read-only link — no account required for readers. The shared content is a live,
always-current view of the permitted vault notes.

**Stories:**

- **S7.5.1 — Shareable read-only vault links**
  DMs can right-click any note, folder, or saved search and select "Share link".
  The backend generates a signed read-only token scoped to the selected content.
  The link renders a clean, distraction-free reading view of the shared content at
  a stable URL (`app.dndtools.io/share/{token}`). Links have configurable expiry:
  permanent, 30 days, or session-scoped. Revocation invalidates all existing tokens
  for that content scope.

- **S7.5.2 — Public campaign wiki subdomain**
  DMs can publish their entire vault (or a tagged subset) as a public wiki at a
  configurable subdomain: `{username}.dndtools.app/{campaign-slug}`. The wiki
  renders only notes with `visibility: public`. Navigation follows wikilinks.
  Search is available. Updates sync from the vault automatically on next cloud sync.
  The wiki is static HTML generated server-side for SEO and performance.

- **S7.5.3 — Between-session player inbox**
  Each connected player has a persistent inbox showing: newly revealed notes (since
  last session), delivered handouts, and the DM's shared announcements. Items are
  ordered by reveal time. Players can mark items read. The inbox is accessible without
  a live session connection — it reads from the cloud vault state.

- **S7.5.4 — Session recap publishing workflow**
  After a session, the DM can run a one-click recap workflow: AI (or algorithmic)
  summary is generated, reviewed, and published to the campaign wiki as a session
  log entry. Players receive an inbox notification. The recap note is automatically
  tagged `session-log` and linked to the session's timeline event. Published recaps
  can be commented on by players (comments stored in cloud, not vault).

---

## Epic 7.6 — Multi-Device Sync UX & Conflict Resolution

**Goal:** When a DM uses multiple devices (laptop at home, tablet at the table,
phone for quick lookups), vault state stays consistent, conflicts are surfaced
clearly, and the sync experience never gets in the way of playing.

**Stories:**

- **S7.6.1 — Per-note sync status indicators**
  Every note in the vault has a sync status badge: synced (cloud icon), local-only
  (lock icon), pending upload (clock icon), conflict (warning icon). Status is
  computed from the cloud sync manifest and updated in real time. The sidebar note
  list shows status badges. Bulk status summary is visible in Settings → Sync.

- **S7.6.2 — Three-way conflict resolution UI**
  When a note is modified on two devices between syncs, present a structured conflict
  resolution screen: unified three-way diff (local, remote, last-common-ancestor)
  with line-level highlighting. Actions: accept local, accept remote, merge manually
  in split editor, or defer for later. Deferred conflicts remain flagged in the
  sidebar. Conflict resolution creates a new history entry preserving both versions.

- **S7.6.3 — Sync bandwidth optimization**
  Implement delta-sync: only upload/download the changed bytes of a note, not the
  full file. For large vaults, compute a Merkle tree of note hashes and sync only
  the changed subtrees. Track sync bandwidth used per session in Settings → Sync →
  Usage. Add a "sync budget" option for metered connections (max MB per day).

- **S7.6.4 — Vault version history browser**
  Each note in the cloud vault has a version history going back configurable retention
  (default: 90 days). Add a history browser in the note header: timeline of edits
  with device, timestamp, and change size. Any version can be previewed or restored.
  Bulk version purge is available in Settings → Sync → Storage Management.

---

---

# Initiative 8 — Extensibility & Ecosystem

**Outcome:** DND Tools is a platform, not just an application. Campaign systems,
content types, and integrations are modular. A plugin author can add a new object type,
a toolbar action, or a content source without modifying core code. The community can
share and discover extensions.

---

## Epic 8.1 — Plugin Architecture & Sandbox

**Goal:** Plugins extend the app with new capabilities without compromising security or
stability. Each plugin declares what it needs and is sandboxed to what it declared.

**Stories:**

- **S8.1.1 — Plugin manifest schema and capability declaration**
  Define `plugin.manifest.json`: id, name, version, author, entryPoint, and capabilities
  list (`object_types`, `toolbar_actions`, `render_hooks`, `command_contributions`,
  `mcp_tools`). Capabilities are enumerated, not open-ended. The manifest is validated
  on install against a JSON Schema.

- **S8.1.2 — Plugin sandbox via Web Worker + Comlink**
  Execute plugin code in a dedicated Web Worker. Expose a restricted plugin API via
  Comlink: `vault.read(noteId)`, `vault.search(query)`, `editor.insertSnippet(text)`,
  `ui.registerCommand(def)`, `objects.register(typeDef)`. Vault writes require the
  `write_access` capability and route through the staged MCP write model.

- **S8.1.3 — Plugin registry UI (install, configure, disable)**
  Add Settings → Plugins: list of installed plugins with name, version, author,
  capability badges, and enable/disable/remove controls. Plugin install accepts a
  folder path (local development) or a future registry URL. Plugin settings panels are
  rendered from plugin-declared configuration schemas.

- **S8.1.4 — Plugin lifecycle hooks**
  Support hooks: `onNoteCreate(note)`, `onNoteSave(note, diff)`, `onRender(content)` →
  transformed content, `onExport(notes)` → modified export. Hooks are async and
  time-limited (5s timeout with graceful skip). Multiple plugins can register the
  same hook; execution order is deterministic (install order).

- **S8.1.5 — Plugin developer SDK and example plugin**
  Publish a `@dndtools/plugin-sdk` package with TypeScript types for the plugin API,
  a CLI scaffold command (`pnpm create dndtools-plugin`), and an example plugin
  demonstrating object type registration, toolbar action, and render hook. Document
  in `docs/PLUGIN_SDK.md`.

---

## Epic 8.2 — Campaign System Modules

**Goal:** The D&D 5e object types, condition lists, and CR tables are one campaign
system module among many. Swapping systems is a vault setting, not a code change.

**Stories:**

- **S8.2.1 — Campaign system module interface**
  Define a `CampaignSystemModule` interface: `id`, `name`, `objectSchemas` (map of
  type → Zod schema), `conditionsList`, `challengeRatingTable`, `defaultTemplates`,
  and `displayNames`. Modules are loaded at vault open from `settings.json` or from a
  plugin.

- **S8.2.2 — D&D 5e as first campaign system module**
  Refactor the current hardcoded 5e assumptions (condition list, CR table, stat block
  fields, character class names) into a `systems/dnd5e.ts` module. All code that reads
  system-specific data must go through the `CampaignSystemModule` interface.

- **S8.2.3 — Generic / narrative system module**
  Add a minimal `systems/generic.ts` for system-agnostic campaigns: no stat blocks,
  no CR, simple character sheets with freeform fields. This is the fallback for
  non-mechanical or narrative-first campaigns.

- **S8.2.4 — Campaign system selector in vault settings**
  Add Settings → Vault → Campaign System: a dropdown of available modules (built-in +
  plugin-provided). Switching systems migrates existing objects to the new schema with
  a dry-run preview. The current system is stored in `.vault/settings.json`.

---

## Epic 8.3 — Custom Object Types & Schema Registry

**Goal:** Users can define their own object types for campaign-specific entities (e.g.,
"Ship", "Deity", "Faction Treaty") without writing code.

**Stories:**

- **S8.3.1 — Custom object type definition UI**
  Add Settings → Object Types → New Type. Users define: type name, icon, fields (each
  with name, label, type, required/optional). Field types: text, number, boolean,
  tag-list, note-reference, relationship. The definition is saved to `.vault/object-
types.json`.

- **S8.3.2 — JSON Schema-backed field definitions**
  Custom type definitions compile to JSON Schema for runtime validation. The structured
  editor renders custom types using a generic form renderer driven by the schema. MCP
  tools accept custom objects and validate them against their schema before writing.

- **S8.3.3 — Schema registry for sharing custom types**
  Users can export their custom type definitions as a shareable `.dndtools-types.json`
  file. Another user imports the file to add those types to their vault. The registry
  also supports publishing to a future community type directory.

---

## Epic 8.4 — External Compendium Integrations

**Goal:** DMs can pull monster stats, spells, items, and lore directly from external
sources into their vault without copy-pasting.

**Stories:**

- **S8.4.1 — Open5e API integration**
  Add a compendium search panel (accessible via command palette: `> compendium`)
  querying the public Open5e API for monsters, spells, items, and conditions. Results
  can be imported as vault objects (stat_block for monsters, item for equipment) or as
  plain notes. Import is offline-safe: imported content is stored locally.

- **S8.4.2 — Compendium import-to-object workflow**
  Importing a compendium entry: maps API fields to vault object schema, shows a preview
  of the object that will be created, and offers field-by-field editing before saving.
  Import creates the object and a linked note. Subsequent imports of the same entry
  offer a "re-sync" option to update the local object.

- **S8.4.3 — Extension interface for additional compendium sources**
  Define a `CompendiumSource` plugin interface: `search(query)`, `get(id)`,
  `mapToVaultObject(entry)`. Any plugin can register a compendium source. The built-in
  Open5e integration is itself implemented as a `CompendiumSource`. Document the
  interface in `docs/PLUGIN_SDK.md` under "Compendium Sources".

---

## Epic 8.5 — Theme & Design System

**Goal:** The visual design system is token-complete, customizable, and documented.
Users can choose from curated themes and power users can override any token.

**Stories:**

- **S8.5.1 — Consolidated design token system**
  Audit and consolidate all CSS custom properties in `src/app.css` into a semantic
  token hierarchy: color roles (surface, content, accent, danger), spacing scale,
  typography scale, border radius scale, shadow scale. No component references a raw
  value — everything goes through tokens.

- **S8.5.2 — Built-in theme pack**
  Ship 4 built-in themes: Default Dark (current), Default Light, Parchment (warm sepia
  reading-oriented), and High Contrast (WCAG AAA for accessibility). Theme selection
  is in Settings → Appearance. Themes are implemented as CSS custom property overrides.

- **S8.5.3 — User-defined theme tokens**
  Add a Settings → Appearance → Custom Theme panel where users override any token
  value via a key/value editor with live preview. Custom theme is stored in
  `settings.json`. Provide an "Export theme" / "Import theme" JSON function for
  sharing.

- **S8.5.4 — Layout density and typography options**
  Add: layout density (compact / comfortable / spacious) controlling spacing scale
  multiplier; font family selector (System UI / Serif / Monospace / Custom); and base
  font size control. These are stored in settings and applied as root CSS variable
  overrides. Critical for mobile where spacious layout wastes precious vertical space.

---

## Epic 8.6 — Developer API, Webhooks & External Tool Integration

**Goal:** Third-party tools, automation scripts, and community integrations can
subscribe to vault events and interact with vault data through a documented, versioned
API — without requiring a full plugin installation.

**Stories:**

- **S8.6.1 — Local REST API for vault operations**
  When running in desktop mode, expose an opt-in local REST API on a configurable
  localhost port. Endpoints mirror the MCP tool surface: `GET /notes`, `POST /notes`,
  `PUT /notes/{id}`, `GET /search`, `GET /objects`, etc. API is versioned (`/v1/`).
  Auth uses a locally-generated API key stored in settings. Document the full API in
  `docs/API.md`. This enables power-user scripts, Alfred/Raycast integrations, and
  community tools.

- **S8.6.2 — Webhook event subscriptions**
  Add a webhook system that fires HTTP POST callbacks on vault events: `note.created`,
  `note.updated`, `note.deleted`, `object.created`, `session.started`, `mcp.approved`.
  Webhook endpoints are configured in Settings → Integrations → Webhooks. Each
  webhook fires with a signed payload (HMAC-SHA256 using the API key). Add retry with
  exponential backoff for failed deliveries. Webhook delivery log is browsable in
  Settings.

- **S8.6.3 — Zapier / Make / n8n integration template**
  Publish a Zapier integration (or Make module) with triggers and actions built on
  the webhook and REST API. Provide starter templates for common automations: "new
  session note → send Discord message", "new NPC object → add to Notion tracker",
  "session start → start Google Meet". Document these integrations in
  `docs/INTEGRATIONS.md`.

- **S8.6.4 — CLI companion tool**
  Build a `dndtools` CLI (`npm install -g @dndtools/cli`) wrapping the local REST API.
  Commands: `dndtools note list`, `dndtools note create --template <name>`,
  `dndtools search "<query>"`, `dndtools export --format zip`. The CLI enables
  scripting and automation from the terminal. CI-friendly: exits with correct codes,
  outputs JSON by default with `--pretty` flag. Publish to npm with docs.

---

## Epic 8.7 — Internationalization & Localization Platform

**Goal:** All user-facing strings are externalized, the app ships in at minimum 5
languages, and the localization pipeline enables community contributions. The global
TTRPG community should not be gated behind English.

**Stories:**

- **S8.7.1 — String externalization and i18n framework integration**
  Adopt `@inlang/paraglide-js` (or equivalent Svelte-native i18n library). Extract
  all hardcoded user-facing strings across `src/` into message files under
  `src/lib/i18n/messages/`. Enforce no hardcoded strings via a lint rule. Add CI
  check that new strings have message keys. Launch with English as the only locale
  but with full extraction complete.

- **S8.7.2 — Locale-aware formatting for dates, numbers, and units**
  Wrap all `Date` formatting, number display (HP numbers, CR fractions, distances),
  and unit labels (feet/meters toggle) in locale-aware formatter functions from
  `Intl.NumberFormat` and `Intl.DateTimeFormat`. All in-world calendar dates use
  the custom formatter from I3.E7. No raw `toLocaleDateString()` calls outside
  designated formatter modules.

- **S8.7.3 — RTL layout compatibility**
  Add RTL layout support for Arabic, Hebrew, and other RTL locales. CSS uses logical
  properties (`margin-inline-start` not `margin-left`) throughout. Test RTL layout
  in all primary routes using Chrome's RTL emulation flag. The graph view, board
  layout, and editor toolbar adapt correctly. Add an RTL smoke test to the
  accessibility E2E suite.

- **S8.7.4 — Community translation workflow**
  Set up a Weblate (or Crowdin) project for community-contributed translations.
  Add a language selector to Settings → Appearance. Priority locales: Spanish,
  French, German, Brazilian Portuguese, Japanese. Each locale ships when it reaches
  90% string coverage. Add a locale status badge in the Settings language selector
  showing translation completeness for each language.

---

---

# Initiative 9 — Maps & Spatial Intelligence

**Outcome:** DND Tools has first-class, interactive map support. DMs manage world
maps, dungeon maps, and city maps with linked notes. Combat happens on a grid with
tokens. Players see only the revealed portions of maps. Every map is a live,
interactive layer of the knowledge graph.

**Why this matters:** TTRPG play is fundamentally spatial. A map is often the first
artifact created for a campaign and the last one consulted at the table. Without
maps, the app cannot be the definitive TTRPG tool. Maps also unlock a new dimension
of the object graph — locations are not just text, they are anchored in space.

---

## Epic 9.1 — Map Asset Manager & Viewer

**Goal:** DMs can import any image as a map, organize maps in a library, and view
them with pan/zoom controls that work as well on a tablet at the table as on a
desktop during prep.

**Stories:**

- **S9.1.1 — Map import and metadata**
  Add a `/maps` route and a map library. Maps are imported as image files (PNG,
  JPEG, WebP, SVG up to 50MB). Import stores the image in `.vault/assets/maps/`
  and creates a `map` object in `.vault/objects.json` with fields: name, file path,
  scale (units per grid square, optional), area (linked location note), and tags.
  The map library shows thumbnails in a responsive grid with filter by tag and area.

- **S9.1.2 — Tiled pan/zoom viewer with smooth performance**
  Implement the map viewer using HTML Canvas or WebGL with tiled rendering so large
  maps (8k+ resolution) remain performant on modest hardware. Pan with drag, zoom
  with scroll wheel or pinch gesture. Zoom levels: fit-to-screen, 100%, 200%.
  Keyboard: arrow keys to pan, `+/-` to zoom, `0` to reset. The viewer component
  is reusable as a session board tile with configurable initial zoom and position.

- **S9.1.3 — Grid overlay configuration**
  Add a grid overlay system supporting square and hex grids. The DM aligns the grid
  to the map by dragging control points for the top-left corner and setting cell
  size. Grid settings are stored in the map object. The grid can be shown/hidden at
  runtime without losing alignment. Scale label shows real-world distance if scale
  is defined (e.g., "1 square = 5 ft").

- **S9.1.4 — Map object relationship in knowledge graph**
  Each `map` object is a first-class node in the vault graph. Map notes link to
  location notes. Location notes link back to maps. The MCP `get_link_graph` response
  includes map objects and their location edges. `get_session_prep_bundle` includes
  the active map if a location is pinned in the session context panel.

---

## Epic 9.2 — Points of Interest & Note Linking

**Goal:** Every meaningful location on a map is a pin linked to a vault note or
object. Clicking a pin opens the linked content. Creating a note from a pin anchors
it spatially. Maps become a navigation surface for the knowledge graph.

**Stories:**

- **S9.2.1 — POI pin placement and management**
  In map edit mode, click anywhere to place a POI pin. Pins have: label, category
  (city, dungeon, landmark, structure, secret, encounter), optional linked note ID,
  and optional linked object ID. Pins are stored in the map object's `pois` array
  with `{x, y}` as fractions of map dimensions (resolution-independent). Pins can
  be dragged, deleted, and grouped by category with distinct icons.

- **S9.2.2 — POI hover preview and navigation**
  Hovering a POI pin shows a popover with the pin label and the first three lines of
  the linked note (or key fields from the linked object). Click navigates to the note
  in a split-pane view without leaving the map. `Ctrl+click` opens in a modal overlay.
  Pins without linked content show a "create note" affordance that pre-fills the note
  title with the pin label and links back to the map.

- **S9.2.3 — Reverse link: note → map pin**
  Every note linked from a POI shows a "Located on map" badge in the reading header
  with the map name and a click-to-navigate link. Location notes with a `mapId` and
  `mapPosition` frontmatter field render a minimap thumbnail showing their position.
  MCP `get_backlinks` for a location note includes its map pins as a special
  `map_placement` link type with coordinates.

- **S9.2.4 — Layer system for map annotations**
  Maps support multiple named annotation layers (e.g., "DM Notes", "History",
  "Quest Markers"). Each layer has a visibility toggle and a color theme. The DM
  can show/hide layers independently. In player-facing mode, only layers marked
  `player_visible` are shown. Layers are stored as arrays in the map object.

---

## Epic 9.3 — Combat Grid & Token Management

**Goal:** Initiative-order combat can be run directly on the map with token placement,
movement ranges, and AoE templates overlaid on the grid. The combat tracker (I4.2)
and the map viewer are synchronized.

**Stories:**

- **S9.3.1 — Token placement linked to combatants**
  In combat mode on a gridded map, each combatant in the initiative tracker has a
  corresponding token on the map. Tokens are auto-created when combat begins if the
  map is linked to the encounter location. Token appearance: initials avatar (fallback)
  or linked image from the character/stat block object. Token position is stored in
  the combat session state, not the vault.

- **S9.3.2 — Movement and range indicators**
  Clicking a token shows its movement range as a highlighted grid overlay (speed ÷
  5 = squares). Clicking a target square shows the path (shortest path avoiding
  other tokens). Movement costs for difficult terrain are applied if the DM has
  painted terrain overlays. Range display also shows spell/attack range for the
  selected combatant's equipped weapon or prepared spell.

- **S9.3.3 — Area of effect template overlays**
  A template toolbar in combat mode offers: sphere (radius in squares), cone (60°),
  line (width × length), and cube. Templates are placed by clicking the origin point
  and dragging. Templates highlight affected grid squares. Multiple templates can
  coexist. Templates are dismissed when combat ends or manually. AoE templates
  respect the current grid cell size for accurate coverage.

- **S9.3.4 — Condition and status token indicators**
  Conditions applied in the initiative tracker (Epic 4.2.2) appear as small overlaid
  icons on the corresponding map token (skull for dead, snowflake for frozen, etc.).
  HP bar appears below each token: full green → orange → red → 0. Clicking a token
  on the map selects it in the initiative tracker and vice versa — the two views
  stay synchronized.

- **S9.3.5 — Combat map session persistence**
  The active combat map state (token positions, AoE templates, terrain overlays,
  fog state) is saved in the session board's state and restored if the app is closed
  mid-combat. Combat history log records each movement and status change. Post-combat,
  the state is archived with the encounter log note (Epic 4.9.4).

---

## Epic 9.4 — Player Fog of War & Map Reveal

**Goal:** DMs control exactly what players see on maps during a connected session.
Unexplored areas are hidden by a fog layer. Revealing is intuitive, animated, and
persistent so late-joining players see the same revealed state.

**Stories:**

- **S9.4.1 — Fog of war layer with DM paint tools**
  In DM mode, a fog layer covers the entire map by default (black or smoky grey, DM
  configurable). DM uses paint tools to reveal areas: circular brush, rectangle, and
  polygon lasso. Reveal painting is additive. An "undo reveal" brush can re-fog
  areas. The fog state is stored per map in the session board state as a compact
  polygon set (not a raster image).

- **S9.4.2 — Player view shows only revealed areas**
  In the player-facing map view (connected session or shared link), the fog layer
  is rendered client-side using the DM's polygon set. Unrevealed areas show a grey
  fog texture. The reveal boundary has a soft edge (5px feathered). Players cannot
  pan or zoom outside the revealed area unless the DM grants "free explore" mode.
  The player map view is the same component as the DM view with fog enforcement
  applied at the rendering layer, not the data layer.

- **S9.4.3 — Animated reveal for live sessions**
  When the DM reveals an area during a connected session, the reveal propagates to
  all player devices with a fade-in animation (0.8s ease-out). Sound effect support:
  if the atmosphere engine (I11) is active, reveal triggers an optional "reveal" audio
  cue. The reveal animation respects `prefers-reduced-motion`. Reveal events are
  appended to the session event log.

- **S9.4.4 — Map reveal state persistence and late-join recovery**
  Fog state is stored in DynamoDB as part of session state (cloud sessions) or the
  P2P session manifest (local sessions). Players who join mid-session receive the
  current fog state immediately. Fog state is also saved to the vault at session end
  so it is available for continued future sessions on the same map.

---

## Epic 9.5 — World Atlas & Region Hierarchy

**Goal:** Maps are organized in a navigable hierarchy: world → continent → region →
city → building floor. Navigating between scales follows the POI link graph. The DM
always knows where in the world the party is, and that context flows into the
AI bundle tools.

**Stories:**

- **S9.5.1 — Map parent/child hierarchy and navigation**
  Each map can have a parent map and a "location on parent" position (a single POI
  pin). This creates a drillable hierarchy. From a world map, clicking the "Draven
  Peaks" region POI opens the regional map. A breadcrumb in the map viewer shows the
  current path: World → Draven Peaks → Khorrund. The `Escape` key navigates up one
  level. Hierarchy depth is unlimited.

- **S9.5.2 — Active party location tracking**
  The DM sets the party's current map and position (a pin or free-form point) from
  the session context panel or by right-clicking the map: "Mark party here". The
  active location is stored in `.vault/session-state.json` and broadcasts to all
  connected players showing a party token on the map. MCP `get_session_prep_bundle`
  includes the active map, current location, and parent map as context.

- **S9.5.3 — Travel route drawing and distance calculation**
  In map edit mode, the DM can draw travel routes: click-to-place waypoints, curved
  or straight segments, labeled with route name (e.g., "North Road"). Route length
  is computed in grid squares × scale. If scale is defined, show distance in feet/
  miles/km. Travel routes are stored in a `routes` layer on the map. The `estimate_
travel_time` MCP tool accepts a map ID and route name and returns travel time at
  standard D&D 5e paces (normal/fast/slow).

- **S9.5.4 — Geographic context in note metadata**
  Notes can declare their geographic position via frontmatter: `mapId` and `mapPoi`.
  When a note is opened that has map context, the reading header shows a "Located on
  map" badge. The sidebar's folder tree can be toggled to a map-hierarchy view that
  organizes notes by their geographic region. MCP `search_notes` accepts a `mapId`
  parameter to filter results to notes geographically contained within that map.

---

---

# Initiative 10 — Player Character Suite

**Outcome:** Players have a complete, first-class character management experience.
Every mechanical element of a D&D 5e character is tracked, managed, and accessible
from any device. The player character suite works offline, syncs seamlessly when
connected, and is beautiful enough that players prefer it over paper.

**Why this matters:** The current app is DM-centric. For DND Tools to be the
definitive TTRPG companion — for running _and_ playing — players need a complete
toolkit, not just a read-only view of the DM's content.

---

## Epic 10.1 — Complete D&D 5e Character Sheet

**Goal:** Every field in the official D&D 5e character sheet is represented in a
clean, fast-to-navigate digital form. Stats, saves, skills, equipment, features,
personality, and backstory are all first-class.

**Stories:**

- **S10.1.1 — Core stats, saves, and skills form**
  Expand the `character` object schema to include all ability scores, their modifiers
  (auto-computed), saving throw proficiency checkboxes, skill proficiency/expertise
  checkboxes, and passive perception/investigation/insight. Proficiency bonus
  auto-computes from level. All modifier values display the computed total next to
  the override input. The structured editor for characters renders this as a
  two-column layout matching familiar character sheet mental models.

- **S10.1.2 — HP, AC, speed, initiative, and combat stats**
  Add to the character object: max HP (manual), current HP (tracked per session),
  temp HP, AC (manual or auto from equipped armor), speed, initiative (modifier +
  custom bonus), hit dice type, proficiency bonus, and inspiration flag. HP changes
  during combat are tracked in session-state, not the vault object, so the object
  always stores the character's "at full rest" state and current HP is a session
  overlay.

- **S10.1.3 — Equipment, currency, and encumbrance**
  Add an equipment list with: item name, quantity, weight, equipped toggle, and
  linked vault object if the item is a known vault item. Currency tracks CP, SP,
  EP, GP, PP. Total carried weight auto-computes with encumbrance threshold
  indicators (based on Strength × 15). Equipment can be added from the vault item
  compendium or created inline. Items marked equipped contribute to AC calculation
  if armor type is defined.

- **S10.1.4 — Features, traits, background, and personality**
  Add character sections: racial traits (linked to race reference), class features
  by level (with "gained at level" metadata), background feature, personality traits,
  ideal, bond, flaw, and appearance. Each section is collapsible. Features can be
  linked to rule reference notes in the vault (e.g., a "Second Wind" feature links
  to the fighter feature note). The character sheet is printable via CSS print media
  query with a clean single-page layout.

---

## Epic 10.2 — Spell Slot, Resource & Ability Tracking

**Goal:** Every expendable resource — spell slots, ki points, sorcery points, bardic
inspiration, channel divinity, rages — is tracked per session with one-tap spend
and automatic recovery on rest.

**Stories:**

- **S10.2.1 — Spell slot grid with use tracking**
  Add a spell slot tracker to the character session overlay: grid of slots by level
  (1–9) showing filled/empty pips. Tap/click a pip to expend a slot (confirm on
  mobile). Long rest restores all slots; short rest offers warlock slot recovery.
  The tracker state is session-scoped (not persisted to vault) unless the DM marks
  session end, at which point full rest recovery is offered.

- **S10.2.2 — Prepared spells list with description lookup**
  Characters have a prepared spell list: spells are added from the vault compendium
  (Open5e integration from I8.4.1). Each spell shows level, casting time, range,
  duration, and a collapsible full description. Spells can be sorted by level,
  school, or alphabetically. Concentration spells show a concentration indicator.
  Casting a spell from the list decrements the appropriate slot level.

- **S10.2.3 — Class resource trackers**
  Define class resource types in the D&D 5e campaign system module: ki (Monk), rage
  (Barbarian), bardic inspiration (Bard), channel divinity (Cleric/Paladin),
  sorcery points (Sorcerer), superiority dice (Fighter), sneak attack (Rogue —
  tracks per-turn use), wild shape (Druid). Each resource shows current/max with
  spend/recover buttons. Max values auto-update on level-up. Custom resources can
  be added for homebrew classes.

- **S10.2.4 — Rest recovery workflow**
  Short rest: DM or player triggers short rest in the session panel. Each player's
  character is offered hit dice to spend (roll or accept average). Class resources
  that recover on short rest are restored. Long rest: all HP, spell slots, and long-
  rest resources restore fully. Exhaustion reduces by one level. The rest workflow
  appears as a quick-action in the session board and logs the event in the session
  timeline.

- **S10.2.5 — Concentration and death save tracking**
  Concentration tracker: when a concentration spell is cast, a persistent banner
  shows the spell name with a dismiss button. When the character takes damage, a
  prompt asks for the concentration save result (pass/fail). Fail dismisses the spell.
  Death saves: three checkboxes for successes and failures. Third success marks
  character as stable; third failure marks as dead. Both states broadcast to the
  DM's party overview panel.

---

## Epic 10.3 — Character Advancement & Downtime

**Goal:** Leveling up and downtime activities are guided workflows, not blank forms.
The app walks players through every choice at level-up and tracks downtime activity
between sessions.

**Stories:**

- **S10.3.1 — Guided level-up workflow**
  When a player marks their character as ready to level up, a step-by-step wizard
  walks through: new HP (roll or take average, show both options with proficiency
  bonus added), new class features unlocked at this level (displayed with
  descriptions), ASI or feat selection (if applicable at this level), new spell
  slots (for spellcasters), and any resource max increases. Each choice is logged
  to the character's advancement history. The wizard can be exited and resumed.

- **S10.3.2 — XP and milestone advancement modes**
  Settings → Character → Advancement Mode: XP or Milestone. In XP mode, the DM
  awards XP from the encounter log (auto-populated from encounter builder). The
  character sheet shows current XP, XP to next level, and a progress bar. When
  XP threshold is reached, a "Level up available" badge appears. In milestone mode,
  the DM manually triggers level-up for all characters simultaneously.

- **S10.3.3 — Downtime activity tracker**
  Add a downtime tracker to the character sheet: list of activities with type
  (Crafting, Research, Training, Relaxation, Work, etc.), days spent, gold cost,
  and outcome notes. The DM can award downtime days at session end. Downtime
  activities can reference vault notes (e.g., a Training activity linked to a
  trainer NPC note). The downtime log is part of the character's campaign history.

- **S10.3.4 — Character history and session log**
  Every level-up, rest, significant combat, and downtime activity is logged to the
  character's personal history timeline. The history view shows a chronological
  feed of entries with in-world dates (if calendar is configured). History is
  searchable and can be exported as a markdown character journal. The most recent
  history entries are surfaced in the between-session player inbox.

---

## Epic 10.4 — Party Coordination Panel

**Goal:** The DM and all connected players share a live party overview showing
health, resources, conditions, and coordination state. Information flows both
directions without requiring verbal communication during the session.

**Stories:**

- **S10.4.1 — Live party HP and status overview**
  The party panel (accessible as a session board tile, board overlay, and bottom
  sheet on mobile) shows all connected players' characters: portrait, name, class,
  current/max HP as a color-gradient bar, active conditions as icon chips, and
  concentration spell if active. The DM sees all characters. Players see all
  characters. HP changes propagate via the real-time session channel within 500ms.

- **S10.4.2 — Shared party inventory and encumbrance**
  A "party stash" inventory is accessible to all connected participants: shared loot
  not yet divided, quest items, and communal supplies. Items are added from the
  encounter loot log or manually. Any player can move items from the party stash to
  their personal equipment. Encumbrance for the stash is computed using the
  strongest character's carry limit as a baseline.

- **S10.4.3 — Spell slot and resource summary for spellcasters**
  The party panel includes a collapsed "Spellcaster Resources" section showing each
  spellcaster's slot availability (filled/empty pips by level, abbreviated). This
  allows tactical decision-making at a glance: "does the Cleric still have 3rd-level
  slots?". Non-spellcasters see their primary resource (ki, rages). The section is
  collapsible and hidden by default on mobile.

- **S10.4.4 — Marching order and travel formation**
  Add a marching order editor to the party panel: drag player avatars into a 2-column
  travel formation (front, middle, back). The order persists for the session and is
  broadcast to all players. The DM can reference marching order for ambush/surprise
  rules. The formation layout is included in the encounter builder context when
  initiating an ambush encounter.

---

## Epic 10.5 — Player Session Journal & Private Notes

**Goal:** Every player has a private, DM-invisible note space for their own session
observations, NPC impressions, theory-crafting, and personal quest tracking. Player
notes are first-class vault content with the same rich markdown and linking features.

**Stories:**

- **S10.5.1 — Player private vault**
  When the app is used in player mode (or when a character is owned by a non-DM
  user in a collaborative vault), notes created in the player's private space are
  stored locally only — never synced to the DM's vault and never visible via MCP.
  The private vault is a separate IndexedDB database (or separate folder in
  filesystem mode) keyed by character ID. It uses the full `StorageAdapter` interface.

- **S10.5.2 — Session bookmarks and NPC impressions log**
  Players can bookmark any revealed note during a session with a personal annotation.
  A dedicated "NPC Impressions" section lets players record their character's
  opinion of each NPC they've met — separate from the DM's NPC notes. The impressions
  list is sorted by most recently interacted. Each impression links to the shared
  NPC note. Impressions are private by default; players can share individual
  impressions with the DM.

- **S10.5.3 — Personal quest and goal tracker**
  Each player character can maintain a personal quest list (separate from the DM's
  quest objects): personal goals, secrets, character arc objectives. Each item has
  status (active / completed / failed / abandoned) and optional linked notes. Goals
  can reference shared vault notes via wikilinks. The MCP `get_open_threads` tool
  can optionally include the player's personal quest items if the player grants
  access.

- **S10.5.4 — Session highlight and quote capture**
  During a session, players can quickly capture highlights: "great RP moment",
  "memorable quote", "tactical success", "funny mishap". Each highlight has a
  timestamp and optional in-world date. At session end, all players' highlights
  are compiled into a shared "Session Highlights" note (visible to all) that
  supplements the DM's recap. The DM can pin a highlight to the session timeline.

---

---

# Initiative 11 — Atmosphere, Audio & Immersive Scene Management

**Outcome:** DND Tools creates a multi-sensory session experience. The DM can set
the mood with ambient audio, display scene images on a secondary screen or TV,
and trigger atmospheric cues tied to the evolving narrative. The app becomes the
atmospheric backbone of the session, not just a reference tool.

**Why this matters:** Atmosphere is the difference between "we looked it up on the
laptop" and "we were transported." Sound design and visual scene management are
table-standard tools for experienced DMs. Building them into the app — with vault
integration and session automation — creates a uniquely immersive experience no
competing tool offers end-to-end.

---

## Epic 11.1 — Ambient Audio Engine

**Goal:** A full ambient audio system is integrated into the app, playing multi-layer
soundscapes from locally stored files or web audio links, with smooth crossfading
between scenes and intuitive volume control.

**Stories:**

- **S11.1.1 — Audio engine foundation with Web Audio API**
  Implement an `AmbientAudioEngine` in `src/lib/domain/audio-engine.ts` using the
  Web Audio API. Support: loading audio files from the vault assets folder, looping
  audio with seamless loop points, stacked layer mixing (up to 6 simultaneous
  sources), per-layer volume with a master volume override, and crossfade between
  two presets (default 3 seconds, DM-configurable). All audio state is in-memory and
  session-scoped; no audio data is written to the vault.

- **S11.1.2 — Local audio file import and vault asset management**
  Add an audio asset library under `.vault/assets/audio/`. DMs can import audio
  files (MP3, OGG, WAV, M4A up to 50MB each) from the settings audio page or by
  dragging into the app. Imported files show name, duration, size, and a waveform
  thumbnail. Files can be tagged for organization. A free starter pack of 20 Creative
  Commons ambient tracks is bundled with the desktop app (dungeon, wilderness,
  tavern, combat categories).

- **S11.1.3 — Web audio source support (YouTube / SoundCloud links)**
  Allow audio presets to include web URLs as sources via `<iframe>` embed (YouTube,
  SoundCloud). Web sources are secondary to local — they require internet access.
  The UI clearly marks web sources as network-dependent with a connection indicator.
  Web sources are not cached locally (license compliance). The system gracefully
  falls back to local layers if a web source fails to load.

- **S11.1.4 — Audio control panel and quick-access widget**
  Add a compact audio control widget available in the toolbar, as a session board
  tile, and as a floating overlay (`Ctrl+Shift+A`). Controls: play/pause, active
  preset name, master volume slider, and crossfade button to the next preset. The
  full audio panel shows all layers with individual controls. Audio state is reflected
  in the status bar so the DM always knows what's playing.

---

## Epic 11.2 — Scene Cards & Visual Display Mode

**Goal:** DMs can create richly presented scene cards — title, mood image, flavor
text, music association — and display them in a fullscreen "scene display mode"
suitable for a second monitor, tablet, or TV visible to players.

**Stories:**

- **S11.2.1 — Scene card object type**
  Add `scene_card` as a structured object type with fields: title, mood (combat,
  exploration, mystery, social, rest), hero image (linked from vault image objects
  or URL), flavor text (markdown, max 500 chars), audio preset reference, and
  visibility (dm_only / shared / public). Scene cards are created from the command
  palette, the session board, or via MCP `create_scene_card`. Scenes are stored in
  `.vault/objects.json` and searchable.

- **S11.2.2 — Scene display mode (fullscreen / second screen)**
  `Ctrl+Shift+S` enters scene display mode: fullscreen view showing the active
  scene card as a visually rich layout — full-bleed hero image with title and flavor
  text overlaid, color-coded by mood. A "secondary screen" mode opens the scene
  display in a separate `window` (Electron `BrowserWindow` or browser popup)
  designed for a TV or projector. DM controls remain in the primary window.

- **S11.2.3 — Scene queue and transitions**
  DMs can queue multiple scene cards in order. Advancing the queue transitions to
  the next scene with a configurable animation (crossfade, slide, or cut). Each
  transition can trigger the associated audio preset crossfade. The scene queue
  is visible in the session board as an ordered tile list. Keyboard shortcut
  `Ctrl+Right` advances the queue during play.

- **S11.2.4 — Player device scene push**
  In a connected session, activating a scene card pushes the shared scene to all
  player devices. Players see the hero image and flavor text in a banner overlay
  on their DND Tools screen. The banner is dismissible after 5 seconds. Scene
  pushes are logged in the session event timeline. Players can review the session's
  scene history from their player journal.

---

## Epic 11.3 — Audio Preset Library & Custom Scene Builder

**Goal:** The DM has a rich library of curated, categorized audio presets and a
custom scene builder that combines images, audio, and flavor text into reusable
scene packages shareable across vaults and the community.

**Stories:**

- **S11.3.1 — Categorized preset library**
  Ship a built-in preset library with 40+ named presets across categories: Dungeon
  (6 presets: stone corridor, flooded cave, trap room, boss chamber, safe room,
  undead crypt), Wilderness (6: dense forest, open plains, thunderstorm, mountain
  pass, haunted wood, sunlit meadow), Urban (6: bustling market, dark alley, tavern,
  throne room, harbor, slums), Combat (4: battle, pursuit, ambush, final stand),
  Social (4: formal court, interrogation, celebration, funeral), and Mystical
  (4: arcane lab, divine temple, void, dreamscape). Presets are non-deletable system
  objects but fully customizable via copy.

- **S11.3.2 — Custom preset creation and editing**
  The preset editor shows: preset name, category, and a multi-layer audio mixer.
  Each layer has: audio source (vault file or web URL), loop enabled, volume (0–100),
  and a start offset (for variation). Save creates a vault audio-preset object.
  Test playback is available inline in the editor. Custom presets appear in the
  preset library alongside built-ins.

- **S11.3.3 — Scene package bundling**
  A "Scene Package" bundles a scene card + audio preset + optional lighting color
  suggestion into a single named package stored as a vault object. Scene packages
  are the primary activation unit: one click plays the audio, displays the scene
  card, and pushes to players. Packages can be assigned to map POIs — arriving at
  a location auto-activates its scene package.

- **S11.3.4 — Scene package export and sharing**
  Scene packages are exportable as `.dndscene` bundles (ZIP containing metadata
  JSON + bundled local audio files). Packages can be imported into any vault.
  Packages without local audio (using only web sources) are shareable as small
  JSON files. Community scene packages are a planned content category in the
  Community Content Ecosystem (I12).

---

## Epic 11.4 — Atmosphere Automation & Trigger System

**Goal:** Atmospheric changes happen automatically in response to session events —
combat start triggers combat music, entering a location triggers its scene package,
dice rolls trigger sound effects — without the DM manually switching presets.

**Stories:**

- **S11.4.1 — Event-driven atmosphere triggers**
  Define a trigger system: `on(event, action)`. Events: `combat.start`,
  `combat.end`, `note.open(noteId)`, `map.poi.enter(poiId)`,
  `session.board.tile.activate(tileId)`. Actions: `audio.play(presetId)`,
  `audio.crossfade(presetId, durationMs)`, `scene.activate(packageId)`.
  Triggers are configured per-vault in `.vault/settings.json` under `atmosphereTriggers`.
  Triggers can be disabled globally from the audio widget.

- **S11.4.2 — Combat music automation**
  When the combat tracker (I4.2) is activated (first initiative is rolled), if a
  combat preset is configured for the current location, automatically crossfade from
  the current ambient to the combat preset. When combat ends (all enemies defeated
  or tracker cleared), crossfade back to the ambient preset. The DM can override
  the automatic transition at any time from the audio widget.

- **S11.4.3 — Sound effect triggers for dice and events**
  Define a sound effects layer (separate from ambient): short one-shot clips for
  specific events. Configurable events: natural 20 (triumph fanfare), natural 1
  (failure sting), death save failure, spell cast (by school), critical hit. Sound
  effects are played from a dedicated SFX channel independent of the ambient mix.
  The DM can enable/disable SFX globally or per event type from Settings → Audio.

- **S11.4.4 — MCP atmosphere control tools**
  Add MCP tools: `set_active_scene(packageId)`, `play_audio_preset(presetId)`,
  `get_available_scenes()`. These allow AI agents to suggest and activate atmosphere
  changes as part of session prep bundles. For example, a session prep bundle for a
  dungeon crawl might include `suggestedScenePackageId` in its response. The DM
  reviews and activates via a one-click button in the bundle response UI.

---

---

# Initiative 12 — Community & Content Ecosystem

**Outcome:** DND Tools is a platform. DMs can publish campaign modules, share custom
content, discover community-created templates and scene packages, and collectively
grow a library of high-quality reusable content. The community makes every DM's vault
richer without any individual doing all the work.

**Why this matters:** An isolated tool competes on features. A platform competes on
network effects. When a DM can find a ready-made "Waterdeep Merchant District" map
pack with linked notes, scene packages, and random tables — all importable in one
click — DND Tools becomes indispensable regardless of what competitors do.

---

## Epic 12.1 — Campaign Module Format & Vault Bundle Export

**Goal:** Vaults or subsets of vaults can be exported as installable, versioned
campaign modules — complete packages of notes, objects, maps, templates, and random
tables that can be imported by any DND Tools user.

**Stories:**

- **S12.1.1 — Campaign module manifest format**
  Define `module.json`: id, name, version (semver), author, description, system
  compatibility (e.g., `dnd5e`, `generic`), level range (min/max), content type
  tags (adventure, supplement, world, toolkit), license (CC BY, CC BY-SA, proprietary,
  etc.), dependencies (other module IDs), and a content manifest listing every
  included vault note, object, map, audio preset, and template. The manifest format
  is versioned and documented in `docs/MODULE_FORMAT.md`.

- **S12.1.2 — Module export workflow in-app**
  Add Settings → Content → Export Module. The DM selects: scope (entire vault,
  selected folder, tagged subset), content types to include (notes, objects, maps,
  audio, templates), and whether to include DM-private content. A pre-export
  validation step checks: broken internal links, missing asset files, and
  unlicensed external audio sources. The output is a `.dndmodule` ZIP containing
  the manifest and all selected files in a canonical directory structure.

- **S12.1.3 — Module import with dependency resolution**
  DMs can import a `.dndmodule` file via drag-and-drop or Settings → Content →
  Import Module. Pre-import: show a structured summary of the module (name,
  author, content count by type, dependencies). Dependency modules are detected
  and the user is prompted to install them first. Import respects vault naming
  conflicts with overwrite/skip/rename policies. Post-import: a summary report
  shows what was installed, what was skipped, and any warnings.

- **S12.1.4 — Module version tracking and update workflow**
  Installed modules are tracked in `.vault/modules.json` with their installed
  version. When a newer version of an installed module is available (checked
  against the Community Directory), a notification appears in Settings → Content.
  Update workflow: diff installed vs new content, show what changed, allow partial
  update (notes only, skip custom objects the DM has modified). Updates are
  non-destructive: the DM's edits to module content are preserved or highlighted
  as conflicts.

---

## Epic 12.2 — Community Content Directory

**Goal:** A hosted, searchable directory of community-published modules, maps, scene
packages, and template packs is discoverable from within the app. Installing content
takes one click.

**Stories:**

- **S12.2.1 — Community Directory API and backend**
  Build a publicly accessible REST API (AWS API Gateway + DynamoDB) for the
  content directory: `GET /modules` (search, filter, paginate), `GET /modules/{id}`
  (detail), `POST /modules` (publish, authenticated), `PUT /modules/{id}` (update,
  owner only). Module binaries are stored in S3 with CDN distribution. The API is
  documented with OpenAPI 3.0 and published at `api.dndtools.app/docs`.

- **S12.2.2 — In-app directory browser**
  Add a `/community` route accessible from the sidebar. The browser shows: featured
  modules at the top, search with filters (system, type, level range, license,
  rating), and a card grid showing name, author, thumbnail, short description,
  install count, and star rating. Selecting a module shows the full detail view
  with a changelog and user reviews. "Install" button downloads and runs the import
  workflow (S12.1.3) without leaving the app.

- **S12.2.3 — Rating, reviews, and community quality signals**
  Authenticated users can rate modules (1–5 stars) and leave a text review (250
  char max). Ratings require the user to have installed the module. A "verified
  purchase" badge distinguishes reviews from users who actually used the content.
  Aggregate rating, install count, and "last updated" date are displayed on cards
  and detail pages. A content moderation queue handles flagged reviews.

- **S12.2.4 — Curator picks and featured collections**
  The DND Tools team curates "Featured Collections" visible on the directory
  homepage: "Best Starter Adventures", "Atmospheric Scene Packs", "5e Monster
  Supplements". A `featured` flag is set via an admin API endpoint (restricted
  to project maintainers). Curated content has a badge on its card. The curation
  process is documented and open to community nominations via GitHub Discussions.

---

## Epic 12.3 — Creator Tooling & Module Publishing

**Goal:** Creating and publishing high-quality community content is supported by
in-app tooling: validation, previewing, versioning, and a streamlined publish
workflow that makes the barrier to sharing as low as possible.

**Stories:**

- **S12.3.1 — Module creator workspace**
  Add a "Module Creator" mode toggled in Settings → Content. In creator mode:
  the vault shows a "Module Contents" badge on every note and object included in
  the current module scope, a module metadata editor panel is accessible from the
  sidebar, and a live completeness score shows how much of the module's declared
  content is filled in (notes created, descriptions populated, dependencies
  resolved). Creator mode has no functional differences — it is purely a metadata
  and visibility overlay.

- **S12.3.2 — Module validation and quality checklist**
  Before publishing, a validation pipeline checks: manifest completeness, all
  declared files present and not corrupt, no broken internal wikilinks, no
  unlicensed content (audio files checked against bundled license metadata),
  recommended items (thumbnail image, system compatibility tag, level range).
  Each check is displayed with pass/warn/fail status. Fails block publish; warns
  are advisory. The checklist is documented in `docs/PUBLISHING_GUIDE.md`.

- **S12.3.3 — Versioned publishing and changelog**
  The publish workflow prompts for: semver version bump type (patch/minor/major),
  a changelog entry describing what changed, and confirmation of the license.
  Version history is stored in the directory backend. Each version's `.dndmodule`
  file is immutable after publish (replaced by a new version, not updated in place).
  A "yank" action can de-list a version from the directory without deleting it
  for users who have it installed.

- **S12.3.4 — Attribution and license enforcement**
  Module manifests declare a license from a curated list. Community directory
  filters can search by license (open only, CC variants). Attribution metadata
  flows into the import report: "This module includes content by [author] under
  [license]." In the importer, if a module includes non-commercial content, a
  reminder that the installed content may have use restrictions is displayed before
  installation completes.

---

## Epic 12.4 — Public Campaign Wiki & Live Sharing

**Goal:** DMs can publish a beautiful, public-facing campaign wiki from their vault
with one command. Players can bookmark and read it between sessions. The wiki is
a living document that updates as the vault does.

**Stories:**

- **S12.4.1 — Campaign wiki publish workflow**
  Add Settings → Sharing → Publish Wiki. The DM configures: which folder or tags
  to publish (only `visibility: public` and `visibility: shared` notes are
  eligible), the wiki slug (`username.dndtools.app/my-campaign`), a campaign
  description and hero image, and a theme (default / parchment / modern). Publishing
  triggers a server-side static site generation job that produces the wiki from
  the current vault snapshot. Subsequent publishes update the wiki incrementally.

- **S12.4.2 — Wiki reading experience**
  The published wiki renders vault markdown with wikilinks resolved to inter-page
  links, object embeds rendered as rich cards, and a navigation sidebar matching
  the vault folder structure (filtered to published content only). The wiki is
  fully indexed by search engines (proper meta tags, sitemap, structured data for
  TTRPGs). Mobile-responsive. No DND Tools account required to read.

- **S12.4.3 — Wiki access control and password protection**
  Access modes: Public (indexed, no auth), Unlisted (direct link only, not indexed),
  Password (password required to view, not indexed). Password is set in sharing
  settings and hashed server-side. Visitors enter the password once; a cookie
  persists access for 30 days. Access control is enforced server-side, not in
  JavaScript. The DM can reset the password to revoke access for specific links.

- **S12.4.4 — Session recap publication and subscriber notifications**
  Session recaps published via the I7.5.4 workflow appear as timestamped entries
  on the campaign wiki's home page, styled as a campaign journal. Visitors can
  subscribe to the wiki's RSS feed to receive recap notifications. An optional
  email digest (via AWS SES) sends new recaps to subscriber emails. All
  subscriptions are opt-in and unsubscribe requires one click.

---

---

## Sequencing & Execution Order

The Initiatives are ordered by dependency, not just priority. The execution sequence
for maximum value with minimum rework is:

```
Quarter 1   I1 (Foundation) + I2 (Engineering)          ← P0 gates
Quarter 2   I3 (Knowledge) + I6/E6.4 (a11y)             ← Core product maturity
Quarter 3   I4 (Session) + I5 (AI) + I9 (Maps)          ← DM value props
Quarter 4   I6 (Multi-Platform full) + I10 (Players)    ← All users on all devices
Year 2 Q1   I7 (Collaboration) + I11 (Atmosphere)       ← Network effects + immersion
Year 2 Q2   I8 (Extensibility) + I12 (Community)        ← Platform and ecosystem
```

**Exit gates between phases:**

- Cannot begin I3 until: atomic writes, IPC hardening, and CI pipeline are live.
- Cannot begin I4/I5 until: object system is complete and all MCP tool tests pass.
- Cannot begin I9 until: I3 object system is stable (maps are objects; POIs link
  to notes and objects via the same graph engine).
- Cannot begin I10 until: I4 session tracker and I3 object schemas are complete
  (character sheet builds on the 5e campaign system module).
- Cannot begin I7 until: I6 Android build produces a working APK and I3
  import/export is stable for vault portability across devices.
- Cannot begin I8 until: the campaign system module boundary is formally extracted
  (I8/E8.2) because plugins that register object types depend on it.
- Cannot begin I11 until: I4 session infrastructure is stable (atmosphere triggers
  depend on combat tracker and session board events).
- Cannot begin I12 until: I7 cloud backend is live (directory and wiki require
  hosted infrastructure) and I8 module format is defined.

**Parallel work opportunities within phases:**

- I2 Engineering runs continuously as a support initiative alongside all other work.
- I6.4 (Accessibility) is a continuous obligation, not a one-time effort — each
  new Initiative introduces new components that must meet WCAG 2.1 AA.
- I5 AI tools and I9 Maps can be developed in parallel after I3 is complete.
- I10 Player Suite and I11 Atmosphere are independent after I4 is stable.

**Dependency graph (compact):**

```
I1 → I2 → I3 → I4 → I5
                I3 → I9
                I3 → I6 → I7 → I12
                I4 → I10
                I4 → I11
                I2 → I8 → I12
```

---

## Definition of Done (Cross-Initiative)

Every Initiative is complete only when all its Epics meet these criteria:

1. All Stories reviewed, merged to main, and CI green.
2. Test coverage at or above target thresholds for all affected modules.
3. Docs in `docs/` reflect current behavior — no aspirational claims.
4. Performance budgets measured and within target.
5. Accessibility gate passes (no critical/serious axe violations on primary routes).
6. ADR written (or updated) for any architectural decision made during delivery.
7. Release notes entry drafted for user-visible changes.
8. Privacy impact assessed: no new data collection without explicit user consent.
9. Graceful degradation verified: every new feature defines behavior when its
   dependencies (network, AI, audio context, Electron) are unavailable.
10. Localization-readiness: all user-facing strings in new code use i18n message keys
    (enforced by lint rule once I8.7.1 is complete).

---

## Architecture Quality Standards (Cross-Initiative)

These standards apply to every Story merged after I2 is complete. They are the
implementation expression of the Guiding Principles.

**Boundary enforcement:**

- Renderer code never imports Node-only modules (lint rule, CI-enforced).
- MCP code never imports Svelte/UI modules (lint rule, CI-enforced).
- Route components contain no business logic — they compose domain services and
  display stores. Business logic lives in `src/lib/domain/` or `src/lib/state/`.

**Testing requirements by tier:**

- Domain logic (`src/lib/domain/**`): ≥ 90% branch coverage, pure unit tests.
- MCP tools (`mcp/tools/**`): 100% of write tools, 90% of read tools.
- Storage operations: integration tests with real filesystem via `tmp` directories.
- UI workflows: E2E Playwright tests for all P0 and P1 user-facing stories.
- Performance: benchmark assertions for all operations with hard budgets (I2.5).

**Observability contract:**

- Every new async operation has a `performance.mark` at start and end.
- Every new error path has a taxonomy entry in `src/lib/domain/error-taxonomy.ts`.
- Every new MCP tool response includes structured metadata (timing, vault version,
  tool version) for agent diagnostics.

**Security review checklist (for every PR touching IPC, MCP, or cloud):**

- [ ] All user-controlled input is validated with Zod before any business logic.
- [ ] No new broad IPC channel patterns (explicit channels only).
- [ ] No plaintext storage of credentials or tokens.
- [ ] Threat model doc (`docs/SECURITY.md`) updated if attack surface changes.

---

_This document lives at `docs/MASTER_PLAN.md`. It is the single source of truth for
strategic initiative planning at Tiers 1–3. Epics (Tier 2) are tracked in
`docs/TODO.md`. Stories (Tier 3) are tracked as GitHub issues. Tasks (Tier 4) are
tracked in PR descriptions and commit messages. Atomics (Tier 5) are session-context
only (TodoWrite). See `docs/PLANNING_TIERS.md` for the full hierarchy definition._

---

_12 Initiatives. 62 Epics. The definitive TTRPG companion._
