# RC-ENG-8.17 run journal

## Starting point

- The root half of the fix landed in `f1b81db8a` (RC-ENG-8.3's C2-1 fix): `LevelUp.tsx`'s root is
  `width: 100%; minWidth: 0` and `character-levelup.spec.ts` taps Next, Finish and Discard where
  they rest at 834×1112 and 390×844 with `hasTouch`, finishing a level-up to level 2.
- Still open from the story text: "let the header's action wrap". `LevelBadgeRow` in
  `LevelUpParts.tsx` was a non-wrapping flex row, so Discard level-up squeezed the title in a
  narrow column instead of moving under it.

## Implementation

- `LevelUpParts.tsx` `LevelBadgeRow`: `flexWrap: 'wrap'`, title block `flex: 1 1 10rem`, action in
  a `marginLeft: auto` wrapper so a wrapped action sits at the right. It is shared with the entry
  card (`LevelUpEntry`), where wrapping is just as correct.
- `character-levelup.spec.ts` `tapWhereItRests`: also asserts the whole control lies inside the
  viewport's width (`left >= 0 && right <= innerWidth`), not only its centre.

## Verification (local, 2026-10-24)

- `character-levelup.spec.ts`, both projects: 8 passed.
- Regression check: the root reverted to `{ maxWidth: 680, margin: '0 auto' }` → both touch tests
  fail on mobile-chromium ("Discard level-up's centre is inside the viewport"); restored.
- `character-resources`, `player-polish`, `character-history`, `responsive` specs: 186 passed.
- prettier, eslint on the changed files, `tsc --noEmit` (gm-react): clean.

## Visual gate on f69130961 (2026-10-24)

- The pinned-container visual gate failed 2 of 588, both timeouts on routes this change does not
  render: `session-polish.spec.ts:32` tavern on visual-desktop (`toHaveScreenshot` waited 5s for
  the combat-idle illustration to be stable) and `palette-help.spec.ts:8` high-contrast on
  visual-rail (Help dialog's `Version` line not found in 5s). No visual spec opens the level-up
  wizard (`grep -rl "Level up|level-up|levelUp|LevelBadge" tests/visual` is empty), and the diff
  is `LevelUpParts.tsx`, the level-up e2e spec and this journal.
- Re-run of both specs in the pinned container, `--repeat-each=3`, every tier: 108 passed.
- Full visual suite in the pinned container on f69130961: 587 passed, 1 failed —
  `session-polish.spec.ts:32` again, this time dungeon on visual-rail, and again a 5s wait
  (`toBeVisible` on the combat-idle illustration: element not found). A different theme and tier
  than the gate's failure, and a run that overlapped two other branches' visual runs (12:20, 12:39).
- Interleaved A/B on that test (`-g "combat empty state" --repeat-each=4`, every tier; base =
  `LevelUpParts.tsx` from HEAD~1, the only app file in the diff): cand 60/60, base 60/60,
  cand 60/60, base 60/60. The failure does not reproduce on its own, on either side, and the
  level-up header is not on `/session`'s render path for that capture. Reading: load stall on a
  busy host, not a regression; no baseline touched.
- Full visual suite in the pinned container on 6ead48374 (same app code as f69130961), the
  gate's exact argv (`--update-snapshots=none --workers=2`): 588 passed (16.9m), exit 0.
