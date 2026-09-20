# RC-POL-1.20 — Scene display and second screen

Scope: owned surface plus required localization, focused tests, snapshots, style ratchet and inventory evidence. No dispatcher controls or remote refs changed.

Checked entries mean verified or explicitly waived as stated; they do not claim waived work was performed.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). — DS buttons, icon button and Illustration; semantic projector layout is custom because screen-kit chrome is inappropriate for a player projector. Owned TSX raw-style allowances removed (zero findings). Mood colors remain centralized in sceneCardMood.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. — Waiver: no dedicated scene-display template in the design catalog. Retains full-bleed mood/hero composition; opaque text backing intentionally replaces a translucent scrim to guarantee contrast on arbitrary images.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. — Next card is the only gold action; control panel uses raised surface and shadow-md.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Three content sizes; title starts at text-2xl. Waiver: queue count is embedded in the translated button phrase, not a numerical data column.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. — Waiver: mood is content, not status, and has a textual label. No DM-secret metadata is added to the player projector.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. — 45 active/empty/overlay snapshots across five themes and three tiers; pinned-container generation and no-update comparison passed (24 tests); all 45 images reviewed in tier contact sheets and representative full-size captures.
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

## Validation

- Initial suite: 28 existing cases passed, 2 new cases failed at fixture setup (flavor text exceeded the core 500-character limit). Fixture reduced to valid input; corrected-input suite passed (30 tests).
- Initial pinned-container capture: 24 tests passed; 45 display baseline files generated/updated. Visual review caught an incorrect hidden-heading utility; corrected to the existing visually-hidden class before final regeneration.
- Initial pnpm gates passed; no owned file-size warnings. Owned files remain below 500 lines; final counts recorded below.
- App typecheck and owned-source ESLint passed. Formatting and diff whitespace checks passed. Visual baseline budget: 171 total files, 18,381.6 KiB / 32,768 KiB.

- Follow-up accessibility checks caught a non-focusable scroll region and the generic EmptyState h3 skipping the standalone route heading level. The scroll surface is now keyboard-focusable; the empty state uses the shared Illustration with its own h1. No axe exemptions were added.
- 200% text with 360x360 viewport exposed a clipped Exit after popup failure feedback. Exit now remains independently anchored at the top edge.
- Host and container Vite processes share the checkout cache: overlapping runs produced runtime-start timeouts. Final browser/visual runs are sequential to avoid that interference; timeouts are not reported as passing tests.

## Reproduce final checks

```sh
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/scene-cards.spec.ts --workers=2
bash apps/gm-react/tests/visual/run-in-container.sh -g 'display polish|/display' --update-snapshots=none --workers=2
pnpm --filter @dndtools/gm-react typecheck
pnpm exec eslint apps/gm-react/src/screens/SceneDisplay.tsx apps/gm-react/src/app/SceneDisplayOverlay.tsx
pnpm gates
node apps/gm-react/tests/visual/check-baseline-budget.mjs
```

- Owned files: SceneDisplay.tsx 170 lines; SceneDisplayOverlay.tsx 279; scene-display.css 185. No file-size warning for any owned file.
- Scope waivers above are deliberate: projector chrome/mood identity, direct compact controls, no destructive deletion, no dedicated performance budget, and no available native screen reader. They are not assertions of manual screen-reader or performance measurements.

## Final results

- Full scene-card e2e: **30 passed (47.8s)** on desktop-chromium and mobile-chromium. The new case scans populated and empty route and overlay with axe (zero violations), exercises blocked-popup feedback, preview guards, successful persisted Clear, and large-text scroll/exit reachability.
- Pinned visual comparison: **24 passed**, no snapshot update flag enabled; 45 display baselines cover five themes and three tiers. All reviewed for text/control clipping and scene composition.
- App typecheck, owned-source ESLint, Prettier and git diff whitespace checks passed.
- `pnpm gates`: passed, docs reachable, no owned file-size warning. Existing unrelated file-size warnings remain unchanged.
- No push, promotion, dispatcher state edit, or additional agent/loop was performed.
