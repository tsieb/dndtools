# CI recovery for 4efd8df9adac

## Failure and reproduction

- Task: `ci-recovery-4efd8df9adac9af0664a8e33598816a84eef6ad8`.
- Candidate/base: `4efd8df9adac9af0664a8e33598816a84eef6ad8`; clean task branch at start.
- Read failed logs from https://github.com/tsieb/dndtools/actions/runs/38739194907
  before editing. The visual-regression job fails at the baseline size budget,
  before Playwright: 894 files, 37946.0 KiB against 37888.0 KiB. The ci-gate
  failure is consequential; the other required legs succeeded.
- Local reproduction: `node apps/gm-react/tests/visual/check-baseline-budget.mjs`
  exits 1 with the same counts and sizes.

## Repair

Losslessly recompress only the 15 owned Help PNG baselines using Zopfli PNG
optimization. Verify decoded dimensions and every RGBA byte against the original.
Keep all baselines, screenshot assertions, and budget thresholds unchanged.
No application pixels change. Temporary Python tooling lives outside the repository.

## Validation

- Both CI attempts fail at the same budget check (attempt 1 at 13:02:19 UTC,
  attempt 2 at 13:17:25 UTC on 2026-10-15).
- Zopfli compression saved 317,471 bytes across the 15 Help screenshots.
- A separate verification loaded each original with `git show HEAD:<path>` and
  each replacement with Pillow, converted both to RGBA, and asserted identical
  dimensions and byte buffers: all 15 pass.
- Unchanged budget gate exits 0: 894 files, 37635.9 KiB of 37888.0 KiB.
- Prettier on this journal and `git diff --check` pass.
- Full pinned-container comparison exits 0: **588 passed (15.7m)**, no retries
  or failures reported:
  `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --reporter=line`.
  Original output retained at `/var/tmp/ci-4efd-visual.log`.

Compression is reproducible with Python `zopfli.png.optimize(original_bytes)` (zopfli 0.4.3)
(default options, including both lossy options disabled). Pillow 12.3.0 was used only
for the independent decoded-pixel checks, not for encoding. Tools installed in
`/var/tmp/ci-4efd-png-env`; no dependency changes in the repository.
No push, promotion, dispatcher changes, or additional agents.

The validated candidate is the task base plus these 15 losslessly compressed
PNGs; only this journal changed after validation. Remote CI, integration, and
independent review remain the central operator's responsibility.
