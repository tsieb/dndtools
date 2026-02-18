# Roadmap

This roadmap starts from the current Electron-first + staged-MCP baseline.

## Current Baseline (Implemented)

- Desktop runtime with filesystem-backed vault.
- MCP sidecar integration with status/restart visibility in Settings.
- Staged MCP change review and approval workflow.
- Session board and object note systems integrated with storage.

## Phase 1: Trust and Safety (P0)

1. Data Integrity Hardening
- `TODO(APP):` atomic file writes for notes and `.vault` metadata.
- `TODO(APP):` corruption detection + guided repair flow.
- `TODO(APP):` migration/version strategy for `.vault` metadata files.

2. Security Hardening
- `TODO(APP):` replace broad IPC storage dispatch with explicit typed channels.
- `TODO(APP):` validate all IPC request payloads at boundary.
- `TODO(APP):` add threat model doc for Electron + local vault + MCP surfaces.

3. Test and CI Enforcement
- `TODO(APP):` CI workflows for lint/typecheck/test/build/e2e.
- `TODO(APP):` MCP tool test suite expansion to all tools.

## Phase 2: Core UX and Performance (P1)

1. Search and Navigation
- advanced query operators and filtered result UX.
- richer unresolved-link handling and disambiguation.

2. Startup and Runtime Performance
- incremental link graph updates.
- measurable performance budgets for startup/search/save.

3. Vault Operations UX
- safer import preview and conflict handling.
- more portable export profiles with validation report.

## Phase 3: Platform Maturity (P1/P2)

1. Packaging
- remove packaged runtime dependency on external node binary for sidecar spawn.
- startup diagnostics for missing bundled MCP artifacts.

2. Accessibility Program
- automated route-level a11y checks.
- keyboard and screen-reader QA matrix.

3. Documentation and Governance
- establish ADR process and baseline ADRs.
- keep docs and contracts in lockstep through CI checks.

## Deferred Until Stability Gates

- cloud sync/collaboration
- plugin ecosystem expansion
- broad strategic integrations

## Exit Criteria for "Core Stable"

All must pass:
1. CI quality gates active and required.
2. MCP tool tests cover all write-capable tools.
3. Filesystem write integrity protections implemented.
4. Security hardening for IPC contract complete.
5. Docs reflect current behavior with no known critical drift.
