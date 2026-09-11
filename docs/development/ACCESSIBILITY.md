# Accessibility (WCAG 2.2 AA)

WCAG 2.2 Level AA is the binding floor for `apps/gm-react`. No criterion may be knowingly left
unmet without a register entry carrying an owner and a remediation date.

## 1. Automated gates

`pnpm a11y:gate` = `a11y:contrast` + `a11y:axe` + `a11y:report`. `pnpm tokens:contrast` covers text
pairs.

- **axe route gate.** `apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts` runs `@axe-core/playwright`
  on every durable workspace (`/`, `/board`, `/scene/:id`, `/scenes`, `/atlas`, `/characters`,
  `/knowledge`, `/campaign`, `/session`, `/graph`, `/audio`, `/extensions`, `/community`,
  `/upgrade`, `/player`, `/play`, `/display`, `/join`, `/wiki`, `/settings`, and the open editors)
  on both Playwright profiles with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`,
  `best-practice`. `critical` always blocks; `serious` blocks unless an approved register entry
  with a future date exists; `moderate` and `minor` are reported. `scripts/a11y-axe-report.ts`
  merges worker artifacts from `apps/gm-react/test-results/a11y/`, fingerprints findings, and fails
  when a register date has passed.
- **Contrast lints.** `scripts/a11y-nontext-contrast-lint.ts` (wired into `pnpm lint`) enforces
  ≥ 3:1 for focus indicators, selection boundaries, and status glyphs across every theme, and checks
  the `forced-colors` remap. `scripts/token-contrast-lint.ts` checks text and background token pairs.

## 2. Known-violation register

`apps/gm-react/tests/a11y/known-violations.json`: `id` (axe rule), `route`, `impact`,
`targetResolutionDate`. Currently empty. Adding an entry is the only way to ship a `serious`
finding, and a passed date fails the gate.

## 3. Component contract

- Reuse the DS primitives instead of re-implementing ARIA: `ds/components/overlay/Dialog.jsx` and
  `Sheet.jsx` (role, labelling, focus trap, Escape, scroll lock, focus restore, Android Back),
  `Toast.jsx` (status shapes; a toast with an action never auto-dismisses), `Field.jsx` (label
  association, `role="alert"` errors).
- Icons go through `ds/components/core/Icon.jsx`; a meaningful icon has a `label`, a decorative one
  is `aria-hidden`; icon-only buttons always pass a label.
- Keyboard shortcuts are declared once in `app/shortcuts/registry.ts`; handlers fire through
  `matchesShortcut`, and every surface that prints the keymap (the `?` overlay, the map editor,
  Settings › Accessibility) renders the same entries. Only the command palette fires while typing.
- Every route renders exactly one `<h1>` (from `SECTION_TITLES`); no skipped heading levels; no
  headings for visual emphasis. Every `<nav>` has an `aria-label`.
- Every pointer operation (widget move and resize, map drag, initiative reorder, token move) has a
  keyboard equivalent dispatching the identical command (WCAG 2.5.7). Live regions announce
  operations without spam; motion collapses globally under `data-motion`.
- Touch targets are ≥ 44px, 48dp on Android; measure 2.5.8 with the spacing exception before filing.

## 4. Manual checklist (before every release)

Environments: VoiceOver + Safari (macOS), NVDA + Chrome (Windows), TalkBack + the Android app on
API 36. Start from a non-empty vault on a production candidate.

1. Primary navigation: each route exposes one `h1`, the landmark receives focus, the live region
   announces the route.
2. Canvas keyboard model: Tab into the canvas, move, resize, layer, and dock a widget by keyboard
   with announcements.
3. Command palette: open, search, activate; dialog semantics; focus lands on the destination.
4. Combat announcements as DM and as player: turn advance and HP changes polite, death assertive,
   debounced.
5. Drag alternatives for every drag.
6. **Visibility-boundary no-leak check as a player (required).** With a DM-only widget, POI, and
   hidden combatant, confirm by screen reader and DOM inspection that no DM-only name, label,
   description, alt text, or announcement is present. A leak is a release blocker.
7. Form labels across Settings.
8. Android: 360px portrait, short landscape, tablet, split screen, 200% text, keyboard open;
   focused control and sticky action stay visible; system bars cover nothing; Back order holds.
9. Quick Map with TalkBack: every armed tool named and visibly selected; multi-touch navigates;
   token, POI, fog, and zoom have non-drag alternatives.

Record results in the release notes:

```md
### Accessibility QA

- Executed on: YYYY-MM-DD · Build: <candidate> · `pnpm a11y:gate`: PASS | FAIL
- VoiceOver/Safari · NVDA/Chrome · TalkBack/Android: PASS | PASS WITH KNOWN ISSUES | FAIL
- Player-role no-leak check: PASS | FAIL
- Findings: [ID] Summary (WCAG X.X.X) - Severity - Status - Workaround - Target fix
```

## 5. WCAG 2.2 criteria not automatable

| SC     | Coverage                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------- |
| 2.4.11 | Focus-ring baseline in `styles/tokens/base.css`; manual check of sticky chrome over the canvas |
| 2.4.13 | Focus-ring tokens ≥ 3:1, enforced by `a11y:contrast`                                           |
| 2.5.7  | Keyboard or menu alternative for every drag, verified manually                                 |
| 2.5.8  | 48dp Android floor in the tokens; axe mobile profile plus the manual API 36 check              |
| 3.2.6  | Help trigger in the same relative position on every route                                      |
| 3.3.7  | Campaign and session context persists in vault state, never re-requested                       |
| 3.3.8  | Session join uses a copyable code; no CAPTCHA or cognitive test                                |
