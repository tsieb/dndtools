# RC-ENG-8.18 run journal

## Scope

Verify that the top bar's Any player preview shows the scene named by the session header on a live
seeded vault and a fresh vault with a shared screen, on desktop and mobile. Preserve unrelated
changes; no agents, dispatcher control changes, push, or promotion.

## Attempt 1 (2026-10-24, base `6f26ae12b`)

Inspection found the implementation already committed in `0033dd551` by RC-ENG-8.3:

- `apps/gm-react/src/screens/play/Frame.tsx`: `genericPreviewState` projects
  `permissionsWithPreviewActors` and the shareable table view into the generic actor's local read.
  It leaves stored permissions/session state intact and does not alter joined-player reads.
- `apps/gm-react/tests/e2e/companion-preview.spec.ts`: “Any player sees the scene the session shows
  the table” starts a seeded session, checks the header's scene, enters Any player through the top
  bar, checks the reserved generic actor and matching stage, then exits preview.
- `apps/gm-react/tests/e2e/screen-visibility.spec.ts`: “the Start dialog says why a GM-only screen
  cannot be shown and shares it” creates a screen in a fresh vault without a party, shares it,
  starts the session, checks the header and table target, and checks the Any player stage.

The acceptance tests already exist outside the originally proposed `player-preview.spec.ts` path.
No production changes or duplicate tests are needed. Both suites passed on both profiles.

## Validation

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/companion-preview.spec.ts tests/e2e/screen-visibility.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2`
  completed with exit code 0: **22 passed (38.0s)**. This includes both acceptance scenarios on each
  profile, specific-player isolation, preview exit, observer preview, and joined-player visibility.
- No production or visual changes were made in this task, so no new visual baselines are required.
- Central gates and independent review remain the operator's work.
