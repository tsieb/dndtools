# CI/CD And Tooling

## Source Set

This document was extracted from:

- `.github/workflows/ci.yml`
- `.github/workflows/ci-smoke.yml`
- `.github/workflows/commitlint.yml`
- `.github/workflows/desktop-build.yml`
- `.github/workflows/memory-profile.yml`
- `.github/workflows/performance-regression.yml`
- `.github/workflows/release-assets.yml`
- `.github/workflows/release-please.yml`
- `docs/development/GIT_WORKFLOW.md`
- `docs/development/TESTING.md`
- `docs/development/PERFORMANCE.md`
- `docs/development/SCRIPTS.md`
- `scripts/`
- `playwright.config.ts`
- `playwright.desktop.config.ts`
- `release-please-config.json`
- `electron-builder.yml`
- `CODEOWNERS`
- `package.json`

## Executive Summary

DND Tools uses a tiered GitHub Actions model. Epic PRs into `initiative/*` run a fast smoke gate;
initiative PRs into `master` run the full quality gate. Local automation mirrors those tiers with
`pnpm test:smoke`, `pnpm audit:quick`, and `pnpm audit:full`. The strongest parts to carry forward
are the branch-tier model, typed script runners, desktop E2E gates for `master`, docs validation,
and metrics baseline comparison. The main gaps are browser E2E, Android release validation, memory
profiling, and release packaging, which are not part of normal merge protection.

## Workflow Inventory

| Workflow | Trigger | Jobs | Merge / release gate |
| --- | --- | --- | --- |
| `CI` | Push to `master`, PR to `master`, manual dispatch | `quality-core`, `docs-validation`, `desktop-e2e-critical`, `desktop-e2e-accessibility`, `metrics-report`, `quality` | Blocks `master` through required `quality` status. `quality` fails if core quality, docs, desktop critical, desktop accessibility, or PR metrics fail. `metrics-report` is allowed to be skipped on non-PR runs. |
| `CI Smoke` | Push to `initiative/**`, PR to `initiative/**`, manual dispatch | `smoke` | Blocks `initiative/*` through required `smoke` status. Runs `pnpm test:smoke`. |
| `Commitlint` | All PRs, manual dispatch | `commitlint` | Required for both `master` and `initiative/*` branch protection according to `docs/development/GIT_WORKFLOW.md`. |
| `Desktop Build Matrix` | Push to `release/**`, weekly Monday 09:00 UTC, manual dispatch | `desktop-build-${matrix.os}` for Windows, Linux, macOS | Release/readiness workflow, not a normal merge gate. Builds desktop bundles, smoke-launches the app, uploads build/electron/MCP artifacts. |
| `Memory Profile` | Daily 09:00 UTC, manual dispatch | `desktop-memory` | Scheduled/manual quality signal, not merge-blocking. Runs desktop memory suite with `MEMORY_PROFILE=1` and uploads Playwright report. |
| `Performance Regression` | Weekly Monday 08:00 UTC, manual dispatch | `desktop-performance` | Scheduled/manual regression signal, not normal merge-blocking. Runs desktop perf benchmarks and enforces performance comparison against `tests/perf`. |
| `Release Artifacts` | GitHub release published/edited, manual dispatch | `validate-release-notes`, `build-desktop-installers`, `build-android-apk`, `publish-release-assets` | Release publication gate. Requires human-reviewed notes section, signing prerequisites, desktop installers, Android APK, checksums, and checksum signature. |
| `Release Please` | Push to `main` or `master`, manual dispatch | `release-please` | Release PR automation. Skips if `RELEASE_PLEASE_TOKEN` is absent. |

## Full Quality Gate

`CI` is the authoritative `master` PR gate.

| Job | Commands / behavior | Notes |
| --- | --- | --- |
| `quality-core` | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage` | Core renderer/MCP/Electron quality. `test:coverage` is focused on `src/lib/domain/export.ts`, not global coverage. |
| `docs-validation` | `pnpm docs:validate` | Validates docs path references, `TODO(APP)` required fields, and schema version drift against `mcp/migrations.ts`. |
| `desktop-e2e-critical` | Installs Chromium, then `xvfb-run ... pnpm desktop:test:critical` | Merge-blocking desktop workflow regression slice. Uploads Playwright report. |
| `desktop-e2e-accessibility` | Installs Chromium, then `xvfb-run ... pnpm desktop:test:a11y` | Merge-blocking accessibility suite. Uploads Playwright report. |
| `metrics-report` | Captures `pnpm metrics:capture -- --profile ci`, compares with `--enforceRegression`, uploads artifacts, comments on PR | Merge-blocking on PRs to `master`; skipped on direct push/workflow runs. |
| `quality` | Aggregates required job results | This is the status branch protection should require instead of every internal job. |

## Smoke Gate

`CI Smoke` runs `pnpm test:smoke`, implemented by `scripts/run-smoke.ts`.

`test:smoke` runs these four steps in parallel and writes structured JSON events plus per-step logs
under `tmp/smoke/<timestamp>/`:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:critical`

`test:critical` is a curated Vitest subset covering storage contracts, IndexedDB adapter behavior,
session-state normalization, navigation state behavior, runtime boundary lint tests, repo audit
tests, and CI guardrails.

## Branch Protection Model

| Branch target | Required checks | Intended PR type |
| --- | --- | --- |
| `initiative/*` | `smoke`, `commitlint` | Epic/story PRs. |
| `master` | `quality`, `commitlint` | Initiative integration PRs. |

The documented repository settings also require PR review flow, up-to-date branches, no force
pushes, no deletions, squash merge, auto-merge, and automatic deletion of merged head branches.

## Test Pyramid

| Layer | Tooling | Locations | Gate status | Coverage status |
| --- | --- | --- | --- | --- |
| Unit | Vitest with jsdom/node environments | `src/lib/**/*.test.ts`, `mcp/**/*.test.ts`, `electron/**/*.test.ts`, `tests/unit/*.test.ts` | Full suite blocks `master`; curated critical subset blocks `initiative/*`. | Broad domain and infrastructure coverage exists. Global coverage threshold is not enforced; `test:coverage` targets `src/lib/domain/export.ts`. |
| Integration | Vitest plus real adapters/fixtures | `mcp/storage.test.ts`, `mcp/staged-storage.test.ts`, `mcp/migrations.integration.test.ts`, `src/lib/platform/storage/*.test.ts`, Electron IPC/service tests | Included in `pnpm test` and selected critical tests. | Storage, staged writes, migrations, platform adapters, and IPC have targeted coverage. MCP tool-level coverage is uneven. |
| Browser E2E | Playwright Chromium | `tests/e2e/*.spec.ts` with `playwright.config.ts` | Local/manual through `pnpm test:e2e`; not in current merge gates. | Covers browser routes/workflows, but is explicitly outside CI quality gates. |
| Desktop E2E | Playwright + Electron built app | `tests/e2e-desktop/*.spec.ts` with `playwright.desktop.config.ts` | Critical and accessibility subsets block `master`; perf/memory run scheduled/manual. | Stronger than browser E2E for live app workflows. Requires `pnpm desktop:build` before tests. |
| Accessibility | `@axe-core/playwright` policy helpers | `tests/e2e-desktop/accessibility.spec.ts`, `tests/accessibility/*` | Desktop a11y blocks `master`; critical violations and expired known violations fail. | Serious violations are warned/tracked; moderate/minor are logged. |
| Performance / memory | Playwright desktop perf specs, metrics scripts | `tests/e2e-desktop/performance.spec.ts`, `tests/e2e-desktop/memory.spec.ts`, `tests/perf/*.json` | Metrics compare blocks `master` PRs; full perf/memory suites are scheduled/manual. | Budget registry exists; memory is observational and not merge-blocking. |

Browser Playwright uses `pnpm build && pnpm preview` on port `4173`, retries twice on CI, and runs
fully parallel. Desktop Playwright is serial (`workers: 1`), retries once on CI, and has a 60 second
test timeout.

## Local Hooks

Git hooks are installed by `simple-git-hooks` during `postinstall`.

| Hook | Command | Effect |
| --- | --- | --- |
| `pre-commit` | `pnpm lint && pnpm format:check` | Prevents commits with lint, repo-audit, navigation, token, or format failures. |
| `pre-push` | `pnpm check` | Runs `pnpm lint && pnpm typecheck && pnpm test` before push. |

The workflow docs explicitly say not to bypass hooks with `--no-verify`.

## Script Inventory

### Canonical Local Gates

| Script | Purpose | When run | Known issues / notes |
| --- | --- | --- | --- |
| `pnpm test:smoke` | Fast smoke gate through `scripts/run-smoke.ts`. | Epic PRs, local confidence. | Parallel execution means total time is max step time, but logs are split under `tmp/smoke`. |
| `pnpm audit:quick` | Sequential smoke-equivalent audit with JSON events/logs. | Local confidence when debugging order matters. | Duplicates smoke content but runs sequentially. |
| `pnpm audit:full` | Sequential full local rehearsal: format, lint, typecheck, unit tests, docs, desktop critical, desktop a11y. | Before initiative PRs to `master`. | Does not run metrics capture/compare even though `master` CI does. |
| `pnpm check` | `lint`, `typecheck`, full Vitest. | Pre-push and local completion gate. | No E2E, docs validation, or metrics. |

### Build And Runtime

| Script | Purpose | When run | Known issues / notes |
| --- | --- | --- | --- |
| `pnpm dev` | Vite dev server. | Browser-mode development. | Does not exercise Electron/MCP shell behavior. |
| `pnpm build` | SvelteKit static renderer build. | Production renderer validation and packaging. | Required before bundle metrics. |
| `pnpm preview` | Preview static renderer build. | Browser E2E and local production preview. | Long-running server. |
| `pnpm typecheck` | `svelte-kit sync` then `svelte-check`. | CI and local validation. | Depends on generated SvelteKit files. |
| `pnpm desktop:build` | Parallel renderer + MCP build, then Electron bundle through `tsup`. | Any desktop validation or packaging. | Build artifacts are required before desktop tests. |
| `pnpm desktop:run` / `desktop:start` | Run built Electron app. | Local desktop launch. | Requires prior desktop build. |
| `pnpm desktop` | Build then run desktop. | One-command desktop boot. | Combines validation and long-running app. |

### Tests

| Script | Purpose | When run | Known issues / notes |
| --- | --- | --- | --- |
| `pnpm test` | Full Vitest suite. | `master` gate and local validation. | No global coverage threshold. |
| `pnpm test:critical` | Curated critical Vitest subset. | Smoke gate. | Must be manually maintained as critical risks change. |
| `pnpm test:coverage` | Focused V8 coverage for export regression. | `quality-core`. | Narrow target only: `src/lib/domain/export.ts`. |
| `pnpm test:e2e` | Browser Playwright suite. | Manual/browser workflow checks. | Not currently merge-blocking. |
| `pnpm desktop:test` | Full desktop Playwright suite. | Broad desktop sweep. | Slow; builds first. |
| `pnpm desktop:test:critical` | Desktop critical-path suite. | `master` CI and local full audit. | Merge-blocking for `master`. |
| `pnpm desktop:test:a11y` | Desktop accessibility suite. | `master` CI and local full audit. | Critical/expired known violations fail; serious findings warn. |
| `pnpm desktop:test:perf` | Desktop benchmark suite. | Scheduled perf and metrics capture. | Slow; controlled by `PERF_BENCHMARK`/`PERF_RESULTS_PATH` in CI contexts. |
| `pnpm desktop:test:memory` | Desktop memory-profile suite. | Scheduled/manual memory analysis. | Not merge-blocking. |

### Quality And Static Analysis

| Script | Purpose | When run | Known issues / notes |
| --- | --- | --- | --- |
| `pnpm lint` | ESLint, navigation lint, token lint, repo audit. | Hooks, smoke, full CI. | Does not currently invoke `lint:circular` or `lint:mcp-boundary` directly; related assertions also exist in unit tests. |
| `pnpm lint:navigation` | Ensures navigation elements have approved labels. | `pnpm lint`. | Encodes the navigation contract as text/ARIA rules. |
| `pnpm lint:tokens` | Blocks arbitrary pixel font sizes and structural `dark:` token drift. | `pnpm lint`. | Svelte-only scan under `src`. |
| `pnpm lint:circular` | Madge circular dependency scan for `src/`, `electron/`, `mcp/`. | Manual or targeted audits. | Not wired directly into `pnpm lint`, but similar checks are in `tests/unit/lint-boundary-rules.test.ts`. |
| `pnpm lint:mcp-boundary` | Blocks direct filesystem imports in MCP tools outside allowlist. | Manual or targeted audits. | Not wired directly into `pnpm lint`, but similar checks are in unit tests. |
| `pnpm docs:validate` | Docs path, `TODO(APP)`, and schema-version validation. | `master` CI and local full audit. | Initiative planning docs are intentionally exempt from future-file path checks. |
| `pnpm format` / `format:check` | Prettier write/check. | Local cleanup and all CI tiers. | Format check is a first-class gate. |

### Metrics, Fixtures, And Reports

| Script | Purpose | When run | Known issues / notes |
| --- | --- | --- | --- |
| `pnpm metrics:capture` | Captures bundle, build, test, and performance metrics. | `master` PR CI and baseline refreshes. | Baseline profile repeats 3 times; CI profile repeats once. Extended browser/perf/memory timings require `--includeExtendedTests`. |
| `pnpm metrics:compare` | Compares current metrics to `tests/perf` baselines. | `master` PR CI and local regression review. | With `--enforceRegression`, any classified regression or budget failure exits non-zero. |
| `pnpm perf:compare` | Performance-only alias to metrics compare. | Backward-compatible perf checks. | Thin wrapper around `compare-baselines.ts --only performance`. |
| `pnpm memory:profile` | Runs desktop memory spec with `MEMORY_PROFILE=1`. | Manual/scheduled memory work. | Observational, not a branch gate. |
| `pnpm fixture:vault` | Generates synthetic fixture vaults. | Benchmarking, migrations, perf tests. | Can overwrite output only with `--force`; defaults to `tmp/fixture-vault`. |
| `scripts/accessibility-report.ts` | Produces markdown/json summary from axe policy report. | Accessibility reporting automation. | Not currently referenced by a GitHub workflow. |

### MCP, Vault, Desktop Packaging, Android

| Script | Purpose | When run | Known issues / notes |
| --- | --- | --- | --- |
| `pnpm mcp:dev` | Run MCP server from source. | MCP development. | Long-running. |
| `pnpm mcp:build` | Bundle MCP server with `tsup`. | Desktop build and release. | Shares types with renderer; boundary lint remains important. |
| `pnpm mcp:inspect` | Launch MCP inspector. | Interactive MCP debugging. | Uses `npx` and may require network/tool availability locally. |
| `pnpm vault:verify` | Vault verification CLI. | Vault integrity checks. | Not part of CI gates. |
| `pnpm desktop:package` | Build and package desktop installers. | Local release candidate generation. | Release workflow uses OS-specific variants and signing secrets. |
| `pnpm desktop:package:win` | Windows NSIS package. | Release artifacts workflow. | Requires Windows signing secrets in release workflow. |
| `pnpm desktop:package:mac` | macOS DMG + ZIP package. | Release artifacts workflow. | Requires signing and notarization secrets. |
| `pnpm desktop:package:linux` | Linux AppImage + deb package. | Release artifacts workflow. | No signing prerequisite in current workflow. |
| `pnpm desktop:smoke` | Launch built app against temp vault and wait for readiness marker. | Desktop build matrix. | Times out after 90 seconds. |
| `pnpm android:sync` | Build web assets and sync Android project. | Android release build. | Android validation is release-time only. |
| `pnpm android:assemble:release` | Gradle release APK build. | Local Android release generation. | GitHub workflow materializes signing files manually instead of using this package script. |

## Release Process

Release PR automation is handled by Release Please:

- `release-please.yml` runs on pushes to `main` or `master`.
- It uses `googleapis/release-please-action@v4`.
- Config comes from `release-please-config.json`.
- Release type is `node`.
- Tags include `v`, component tags are disabled, package name is `dndtools`, changelog path is
  `CHANGELOG.md`.
- If `RELEASE_PLEASE_TOKEN` is absent, the workflow intentionally skips to avoid `GITHUB_TOKEN`
  pull-request permission failures.

Release asset publication is handled separately:

1. `release-assets.yml` runs on GitHub release `published`/`edited` or manual dispatch.
2. Release events must include a `## Human Reviewed Notes` section.
3. Desktop installers build on Windows, macOS, and Linux through `electron-builder.yml`.
4. Windows requires `DNDTOOLS_CSC_LINK` and `DNDTOOLS_CSC_KEY_PASSWORD`.
5. macOS requires certificate, certificate password, Apple ID, app-specific password, and team ID
   secrets.
6. Android release APK builds on Ubuntu after `pnpm android:sync`; signing secrets are decoded into
   `android/app/dndtools-release.jks` and `android/keystore.properties`.
7. Published releases download all signed artifacts, flatten them into `release/`, generate
   `SHA256SUMS.txt`, require `RELEASE_SIGNING_PRIVATE_KEY`, sign checksums with OpenSSL, and upload
   release files with `gh release upload --clobber`.

Desktop packaging uses:

- `appId: com.dndtools.desktop`
- output directory `dist-desktop`
- packaged files from `build/`, `electron/dist/`, `mcp/dist/`, and `package.json`
- GitHub publish provider configured for owner `anthropics`, repo `dndtools`
- Windows NSIS x64, macOS DMG/ZIP x64+arm64 with hardened runtime, Linux AppImage/deb x64
- `dndtools://` deep link protocol and `.md` file association

## Performance Budget Registry

Budgets are defined in `src/lib/types/diagnostics.ts` as `PERFORMANCE_BUDGETS`.

| Operation | Target | Regression threshold | Description |
| --- | ---: | ---: | --- |
| `cold_start` | 3000ms | 3600ms | Desktop launch to ready shell. |
| `vault_open` | 2000ms | 2400ms | Select/open vault and finish initial load. |
| `note_open` | 200ms | 240ms | Notes list click to note view ready. |
| `search_response` | 150ms | 180ms | Search query to visible result set. |
| `note_save` | 100ms | 120ms | Save trigger to persisted completion. |
| `graph_rebuild_incremental` | 50ms | 60ms | Single-note graph update after mutation. |
| `mcp_bundle_call` | 800ms | 960ms | Session/recap/continuity bundle tool call. |

Bundle budget:

- Initial-route JavaScript gzip target: `100KB`.
- Current baseline records `initialRouteJsGzipBytes: 263987`, so the baseline itself is above the
  stated target.

Committed baseline files:

- `tests/perf/bundle-baseline.json`
- `tests/perf/build-baseline.json`
- `tests/perf/test-baseline.json`
- `tests/perf/performance-baseline.json`

The `metrics-report` job captures current metrics into `tmp/metrics/latest`, compares them against
`tests/perf`, writes markdown/json summaries, uploads artifacts, and updates a sticky PR comment.

## Ownership

`CODEOWNERS` assigns `@trent` as the default owner and explicitly covers:

- product and planning docs under `docs/`
- renderer routes, state, UI, platform, runtime, domain, markdown, and types under `src/lib` and
  `src/routes`
- Electron runtime under `electron/`
- MCP runtime under `mcp/`
- quality and automation under `tests/`, `scripts/`, and `.github/workflows/`

This is simple and clear, but it means all review ownership currently collapses to one maintainer.

## Gaps And Risks

| Gap | Impact | Carry-forward decision |
| --- | --- | --- |
| Browser E2E is not merge-blocking. | PWA/browser regressions can pass `master` CI if desktop coverage misses them. | Carry forward desktop-first gating, but add a small browser E2E smoke job for routes/storage fallback. |
| Android release validation is release-time only. | Android build or signing drift may be discovered late. | Add scheduled or PR-scoped `android:sync`/Gradle validation if Android remains in v2 scope. |
| `audit:full` does not run metrics capture/compare. | Local full rehearsal can be green while `master` PR metrics fail. | Extend `audit:full` or add `audit:release` for metrics parity. |
| Global coverage is not enforced. | Coverage can regress outside the focused export coverage gate. | Keep targeted coverage by default, but add coverage thresholds for highest-risk modules rather than whole-repo vanity targets. |
| `lint:circular` and `lint:mcp-boundary` are not package-script lint substeps. | Dedicated script names can drift from what CI actually enforces. | Either wire them into `pnpm lint` or keep one canonical enforcement path through unit tests and remove redundant scripts. |
| Memory profiling is scheduled/manual only. | Memory growth may go unnoticed until scheduled runs or manual checks. | Keep scheduled memory profiling; add alerting/artifact review expectations before treating it as a hard gate. |
| Release workflow depends on many secrets and manual release-note shape. | Releases can fail late because prerequisites are not checked until publication. | Add a release readiness workflow for dry-run validation before publishing. |
| Single CODEOWNER. | Review load and domain expertise are centralized. | Fine for solo project; redesign if v2 expects multiple maintainers. |
| `electron-builder.yml` publish owner is hard-coded as `anthropics`. | Forks/remakes can publish to the wrong metadata target if not updated. | Treat release metadata as remake-specific configuration, not reusable default. |

## Carry Forward

- Tiered branch model: epic PRs to `initiative/*`, initiative PRs to `master`.
- Aggregated `quality` status for `master` branch protection.
- `smoke` status for initiative branch protection.
- Commitlint on all PRs.
- Local `test:smoke`, `audit:quick`, and `audit:full` commands with structured logs.
- Desktop critical and accessibility E2E as `master` gates.
- Docs validation for path drift, schema-version drift, and long-lived `TODO(APP)` metadata.
- Metrics capture/compare with committed baselines and typed performance budgets.
- Release Please for changelog/release PR automation.
- Separate release-assets workflow with explicit signing prerequisites and checksum signing.
- Scripted desktop build that parallelizes renderer and MCP builds.

## Redesign Or Tighten

- Add a small browser E2E smoke gate, especially for IndexedDB/PWA-specific behavior.
- Add Android build validation before release publication.
- Make local full audit match CI by including metrics comparison or documenting it as a separate
  required pre-PR step.
- Decide whether custom lint scripts are canonical commands or implementation details behind tests.
- Revisit bundle budget enforcement because the committed baseline is already above the stated
  `100KB` initial-route target.
- Split release readiness from release publication so signing/packaging prerequisites fail before a
  public release event.
- Expand CODEOWNERS if maintainership grows beyond one person.
