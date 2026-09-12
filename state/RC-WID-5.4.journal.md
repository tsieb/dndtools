# RC-WID-5.4 — The design-system kit inside the sandbox

Security review: see [Security review](#security-review) below (run 2026-09-12 with `/security-review`
against the working tree before commit).

## What changed

- `apps/gm-react/public/widget-kit.css` (new, kit v1). Classes for button, icon button, card (+ header
  and eyebrow title), badge, chip, list row, input/textarea, select, stat, plus `kit-root` body text.
  Also the app focus ring at zero specificity, the standard/comfortable/compact density sets, and the
  motion collapse (duration tokens to 0ms plus the blanket animation/transition stop). Colours,
  shadows and fonts come from forwarded theme tokens. The theme-invariant scale is declared in the
  kit and must equal `styles/tokens/`.
- `SandboxHost.tsx`. For packages that declare `host-theme-tokens`: fetches the kit once per page
  from the app origin, checks its `--kit-version`, and sends it in `init` as `kit { version, css }`.
  It also forwards `KIT_THEME_TOKENS` and a `hostDocument { theme, density, motion, colorScheme,
rootFontSize }`, and watches the host `<html>` so a theme, density or motion switch re-themes a
  running frame through a new `theme` message. On a failed or mismatched fetch the frame initialises
  without the kit.
- `widget-host.html`. Applies the host look (token names must start with `--`; attribute values,
  colour scheme and font size are pattern-checked), installs the kit before the package stylesheet,
  and handles `theme`. The CSP meta is unchanged.
- `renderer-isolation.ts`: comment only. Records why the CSP was not widened.
- `docs/architecture/WIDGETS.md`: §4.1 with delivery, forwarding, the class contract table,
  versioning and limits. Also a `theme` row in the protocol table, a "where to look" row and the
  e2e spec name.
- Tests: `widgetKit.test.ts` (drift and contract guard) and `tests/e2e/widget-kit.spec.ts`
  (acceptance).

## Decision: the widget CSP did not change

The story allows the CSP to change "only to admit that one same-origin stylesheet". A `<link>` from
the frame would need `'self'` in `style-src`. A source expression cannot name one file, so that would
admit every stylesheet on the app origin and any `@import` in one, and a stylesheet URL with a query
string is a request the frame makes without going through the host's `outbound` gate. It would also
have required editing `apps/gm-react/electron/main.cjs`, which serves the same policy as a header and
is outside this task's paths. So the host fetches the kit and passes the text, and the existing
`style-src 'unsafe-inline'` admits it. `WIDGET_SANDBOX_CSP`, the meta tag and the Electron header are
byte-identical to before, and `hostBridge.test.ts` still asserts all three agree.

## Out-of-claim path — needs operator attention

`packages/core/src/state/starter-widgets/torchlight.ts` is modified and is not in this task's owned or
companion paths. The acceptance names "the starter library's custom showcase restyled with the kit",
and Torchlight is the only starter that ships code, so it can't be met without touching it. If the
write fence rejects the candidate, widening `owns` to include that file is the fix. Changes: the kit
card, eyebrow title, reading badge (warning when guttering, accent otherwise) and a Pause flicker
button (`aria-pressed`, WCAG 2.2.2), hidden under reduced motion. The meter is now `role="meter"`
with `aria-valuenow`. Palette literals were dropped in favour of tokens, and the glow is derived
from the flame token, so the `glow`, `surface` and `text` style tokens are gone. Default size went
from 260×220 to 260×240 and min height from 180 to 200 to fit the button.

## Validation

- App vitest, `widgetKit.test.ts` + `hostBridge.test.ts`: 2 files / 38 tests passed
  (`/tmp/rc-wid54-vitest-app.log`).
- Core vitest, `starter-widget-library.test.ts` + `security-renderer-isolation.test.ts`: 2 files /
  41 tests passed (`/tmp/rc-wid54-vitest-core.log`).
- `tsc --noEmit` for gm-react and core: exit 0 (`/tmp/rc-wid54-types-{app,core}.log`).
- ESLint on the changed TS/TSX files: exit 0. Prettier check on all changed files: clean.
  `git diff --check`: clean.
- `pnpm test:tooling`: 24 files / 162 tests passed (`/tmp/rc-wid54-tooling.log`).
- Playwright on isolated port 15731, desktop-chromium + mobile-chromium, `widget-kit.spec.ts`,
  `starter-widgets.spec.ts`, `custom-widgets.spec.ts`: 12 passed, 0 failed
  (`/tmp/rc-wid54-e2e-3.log`).
  - The acceptance test reads the DS Button (secondary, md), Card (flat, md) and Badge (accent)
    computed styles from the `#/__ds` gallery in tavern, parchment and high-contrast × comfortable
    and compact. The kit button, card and badge inside the running Torchlight frame must compute
    to the same values after a live re-theme. The comparison covers padding, border, radius,
    background, colour, shadow, font family/size/weight/line height, min and actual height, and
    the `:focus-visible` ring. It also asserts the kit arrived as `<style data-widget-kit="1">`
    with no `<link>` in the frame, and that the sandbox attribute is still `allow-scripts`.
  - The second test pauses the flicker, then flips the host to `data-motion="none"`. The frame
    mirrors it, the flame rests (`animation-iteration-count: 1`) and the pause control hides.
- Two failures along the way, both fixed: (1) rem lengths were 13/16 of the DS because the guest
  document sets `html { font: 13px … }`, so the host now forwards its root font size; (2) the DS
  reference focus ring was read without `:focus-visible` because gallery selects count as pointer
  use, so the reference is now reached by keyboard. Logs `/tmp/rc-wid54-e2e-{1,2}.log`.
- Not run: the full Playwright suite, `pnpm lint` in full, the app build. Left to the central gates.

Known limit: the frame can't load the app's self-hosted Inter (`font-src data:`), so kit text
renders in the next face of the `--font-sans` stack. Computed values match; glyph shapes may not.
Documented in WIDGETS.md §4.1.

## Security review

`/security-review`, 2026-09-12. Scope: the RC-WID-5.4 working-tree changes listed above. The
command's generated diff was against `main` and also carried the unrelated `loop/rc` commits already
reviewed under their own stories; those were not re-reviewed. The review was done inline rather than
with the command's sub-tasks, because this task does not authorise spawning agents.

**Findings: none at or above the report threshold (confidence ≥ 8).**

Checked and dismissed:

- **Message trust in the guest.** `applyHostLook`/`install` run only for messages whose
  `event.source` is `parent`. A sibling frame or the widget cannot forge a `theme`/`init`. Package
  code shares the guest realm but can only restyle its own document, which it could already do.
- **Values written into the frame.** Token names must start with `--` and are applied through
  `style.setProperty`. Attributes, `color-scheme` and `font-size` are pattern-checked or dropped.
  Even a hostile value cannot load anything, because the frame's `img-src`/`font-src` are `data:`
  only and `connect-src` is `'none'`.
- **Kit text injected as `<style>`.** It comes from a fixed same-origin URL with no user input
  (`new URL('widget-kit.css?v=1', document.baseURI)`) and is inserted via `textContent`. Tampering
  requires control of the app origin. `widgetKit.test.ts` asserts it has no `url()`, `@import` or
  `image-set()`.
- **CSP.** Unchanged, and asserted three ways (core constant, meta tag, Electron header) plus
  `style-src` pinned to `'unsafe-inline'`.
- **Data exposure.** The frame now learns the theme name, density, motion setting, colour scheme,
  root font size and more theme colour values. None of it is campaign or user data, and the frame
  has no network channel of its own to send it anywhere.
- **`postMessage(…, '*')` for `theme`.** Same targeting as the existing `render` messages, which
  carry far more sensitive, actor-filtered data. Nothing new and nothing sensitive added.
