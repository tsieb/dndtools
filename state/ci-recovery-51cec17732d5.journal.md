# CI recovery for 51cec17732d5423acaa381ff8c6a521f8a566e0c

## Investigation

- Task branch: `dispatch/dndtools/7cca09f39b00cb2ed230`; initial HEAD is the reported
  commit `51cec17732d5423acaa381ff8c6a521f8a566e0c`, with a clean working tree.
- No applicable `AGENTS.md` found. Dispatch Headroom tools are unavailable; commands
  use exact native output, with full diagnostic logs retained in
  `/tmp/ci-recovery-51cec177/`.
- GitHub CI runs `35443622672` and `35443620574` both fail only the golden-route
  visual job. Build/unit tests, all browser shards, accessibility, Android, and
  Electron pass. The first run's original failure log reports 18 failed and 117
  passed: `/board` and `/scene/:id`, across all three themes and viewport tiers.
- Reproduction ran against the unmodified candidate in the repository's
  pinned Playwright container, with `CI=1`, `--update-snapshots=none`, and the
  existing pixel tolerance and retries.

## Cause and repair

- The local desktop diffs are confined to the Map and Character tiles. The old
  board baseline says `Not bound` and shows a missing-map notice; the current
  render shows `Ruined Keep` and its map. The old scene baseline shows an unbound
  Character with empty statistics; the current render shows Brother Calloway,
  HP 31/31, AC 18, and inspiration 1/1.
- This matches the intentional default-binding repair in `c930cd99` (RC-ENG-8.2):
  `command-center.ensure-home` selects the default map, and `seedDemoContent`
  binds required library widgets to a seeded entity sorted by name. Its follow-up
  `c8a2c291` makes the bound Map tile pass the browser/accessibility gates. Neither
  commit updated the visual baselines.
- Repair scope: refresh only the two affected routes across three themes and
  three viewport tiers, following `docs/development/TESTING.md` section 8. Keep
  the workflow, fixture, assertions, pixel tolerance, and snapshot comparison
  mode unchanged.

## Validation

- `pnpm --filter @dndtools/core exec vitest run tests/command-center-default-bindings.test.ts`:
  exit 0, 9 passed.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/runtime/demo-seed.test.ts`:
  exit 0, 3 passed.
- Full original-candidate reproduction:
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --reporter=line`
  exited 1: exactly 18 failed / 117 passed (3.0m), matching both GitHub CI runs.
  Original local artifacts are retained at
  `/tmp/ci-recovery-51cec177/local-reproduction/` before subsequent runs overwrite
  Playwright's output directory.
- Downloaded `visual-regression-report` from run `35443622672` and compared all
  36 actual captures (18 cases plus retries) with local reproduction: 32 are
  pixel-identical; the other four differ by only 5, 10, 17, and 32 pixels, within
  the unchanged 40-pixel tolerance. This corroborates the local reproduction
  against the actual remote failure artifacts.
- `pnpm gates`: exit 0; 6 gates wired, 257 documentation files reachable and 286
  relative links resolved; existing file-size warnings only.
- Scoped update:
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=changed -g '/board|/scene/:id' --reporter=line`:
  exit 0, 18 passed (26.2s); exactly the expected 18 PNGs changed.
- Opened and visually reviewed every rewritten PNG: board map contents and scene
  character contents match the intended binding repair in all themes and viewport
  tiers. Existing canvas zoom/clipping and surrounding shell layouts remain as
  before; the phone scene shows the same partially visible character tile with
  its newly populated content.
- Baseline budget: exit 0, 135 files, 12832.8 KiB of 32768.0 KiB.
- `pnpm exec vitest run tests/unit/ci-guardrails.test.ts`: exit 0, 14 passed.
- Journal Prettier check and `git diff --check`: exit 0.
- Final full comparison:
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --reporter=line`:
  exit 0, **135 passed (2.4m)**, no retries. The reviewed binary patch remained
  byte-identical through verification; the test did not rewrite the baselines.
- The candidate started at current local `loop/rc`, which also resolved to
  `51cec17732d5423acaa381ff8c6a521f8a566e0c`. Final changes comprise only these
  18 baselines and this journal; no source, test assertion, threshold, fixture,
  or workflow changes. No push, promotion, loop launch, or dispatcher control
  state edit. Central operator gates and independent review follow this commit.

## Integration reconciliation (2026-09-20)

- Resumed from the restored task commit `6f33fe27` with a clean working tree.
  Rechecked GitHub run `35443622672`: the sole failing CI job remains visual
  regression, with 18 failed and 117 passed. The original local reproduction
  log at `/tmp/ci-recovery-51cec177/reproduce.log` retains the matching 18
  board/scene failures and 117 passes.
- Rebased this task branch onto the requested integration commit
  `2d9f566d194d10e597c8001015b7e8be31811d59`, also the current local `loop/rc`.
  Integration commit `989061ed` already supplies the same widget-binding
  baseline repair, plus its own settings changes.
- Resolved the two binary conflicts by retaining integration's desktop scene
  baselines for high-contrast and parchment. Direct RGB comparison against the
  original task images finds only 19 and 29 different pixels respectively, all
  within `(1097, 15, 1136, 59)` around the shell's people button. These are below
  the unchanged 40-pixel tolerance. Both images were opened and reviewed; the
  populated Brother Calloway tile is preserved.
- All other 16 task baselines were already byte-identical to integration.
  Therefore the reconciled task diff adds only this journal, preserving every
  integration source and baseline change without redundant binary churn.
- Dispatch Headroom tools are available on this continuation. Exact diagnostic
  output is retrieved before recording results. The full visual suite uses the
  native command runner because Headroom's 120-second maximum kills longer
  runs; its original log is retained at
  `/tmp/ci-recovery-51cec177-reconcile/verify.log`.
- Full current-integration verification:
  `CI=1 bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2 --reporter=line`
  exited 0: **135 passed (2.4m)**, without retries or baseline rewrites.
  Tested runtime, test, and baseline files are byte-identical to integration
  `2d9f566d194d10e597c8001015b7e8be31811d59`; subsequent edits only record results
  in this journal. No assertions, thresholds, workflow protections, or fixtures
  were weakened.
- Re-ran the default-binding unit tests (9 passed), demo-seed tests (3 passed),
  and CI guardrails (14 passed) on the reconciled integration candidate; all
  commands exited 0. `pnpm gates` passed with existing size warnings only.
  The baseline budget passed at 135 files / 12881.2 KiB of 32768.0 KiB.
  Journal Prettier and `git diff --check` passed.
- The final task commit records the reconciliation and verification evidence;
  the repair itself is already in ancestor `989061ed`. No push, promotion, new
  loop, or dispatcher control-state edit was performed. Central operator gates
  and independent review remain the next step.
