# RC-POL-1.15 — Community polish

Task branch: current centrally scheduled task branch. Scope is the Community surface and the catalogs, fixtures, visual evidence, inventory and lint ratchet needed to verify it. No push, promotion, other loop, or dispatcher control-state edit.

## Inspection and changes

- Initial working tree was clean; no repository AGENTS.md was found. Dispatch Headroom tools are unavailable in this session, so original command logs were read directly.
- Discover (648), Publish (613), Wiki (647) and shared (691) exceeded 500 lines. Extracted DiscoverShelf, Ratings, WikiPreview and the publish/wiki model hooks; commands, server filtering and exported helper contracts remain intact.
- Replaced raw spacing/radius and dense fixed typography with existing DS tokens; removed all seven Community raw-style allow-list entries. Existing structural borders and intrinsic column widths are the narrowly scoped exception below.
- Added illustrated unavailable/empty/error states, corrected EN/ES file-sharing copy and blocked all Community writes while previewing as a player.
- Axe caught marginal parchment preview contrast (4.49:1); using secondary text fixes it. Preview-gate heading order was corrected with Page/Panel. A transient dialog-animation scan was fixed by waiting for finite animations before axe, without suppressing rules.
- Visual review caught the nonnumeric theme name wrapping inside a large mono Stat on phone/rail. It is now a theme badge; eligibility remains a numeric Stat.

## Embedded §20.2–§20.5 checklist

A checked item is dispositioned below as PASS or an explicit scoped WAIVER; waivers do not claim unperformed checks.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
  - PASS for DSN-1.1: zero Community raw-style allowances remain; focused ESLint is clean. Scoped waiver for structural 1px borders, the access-radio 2px outline, and intrinsic grid/flex widths: the DS has no semantic border-width or shelf-column token. All spacing, radii, colors and typography now use existing tokens; no hex/rgba literals.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
  - WAIVED prototype parity: README §4 names a private DesignSync source, but no DesignSync tools or vendored Community template are available in this task. Preserve the existing four-tab structure and DS Page/Panel composition; document the intentional illustrated local gate, small-title Inter, and text theme badge here.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
  - PASS: export/install/publish remain the single primary action in their respective regions; selected detail uses the existing accented Panel/shadow. Supporting shelf cards remain flat until selected. Scholar intentionally uses its theme accent rather than hardcoded gold.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
  - PASS: dense UI now uses xs/sm/base, with lg reserved for the wiki preview title; no small Cinzel remains. Counts, byte metadata/code and eligibility figures keep mono; the nonnumeric theme name is now a badge, fixing narrow-tier word splitting.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
  - PASS: DS Badge supplies status icons; the export DM-only control keeps its purple privacy badge/border and explicit label. Selection/rating state also has aria-pressed/aria-checked, not color alone.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
  - PASS: dedicated Community visual suite covers all five THEME_PRESETS on desktop/rail/phone, two element-cropped states per pair: the illustrated local-only gate and an installed listing's Ratings (star radiogroup, note, review list). Scoped WAIVER for whole-tab/overlay baselines: loop/rc `acde3cf9` already holds 31,880.7 of the 32,768 KiB `check-baseline-budget.mjs` cap, and whole-tab captures of Export/Wiki/populated shelf cost 50–100 KiB per theme and tier (the six-state full-page set was 9.2 MB). Those tabs and the install review stay covered by the strict-axe e2e specs on both profiles. See matrix below.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
  - PASS by source review: no new animation is introduced. Loading uses the shared Skeleton/LoadingRegion reduced-motion contract. Overlay scans wait for finite entrance animations to settle, avoiding transient alpha-composited contrast readings.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.
  - PASS: community-empty, search-none, publish-empty and connection-lost are wired to their corresponding states. Loading retains announced skeletons; the illustration registry has no loading key. Local-only copy explains the working Export/file fallback.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
  - PASS: buttons use existing busy/disabled labels, loading regions and Toaster/inline completion; the search field updates synchronously while its existing 250ms server-query debounce preserves focus. Retry and install/rating completion are exercised in the browser.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
  - PASS: remove/unpublish dialogs name the listing/wiki and require explicit confirmation. Install review names the package/files before core dispatch. Removal Escape/cancel restores focus in both profiles.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
  - WAIVED auto-save indicator: this surface has explicit export/install/publish actions, not auto-persisted editors. Drafts are intentionally local until Publish; completion and failure use existing toasts/inline results. Network recovery copy names Retry/connection checks.
- [x] One clear route back; browser back works; Android Back follows the documented order.
  - PASS for browser route/overlay ownership: shell navigation remains unchanged; dialogs keep the shared Back/Escape close contract. The new preview gate tells the user to exit preview. Native Android hardware Back is waived: this task runs Chromium mobile, not an attached Android device, and changes no Back handler.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
  - PASS by source review and keyboard specs: no action requires hover/gesture; DS controls retain density touch sizing. Custom rating radios now use max(44px, density touch target) on both axes; browser bounds assertions verify the 44px minimum on both profiles. Native 48dp measurement is waived without an Android device; no shared density contract changed.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
  - WAIVED extra compact top-bar action: Community has mutually exclusive tabs and region-specific operations, with no honest universal action. Preserve the shell toolbar and existing bounded DS overlays rather than duplicate a tab-specific action in the global header.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
  - PASS: user-facing new copy goes through t(); EN and ES now describe module-file sharing from Export and the player-preview gate. Existing remote/core rejection messages remain authoritative service text, not newly introduced UI literals.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.
  - WAIVED additional HelpTip: existing inline text explains portable/private export, install review, access modes and rating eligibility at the point of use; duplicating it in a tooltip would hide information on touch. No new shortcut or non-obvious control was added.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
  - PASS for reachable route/overlays: strict zero-violation axe assertions on both profiles cover all local tabs, populated discovery, saved rating, failure/retry/empty states, package install, module-file install, removal confirmation and preview gate; register untouched. Scoped waiver for authenticated Publish/Wiki server dialogs: isolated e2e deliberately has no account/backend, so those controls do not mount. Existing fail-closed e2e plus Wiki component tests cover that boundary; no production-service credentials or live publication are used.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
  - PASS: recorded automated keyboard walkthrough focuses Discover, presses ArrowRight into Export, verifies focus/panel; removal dialog Escape restores focus to Remove listing. Preview hides write controls and returns to tabs after exit. Focus styling is inherited from unchanged DS controls.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
  - PASS: AppShell remains the single SECTION_TITLES h1; Community Tabs/search/ratings have accessible names and proper panel relationships. Preview gate is inside Page/Panel (h2), preventing the h1-to-h3 skip caught during axe validation.
- [x] Live regions announce operations; no announcement spam.
  - PASS: LoadingRegion announces loads, result count uses polite live output, and completion goes through existing Toaster. Empty illustrations remain decorative and are not made live regions.
- [x] Screen-reader spot check on one platform noted.
  - WAIVED human screen-reader spot check: no screen reader/audio platform is attached to this unattended implement task. Do not mislabel axe/DOM assertions as a spoken-output check. Semantic roles, keyboard focus and zero-violation automated scans are committed reproducible evidence; human AT review remains a release review item.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.
  - PASS: the new browser case doubles root font size (200% large text), visits all four tabs and asserts document width stays within the viewport on both profiles. No new scrolling region was added. Rail/phone visual review also caught and fixed the oversized theme stat.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
  - PASS: local vault writes still use runtime.dispatch; the refactor moves commands intact into model hooks. Discovery filtering stays server-side. Wiki page bodies/fields come from the actor-filtered core read; its visibility-labelled eligibility count is not the security boundary. Cloud listing CRUD remains in the existing app-api client, not a core-state mutation.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
  - PASS: Community checks runtime.readOnly before mounting any write surface, covering remote writes as well as local ones. Both browser profiles prove controls disappear and an attempted content.export command is rejected while previewing.
- [x] Player projection of this surface verified through an actor read in an e2e.
  - PASS: module-file e2e invokes getContentItemsForActor for actor-player in the browser, verifies visible note titles are in the portable bundle, and separately proves seeded DM-only titles are absent. Wiki component tests verify projected bodies/fields and secret-stripped recap input.
- [x] e2e on both profiles covers the primary task and one failure path.
  - PASS: both profiles exercise real module export/install, discovery install/rating, fail-closed publish/wiki, and a failed discovery request that recovers through Retry to the illustrated empty shelf. All service fixtures use the reserved .invalid origin.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
  - WAIVED before/after performance budget: ENG budget registry has no Community-specific entry and no trusted pre-change timing capture exists. Do not invent a baseline from functional-test wall time. This change adds no fetches or unbounded work, keeps the existing search debounce/server filtering, and separates rendering without changing command/query algorithms; final browser timings are reported only as test duration.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.
  - PASS: FEATURE-GAPS Community row now names the polish and focused specs. No API/schema/architecture contract moved; model/render extraction requires no ADR. All owned files are below 500 lines and gates has no Community warning.

## Snapshot review matrix

All baselines are generated by the pinned Playwright container, never host rendering. `community.spec.ts` uses fixed time, seeded randomness, deterministic entity IDs, reduced motion and font readiness, and crops each capture to its element (`tabpanel`, the `Ratings` region) so shell changes elsewhere don't churn these files. The isolated marketplace fixture is shared with the functional suite; the visual test seeds one installed, rated listing.

| Theme / tier            | Discover gate                                                                                                       | Ratings                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| tavern / desktop        | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-discover--tavern.png)        | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-ratings--tavern.png)        |
| tavern / rail           | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-discover--tavern.png)           | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-ratings--tavern.png)           |
| tavern / phone          | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-discover--tavern.png)          | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-ratings--tavern.png)          |
| parchment / desktop     | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-discover--parchment.png)     | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-ratings--parchment.png)     |
| parchment / rail        | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-discover--parchment.png)        | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-ratings--parchment.png)        |
| parchment / phone       | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-discover--parchment.png)       | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-ratings--parchment.png)       |
| scholar / desktop       | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-discover--scholar.png)       | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-ratings--scholar.png)       |
| scholar / rail          | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-discover--scholar.png)          | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-ratings--scholar.png)          |
| scholar / phone         | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-discover--scholar.png)         | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-ratings--scholar.png)         |
| dungeon / desktop       | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-discover--dungeon.png)       | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-ratings--dungeon.png)       |
| dungeon / rail          | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-discover--dungeon.png)          | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-ratings--dungeon.png)          |
| dungeon / phone         | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-discover--dungeon.png)         | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-ratings--dungeon.png)         |
| high-contrast / desktop | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-discover--high-contrast.png) | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-desktop/community-ratings--high-contrast.png) |
| high-contrast / rail    | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-discover--high-contrast.png)    | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-rail/community-ratings--high-contrast.png)    |
| high-contrast / phone   | [discover gate](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-discover--high-contrast.png)   | [ratings](../apps/gm-react/tests/visual/__screenshots__/visual-phone/community-ratings--high-contrast.png)   |

## Validation

Re-verified after rebasing onto loop/rc `acde3cf9` (the earlier commit's base, `2d9f566d`, was 115+ commits behind and conflicted in FEATURE-GAPS and the raw-style allow-list; both resolved by keeping loop/rc's content and re-applying only the Community row and the removal of the Community allowances). The first attempt's 90 full-page baselines were stale on the new base (new Help launcher, "Game master" account label, panel-header density) and would have put the set at 38.9 MiB, over the 32 MiB cap, so they were replaced by the element-cropped set above.

Results on `acde3cf9`, read from the full command logs (every command below exited 0):

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/community-discover.spec.ts tests/e2e/community-publish.spec.ts tests/e2e/community-polish.spec.ts tests/e2e/module-file.spec.ts tests/e2e/wiki.spec.ts tests/e2e/wiki-v2.spec.ts --workers=2`: 36 passed (38.3s), desktop-chromium and mobile-chromium. This covers the strict zero-violation axe scans of the route and its overlays, the player-actor export check, the preview-as-player gate, the 200% text case and the 44px rating-target bounds.
- `npx vitest run --config vitest.app.config.ts apps/gm-react/src/screens/community apps/gm-react/src/i18n apps/gm-react/src/app/screen-kit-loading-region.test.tsx`: 6 files, 78 tests passed (includes the i18n key-parity and vocabulary-lock tests against loop/rc's reworked EN/ES catalogs). Run it from the repo root; from `apps/gm-react` the loading-region scan resolves paths wrongly.
- `pnpm --filter @dndtools/gm-react typecheck` and focused ESLint (community sources, the Community e2e/visual specs, i18n, the raw-style rule): exit 0.
- `pnpm feature-audit`: 46 declared limits (0 stale), including the edited Community row.
- `pnpm gates`: exit 0; zero `screens/community` lines in the log (the remaining file-size warnings are session/index.tsx and settings/AiProvider.tsx, not owned here). Largest owned file: Discover.tsx, 464 lines.
- `apps/gm-react/tests/visual/run-in-container.sh community.spec.ts --update-snapshots=none`: 30 passed (38.0s) on a fresh compare after regenerating.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: 390 files, 32,436.7 KiB of 32,768.0 KiB (Community adds 30 files, 556.1 KiB).
- No other visual spec captures `/community`, so no existing baseline changes.

Limitations still scoped in the checklist above, not reported as passes: human screen-reader check, native Android Back/48dp, DesignSync prototype parity, before/after perf budget, and whole-tab/overlay visual baselines (budget).
