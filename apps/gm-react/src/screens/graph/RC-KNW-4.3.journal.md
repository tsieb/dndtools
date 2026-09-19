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

## Gate recovery

- Read the original dispatcher attempt log `08a6f126-222e-492f-97e5-fcb7d888d3d1/output.log`: sole error was Graph.tsx at 874 counted lines, exceeding the 800-line hard limit.
- Extracted health rendering, labels and existing memoized actor-scoped reads to graph/Health.tsx. No query or interaction behavior changes intended.
- Quality gate, typecheck and desktop/mobile graph regression checks pending on the split.
- First extraction hit the raw-style ratchet: moving inline styles requires changing an unowned central allow-list. Revised the split to graph/presentation.ts (presentation mappings, ellipse layout, and health-read hook), leaving all JSX and styles in Graph.tsx. No allow-list or gate changes.
- Final extraction also moves the existing actor-scoped node-opening hook. Graph.tsx is now 772 lines, presentation.ts 137; `pnpm gates` passes all six gates, with the existing soft size warning retained.
- Intermediate browser run overlapped the last source edit and had two runtime-load timeouts before test bodies. Discarded that run as final evidence; rerunning against stable files.

### Recovery final evidence

- Final stable source: 32/32 graph browser tests passed across desktop/mobile Chromium (38.4s); 3/3 interaction unit tests passed; app typecheck, targeted ESLint and boundary lint passed.
- Refreshed `perf-sample.json` after the final split: 138.8, 190.6, 91.1, 80.6, 78.7 ms; core measurement reports pass, maximum 190.6 ms against 500 ms. This supersedes the previous capture, still uses 200 notes, and makes no 10,000-record or baseline-regression claim.
- Recovery complete: presentation mappings, layout, health queries and open-node navigation extracted without changing styles or interactions. Only owned graph paths changed in this recovery.
