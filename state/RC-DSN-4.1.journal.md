# RC-DSN-4.1 run journal

## Scope

Golden-route visual regression suite. Owned: `apps/gm-react/tests/visual`,
`apps/gm-react/playwright.config.ts` (visual projects with fixed fonts/animations/time),
`.github/workflows/ci.yml` (path-filtered job), `docs/development/TESTING.md`. Acceptance: CI diffs
block; a documented update command. No agents, dispatcher mutations, push or promotion.

## Findings before writing code

- Three themes today (tavern, parchment, high-contrast; `public/prepaint.js` reads
  `dndtools:react:theme`). RC-DSN-1.2's Scholar/Dungeon have not landed.
- The DS gallery route (`#/__ds`, RC-DSN-2.3) does not exist; the shell's catch-all redirects to `/`.
- Tiers come from `app/useViewport.ts`: desktop ≥1025, rail 641–1024, phone ≤640.
- Fonts are self-hosted `@fontsource` woff2 (no network), Playwright is 1.61.1.
- git-lfs is not installed and the repo has no `.gitattributes`, so the "size cap" branch applies.
- Glyph rasterisation differs between Fedora (this host) and Ubuntu (CI): baselines must come from
  one pinned environment, so they are rendered in `mcr.microsoft.com/playwright:v1.61.1-noble`
  (pinned by index digest `sha256:5b8f294a…`), locally via docker/podman and in CI as a job container.
- `tests/unit/setup-e2e.test.ts` fixes the set of setup-e2e callers and forbids `playwright install`
  in workflow `run:` steps; the container job needs neither (browsers ship in the image).
- `supply-chain.yml` runs actionlint and `zizmor --pedantic`; zizmor flags tag-only images, hence
  the digest pin.

## Implementation

- `playwright.config.ts`: `DNDTOOLS_VISUAL=1` replaces the two functional projects with
  `visual-desktop` (1280×800), `visual-rail` (834×1112), `visual-phone` (Pixel 5 at 393×851, DSF 1);
  testDir `tests/visual`, `snapshotPathTemplate` without a platform suffix, animations/caret
  disabled, CSS scale, `maxDiffPixels: 40`, UTC/en-US, reduced motion, service workers blocked,
  no-hinting/no-subpixel/no-LCD/sRGB launch flags. A visual run outside the image throws unless
  `DNDTOOLS_VISUAL_HOST=1`. The web server starts `./node_modules/.bin/vite` in visual mode because
  the image has no pnpm.
- `tests/visual/golden-routes.spec.ts`: fixed clock (`setFixedTime`), seeded `Math.random`,
  onboarding bypass and theme via init script; settle = `data-theme` asserted, network idle,
  `document.fonts.ready`, two frames. Surfaces: `/`, `/board`, `/scenes`, `/characters`,
  `/knowledge`, `/campaign`, `/session`, `/player`, `/settings`, `/scene/:id`, `/atlas` + map
  editor, `/play`, `/display`, `/wiki`, DS gallery (skips itself until `#/__ds` exists).
- `tests/visual/run-in-container.sh`: the documented compare/update command.
- `tests/visual/check-baseline-budget.mjs`: 320 KiB per PNG, 32 MiB total, fails on an empty set.
- `ci.yml`: `visual` paths-filter output; `visual-regression` job in the digest-pinned image, budget
  check, then `--update-snapshots=none` (diff or missing baseline fails); a `workflow_dispatch` input
  `update-visual-baselines` rewrites changed baselines and uploads them as an artifact.
- `TESTING.md`: table row, `visual-regression` 10 min timing budget, new §7.

## Validation results

- Host dry run (`DNDTOOLS_VISUAL_HOST=1`, tavern × desktop): 14 passed, 1 skipped (DS gallery);
  captures inspected (theme applied, no onboarding overlay); host PNGs deleted, not committed.
- `tsc --strict` over the spec and config: clean. ESLint: clean. Prettier: clean.
- actionlint 1.7.12 and zizmor 1.27.0 `--pedantic` (the versions and checksums `supply-chain.yml`
  pins) on `ci.yml`: no findings. shellcheck 0.11.0 on the runner: clean after one SC2016 fix.
- `vitest run` ci-guardrails, loop-integration-gate, setup-e2e, format-changed: 21/21 passed.
- Container, first render + compare: `/board` and `/knowledge` diffed on every tier (562–11,869 px).
  Cause: the fixed clock gives every seeded note one `updatedAt`, so `updatedAt` sorts
  (`widgets/dataEnvironment.ts:229`, the Notes grid) fell back to `crypto.randomUUID` id order.
  Fix: the init script replaces `crypto.randomUUID` with a v4-shaped counter.
- Container after the fix (`run-in-container.sh`, docker, 4 workers): `--update-snapshots=all` wrote
  126 baselines (14 surfaces × 3 themes × 3 tiers; DS gallery skipped ×9); two strict compares
  (`--retries=0`) then passed 126/126 each, about 1.5 min per run.
- Budget: 126 files, 12.0 MiB of 32 MiB (desktop 5.6, rail 4.3, phone 2.4 MiB); largest
  222 KiB against the 320 KiB cap.
- Blocking proof: `command-center--tavern.png` swapped for another capture, compare run with CI=1
  exited 1 (31,449 px different, failed on the retry too); the file was restored and byte-compared.
- Captures inspected across themes and tiers (tavern/parchment/high-contrast × desktop/rail/phone).

## Not done here

- No `package.json` script: the root and app manifests are not owned, so the documented command
  is the runner script itself. `scripts/ci-local.ts` does not mirror the new job for the same reason.
- The CI job has not run on GitHub yet (no push from this task); its first run is the proof that the
  container, pnpm and the `inputs` expression behave as they did locally and under actionlint.
