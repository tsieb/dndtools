# Dependency Audit

> HISTORICAL ARTIFACT — point-in-time audit dated 2026-03-13. It predates the React pivot
> (ADR-018) and audits the retired v1 desktop / browser / MCP-sidecar dependency tree. It does
> NOT reflect the current dependencies of `apps/gm-react`, `packages/core`, `packages/cloud-fns`,
> or `infra/`. Kept for history only; references below (MCP flows, vault/markdown ZIP export,
> `tests/unit/repo-boundary-audit.test.ts`, Initiative 21) describe code that no longer exists.
> Re-run a fresh audit against the current workspace before acting on anything here.

Last reviewed: 2026-03-13

## Current posture

- Runtime dependency health is currently acceptable for the active desktop, browser, and MCP flows.
- No direct dependency removals were applied in this pass because each declared package is referenced by runtime code, build tooling, tests, or packaging workflows.
- Boundary-risk checks are now enforced in `tests/unit/repo-boundary-audit.test.ts` and wired through `pnpm lint`.

## Cleanup plan

1. Keep `fflate` as the browser-safe archive implementation for markdown ZIP export so browser mode no longer falls back to JSON-only vault exports.
2. Revisit Electron-only packaging dependencies (`adm-zip`, `electron-builder`, `electron-updater`) if packaging moves into a dedicated workspace; they are still active and intentionally retained today.
3. Re-run this audit when Initiative 21 decomposition work lands, because route/module extractions may create new opportunities to trim duplicated dependencies and shrink transitive install surface.
