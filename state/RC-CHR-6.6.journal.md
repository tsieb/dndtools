# RC-CHR-6.6 run journal

- Implementing labelled DS phone tabs, More, header-first DOM focus order, honest connection status, translated kinds, collapsed private journal forms, character subtitles, display help and route titles.
- Supporting edits required in PrivateJournal, localization catalogs and browser/visual coverage. Existing private-note assertions retained; navigation/disclosure selectors adapted.
- No Headroom tools are exposed in this session; native exact command output used. No agents, push, promotion or dispatcher state changes.
- Validation in progress.

## Validation and corrections

- Typecheck, targeted ESLint, boundary lint and repository gates passed (existing size warnings only).
- New frame fixture initially used the GM-shell readiness helper on `/play`; corrected setup to seed on `/session` then enter companion preview.
- The 48dp check found the Join button still using its later-loaded 44px rule. Increased the scoped toolbar selector specificity; both desktop-profile 390px checks now pass, including axe at 200% text.
- Private-note reload on phone exposed a selector race: `isVisible()` ran before preview re-render. Phone navigation now selects More based on the test viewport and waits through the normal locator click. No persistence/sharing assertions changed.
- Pinned frame captures now cover all five themes on phone, rail and desktop. Existing golden `/play` captures are join-first, so retained those and expanded the separate stage captures to include the entire companion frame.
- Focused frame/private-note acceptance: **12/12 passed** on desktop and mobile projects, including 390px at normal/200% text, header-first keyboard focus, axe, 48dp controls, translated Handouts, note persistence, isolated sharing and rejected-share honesty.
- Full app unit run: 1,772 passed, one vocabulary failure in the new display-help sentence. Replaced fixed GM/DJ with the existing `{gm}` vocabulary token and regenerated pseudo locale; all 47 i18n tests then passed. The initial full run is not described as entirely green.
- Visual comparison exposed nondeterministic shared-handout ordering in the existing stage fixture (equal timestamps sorted by random IDs). Added the same deterministic UUID setup used by golden routes before generating the final baselines. Two initial golden-route boots also timed out under concurrent startup; final comparison pending.
- Broader companion regression: **52/52 passed** (`play-polish`, `player-inbox`, `player-join-first`, `co-dm` on both browser profiles). Existing selector-only adaptations use a companion navigation helper; covers all sections under axe, every theme, locked/elevated tiers, large-text reachability, QR and roster permissions.
- Final pinned `/play` comparison: **24/24 passed**, `--update-snapshots=none`, covering unchanged join-first baselines and deterministic whole-frame captures in five themes across phone/rail/desktop.
- The expanded captures add about 1.8 MiB versus prior heading-only snapshots. Increased the aggregate baseline allowance from 32 to 34 MiB to budget this requested coverage; the 320 KiB per-image cap is unchanged. Budget check passed at 33,936 KiB before display baseline refresh.
- Existing App-level `TitleFromHeading` already applies ENG-9.1 to `/play` and `/display`. Retained it rather than stacking competing hooks; added the same hook for the native standalone display (which bypasses App).

## Final verification

- Final frame spec: **6/6 passed** on both browser projects, including character subtitles and persistent display help. The route-title assertion follows the visible heading as ENG-9.1 specifies (`No scene on display`), not an unrelated fixed screen label.
- Golden-path player handout and scene-card journal-history checks passed on both profiles. Only the newly added fixed-title expectation failed in that wider run; it was corrected and passed in the final frame run above.
- Display help pins the projector's existing Tavern palette; it must not inherit the app theme. Updated and inspected the phone display image, plus phone Scholar and desktop Parchment companion frames.
- Final typecheck, targeted ESLint, Prettier, `pnpm gates`, `pnpm lint:boundary`, `git diff --check`, and baseline budget check passed. Aggregate images: 33,951.3 KiB / 34 MiB.
- No push, promotion, loop launch, dispatcher-state edits, or remote-CI claims. Independent operator gates/review remain external.
- Final pinned `/display` comparison: **15/15 passed**, `--update-snapshots=none`, across all five themes and all three tiers.

## Attempt 2 — explicit claim exceptions for operator review

The central claim gate rejected `src/screens/play/PrivateJournal.tsx` and
`tests/visual/check-baseline-budget.mjs` (paths relative to `apps/gm-react`).
Compared both files against base `ed6141404e7443ee425e804f6f024c8902f5512b`.
The working tree was clean before this follow-up; no unrelated changes were present.

Both changes are intentionally retained for the operator's claim decision:

- `PrivateJournal.tsx` owns all three private editors and their state. The owned
  `Journal.tsx` only renders `<PrivateJournal data={data} />`; it cannot introduce
  independent accessible disclosures inside that child. Reverting the child would
  restore the three open forms and remove the primary Write a note action, directly
  undoing the requested acceptance behavior. Keeping the existing component boundary
  also preserves its device-local persistence and sharing implementation; no duplicate
  journal implementation or imperative DOM manipulation was introduced.
- `check-baseline-budget.mjs` budgets the requested full-frame theme snapshots while
  retaining the existing join-first and other route baselines. The current exact check
  reports 652 PNGs, **33,951.3 KiB**. The base's **32,768 KiB** cap cannot accommodate
  this retained coverage. The change raises only the aggregate allowance to 34 MiB;
  the 320 KiB per-image limit and screenshot comparison tolerances are unchanged.
  Reverting this file alone would knowingly leave the baseline gate failing. The
  operator may instead require a different snapshot coverage/budget tradeoff.

This follow-up changes only the run journal and records the exception rationale in
its commit message. It does not widen the claim, alter dispatcher state, or claim that
admission is fixed. The task remains blocked pending the operator's decision whether
to include these two paths. Existing implementation/test evidence above is unchanged;
this follow-up reran the baseline budget check and `git diff --check`, not the browser
suites. Headroom tools remain unavailable; original native output was inspected.

## Attempt 3 — rebased onto loop/rc after the claim was widened

The operator brief (2026-10-04) widened the claim to `PrivateJournal.tsx` and
`check-baseline-budget.mjs`, so both stay as they were. `loop/rc` had moved to `ae852b4e`,
and a trial merge conflicted in `Frame.tsx`. The branch is rebased onto it. The only conflict
was the import block: RC-CHR-6.2's `CoreCommand` import and this story's `BottomTabBar`
import are both kept. RC-CHR-6.2's sheet-write wiring (`writeSheet`, `sheetWrites`,
`NO_SHEET_WRITES`) is intact.

Selector-only fixes for specs that arrived with the new base:

- `companion-sheet.spec.ts` (new in RC-CHR-6.2) clicked `My character`. On phones the tab is
  now labelled `Sheet`, so the test timed out on mobile-chromium. It now uses the shared
  `selectCompanionSection` helper. Assertions are unchanged.
- `responsive.spec.ts` "a Co-DM can reach every elevated standalone player tool at compact
  phone size" looked for Maps/Bestiary/Combat assist inside the nav. At 375px those tools now
  sit under More, so the test opens More and then finds each tool in `#player-main`. The
  geometry, enabled, in-viewport, heading and overflow assertions are unchanged.

Visual: all 15 `play-stage--*` captures differed only in the Party vitals tile, by about
1px. That comes from the base's RC-POL-1.7 change to `app/character/PartyPanel.tsx`, which
this branch does not touch. They were re-baselined in the pinned container with
`--update-snapshots=changed`.

Verification on the rebased tree (local and native output; operator gates still pending):

- `gm-react` typecheck, targeted ESLint, Prettier and `lint:boundary` passed.
- `pnpm test:app`: 166 files, 1,950 tests passed.
- e2e on both projects: companion-frame, player-private-notes, play-polish, player-inbox,
  player-join-first and co-dm passed 66/66. companion-sheet passed 2/2 after the edit.
  responsive, golden-path, scene-cards and shell-polish passed 270/272 before the edit, and
  the 2 failures (the Co-DM test above) pass after it. a11y-axe-gate, collab, equipment,
  command-palette, join, player-view and route-titles passed 171/171.
- Pinned container, `--update-snapshots=none`: play-polish, player-polish, and golden-routes
  filtered to `play|display|player` passed 69/69 across the three visual tiers.
- Baseline budget: 753 files, 34,165.9 KiB of 34,816 KiB.

## Attempt 4: Lint gate (emphasis lint)

The operator's Lint gate failed on `e210c1dc`. `lint:emphasis` reported
`PrivateJournal.tsx multiple-accent-primaries 1 > 0`. The toggle used
`variant={writing ? 'secondary' : 'primary'}` next to an always-primary Save button. At runtime
they were never primary together, but the static count can only see exclusivity through
branches. The Notes panel now renders a ternary: collapsed shows the primary "Write a note",
and open shows a secondary toggle plus the primary Save. The toggle props are shared. Both
branches are fragments that lead with the toggle, so React keeps the same button. I did not
touch `scripts/emphasis-baseline.json`, which this task does not own.

Verification (local, native output):

- `pnpm lint`: exit 0. Emphasis `multiple-accent-primaries` is 41 against a baseline of 58,
  and `PrivateJournal.tsx` is no longer listed.
- `gm-react` typecheck and Prettier passed.
- Vitest for `src/screens/play`: 3/3 passed.
- e2e on both projects: player-private-notes, play-polish and companion-frame passed 34/34.
- A throwaway probe (deleted, not committed) checked that Enter on "Write a note" opens the
  editor with focus still on the toggle and `aria-expanded="true"`, and that Enter again
  closes it with focus kept. It passed 2/2 on desktop and mobile.
- No visual baseline captures the journal, and the toggle renders the same as before, so no
  snapshots changed.
