# ci-recovery-df073f662e05 run journal

## Scope

Repair GitHub CI for promoted commit `df073f662e0597e96c0ede7cac94a6acac12f8a3` on `loop/rc`.
Failing workflows: Supply Chain (PR run 35961572668) and CI (push run 35961566590, PR run
35961572783). Reproduce locally, fix the cause, and verify without weakening tests or workflow
protections. No push, promotion, loops, or dispatcher control-state edits.

## Diagnosis

Two independent causes. `origin/loop/rc` was still `df073f66` when this run finished, and no
sibling `ci-recovery-df073f66*` branch existed.

### 1. Supply Chain › `workflow and shell policy` › `Lint repository deployment scripts`

```
In infra/deploy.sh line 294:
      PARAM_OVERRIDES[$i]="${pair%%=*}=$(sam_quote_override_value "${pair#*=}")"
                      ^-- SC2004 (style): $/${} is unnecessary on arithmetic variables.
```

Introduced by `0ca52d33` (RC-ENG-5.3). Reproduced locally with the same shellcheck release the
workflow pins (`koalaman/shellcheck:v0.11.0`): exit 1 on `HEAD:infra/deploy.sh`.

### 2. CI › `browser E2E` shards 2 and 3 › `responsive.spec.ts:1121` "200% large text keeps every route whole"

Fails on the phone and rail tiers, on both `desktop-chromium` and `mobile-chromium`, in both runs.
It also failed on Playwright's retry. Only `/graph` is reported:

- phone: `Campaign Primer, Note, 2 connections is under Faction · The Ashen Hand, …`
- rail: `Clusters is under Player view once scrolled into view`

Reproduced locally (`--project=desktop-chromium -g "200% large text"`: phone and rail red). Both
come from RC-POL-1.12 (`7920b173`), which moved graph sizing onto rem tokens:

- **Phone.** `graph.css` gave every `.graph-surface button` a `min-width`/`min-height` of
  `--space-12`. That includes the canvas node buttons. At 32px root that is 96px, so the 16 ring
  nodes on a ~330px canvas were stacked on top of each other (measured: every node 96×96, centres
  48px apart). The nodes are canvas targets that already set an explicit 48–70px size, so the
  text-scaled floor added nothing but overlap.
- **Rail.** The layout grid became `minmax(0, 1fr) minmax(0, 20rem)`. At 200% text the rail wants
  640px of a 648px surface, so the canvas column resolved to **0px** (measured `0px 608px`). The
  canvas collapsed, every node sat at the same point, and the absolutely placed Clusters toggle
  landed under the app-shell nav rail's "Player view" button. On the desktop tier the test still
  passed, but the canvas was squeezed to 280px.

The other red/flaky entry, `responsive.spec.ts:1528` (standalone player view skip link, flaky in
PR run 35961572783), is the known base flake (fails ~30% on base `0b6f2f98`) and not touched here.

## Repair

- `infra/deploy.sh`: `PARAM_OVERRIDES[$i]=` → `PARAM_OVERRIDES[i]=`. The array is indexed
  (`PARAM_OVERRIDES=()`), so the subscript is arithmetic and `i` is evaluated. The behaviour is
  unchanged, and `x=1 y=2` → `x=Q y=Q` was checked in bash.
- `graph.css`: the text-scaled control floor now skips `[data-testid='graph-node']`. Nodes keep
  their 48–70px explicit size, so the RC-POL-1.12 "canvas targets at least 48px" check still
  holds.
- `graph.css` + `Graph.tsx`: the canvas/rail grid moved into a `.graph-layout` class.
  `.graph-surface` is now an inline-size container, and the grid stacks to one column below
  `39.25rem` (18rem canvas + 1.25rem gap + 20rem rail). At the default 16px root that is 628px, so
  every existing two-column layout is unchanged. Measured at 16px before and after, the grid
  columns were identical: rail `308px 320px`, 1024px `564px 320px`, desktop `620px 320px`. At
  200% text the rail stacks under the canvas instead of crushing it. The phone tier keeps its
  explicit single column.

No test, threshold, workflow or baseline was changed.

## Verification (local, on this branch)

- `koalaman/shellcheck:v0.11.0 infra/deploy.sh infra/verify-*.sh scripts/check-cloudformation-drift.sh`
  → exit 0. On the original `deploy.sh` it exits 1 with SC2004.
- `playwright test responsive.spec.ts graph.spec.ts graph-polish.spec.ts graph-repair.spec.ts
map-room-graph.spec.ts --retries=0` (both projects) → 216 passed.
- `responsive.spec.ts -g "200% large text keeps" --repeat-each=4 --retries=0` (both projects) →
  24 passed.
- `tests/visual/run-in-container.sh -g graph --retries=0` (pinned image, all three visual tiers) →
  15 passed with no baseline changes.
- `tsc --noEmit` (gm-react) clean; `pnpm lint` exit 0; Prettier clean on the changed files.
