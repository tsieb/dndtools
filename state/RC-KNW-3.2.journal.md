# RC-KNW-3.2 run journal

## Plan

- Finish DS campaign card composition and add pinned-container visual acceptance.

## Decisions

- Headroom tools are unavailable; native exact command output is used.
- Existing QuestCard status/checklist and NpcCard references already follow the vendored DS. Preserve those contracts and role-projected reads.
- Add an opt-in SessionTimeline arc layout; other consumers retain the vertical log.
- No agents, push, promotion, branch changes or dispatcher control mutations.

## Ledger / Edits made

- QuestCard.tsx / Campaign.tsx — contain visibility and editing controls in a card footer — DONE.
- NpcCard.tsx — wrap long names and reference text without clipping keyboard focus — DONE.
- Campaign.tsx — faction display typography, card spacing and wrapping; timeline arc composition — DONE.
- SessionTimeline.tsx — keyboard-scrollable arc strip with current-step semantics — DONE.
- Visual snapshots and validation — PENDING.

## Validation progress

- PASS: app typecheck and app unit suite (152 files / 1,698 tests), exact logs `/tmp/knw-types.log`, `/tmp/knw-app.log`.
- PASS: campaign e2e on desktop and mobile (12 tests), `/tmp/knw-e2e.log`; authoring, persisted objectives/status, role projection and NPC keyboard navigation remain covered.
- PASS: scoped ESLint after preserving the existing screen wrapper/spacing allowance; no allowance file changed, `/tmp/knw-lint-final.log`.
- Initial visual capture created missing baselines (expected nonzero creation run); the first comparison passed all three tiers. Subsequent faction typography/spacing reconciliation required recapture; final comparison pending.
- Reviewed phone quest/NPC/faction/arc captures and final desktop faction capture visually.
- Snapshot budget initially exceeded the shared 32 MiB cap. Kept desktop/phone captures of all four surfaces, rail captures of the distinct quest/arc layouts; omitted duplicate rail NPC/faction images. Lossless IDAT compression only on new PNGs. Final budget: 496 images, 32,747.1 KiB of 32,768 KiB. No existing baseline changed and no budget raised.
- `pnpm check` underway; final pinned comparison includes nine existing campaign golden-route cases and three new card/arc cases, with keyboard scrolling and page-overflow assertions.

## Final validation

- PASS: pinned-container visual comparison, 12 tests (nine existing golden-route theme/tier combinations plus three new campaign-card cases); `/tmp/knw-visual-verified.log`. Ten new PNG baselines committed as acceptance evidence. Keyboard arc scrolling and no page overflow pass.
- PASS: scoped ESLint, baseline-size budget and `git diff --check` on the final implementation.
- INTERRUPTED: composite `pnpm check` exited 143 during its app suite, without an assertion diagnostic. Its earlier stages passed: system validation, Android check, quality gates, boundary lint, all package typechecks, 5,162 core tests and 551 cloud tests. Original `/tmp/knw-check.log` inspected. Completing app/tooling stages separately; not claiming the composite exited zero.
- PASS: final app suite, 152 files / 1,698 tests (`/tmp/knw-app-final.log`), and remaining tooling stage, 30 files / 228 tests (`/tmp/knw-tooling-final.log`); combined continuation command exited 0. All `pnpm check` stages have now passed across the interrupted run and its continuation.
- PASS: final campaign e2e rerun, 12/12 desktop/mobile cases (`/tmp/knw-e2e-final.log`).
- PASS: Prettier check of every touched source, test, README and journal; final whitespace check.

## Report

- DONE RC-KNW-3.2: integrated quest footer, readable NPC references, faction card alignment and keyboard-scrollable campaign arc; visual acceptance captured and compared in the pinned container.
- Ten new snapshots, scoped component contract documentation and this journal accompany the implementation commit on the current task branch.
- Central operator gates and independent review remain separate. No push, promotion, loop launch, agents or dispatcher control writes.

## Independent review correction

- Reproduced the review failure on `7e821605`: 496 baseline files total 33,556,290 bytes, exceeding the unchanged 33,554,432-byte cap by 1,858 bytes. The earlier final budget claim above does not describe that committed candidate and is superseded by this correction.
- Recompress only this task's ten new campaign PNGs using Zopfli DEFLATE. Preserve every snapshot, dimensions, PNG filter bytes and decompressed scanline bytes, and all non-IDAT chunks. No application code, test coverage or budget limits change.
- PASS: independent PNG parsing verifies valid CRCs, identical decompressed scanlines and identical non-IDAT chunks for all ten changed baselines versus `7e821605`. Saved 7,259 bytes; final baseline total is 33,549,031 bytes, 5,401 bytes below the unchanged cap. All 496 baselines retained.
- PASS: `node apps/gm-react/tests/visual/check-baseline-budget.mjs`; pinned-container `--update-snapshots=none --workers=2 -g campaign` comparison, 12/12 tests (`/tmp/knw-review-visual.log`, original output inspected); journal Prettier and `git diff --check`.
- Final commit verification uses the same budget and pinned comparison commands, with exact-SHA output retained in `/tmp/knw-review-final.log` for operator review. Application code is unchanged by this repair.
