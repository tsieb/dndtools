# RC-POL-1.1 — Command Center polish

Implementation on the assigned task branch; no push, promotion, loop or dispatcher-state changes.

## Work log

- Split hub presentation, scene-card composer/row and template test fixtures to keep owned source files below 500 lines.
- Add home provisioning skeleton, scene illustrations, translated mood/transition labels, completion feedback and preview authoring guard.
- The broader first run found a preview regression (shared cards disappeared); retain the actor-scoped read-only list while removing write controls. Interrupted that run after live edits caused Vite hot-reload errors; the final run starts against the stable source.
- Review record below distinguishes executed checks from explicit waivers.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). — Owned raw-style allowances removed; focused ESLint passes. Hub geometry retains one-pixel borders and thumbnail grid dimensions as structural exceptions. Hub intent tiles retain semantic native buttons because their complete compound contents are the accessible name; other controls use DS primitives.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. — Preserves the committed RC-CAN-7.6 hero, Scenes/Create/Manage and library arrangement, including parity at /screen/:id. Waiver: the remote prototype is available only to the design-review role (design README §4); this implement worker has no DesignSync access. No structural redesign is claimed.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. — Raised DS hero retains its accent and shadow; launchers and link cards remain flat. Scene-row Play/Show controls are secondary; Save is primary while editing. The composer has Create and the queue has Next card.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Hub captions now use xs/sm tokens and the display title uses xl (24px); the queue heading uses sans rather than undersized display type. Generic widget value renderers retain mono numerals.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. — Ready has a check, Draft a lock, Live the visibility icon; warning/success scene badges include shapes. VisibilityChip names private cards. Waiver: mood swatches intentionally preview the separate projector palette, not application status; privacy uses the existing chip rather than adding a second stripe to each miniature.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. — Five themes × desktop/rail/phone captured for the home hero, Create tiles and scene-card empty illustration. Existing / and /scenes goldens updated separately. Contact sheets reviewed for all 45 retained captures; final comparison result below.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — Hub transitions retain named duration/easing tokens; global reduced-motion clamp covers shared DS skeleton/status animation. No new animation or timing literal introduced.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists. — Home provisioning now has a labelled busy skeleton. Scenes/screen-library empties use scenes-empty, search uses search-none. Setup errors retain storage/retry guidance and unavailable platform controls retain reasons. Waiver: no home-specific loading/error illustration key exists; the queue uses an instructional line beside its disabled Next control instead of repeating the adjacent scene illustration.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state. — Create immediately enters Creating; edits and queue actions announce Saving scene cards; completion changes visible state and creation/edit also toast. Failure leaves drafts intact. Waiver: 100ms is a design target, not a timing measurement claimed on this shared runner.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Screen and scene-card deletion retain named Undo toasts; no new destructive operation. Cancel and Escape abandon only unpersisted edit input.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — Pending scene-card writes have a polite status and errors retain retry guidance; thrown persistence failure/retry is exercised through the real composer. Shared runtime retains vault save status.
- [x] One clear route back; browser back works; Android Back follows the documented order. — Existing screen navigation/back specs retained; New screen uses shared Dialog/Sheet Escape and launcher focus restoration. Waiver: Android hardware Back is owned by the shared overlay stack and was not exercised on a physical device here.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). — Scene-card and queue icon targets explicitly use space-12 minimums (48px); owned buttons also have a 48px minimum height. E2e measures the Edit target. Hub compound tiles have a 48px minimum. Waiver: shared library-card/overlay controls retain their DS sizing and are not rewritten in this ownership.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — Compact route retains the single New screen primary launcher; template selection opens the existing bounded sheet. No new top-bar action introduced.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — Mood and transition options now use t(); new save feedback has EN/ES messages. Existing home and scene copy reread for sentence case, verbs and recovery guidance. Waiver: user-authored widget labels, query result labels and builtin audio preset names remain authoritative data, not translated client-side.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. — Existing composer Field help describes flavor, visibility, hero restrictions and scene packages; unavailable second-screen control names its reason. Waiver: these inline accessible descriptions are more useful than adding redundant HelpTip icons; shell-owned shortcuts/tooltips unchanged.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. — New route, Screens, New screen dialog/sheet and inline card editor use full axe scans in both Playwright profiles. Existing scene-display overlay axe coverage is included in the scene-cards suite. Accessibility register unchanged.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. — Automated keyboard record: focus New screen, Enter, assert named dialog, Escape, assert original launcher focused. Existing scene-display/queue tests cover modal focus return and reorder/advance focus continuity. No PR is created by this task; this journal is the review record.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. — One shell h1 remains; hub section h2 headings and labelled widget regions are retained. New read-only scene-card list is a named section. E2e explicitly checks one route h1.
- [x] Live regions announce operations; no announcement spam. — Provisioning skeleton and pending scene writes use status; errors use the shared toast alert. Empty illustrations are decorative, with text headings; no extra live region around the whole card list.
- [x] Screen-reader spot check on one platform noted. — Waived: no screen-reader application/audio session is attached to this worker. Chromium accessible names, labelled controls, focus restoration and axe were checked; this is not represented as a human screen-reader session.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. — 200% root text case opens the bounded New screen dialog, scrolls to Cancel, closes it and reaches the scene title input on both profiles. No new scroll container introduced.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — All mutations remain runtime.dispatch. Scene cards, queue/display and screens use the existing actor-scoped core queries; no client-side visibility filtering added.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. — Preview retains the actor-filtered read-only card list and hides its authoring controls. New e2e also asserts a preview create command is rejected by runtime.
- [x] Player projection of this surface verified through an actor read in an e2e. — Existing scene-cards preview test seeds shared and secret cards through dispatch, enters a real player preview, verifies only the shared actor projection, exits and verifies the secret returns. Player banner test independently checks shared versus private activation.
- [x] e2e on both profiles covers the primary task and one failure path. — New failure/retry and primary authoring tests run in desktop and mobile profiles, together with hub, screen library, scene template and scene surface regression suites. Final counts below.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. — Waived: ENG-1.1 before/after performance capture requires the controlled benchmark runner; concurrent browser work on this implement host is not a comparable baseline. No query, dispatch algorithm, network request or dependency changed. No measured no-regression claim is made; central performance gate remains authoritative.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. — FEATURE-GAPS Command Center and Screens rows updated. No core/runtime contract moved, so no architecture ADR change required. All owned source/test files and extracted helpers are below 500 lines; generated snapshots are not source modules.

## Final validation

Executed against the final implementation on 2026-10-07. Original output was retrieved from the dispatch Headroom artifacts before recording verdicts; no compressed preview is used as pass evidence.

- Surface browser suites: exit 0; 76 passed, 4 existing mobile skips (2.0 minutes). All eight new polish cases pass.
- Pinned visual comparison: exit 0; 33 passed (54.1 seconds), covering the new polish suite and existing home/screens goldens. The final budget-sized captures and emphasis adjustment are rechecked separately below.
- Unit contracts and DOM snapshots: exit 0; 68 tests in five files passed without update mode.
- TypeScript: `pnpm --filter @dndtools/gm-react typecheck`, exit 0.
- Focused ESLint for owned templates, owned/extracted screens and both new specs: exit 0, no diagnostics.
- `pnpm gates`: exit 0; no file-size warning for an owned path or extracted helper. Existing warnings outside ownership remain, including the pre-existing CommandCenter.baseline test.
- `pnpm lint:raw-style-count` and `pnpm lint:boundary`: exit 0. `pnpm lint:emphasis --quiet`: exit 0 after replacing the extracted composer's small display face with sans and making scene-row Show/Play secondary. No baseline allowance was raised.

Reproduction commands:

```sh
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/command-center-polish.spec.ts tests/e2e/scene-cards.spec.ts tests/e2e/screens.spec.ts tests/e2e/hub-templates.spec.ts tests/e2e/scene-surfaces.spec.ts tests/e2e/scene-templates.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2
DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh command-center-polish.spec.ts golden-routes.spec.ts -g 'Command Center| /$| /scenes$'
pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgets/templates apps/gm-react/src/screens/CommandCenter.baseline.test.tsx
node apps/gm-react/tests/visual/check-baseline-budget.mjs
```

The four unchanged mobile skips are the hub bare-frame editor, desktop style/parity, rail/phone parity (already exercised at those widths in the desktop project), and builder-copy cases. The new route/overlay axe checks have no skips. Screen-reader, physical Android Back, live prototype and controlled before/after performance checks are explicitly waived in their checklist entries above.

Largest owned source: Hub.tsx, 464 lines. Generated `.snap` and PNG baselines are evidence assets. Review includes all five themes in contact sheets for home hero, launchers and empty scene cards. Shared New screen dialog captures were also reviewed in all themes/tiers but are not retained: that unmodified shared component is axe-tested here, and redundant full-dialog baselines exceeded the fixed repository byte budget. Phone captures isolate the complete hero rather than a clipped full-height scrolling element.

No remote gates, independent review, push, publication or promotion are claimed by this implementation commit.

### Final follow-up checks

- After the emphasis fix, both-profile Command Center/scene-card tests: exit 0, **38 passed** (1.2 minutes), including route/overlay axe and the measured 48px edit target.
- After the composer's typography change, pinned `/scenes` golden comparison: exit 0, **9 passed** (17.6 seconds).
- After reducing redundant snapshot area, pinned Command Center polish comparison without update mode: exit 0, **15 passed** (21.0 seconds). Final hero contact sheet reviewed in all five themes and three tiers.
- Snapshot budget: **816 files, 34556.2 KiB of 34816.0 KiB**, exit 0. The fixed budget was not increased; 45 new captures are retained.
- Changed-file Prettier and `git diff --check` pass. No new emphasis allowance or accessibility exemption was introduced.

### Claim-scope correction

The central gate rejected the two extracted screen helpers outside the claim. Both paths are absent in base `515d714c87578cd09e2df99e716ed10fe988b871`; they are now removed from `src/screens` and live under the owned `src/app/widgets/templates` directory. Only relative imports change; component logic, markup and snapshots remain unchanged. This keeps the surface below 500 lines without requesting a wider claim. Follow-up validation: TypeScript, focused ESLint, Prettier, emphasis lint and `pnpm gates` pass (no owned-file size warning). The two rejected paths have no net diff against the specified base. The moved composer is 210 lines; the row is 361 lines. Both-profile Command Center/scene-card e2e: **38 passed** (1.2 minutes), including axe scans. Pinned Command Center and `/scenes` visual comparisons: **24 passed** (44.5 seconds), with no baseline updates. Original Headroom output retrieved before recording these verdicts.

### Full visual gate follow-up

The operator's pinned full-suite run at `3b34e04d` passed 525 cases and failed six parchment/scholar overlay cases: rail palette, rail vault loading, and phone vault error. Exact original gate output and rendered diffs were inspected. Differences occupy rounded outer edges (41–63 pixels), exposing the updated Command Center/Screens background; dialog contents and geometry match. The first focused refresh passed 30 cases and updated eight PNGs (including the two empty-palette captures reached after the populated-palette assertion). The next full comparison passed 530/531; phone scholar vault-error still varied by 50 edge pixels.

Repeated checks confirmed that a baseline refresh alone was insufficient. The shell visual test now explicitly hides `#main-content` before vault captures and asserts its computed visibility. This isolates the independently covered workspace underneath the translucent scrim while preserving the complete dialog, shell and all screenshot tolerances. An initial inline screenshot-style experiment had no effect because the assertion does not apply that option; it was replaced with `page.addStyleTag`. The final 15-case shell refresh passed. Before/after captures were reviewed: only background visible around the dialog changes. Application source and visual thresholds remain unchanged.

Repeated pinned comparison passed **24/24** (47.9 seconds): parchment/scholar shell and palette on phone/rail, each repeated three times, with updates disabled. The full pinned comparison with `--update-snapshots=none --workers=4` completed **530 passed, 1 failed** (11.9 minutes). All original overlay failures and all Command Center cases passed. The sole failure was `visual-phone / join missing parchment`: its five-second `Campaign invite` visibility assertion expired while the startup screen still said “Loading your vault…”, before any screenshot comparison. The unchanged phone join spec then passed **15/15** (27.4 seconds), all five themes repeated three times with two workers and updates disabled. This supports a transient startup timeout, but the full run is not recorded as a clean pass. Snapshot budget remains within the existing cap: 816 files, 34576.6 KiB of 34816.0 KiB. Prettier and `pnpm gates` pass; the exact gate output has no owned-file size warning.

Reproduction for this follow-up:

```sh
bash apps/gm-react/tests/visual/run-in-container.sh shell-polish.spec.ts palette-help.spec.ts -g 'parchment|scholar' --project=visual-phone --project=visual-rail --repeat-each=3 --update-snapshots=none --workers=2
bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=4
bash apps/gm-react/tests/visual/run-in-container.sh join.spec.ts --project=visual-phone --repeat-each=3 --update-snapshots=none --workers=2
```

Full comparison log: `/tmp/rc-pol-final-full.log`, SHA-256 `a7d79907ebac6271ff78451c5c7f8fe5f5cf49aa0e55e7ecfb2bd4e06e0e2dbe`. Repeated overlay comparison log: `/tmp/rc-pol-isolated-repeat.log`, SHA-256 `f932b8c3ac2855150732bba1579a42c3c2ac3df7671d309da77a42ec79188f6a`. Exact original diagnostics were retrieved through Headroom; failure screenshots and refreshed overlays were visually inspected.
