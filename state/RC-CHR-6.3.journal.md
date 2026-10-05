# RC-CHR-6.3 run journal

## Implementation

- Separate public PC summary permission from full-sheet sharing; preserve observer ceiling and NPC visibility.
- Explicit identity/vitals projection, including portrait asset ID and level. Restrict companion resource enrichment to sheet readers.
- EN/ES sharing explanations; no schema change.
- Headroom tools unavailable in this session; native command output used.
- Focused core isolation suite: 23 passed. Companion projection suite: 11 passed.
- Core and app TypeScript checks passed. Targeted ESLint passed.
- Real two-context WebRTC joined-companion e2e passed: three PCs with sheets shared to another player, live DM HP propagation.
- First e2e attempt omitted the host-start button; corrected test setup and reran successfully.
- Initial app-config test invocation excluded net tests; used the cloud config. Typechecking caught an overbroad edit in the separate own-PC read; corrected and reran typecheck and projection tests.
- Broader character core suite: 174 tests / 10 files passed (`pnpm --filter @dndtools/core exec vitest run character`). An initial glob filter matched no tests; the character filter ran the intended suite.
- Final acceptance e2e: 6 passed across desktop and mobile (`party-summary.spec.ts`): real joined companion, three private-sheet PCs, DM HP change, EN/ES copy.
- Mobile test setup initially tried the desktop host control in a phone viewport; now the host is desktop and the joined companion uses the project viewport.
- Boundary lint and raw-style-count gate passed (966 values / 118 files).
- Initial full pinned-container visual run stopped after expected /play diffs and an audio loading/failure test failure; not a passing full gate. Narrowed to relevant character/player routes.
- Focused visual comparison found exactly nine intended /play diffs (three themes × three tiers), with 54 other checks passing. Inspected desktop/phone captures, fixed the compact You badge wrapping, and updated only those nine baselines inside the pinned container.
- Final pinned-container comparison: **63 passed** (1.2 minutes), no snapshot updates:
  `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2 -g '(/play|characters|character builder|play stage)' --output=test-results-party-summary`.
- Final acceptance browser command: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/party-summary.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1` (6 passed).
- Formatting and `git diff --check` passed. The central operator retains full-gate/independent-review responsibility.
- Portrait summaries carry the existing content-addressed asset ID; rendering uses the existing asset resolver with initials when local asset bytes are absent. This task adds no asset-transfer protocol.
- Integration-path additions outside the listed production paths: companion adapter, shared party panel, locale catalogs, and tests are necessary to carry/render public summaries safely. No dispatcher state edits, push, promotion or additional agents.

## Claim-gate follow-up

The claim gate rejected `apps/gm-react/src/net/viewModels.ts` and
`apps/gm-react/src/app/character/PartyPanel.tsx`. Retain these changes for an explicit operator
claim decision, using the exception provided in the follow-up instruction; this does not widen
ownership or mark the gate passed.

- **Companion adapter (`viewModels.ts`):** expanding the core party membership exposes a previously
  unreachable path in `buildPartyVitals`: it reads resources directly from the full character
  record. Reverting this adapter to base `6dcb0a00303bffac6a9c53a3d1f40ec4caffeadf` while keeping the
  new core projection makes the summary-only peer regression fail. The peer receives `Hold person`,
  death saves and per-level spell slots despite having no sheet access; portrait and level are also
  absent from the vitals payload. The adapter must check sheet access before resource enrichment
  and carry the projected portrait/level. Hiding these in `Presence.tsx` would leave them in the
  transmitted payload. Verified by temporarily loading the base adapter, running the focused
  regression (expected exit 1), and restoring the implementation byte-for-byte in a `finally` block.
- **Shared Party rows (`PartyPanel.tsx`):** `Presence.tsx` delegates its phone and desktop rows to
  `PartyQuickPanel` and `PartySheet`. Their shared `MemberRow` is where the required portrait and
  level are rendered. Reverting removes both from that existing presentation path. Keeping this
  small shared-renderer change avoids introducing duplicate party rows in `Presence.tsx`; the badge
  shrink fix keeps the newly expanded three-PC summary readable.
- After restoring the adapter, all 11 companion projection tests passed. No production code changed
  during this follow-up; prior browser/visual evidence remains recorded above. Full acceptance is
  still subject to the operator's ownership decision and independent gates/review.

## Claim widened (operator brief 2026-10-04)

- The operator widened the claim to `apps/gm-react/src/app/character/PartyPanel.tsx` and
  `apps/gm-react/src/net/viewModels.ts`, so both retained changes now fall inside the claim. No
  production behaviour changed in this pass.
- Small tidy in `party-overview.ts`: moved the resource-access comment next to the
  `availableSpellSlots` / `availableClassResources` fields it describes and removed a stray blank line.
- Re-ran: core isolation suite `tests/character-party-and-player-records.test.ts` 23 passed;
  `src/net/viewModels.test.ts` 11 passed; core `tsc --noEmit` exit 0; gm-react `typecheck` exit 0;
  prettier check of the edited file passed. The e2e and visual evidence above was not re-run here
  (no UI change since then).
- ⚠️ Integration note: `loop/rc` is 77 commits past this branch's base `6dcb0a00`.
  `git merge-tree HEAD loop/rc` reports a content conflict in `PartyPanel.tsx` (from `40b262ab`
  RC-POL-1.7 and `eb9e529a`) and binary conflicts in the nine `/play` visual baselines. I did not
  rebase, so the claim diff stays measured against the recorded base. Integration needs a rebase
  and a fresh `/play` baseline capture on top of current `loop/rc`.

## Rebase onto ae852b4e (integration reconcile, 2026-10-05)

- Rebased the three task commits onto `ae852b4e`. Conflicts:
  - `PartyPanel.tsx` `MemberRow`: kept the base's token styling (RC-POL-1.7) and re-applied the
    portrait `src` and level label. The level label now uses the same `var(--text-xs)`/`T.ter` style
    as the AC label. The board-tile "You" badge `flexShrink: 0` merged cleanly and is unchanged.
  - Nine `/play` baselines: took the base versions. Since `eb9e529a`, the `/play` golden route shows
    the join-first screen (no seat, no party rows), so this change no longer moves those captures.
    The branch now changes no PNGs.
- Base drift fixed after the rebase:
  - RC-CHR-6.2 (`210310fd`) removed `characters.levelValue` as orphaned copy. The party row now uses
    a new `play.party.level` key (EN "Level {level}", ES "Nivel {level}").
  - RC-CHR-6.2 reshaped `SheetSubject.sharing` (no `kind`). `SharingPanel` now checks `view.kind`.
  - The vocabulary test bans a hard-coded "DM" in catalogs. `characters.shareHidden` and
    `characters.sharedWithNobody` now use `{gm}` in EN and ES.
  - Regenerated `src/i18n/dev/qps-ploc.ts` (`tsx scripts/i18n-catalog.ts pseudo`). The previous
    attempt had changed and added copy without regenerating it.
- Validation on the rebased tree:
  - core `tsc --noEmit` exit 0; gm-react `tsc --noEmit` exit 0
  - core `vitest run tests/character-party-and-player-records.test.ts character`: 174 passed / 10 files
  - gm-react `vitest run src/i18n src/screens/characters src/net src/app/character src/screens/play`
    (excluding Playwright `*.spec.ts`): 143 passed / 16 files. Before the `{gm}` fix,
    `vocabulary.test.tsx` failed on `characters.shareHidden`, which is how the issue was found.
  - `pnpm lint`: exit 0 (raw-style count, eslint, boundary, emphasis and contrast). The emphasis
    warnings are pre-existing on the base.
  - `playwright test tests/e2e/party-summary.spec.ts --project=desktop-chromium
    --project=mobile-chromium --workers=1` with `DNDTOOLS_E2E_PORT=32967`: **6 passed**. This covers
    a real joined companion seeing three private-sheet PCs, live DM HP propagation, and the EN/ES
    Sharing copy.
  - Pinned container: `run-in-container.sh --update-snapshots=none --workers=2
    -g '(/play|characters|character builder|play stage|player)'`: **69 passed** (1.7m), with no
    snapshot updates.
