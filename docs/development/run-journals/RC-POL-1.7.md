# RC-POL-1.7 — Player sheet (DM side)

Task branch implementation. No publication or dispatcher control edits.

## Work log

- Split actor-scoped projection, combat panel, level-up presentation and journal highlights to keep every owned source below 500 lines.
- Replace legacy spacing and type literals with design tokens and remove owned raw-style allowances.
- Add illustrated empty projection and visible dispatch pending/success/error feedback with EN/ES recovery copy.
- Validation results and explicit waivers are recorded below.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). — Spacing/radius/type literals migrated to DS tokens; owned raw-style allow-list entries removed. Structural one-pixel strokes, responsive breakpoint and fixed export-paper geometry are deliberate exceptions, not theme colors. Shared screen-kit Panel heading styling remains outside this ownership.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. — Preserves CharacterSheet.dc.html identity band, three-by-two abilities, 1:1.25 columns, raised combat panel and stacked phone reading order. Real data and existing editors replace fictional template samples; no fabricated spell statistics.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. — Combat panel uses --shadow-md and accent border; statistic tiles are sunken. Save/commit is primary within its editing region; secondary rest/inspiration controls remain neutral.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Owned screen text uses xs/sm/lg/xl tokens, display font only at xl. Numerical vitals and modifiers remain mono. Shared Panel typography is an existing DS exception outside owned paths.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. — Conditions use ConditionBadge icons; errors have warning icons and text; party health includes numbers and labels. Private journal banner uses purple DM-only tokens and hidden icon. Waiver: journal entries say Private rather than implying owner-private notes are invisible to their player owner.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. — Pinned comparison passed all 15 cases: 45 route/combat/empty-history snapshots cover five themes by three tiers, clipping shared shell chrome to fit the existing baseline budget.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — No owned animation added; shared DS handles named motion tokens and reduced-motion preferences.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists. — Empty projection uses characters-empty art; journal, quests, history, inventory/stash and spell lists now use their matching existing illustration keys. Class-resource and downtime/highlight empties retain icons because no specific illustration key exists. Pending persistence is visible; failed writes preserve input and give storage/retry guidance. Waiver: route loading and vault failure belong to App Boot/FailScreen before Player mounts; no player-specific loading/error illustration key exists.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state. — Dispatch enters Saving character before awaiting persistence and reports success or actionable failure. Portrait/export have busy feedback. Waiver: 100 ms is an interaction design target, not a claimed wall-clock measurement on this shared worker.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Journal removal, inventory removal and marching-order clear retain Undo. Added named confirmation for discarding a staged level-up; Cancel preserves the draft.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — Visible Saving character / Character saved status. A thrown storage failure leaves identity drafts intact and names storage plus retry; core rejections preserve their authoritative reason.
- [x] One clear route back; browser back works; Android Back follows the documented order. — Existing shell navigation and browser history retained. Rest and discard dialogs use shared Dialog Escape/Android-back/focus containment. Keyboard test records Enter to open rest, Escape and restored launcher focus.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). — Visible controls and DS button/input focus rings retained; portrait upload label enlarged to space-12. The sheet sets density and button minimums to space-12 (48px at default text); the rest-launcher bounds are asserted on both profiles. No hover-only or gesture-only action.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — Waiver: compact sheet keeps short/long rest and inspiration directly visible in its wrapping identity region for frequent table use. Print is the separate export action; no added overflow sheet that would bury rest controls. Large-text reachability is exercised.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — New saving/recovery, discard and all print/PDF labels have EN/ES entries. User content and the existing shared ruleset vocabulary (ability abbreviations and skill labels) remain verbatim. Waiver: stable Markdown history export format remains English for compatibility with the existing pure exporter contract.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. — Identity-edit guidance now uses HelpTip. Rest explains hit dice and preview controls explain read-only state. No surface-specific shortcut was added.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. — Final 12-case polish suite passed: all tabs, short/long rest, discard, empty projection, preview and save failure on both profiles. Register unchanged.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. — Automated keyboard walkthrough: focus Short rest, Enter, scan dialog, Escape, verify focus restored. Shared DS focus-visible styles retained; no native keyboard walkthrough is claimed.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. — Shell supplies the single SECTION_TITLES h1 and labelled navigation. Owned sections use h2; EmptyState is under a named h2. Print-only portal heading is hidden from screen accessibility tree.
- [x] Live regions announce operations; no announcement spam. — One visible persistence status region; HP replaces generic saved text with the operation result. Errors use alert; empty state is not a live region.
- [x] Screen-reader spot check on one platform noted. — Waiver: no native screen reader is available to this scheduled worker. Axe, role/name checks and keyboard focus tests are evidence, not a claimed auditory spot check.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. — 200% root text with phone viewport: rest Cancel and HP amount remain reachable. No new scroll container added.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — Writes continue through runtime.dispatch; actor-scoped core queries authorize the PC list, character, journal and party. Kind selection and pure derived statistics are not visibility filtering.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. — Preview guards hide edit/rest/portrait/level-up controls and disable HP/inspiration. New e2e checks core rejection directly.
- [x] Player projection of this surface verified through an actor read in an e2e. — New e2e imports listCharactersForActor in the browser and compares the visible selected PC with the preview actor read; attempted edit is rejected.
- [x] e2e on both profiles covers the primary task and one failure path. — Final completed batches passed (54 existing cases plus 12 polish cases): existing HP/rest/slots/portrait/level-up/equipment/stash/journal specs plus new injected storage failure and retry, on desktop and mobile.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. — Waiver: scripts/perf/capture.ts has no isolated Player sheet budget. No trustworthy before/after timing is claimed on a concurrently loaded worker. Projection memoization and core commands are preserved; no polling or additional route data fetch was introduced.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. — FEATURE-GAPS Player (DM-side) row now records implemented template/polish and the real history event-source limitation. No architecture or core contract moved.

## Validation

- Initial focused polish run: 8 passed (both profiles), including all-tab/rest axe and failure/retry.
- Broad surface run interrupted after editing localization triggered Vite HMR provider invalidation (`useI18n must be used inside I18nProvider`). This is not a passing gate; final verification restarts the server after source edits.
- Added named level-up discard confirmation and removed print/export literal-copy lint suppression; PDF body and footer now receive translated copy.
- Initial pnpm gates passed with no owned file-size warning. Final gates also passed; no warning names an owned path.

- App unit suite: 153 files / 1,715 tests passed.
- Final gm-react typecheck and owned-source ESLint passed (exit 0).
- Expanded first complete surface run: 64 passed, 2 failed. New discard-dialog assertions correctly caught an omitted `name` prop (title was “Discard ’s level-up?”). Added the named prop to WizardHeader; final dialog name/cancel/axe checks pass on both profiles.
- No Headroom tools are exposed in this session; all diagnostics above were read from original native command logs.

- Subsequent combined run: 65 passed, 1 failed. Axe caught a partially transparent mobile rest-dialog entrance frame. The test now awaits finite document animations before scanning the settled UI; final focused suite: **12 passed**. No axe rule or register exception added.
- Full `pnpm lint` passed: raw-style ratchet, ESLint, boundary, emphasis and five-theme non-text contrast. The colocated Spanish print test now sets locale through the platform preference adapter rather than direct storage access. Removed the three owned small-display-face allowances as well as all 12 raw-style allowances.
- `pnpm test:tooling`: **228 passed** (30 files).
- Print/export suite: **3 passed**, including existing English rasterized PDF baselines, one-page long Unicode content, and Spanish labels/export feedback.
- All **27 owned text files** are below 500 lines. Largest: LevelUp.tsx 492; index.tsx 429; Journal.tsx 424; Resources.tsx 415; Vitals.tsx 389.
- Initial pinned visual regeneration: **15 passed**, producing 30 route/combat captures across five themes and three tiers. Global baseline budget: 507 files / 32,372.2 KiB of 32,768 KiB. Visual review covered desktop parchment identity/columns, tavern combat, rail dungeon, phone scholar, and phone high-contrast combat. Review caught the narrow HP input: widened it and adopted the 48px density input token; final regeneration/comparison passed (see final results).

## Reproduce

```sh
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/player-polish.spec.ts --workers=2
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/character-sheet-template.spec.ts tests/e2e/character-rest.spec.ts tests/e2e/character-resources.spec.ts tests/e2e/character-levelup.spec.ts tests/e2e/character-history.spec.ts tests/e2e/character-journal-downtime.spec.ts tests/e2e/equipment.spec.ts tests/e2e/party-stash.spec.ts --workers=2
pnpm --filter @dndtools/gm-react exec playwright test --config src/app/character/print.playwright.config.ts --workers=1
bash apps/gm-react/tests/visual/run-in-container.sh player-polish.spec.ts --update-snapshots=none --workers=2
pnpm --filter @dndtools/gm-react typecheck
pnpm lint
pnpm gates
node apps/gm-react/tests/visual/check-baseline-budget.mjs
```

- Final combined browser rerun was terminated with exit 143 after **60 passed / zero assertion failures** (54 existing surface cases plus six desktop polish cases). This is not recorded as a completed gate. Final acceptance uses separate completed surface and polish batches.
- Final focused polish batch after touch-target changes: **12 passed** on both profiles. The HP input and rest launcher both meet 48px bounds; all tabs and overlays are axe clean after animations settle.
- Final illustration audit added the available journal, quest, inventory, spell and timeline art to the secondary empty panels. Matching final browser and visual checks passed (see final results).

## Final results

- Existing surface suite: **54 passed**, desktop + mobile, completed exit 0 after the illustration changes.
- Polish suite: **12 passed**, desktop + mobile, completed exit 0 after the illustration changes. Covers settled axe scans of every tab, both rest dialogs, named discard confirmation, empty projection, preview projection/read-only rejection, failed storage write with preserved draft and successful retry, keyboard focus restoration, large text and 48px input/button targets. Register unchanged.
- Print/export: **3 passed**, including both original PDF snapshots and Spanish output/feedback.
- Pinned visuals: **15 passed** with `--update-snapshots=none`, checking **45 snapshots** (sheet viewport, full combat panel, illustrated empty history × five themes × three tiers). The first addition of the empty-history captures reported missing expectations and wrote the baselines; that run is not counted as a passing comparison. The subsequent comparison passed. Reviewed final phone parchment combat and phone scholar/desktop dungeon empty history as well as the representative filled captures recorded above.
- Baseline budget: **522 files, 32,570.4 KiB / 32,768 KiB**; no per-file overage.
- Final owned-source ESLint, gm-react typecheck, formatting and whitespace checks passed. Full lint (including boundary, emphasis, non-text contrast), app unit suite (1,715 tests) and tooling suite (228 tests) passed during this task.
- Final `pnpm gates` passed; **no file-size warning names an owned path**. All 27 owned text files remain below 500 lines; largest is LevelUp.tsx at 492. Unrelated existing warnings remain outside ownership.
- No push, promotion, additional loop/agent, or dispatcher control-state edit. Central independent review and integration remain the operator's next step.

## Scope-only retry — 2026-10-03

- Previous gate feedback: `candidate changes paths outside its claim: docs/design-package/templates/character-sheet/IMPLEMENTATION.md, scripts/emphasis-baseline.json`.
- The revised task explicitly owns both named paths. Retained their intended changes from implementation commit `19c4d8b7bfe92120a0dead1f555b9aabdeae685e`: the template implementation document describes the five-theme/three-tier snapshot coverage; the emphasis baseline removes only the obsolete small-display-face allowances for LevelUp, Vitals and Player. No dispatcher claim or other control state was edited.
- Started this retry with a clean worktree at that implementation commit. Application code, tests and snapshots remain unchanged; this retry adds only this journal record. The browser, axe, print and pinned-visual results above remain prior-run evidence, not newly executed tests. The reported rejection was ownership-only, so those unchanged suites were not repeated.
- Fresh `pnpm gates`: exit 0, with **zero owned-file size warnings**. All 27 owned text files remain below 500 lines; LevelUp.tsx remains the largest at 492 lines.
- Fresh `pnpm lint:emphasis`: exit 0; existing baseline warnings remain. Fresh visual baseline budget check: exit 0, **522 files / 32,570.4 KiB of 32,768 KiB**.
- Headroom tools are still unavailable; verification used original native command output. Central scope validation and independent review remain operator-run gates; this entry does not claim those remote stages passed.
