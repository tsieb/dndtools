# RC-CHR-6.5 — run journal

Story: preview is trustworthy, so `/play` follows the previewed actor. Commits on this branch:

- `b2251183` feat(play): the companion's viewer is the previewed actor (core `companionViewerFor`);
  top-bar "Preview as" a player or observer opens `/play` with an exit banner (button, Escape,
  Android Back) that returns to the route the preview began on; the `/` participant hero is
  retired for a pointer to the player view; the View as menu portals to `<body>` outside dialogs
  so page content no longer covers its lower rows.
- `f099cb0e` test(visual): re-baselined the 15 `play-stage` goldens to include the banner.

## Gate history

### Attempt 1 — visual regression red (head `b2251183`)

`tests/visual/play-polish.spec.ts` failed 15/15 (5 themes × 3 tiers), with 516 passing. That spec
captures `.player-view-shell` after `enterPreview({ role: 'player' })`, so the new banner made the
desktop capture 17px taller. This is the story's own intended change. I re-baselined it in the pinned
container and checked the desktop and phone images (the banner is the only difference). Then I
recompressed the IDAT data losslessly (pixels unchanged), and a strict container compare passed
15/15. Budget: 34,670.1 of 34,816.0 KiB.

### Attempt 2 — visual regression red (head `f099cb0e`)

1 failed, 530 passed. The only failure was `[visual-phone] golden routes — parchment › /settings`,
7,065 px (0.03) different. The gate's `-actual.png` shows `/settings` still on the lazy-route
fallback ("Loading your vault…") instead of the Appearance panel. A cold dev-server chunk did not
load in time. Nothing in this story renders on `/settings`: on a phone the View as control lives in
the Table controls sheet, which is closed there. `play-polish` passed 15/15 in the same run.

Re-runs in the pinned container against `f099cb0e`, with no change made:

| Command                                                                                                                                                            | Result   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `run-in-container.sh tests/visual/golden-routes.spec.ts --project=visual-phone -g "/settings" --repeat-each=3 --update-snapshots=none`                             | 9 passed |
| `run-in-container.sh tests/visual/golden-routes.spec.ts --project=visual-phone -g "golden routes — parchment .*/settings" --repeat-each=5 --update-snapshots=none` | 5 passed |

Verdict: a load-dependent flake on an untouched route, which the base has too. Not re-baselined.
The committed golden is correct.

## Self-heal round 1 — companion route readiness

The reported gate at `769da30e` passed 530 tests and failed phone dungeon because
`.player-view-shell` never appeared within the screenshot assertion's 5-second
budget. Its saved error context contains only `Loading your vault…`; this was
not a pixel mismatch. Source evidence: dispatcher attempt
`62fe33c0-7c9e-485a-b650-fe524095ecb2/output.log` and the task checkout's
`apps/gm-react/test-results/play-polish-play-stage-dungeon-visual-phone/error-context.md`.

Before editing, ran the failing check on pre-feature base `8ba82424` in an
isolated detached worktree with frozen offline dependencies:

`apps/gm-react/tests/visual/run-in-container.sh tests/visual/play-polish.spec.ts --project=visual-phone -g 'play stage dungeon' --repeat-each=3 --update-snapshots=none`

Result: **3 passed** (25.6s), exact output in
`/var/tmp/rc-chr-6.5-base-visual.log`. The failure did not reproduce on base;
therefore this round does **not** claim it is inherited.

The visual spec now waits explicitly for the lazy companion frame (20 seconds,
consistent with functional route readiness) before awaiting its fonts and
starting the unchanged screenshot comparison. Runtime hydration alone does not
prove the lazy route mounted. No baseline or pixel tolerance changed.

Acceptance rerun:
`pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/companion-preview.spec.ts tests/e2e/collab.spec.ts -g 'companion preview|collab: actor-filtered' --workers=2`

**10 passed** (21.6s), including both profiles, Calloway's PC and specific scene,
ARIA navigation inspection, observer preview, banner and Escape exits, and the
unchanged collab preview tests. Output: `/var/tmp/rc-chr-6.5-e2e.log`.

Pinned visual comparison across all five themes and three tiers, repeated three
times with `--update-snapshots=none`: **45 passed** (2.1m). Output:
`/var/tmp/rc-chr-6.5-visual.log`.

`pnpm gates`, Prettier checks for both changed files, and `git diff --check`
passed. The full 531-test visual suite remains for the central operator; this
round ran the affected visual spec across all themes and tiers. No push,
promotion, or dispatcher control-state changes were made.

## Browser acceptance repair — explicit Co-DM preview

The central gate at rebased head `0d15af0f` passed quality, formatting, pinned
visuals, typecheck, lint, core/app tests, build, bundle budget and requirements
audit. Browser acceptance reported 1,936 passed, 38 skipped and two failures:
the compact Co-DM responsive test on both profiles. Exact failure evidence is
in dispatcher attempt `fa1636da-b24a-417d-9d39-8db53bfc8ce7/output.log`.

Reproduced both failures locally before editing with
`pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts -g 'a Co-DM can reach every elevated' --workers=2`.
Output: `/var/tmp/rc-chr-6.5-codm-before.log`.

The fixture promoted `actor-player` to Co-DM but entered a generic **player**
preview, then expected Maps to be enabled. Before this story, `/play` ignored
player previews and used the local seat, accidentally satisfying that assertion.
The actor-following implementation correctly refuses to substitute an elevated
seat for a player preview. This is a test contract mismatch exposed by this
story, not an inherited failure or a reason to restore elevated access.

The responsive test now asserts that Maps is disabled in the player preview,
then explicitly previews the promoted Co-DM and exercises all three elevated
tools with the existing viewport and overflow checks. Added a core regression
covering the same promoted-seat boundary and specific Co-DM resolution. No
production code, visual baselines, or collab preview tests changed.

Validation completed:

- Targeted browser run: **12 passed** (20.1s), both profiles. Command:
  `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts tests/e2e/companion-preview.spec.ts tests/e2e/collab.spec.ts -g 'a Co-DM can reach every elevated|companion preview|collab: actor-filtered' --workers=2`.
  Exact output: `/var/tmp/rc-chr-6.5-codm-after.log`.
- Core preview file: **15 passed**, via
  `pnpm --filter @dndtools/core exec vitest run tests/ux-perm-preview-mode.test.ts`.
  Exact output: `/var/tmp/rc-chr-6.5-codm-core.log`.
- `pnpm gates`, ESLint on both changed test files, Prettier and
  `git diff --check` passed. Gate and lint logs:
  `/var/tmp/rc-chr-6.5-codm-gates.log`, `/var/tmp/rc-chr-6.5-codm-lint.log`.

The full browser suite remains for central validation; this repair changes tests
only. No push, promotion, or dispatcher control-state edits.

## Visual gate repair — bounded waits on shared runners

The gate at `34b16135` passed 529 visual cases, including all companion captures,
and timed out in two unrelated captures: desktop Scholar audio deletion and
High Contrast Plans account checking. Exact evidence:
`b0fdf998-7307-4e6b-a4ab-a9b080579afb/output.log` under dispatcher attempts.
The Plans error context shows the shell with `Loading your vault…` in main;
its route-specific assertion expired at 5 seconds. Audio had already opened
its deletion dialog; Chromium's screenshot operation expired at 5 seconds
without returning a pixel difference. No screenshot baseline was shown wrong.

Before editing, ran both cases three times on pre-feature base `1028592b` in
`/var/tmp/rc-chr-6.5-base`:
`apps/gm-react/tests/visual/run-in-container.sh tests/visual/golden-routes.spec.ts tests/visual/plans-legal.spec.ts --project=visual-desktop -g 'Audio polish — scholar.*named deletion|plans account check — high-contrast' --repeat-each=3 --update-snapshots=none`.
**6 passed** (22.3s), output `/var/tmp/rc-chr-6.5-timing-base.log`. Ordinary
reruns did not reproduce either intermittent failure.

A controlled pre-feature-base probe copied the Plans spec to a temporary spec
and delayed only the `/src/screens/Upgrade.tsx` request by 12 seconds using a
Playwright route handler. It reproduced the identical missing account-status
failure under the original 5-second assertion budget (one failure, 9.3s).
Output: `/var/tmp/rc-chr-6.5-timing-probe-before.log`. This demonstrates that
the lazy-route timing weakness exists before the preview feature; it does not
prove the same amount of delay occurred during the gate or reproduce the audio
capture slowdown.

Set visual-project assertions to 20 seconds, matching the existing bounded
route boot waits. This covers both lazy route readiness and screenshot capture
under shared-runner contention without adding sleeps or retries to the suite.
Pixel tolerance, baselines, functional assertion timing and overall test timeout
are unchanged. Documented the visual-only policy in `docs/development/TESTING.md`.

The identical delayed-route probe with only the assertion budget changed
**passed** against the original baseline (16.9s test, 19.7s run). Output:
`/var/tmp/rc-chr-6.5-timing-probe-after.log`. Probe source retained at
`/var/tmp/rc-chr-6.5-timing-probe.spec.ts`; the isolated base worktree was restored
after the experiment. No deliberate delay was added to committed tests.

**45 strict pinned comparisons passed** (1.6m), spanning audio deletion, Plans
and companion stage across all themes and layout tiers. Command:
`apps/gm-react/tests/visual/run-in-container.sh tests/visual/golden-routes.spec.ts tests/visual/plans-legal.spec.ts tests/visual/play-polish.spec.ts -g 'named deletion|plans account check|play stage' --update-snapshots=none`.
Output: `/var/tmp/rc-chr-6.5-timing-visual.log`.

`pnpm gates`, ESLint on the Playwright config, formatting and `git diff --check`
passed. Gate output: `/var/tmp/rc-chr-6.5-timing-gates.log`. The full visual and
browser suites remain with central validation. No push, promotion or dispatcher
control-state changes.

## Claim correction — restore shared visual configuration

Operator scope feedback rejected `acad8925` because
`apps/gm-react/playwright.config.ts` and `docs/development/TESTING.md` are outside
this task's claim. Neither change is required for the actor-preview acceptance
criteria. Restored both files exactly to base
`1028592b7672aa044c045551176e81e41c8392ca`; the shared visual assertion budget
is therefore back to its base behavior. No claim expansion requested.

The preceding 45-comparison result records the now-reverted configuration and
must not be treated as validation of this restored configuration. The controlled
Plans timing evidence remains historical evidence for a separately scoped
infrastructure repair; the unrelated intermittent visual timeouts remain
unresolved here. Preview implementation and its targeted regression tests are
unchanged. Central validation and independent review remain pending.

Verified both restored paths have no diff against the specified base; journal
formatting and `git diff --check` passed. No push, promotion, dispatcher state
edit, or unrelated working-tree change.
