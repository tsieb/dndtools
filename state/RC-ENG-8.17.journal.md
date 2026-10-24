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
