# ci-recovery-812a37e493f1 run journal

## Scope and starting state

- Task: repair CI for promoted commit `812a37e493f16731129b2bbc30327f0b4aef3600`.
- Current integration candidate: `51cec177` (includes RC-WID-4.3). Worktree initially clean.
- No push, promotion, other agents, loop launches, or dispatcher control-state edits.

## Investigation

- GitHub CI runs: [35442240164](https://github.com/tsieb/dndtools/actions/runs/35442240164)
  and [35442236325](https://github.com/tsieb/dndtools/actions/runs/35442236325).
- Only the golden-route visual job failed; build/unit/coverage, all browser shards,
  accessibility, Electron, and Android jobs succeeded.
- Retrieved the complete original failed log through dispatch Headroom artifact
  `cc34459306574fca89cc1ad16072d7c8`: 18 failed, 117 passed. Failures are
  `/board` and `/scene/:id`, in three themes and three viewport projects, including retries.
- Assertions, thresholds, workflow protections, and the pinned rendering environment
  remain unchanged.

## Root cause and repair

- `c930cd99` (RC-ENG-8.2) intentionally binds the home board's Map tile to the
  active/default map and seeds required widget bindings. `c8a2c291` makes that map
  tile accessible with decorative markers and a wrapping zoom-control row.
- The committed golden images still expect an unbound map error on `/board` and
  an unbound Character tile on `/scene/:id`. Local desktop expected/actual/diff
  review shows only those tile contents changing: Ruined Keep renders on the
  board, and Brother Calloway with HP/AC/inspiration renders in The Sunken Crypt.
- Followed `docs/development/TESTING.md` section 8: regenerated only the 18 affected
  images in the pinned container, reviewed each, then compared the complete suite
  with snapshot updates disabled. No production source fix is needed for this
  omitted baseline update.
- Supporting checks on the current candidate passed: default-map binding core
  tests (9), demo seed and built-in widget body tests (33), CI guardrails (14).
  Original Headroom outputs retrieved; existing Vite config-loader and React
  `act` warnings remain non-fatal.

## Reproduction and visual review

- `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --reporter=line`
  reproduced **18 failed / 117 passed**, exit 1, in 3.0 minutes on `51cec177`.
  Complete log: `/tmp/ci-recovery-812a37e493f1/reproduce.log`; exact Headroom
  artifact `1a4378036f1c4e01a968fb461388e4f8` retrieved in full.
- Every failure's pixel count matches GitHub, including each retry. For example,
  desktop tavern board: 1853; desktop tavern scene: 1200; phone high-contrast
  board: 841; phone high-contrast scene: 222.
- Preserved original expected/actual/diff images under
  `/tmp/ci-recovery-812a37e493f1/reproduction-images`. Reviewed all 18 comparisons
  in six contact sheets (two routes, three viewport sizes, all themes). Only map
  and character tile contents materially change; the surrounding layouts agree.
- Regenerated with the same pinned image using
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=changed --grep '/board|/scene/:id' --reporter=line`:
  18 updated images, 18 passed, exit 0 (26.7s). This update run is generation
  evidence, not the comparison gate. Log: `/tmp/ci-recovery-812a37e493f1/update.log`.
- Fifteen generated PNGs are byte-identical to the reviewed reproduction images.
  Also opened the three remaining generated desktop PNGs individually (board
  tavern, scene-editor parchment/high-contrast); their content matches the review.
- Baseline size gate: 135 files, 12832.8 KiB of 32768.0 KiB, exit 0.
- Final full comparison:
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --reporter=line`
  passed **135/135, no retries, exit 0 (2.4m)** on the current integration candidate
  plus this repair. Exact original log retrieved in full from Headroom artifact
  `9c3f91ae709c417f9fbb1d3c95f0031d`; local copy:
  `/tmp/ci-recovery-812a37e493f1/verify.log`.

## Supporting validation commands

All executed on the current integration candidate; exit 0:

- `pnpm --filter @dndtools/core exec vitest run tests/command-center-default-bindings.test.ts`
  (9 tests; Headroom `30d231b5363b40759a63e2c5cca66f9b`).
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/runtime/demo-seed.test.ts apps/gm-react/src/app/widgets/builtin/builtin-bodies.test.tsx`
  (33 tests; Headroom `79c6069d9b6b426e9dd87a0aa9c45c59`).
- `pnpm audit:repo` (14 tests; Headroom `2055d3e00fcf4efe940e66c1e4762bb2`).
- `pnpm gates` (quality metadata and documentation checks passed; existing
  file-size warnings only; Headroom `eb1cdd3ed39d4786b968394f9c0a4618`).
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs` (Headroom
  `dc1ba9fa3efa4e5cac230abbf39c4466`).
- Journal Prettier check and `git diff --check`.

The implementation changes only the 18 affected baseline PNGs and this journal.
No assertions, masks, thresholds, retries, test selection, workflow, or production
source changed. The operator's independent gates and review remain pending.

## Integration reconciliation (2026-09-20)

- Resumed from `0f191f2a` after the operator reported a binary rebase conflict.
- Rechecked GitHub run `35442240164` for the requested promoted SHA: the visual
  job still reports 18 failed / 117 passed. Original diagnostic output retrieved
  from Headroom artifact `0a273bea18a648a6a3e9912e59d1735a`.
- Rebased this task onto the current `loop/rc` candidate
  `2d9f566d194d10e597c8001015b7e8be31811d59`. Integration commit `989061ed`
  already includes the same 18 baseline repairs; 17 PNGs are byte-identical.
- Kept integration's desktop parchment scene PNG for the sole binary conflict,
  preserving subsequent integration work. Full comparison validation pending.
- Opened both conflicting images. Decoded RGBA comparison found only 29 pixels
  differing by at most 1 channel value in the header button at x=1097..1135,
  y=15..58; the repaired character tile is identical. Exact comparison output:
  Headroom `0f6c7bf790234ea7b6e852bea16120ef`.
- Rechecked the retained initial reproduction log: 18 failures on the two canvas
  routes, 117 passes, followed by the original 135-pass repair verification.
  These are prior-attempt runs, separate from the post-rebase run below.
- Post-rebase supporting checks passed: default-map bindings (9 tests), demo seed
  and built-in widget bodies (33 tests), CI guardrails (14 tests), `pnpm gates`,
  baseline budget (135 files, 12881.2 KiB), Prettier, and `git diff --check`.
  Retrieved full original outputs from Headroom
  `6f221ed0e79745349974d60dc7072efc` and `e293e76023bd414484ae78c5fdeee56f`.
  Existing Vite, React act, and file-size warnings remain non-fatal.
- Post-rebase full pinned-container comparison passed **135/135, no retries,
  exit 0 (2.4m)**:
  `CI=1 bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2 --reporter=line`.
  Full original log retrieved from Headroom
  `8db788207e474c2c968d5ef32d970922`, also retained at
  `/tmp/ci-recovery-812a37-reconcile/verify.log` (SHA-256
  `5cf6a95134b56d56444c66b927819e7a071f578b5b2e788652c087ad7c72b776`).
- Final delta against `2d9f566d` is this journal only: the baseline fix is already
  integrated in `989061ed`. No baseline generation, production changes, test
  weakening, or workflow edits were needed during reconciliation. All integration
  files are preserved byte-for-byte. Independent operator review/gates remain
  pending; nothing was pushed or promoted and dispatcher control state was untouched.
