# RC-POL-1.20 — Scene display and second screen

Scope: owned surface plus required localization, focused tests, snapshots, style ratchet and inventory evidence. No dispatcher controls or remote refs changed.

Checked entries mean verified or explicitly waived as stated; they do not claim waived work was performed.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). — DS buttons, icon button and Illustration; semantic projector layout is custom because screen-kit chrome is inappropriate for a player projector. Owned TSX raw-style allowances removed (zero findings). Mood colors remain centralized in sceneCardMood.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. — Waiver: no dedicated scene-display template in the design catalog. Retains full-bleed mood/hero composition; opaque text backing intentionally replaces a translucent scrim to guarantee contrast on arbitrary images.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. — Next card is the only gold action; control panel uses raised surface and shadow-md.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Three content sizes; title starts at text-2xl. Waiver: queue count is embedded in the translated button phrase, not a numerical data column.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. — Waiver: mood is content, not status, and has a textual label. No DM-secret metadata is added to the player projector.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. — The projector pins its own dark palette, so the app theme must not reach it: `golden-routes.spec.ts` checks `/display` in all five themes against ONE baseline per tier (3 PNGs, 15 assertions); a theme leaking into the projector fails. Waiver: populated-card and open-overlay baselines are not committed. They cost 100–250 KiB per image and the shared visual budget had 23 KiB left on `loop/rc` f4cb4a64 (see Rebase below); raising the cap is an owner decision. Those states are covered by the e2e axe scans on both profiles and were reviewed full-size in the first attempt, and the owned source has not changed since.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — Named duration/easing tokens; explicit reduced/none animation stop. Removed continuous Ken Burns motion.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists. — Scenes illustration for empty/waiting receiver; waiting explains keeping the main window open. Image failure falls back to mood. Popup/dispatch failures are inline in the modal; no dedicated error/loading illustration key exists.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state. — Dispatch immediately enters Updating display and completes with saved/retry feedback; popup failure is inline.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Waiver: clear only deactivates the card; it deletes no content. Cards remain available to Show again. Queue advance retains card records.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — Updating/saved status accompanies dispatch persistence; failures invite retry.
- [x] One clear route back; browser back works; Android Back follows the documented order. — Existing Escape and Android fullscreen back handler retained, focus restores to launcher. Display route remains browser-back navigable; standalone projector intentionally has no navigation chrome.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). — Controls visible without hover; minimum 48px via space-12. Existing explanatory titles retained.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — Waiver: three direct controls and close fit in a wrapping, height-bounded control region; a second nested sheet would obscure the scene and complicate fullscreen focus isolation. One primary gold action.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — All new strings use t(), EN/ES provided including mood labels and native-open failure. User-authored title/flavor remain verbatim.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. — Waiver: these controls are direct verbs with existing explanatory titles; no settings or unfamiliar modes need HelpTip. Escape supported by existing modal convention.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. — Focused axe scans of populated overlay and populated/empty route passed on both profiles; empty overlay after persisted Clear also passed on both profiles. Register unchanged.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. — Existing e2e records launcher focus, Ctrl+Shift+S, six Tabs, Shift+Tab, Escape and restored focus at 360x360; visible DS focus ring retained.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. — Route has main landmark; one h1 (active title or localized empty/waiting title). Waiver: dynamic player title is not a SECTION_TITLES shell heading.
- [x] Live regions announce operations; no announcement spam. — One polite status region for command results; no whole-scene announcement spam.
- [x] Screen-reader spot check on one platform noted. — Waiver: no native screen reader is available in this automated task. axe, role/name assertions and keyboard focus checks are automated evidence, not a claimed auditory check.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. — Added short-viewport long-text scroll reachability and persistent exit-control check. 200% root text size verified at 360x360; scene scrolls and Exit stays in the viewport.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — All campaign writes remain runtime.dispatch; display reads remain getSceneDisplayForActor. DTO contract unchanged.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. — Preview disables writes and handler checks runtime.readOnly; core rejection remains authoritative.
- [x] Player projection of this surface verified through an actor read in an e2e. — Existing player-banner actor projection and preview DM-only filtering e2e retained.
- [x] e2e on both profiles covers the primary task and one failure path. — Full scene-cards specs passed on both profiles (30 tests), including blocked-popup failure path; final expanded empty-overlay assertion also passed.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. — Waiver: no isolated ENG-1.1 display budget exists; no defensible before/after timing claim on a concurrently loaded worker. Removed continuous animation and inline style allocation; performance measurement remains outside acceptance gates.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. — FEATURE-GAPS Second display row updated. No architecture contract moved.

## Validation (first attempt, base 2d9f566d)

- Initial suite: 28 existing cases passed, 2 new cases failed at fixture setup (flavor text exceeded the core 500-character limit). Fixture reduced to valid input; corrected-input suite passed (30 tests).
- Initial pinned-container capture: 24 tests passed; 45 display baseline files generated/updated. Visual review caught an incorrect hidden-heading utility; corrected to the existing visually-hidden class before final regeneration.
- Initial pnpm gates passed; no owned file-size warnings. Owned files remain below 500 lines; final counts recorded below.
- App typecheck and owned-source ESLint passed. Formatting and diff whitespace checks passed. Visual baseline budget: 171 total files, 18,381.6 KiB / 32,768 KiB.

- Follow-up accessibility checks caught a non-focusable scroll region and the generic EmptyState h3 skipping the standalone route heading level. The scroll surface is now keyboard-focusable; the empty state uses the shared Illustration with its own h1. No axe exemptions were added.
- 200% text with 360x360 viewport exposed a clipped Exit after popup failure feedback. Exit now remains independently anchored at the top edge.
- Host and container Vite processes share the checkout cache: overlapping runs produced runtime-start timeouts. Final browser/visual runs are sequential to avoid that interference; timeouts are not reported as passing tests.

## Rebase onto loop/rc f4cb4a64 (2026-09-24)

The first attempt (57ac4c5a, base 2d9f566d) stopped at a provider limit, and `loop/rc` gained 123 commits after it. It was rebased onto f4cb4a64. `golden-routes.spec.ts` and FEATURE-GAPS conflicted, and both were resolved in `loop/rc`'s favour: the Audio polish block and the reformatted inventory table were kept, then this story's edits were reapplied.

- Visual budget: the first attempt's 45 new PNGs (~5.5 MB) could not fit. `loop/rc` stood at 32,744.8 / 32,768 KiB. All were dropped. The nine existing `display--{tavern,parchment,high-contrast}.png` files were byte-identical across themes (the surface pins `data-theme="tavern"`), so they were replaced by `display.png` per tier, checked in all five themes. Result: **399 files, 32,724.9 KiB**, about 20 KiB less than `loop/rc`, which leaves room for RC-POL-1.16's ~10 KiB.
- `token-references.test.ts` flagged `--scene-from/--scene-to/--scene-ink` (the CSS reads them and the TSX sets them inline). `.scene-display__card` now declares theme-token defaults; the inline mood palette still wins.
- Out of scope, noted: the comment above `a11y axe gate: /display` in `a11y-axe-gate.spec.ts` still says the route has no `role="main"`. It now has one. The test still passes.

## Second rebase onto loop/rc 75fef2be (2026-09-24)

The integration rebase onto 75fef2be (RC-POL-1.16 Plans/legal) conflicted only in FEATURE-GAPS. That was resolved in `loop/rc`'s favour: 1.16's Plans & cloud and Legal rows were kept, then this story's Second display row edit was reapplied. The owned source, specs and baselines did not conflict. After the rebase the budget stands at **414 files, 32,734.9 KiB / 32,768 KiB** (both 1.16 and 1.20 fit). Re-run on 75fef2be: `/display` pinned visual 15 passed; `scene-cards.spec.ts` 30 passed on both profiles; `a11y axe gate: /display` 2 passed (both profiles); `pnpm test:app` 1641 passed; `pnpm test:tooling` 218 passed; `pnpm gates` passed with no warning naming an owned file; `format:check:changed -- --base 75fef2be` clean.

## Reproduce final checks

```sh
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/scene-cards.spec.ts --workers=2
bash apps/gm-react/tests/visual/run-in-container.sh -g '/display' --update-snapshots=none --workers=2
pnpm --filter @dndtools/gm-react typecheck
pnpm test:app
pnpm exec eslint apps/gm-react/src/screens/SceneDisplay.tsx apps/gm-react/src/app/SceneDisplayOverlay.tsx
pnpm gates
node apps/gm-react/tests/visual/check-baseline-budget.mjs
```

- Owned files: SceneDisplay.tsx 170 lines; SceneDisplayOverlay.tsx 279; scene-display.css 189. No file-size warning for any owned file.
- Scope waivers above are deliberate: projector chrome/mood identity, direct compact controls, no destructive deletion, no dedicated performance budget, and no available native screen reader. They are not assertions of manual screen-reader or performance measurements.

## Final results (after rebase, on f4cb4a64)

- `scene-cards.spec.ts`: **30 passed** on desktop-chromium and mobile-chromium, before and after the CSS default fix. The display-polish case scans populated and empty route and overlay with axe (zero violations) and covers blocked-popup feedback, preview guards, persisted Clear, and large-text scroll/exit reachability.
- `a11y-axe-gate.spec.ts`: **60 passed** on both profiles (includes `/display`).
- Pinned container visual: `-g '/display' --update-snapshots=none` **15 passed** (five themes × three tiers against one baseline per tier). Baseline reviewed (phone tier: tavern-dark stage, scenes illustration, "No scene on display").
- `pnpm test:app` **1641 passed**; `pnpm test:tooling` **218 passed**; `pnpm lint` (raw-style count, eslint, boundary, emphasis, contrast) passed; gm-react typecheck and build passed; `format:check:changed -- --base loop/rc` clean.
- `pnpm gates`: passed. No file-size warning for any owned file: SceneDisplay.tsx 170 lines, SceneDisplayOverlay.tsx 279, scene-display.css 189. Unrelated warnings are unchanged.
- No push, promotion, dispatcher state edit, or additional agent/loop was performed.
