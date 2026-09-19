# CI recovery for c8a2c291463c

Task: `ci-recovery-c8a2c291463c39e0f1deeff83cc64027ce3bcf59`.
Starting candidate: `c8a2c291463c39e0f1deeff83cc64027ce3bcf59`; task branch
`dispatch/dndtools/1e6d5aa7286e9724da3f`. Initial worktree clean.

## Investigation

- Inspected GitHub CI runs [35435957775](https://github.com/tsieb/dndtools/actions/runs/35435957775)
  and [35435955271](https://github.com/tsieb/dndtools/actions/runs/35435955271).
- Both report visual failures on `/board` and `/scene/:id`: 18 failures across
  three themes and three viewports. Other 117 visual cases pass.
- Run 35435957775 also times out in the real-repository baseline case in
  `tests/unit/boundary-lint.test.ts` at 5000 ms. The other run passes build-and-test,
  Android, Electron and accessibility; all browser shards pass in both runs.
- Retrieved exact original Headroom job metadata and failed log output before
  diagnosing (log artifact `bc51a48137d84bce8f875e7c0afe1eca`).

## Reproduction and repair

- `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --grep '/board|/scene/:id'`
  reproduced all 18 visual failures, including retries, in 67.8 seconds (exit 1;
  exact output retrieved from artifact `9aa3b962acae4f8a8568870860f50689`).
- Reviewed expected/actual/diff images: RC-ENG-8.2 intentionally binds the home
  Map tile to Ruined Keep and the scene Character tile to Brother Calloway.
  Previous baselines recorded the missing-map error and unbound character.
  Updated only these two routes across three viewports and three themes using
  the repository's pinned Playwright container and `--update-snapshots=changed`.
  No screenshot tolerance, mask, route, assertion or workflow changed.
- The original local tooling suite passed, but the boundary suite took 3161 ms.
  CPU profiling attributed 2723 ms to the string-stripping regex, and a line-level
  probe isolated `apps/gm-react/src/app/markdown/plugins.ts:111` (2401 ms).
  Escapes could match both regex alternatives, causing exponential backtracking
  after an unmatched quote in a regex literal. The new regression fixture with
  28 escapes did not complete before the tool killed it at 30 seconds on the old
  code (artifact `019e0443fad243c484c61cdf330f7e92`).
- Made the ordinary-character alternative exclude backslashes, keeping it
  disjoint from the escape alternative. Added regression coverage for the slow
  input with a real forbidden access afterward, and for escaped single/double/
  backtick quotes with forbidden access outside the string. All existing
  assertions and the default five-second test timeout remain intact.
- Prettier also rewrapped existing lines in the two edited TypeScript files,
  as required by the whole-file changed-format gate; those changes are cosmetic.

## Verification

- `pnpm test:tooling`: 26 files, 195 tests passed, including all 22 boundary tests
  in 252 ms (exit 0; exact artifact `38b4f54e213c4fc182864f57ae242496` retrieved).
- `pnpm lint`: exit 0, existing warnings only; boundary, emphasis and contrast
  checks pass (both original streams retrieved from `09720ae5e1424684b95cbb9cc6101043`).
- Visual size budget: 135 files, 12832.8 KiB / 32768.0 KiB, exit 0.
- `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none`:
  all 135 passed in 2.5 minutes, no retries, exit 0. Complete log retrieved from
  `b16379c07cfc4b6aa81a2055dbd7b436`; snapshots were not rewritten by verification.
- `pnpm test`: all 7138 tests passed (4895 core, 521 cloud, 1527 app, 195 tooling),
  exit 0. Complete log retrieved from `546a852032904f8ab81b093d0d967df7`.
- Focused verbose boundary run: all 22 passed; real repository 157 ms and the
  previously stalled fixture 1 ms (original `1cf38c0ea78f4c329e2f07c1bbffaa8a`).
- `pnpm gates`, `pnpm security:secrets`, explicit Prettier checks and
  `git diff --check`: exit 0. Existing lint/file-size warnings remain unchanged.
- Host checks used Node v22.22.3 and pnpm 10.34.5; visual checks used the exact
  pinned CI image. GitHub's Node 24 build, coverage and platform jobs are left
  to the operator's subsequent gates; they were not rerun remotely here.
- Post-commit `pnpm format:check:changed --base c8a2c291463c39e0f1deeff83cc64027ce3bcf59`:
  all three changed text files pass, exit 0 (exact output retrieved from
  `c63e12c9217d4b3eb6e7430d7cbce37c`). The initial pre-commit invocation was
  vacuous because this script inspects committed changes; it is not gate evidence.

No push, promotion, additional agents, loops or dispatcher control-state edits.

## Integration conflict reconciliation (2026-09-20)

- Rechecked the original GitHub run 35435957775 with `gh run view --log-failed`:
  the real-repository boundary test exceeded 5000 ms and 18 board/scene visual
  cases failed. Headroom tools are unavailable in this retry; raw command logs
  are retained under `/tmp/ci-c8a2c291-*`.
- Reproduced the reported rebase conflict onto
  `2d9f566d194d10e597c8001015b7e8be31811d59`. Integration commit `989061ed`
  already contains all 18 repaired board/scene baselines as well as newer
  settings baselines. Sixteen board/scene PNGs are byte-identical; the two
  conflicting PNGs differ in encoded size by only one and two bytes.
- Kept the integration versions of `visual-desktop/scene-editor--high-contrast.png`
  and `visual-rail/scene-editor--tavern.png`, preserving all integration changes.
  Rebase completed; the remaining repair diff is the boundary-linter fix, its
  regression tests and this journal. No snapshot assertions or CI guards changed.
- Fresh candidate verification is in progress with snapshot updates disabled.
- Reproduced the boundary regex defect directly from integration source against
  the 28-escape regression input: the original expression exceeded a six-second
  subprocess timeout; the repaired expression completed in 2.724 ms and preserved
  the forbidden `indexedDB` access for the checker.
- `pnpm test:tooling`: 26 files / 198 tests passed, exit 0.
- Focused verbose boundary run: all 22 tests passed, with the real repository
  checked in 189 ms and the pathological regression fixture in 1 ms.
- `pnpm lint`, `pnpm gates`, `pnpm security:secrets`, explicit changed-file
  Prettier checks and `git diff --check`: exit 0. Existing warnings only.
- Baseline budget: 135 files, 12881.2 KiB / 32768.0 KiB, exit 0.
- Fresh pinned-container visual verification:
  `CI=1 bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`
  passed all 135 cases, exit 0, with no retries or rewritten baselines.
- Final integration diff contains only `scripts/boundary-lint.ts`,
  `tests/unit/boundary-lint.test.ts` and this journal. The integration commit is
  an ancestor of the repaired task branch; no workflow or visual-suite changes.
- Host Node v22.22.3 / pnpm 10.34.5. This retry reran the relevant tooling,
  visual and lint/metadata checks; the earlier full-suite results above belong
  to the pre-rebase candidate. Full central gates and independent review remain
  the operator's next step. Nothing was pushed or promoted.
