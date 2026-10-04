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
