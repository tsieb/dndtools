# RC-UX-2.4 run journal

## Scope

200% browser zoom and an OS large-text preference on every navigation tier, without loss of
content or functionality; a `responsive.spec` case at 200%. Owned paths:
`apps/gm-react/src/styles`, `apps/gm-react/tests/e2e/responsive.spec.ts`. No agents, no dispatcher
mutations, no push, no promotion.

## Why this revision exists

The first attempt (`311032f4`) built the sweep and then excused two routes from its
covered-control check with a `LARGE_TEXT_COVER_EXCEPTIONS` list, on the grounds that the defects
live in screens this story does not own. Independent review rejected that: the exceptions
suppressed a real loss of access, and a direct actionability probe confirmed the **enabled**
`/player` Resources tab could not receive a normal click at 360x640 with a 32px default font size.
Review also saw `/board` hit-test failures but did not count them, because the `Open in editor`
chip it landed on is disabled in the seeded state.

This revision deletes the exception list and fixes both screens from the owned stylesheet.

## Diagnosis (measured, not inferred)

A throwaway probe spec (deleted before commit) walked every control at 360x640 / 1280x800 with
`Page.setFontSizes({standard: 32})`, scrolled each one into view, hit-tested its centre and dumped
the box geometry of the target and of whatever answered `elementFromPoint`.

- **`/player`, phone.** `<main>` is 345px tall at that text size; the screen's vitals bar
  (`screens/player/index.tsx`, inline `position: sticky; top: 0`) wraps into a **620px** block. It
  stops being a header and becomes a lid: ten controls were covered, including the tab bar.
  No `scroll-padding-top` fixes this — the reserved strip would be larger than the scrollport.
- **`/board`, every tier.** The screen root is `height: 100%` inline and its canvas is
  `flex: 1; min-height: 0`. At 32px the toolbars alone need more than the pane, so the canvas
  collapsed to **2px**, the toolbars overflowed past the bottom of a root whose height stayed 100%,
  and the widget controls landed at y≈711 in a pane whose scroll range ended at 454 — outside
  anything `<main>` could scroll to.
- **`/board` tiles.** Separately, a tile's extent is authored in board units and painted through
  one `scale()`, so the box cannot grow when its rem text does. At 1280x800 the two header rows
  filled a 240x160 tile and the operate row was clipped by the tile's own `overflow: hidden`; on a
  phone (scale ~0.5) a single chip is taller than the whole tile.

## Changes

`apps/gm-react/src/styles/index.css` only — three repairs, all keyed to text scale:

1. `#main-content > *:has([data-testid='scene-board-bounded'])` takes `height: auto` with a
   `max(360px, 100%)` floor, and the canvas keeps a `10rem` floor of its own. Unconditional: while
   the chrome fits, flex still hands the canvas the free space the floor creates, so nothing moves
   at the default text size; when it does not fit, the root grows past the pane and `<main>`'s own
   `overflow-y: auto` reaches it.
2. `@media (max-width: 18em)` releases inline `position: sticky` inside the pane.
3. `@media (max-width: 18em), (min-width: 700px) and (max-width: 42em)` reflows the bounded board:
   the transform layer releases, each tile takes the canvas width and a `16rem` floor, and
   `--scene-board-scale` resets to 1 so the operate chips stop dividing their touch target by a
   scale that is no longer applied.

`em` in a media query resolves against the browser's **default** font size, never the app's root
size, so both queries are text-scale tests rather than width tests. Neither can match at the
default size: 18em is 288px (under the narrowest supported 320px phone) and 42em is 672px, which
can never also satisfy `min-width: 700px`. At a 32px default they cover 360px (11.25em), 768px
(24em) and 1280px (40em) — every tier the story names.

`apps/gm-react/tests/e2e/responsive.spec.ts`:

- `LARGE_TEXT_COVER_EXCEPTIONS` and the `coverExceptions` parameter are gone; all three large-text
  tiers now run the full check on all 19 routes.
- New case `200% large text leaves phone controls pressable, not just present`: a real
  `locator.click()` (Playwright actionability: visible, stable, receives pointer events) on
  `/player`'s Resources tab, asserting its panel appears, and on `/board`'s enabled `Change map`
  select. This is the reviewer's own probe, committed.

## Validation results

- New pressable case fails on the pre-fix stylesheet — `git show HEAD:…/index.css` restored, run,
  restored back: `TimeoutError: locator.click: Timeout 10000ms exceeded` on the Resources tab.
  Passes on the fixed stylesheet on both browser projects.
- `responsive.spec.ts`, both projects, exception list removed: **90 passed**.
- `pnpm typecheck` (core, cloud-fns, gm-react): passed.
- `pnpm lint`: 0 errors, 15 pre-existing warnings; boundary lint and the non-text contrast gate
  passed.
- `pnpm build`: passed, prod-bundle check OK.
- `pnpm format:check`: neither owned file is flagged (the four warnings are pre-existing files).
- `pnpm test:app`: 124 files / 1305 tests passed.
- Full Playwright suite (both projects): see below.

## Notes for review

- The fixes live in the stylesheet, not in `screens/player/index.tsx` / `screens/Board.tsx`,
  because the story owns `src/styles` — and because the viewport lock they run into (`#root` at
  window height, `.app-shell` clipping, one `<main>` scrollport) is the stylesheet's own contract.
- The sticky rule hooks the serialized `position: sticky` declaration because the screens set it in
  a React `style` prop, which no class selector can outrank. Both spellings are matched; only the
  browser's own serialization inserts the space.
- `knowledge-filters.spec.ts:101` fails on mobile-chromium at every commit on this branch line and
  is unrelated to this change.
