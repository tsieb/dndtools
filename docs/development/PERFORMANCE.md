# Performance Engineering

> This document was sharply reduced during the React pivot (ADR-018). The prior
> metrics-capture/baseline pipeline (`metrics:capture`, `metrics:compare`, `tests/perf/*.json`,
> `performance-regression.yml`) and the v1 Electron/vault/MCP diagnostics IPC no longer exist.
> Performance budgets now live in a single core registry; there is no automated capture/compare
> pipeline wired to scripts today.

## 1. Budget Registry

Canonical, owned source of truth:

- `packages/core/src/perf/budget-registry.ts` (`performanceBudgets`, validated by `validateBudgetRegistry`)

Each budget names the user workflow it governs, the owning domain, a user-facing risk, and a
measurement method (`latency-ms-p95`, `throughput-fps-p95`, or one-shot `duration-ms`). The registry
is pure (no DOM/Node/clock/entropy) so it is deterministic and unit-testable.

Current budgets (all `provisional` — provisional targets, no measured baseline yet):

| Budget id             | Target                 |
| --------------------- | ---------------------- |
| `smoke-ci`            | <= 3 min (duration)    |
| `app-startup`         | <= 2000 ms             |
| `vault-open`          | <= 3000 ms             |
| `scene-first-render`  | <= 1500 ms             |
| `widget-update`       | <= 100 ms (p95)        |
| `map-pan-zoom-desktop`| >= 50 fps (p95)        |
| `map-pan-zoom-slim`   | >= 30 fps (p95)        |
| `search`              | <= 250 ms (p95)        |
| `graph-indexing`      | <= 500 ms (duration)   |
| `sync-reconciliation` | <= 2000 ms (p95)       |
| `live-session-delivery`| <= 500 ms (p95)       |

The measurement half that grades observed samples against these budgets is
`packages/core/src/perf/measurement.ts`. The initial-route JavaScript bundle budget lives in
`packages/core/src/perf/bundle-budget.ts`.

## 2. Enforcement

`validateBudgetRegistry` fails closed when a budget is missing an owner, a user-facing risk, or (for
a provisional budget) a valid, un-lapsed `reviewDate`. It is exercised by the core unit test
`packages/core/tests/perf-budget-registry.test.ts`, which runs under `pnpm test:critical`
(and therefore `pnpm test` / `pnpm check`).

Because every budget is still `provisional`, each carries a `reviewDate`; once real baselines are
measured, promote the relevant budgets from provisional to measured in the registry.

## 3. When A Budget Matters To A Change

1. If a change touches a budgeted workflow (startup, scene render, widget update, map pan/zoom,
   search, graph indexing, sync/live-session delivery), confirm the relevant budget in the registry.
2. Add or update the measurement in `packages/core/src/perf/measurement.ts` (and its companion perf
   modules) rather than scattering ad-hoc timings.
3. Do not weaken a target to make a change pass; adjust the registry only through the owned review it
   documents.
