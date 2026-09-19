# RC-DSN-1.3 run journal

## Scope

Motion vocabulary: named reusable keyframes (fade-in, rise, sheet-slide, shimmer, pulse), `--easing-spring`
reserved for dice/celebration, everything collapsing under `[data-motion='reduced']`. Owned:
`styles/tokens/spacing.css` (motion section), `styles/index.css`, `docs/design/README.md`,
`screens/prepaint-motion.test.ts`. No agents, dispatcher mutations, push or promotion.

## Progress

- Read the owned files, `base.css` (legacy `dnd-shimmer`), `scene-display.css`, `public/prepaint.js`,
  and the DS components that inline their own keyframes (Dialog, Sheet, Toast, Tooltip, CommandPalette,
  StatusDot, Skeleton, ProgressMeter). None of those are owned, so they are not migrated here.
- `data-motion` is only ever written to `<html>` (prepaint, Settings › Appearance / Accessibility), the
  same element as `:root`, so timing tokens composed from duration tokens resolve the collapsed values.
- `--easing-spring` has no `var()` consumer today; DiceResult.jsx only mentions it in a comment.

## Implementation

- `spacing.css` motion section: `--duration-loop-shimmer` (1400ms) and `--duration-loop-pulse`
  (1800ms); `--motion-{fade-in,rise,sheet-slide,shimmer,pulse}` as `var(--duration-*) var(--easing-*)`
  timing pairs (decelerate for entrances, standard for loops, never the spring);
  `--motion-rise-distance` (`--space-2`) and `--motion-sheet-from` (`translateY(100%)`, side sheets
  override). The reduced/none block now also zeroes both loop periods.
- `index.css`: `@keyframes motion-*` for all five plus `.motion-*` classes that apply keyframe + timing
  token. Entrances end on the resting frame (opacity 1, `transform: none`); the pulse's `0%, 100%`
  frame is the resting frame; `.motion-shimmer` paints the same sunken-surface gradient as Skeleton.
  Placed directly above the existing app-wide reduced/none clamp, which is unchanged.
- `prepaint-motion.test.ts`: kept the three prepaint checks; added 15 checks — each name has a
  keyframe, a `:root` timing token and a joining class; entrance end frames and the pulse's rest frame;
  every timing token is built from a duration the reduced block zeroes and no spring; every non-zero
  duration token is zeroed (loop periods included); the `*`/`::before`/`::after` clamp covers both
  `reduced` and `none`; `var(--easing-spring` appears only in the files RC-SES-2.4 (dice drama, which
  depends on this story) owns: `DiceResult.jsx`, `DiceTray.tsx`, `QuickPanel.tsx`.
- `docs/design/README.md`: `spacing.css` bullet mentions the `--motion-*` pairs; new "Motion"
  subsection with the vocabulary table, sheet edge override, spring reservation, the reduced-motion
  chain, and the DS components that still inline `dnd*` keyframes (follow-up for their owners).

## Validation results

- Red first: before zeroing the loop periods the extended test failed 3 of 18 (shimmer and pulse timing
  tokens, and the zero-every-duration check), which is the gap it exists to catch. Green after.
- `pnpm test:app`: 123 files, 1,302 tests passed (includes `token-references.test.ts`, so every new
  `var(--…)` resolves to a declared token).
- `pnpm typecheck`: core, cloud-fns and gm-react passed.
- `pnpm lint`: passed, 0 errors, the same 15 existing warnings, none in changed files; non-text contrast
  gate passed.
- `pnpm build`: passed; the built CSS carries all five `@keyframes motion-*`, the `--motion-*` tokens and
  both loop periods (1.4s / 1.8s, 0ms under reduced).
- Prettier clean on all changed files.
- Not run: Playwright. No component consumes the `.motion-*` classes yet, so nothing renders
  differently; the central operator's browser gate remains the evidence for that.
