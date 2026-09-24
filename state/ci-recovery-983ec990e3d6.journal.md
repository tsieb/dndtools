# CI recovery: 983ec990e3d6

## Scope and investigation

- Task: `ci-recovery-983ec990e3d653509959c0ebda94f197033626d8`.
- Starting candidate: `983ec990e3d653509959c0ebda94f197033626d8`; clean task branch.
- No applicable `AGENTS.md` files found in the worktree or its ancestor directories.
- GitHub CI run: https://github.com/tsieb/dndtools/actions/runs/35465939818
  (the other CI run for this SHA, 35465937529, also failed visual comparisons).
- The failing job is visual regression: 18 failures on `/board` and `/scene/:id`,
  covering three themes and three viewport tiers; 117 captures passed. The other
  executed jobs in run 35465939818 passed.
- The sandbox font change is not responsible. The existing baselines predate
  `c930cd9991ff2c52dcdf53c53d6d7671be089f7b` (RC-ENG-8.2), which intentionally
  binds the home Map tile and demo scene Character tile to real vault entities.
  The old screenshots show a missing-map warning and an unbound character;
  the current app correctly shows Ruined Keep and Brother Calloway.

## Reproduction and repair

```sh
CI=1 DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh \
  -g '/board|/scene/:id' --update-snapshots=none --reporter=line
```

Exit 1, all 18 reported comparisons failed locally (68.6 seconds). Original
output retrieved from Headroom artifact `e3cf637a39944101b5beeab2b6c30450`;
full log at `/tmp/ci-983ec990-reproduce.log`.

Following `docs/development/TESTING.md` section 8, regenerated only these two
routes across tavern, parchment, high-contrast and desktop, rail, phone:

```sh
CI=1 DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh \
  -g '/board|/scene/:id' --update-snapshots=changed --reporter=line
```

Exactly 18 PNGs changed. All were opened and visually reviewed, including the
runner's map and character diff images. The populated map and character data
match the existing binding repair. Existing canvas framing and clipping remain
visible; this change does not alter layout. Generation used the repository's
pinned Playwright 1.61.1 Noble image, digest
`sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`.

Downloaded the failing runner's `visual-regression-report` to
`/tmp/ci-983ec990-artifacts`. Fifteen generated PNGs are byte-identical to its
actual captures. The other three differ only by one RGB channel level on 19
pixels (desktop scene/high-contrast), 17 pixels (rail board/parchment), and 10
pixels (rail board/high-contrast), within the unchanged 40-pixel allowance.
Exact comparisons are retained in Headroom artifacts
`14a450d7c9894e2aabf3608884bb42d4` and `9f679705f4fc4f58917de41d18be9494`.

## Validation

- `pnpm test:app apps/gm-react/src/runtime/demo-seed.test.ts`: 3 tests passed.
- `pnpm --filter @dndtools/core exec vitest run tests/command-center-default-bindings.test.ts`:
  9 tests passed.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: 135 files,
  12832.8 KiB of 32768.0 KiB; passed.
- Full comparison below: exit 0, 135 passed (2.4 minutes), no retries or
  failures reported. Full log: `/tmp/ci-983ec990-verify.log`.
- `pnpm gates`: passed (existing advisory file-size warnings); original stdout
  and stderr retrieved from artifact `273ed1b399ab40efbeeb39db9d5e0b21`.
- `git diff --check`: passed.
- Exact unit-test and budget outputs retrieved from Headroom artifacts
  `a21812fc5d4f41e69527ccd046a22e78`, `3c34919df0164569ad27391dd45a20a1`,
  and `f341a97687da4ba1a1143dcd62c7591a`.

```sh
CI=1 DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh \
  --update-snapshots=none --reporter=line
```

The candidate contains only the 18 reviewed baseline updates and this journal.
No runtime source, test assertion, configuration, workflow, or tolerance changed.
Remote reruns and central independent review remain the operator's responsibility.

## Boundaries

No pushes, promotion, dispatcher control edits, or additional agents. Preserve
all test assertions, screenshot tolerances, and workflow protections.
