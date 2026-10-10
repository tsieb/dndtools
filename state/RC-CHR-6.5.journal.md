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
