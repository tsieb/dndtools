# RC-KNW-4.3 run journal

## Plan and decisions

- Use the actor-filtered visualization for a linear adjacency index; no durable state changes.
- Collapse labels above 24 desktop / 12 phone nodes, revealing selected, hovered and keyboard-active labels.
- Focus freezes a selected node's one-hop neighborhood so walking does not move the target set.
- Arrow keys wrap through canvas order; Home/End jump; Enter/Space retain native selection behavior.
- No Headroom or journal tool is exposed. Keep this journal within the owned graph directory.

## Ledger

- Graph.tsx and graph/interaction.ts: implementation written; validation pending.
- Existing browser graph-indexing capture: pending, disclose actual fixture size.

## Edits and validation progress

- Added English/Spanish messages and graph browser coverage under the roadmap §0.3 automatic grants for tests and message catalogs.
- Unit suite: `pnpm test:app` — 124 files / 1,305 tests passed.
- Targeted ESLint and boundary lint passed.
- Initial desktop tests exposed a text-selector collision; renamed the focus control.
- Mobile run exposed pointer-target replacement during label reveal; made inner node content pointer-transparent. Retest pending.
- Mobile layout assertion included Playwright auto-scroll; scroll the result into view before taking the baseline.
- TypeScript caught an untyped design-system Button event; added the explicit React event type. Retest pending.

## Final gates and report

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0 on final implementation.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/graph.spec.ts --project=desktop-chromium --project=mobile-chromium`: exit 0, 32 passed, including the mobile pointer regression and layout checks.
- Targeted ESLint: exit 0 on final implementation. `pnpm lint:boundary`: exit 0.
- App unit suite: 124 files / 1,305 tests passed before the final pointer-events and event-type fixes; browser suite and typecheck verified those fixes.
- Reproduce sample: `pnpm perf:capture --only graph-indexing --notes 200 --port 5897 --out /tmp/graph-perf.json`.
- `perf-sample.json`: final implementation, Chromium/Vite dev, five actual linked-note additions observed in the graph rail: 77.1, 89.4, 95.4, 52.9, 33.2 ms. Hostname redacted; timings unchanged.
- Core `measureBudget('graph-indexing', samples)` grades max 95.4 ms against 500 ms as pass. Its generated message repeats the registry dataset, NOT the measured fixture: this capture used 200 notes on a desktop workstation, not the declared 10,000-record background-worker profile. No full-dataset or baseline-regression claim.
- DONE: density-based labels, stable neighborhood focus, keyboard canvas walk, linear connection lookup, reproducible perf sample. Central gates and independent review remain with the operator. No push or dispatcher-state changes.
