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
- **Accessibility-tree contracts.** The same spec's `a11y tree:` tests assert what a screen reader
  is actually given on the three spatial surfaces (the GM Screen, the scene editor, the map editor),
  on both profiles: role, accessible name, and the counts in that name (§3, "Spatial surfaces"),
  plus the keyboard move announcements and the map List view's tables. axe proves the tree is
  valid; these prove it says the right thing.
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

### Spatial surfaces (RC-UX-2.2)

The GM Screen (`/board`), the scene canvas and flow layout (`/scene/:id`) and the map editor share one
contract. The strings live in `app/canvas/surfaceA11y.tsx` and `app/map/mapA11y.ts`.

| Surface               | Viewing                                                                                                       | Editing layout                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| GM Screen             | `region` "GM Screen, 6 widgets"                                                                               | `application` "GM Screen layout editor, 6 widgets" |
| Scene (canvas / flow) | `region` "Scene canvas / Scene layout, N widgets"                                                             | `application` "Scene layout editor, N widgets"     |
| Map editor, map view  | `application` "Map canvas — ‹name›. 2 points of interest, 0 tokens, 0 routes, 1 layer. Drawing tool: ‹tool›." | same                                               |
| Map editor, List view | `region` "Map inventory — ‹name›. ‹counts›", one named table per kind                                         | same                                               |

- **`application` only while the keys belong to the surface.** Editing a layout (Space picks a tile
  up, arrows move it) and drawing on a map need every key. Reading a board does not, so a board in
  view mode is a `region` and browse mode walks widget content normally.
- **Counts are in the name**, so a screen reader says how much is behind the Tab stop before
  entering it, and says it again when a widget or POI is added or removed. Map counts come from the
  actor-filtered view, so a player preview never counts what it cannot see.
- **A list is the full non-visual path.** Widget frames are named groups in the core's reading
  order ("‹title›, ‹type› widget", plus position and size while editing), so Tab visits every widget.
  The map's List view holds every POI, token, route and layer as table rows with in-place label
  editing and "Navigate to". Nothing on these surfaces is reachable only by pointing.
- **Every operation speaks** through one permanent polite region per surface: move, resize, pick up
  ("‹title› selected…") and put down on the canvas; reorder and width on the flow layout; undo/redo
  through the history region; zoom steps; every accepted map command and the map/list swap through
  the map editor's region. Removal is voiced by its Undo toast, which is why the canvas does not
  announce it twice.

## 4. Manual screen-reader script (before every release, about one hour)

Run this on a production candidate with the demo vault loaded (a fresh install seeds it). Each row
is one action and what you should hear or see; mark it ✓ or ✗ as you go. The times keep the whole
run to an hour: sections A–E once on **NVDA + Chrome** (Windows, about 33 min), then only the ★ rows
on **VoiceOver + Safari** (macOS, about 10 min), then the ★ rows plus section F on **TalkBack** (the
Android app on API 36, about 15 min). Wording can differ a little between readers; a ✗ means the
information is missing or wrong, not phrased differently.

Setup (3 min): start the reader, open the app, close onboarding, and open Settings › Accessibility
so the keymap is in front of you. On Android, turn on TalkBack before launching the app.

### A. Navigation and the palette (4 min)

| #    | Do                                                   | Expect                                                                     |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| A1 ★ | Move between three routes with the primary nav.      | Route name announced; one heading level 1 per route; focus lands in main.  |
| A2   | Open the command palette, type "atlas", press Enter. | "Command palette" dialog; results read as you arrow; focus lands on Atlas. |
| A3   | Tab through Settings › Profile.                      | Every field has a spoken label; errors read as alerts.                     |

### B. GM Screen (`/board`) (9 min)

| #    | Do                                                           | Expect                                                              |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| B1 ★ | Tab onto the board.                                          | "GM Screen, N widgets", N matching what is on screen.               |
| B2   | Browse (NVDA browse mode / VO arrows) through two widgets.   | Each: "‹title›, ‹type› widget", then its content read normally.     |
| B3 ★ | Press Edit layout, then Tab back to the board.               | "GM Screen layout editor, N widgets"; frames add position and size. |
| B4 ★ | On a widget press Space, then Down arrow twice, then Escape. | "‹title› selected…", "‹title›, moved to x, y" twice, "put down".    |
| B5   | Space, then Shift + Right arrow.                             | "‹title›, size W by H".                                             |
| B6   | Press Ctrl+Z (⌘Z on macOS).                                  | "Undone: resized ‹title›".                                          |
| B7   | Press A.                                                     | Add gallery opens as a named dialog; Escape returns focus.          |
| B8   | Delete a widget with Delete, then Tab back onto the board.   | Undo toast read; the board name now says N−1 widgets.               |

### C. Scene editor (`/scene/:id`) (5 min)

| #    | Do                                                                | Expect                                                  |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| C1 ★ | Open a Scene from `/scenes` and Tab onto its canvas.              | "Scene canvas, N widgets" (or "Scene layout" for flow). |
| C2   | Press Edit layout; move one widget with Space and the arrow keys. | "Scene layout editor, N widgets"; each move announced.  |
| C3   | On the free canvas press 2, then 0.                               | "Zoom Detail, 150%.", then "Zoom Fit, …%."              |
| C4   | On a flow Scene, open a tile's actions menu and choose Move back. | "‹title›, position k of N".                             |

### D. Map editor (9 min)

| #    | Do                                                               | Expect                                                                        |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D1 ★ | Open a map in the editor and Tab to the canvas.                  | "Map canvas — ‹name›. ‹n› points of interest, … Drawing tool: Select."        |
| D2   | Pick the Notes tool from the tool rail.                          | Tool button reads as pressed; the canvas name now says the new tool.          |
| D3 ★ | Press Show list.                                                 | "List view shown."; "Map inventory — ‹name›…" region with one table per kind. |
| D4   | Rename a POI in its label cell, press Enter.                     | The rename is announced; the canvas count is unchanged.                       |
| D5   | Press Navigate to on a POI.                                      | Back on the map with that POI selected.                                       |
| D6   | Select a POI and nudge it with the arrow keys; undo with Ctrl+Z. | Each change announced; nothing needs a drag.                                  |

### E. Combat and the player view (6 min)

| #    | Do                                                                           | Expect                                                                                                         |
| ---- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| E1   | Start combat on `/session`, advance two turns, apply damage.                 | Turn change and HP polite; a death is assertive; no repeats.                                                   |
| E2   | Reorder initiative without dragging.                                         | New order announced.                                                                                           |
| E3 ★ | As a player (`/play`), with a DM-only widget, POI and hidden combatant live. | **No DM-only name, label, alt text or announcement anywhere.** Inspect the DOM too. A leak blocks the release. |

### F. Android layout (TalkBack only, 8 min)

| #   | Do                                                                               | Expect                                                                 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| F1  | 360px portrait, short landscape, tablet, split screen, 200% text, keyboard open. | Focused control and sticky action stay visible; bars cover nothing.    |
| F2  | Press Back from a sheet, a dialog, then a route.                                 | Closes in that order.                                                  |
| F3  | Quick Map: arm each tool; place a token and a POI; reveal fog; zoom.             | Every armed tool named and shown selected; none of these needs a drag. |

### Recording results

Add a row to the log below (newest first) and copy it into the release notes under
`### Accessibility QA`. The run is not a merge gate: a ✗ becomes a register entry (§2) or a finding
with an owner, except the E3 no-leak check, which blocks the release.

| Date | Build | `pnpm a11y:gate` | NVDA/Chrome | VoiceOver/Safari | TalkBack/Android | No-leak (E3) | Findings (row, SC, severity, owner) |
| ---- | ----- | ---------------- | ----------- | ---------------- | ---------------- | ------------ | ----------------------------------- |
| —    | —     | —                | not yet run | not yet run      | not yet run      | not yet run  | —                                   |

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
