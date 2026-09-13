# RC-SES-2.4 run journal

## Scope

Dice drama: nat-20 gold shimmer on `--easing-spring` (static gold border under reduced motion), nat-1
red pulse, clean chip otherwise, crit judged by the active package's rules (SYS-2.4). Owned:
`ds/components/domain/DiceResult.jsx`, `styles/tokens/spacing.css` (motion tokens),
`screens/session/DiceTray.tsx`, `app/session/QuickPanel.tsx`; companions used: `*.test.ts(x)`,
`__snapshots__`, `tests/e2e/*.spec.ts`, i18n messages. No agents, dispatcher mutations, push or
promotion.

## Findings before implementing

- `DiceResult` is also the row of the player's `/play` roll LOG (`screens/play/Dice.tsx`, not owned).
  Drama is therefore opt-in (`drama="play" | "static"`); without it the chip renders exactly as before.
- `index.css` (DSN-1.3, not owned) already clamps every animation to ~0.001ms / 1 iteration under
  `data-motion="reduced|none"`, and zeroes duration tokens. Drama keyframes are designed so their end
  frame is the resting frame, so the clamp leaves the static gold/red border.
- `prepaint-motion.test.ts` only allows `var(--easing-spring` in DiceResult.jsx, DiceTray.tsx and
  QuickPanel.tsx. Writing a spring timing token in spacing.css would break that guard, so spacing.css
  carries durations/timing pairs and the spring is composed in DiceResult.jsx.
- The dispatcher fence has no companion glob for Playwright PNG baselines
  (`*.spec.ts-snapshots/*.png`), so the visual snapshot is a vitest snapshot under `__snapshots__/`
  (as SYS-2.4's "DiceResult snapshot per model" was).
- Core `readRollUnderSystem` judges naturals on the WIDEST die in the expression. Under 5e
  (naturalHigh 20 / naturalLow 1) that reads a `2d6+3` with a 1 as a fumble and lets `1d20+1d100`
  crit off the d100. The old tray was d20-only. The app helper judges naturals on the package's core
  die (`dice.notation`) instead. `runtime/sfx-events.ts` (RC-AUD-3.2) still uses the core's widest-die
  reading, so a 5e damage roll with a 1 can still fire the fumble cue: follow-up for the owner of
  `state/dice.ts` / `sfx-events.ts`.
- Re-mounting a surface (route change, reopening the quick sheet) would replay an old nat 20. Each
  surface records the newest roll id at mount; that roll renders `static`, later rolls `play`, and the
  chip is keyed by roll id so consecutive crits each replay.

## Implementation

- `spacing.css`: `--motion-dice-pop` (`--duration-slow`), `--motion-dice-sheen`
  (`--duration-loop-shimmer` + standard), `--motion-dice-pulse` (`--duration-crawl` + standard) and
  the sweep/pulse counts (2 / 3). All durations are ones the reduced block zeroes.
- `DiceResult.jsx`: `drama` prop; gold (accent) border, headline and accent-subtle fill for a natural
  high; red border and error-subtle fill for a natural low; `data-drama` / `data-drama-mode` hooks.
  `play` adds a spring pop plus a background-image gold sweep (crit) or a red ring pulse (fumble).
- `QuickPanel.tsx`: exported `diceResultProps(pkg, roll)` (the shared, package-aware read) and a
  last-roll chip under the dice bar, so a quick-panel roll is visible on every route.
- `DiceTray.tsx`: local d20-only `critOf` replaced by `diceResultProps`; history tags read
  `Nat {value}` from the actual natural face.

## Tests added

- `ds/components/domain/dice-drama.test.tsx` (+ `__snapshots__/dice-drama.test.tsx.snap`): the visual
  snapshot — chip style, headline style, shipped keyframes and readout text for natural 20 / natural 1
  / plain, each playing and resting — rendered to static markup and parsed back so `var()`-bearing
  declarations jsdom's CSSOM would drop are kept. Reduced-motion checks: every drama timing token
  resolves to a duration the reduced block zeroes (no literal durations), every keyframe ends on the
  resting frame (the sheen's end equals its resting position), and the static chip alone keeps the
  gold/red border, tinted fill and "Natural N" text.
- `app/session/dice-drama-read.test.ts`: `diceResultProps` under 5e (nat 20/1 on the d20, advantage
  kept-die only, disadvantage-dropped 20 is no crit, `2d6+3` with a 1 is no fumble although the core
  reads one, `1d20+1d100` cannot crit off the d100), Generic (pool nat 6 crit + success count; a d20
  is not its core die), a tiered 2d6 package (tier, never crit), and a legacy termless record.
- `tests/e2e/dice-tray.spec.ts`: existing "Natural 20/1" assertions scoped to the tray chip (the
  desktop rail now shows the same roll); drama at full motion (computed gold/red border, animation
  names, spring timing, plain chip has none); quick panel plays a fresh roll and rests after a remount
  (rail collapse/restore on desktop, sheet close/reopen on mobile); reduced motion via Settings ›
  Accessibility › Reduce motion (no running animations, gold/red border, transform none, sheen parked
  at `250% 0%`, no ring).

## Validation results

- Red first (vitest): the spring-reservation guard flagged my own spacing.css comment quoting
  `var(--easing-` + `spring`; reworded. A seed search for a disadvantage-dropped 20 looked in `dice`
  (kept faces only); fixed to read `terms[].dice`.
- Red first (e2e, 12 passed / 4 failed across both projects): (1) the tray chip read `static` —
  the tests rolled before the lazy /session route had mounted the tray; they now wait for it.
  (2) `test.use({ reducedMotion: 'reduce' })` did not reach `prepaint.js` here (`data-motion` stayed
  `full`); the test now drives the app's own Reduce motion switch instead.
- `vitest --config vitest.app.config.ts`: 125 files, 1,324 tests passed (the `-u` re-record ran the
  whole app suite; only `dice-drama.test.tsx.snap` changed).
- `pnpm typecheck` (core, cloud-fns, gm-react): passed; gm-react re-run after the spec edits: passed.
- `pnpm lint`: exit 0 — 0 errors, the same 15 existing warnings; raw-style count, boundary lint and
  the non-text contrast gate passed.
- Prettier: all changed files formatted.
- Playwright second run (dice-tray, session-quick-timer, session-posture, combat, sfx-events,
  inline-roll, session-tables; desktop + mobile): 117 passed, 1 skipped, 4 failed. Every other
  live-session spec passed on both projects, so the rail's new last-roll chip broke none of them.
  The 4 failures were my two drama tests on both projects, both assertion defects:
  `animationTimingFunction` is a list of `cubic-bezier(…)` values that themselves contain commas (a
  `split(', ')` cut the spring in half), and Chromium reports the pop's held `transform: none` end
  frame as the identity matrix.
- Playwright third run (dice-tray only, both projects): 14 passed, 2 failed — the parked sheen
  serialises as `250% 0px`, not `250% 0%` (same position). Assertion now accepts either.
- `pnpm build`: exit 0; `check-prod-bundle: OK` (no `__rt` or gallery in 85 JS assets). The chunk-size
  notice is Vite's usual advisory.
- Tooling note: Playwright deletes `apps/gm-react/test-results/` at startup, so a shell left inside it
  loses its cwd and the next node command dies with `uv_cwd` — not a code failure.
- Fourth run: the nat-1 resting ring serialised as `oklab(0 0 0 / 0) 0px 0px 0px 0px` (the pulse
  interpolates through `color-mix`); the assertion now checks the zero geometry, not the colour syntax.
- Final dice-tray run (desktop + mobile Chromium, isolated port 5641): 16 passed, 0 failed.
- Final `pnpm --filter @dndtools/gm-react typecheck`: exit 0. ESLint on the changed TS/TSX files:
  exit 0 (the DS `.jsx` is outside that config; the full `pnpm lint` above passed).
- Not run by me: the complete Playwright suite (the seven live-session specs above cover every spec
  that drives the quick panel or dice), Android/Electron, and a pixel screenshot baseline — PNG
  baselines are outside the fence's companion paths, so the visual snapshot is the vitest one. The
  central operator's gates are the evidence for the rest.

## Follow-ups (not owned here)

- `runtime/sfx-events.ts` / core `readRollUnderSystem` still judge naturals on the widest die, so a 5e
  damage roll with a 1 can fire the fumble cue the tray no longer shows.
- `screens/play/Dice.tsx` keeps its own d20-only `critOf` and renders its log without `drama`.
- The quick panel's chip has no live-region announcement (the /session tray has one; announcing from
  both would double-speak on desktop /session).
