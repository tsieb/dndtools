# CI recovery for 16dd3e7e

## Plan and reconciliation

- Task branch: `dispatch/dndtools/390784cd1668746a61b9`.
- Initial HEAD, local `loop/rc`, remote-tracking `origin/loop/rc`, and the supplied
  repair's parent were all `16dd3e7ef62ae2d8dbd8f4eff97d6a02a645044c`.
- Read `state/ci-visual-repair-2026-09-19.journal.md` from the supplied commit.
  Cherry-picked `0633246945a0c0e7b2f1853ad0ec9985f8637695` as `989061ed` without
  conflicts. The resulting tree is identical to the supplied repair's tree.
- Exactly 27 PNGs changed: board, scene editor, and Settings across three themes
  and three viewport tiers. The 18 board/scene baselines reuse `cdbca165`; that
  older commit was not separately applied. No duplicate baselines were generated.
- Runtime code, security assertions, screenshot tolerances, test configuration,
  and workflow protections remain unchanged.
- Byte comparison independently confirmed all 18 board/scene PNGs match
  `cdbca165`. Inspected contact sheets containing all 27 supplied images: board
  maps and scene character bindings match the recorded intent; Settings includes
  Scholar, Dungeon, and System with responsive wrapping, consistent with
  `acc2c4bd` and `src/screens/settings/Appearance.tsx`.

## Validation ledger

- `git diff --check 16dd3e7e..HEAD`: passed.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: exit 0;
  135 files, 12880.9 KiB of 32768.0 KiB.
- Full pinned-container comparison with `CI=1`, `--update-snapshots=none`, and
  `--reporter=line`: exit 0, **135 passed (2.5m)**, no failures or retries,
  with the assigned two browser workers. Baselines remain byte-identical to the
  supplied repair. The image is the existing v1.61.1-noble digest pinned by the
  runner and CI workflow.
- `pnpm systems:validate`: exit 0, PASS.
- `pnpm check:android`: exit 0, static preflight only (no Gradle compilation).
- `pnpm check:bundle-budget`: exit 0, core bundle 587.0 KiB gzipped.
- `pnpm ci:local --base 16dd3e7ef62ae2d8dbd8f4eff97d6a02a645044c`: exit 0,
  all eight steps passed: quality gates, secret scan, changed-file formatting,
  lint (including boundary and non-text contrast), workspace typecheck, production
  build, all unit suites, and core coverage. Assigned three test workers;
  Node 22.22.3 and pnpm 10.34.5.
- Unit totals: core 4902, cloud 521, app 1551, tooling 196; **7170 passed**.
  Core coverage: statements 89.87%, branches 79.94%, functions 93.02%,
  lines 94.06%. Existing lint warnings remain non-failing.
- Together, systems validation, Android preflight, and the local CI steps cover
  every constituent command in `pnpm check`; no gate implementation was changed.
- Both journals pass explicit Prettier checking, including this new journal
  which the committed-range formatting check does not yet include.
- Exact command output is retained locally under
  `/tmp/dndtools-ci-recovery-16dd3e7e/`; no dispatch Headroom tool was available.

## Handoff boundary

Independent review and central wrapper gates remain the central operator's work
after this task commits. No additional agent, loop, push, promotion, or dispatcher
control-state edit is authorized or performed. Local checks are not remote CI or
independent-review evidence.

## Report

Local visual acceptance and normal checks passed on the cherry-picked candidate.
Only this evidence journal was added afterward; all runtime, test, and PNG bytes
are unchanged. Final reconciliation still finds `loop/rc` at `16dd3e7e`.
The handoff contains exactly the supplied 27-image repair and two journals.
Independent review is pending, not claimed by this worker's image inspection.
