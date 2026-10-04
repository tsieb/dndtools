# RC-POL-1.23 — App shell polish

## Scope

AppShell, sidebar, rail, tabs, top bar, footer and shared vault dialog. Supporting EN/ES
copy, regression specs and pinned visual baselines belong to this change. No Headroom tools
are available; validation uses original local output. No dispatcher changes or remote delivery.

## Implementation

- Replaced undersized display type in the top bar with the sans heading token; secondary
  header text now uses the stronger secondary color. Added target floors to rail vault,
  desktop search and shared navigation rows.
- Extracted translated presence text from rows.tsx; translated scene statuses, pin actions,
  reorder announcements and scene-card shortcut feedback into EN/ES.
- Lazy vault opening now immediately shows a dismissible labelled loading dialog.
  Vault errors use actionable localized copy, while save/open progress has a live region.
- Every original owned file was below 500 lines; retain that boundary.

## Embedded §20.2–§20.5 checklist

Checked means reviewed and either verified or explicitly waived in the evidence below; waived checks are not claims of execution.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
- [x] One clear route back; browser back works; Android Back follows the documented order.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
- [x] Live regions announce operations; no announcement spam.
- [x] Screen-reader spot check on one platform noted.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
- [x] Player projection of this surface verified through an actor read in an e2e.
- [x] e2e on both profiles covers the primary task and one failure path.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.

## Checklist evidence and scoped exceptions

### Design fidelity (§20.2)

- DS composition: shared NavRail, BottomTabBar, Dialog, Sheet, Icon, Button, Avatar,
  Badge and status controls retained. Shell spacing and radii migrated to existing tokens;
  eight allowlist entries removed. Remaining literal geometry is a scoped waiver: navigation
  widths/breakpoints, safe-area/viewport calculations, decorative hairlines and existing dense
  caption sizes preserve shared layout contracts. No new color literals or style allowances.
- Prototype: DesignSync is unavailable in this session. Waive a fresh remote comparison;
  retain the shipped 264px sidebar / 64px rail / phone tabs composition documented in
  AppShell and docs/design/README.md §4. The live application’s extra vault and session
  controls are intentional functional extensions.
- Emphasis: navigation stays sunken/flat, dialogs retain DS elevation, selected navigation
  retains its accent icon and marker. Primary workspace panels belong to their screens.
- Type: top-bar h1 now uses 24px-equivalent sans token; no undersized Cinzel added.
  Waive a wholesale micro-caption/brand/number typography rewrite: compact navigation counts,
  presence sentences and the shared BrandLockup retain their established metrics. The
  top-bar shortcut remains mono. This avoids changing the cross-surface density contract.
- Status: text labels and icons accompany live, draft, backup and error states. Existing
  Core-projected visibility labels and lock shapes remain. No new DM-only content is introduced.
- Five-theme, three-tier shell and overlay baselines updated and reviewed; strict full-suite result is recorded below.
- Named motion tokens retained; reduced-motion tests use the production media preference.
- Shell navigation is always present; no invented empty/loading screen blocks navigation.
  Vault catalog always contains the legacy campaign on a valid device; a malformed catalog
  fails closed. Lazy vault loading is visible and dismissible; catalog errors explain recovery;
  busy/save feedback has a status region. Illustration inventory has no vault-loading/error
  key, so these use campaign/warning icons. Queue-empty feedback names the next action.

### Interaction (§20.3)

- Navigation and dialog disclosure use immediate local state. Async vault opening disables
  duplicate actions, announces progress and catches failures; create/rename confirms inline.
- Existing demo reset names the demo, requires confirmation and uses exclusive maintenance.
  Unpin is reversible through the screens library; reordering remains reversible.
- Vault saves have an inline confirmation; device storage errors explain what to check.
  Broader campaign save chrome is owned by Runtime/App and remains unchanged.
- Existing hash routes/back behavior retained. Skip link changes focus without mutating the
  route. The pending palette registers as an overlay in the existing platform Back stack;
  browser-driven coverage checks dismissal before navigation and launcher focus restoration.
  No native-device smoke test is claimed.
- Shared navigation rows and rail vault/search have target floors; touch DS controls remain
  density-aware. Waive forcing all desktop icon controls to 44px: existing DS density specs
  explicitly require 28/36/48px visual boxes with larger focus/hit extents. Android’s global
  48dp floor remains. No gesture-only controls; pin menus accompany drag/keyboard reorder.
- Phone retains search plus one bounded Table controls overflow sheet. Rail/desktop retain
  the documented compact icon controls rather than moving familiar tablet actions.
- New and formerly hardcoded shell copy uses t(); EN/ES updated and DEV pseudo regenerated.
- Search and pin reorder retain shortcut tooltips; Help is available in every tier. Vault
  and navigation labels are self-explanatory, so no additional HelpTip is added.

### Accessibility (§20.4)

- Initial new spec: 8/8 passed across desktop/mobile, with all five themes scanned for
  shell route /screens, palette, Help, shortcuts, vaults, plus phone More/Table controls.
  Catalog error and tablet vault dialog also scan clean. Known-violations register unchanged.
- Keyboard walkthrough in spec: focus skip link → Enter → main retains route; empty-queue
  shortcut announces next step; Tab-equivalent focus on search → Enter → palette → Escape
  restores search focus. Existing navigation/pin/shortcuts suites passed; details below.
- Existing labelled nav landmarks and one h1 sourced from SECTION_TITLES remain. Invalid
  aria-controls reference removed when the sidebar More panel is unmounted.
- Save/open/error and pin reorder announcements are event driven; the elapsed clock is not
  made live. No periodic announcement added.
- Screen-reader audio spot check waived: no screen reader is available in the headless
  runner. Axe/focus assertions are not claimed as spoken-output evidence.
- New regression checks 200% root text, search/vault reachability and page-width overflow.
  No new scroll regions introduced; existing responsive boundary/zoom cases passed.

### Core discipline (§20.5)

- Domain writes still use runtime.dispatch; shell counts and pins use actor reads. Local
  device vault catalog operations use the pre-existing platform API, an explicit exception
  to domain dispatch because device preferences/catalogs are not shared campaign state.
- Preview behavior and player projection are covered by existing player-preview/pinned-screen
  specs, run below; no permission or projection implementation changed.
- Both profiles exercise navigation and malformed-catalog recovery. Lazy loading, durable
  create feedback and Spanish copy regressions pass on both profiles.
- Performance before/after measurement waived for this bounded style/copy change: ENG-1.1 has
  app-startup/vault-open scenarios but no isolated shell budget. No new domain reads, network
  calls, dependencies or eager vault imports. Full paired performance capture requires quiet
  reference/candidate runs; central performance gates remain independent evidence. No numeric
  no-regression claim is made.
- FEATURE-GAPS Command Center row updated with shell polish and regression coverage. The navigation audit now records the /scenes alias and More disclosure fixes.

## Validation log

- `pnpm gates`: exit 0; no owned file-size warnings. Other existing warnings remain.
- Targeted ESLint: exit 0 after removing all shell/AppShell legacy style allowances.
- App typecheck: exit 0.
- Viewport, navigation sections, session posture and i18n unit tests: 43 passed.
  Initial i18n failure correctly detected stale generated pseudo copy; regenerated with
  `pnpm exec tsx scripts/i18n-catalog.ts pseudo` and reran the same suite successfully.
- Initial axe failures exposed tertiary text on parchment and selected More-sheet rows,
  plus palette captions. Fixed shell caption colors, avatar initials, bottom-tab caption
  inheritance and scoped palette/shortcuts inheritance; the same five-theme scans now pass.
- Full pinned-container update completed; strict comparison is the final visual gate.

- Navigation audit follow-up: the `/scenes` gap was already resolved by its `/screens` alias
  and All screens links; retained and covered by the existing pin-navigation tests.
  The still-open More disclosure gap is fixed by optional per-item aria-haspopup/expanded
  props in the DS BottomTabBar (a necessary ancillary change), supplied by Footer and
  covered by a new keyboard/focus regression. NAVIGATION.md records both closures.

- Source-frozen regression pass before the final loader adjustment: 130 passed, three existing
  skips, and one mobile palette return-focus failure. A modal palette-loading fallback captured
  its temporary Close button as the real palette's return target. Replaced that fallback with
  a nonmodal status/cancel panel that leaves launcher focus alone; Cancel uses the shared
  return-focus policy. Cold cancellation, completion and Escape return now have explicit tests.
- Test corrections: scoped the Spanish error assertion to its dialog (the shortcut toast also
  uses role=alert); waited for the rail's own navigation landmark before measuring its vault
  button; the vault-ready dialog focuses its first available action, so the handoff test now
  checks focus inside the dialog rather than incorrectly requiring the name field.
- Existing command-palette suite: all 42 cases passed after the loader change. Existing
  vault/demo/pin/help/shortcut/session/permission/scene-card/player-preview cases passed in the
  broader runs. Three existing skips are the two opt-in demo performance cases and the
  desktop-only rail-collapse case on the mobile profile.
- Responsive/formal axe run: 26 checks outside the new shell spec passed, covering compact-phone,
  minimum-window, rail and compact-desktop reachability, bounded canvases, 640/641 navigation,
  200% zoom on all tiers, compact overlay footers, and the registered /scenes and palette/table
  controls axe cases. The two failures in that run were the corrected vault-field focus
  assertion described above; no responsive/registered axe case failed.
- First complete visual update: 439 passed; /play and /wiki desktop tavern readiness timeouts
  occurred while implementation/generated-source edits were still ongoing. No root cause is
  claimed. Both chrome-less routes are included in the final source-frozen strict comparison.
- Reviewed shell chrome in all five themes × all three tiers (15 captures): complete controls,
  readable caption colors, active accent markers, bounded sidebar/rail and intact phone footer.
  The main workspace is masked only in these shell-specific captures; existing full-route
  snapshots remain. Added cropped More and vault loading/ready/error captures for overlay review.
- Lossless optimization of the first 252 changed/new PNGs: 27,528,303 → 20,990,678 bytes;
  decoded RGBA pixels checked for equality before each replacement. Used zopfli.png.optimize
  with use_zopfli=False and Pillow for comparison in a temporary uv environment; no repository
  dependency or tolerance/budget change. Initial optimized total: 571 PNGs, 28,113.7 KiB.

- Final new shell acceptance command: `pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/shell-polish.spec.ts --workers=2 --retries=0`: **20 passed**, exit 0 (44.8s).
  Axe uses the release-gate tag set, including WCAG 2.2 AA and best-practice, without exclusions.
- Final typecheck, ESLint and Prettier source checks: exit 0. Unit suite repeated on final source:
  **43 passed**, exit 0. `pnpm gates` on final source: exit 0; no owned size warnings;
  largest owned file is rows.tsx at **457 lines**.
- Overlay snapshot update in the pinned container: **15 tests passed**, exit 0, adding
  45 vault loading/ready/error crops (five themes × three tiers) and five phone More crops.
  All 50 overlay captures reviewed: bounded content, clear warning shape/copy, disabled writes
  on catalog failure, and reachable Close/action controls. The 15 full-shell captures plus
  these 50 crops make **65 shell-specific images**; full-route goldens were also refreshed.
- Additional 50 overlay PNGs optimized losslessly: 1,378,795 → 1,006,953 bytes, all decoded
  RGBA pixels equal. Final baseline budget: **621 files, 29,097.1 KiB / 32,768 KiB**, exit 0.
  Image-size caps and screenshot tolerances are unchanged in configuration.

- First strict full-suite comparison (`--update-snapshots=none --workers=4 --retries=0`):
  **441 assertions/tests passed** (5.6m), but the container/tool wrapper returned **143**
  after the success summary. The original log contains no test failure or signal diagnostic.
  This is not recorded as a successful wrapper gate; a two-worker repeat with an explicit
  captured exit status is required below before commit.
- The five-theme axe matrix has a 60-second test budget because it performs up to 35 serial
  audits; this changes neither axe exclusions nor assertions and avoids using the default
  single-journey timeout for a whole matrix. Functional retries remain zero.

- Full strict pinned-container repeat (`--update-snapshots=none --workers=2 --retries=0`):
  **441 passed (7.0m), exit 0**, independently captured in `/tmp/shell-visual-final.exit`.
  The prior wrapper exit 143 did not recur; no claim is made about its cause.
- Final event-only adjustment registers the nonmodal palette loader with platform Back and
  shares launcher focus restoration across Cancel, Escape and Back. The cold-loading test
  focuses Cancel, invokes the real platform Back dispatcher, and checks that no history/root
  navigation occurred before reopening and completing the lazy load.

- Final-source acceptance repeat after Back integration: **20 passed (46.0s), exit 0**,
  including all five-theme axe scans and platform Back/focus checks on both profiles.
- Final-source pinned shell comparison: **15 passed (27.5s), exit 0**; all 65 captures match.
  The event-only adjustment required no further baseline changes.
- Final-source app typecheck, targeted ESLint and `pnpm gates`: **exit 0**. Gates have no
  file-size warning for any owned file; unrelated pre-existing warnings remain.
- Checklist complete with scoped waivers above. No remote publication or native-device,
  spoken screen-reader, or paired performance verification is claimed.

## Scheduled follow-up — 2026-10-03

This section supersedes earlier final-source claims wherever the scope correction changes
that evidence. The earlier implementation and embedded §20.2–§20.5 checklist remain above.

- Gate feedback explicitly rejected BottomTabBar.tsx and i18n/dev/qps-ploc.ts as outside
  the claim. The new task now owns BottomTabBar.tsx, so that required disclosure change stays.
  The pseudo catalog is still excluded: restored it exactly to the pre-task parent of
  73a07863, removing that path from the cumulative candidate diff. No dispatcher state edited.
- This scope correction creates a verified integration blocker: the existing i18n unit test
  requires complete pseudo coverage, but the restored catalog omits the 25 new EN/ES keys.
  `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/i18n/index.test.ts`:
  27 passed, 1 failed at index.test.ts:227, expected coverage 1, actual 0.995769165679472.
  No test/coverage threshold was weakened and no runtime localization workaround was added.
  The central claim must include this generated file, followed by the existing
  `pnpm exec tsx scripts/i18n-catalog.ts pseudo` generator and the same unit check.
  Asked for that scope correction; no authorization inferred from elapsed time.
- Added shell-pin-bounds.spec.ts covering long pin names and a long-named Demo campaign
  at sidebar (1280px), rail (900px), and phone (390px) widths on both browser profiles.
  Checks each pin, campaign control and available pin action against every horizontally
  clipping ancestor, scrolls controls into view and opens the pin action menu. All three
  existing navigation implementations already show the Demo badge; no duplicate badge
  or unrelated live-row style fix added (RC-ENG-9.1 remains separate).
- Initial test fixture was rejected by local-vault validation because its ID lacked the
  local- prefix. Corrected the fixture to use the valid demo/primary catalog shape already
  used by demo-vault.spec.ts. With the valid fixture: 6 passed, exit 0. No production geometry
  change was required; the existing shell visual baselines remain applicable.
- FEATURE-GAPS row now names the new clipping/Demo coverage.

- Follow-up pinned-container strict shell comparison: 15 tests passed (34.2s), exit 0,
  covering all 65 existing captures across five themes and three tiers. No pixel-producing
  source changed in this follow-up, so the previous full 441-test baseline comparison remains
  the broader visual evidence; this run refreshes the shell-specific check.
- Follow-up `pnpm gates`, app typecheck, targeted ESLint and Prettier: exit 0.
  All owned files remain below 500 lines (largest: rows.tsx, 457). The cumulative diff against
  73a07863^ is empty for qps-ploc.ts, confirming the rejected generated path is removed.

- Broad follow-up shell regressions: 138 passed, 3 expected skips, 1 cold-palette test
  failure. The failing assertion was search return focus after sending Escape immediately on
  dialog visibility. The DS palette focuses its input in a deferred callback, so visibility
  alone does not establish keyboard readiness. Added an assertion that the combobox actually
  has focus before Escape, plus a hidden-dialog assertion afterward. Kept return-focus checks
  and zero retries. No production behavior or snapshot changed.

- Final shell-polish + shell-pin-bounds acceptance run: **26 passed (1.1m), exit 0**,
  including five-theme route/overlay axe on desktop and mobile, long pins and Demo badges.
- Cold palette readiness/focus regression repeated five times per profile: **10 passed
  (24.2s), exit 0**, retries disabled. Final targeted ESLint: exit 0.
- Remaining blocker: generated pseudo catalog ownership/completeness, as detailed above.
  Implementation follow-up is committed for review; full integration readiness is not claimed.

## Integration reconciliation — 2026-10-03

- Rebased both task commits onto `f9ab3d74855c462613793ee87ce0034fd712d637`.
  The source conflict was the Sidebar import block: kept both the integration branch's
  `settingsGateVisible`/`useSettingsTier` imports and the task's loading/presence imports.
  Reviewed the combined account button: the Players-tier restriction, disabled state,
  gated explanation, and guarded navigation/hover remain intact alongside token styling.
- The 24 reported binary conflicts cover board, command-center, scene-editor and settings,
  in desktop/rail and tavern/parchment/high-contrast. Task images were used only as temporary
  conflict placeholders; the pinned renderer regenerates baselines from the combined source.
  Full-suite regeneration and strict comparison results are recorded below, not inferred
  from Git's conflict resolution.
- Both integration and task EN/ES messages survived the textual merge. The generated pseudo
  catalog remains identical to the integration target, preserving the explicit claim boundary.
  The previously documented pseudo completeness blocker is not silently waived by this rebase.
- No Headroom tool is available; checks use original command output. No agents, dispatcher
  edits, pushes, promotion, or additional loops were used.
- App typecheck and targeted owned-source ESLint passed (exit 0). Focused viewport,
  navigation, session-posture and i18n units: 42 passed, 1 failed; the only failure remains
  pseudo coverage at index.test.ts:227 (1 expected, 0.9957933703516743 actual after integration's
  added strings). No generated catalog, coverage assertion or ownership control was changed.
- Reviewed contact sheets of all 24 regenerated conflicts: desktop sidebar/account and
  rail/navigation remain bounded; board, scene-editor, Command Center and settings retain
  their integration layouts with the task's polished shell. Baseline budget: 621 files,
  29,685.9 KiB / 32,768 KiB, exit 0. No optimization, tolerance or budget change needed.

- Combined browser suite on the rebased source: **143 passed, 3 expected skips (6.4m),
  exit 0**, retries disabled. Includes all shell/overlay axe scans on both profiles,
  pin/Demo bounds, vault/command/shortcut/help/session/player/scene-card regressions, plus
  integration's Beginner/Expert settings-tier and cross-window tier-change cases.
- `pnpm gates` and Sidebar Prettier check passed, exit 0; no owned file-size warning.
  Largest owned file is now Sidebar.tsx at 460 lines (rows.tsx remains 457).
- Full pinned update: 440 passed, 1 failed (7.3m), exit 1. The atlas dungeon desktop case
  timed out waiting 20 seconds for `window.__rt.loaded`; it never reached its screenshot.
  All 24 conflicted files were regenerated successfully. No root cause is asserted for the
  readiness timeout; the entire suite is repeated below with updates disabled and zero retries.
- Final full pinned strict comparison (`--update-snapshots=none --workers=4 --retries=0`):
  **441 passed (5.8m), wrapper exit 0**. The atlas readiness failure did not recur; no retry
  or tolerance change was used. All five-theme/three-tier shell captures and all full-route
  baselines passed against the reconciled source.
- Reconciliation complete: target f9ab3d74 is an ancestor of this task branch, all 24 binary
  conflicts are renderer-derived and reviewed, and no conflict markers/unmerged entries remain.
  The generated pseudo-catalog scope/completeness issue remains the only recorded integration
  blocker; this rebase does not claim to resolve it. No push or promotion performed.

## App-test gate repair — 2026-10-03

- Read the original failed gate log for run `ed48f6ab-573b-4a76-995f-ceba9fdc97c7`
  at candidate `a62bf92a`. It reports 1,749 passes and exactly two failures:
  i18n/index.test.ts:227 requires full pseudo coverage; i18n/dev/pseudo.test.ts requires
  exact equality to the current EN catalog. The generated catalog had 5,918 entries against
  5,943 source entries: exactly the 25 shell/vault keys introduced by this task.
- Ran the repository generator, `pnpm exec tsx scripts/i18n-catalog.ts pseudo`.
  The only code artifact changed is i18n/dev/qps-ploc.ts: 25 generated entries, 31 added lines.
  Existing translations and integration additions are preserved. No generator, test assertion,
  coverage threshold, runtime fallback, or dispatcher control was changed.
- This repair supersedes the earlier decision to leave the generated artifact stale. The latest
  explicit App-tests gate feedback requires this derived artifact alongside the task's EN/ES
  changes. Earlier path-claim feedback excluded this file; the candidate now includes it as a
  necessary generated dependency. Central ownership validation is not claimed as locally run,
  and no dispatcher claim metadata was edited to bypass it.
- The operator reported quality gates, changed formatting, pinned visuals, typecheck and lint
  passing at a62bf92a. This repair affects only the DEV pseudo catalog, not the EN/ES rendering
  or production shell behavior captured by those visual/browser checks.
- Full `pnpm test:app`: **159 files / 1,751 tests passed (51.03s), exit 0**, including
  both previously failing catalog tests. Original result: /tmp/shell-catalog-app-tests.log.
- `pnpm gates`, generated-file ESLint and Prettier: **exit 0**. No new owned size warning.
  The code failure is resolved; central claim acceptance and independent review remain the
  operator's checks. This commit contains only the required generated catalog and this journal.

## Browser acceptance recovery — 2026-10-03

- Read the original browser gate log `21e288e9-1806-4478-8146-ed88ffd6d348`: 1,669 passed,
  32 skipped, five failures. The remaining failures were shell defects: rail Local vaults
  measured -12..76px inside a 64px rail with 200% text; phone Search shrank to 43.984375px;
  newly translated pseudo presence text was ellipsized inside the sidebar account control.
- Rebased onto repaired integration `879489ab` (loop/rc). Retained its shared HelpTrigger /
  full Help dialog in Footer and its separate Palette/help inventory row. Removed the obsolete
  shell raw-style allowances while retaining unrelated integration allowances. Campaign PNG
  conflicts use integration images as temporary inputs, followed by renderer regeneration.
- Fixed the icon-only rail launcher to a 48px minimum target independent of root text size,
  preserving Android's 48px floor inside the fixed 64px rail. Compact Search and Table controls
  keep their intrinsic size with flexShrink: 0. Sidebar presence wraps, including unbroken text,
  rather than clipping translated status. No assertions, screenshot tolerances or target floors
  were relaxed; the existing responsive cases directly cover all three regressions.
- Focused responsive rerun: **6 passed (16.7s), exit 0**, both desktop and mobile, retries 0.
  Full browser, pinned visuals and the other validation gates are rerun below on this source.
- An exploratory full browser run with four workers / zero retries overlapped the build
  and visual checks. Four initial runtime-ready waits timed out at 20s; a map fling-distance
  assertion (60px instead of greater than 90px) and a campaign axe test also failed. Stopped that run explicitly rather
  than present a partial sweep as a passing gate. The authoritative rerun below uses the
  central two-worker / two-retry configuration after the build checks finish. No test timeout,
  assertion or retry configuration in the repository was changed.
- Full non-browser gates passed, all exit 0: quality, changed-file format, full typecheck,
  full lint, App tests (161 files / 1,773 tests), tooling tests (245), build and requirements
  audit. Original logs are /tmp/shell-recovery-{quality,format,typecheck,lint,app,tooling,build,
  requirements}.log; /tmp/shell-recovery-gates.json records each command's exit status.
- Full pinned visual update: **468 passed (17.1m), wrapper exit 0**. The rail target
  changes 81 existing full-route/shell captures; all changed captures were reviewed in seven
  contact sheets. Rail chrome stays bounded and the launcher is centered; existing workspace
  clipping/scrolling policies and the shell spec's deliberate main-content mask are preserved.
- Regeneration exceeded the unchanged baseline byte budget. Losslessly recompressed only
  those 81 changed PNGs using zopfli.png.optimize(use_zopfli=False), verifying equal dimensions
  and decoded RGBA bytes before replacing each file: 9,101,839 -> 7,010,642 bytes.
  Final budget check: **693 files, 31,522.0 KiB / 32,768 KiB, exit 0**. No dependency,
  snapshot tolerance or budget limit changed; the helper lives only under /tmp.
- Final full pinned visual comparison: **468 passed (16.5m), wrapper exit 0**, updates
  disabled, two workers and zero retries. This verifies the final source and losslessly
  recompressed baselines across every theme and tier. The largest owned source files are
  Sidebar.tsx and rows.tsx at 457 lines; no owned file-size warning remains.
- Final full browser acceptance (`pnpm e2e --workers=2 --retries=2`): **1,734 passed,
  32 skipped (1.1h)**, no failures or retried cases in the original completed runner log,
  /tmp/shell-recovery-browser-final.log. Both profiles pass the five-theme shell/overlay axe
  matrix, pin/Demo bounds, and all three previously failing responsive checks. The exploratory
  run's readiness, fling-distance and campaign axe failures did not recur. Skips remain the
  suite's existing opt-in/profile-specific cases; no test was disabled for this repair.
- Recovery complete on the rebased task branch: repaired integration 879489ab is an ancestor,
  the complete browser and pinned visual suites pass, and all other validation gates pass.
  Earlier catalog and browser blockers are superseded by the current complete runs. The
  embedded checklist and its manual/hardware waivers remain applicable. No push, promotion,
  dispatcher control change or additional agent was used.

## Visual gate recheck — 2026-10-04

- Read the original central gate log for `b8e6730e-7f0f-46e8-8ccf-9233ce822007`
  at `ee39c218`: 467 passed, one failed. The high-contrast phone shell test reached the
  visible Local vaults error dialog, then exhausted the screenshot's 5s budget waiting
  for element stability during scroll-into-view. No pixel mismatch was reported.
- The worktree starts clean at that exact candidate. Reviewing the shell flow found no
  evidenced product defect requiring a source or baseline change. Recheck the existing
  shell suite three times across all themes/tiers and then the complete pinned suite,
  with baseline updates and retries disabled. Do not infer the timeout's root cause
  from a passing repetition or weaken screenshot comparisons to conceal it.
- Repeated pinned shell comparison: **45 passed (1.9m), wrapper exit 0**. All five
  themes and three tiers ran three times, including three successful high-contrast phone
  error-dialog captures. Command: `CONTAINER_ENGINE=docker bash
apps/gm-react/tests/visual/run-in-container.sh tests/visual/shell-polish.spec.ts
--update-snapshots=none --workers=2 --retries=0 --repeat-each=3`. Original log:
  /tmp/shell-visual-recheck.log. No source, fixture, baseline, timeout or tolerance changed.
- `pnpm gates`: **exit 0**, no owned file-size warning (exact output retained as dispatch
  artifact 44e5ce52c9b8407a839cc54d2cdb4783). Unrelated file-size warnings remain outside
  this task's ownership. The prior browser/axe evidence still describes unchanged source.
- First complete pinned recheck: **467 passed, one failed (13.0m), wrapper exit 1**.
  Every shell case passed, including the original phone high-contrast error dialog. The
  failure moved to rail `join missing high-contrast`, before screenshot capture: its 5s
  Campaign invite visibility assertion expired while the page still showed “Loading your
  vault…”. Read the original log /tmp/shell-visual-gate-recheck.log and the failure context
  (dispatch artifact 891bc02c9213444baab24e5633ee140c). No pixel mismatch occurred.
  Retain this failed result; repeat the complete suite with the same two workers, zero
  retries and updates disabled, without changing the unrelated Join test.
- Second complete pinned recheck: **466 passed, two failed (12.0m), wrapper exit 1**.
  All shell cases passed again (75 successful shell cases total across this turn's three
  runs). The previous rail Join failure passed in 2.5s. Original complete log:
  /tmp/shell-visual-gate-final.log. Its final summary also reports phone high-contrast
  `/play`: screenshot capture exhausted 5s after fonts loaded, with no pixel mismatch.
  Phone high-contrast palette/help exhausted its 5s dialog visibility wait while the
  lazy-loading Search status remained visible. Exact diagnostics were read from dispatch
  artifacts 86c8770f84f64befa4bb761c7497e414 and 6f8f4940ea7244919038f26a347f7ba1.
- The original shell timeout has not reproduced, but the complete visual gate is **not
  green** in this turn. These varying timeouts do not establish a root cause or justify
  changing shell pixels, rewriting baselines, or relaxing unrelated visual assertions.
  Keep the current implementation and record the remaining whole-suite validation issue
  for the central operator's independent gate/review. This evidence-only follow-up does
  not supersede the failed full-suite results with a focused pass.
- Focused Join/palette high-contrast recheck on phone and rail, repeated three times:
  **12 passed (27.1s), wrapper exit 0**, updates/retries disabled, two workers. Original
  log: /tmp/shell-visual-loading-recheck.log. This confirms those cases can pass unchanged;
  it does not prove the full-suite timing issue fixed. No product or test source changed.
- Follow-up changes only this journal. Quality and changed formatting pass; the previous
  complete browser/axe results remain applicable to unchanged source. No push, promotion,
  dispatcher state mutation, baseline update, or agent delegation occurred.
