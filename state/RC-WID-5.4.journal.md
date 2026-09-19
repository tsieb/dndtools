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
the frame would need an external source in `style-src`. Allowing the entire app origin would
admit other stylesheets. A path-restricted source is possible, but a stylesheet URL with a query
string is still a request the frame makes without going through the host's `outbound` gate. It would also
have required editing `apps/gm-react/electron/main.cjs`, which serves the same policy as a header and
is outside this task's paths. So the host fetches the kit and passes the text, and the existing
`style-src 'unsafe-inline'` admits it. `WIDGET_SANDBOX_CSP`, the meta tag and the Electron header are
byte-identical to before, and `hostBridge.test.ts` still asserts all three agree.

## Torchlight scope — resolved by operator brief (2026-09-18)

`packages/core/src/state/starter-widgets/torchlight.ts` is now explicitly owned by this task.
The previous candidate's path-fence failure is resolved by the operator's expanded claim; no
runtime rewrite is needed. The existing changes are retained because Torchlight is the only
code-shipping starter and the acceptance explicitly requires restyling that showcase. There are
no further Torchlight edits in the 2026-09-19 follow-up.

Justification for the retained edits: the kit
card, eyebrow title and reading badge (warning when guttering, accent otherwise) and a Pause flicker
button (`aria-pressed`, WCAG 2.2.2), hidden under reduced motion, demonstrate the DS contract
and provide an accessible control for continuous animation. The meter is now `role="meter"`
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

## Revalidation and scope recovery — 2026-09-19

Starting candidate: `2187dd18a96f6d5588d4b3c96b5c51d309456686`, already committed on the current
task branch, with a clean working tree. The implementation, existing acceptance tests and class
contract were retained. Headroom tools were not available; validation used original command output.

This follow-up corrects the CSP rationale in the owned stylesheet comment, core policy comment
and WIDGETS.md. CSP supports path restrictions; the reason to keep host-delivered CSS is that even
a path restriction allows query-bearing requests outside the outbound gate. See the
[W3C URL matching algorithm](https://www.w3.org/TR/CSP3/#match-url-to-source-expression).
No executable behavior, CSP directive, Torchlight asset or test was changed. Journal updates are
required task evidence. No dispatcher control state was edited.

### Current validation

- App: `pnpm exec vitest run --config vitest.app.config.ts
apps/gm-react/src/app/widgets/widgetKit.test.ts
apps/gm-react/src/app/widgets/hostBridge.test.ts`: **38 passed**, 2 files.
  Original output: `/tmp/rc-wid54-current-app.log`.
- Core: `pnpm --filter @dndtools/core exec vitest run
tests/starter-widget-library.test.ts tests/security-renderer-isolation.test.ts`:
  **41 passed**, 2 files. Original output: `/tmp/rc-wid54-current-core.log`.
- Browser: `DNDTOOLS_E2E_PORT=15734 pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/widget-kit.spec.ts tests/e2e/starter-widgets.spec.ts
tests/e2e/custom-widgets.spec.ts --workers=1`: **12 passed**, desktop and mobile Chromium.
  Original output: `/tmp/rc-wid54-current-e2e.log`. This includes live DS computed-style snapshots
  for Button, Card and Badge in tavern, parchment and high-contrast, comfortable and compact,
  focus-ring parity, motion collapse, starter installation and sandbox failure isolation.

- `pnpm --filter @dndtools/gm-react exec tsc --noEmit` and the corresponding core command:
  both exit 0. Logs: `/tmp/rc-wid54-current-types-app.log`, `/tmp/rc-wid54-current-types-core.log`.
- Focused ESLint on SandboxHost, renderer-isolation and Torchlight: clean. Prettier check on
  all six owned paths and this journal: clean. `git diff --check`: clean.

### Current security review follow-up

The retained [`/security-review` report](#security-review) records the previous candidate's review.
No `/security-review` tool or repository command is exposed in this session; this follow-up is a
manual source review, not a claim to have rerun that command or the operator's independent review.

Reviewed the current guest `install`/`applyHostLook` and message source check, the host's fixed kit
fetch and version check, capability-gated token forwarding, stylesheet request guards, Torchlight
assets, and core/meta/Electron CSP consistency tests. No new executable changes or new security
findings. The guest still receives styles through `textContent` and remains `allow-scripts` only;
kit CSS contains no URL/import/image-set requests. Corrected the inaccurate claim that a CSP source
cannot name a file. The policy itself remains unchanged, and the focused security tests pass.

The documented font limitation remains: computed DS styles match, but the sandbox cannot fetch
self-hosted Inter, so this is not a pixel-identical glyph snapshot claim. Full repository gates,
independent review and publication remain the central operator's responsibility.
