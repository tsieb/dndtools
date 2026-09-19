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

## Review recovery (2026-09-16) — the missing DS gallery baselines

- Independent review ran the candidate unchanged in the pinned image with `CI=1`,
  `--update-snapshots=none` and retries off: 126 passed, 9 failed, every failure "A snapshot doesn't
  exist … ds-gallery--<theme>.png". Reproduced here before changing anything.
- Cause: the first pass was written against a base without RC-DSN-2.3, so the DS gallery test
  skipped itself nine times and committed no baselines. The candidate's base (`ba6b3d91`) _has_
  `#/__ds` (`App.tsx:572`, DEV-only), so the guard stopped firing and the suite compared against
  files that were never written. The skip was silent either way — the suite reported green while a
  surface it claims to cover had no baseline.
- Fix: rendered the nine missing baselines in the pinned image
  (`run-in-container.sh --update-snapshots=missing -g "DS gallery"`), and replaced the skip with
  `expect(page.url()).toContain('#/__ds')`, so losing the route fails the test instead of silently
  re-capturing Command Center under the gallery's name. All nine captures were opened: the gallery
  header, the live "Vault runtime ready" StatusDot (it waits for `__rt.loaded`, so the label is
  fixed), the theme select showing the applied theme, and the Button specimen.
- Full compare, pinned image, `CI=1`, `--update-snapshots=none --retries=0`: **135 passed, exit 0**
  (`/tmp/rc-dsn41-full-compare.log`) — the reviewer's exact configuration, now green.
- Determinism: DS gallery re-run with `--repeat-each=2`, 18 passed, exit 0
  (`/tmp/rc-dsn41-ds-repeat.log`).
- Blocking proof on the new surface: `visual-desktop/ds-gallery--tavern.png` replaced with the
  parchment capture → exit 1, 1,003,729 pixels different (`/tmp/rc-dsn41-block-proof.log`); the
  baseline was restored and its sha256 matched the original byte for byte.
- Budget after the addition: 135 files, 12,805.6 KiB of 32,768.0 KiB, exit 0. Largest file is still
  222 KiB against the 320 KiB cap; the budget script's "~15 surfaces is ~135 PNGs" comment is now
  literal.
- `TESTING.md` §7 drops the "once RC-DSN-2.3 builds `#/__ds`" wording, states the DS gallery is
  covered, and says a surface with no committed baseline fails CI.
- Gates re-run on the change: app `tsc --noEmit` clean, ESLint on the spec clean, Prettier clean on
  both edited files, `pnpm test:tooling` 24 files / 162 tests passed. GitHub CI still has not run
  this job (no push from this task).
- Only the four owned paths (three of them touched) plus this journal changed; `test-results/` was
  deleted after each run. No agents, dispatcher edits, push or promotion.

## Rebase onto the integration branch (2026-09-16, `584a5469`)

- The conflict was structural, not semantic: the integration branch appended `## 7. Docs check` to
  the end of `TESTING.md` and this task appended `## 7. Visual regression (golden routes)` to the
  same place. Both sections are kept; the visual one is now **§8**, and the four pointers at it
  (`ci.yml`, `playwright.config.ts`, `golden-routes.spec.ts`, `run-in-container.sh`, plus the §1
  table row) were renumbered with it. The `§6` pointers (the "execution context destroyed" section)
  are unchanged. `pnpm gates` docs check passed on the restructured file: 254 files reachable,
  279 links resolved.
- The new base moves real pixels. Compare on the rebased tree (pinned image, `CI=1`,
  `--update-snapshots=none --retries=0`): 108 passed, **27 failed** — `/board`, `/scene/:id` and
  `/settings` on all three themes × all three tiers (`/tmp/rc-dsn41-rebase-compare.log`).
- Diagnosed before re-baselining, from the diff images rather than the count: the integration branch
  turned the always-on "DM only" widget badges into an opt-in Settings toggle ("Mark DM-only items",
  `screens/settings/Appearance.tsx`), default off. The red pixels in the diffs are badges present in
  the _old_ baselines and gone from the new render, plus the taller Appearance panel that the new
  toggle adds. Every failing surface is one that shows widget headers or that panel; `/knowledge`
  did not diff even though `Graph.tsx` changed, because the graph sits behind a tab.
- Re-baselined with `--update-snapshots=changed`: exactly those 27 PNGs were rewritten, no others.
  Opened `board--tavern` (desktop), `settings--tavern` (phone, the new toggle is visible and off)
  and `scene-editor--high-contrast` (rail) to confirm the captures are the new UI, not a broken or
  half-loaded page.
- Verification on the rebased tree: full compare 135 passed, exit 0
  (`/tmp/rc-dsn41-rebase-verify.log`); budget 135 files, 12,799.5 KiB of 32,768.0 KiB, exit 0;
  blocking re-proved by swapping `visual-desktop/board--tavern.png` for the high-contrast capture →
  exit 1, 14,123 pixels different, baseline restored and sha256-verified.
- Gates after the rebase: `pnpm gates` exit 0, app `tsc --noEmit` clean, ESLint clean on the spec and
  config, Prettier clean on every edited text file, `pnpm test:tooling` 26 files / 191 tests passed.
- The branch diff against `584a5469` is the four owned paths plus this journal. No app or CI
  behaviour from the integration branch was altered, and nothing was pushed or promoted.
