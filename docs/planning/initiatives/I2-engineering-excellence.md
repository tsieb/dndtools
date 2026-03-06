# Initiative 2 — Engineering Excellence

## Status: COMPLETED

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

## Epic 2.6 - CI/CD Audit Follow-up Backlog

**Goal:** Improve regression protection, release reliability, security posture, and CI speed without adding unnecessary contributor friction or paid tooling.

**Stories:**

- **S2.6.1 - Remove duplicate quality execution in CI**
  Consolidate `pnpm check` duplication between `quality-matrix` and `check-script-contract`.
  Implementation steps:
  1. Keep one canonical full quality run (lint + typecheck + unit tests).
  2. Remove or repurpose `check-script-contract` to run only unique checks.
  3. Confirm `quality` remains the single required branch-protection status.

- **S2.6.2 - De-duplicate desktop E2E workflow coverage**
  Avoid running the same desktop critical/a11y suites in both `ci.yml` and `e2e.yml` for the same PR.
  Implementation steps:
  1. Choose one PR-required source of truth for desktop E2E.
  2. Keep the second workflow as manual (`workflow_dispatch`) or scheduled extended coverage.
  3. Update docs to reflect final gate ownership.

- **S2.6.3 - Add path-aware gating for expensive jobs**
  Ensure heavy desktop build/E2E jobs run only when relevant files change.
  Implementation steps:
  1. Add trigger `paths` filters or in-workflow path filtering.
  2. Always run fast core checks (lint/typecheck/unit/docs/format).
  3. Restrict desktop jobs to runtime/test/build-impacting paths.

- **S2.6.4 - Enforce formatting in CI**
  Add `pnpm format:check` as a CI gate to match local hooks.
  Implementation steps:
  1. Add dedicated format job to `ci.yml`.
  2. Include it in the `quality` aggregate gate.
  3. Keep autofix local-only to avoid CI churn.

- **S2.6.5 - Activate coverage thresholds in CI**
  Enforce existing Vitest thresholds by running tests with coverage in CI.
  Implementation steps:
  1. Add a coverage-enabled test command to CI (`vitest --coverage`).
  2. Keep local default test command fast.
  3. Document expected threshold behavior in testing docs.

- **S2.6.6 - Add timeout governance for CI jobs**
  Prevent stalled jobs from blocking queues and contributor flow.
  Implementation steps:
  1. Set `timeout-minutes` for all jobs by class (quick, build, release).
  2. Tune timeouts using recent run data.
  3. Revisit limits quarterly.

- **S2.6.7 - Reduce repeated setup/build cost across jobs**
  Cut redundant dependency installation and desktop build steps.
  Implementation steps:
  1. Identify repeated build/setup patterns in CI workflows.
  2. Build once where practical and reuse via artifacts.
  3. Keep artifact fan-out only where it reduces total wall-clock time.

- **S2.6.8 - Align local toolchain docs with CI reality**
  Remove Node/pnpm version ambiguity between docs and automation.
  Implementation steps:
  1. Decide supported local/CI Node versions.
  2. Update `docs/CONTRIBUTING.md` and related docs.
  3. Optionally add version matrix coverage if multiple versions are supported.

- **S2.6.9 - Apply least-privilege permissions to all workflows**
  Minimize token permissions on every workflow/job.
  Implementation steps:
  1. Add explicit baseline `permissions` to all workflows.
  2. Grant elevated permissions only to jobs that publish or write.
  3. Verify release workflows continue to function with scoped rights.

- **S2.6.10 - Pin third-party GitHub Actions to SHAs**
  Improve supply-chain integrity by pinning action revisions.
  Implementation steps:
  1. Replace floating action tags with commit SHAs.
  2. Record update procedure in operations docs.
  3. Add periodic maintenance task for SHA refreshes.

- **S2.6.11 - Add Dependabot for dependencies and GitHub Actions**
  Automate update intake with bounded PR volume.
  Implementation steps:
  1. Add `.github/dependabot.yml` for npm + GitHub Actions.
  2. Configure weekly cadence and grouped updates.
  3. Cap concurrent PRs to reduce noise.

- **S2.6.12 - Add non-blocking scheduled security scanning**
  Improve detection without slowing normal PR merges.
  Implementation steps:
  1. Add scheduled/manual security workflow (`pnpm audit` and/or CodeQL).
  2. Keep it non-required for merge by default.
  3. Escalate only high/critical findings.

- **S2.6.13 - Lint workflow files with actionlint**
  Catch workflow syntax and expression issues before merge.
  Implementation steps:
  1. Add an `actionlint` workflow triggered on workflow file changes.
  2. Make it a required check for workflow-affecting PRs.
  3. Include actionable failure messages.

- **S2.6.14 - Make release asset build trigger idempotent**
  Avoid full rebuilds on release note edits.
  Implementation steps:
  1. Restrict release trigger to `published` only.
  2. Keep manual rerun path via `workflow_dispatch`.
  3. Document re-run expectations in release docs.

- **S2.6.15 - Harden release upload behavior**
  Prevent accidental artifact overwrite while preserving intentional reruns.
  Implementation steps:
  1. Pre-check existing release assets before upload.
  2. Fail clearly when overwrite is not explicitly intended.
  3. Add an intentional override path for maintainers.

- **S2.6.16 - Add build provenance for release artifacts**
  Strengthen release trust and traceability with provenance metadata.
  Implementation steps:
  1. Add artifact attestation/provenance generation to release jobs.
  2. Publish attestation outputs alongside release artifacts.
  3. Document verification steps for consumers.

- **S2.6.17 - Set CI artifact retention by artifact class**
  Balance troubleshooting value with storage hygiene.
  Implementation steps:
  1. Define retention days for PR reports, perf artifacts, and release evidence.
  2. Set `retention-days` per upload step.
  3. Review retention policy during quarterly maintenance.

- **S2.6.18 - Improve E2E failure diagnostics**
  Make flaky/failing runs faster to debug.
  Implementation steps:
  1. Configure Playwright trace on retry and screenshots/videos on failure.
  2. Ensure artifacts upload even when tests fail.
  3. Add concise triage guidance to testing docs.

- **S2.6.19 - Separate required gates from observability jobs**
  Keep merge gates strict while preserving developer velocity.
  Implementation steps:
  1. Keep `quality` and commit hygiene as required checks.
  2. Keep nightly perf/memory jobs informational unless regression thresholds are crossed.
  3. Document check criticality in workflow comments/docs.

- **S2.6.20 - Verify and document branch protection enforcement**
  Ensure GitHub settings match intended CI policy.
  Implementation steps:
  1. Confirm required status checks and anti-bypass settings on primary branch.
  2. Align docs with actual protected branch configuration.
  3. Add periodic policy verification checklist.

- **S2.6.21 - Standardize primary branch naming in workflows**
  Remove dual-branch trigger ambiguity (`main` + `master`) where possible.
  Implementation steps:
  1. Select canonical primary branch.
  2. Update all workflow triggers and docs consistently.
  3. Remove stale branch references once migration completes.

- **S2.6.22 - Add backup code ownership for CI/release paths**
  Reduce single-owner bottlenecks for automation-critical files.
  Implementation steps:
  1. Add at least one backup owner for `.github/workflows/`, `scripts/`, release configs.
  2. Keep ownership boundaries clear and minimal.
  3. Validate review routing behavior after update.

- **S2.6.23 - Add CI/CD optimization tracking cadence**
  Treat pipeline health as an ongoing engineering surface.
  Implementation steps:
  1. Define monthly review for runtime, flake rate, and failure taxonomy.
  2. Record key metrics and top bottlenecks in a short ops note.
  3. Feed resulting action items into Initiative 2 task backlog.

---
