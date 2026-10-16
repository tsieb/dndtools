# RC-ENG-8.10 run journal

## Scope and implementation

- Task branch: `dispatch/dndtools/cd23b19622939b768714`.
- Translate shipped 5e and Generic vocabulary in the UI value producer for Spanish;
  preserve customized vocabulary and English behavior. No core schema changes.
- Initial implementation (superseded by the custom fork follow-up below): complete vocabulary
  matching survives vault hydration. The producer receives vocabulary,
  not package identity: an exactly identical copy is treated as the shipped vocabulary;
  any authored word change preserves the entire authored set.
- Adjust Spanish sentences to accommodate masculine conjuros and feminine habilidades.
- Render all fourteen affected messages through the actual providers for both packages;
  additionally cover custom words, locale/package changes, regional locales and immutability.
- Move DEBT-2026-007 to Resolved.
- Headroom tools unavailable; native command output used. No agents or dispatcher mutations.

## Validation

- Initial focused vocabulary suite: 1 file, 14 tests passed.
- Broader i18n run initially caught catalog placeholder parity after changing spell to
  spellLower. Restored source placeholder names and revised phrasing within that contract.
- Final `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/i18n/`:
  4 files, 52 tests passed, exit 0.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- Focused ESLint on the three changed TypeScript files: exit 0, no warnings.
- Prettier check on all five intended files and `git diff --check`: exit 0.
- No browser or pinned visual gate run locally; central operator owns remaining gates.
- Implementation prepared for commit on the current task branch; no push or promotion.
- Central operator gates and independent review remain external to this implementation.

## Review follow-up (custom fork pass-through)

- Review finding: matching on vocabulary equality translated an unedited `custom:` fork
  (system.fork deep-copies vocabulary). Fixed by keying Spanish vocabularies on package id;
  `VocabularyProvider`/`vocabularyValues` take `packageId`, and `AppSystemProvider` passes
  `activePackage.id` (one-prop crossing into `apps/gm-react/src/app/SystemContext.tsx`, required
  because the provider had no provenance). Built-in ids are re-seeded from the build, never authored.
- Added regression: unedited forks of 5e and Generic render "Level up"/"Espacios de Spell" and
  "Advance"/"Espacios de Ability" under Spanish; actual built-ins still translate.
- `vitest run --config vitest.app.config.ts apps/gm-react/src/i18n/`: 4 files, 54 tests passed.
- Provider-consumer tests (`*.test.tsx` using AppSystemProvider/VocabularyProvider): 16 passed.
- gm-react typecheck exit 0; focused ESLint exit 0; prettier written; `git diff --check` clean.

## Claim-scope decision (SystemContext.tsx)

- Gate flagged `apps/gm-react/src/app/SystemContext.tsx` as outside the claim. Kept deliberately:
  the acceptance criterion "a custom package keeps its own words" needs package provenance, and
  `AppSystemProvider` is the only place that has it. Without the id, an unedited `custom:` fork is
  indistinguishable from a built-in (the review's medium finding).
- Owned-path alternatives checked and rejected: object identity (`hydrateSystemsState` and
  `getActiveSystemForActor` both `cloneSystemPackage`, so built-ins never arrive by reference);
  reading the runtime from `vocabulary.tsx` (`RuntimeCtx` is not exported and `useRuntime` throws
  outside a provider; catching that would invert the i18n → runtime layering).
- The crossing is one JSX prop (`packageId={activePackage.id}`); no behavior change for English.
- Task expected to block for the operator to decide whether to widen the claim.

## Self-heal round 1: widened claim

- The scheduled task now explicitly includes `apps/gm-react/src/app/SystemContext.tsx` and
  instructs retaining the package-id crossing. The prior claim-scope blocker is addressed by
  that authorization; the existing implementation commits remain intact on the task branch.
- Re-inspected all fourteen Spanish message assertions for both shipped packages, custom
  vocabulary and unedited-fork pass-through, and the Resolved entry for DEBT-2026-007.
- Fresh i18n validation: 4 test files, 54 tests passed (exit 0).
- Fresh gm-react typecheck and focused ESLint on all four owned TypeScript files passed (exit 0).
- Fresh Prettier check on all five owned files passed; `git diff --check` passed.
- No Headroom tools available. No agents, push, promotion, or dispatcher control edits.
- Central operator gates and independent review remain pending; no browser/visual gate claimed.

## Visual-gate feedback investigation

- Read the original output of attempt `b7522d46-d8c5-4b5b-9fe0-39e875b0ed5f`:
  587 passed, one failed. The phone/parchment GM Screen test timed out after 5 seconds
  waiting for `/board` to redirect to `/screen/`; it did not reach the screenshot assertion.
- The original error context showed English chrome and `Loading your vault…`. `App.tsx`
  uses that fallback while lazy routes load, including `BoardAlias`. Runtime hydration alone
  does not guarantee that route loading and home-screen provisioning have completed.
  This is consistent with a route-readiness timing failure, not evidence of a Spanish pixel diff.
- Pinned-container reproduction, unchanged code and baselines:
  `apps/gm-react/tests/visual/run-in-container.sh tests/visual/board-polish.spec.ts --project=visual-phone --grep parchment --repeat-each=3`
  passed all 3 repetitions (exit 0). The reported failure did not reproduce.
- No Headroom tools available; inspected native original log output and the error-context file.
  No application fix or baseline update is justified by the evidence so far.
- Broader pinned comparison:
  `apps/gm-react/tests/visual/run-in-container.sh tests/visual/board-polish.spec.ts --update-snapshots=none --workers=2`
  passed all 15 tests across five themes and three viewport projects (exit 0, 49.3 seconds).
- Journal formatting and whitespace checks passed. Only this journal changed; the implementation
  and baselines remain intact. The full 588-test gate has not been rerun locally and its prior
  failure is not claimed fixed. Central validation and independent review remain pending.
