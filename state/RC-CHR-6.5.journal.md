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
