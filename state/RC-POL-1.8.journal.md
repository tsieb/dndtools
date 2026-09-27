# RC-POL-1.8 — Player companion polish

Base: `225aac8328bbcbae6634802a8ec263d219470935`.
Branch: `dispatch/dndtools/cb7b542f17647634ef30`; initial working tree clean.
Owned surface: `apps/gm-react/src/screens/play`; supporting translations, tests, snapshots,
style ratchet, FEATURE-GAPS and this journal implement the explicit acceptance requirements.
No push, promotion, dispatcher writes or additional agents. Headroom tools were unavailable;
commands used native execution and their complete output is retained in local `/tmp/pol18-*.log`.

## Work and evidence

- Split oversized Frame, Home and Journal into navigation/toasts, scene banner, private journal,
  private list chrome and deletion dialog. All owned source files now under 500 lines.
- Tokenized spacing/radii and changed small display labels to sans. Added illustrations and
  EN/ES copy, fixed obsolete elevated-tier lock threshold, and added storage recovery/confirmation.
- Existing surface e2e: 38 passed, both profiles, no retries.
- First strict axe run found toolbar content outside landmarks. Changed its wrapper to header;
  rerun passed all six initial polish cases (both profiles), including join and deletion overlays.
- Initial pinned-container visual update: 15 passed. Baseline budget 32,492.3 / 32,768 KiB.
- `pnpm gates` passed, zero owned file warnings; unrelated warnings remain.
- Reviewed all 15 captures in a contact sheet. No clipped labels or overlap; rail and phone navigation
  retain the existing compact presentation. Final refresh follows the light-theme contrast correction.
- Broader app unit invocation initially ran all 153 files: 1,714 passed, one vocabulary test failed.
  Corrected newly localized DM/DJ literals to `{gm}` (including wrapped Spanish text). Focused
  private-store, feedback and i18n suite then passed all 58 tests in five files.
- Additional all-theme axe found Parchment text/accent contrast below 4.5:1. Added companion-scoped
  light-theme token overrides; all five stage/journal themes now pass on both profiles.
- Full lint caught multiple gold primaries in the extracted PrivateJournal. Bookmark and impression
  saves are now secondary; no emphasis baseline increase.
- One intermediate scene-card run overlapped catalog edits, triggering Vite HMR provider errors
  (`useI18n must be used inside I18nProvider`) and three failures. This is not accepted evidence;
  final combined browser run below is made with the app source frozen.
- Final verification completed on 2026-09-27; results and exact commands below. Checked audit items include explicit waivers.

## Embedded audit (§20.2–§20.5)

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
      Partial waiver: spacing/radii use DS tokens, and owned lint passes. The projected theatre retains ten existing fixed light/dark color literals because it is intentionally independent of the theme palette; SVG map geometry and compact font metrics remain data/layout values.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
      Local structure preserves the existing prototype port: permission banner, sidebar/rail, stage, companion sections. External prototype comparison waived: no DesignSync provider or vendored player template is available in this checkout.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
      Stage has the primary raised surface; supporting panels use the existing small shadow. Save note is the private journal primary; bookmark and impression saves are secondary.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
      Small Cinzel labels migrated to sans; page headings keep the display face, numeric stats use mono. Dense existing metadata keeps more than four font sizes to preserve hierarchy in the sheet.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
      Presence uses flag/check icons and pressed semantics; connection and live states have text beside their dots. Elevated navigation retains its DM stripe and the corrected two-tier lock threshold.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
      Pinned-container coverage: nine full companion images for Tavern/Parchment/High Contrast plus six complete stage crops for Scholar/Dungeon across desktop/rail/phone. Full-page captures for the latter two waived to respect the shared 32 MiB baseline budget; functional coverage exercises the remaining sections.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
      No new bespoke motion. Shared skeleton/dialog primitives use the existing reduced-motion rules; visual runner forces reduced motion.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.
      Added play-waiting, knowledge-empty and journal-empty illustrations. Private storage has a skeleton, recoverable read error and save error preserving drafts. No error-specific illustration exists; use the live alert and Retry action. Secondary turn/history/private lists retain compact text rather than repeating full illustrations in the same view.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
      Presence updates optimistically. Private operations immediately expose Saving and disable the fieldset; completion has persistent status. Roll and initiative dispatch retain their existing feedback.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
      Private note/bookmark/impression deletion now uses a DS danger dialog naming the entry, defaulting focus to Cancel. Existing core reads are non-destructive.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
      Private writes explicitly report device-local persistence and preserve a failed draft. Other sections are read-only projections; no autosave indicator is appropriate there.
- [x] One clear route back; browser back works; Android Back follows the documented order.
      Navigation stays in the standalone companion; browser Back leaves the route. Shared Dialog owns Escape/Android Back ordering. Waiver: sections are existing local navigation state, not new browser-history entries.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
      All actions remain visible buttons with labels and keyboard activation. Review correction: shared responsive density did not size the raw presence buttons or shared Join trigger. Owned CSS now applies `--touch-target-min` explicitly to navigation, both presence actions and the toolbar Join trigger (44px web, 48dp via the existing Android override), independent of density. Route coverage measures both dimensions after fonts load, before/after toggling presence, on both browser profiles and with the Android attribute. No sizing waiver for Join is needed; its shared implementation stays unchanged. Navigation regression also measures all ten rows on the standard profiles and an explicit 1280×800 coarse-pointer viewport, with web and Android floors. No new gesture-only interaction.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
      Existing compact horizontal navigation is bounded and scrollable. Join remains the sole top-bar action; modal join and destructive confirmation use bounded shared overlays.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
      Re-read companion copy and localized presence, map fallback, connection, roll and storage outcomes in EN/ES. Waiver: shared SessionPanel join copy, core-authored rejection strings and authored content kinds/moods are outside this surface contract.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.
      Locked navigation has a labelled reason and informational toast; presence explicitly distinguishes device-local from shared. No new shortcut or non-obvious control introduced.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
      Strict axe tests cover every normal section, join and deletion overlays on both profiles, with no rule exclusions or register changes. Final result recorded below.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
      Automated keyboard walkthrough focuses Journal, enters a note, opens deletion with Enter, cancels with Escape and checks restored focus. Existing global focus-visible styling is retained.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
      One h1 per section and labelled navigation asserted. Connection toolbar changed to semantic header after strict axe identified an unlandmarked region. Standalone route correctly uses its own section names rather than DM SECTION_TITLES.
- [x] Live regions announce operations; no announcement spam.
      Persistent polite private status and toast regions; failures use alerts. Empty illustrations are decorative, not extra live regions.
- [x] Screen-reader spot check on one platform noted.
      Waived: no interactive screen-reader/audio platform is available in this worker. Accessible names, live roles, focus restoration and strict axe are exercised in Chromium; this is not a claimed human screen-reader pass.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.
      Added 200% document zoom task on desktop/mobile: navigation, private form and save remain reachable, no document overflow.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
      Core changes still use runtime.dispatch/requestCommand and actor-filtered PlayerData. Private records deliberately use the separate device-local store (ADR-035); updated structural import guard to the extracted PrivateJournal file without widening the allowed importers.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
      Core preview rejection remains covered by the existing declined-share e2e. Partial waiver: local private drafts remain writable in preview by design, and shared-write controls retain their existing explicit rejection path rather than changing preview behavior in this polish story.
- [x] Player projection of this surface verified through an actor read in an e2e.
      Existing player-view e2e verifies actor-specific projection, projected map/fog and absence of hidden combat tokens.
- [x] e2e on both profiles covers the primary task and one failure path.
      Existing projected-stage/inbox/private-note/co-DM suite plus new storage-failure, confirmation and accessibility cases run on both browser profiles. Final command results below.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
      Waived: ENG-1.1 has no standalone /play scenario; this story changes no query, transport or data volume. Existing interaction tests provide responsiveness checks, not a before/after performance budget claim.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.
      FEATURE-GAPS Player app row updated. No architecture contract changed; private import guard follows the extracted component.

## Final validation (2026-09-27)

All commands ran on this task worktree. No source edits overlapped the final browser run.

| Check                                                       | Result                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm gates`                                                | Exit 0; zero `screens/play/` file-size warnings. All 19 owned files below 500 lines; maximum 489 (`PrivateJournal.tsx`). Unrelated source warnings remain. |
| `pnpm lint`                                                 | Exit 0, including boundary, emphasis and five-theme non-text contrast. No baseline increase; owned raw-style allowance reduced from 187 to 10.             |
| `pnpm --filter @dndtools/gm-react typecheck`                | Exit 0.                                                                                                                                                    |
| Focused Vitest command below                                | 5 files / 58 tests passed.                                                                                                                                 |
| Combined Playwright command below                           | 84 passed, both profiles, no retries (3.4 min).                                                                                                            |
| Pinned visual update and comparison below                   | 15 passed each; five themes × three tiers. Final images reviewed in a contact sheet.                                                                       |
| `node apps/gm-react/tests/visual/check-baseline-budget.mjs` | Exit 0; 492 images, 32,492.0 / 32,768 KiB.                                                                                                                 |
| Prettier on every changed text file and `git diff --check`  | Pass.                                                                                                                                                      |

```sh
pnpm exec vitest run --config vitest.app.config.ts   apps/gm-react/src/platform/storage/privateStore.test.ts   apps/gm-react/src/screens/feedback-hygiene.test.ts apps/gm-react/src/i18n

pnpm --filter @dndtools/gm-react exec playwright test   tests/e2e/play-polish.spec.ts tests/e2e/player-view.spec.ts   tests/e2e/player-private-notes.spec.ts tests/e2e/player-inbox.spec.ts   tests/e2e/co-dm.spec.ts tests/e2e/player-preview.spec.ts tests/e2e/scene-cards.spec.ts   --workers=2 --retries=0

apps/gm-react/tests/visual/run-in-container.sh   -g '/play$|play stage' --update-snapshots=all --workers=2
apps/gm-react/tests/visual/run-in-container.sh   -g '/play$|play stage' --update-snapshots=none --workers=2
```

The strict axe checks have no impact filter or rule exclusions. They cover every player and Co-DM
section, the join and named-delete overlays, read/save failure states, and Stage/Journal in all five
themes on both profiles. The existing private-store structural test permits only the extracted
private-journal importer; the replication boundary was not broadened. No architecture contract moved.

Local implementation and validation only. The central operator still owns independent review,
integration and publication.

## Independent-review correction (2026-09-27)

- Review of `e10cee076a9f9fb1649324037ecf64043c9cb4c2` found 33px presence actions and a 31px Join trigger on Pixel 5. The prior density claim above was incorrect and is now corrected.
- Added scoped token-based minimum dimensions and a route regression checking web/Android floors, both presence states, and opening Join. No behavior or translation change.
- Initial combined browser run: 84 existing tests passed, including strict route/overlay axe on both profiles; only the two new target cases failed because the test incorrectly expected Ready to start unpressed. Corrected that assertion to match the existing initially-ready behavior. The application source was unchanged during validation. Original output: `/tmp/pol18-review-e2e.log` (exit 1; not represented as a green command).
- Corrected target regression: 2 passed, both profiles, no retries; dispatch artifact `03dfbfc1f53b4bc186c9360c7bc98bae` (exact output retrieved). Command: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/play-polish.spec.ts -g 'presence and join' --workers=2 --retries=0 --output=/tmp/pol18-review-target-results`.
- Full corrected polish spec rerun: 14 passed, both profiles, no retries, exit 0 (53.1s), including strict axe for sections, overlays, failures and all five themes. Command: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/play-polish.spec.ts --workers=2 --retries=0 --output=/tmp/pol18-review-polish-results`. Dispatch artifact `ff01b0b334b3429a8fbf35aafd9ecb8a` (exact output retrieved).
- Pinned visual update: 15 passed; comparison: 15 passed, no retries. Commands are the visual commands above; comparison additionally uses `--output=/tmp/pol18-review-visual-results`. Logs: `/tmp/pol18-review-visual-update.log`, `/tmp/pol18-review-visual-compare.log`. Reviewed all refreshed captures in contact sheets: controls fit without label clipping or overlap. Baseline budget: 492 images, 32,487.2 / 32,768 KiB.
- `pnpm gates`, `pnpm lint`, and `pnpm --filter @dndtools/gm-react typecheck`: exit 0. Original logs: `/tmp/pol18-review-{gates,lint,typecheck}.log`. No owned file-size warnings; 19 owned files, maximum still 489 lines. Existing unrelated warnings remain.
- Formatting and `git diff --check` pass. No copy changes; existing EN/ES and FEATURE-GAPS edits remain in the candidate.
- Dispatch output-retention tools were discovered during this correction after the initial Headroom-name search returned none; later checks use them. Earlier checks retain exact local logs.

## Wide-touch navigation review correction (2026-09-27)

- Review of `cf3944971505e1ebf8255c676ff35df7b794b70c` found 35px navigation rows at 1280×800, including coarse-pointer touch devices. The prior touch-floor coverage omitted navigation.
- Added `.player-view-nav-row` to the owned `--touch-target-min` rule, preserving 44px web and 48dp Android minimum dimensions at every breakpoint.
- Added regressions for all ten rows (including locked actions) after fonts load, on the normal desktop/mobile profiles and explicit 1280×800 touch contexts. Each checks both dimensions with and without the Android attribute; the wide-touch case asserts a coarse pointer.
- Dispatch commands have a 120-second timeout limit, so longer checks use native asynchronous execution with complete output in `/tmp/pol18-nav-*.log`, read back through dispatch retention tools.
- Pinned visual refresh and comparison: 15 passed each (31.0s / 31.7s), covering five themes × three tiers. Used the visual commands above; comparison adds `--retries=0`. Only the three full desktop baselines changed. Inspected each refreshed image at full resolution: all navigation labels fit and the ten rows remain clear of the footer. Logs: `/tmp/pol18-nav-visual-{update,compare}.log`.
- Baseline budget passed: 502 files, 32,646.3 / 32,768 KiB (dispatch artifact `95911ca90aa1449e8d4c72e907ba63ea`, exact output retrieved).
- `pnpm gates`: exit 0, no owned file-size warning; 19 files, maximum 489 lines. Dispatch artifact `69969e57529546369e942bf24b126039`, both exact streams retrieved. Unrelated warnings remain.
- `pnpm lint` and app typecheck: exit 0. Logs: `/tmp/pol18-nav-lint.log`, `/tmp/pol18-nav-typecheck.log`; these and the visual-update log retained together in dispatch artifact `35d2e1104fa446a3a33656fc8bfe2788`, retrieved in full. Existing unrelated lint warnings remain.
- No behavior or copy changes; existing EN/ES translations and FEATURE-GAPS edits remain in the candidate.
- First combined e2e run: exit 1, 88 passed / 2 failed. Both failures were the first desktop Co-DM cases timing out in `waitReady` before runtime initialization; all target regressions and strict axe cases passed. This run overlapped the visual container and lint startup; overlap is a possible contributor, not a proven cause. Exact output retained and retrieved in dispatch artifact `f2859fb2694440ef9483a942998467ef`; log `/tmp/pol18-nav-e2e.log`. A full rerun with no overlapping validation follows.
- Final combined e2e rerun: exit 0, **90 passed**, both profiles, zero retries (2.3m). This includes all four navigation regression instances and strict axe for route sections, overlays, failures and all themes. Ran the combined Playwright command above with `--output=/tmp/pol18-nav-e2e-final-results`. Exact complete output retrieved from dispatch artifact `895cda5dfb8c429487b53d5dcba6cadf`; log `/tmp/pol18-nav-e2e-final.log`. No application source edits overlapped either browser run.
- Final formatting and `git diff --check` pass. Local correction is ready for the central operator's gates and independent review; no push or promotion performed.
