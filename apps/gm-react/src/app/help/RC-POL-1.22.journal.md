# RC-POL-1.22 — Command palette, shortcuts and help

## Implementation

- Split palette presentation metadata and command dispatch/canvas actions into owned shortcut modules; preserve actor-filtered core reads and runtime dispatch.
- Hide Create launchers and mutation actions in read-only player preview.
- Add Help as a palette destination on every tier; preserve nested shortcut focus return.
- Wrap shortcut key/description rows and use semantic `kbd` plus spacing/type tokens.
- Handle release-note loading, empty, failure and retry explicitly; guard late async responses on unmount. Add EN/ES copy.
- Supporting DS palette change is necessary for overlay acceptance: accessible empty listbox, readable hint contrast, localized labels and the existing search-none illustration. No vendored design-package files changed.

## Checklist review — each item checked or explicitly waived

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
  - PASS with scoped waiver: changed help dialogs use spacing/type tokens; raw-style allowances removed. Existing Spotlight safe-area offsets and structural semantic HTML remain, because changing shell positioning or replacing dl/section semantics is not part of this overlay repair.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
  - WAIVED live prototype comparison: design project is not available through this session. Reviewed the vendored content fundamentals and existing DS CommandPalette/Dialog composition. Deviations: responsive wrapping and a search illustration improve narrow-screen use.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
  - PASS with waiver: selected palette row and Done use the DS primary accent. Shared modal chrome retains shadow-lg rather than shadow-md; changing global modal elevation would affect unrelated surfaces.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
  - PASS: shared title plus base/small/meta scale; Inter for small text and mono for kbd/counts. No new small Cinzel.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
  - PASS with waiver: warning/search/info icons accompany state text. Actor visibility remains spelled out on scene/map rows; no DM-only panel is introduced that requires a purple stripe.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
  - PASS: 60 complete visible-dialog baselines cover populated palette, illustrated no-results, Help and Shortcuts in all five themes × desktop/rail/phone. The 2026-10-03 review revision below supersedes the historical budget waiver; the current baseline budget fits all four surfaces.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
  - PASS: shared DS named animation tokens and reduced-motion policy retained; pinned visual projects run with reduced motion. No new animation.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.
  - PASS: search-none illustration, release loading skeleton, empty release copy, load error plus Retry, and blocked action reasons. No release-note-specific illustration key exists.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
  - PASS with waiver: input echo/navigation/closing are immediate; async dispatch has success/error toast; release fetch has skeleton and retry state. Existing 150ms search debounce is intentional, not a promise of sub-100ms full-text completion.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
  - PASS: no new destructive command; existing canvas undo is covered in command-palette.spec.ts. Create launchers still open destination forms.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
  - WAIVED durable save indicator: these overlays do not edit durable documents. Recent ids/seen badges are best-effort device preferences; failed commands retain existing actionable toast.
- [x] One clear route back; browser back works; Android Back follows the documented order.
  - PASS: Escape unwinds shortcuts to Help, then Help to route; actual nesting now participates in shared Escape ownership. Shared Android Back registration remains unchanged; no native device run claimed.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
  - PASS with scoped waiver: search/Help are click/tap targets; Retry and help-to-shortcuts are at least 48px. Existing shared close/ContextHelp density targets are retained (44px comfortable; smaller desktop density) to avoid changing the global sizing contract.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
  - WAIVED top-bar policy: this task adds no top bar. The existing compact search trigger opens a bounded palette; Help and shortcuts use bounded Dialog bodies.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
  - PASS with source-content waiver: new palette labels, hints, empty state and release loading/error copy use t() with ES. Core-authored action/onboarding labels and shipped CHANGELOG bullets remain source text, outside GUI catalog ownership.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.
  - PASS: Help is searchable on all tiers, shortcut reference comes from the registry, and contextual HelpTip/popovers remain covered by help-tips.spec.ts. Plain Search/Retry controls do not require extra explanatory tips.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
  - PASS: unfiltered axe WCAG 2/2.1/2.2 violations array empty for route, normal/empty palette, Help and nested shortcuts on desktop/mobile; register unchanged.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
  - PASS: recorded keyboard flow is Control+K → type destination/query → Enter or select → Escape; in Help, Tab past the user guides to Keyboard shortcuts → Enter → shortcut region → Tab/Done. Nested Escape returns focus to the Help shortcut trigger. Existing tests exercise arrows and canvas undo.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
  - PASS: overlays retain labelled dialog/listbox/region semantics and do not add a second route h1. Shortcut groups use labelled sections with semantic dl/kbd.
- [x] Live regions announce operations; no announcement spam.
  - PASS: one palette count status and one polite release-state region; decorative icons/illustrations are hidden from assistive technology.
- [x] Screen-reader spot check on one platform noted.
  - WAIVED audible screen-reader spot check: no native screen-reader application is available. Automated accessibility-tree, focus, live-region and axe checks are performed; no audible test is claimed.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.
  - PASS: 200% root text test scrolls every shortcut row, checks horizontal overflow and reaches Done on both profiles. Focusable labelled region fixes the previously inaccessible scroll body.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
  - PASS: commands continue through runtime.dispatch; core actor-filtered scene/character/map/saved-search/search/action reads retained. Only device-local GUI preferences use preference writes.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
  - PASS: readOnly hides Create and mutation rows; preview e2e dispatch is rejected by the runtime, not just hidden by the GUI.
- [x] Player projection of this surface verified through an actor read in an e2e.
  - PASS: e2e enters a generic player preview, reads the projected actor role through runtime.state, verifies no executable action rows, and observes runtime write rejection.
- [x] e2e on both profiles covers the primary task and one failure path.
  - PASS: both profiles cover primary navigation, canvas add/undo, help nesting, no matches, release-asset failure, retry reachability and preview refusal.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
  - WAIVED quantitative before/after budget: no dedicated palette ENG-1.1 baseline exists in this checkout. Search debounce and result caps remain unchanged, no new core scans were added, and Help mounts only when opened. Test durations below are validation durations, not a performance benchmark.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.
  - PASS: FEATURE-GAPS includes the global palette/help row. No architecture contract moved; optional DS localization/illustration props preserve existing consumers.

## Validation evidence

- Initial axe run found palette key/footer contrast failures; corrected the shared component's text token.
- The empty palette then exposed an ARIA listbox without an option; represent the no-results message as a disabled option, never a runnable command.
- Focused app tests: 5 files / 55 tests passed, including deferred release load failure/retry and existing help/registry tests.
- Final verification results are appended below after the fresh runs complete.

## Scope notes

- No native screen-reader application is available in this automation session. Accessibility-tree semantics, actual focus and axe are automated; an audible platform spot check is not claimed.
- Changelog bullets and core-owned action titles remain source-authored content; translating generated release history/core catalogs is outside this GUI surface. All newly authored GUI labels have ES entries.
- No release-note-specific illustration exists; use the shared loading skeleton and a warning icon with actionable text. Search empty state uses `search-none`.
- Help has no durable autosave or destructive command. Device-local recent ids and seen badges remain best-effort preferences.
- No architecture contract moves; the new palette label props are optional, preserving other DS consumers.

## Additional regressions found and fixed

- Help rendered Shortcuts as a sibling modal, so one Escape closed both. Nesting the overlay now follows the shared containment-based Escape contract and restores focus to its opener.
- Shortcut reference content could scroll but had no focusable element. Its labelled region now participates in keyboard navigation and passes axe.
- Axe scans wait for finite entrance animations to finish, avoiding contrast readings taken through a partially transparent transition. Rules and the known-violation register were not weakened.
- Legacy no-action assertions now require exactly one disabled No matches option instead of an invalid empty listbox with arbitrary text children.
- Typecheck caught a local state-name collision during cleanup; the runtime snapshot is explicitly named vaultState. Fresh full runs supersede intermediate runs during editing.

- Recovery e2e exposed cached dynamic-import rejection after a restored connection. ReleaseNotes now fetches its bundled local asset on each attempt, with an HTTP-status guard; no external service is involved. The recovery test requires actual version content after Retry.

## Final validation — 2026-09-20

Commands run from this task worktree; no push, promotion, dispatcher-state change or extra agent.

| Check                                                                                                                                                                                                                      | Result                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/help-menu.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/help-tips.spec.ts --workers=2` | 66 passed, both profiles (1.0m).                                                                                                                                                                                |
| Final affected test rerun: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts --workers=2`                                                                                            | 8 passed (15.2s), after the asset-fetch recovery fix. Includes actual keyboard-only Help opening, axe, nested Escape/focus, 200% text, player projection/refusal and successful Retry after restoring requests. |
| `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/help apps/gm-react/src/app/shortcuts`                                                                                                            | 5 files, 55 passed (5.26s) on final source.                                                                                                                                                                     |
| `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`                                                                                                                                  | Full pinned suite: 150 passed (2.7m).                                                                                                                                                                           |
| Final affected visual rerun: `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --update-snapshots=none --workers=2`                                                                                | 15 passed (23.4s), after the asset-fetch recovery fix; all 60 surface PNGs unchanged.                                                                                                                           |
| `node apps/gm-react/tests/visual/check-baseline-budget.mjs`                                                                                                                                                                | 195 baseline files, 15256.4 KiB / 32768 KiB.                                                                                                                                                                    |
| `pnpm --filter @dndtools/gm-react typecheck`                                                                                                                                                                               | Passed on final source.                                                                                                                                                                                         |
| Targeted ESLint: owned palette/help/shortcuts plus the shared DS palette                                                                                                                                                   | Passed with zero errors or warnings. Removed both obsolete help raw-style allowances.                                                                                                                           |
| `pnpm --filter @dndtools/gm-react build`                                                                                                                                                                                   | Passed; production bundle check excludes runtime test seams and component gallery. Existing chunk-size advisories remain outside this surface.                                                                  |
| `pnpm gates`                                                                                                                                                                                                               | Passed: 6 gates owned/budgeted/wired; 257 docs reachable, 287 relative links resolved. No size warning for owned paths. Existing warnings elsewhere are not changed.                                            |
| Prettier and `git diff --check`                                                                                                                                                                                            | Passed for intended changes.                                                                                                                                                                                    |

Owned maximum: CommandPalette.tsx 443 lines; paletteActions.ts 295; palettePresentation.ts 144; largest existing help file Spotlight.tsx 259. Journal and every remaining owned file are below 500.

Visual review: reviewed all five themes across desktop/rail/phone for populated palette, illustrated no-results, Help and Shortcuts. Re-reviewed the shortcut contact sheet after adding keyboard focus: the bounded content scrolls, focus is visible, footer Done remains reachable, and the longer phone rows wrap. Source release notes remain deliberately source-authored rather than pretending they have been translated.

## Rebase onto loop/rc `01a2077e` — 2026-09-24

The first attempt (2026-09-20, base `2d9f566d`) ran out of provider allowance before handoff. Its
branch was 128 commits behind `loop/rc`, so the commit was rebased onto `01a2077e` and everything
above that cites a validation run was re-run on the new base. The 2026-09-20 table is superseded by
the one below.

- Conflicts: `HelpMenu.tsx` against RC-DOC-1.3 (bundled user guides and the `HelpLauncher` top-bar
  trigger). Kept both: the guides, the guide dialog and the launcher from `loop/rc`, plus this
  story's `ReleaseNotes` lifecycle, nested `ShortcutsDialog` and spacing tokens. `FEATURE-GAPS.md`:
  took `loop/rc`'s table and re-added the Palette and help row.
- Visual budget: `loop/rc` sat at 32734.9 of 32768 KiB, so the 60 full-surface PNGs (2.6 MiB) would
  have failed `check-baseline-budget.mjs`. Probed crops in the pinned container: the whole
  no-results row cost 11 KiB/image, the illustration 5 KiB, the active row 2.3 KiB, the key chip
  0.5–0.6 KiB. `palette-help.spec.ts` now pins the search row's `esc` chip (the phone tier hides the
  footer) in 5 themes × 3 tiers; the budget ends at 32743.2 KiB.
- RC-DOC-1.3 put the guide buttons before Keyboard shortcuts, so Help's first focus is now a guide.
  The axe walk in `palette-polish.spec.ts` tabs forward to the trigger instead of expecting it
  focused; every axe scan passed before and after.
- The operator brief (2026-09-22) added `ds/components/command/CommandPalette.jsx` to owns. It was
  604 lines. `Kbd` and the result row now live in a new sibling,
  `ds/components/command/CommandPaletteRow.jsx` (175 lines), leaving the palette at 446. **Boundary
  crossing, originally flagged (resolved by the 2026-09-26 operator brief):** the new sibling was
  outside the original owned paths and is now explicitly owned. It is the smallest move that
  gets the owned file under 500 lines without having the DS import from `app/`. `ds/index.js` is
  unchanged: `Kbd` was never exported, and `CommandPalette` is re-exported as before.
- Also removed an empty fragment and a stray blank prop line left in the DS palette by the first
  attempt.

## Final validation — 2026-09-24 (base `01a2077e`)

| Check                                                                                                                                                                                                                      | Result                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/help-menu.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/help-tips.spec.ts --workers=3` | 66 passed, desktop-chromium + mobile-chromium (1.4m), after the row split. Includes the unfiltered axe walk (route, palette, no-results, Help, nested Shortcuts). |
| `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --update-snapshots=none --workers=2`                                                                                                             | 15 passed (46.5s) after the row split.                                                                                                                            |
| `node apps/gm-react/tests/visual/check-baseline-budget.mjs`                                                                                                                                                                | 429 files, 32743.2 of 32768.0 KiB.                                                                                                                                |
| `pnpm exec vitest run --config vitest.app.config.ts` over `app/help`, `app/shortcuts`, `ds`, `token-references`, `prepaint-motion`                                                                                         | 344 passed. `src/i18n`: 35 passed.                                                                                                                                |
| `pnpm --filter @dndtools/gm-react typecheck`                                                                                                                                                                               | Passed.                                                                                                                                                           |
| `pnpm lint` (raw-style count, full ESLint, boundary, emphasis, non-text contrast)                                                                                                                                          | Exit 0.                                                                                                                                                           |
| `pnpm --filter @dndtools/gm-react build`                                                                                                                                                                                   | Passed; `check-prod-bundle` OK.                                                                                                                                   |
| `pnpm gates`                                                                                                                                                                                                               | Exit 0. No `file-size-warn` for any owned path; the warnings it prints are for files outside this surface.                                                        |
| `pnpm format:check:changed -- --base origin/loop/rc`                                                                                                                                                                       | 16 changed files, all Prettier-clean.                                                                                                                             |

Owned files by size: DS `CommandPalette.jsx` 446 lines, app `CommandPalette.tsx` 443,
`shortcuts/registry.ts` 311, `shortcuts/paletteActions.ts` 295, `help/HelpMenu.tsx` 261. Every file
in the surface is under 500 lines, `CommandPaletteRow.jsx` (175) included.

## Resumed verification — 2026-09-27

- The preserved candidate is `9c44ea3d`; the worktree was clean on resumption. The operator now
  explicitly owns `CommandPaletteRow.jsx`, resolving the reported scope rejection. Its extraction
  keeps the DS palette below 500 lines without introducing a DS-to-app dependency. `Kbd` retains
  the contrast correction and the result row retains the existing rendering and event contract;
  no further edits to that file are needed in this pass.
- Preserved the candidate's EN/ES catalog entries, FEATURE-GAPS row, supporting tests and all
  15 pinned theme/tier baselines. The visual budget waiver and native screen-reader waiver above
  remain explicit; no full-overlay pixel coverage or audible screen-reader check is claimed.
- Removed one duplicate documentation-comment opener in `HelpMenu.tsx` left by the earlier merge;
  this changes no runtime behavior. All resumed edits remain inside the owned help directory.
- Headroom tools are unavailable in this session. Validation uses native commands and original
  logs; fresh results are recorded below.

### Fresh validation results

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/help-menu.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/help-tips.spec.ts --workers=2`:
  exit 0, **66 passed (1.3m)** across desktop-chromium and mobile-chromium. The unfiltered axe
  walkthrough passed on both profiles for the route, palette, no-results, Help and nested Shortcuts.
  Release-note failure/retry, player preview rejection and 200% text reachability also passed.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/help apps/gm-react/src/app/shortcuts`:
  exit 0, **5 files / 55 tests passed**.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm gates`: exit 0. Read the original output: all file-size warnings concern other surfaces.
  Current owned-file maximum is 446 lines (`CommandPalette.jsx`); the app palette has 443,
  `HelpMenu.tsx` 260, and `CommandPaletteRow.jsx` 172. Every owned file is below 500 lines.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: exit 0,
  **444 files, 32745.3 KiB of 32768.0 KiB**.
- `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --update-snapshots=none --workers=2`:
  exit 0, **15 passed (21.0s)** in the repository's pinned Playwright container. All five themes
  across desktop, rail and phone match the committed key-chip baselines; no baseline regeneration
  was needed. The documented full-overlay baseline budget waiver remains in effect.
- `pnpm exec prettier --check apps/gm-react/src/app/help/HelpMenu.tsx apps/gm-react/src/app/help/RC-POL-1.22.journal.md`:
  exit 0.

## Integration reconciliation — base `6dd4f09c1a0873491cb51a5c8f9da1367103e8f7`

The operator requested reconciliation after the integration rebase conflicted. Rebased the two
preserved task commits onto that exact integration commit, resolving all five conflicts:

- App palette: preserve RC-CAN-7.3's actor-filtered `useScreens`/`screenPaletteRows`, All screens,
  New screen intent, screen groups and screen destinations. Carry `screenCanvasRoute` into the
  extracted `shortcuts/paletteActions.ts` so canvas verbs still target the new `/screen/:id` routes.
- Shortcuts: retain the shared focusable labelled region and this task's token spacing/wrapping.
- DS palette: preserve the integration branch's `.jsx` → `.tsx` migration, exported command/props
  types, typed refs and shared `dsCopy` defaults. Add types for this task's optional localized labels
  and illustration; retain the disabled empty option, contrast fixes and extracted row. Condense
  the introductory comment to keep the typed component under 500 lines (495). The operator's
  explicit request to reconcile `CommandPalette.tsx` is the scope basis for editing the migrated
  owned component; the obsolete `.jsx` is not recreated.
- `CommandPaletteRow.jsx`: only the Icon import changes during reconciliation, from the removed
  `.jsx` filename to the extensionless import used by the migrated DS. Rendering stays unchanged.
- FEATURE-GAPS: retain every integration row and insert only this surface's Palette and help row.
- Raw-style allowlist: retain the integration branch's removals for other surfaces and remove only
  the two help entries made obsolete by this task. No old allowances are restored.

Fresh checks below supersede pre-rebase results. The existing visual-budget and native
screen-reader waivers remain explicit. No push, promotion, dispatcher-state edit or extra agent.

### Post-rebase validation

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0, including the migrated DS palette's props
  and typed ref callback.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/help apps/gm-react/src/app/shortcuts apps/gm-react/src/screens/screen apps/gm-react/src/ds apps/gm-react/src/i18n`:
  exit 0, **40 files / 382 tests passed**.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/help-menu.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/help-tips.spec.ts tests/e2e/screens.spec.ts --workers=2`:
  exit 0, **72 passed (1.5m)** on desktop and mobile. Both unfiltered axe walks passed; screen
  creation/switching through the palette, legacy board routing, canvas add/undo, preview refusal,
  release-note retry, nested focus return and large-text reachability passed.
- `pnpm lint`: exit 0; existing emphasis warnings remain within their baseline. Boundary and
  non-text contrast gates pass without widening any allowances.
- `pnpm --filter @dndtools/gm-react build`: exit 0; production bundle guard passes.
- `pnpm gates`: passed. Original output has 35 file-size warnings, all outside this surface.
  Independently counted all 20 owned files: maximum 495 lines (DS palette), app palette 442,
  shortcut registry 311, row 172.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: exit 0,
  **511 files, 32582.5 KiB of 32768.0 KiB**.
- `pnpm format:check:changed -- --base 6dd4f09c`: exit 0, 17 changed files checked.
- `git diff --check`: clean. Range-diff reviewed against the preserved commits; integration's
  screen navigation, DS typing/copy defaults, inventory rows and unrelated lint removals retained.
- `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --update-snapshots=none --workers=2`:
  exit 0, **15 passed (24.3s)**. All five themes × three tiers match the pinned key-chip baselines;
  no baseline regeneration needed after reconciliation. Full-overlay pixel coverage remains waived
  as documented above.

## Claim-gate retry — base `6dec65df` (loop/rc)

Gate feedback: "candidate changes paths outside its claim:
`apps/gm-react/src/ds/components/command/CommandPalette.tsx`". The task's Owns list now includes
that file, the typed DS palette that the integration branch migrated from `.jsx`. The edit
described in the reconciliation section above is therefore in scope, and its content is unchanged.

- Rebased the three task commits onto `loop/rc` `6dec65df` (67 commits newer than `6dd4f09c`). The
  rebase applied with no conflicts. Integration's `preferTier` change to `command-palette.spec.ts`
  and its FEATURE-GAPS, en/es and raw-style allowlist edits all merged alongside this task's.
- New on the base: RC-UX-1.5's DEV pseudo catalog must match `en.ts` key for key
  (`pseudo.test.ts`, `catalogCoverage('qps-ploc') === 1`). This task adds 11 palette/help keys, so
  `apps/gm-react/src/i18n/dev/qps-ploc.ts` was regenerated with
  `npx tsx scripts/i18n-catalog.ts pseudo`. The generator added 11 lines and no hand edits were
  made. The file is in the manifest's `companion_paths`, so no claim expansion was needed.
- No other files changed. Every owned file stays under 500 lines: DS palette 495, app palette
  442, `paletteActions.ts` 298, `HelpMenu.tsx` 260, row 172.

### Post-retry validation (on `6dec65df` + this branch)

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/help apps/gm-react/src/app/shortcuts apps/gm-react/src/screens/screen apps/gm-react/src/ds apps/gm-react/src/i18n`:
  2 failures before the pseudo regeneration (`pseudo.test.ts` exact match, `index.test.ts`
  coverage 0.998). After it: exit 0, **42 files / 390 tests passed**.
- `pnpm lint`: exit 0 (boundary and non-text contrast gates pass, allowances not widened).
- `pnpm --filter @dndtools/gm-react build`: exit 0; `check-prod-bundle` OK (pseudo locale absent
  from production assets).
- `DNDTOOLS_E2E_PORT=44201 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/help-menu.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/help-tips.spec.ts tests/e2e/screens.spec.ts --workers=2`:
  exit 0, **76 passed (1.6m)** on desktop-chromium and mobile-chromium, including both axe walks
  (route, palette failure, help and nested shortcuts).
- `pnpm gates`: exit 0. It printed 36 `file-size-warn` lines, none for an owned file (checked by
  grepping for `src/app/CommandPalette`, `src/app/help`, `src/app/shortcuts`,
  `ds/components/command`).
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: **571 files, 29947.1 KiB of
  32768.0 KiB**.
- `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --update-snapshots=none --workers=2`:
  exit 0, **15 passed (19.1s)**. All five themes on all three tiers match the committed baselines
  with no regeneration.
- `pnpm format:check:changed -- --base loop/rc`: exit 0. `git diff --check`: clean.

At this historical checkpoint, the visual-budget and native screen-reader waivers still applied.
The 2026-10-03 revision below removes the visual-budget waiver. No push,
promotion, dispatcher-state edit or extra agent.

`loop/rc` advanced to `e63f961e` while the checks above ran. That commit changes only
`scripts/android-emulator-acceptance.sh`, its unit test and a `state/` journal, none of which this
surface touches. I rebased onto it without conflicts and did not re-run the checks, since nothing
they cover changed. `git diff --name-only loop/rc..HEAD` lists only owned files and manifest
companion paths.

## Independent-review revision — 2026-10-03 (candidate `e523337f`)

The reviewer correctly identified that the old ~33 KiB headroom rationale was stale: the
current base used 29947.1 / 32768.0 KiB, leaving 2820.9 KiB. The visual-budget waiver is
withdrawn. Historical runs above describe earlier candidates, not current visual coverage.

- Replaced the 15 key-chip PNGs with 60 full visible-dialog PNGs: populated palette, illustrated
  no-results, Help with loaded release notes, and nested Shortcuts, each in tavern, parchment,
  scholar, dungeon and high-contrast at desktop, rail and phone sizes.
- `tests/visual/palette-help.spec.ts` uses real keyboard palette navigation, waits for release
  content, and focuses the labelled shortcut region. Fixed time, awaited fonts and the pinned
  projects' reduced motion/render settings retain deterministic capture. Dialog crops include
  the entire visible surface rather than unrelated shell chrome; existing scroll bounds stay
  intact. Offscreen shortcut rows remain covered by the 200% text reachability e2e.
- Scope: only the supporting visual spec/baselines and this owned journal change. These companion
  test assets directly implement the review request. No runtime/DS row edits are necessary;
  EN/ES/pseudo copy and the previously updated FEATURE-GAPS inventory remain unchanged.
- Visual review: inspected contact sheets for all 60 PNGs. Theme colors, selected palette rows,
  input focus, key hints, empty illustration and explanatory copy are visible. Help guide buttons
  and release text wrap within the phone dialog. Shortcuts retain two-column wrapping, bounded
  scrolling and visible Done; rail shows the complete list. Desktop/phone intentionally scroll
  longer content. No overlap or horizontal clipping of dialog content observed.
- The first generation run failed because an unqualified `region` locator matched the shortcut
  container and its two named sections. Qualifying it by `Keyboard shortcuts` fixed the spec;
  the corrected generation run passed all 15 cases (52.6s). No app behavior changed.

### Current validation

- `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --update-snapshots=none --workers=2`:
  exit 0, **15 passed (33.5s)**, comparing all 60 committed surface images without regeneration.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: exit 0, **616 files,
  32511.2 / 32768.0 KiB**, leaving 256.8 KiB. Budget limits are unchanged.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/palette-polish.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/help-menu.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/help-tips.spec.ts tests/e2e/screens.spec.ts --workers=2`:
  exit 0, **76 passed (2.1m)**, including route/normal palette/no-results/Help/nested Shortcuts axe
  scans on both desktop-chromium and mobile-chromium, failure/retry and large-text reachability.
- `pnpm gates`: exit 0. Original output reviewed: 36 file-size warnings, all outside owned paths.
  Largest owned source remains the DS palette at 495 lines. No allowance or limit changed.
- Targeted Prettier and ESLint: exit 0. `git diff --check`: clean.
