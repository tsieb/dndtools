# RC-DSN-1.4 run journal

## Scope

Density audit. Owns `styles/tokens/spacing.css` (density sets), `app/screen-kit.tsx`,
`tests/e2e/responsive.spec.ts`. Nav item 48/36/28, cards 16/12, list gaps; touch lock to
comfortable verified on Android. Acceptance: `responsive.spec` target-size checks. No agents,
dispatcher mutations, push or promotion.

## Attempt 1 (2026-09-12)

Base `d16482c5`. It contains the per-worktree e2e port fix `5d7bf943`.

### What the audit found

- **The nav item token never existed.** DS `NavItem` sizes itself with
  `min-height: var(--density-nav-item-height, 40px)`, but no density set defines
  `--density-nav-item-height`. Every nav item sat on the 40px fallback at all three densities. The
  48/36/28 values were already in the sets, but as `--density-nav-height`, which nothing reads
  except the Android block in `styles/index.css`.
- **Cards ignored density.** DS `Card` pads with `--component-card-padding`, a fixed `--space-4`.
  `--density-card-padding` (16/16/12) had no consumer. screen-kit `Panel`, the app's card (about
  190 call sites), defaulted to a raw 18px.
- **List gaps had no consumer.** `--density-list-gap` (8/4/2) and `--component-list-gap` were both
  defined and read nowhere.
- **The comment's touch lock claim was only half true.** `public/prepaint.js` does lock every
  viewport under 1200px to `comfortable` at boot. At 1200px and wider it honours the stored choice,
  and that includes Android landscape tablets. `html[data-android]` raises only the 48dp control
  sizes (touch target, nav, input, button). Card padding, list gap, icon size and type stayed
  compact on an Android device that had stored `compact`.

### Plan

- `spacing.css`: add `--density-nav-item-height` to each set (36/48/28). Point
  `--component-card-padding` and `--component-list-gap` at the density set. Add an
  `html[data-android]` block that pins the rest of the comfortable set. Correct the lock comment.
- `screen-kit.tsx`: a `T.density` group over the density tokens, and `Panel` padding defaults to
  the density card padding.
- `responsive.spec.ts`: target-size checks for each density on the rail (where the DS `NavItem`
  renders), the boot lock by viewport, and the Android lock with `compact` stored.

### Outside the owned paths (not changed)

- The desktop sidebar rows (`app/shell/rows.tsx` `SideRow`) are hand-rolled buttons with fixed
  `8px 10px` padding and do not read the nav item token. They measure about 36px, which matches
  standard. Making them follow density means editing `rows.tsx`, which this story does not own.
- `docs/design-package/tokens/spacing.css` is the package copy. It now lags the app copy by the
  nav item token and the Android lock (sources A → R; re-syncing the package is separate work).

### Changes

- `spacing.css`: `--density-nav-item-height` 36/48/28 in the standard, comfortable and compact
  sets. `--component-card-padding` and `--component-list-gap` now read the density set, so DS
  `Card` pads 16/16/12. New `html[data-android]` block pins nav item 48, card padding 16, list gap
  8, icon 24 and base type. The density comment now describes the prepaint lock accurately.
- `screen-kit.tsx`: a `T.density` group (touch, focus, nav, navItem, cardPad, listGap, icon, input,
  button, font). `Panel` padding defaults to `T.density.cardPad`, so 18px → 16px (12px compact).
  `pad` accepts a string so callers can pass tokens. Callers that pass a number are unchanged.
- `responsive.spec.ts`: three target-size tests.
  - Each density chosen through Settings › Appearance on the 800px rail: rail NavItem min-height
    48/36/28 and rendered height at least that, the 24px floor on every nav item and density
    option, Appearance Panel padding 16/16/12, list gap 8/4/2.
  - Boot lock: `compact` stored boots compact at 1440px (nav 28, card 12, gap 2) and comfortable
    at 800px after a reload, with rail items at least 48px tall and 44px wide.
  - Android lock: Android runtime with `compact` stored at 1280px boots `data-density="compact"`,
    yet the tokens resolve to nav 48, card 16, gap 8, icon 24. The Appearance Panel pads 16px, and
    every Primary nav button, density option and Settings category is 48dp or larger.

### Gates run here

- The Android test first failed on `icon: 32` instead of 24. That was the probe, not the lock: the
  probe carried the card padding, and under `box-sizing: border-box` 16px + 16px of padding clamped
  a 24px width up to 32. The icon size is now read from `column-gap`. The lock was right as written.
- Full `responsive.spec.ts`, both projects, on the worktree-derived port: **86 passed, 0 failed**
  (`/tmp/rc-dsn-14-responsive-full.log`).
- `pnpm lint`: 0 errors, the 15 existing warnings. Raw-style count is unchanged at 2583 across 260
  files, and the `screen-kit.tsx` allowance of 20 is still exact, so no ratchet edit was needed.
  Boundary and non-text contrast gates are green.
- `pnpm --filter @dndtools/gm-react typecheck` passed.
- Unit tests `screen-kit-seg`, `screen-kit-radiogroup`, `screen-kit-loading-region` and
  `prepaint-motion` through `vitest.app.config.ts`: 21 passed.
- No other e2e spec asserts the old 18px Panel padding, the 40px nav fallback or `data-density`.
- The full Playwright suite was not run here. `Panel` padding changes on every route, so the
  central operator's full run is the check for layouts outside `responsive.spec`.
