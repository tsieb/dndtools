# RC-ENG-9.1 run journal

## 2026-09-29 — implementation

- Started from a clean task branch at `e1388ed2`. No Headroom tools are available in this session, so this journal cites native tool output.
- Findings confirmed in source. `index.html` ships `<title>Lamplight — Command Center</title>`, and only `/wiki` and the legal pages ever set `document.title`. Separately, `StatusDot` rendered `@keyframes dndPulse{…}` as a `<style>` child on every render, pulsing or not. On desktop the sidebar's `textContent` contained that text through the account row's presence dot.
- **Ownership constraint.** The claim is `screen-kit.tsx` + `StatusDot.tsx`. The manifest's `companion_paths` grant `App.tsx`, `nav.ts`, `*.test.tsx` and `tests/e2e/*.spec.ts`. My first draft touched TopBar, Join, SceneDisplay, play/\*, and `styles/index.css`, and would have failed the claim gate, so I reverted it. The final diff stays inside the claim plus companions.
- **Titles.** `screen-kit.tsx` now exports `documentTitle`, `useDocumentTitle(heading)` and `TitleFromHeading`:
  - `useDocumentTitle(heading)` sets "Lamplight — <heading>" and restores the previous title on unmount.
  - `TitleFromHeading` is a `display:contents` wrapper. It observes the first `<h1>` inside it, so the title follows `/play` section changes and `/display` card titles.
  - `App.tsx`: every shelled route, i.e. every `Page`, sits under the top bar's `<h1>`. `SectionDocumentTitle` feeds `useDocumentTitle` from the same `sectionLabelKey(activeSectionId(pathname))` that TopBar renders.
  - `/play`, `/join` and `/display` are wrapped in `TitleFromHeading`. `/wiki` and the legal pages keep their existing self-titling.
- **StatusDot.** The `<style>` child is gone. `styles/index.css` is outside the claim, so the ring now composes two existing keyframes from the motion stylesheet (`motion-sheet-slide` with `--motion-sheet-from: scale(2.6)` plus `motion-fade-in`), both played `reverse` so the ring grows and fades out. Half strength moved into the background colour (`color-mix`), because the fade animates `opacity`. A Chromium probe (a scratch spec, deleted afterwards) showed both animations running: scale 1→2.14 and opacity 1→0.29 at ~950ms. Under `data-motion="reduced"` it rests on the base frame, the same size as the dot and hidden behind it.

## Evidence

- New `tests/e2e/route-titles.spec.ts`, both Chromium projects:
  - Eight routes: `/`, `/screens`, `/screen/:id`, `/scene/:id` and `/settings` via in-app hash navigation, then `/play` (plus a section switch to Dice), `/join` and `/display` via cold loads, then back to `/settings`. Each route asserts that the title equals "Lamplight — " + its first `<h1>`.
  - The sidebar test asserts that the aria snapshot and `textContent` contain no `@keyframes` and that there is no `<style>` in the desktop `aside`. On the phone it scans `body`.
  - `--repeat-each=3`: **12 passed**. Final run with the Dice step: **4 passed**.
- Mutation checks, all red as expected:
  - Old `StatusDot` restored: the sidebar e2e fails on both profiles and both unit tests fail. The aria snapshot alone missed it on desktop because the account row's `aria-label` hides its contents; the `textContent` assertion catches it.
  - `<SectionDocumentTitle />` removed: fails with "Lamplight — Command Center" on `/screens`.
  - `/play` `TitleFromHeading` removed: fails with "Lamplight — Command Center" on `/play`.
- `StatusDot.test.tsx` (no `<style>` child, pulse uses the motion keyframes): 2 passed. Full app vitest: **156 files / 1727 tests passed**.
- Related e2e, both profiles (join, player-view, wiki-v2, legal, scene-cards, screens, pinned-screens, player-preview): **90 passed**. Axe gate `-g "play|join|display"`: **10 passed**.
- `tsc --noEmit` passed. `pnpm lint` exit 0; its 17 warnings are pre-existing and none are in changed files. Prettier check on changed files passed. `pnpm --filter @dndtools/gm-react build` passed, including `check-prod-bundle`.
- Not run: the visual suite. Removing a `<style>` node paints nothing, and the pulse only renders on live/pending states.
- No push, promotion, loop launch or dispatcher state edits.
