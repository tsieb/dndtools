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

## Integration reconciliation — 2026-10-03

- Rebased onto the requested integration commit `532ad0830d70286a0b09e12b6e92c691011a9aed`. Preserved integration's scene-editor emphasis allowance removals and removed only the three obsolete Player/LevelUp entries from that baseline.
- Resolved six binary Player snapshot conflicts provisionally using this task's owned-content captures; regenerating all 45 Player captures against the reconciled source in the pinned container. Unrelated integration snapshots are retained.
- Earlier validation above describes the original implementation. Fresh post-rebase validation is recorded below as it completes.
- Fresh pinned regeneration: **15 passed**, exit 0; all 45 Player PNGs are byte-identical to the task captures. Fresh comparison with `--update-snapshots=none`: **15 passed**, exit 0. Reviewed desktop parchment identity/columns and phone high-contrast combat; no integration-induced content regression. Baseline budget passes: **598 files / 30,336.9 KiB of 32,768 KiB**.
- Fresh `pnpm gates`, `pnpm lint:emphasis` and gm-react typecheck passed (exit 0). Gates contains zero owned file-size warnings; the largest owned source remains LevelUp.tsx (492 lines).
- Full `pnpm lint` was terminated with exit 143 during ESLint, after the raw-style count passed; this is not a completed lint gate. Running scoped ESLint and the remaining boundary/contrast checks separately.
- Fresh focused polish/axe suite: **12 passed**, desktop + mobile, exit 0. Route tabs and rest/discard overlays remain axe clean; failure/retry, preview authorization, keyboard restoration and large-text/touch checks passed.
- Fresh scoped ESLint, boundary lint and five-theme non-text contrast passed (exit 0; 319 contrast pairs plus 16 forced-colors checks). Confirmed all **27 owned text files** remain below 500 lines.
- Fresh existing surface suite: **54 passed**, desktop + mobile, exit 0. Confirmed the requested integration commit is an ancestor of this task branch. Snapshot changes relative to integration are limited to the 45 Player captures; emphasis JSON differs only by the three intended owned allowance removals.
- Fresh print/export suite: **3 passed**, exit 0, including original rasterized PDFs, long Unicode content and Spanish output. Formatting and `git diff --check` pass. No application changes were needed after rebase; binary regeneration confirmed the selected captures. Reconciliation changes and this fresh evidence are committed on the task branch; independent central review remains pending. No push, promotion, new loop/agent or dispatcher state edit.

## Full visual-gate repair — 2026-10-03

- Read the original central gate log for run `42906608-9c69-430c-be4d-78852fbb4d94`: 429 cases passed and nine `/play` golden-route comparisons failed, covering three themes across all three tiers. The earlier focused Player comparison did not cover this shared-component consumer.
- Traced the changed Party vitals tile to `/play` Home's import of `PartyBoardTiles` from the owned `app/character/PartyPanel.tsx`. This task intentionally converted its padding, spacing and radius to design tokens; the old consumer baselines still show the previous inset/height. Reviewed expected and actual desktop tavern captures: the difference is confined to the party tile and consequent panel position, with content retained.
- Regenerating only those nine affected consumer baselines, then running the complete pinned visual comparison. No application behavior or visual threshold change is needed. Headroom is unavailable; diagnostics are from original native output.
- Targeted regeneration completed: **9 passed**, exit 0. Exactly nine `/play` PNGs changed; no test assertions or application source changed. Reviewed the regenerated phone parchment layout as well as the desktop tavern before/after; party information and controls remain readable.
- Fresh quality gates pass with zero owned-file size warnings. Snapshot budget passes at **598 files / 30,410.7 KiB of 32,768 KiB**. Formatting and whitespace checks pass. Application code is unchanged from the prior retry's passing 66 surface/polish and three print tests; those browser tests are prior-run evidence, not rerun in this baseline-only repair.
- Reproduction for this shared-component change must include the complete consumer suite, not only `player-polish.spec.ts`: `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`.
- Complete pinned visual comparison: **438 passed (8.2m), exit 0**, with `--update-snapshots=none --workers=2`. This includes all nine previously failing `/play` comparisons plus the Player five-theme/three-tier cases. Read the original completed log at `/tmp/rc-pol17-full-visual.log`; no compressed output or baseline-update run is used as comparison evidence.
- Repair scope: nine consumer PNG baselines and this journal only. No push, promotion, dispatcher control edit or additional agent/loop. Central independent validation remains operator-run.

## Requeue after ci-recovery — 2026-10-03

- Read the original App tests log for run `a1419dc5-cc7e-4580-8c3d-d576d5218735`: two failures, both from a stale DEV pseudo-locale catalog. `pseudo.test.ts` "matches the current source catalog exactly" and `i18n/index.test.ts` "loads the DEV pseudo locale" both lacked this task's new `player.levelUp.discard*`, `player.print.*`, `player.saved`/`saving`/`saveFailed` keys. This was caused by this task, not by the inherited base.
- Rebased onto integration `879489ab` (join-first player view, portaled Dialog stacking). Conflicts: (1) `no-raw-style-values.allow.js`. Kept the integration's `screens/play/Home.tsx: 10` entry and this task's removal of the Player and character allowances. (2) Nine `/play` golden PNGs from the earlier consumer refresh. Took the integration versions, because `/play` is now join-first and no longer renders the Party tile; the full comparison below confirms they match.
- Regenerated `src/i18n/dev/qps-ploc.ts` with `tsx scripts/i18n-catalog.ts pseudo` (+22 generated entries, manifest companion path) and ran prettier on it.
- Fresh `pnpm test:app`: **161 files / 1773 tests passed**, exit 0. Fresh `pnpm test`: 31 files / 245 passed, exit 0.
- Fresh `pnpm gates` exit 0 with zero owned file-size warnings; the largest owned file is still LevelUp.tsx at 492 lines. Full `pnpm lint` (raw-style count, ESLint, boundary, emphasis, non-text contrast 319 pairs) exit 0. gm-react typecheck exit 0. `format:check:changed --base loop/rc`: 31 files clean.
- Complete pinned visual comparison (`run-in-container.sh --update-snapshots=none --workers=2`): **456 passed, 3 failed** (15.2m). All `/play` and Player cases passed. The three failures were `palette-help.spec.ts` (desktop scholar/dungeon, rail parchment), each timing out on `Help` dialog `getByText(/Version /)`. The failure screenshot shows "Version 0.3.7" rendered, so this is a load race and not a pixel diff. This diff does not touch Help/palette code. Isolated rerun of `palette-help.spec.ts` in the pinned container: **15 passed**, exit 0.
- Fresh surface e2e (player-polish + 8 character/equipment/stash specs), desktop-chromium + mobile-chromium: **66 passed**, exit 0. This includes axe on the route tabs and the rest/discard overlays. Print/export suite: **3 passed**, exit 0.
- Snapshot set: 664 files / 32,278.5 KiB (under the 32,768 KiB budget).
- Headroom tools were not used; all results above come from the original native logs under `/tmp/rc-pol17-*.log` and `/tmp/rcpol17-*.log`. No push, promotion, loop or dispatcher-state edit.

## Visual-gate retry at 6588af9a — 2026-10-03

- Read the original central log for run `42b34848-458f-43b8-bf3f-5a3ee4c76ac1`: **454 passed, 5 failed** (15.3m; the same suite took ~8.8m in earlier runs that day). All five failures were 5-second timeouts with no pixel diff: `characters-polish` empty tavern/parchment (desktop; illustration not yet rendered), `/audio Automation` scholar (desktop; screenshot not stable within 5s), and `palette-help` high-contrast (rail, phone; Command palette dialog not found or not stable). None are Player or `/play` cases. In my previous full run at this same tree, all five passed and the only failures were three different `palette-help` cases.
- Fleet load at the time: load average 11.8/14.3/14.6 on 16 cores. Another task's concurrent visual run (`b8e6730e-…`) failed the same way, a 5s `toHaveScreenshot` timeout on the `Local vaults` dialog in `shell-polish`. `/characters`, `/audio` and the palette do not import from `app/character` or `screens/player`.
- Fresh pinned rerun of every spec that failed (`characters-polish.spec.ts palette-help.spec.ts golden-routes.spec.ts --update-snapshots=none --workers=2`): **243 passed, 0 failed** (7.6m), exit 0. That covers all five tests that failed above.
- No code, test or snapshot change; this retry adds only this journal entry. These five timeouts are load flakes in specs outside this task's claim. Retiming them is left to their owners rather than raising timeouts here. Results come from the original native logs (`/tmp/rc-pol17-visual-rerun3.log`). No push, promotion, loop or dispatcher-state edit.

## Browser-acceptance repair — 2026-10-04

- Read the original central log for run `a28904f2-d372-430d-bc32-a75455d3f6c7` (`pnpm e2e --workers=2 --retries=2`): 1718 passed, 1 failed, 1 flaky. Both bad results were `responsive.spec.ts:1210` "200% large text keeps every route whole on the rail tier". It failed on every attempt on desktop-chromium and on two of three on mobile, each time with `/player with 200% large text widened #main-content` (scrollWidth 712 > clientWidth 704 + 1). This was caused by this task.
- Cause: the Equipment tab laid out its item list and its Encumbrance/Currency column as a `1.4fr 1fr` grid inside the sheet's right column. This task's px→token conversion turned the coin rows' gaps and padding into rem values that double at 200% text, and the 48dp IconButtons are 96px wide at that size. That raised the side column's content minimum to 308px. A grid `fr` track cannot shrink below its content, so the item column fell to 34px and the grid pushed 8px past the pane. Measured with a temporary probe spec, now deleted. The same probe showed the item list already squeezed below its own 226px content minimum (149px) at 768px with normal text.
- Fix (`screens/player/Equipment.tsx`): a wrapping flex row. Each column grows from a zero basis at 1.4 : 1, with minimums of `min(100%, 14rem)` and `min(100%, 11.5rem)`, set from the measured normal-text content minimums. The item Panel sits in an unpadded wrapper so its padding does not skew the split. Re-measured: 1024/1280/1440 at normal text give 277/198, 295/211 and 316/226, the same as the old grid. 768 at normal text and 768/1280 at 200% text now stack, and `#main-content` is no longer wider than its pane (704/704, 1016/1016). The `useViewport` phone special case is no longer needed: narrow panes stack on their own. Equipment.tsx is 393 lines.
- Fresh focused run (`responsive.spec.ts player-polish.spec.ts equipment.spec.ts party-stash.spec.ts character-sheet-template.spec.ts`), desktop + mobile: **204 passed**, exit 0. This includes every 200% zoom and large-text tier and the Player axe/overlay checks.
- Fresh pinned Player visual comparison (`player-polish.spec.ts --update-snapshots=none`): **15 passed**, so no baseline change is needed (the Equipment row sits below every captured region).
- Fresh `pnpm gates` exit 0 with zero owned file-size warnings. Full `pnpm lint` exit 0, gm-react typecheck exit 0, `format:check:changed --base loop/rc` clean, `pnpm test:app` **161 files / 1773 tests passed**.
- Fresh full browser acceptance with the gate's own command (`DNDTOOLS_E2E_PORT=5795 pnpm e2e --workers=2 --retries=2`): **1719 passed, 1 flaky, 32 skipped, 0 failed (1.0h), exit 0**. The flaky test is `help-menu.spec.ts:32` (desktop, phone-footer Help trigger), which failed once and passed on retry. It belongs to the integration's Help dialog work and is outside this surface.
- Results come from the original native logs (`/tmp/rc-pol17-resp.log`, `/tmp/rc-pol17-pv.log`, `/tmp/rc-pol17-full-e2e.log`). No push, promotion, loop or dispatcher-state edit.

## Operator-requested integration reconciliation — 2026-10-04

- Rebased all eight task commits onto current local `loop/rc`, `9a7b675d6db835d082638a27f978de94f014970d`. Resolved FEATURE-GAPS from the complete upstream file and replaced only the Player (DM-side) row with this story's row; every other upstream byte is preserved.
- Nine conflicting Player route PNGs retain the task captures pending fresh pinned comparison. No unrelated baseline was selected from the task over upstream. The previous equipment large-text repair and generated pseudo-locale entries remain present.
- Headroom is unavailable in this session. Fresh validation uses original native logs; earlier entries remain prior-run evidence. Results follow below.
- Fresh combined surface suite: **66 passed**, desktop + mobile, exit 0 (`/tmp/rcpol17-oct04-surface.log`). Includes route/tab and rest/discard overlay axe scans, failure/retry, actor authorization, keyboard restoration and large-text reachability.
- Fresh pinned Player comparison: **15 passed**, exit 0, `--update-snapshots=none --workers=2` (`/tmp/rcpol17-oct04-visual.log`), checking 45 snapshots across five themes and three tiers. All retained conflict snapshots match the rebased app; no regeneration required. Reviewed desktop parchment identity/columns and phone high-contrast combat. Global baseline budget passes: 744 files / 32,231.8 KiB of 32,768 KiB.
- Fresh `pnpm gates`, gm-react typecheck and scoped ESLint pass (exit 0). Gates reports zero owned-file size warnings. All 26 TS/TSX/CSS source files are below 500 lines (largest: LevelUp.tsx, 492); the additional Markdown source-directory file is also below 500 lines.
- Initial changed-file formatting check caught the restored Player row's old column padding; Prettier corrected only that row. Fresh formatting and whitespace checks pass, and an exact comparison confirms every non-Player byte still matches integration.
- Owned application source is byte-identical to the pre-rebase task tip `5732f742`. Full-repository browser, unit and visual results earlier in this journal remain prior-run evidence; this retry reran the affected surface and leaves independent central gates to the operator.
- Fresh regression for the previous acceptance failure: `responsive.spec.ts -g '200% large text keeps every route whole on the rail tier' --workers=2`: **2 passed**, both profiles, exit 0 (`/tmp/rcpol17-oct04-responsive.log`).
- Reconciliation and fresh evidence committed on the current task branch. No push, promotion, new agent/loop or dispatcher control-state edit.

## Complete visual-gate retry — 2026-10-04

- Read the original central gate log for `e83e7f23-99cc-4cbc-8d99-743560c05c42` at candidate `7e4c9d4f`: **485 passed, 4 failed** (14.2m). All four failures exhausted a 5-second wait: desktop empty-roster dungeon illustration, desktop high-contrast graph screenshot, rail dungeon audio error screenshot, and rail dungeon companion-stage screenshot. No pixel-difference assertion was reported; every Player case passed. The roster error context still showed the route's “Loading your vault…” status.
- `git rebase loop/rc` confirms the current branch is already up to date with `9a7b675d6db835d082638a27f978de94f014970d`; the previously verified FEATURE-GAPS reconciliation is retained. Worktree was clean at retry start.
- Headroom remains unavailable. Running the complete pinned suite with the central command (`bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`) and reading original output at `/tmp/rcpol17-visual-retry-oct04.log`. No timeout, screenshot tolerance, application code or baseline changed.
- Complete pinned comparison: **489 passed (10.8m), zero failures, exit 0**. All four previously failing cases passed unchanged, as did all Player theme/tier cases. The completed original log was read directly. This supports transient timing failures in the previous run; it does not claim their underlying timing sensitivity has been repaired.
- Fresh `pnpm gates`: exit 0, zero owned-file size warnings (`/tmp/rcpol17-retry-gates.log`). Exact comparison again confirms every non-Player FEATURE-GAPS byte equals current integration. Formatting and whitespace checks pass.
- This retry changes only this journal. The application tree is unchanged from `7e4c9d4f`, whose 66 surface/axe tests and two large-text regression tests passed in the preceding retry. Those results remain prior-run evidence. No push, promotion, extra agent/loop or dispatcher control-state edit.
