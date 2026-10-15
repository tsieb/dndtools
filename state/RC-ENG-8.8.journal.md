# RC-ENG-8.8 — A built PC carries the scores and stats the builder shows

## 2026-10-15 — implementation

- Base: `91621bae3`; task branch `dispatch/dndtools/e2a94b12a0eb97110fcc`.
- Choice made: APPLY the ancestry bonus (not drop the label). Core owns one ancestry table
  (`DRAFT_ANCESTRY_OPTIONS`, SRD increases incl. the half-elf's two free +1s); the identity step
  gains an optional `ancestry` field (5e-shaped packages only); finalize adds the bonus after the
  abilities step's point-buy/pool check, capped at 30.
- DEBT-2026-006 shape as suggested: DM-only `abilityScorePool` on `character.create-draft`, recorded
  on `CharacterDraft`, length-checked against the active package; the abilities step is then valid
  as a permutation of the pool and point buy does not apply. The owner cannot change it.
- Hit die / saves / initiative are written by the builder (DM `character.set-proficiencies` +
  `data.init`) rather than by `finalize-draft`, so the demo seed's PCs and their visual goldens do
  not change shape. The builder already holds the class table (hd, saves) for all 12 classes.
- Out-of-claim edit: `packages/core/src/index.ts` — barrel exports for the new pure helpers
  (additive lines only); the app can import core only through it.
- Builder: every score method is offered to a PC; the scores step shows each ancestry bonus
  ("+2 → 16", with a screen-reader sentence) and the half-elf's two +1 picks; the Review card gains
  hit dice and proficient saving throws. The old `charBuilder.pcUsesPointBuy` copy is removed
  (en/es; qps-ploc regenerated). The sheet marks proficient saves with the skills legend's `•`.
- The sheet's "0/0 d8" for a character with no hit-dice data is left as is: the `/player` visual
  golden clips that panel, and the fix is that built characters now carry real hit dice.
- Out-of-claim edit (gate-required): `docs/requirements/FEATURE-GAPS.md` — one anchor line number
  `en.ts:5589` → `5594` (same width, 1-line diff); the new en.ts keys shifted it and
  `tests/unit/feature-audit.test.ts` pins it.

## Verification (local, 2026-10-15)

- `CI=true pnpm test`: core 301 files / 5418 tests, cloud 569, app 198 files / 2395, tooling
  1 failure (feature-audit line anchor) → re-pinned, `tests/unit/feature-audit.test.ts` 7/7.
- New core tests: `packages/core/tests/character-draft-pool-and-ancestry.test.ts` (13).
- e2e, desktop-chromium + mobile-chromium, `DNDTOOLS_E2E_PORT=5391`:
  `char-builder-sheet-parity.spec.ts` (Dwarf Fighter + rolled Half-elf Rogue, sheet vs Review
  card) and `char-builder-steps.spec.ts` — 16/16 passed. Neighbours (`char-builder-polish`,
  `authoring-layout`, `character-sheet`, `characters-roster`, `characters-polish`,
  `character-levelup`, `character-rest`) — 64/64 passed.
- `pnpm typecheck` 0; `pnpm lint` 0 (emphasis warnings are the existing baseline).
- Self-review fix: the builder now gates the ancestry bonus/picks/tile labels on `ancestryApplies`
  and sends a pool only when the active package has six attributes — otherwise a Generic-system PC
  would have been refused at `create-draft` (pool size) and shown a bonus finalize never adds.
  Re-ran: builder/sheet/i18n unit tests 90/90; `char-builder-sheet-parity`, `char-builder-steps`,
  `char-builder-polish` on both profiles 24/24.

## 2026-10-15 — integration conflict recovery

- Rebased the restored implementation onto `6b8d7e215604929c185f9aa61ae45cedb0a368d2` on the
  current task branch. The only conflict was `docs/requirements/FEATURE-GAPS.md`.
- Preserved the integration branch's refreshed inventory anchors and palette keyword cleanup;
  refreshed the builder-shifted `Subscribe at {host}` anchor to the merged catalog's actual
  `en.ts:5593`. No dispatcher control state changed; no push or promotion.
- Fresh checks after reconciliation: pool/ancestry core tests 13/13; feature inventory tests 7/7.
- Fresh builder e2e: `char-builder-sheet-parity.spec.ts` and `char-builder-steps.spec.ts`,
  desktop-chromium + mobile-chromium, 16/16 passed. Dwarf Fighter and rolled Half-elf Rogue sheets
  match the Review cards on both profiles.
- Focused app tests (`charBuilder`, `AbilitiesPanel`, i18n): 8 files, 75/75 passed, including the
  generated pseudo catalog consistency test. Changed-file Prettier check passed.
- `pnpm typecheck` passed; `pnpm lint` passed (15 ESLint warnings in unchanged files; emphasis
  warnings remain below the existing baseline; boundary and non-text contrast checks passed).
- Pinned-container visual check passed: 249/249 across desktop, rail, and phone, with no retries
  or baseline updates. Command: `CI=true DNDTOOLS_PW_WORKERS=2
apps/gm-react/tests/visual/run-in-container.sh tests/visual/golden-routes.spec.ts
tests/visual/char-builder.spec.ts tests/visual/characters-polish.spec.ts
tests/visual/player-polish.spec.ts` (9.8 minutes).
- The initial unfiltered visual invocation was deliberately interrupted after four passing tests
  to select these suites; that interrupted invocation is not a passing gate.
- `git diff --check` passed. The requested integration commit is an ancestor of this task branch.
  Central wrapper gates and independent review remain the operator's next step.

## 2026-10-15 — second integration conflict recovery

- Rebased the restored `8cc00950d` implementation onto
  `19f262987147dd96befbe044e067dbda687d226c` on the current task branch. The only conflict was
  `docs/requirements/FEATURE-GAPS.md`; retained the integration version and corrected the
  builder-shifted `Subscribe at {host}` anchor from `en.ts:5591` to the merged `en.ts:5596`.
- Incoming RC-ENG-8.12 character-history changes, translations, and barrel exports are preserved.
  The implementation patch is otherwise unchanged. DEBT-2026-006 remains in Resolved.
- Fresh core verification: `character-draft-pool-and-ancestry.test.ts` and
  `character-history-events.test.ts`, 28/28 passed. Feature inventory 7/7 passed. Focused app tests
  (`charBuilder`, `AbilitiesPanel`, i18n) 75/75 passed, including pseudo catalog consistency.
- Fresh e2e: `char-builder-sheet-parity.spec.ts` and `character-history.spec.ts`, 10/10 passed on
  desktop-chromium and mobile-chromium (1.1 minutes). Both requested PCs match their Review cards.
- Fresh pinned-container visual checks: 48/48 passed across desktop, rail, and phone (2.4 minutes),
  without retries or baseline changes. Used `golden-routes.spec.ts`, `player-polish.spec.ts`, and
  `char-builder.spec.ts` with `--grep 'character builder|player sheet|/characters|/play$'`,
  `CI=true`, and `DNDTOOLS_PW_WORKERS=2` through `tests/visual/run-in-container.sh`.
- `pnpm typecheck`, changed-file Prettier, and `git diff --check` passed. Prior broad checks above
  describe the previous integration base; central wrapper gates and independent review remain
  the operator's next step.
- No push, promotion, dispatcher control-state changes, or additional agents.

## 2026-10-16 — third integration conflict recovery

- Rebased restored commit `2749e76c0` onto requested integration commit
  `144f5f6cf910715300e34645500a1ef9c4bd6080` on the current task branch.
- Resolved `DEBT.md` by retaining both resolutions: incoming RC-ENG-8.10 closes DEBT-2026-007,
  while this task closes DEBT-2026-006. Neither obsolete open entry is restored.
- Retained the integration inventory's Settings push-delivery limitation and cleared Player-app
  limitation in `docs/requirements/FEATURE-GAPS.md`; corrected only the builder-shifted
  `Subscribe at {host}` anchor to the current `en.ts:5596`.
- No Headroom tools are available in this session; native tools retain the original command output.
- Fresh validation is in progress. Earlier verification above describes previous integration bases.
- No agents, push, promotion, or dispatcher control-state edits.
- Fresh core pool/ancestry and character-history tests: 2 files, 28/28 passed (the additional
  `character-draft-flow.test.ts` filter matched no file and is not counted as coverage).
- Fresh feature inventory tests: 7/7 passed. Builder, AbilitiesPanel and i18n app tests:
  8 files, 82/82 passed, including incoming vocabulary coverage and pseudo catalog consistency.
- Fresh e2e: `char-builder-sheet-parity.spec.ts` and `char-builder-steps.spec.ts`, 16/16 passed
  on desktop-chromium and mobile-chromium, with no retries. The Dwarf Fighter and rolled Half-elf
  Rogue both match their Review cards on each profile.
- `pnpm typecheck` passed. Range comparison confirms the restored implementation code is unchanged;
  only the two documented conflict resolutions differ from its original patch.
- Initial changed-file formatting check caught one extra blank line in the DEBT conflict resolution;
  formatted `DEBT.md` and reran the check.
- Fresh pinned-container visual checks: 48/48 passed across desktop, rail and phone (1.5 minutes),
  without retries or baseline changes. Command: `CI=true DNDTOOLS_PW_WORKERS=2
apps/gm-react/tests/visual/run-in-container.sh tests/visual/golden-routes.spec.ts
tests/visual/player-polish.spec.ts tests/visual/char-builder.spec.ts
--grep 'character builder|player sheet|/characters|/play$' --update-snapshots=none`.
- `pnpm lint` passed (15 ESLint warnings in unchanged files; emphasis warnings below baseline;
  boundary and non-text contrast checks passed). Changed-file Prettier and `git diff --check`
  passed after formatting. No baseline updates or unrelated edits.
- The requested integration commit is now an ancestor of the task branch. Central wrapper gates
  and independent review remain the operator's next step; this targeted run is not the full gate.
