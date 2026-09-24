# CI recovery for a66f3475acfef4e5cbe975aca120b6c99235f5e5

## Integration reconciliation (2026-09-20)

- Rechecked GitHub run 35456494071: only the golden-route visual job failed,
  with 18 board/scene screenshot failures. Original log retained at
  `/tmp/ci-a66-original-failure.log`; the first attempt's local reproduction
  remains at `/tmp/ci-recovery-a66f3475/reproduce.log`.
- Reproduced the reported binary conflict by rebasing onto integration candidate
  `2d9f566d194d10e597c8001015b7e8be31811d59`.
- Integration commit `989061ed` already contains the 18-image binding repair,
  alongside newer Settings and map baselines. Kept the integration version of
  `visual-desktop/scene-editor--high-contrast.png` to preserve that reviewed repair.
  All other original screenshot changes were already identical to integration.
- Rebase completed; the task now changes only this journal relative to the
  integration candidate. No runtime, baseline, assertion or workflow changes
  remain relative to that candidate.
- Compared both versions of the conflicting PNG with Pillow: same 1280 x 800
  dimensions, 19 differing pixels, maximum channel delta 1. This is beneath the
  unchanged 40-pixel allowance and does not represent different scene content.
- Fresh app seed/widget tests passed (33 tests); core default-binding tests
  passed (9 tests). Headroom originals retrieved from artifacts
  `d7ce67914b0c4fb3b9d8f40ca325a567` and `e5466137382d464295f0114906dd8388`.
- Baseline budget passed: 135 files, 12881.2 KiB / 32768.0 KiB. `pnpm gates`
  passed all six gate contracts and documentation checks, with existing size
  warnings. Original stdout retrieved from `7c04ac18df9a496cae2a05ef6ee80664`.
- Dispatch Headroom is available on this retry and is used for command evidence.

### Fresh verification on the reconciled candidate

- `CI=1 bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`:
  exit 0, all 135 passed in 2.4 minutes, no retries. Exact log retained at
  `/tmp/ci-recovery-a66f3475/rebased-full-visual.log`; complete original retrieved
  from Headroom artifact `5a075721611641fcba0fb7f3bf5a8483`.
- Negative control: temporarily substituted the reported commit's desktop tavern
  board PNG, with automatic restoration in `finally`, then ran the same pinned
  comparison restricted to `--project=visual-desktop -g 'tavern.* /board$'`.
  The test failed on both attempts with 1853 different pixels, exit 1. Exact log:
  `/tmp/ci-recovery-a66f3475/rebased-negative-control.log`; original diagnostic
  retrieved from `47106ef2713b4df29c90687b99a10302`. This confirms the old baseline
  still fails under the unchanged assertion on the current candidate.
- Restored the verified PNG byte-for-byte and reran that single comparison:
  exit 0, 1 passed. `git diff --exit-code 2d9f566d -- apps packages .github pnpm-lock.yaml`
  confirms all implementation, test and workflow files match integration.
- Journal Prettier check and `git diff --check` passed. The final task commit
  records reconciliation and validation; the actual baseline fix is inherited
  from integration commit `989061ed`. No push, promotion, loop launch or
  dispatcher control-state edits performed.

## Original attempt

- Started on the clean task branch `dispatch/dndtools/4f04288619a056642f1b`, at the reported SHA.
- No applicable AGENTS.md or callable dispatch Headroom tools found. Exact command logs and
  downloaded CI evidence are retained under `/tmp/ci-recovery-a66f3475/`.
- Inspected CI runs [35456494071](https://github.com/tsieb/dndtools/actions/runs/35456494071)
  and [35456490131](https://github.com/tsieb/dndtools/actions/runs/35456490131). Both fail only
  `visual regression (golden routes)`; all other executed CI jobs passed.
- The original failed-job log reports 18 screenshot failures: board and scene editor in all
  three themes and viewport tiers. Reproduced in the identical pinned Playwright image
  with snapshot updates disabled.
- Following `docs/development/TESTING.md` section 8: inspect rendering against intended source
  changes before updating any baseline. No workflow or assertion changes planned.

## Reproduction and cause

- `CI=1 apps/gm-react/tests/visual/run-in-container.sh -g '/board|/scene/:id'
--update-snapshots=none` exited 1. All 18 tests failed on both initial and retry captures.
  Exact output: `reproduce.log`. All 18 local actual images are pixel-identical to the
  corresponding GitHub run images (Pillow RGB comparison).
- The stale baselines predate `c930cd99` (RC-ENG-8.2). That intentional fix binds the home
  Map tile to the default map and binds seeded library widgets to available entities.
  The board now shows Ruined Keep instead of a missing-map message, and the Sunken Crypt
  Character tile shows Brother Calloway, HP 31/31, AC 18 and inspiration instead of an
  unbound placeholder. Source inspection and the remote expected/actual/diff images agree.
- Rewrote only these 18 baselines via the documented pinned-container command with
  `--update-snapshots=changed`. The source, specs, tolerances and workflow stay unchanged.

## Verification

- Baseline update: exit 0, 18 passed (`update.log`). All 18 generated PNGs are byte-identical
  to the actual screenshots downloaded from CI run 35456494071.
- Reviewed all 18 rewritten images in desktop, rail and phone contact sheets, plus the
  original before/after crops and Playwright diff images. The seed bindings explain the
  changed content; the surrounding layouts and themes are preserved.
- App seed and built-in widget tests: exit 0, 2 files / 33 tests (`app-tests.log`):
  `pnpm exec vitest run --config vitest.app.config.ts
apps/gm-react/src/runtime/demo-seed.test.ts
apps/gm-react/src/app/widgets/builtin/builtin-bodies.test.tsx`.
- Core default-binding tests: exit 0, 1 file / 9 tests (`core-tests.log`):
  `pnpm --filter @dndtools/core exec vitest run tests/command-center-default-bindings.test.ts`.
- Baseline budget: exit 0, 135 files / 12832.8 KiB against 32768.0 KiB.
- `pnpm gates`: exit 0, six gate contracts and documentation checks passed; existing
  file-size warnings remain (`gates.log`).
- Full visual comparison: exit 0, 135 passed (`full-visual.log`), using
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none`.
- Final journal formatting and `git diff --check` passed. Verified the change scope is
  exactly the 18 intended baselines and this journal. No assertions, screenshot tolerances,
  test configuration, production source or workflow protections changed.
- No push, promotion, additional agents, loop launch or dispatcher control-state edits.
  The central operator retains integration gates and independent review.
