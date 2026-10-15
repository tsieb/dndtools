# RC-ENG-8.10 run journal

## Scope and implementation

- Task branch: `dispatch/dndtools/cd23b19622939b768714`.
- Translate shipped 5e and Generic vocabulary in the UI value producer for Spanish;
  preserve customized vocabulary and English behavior. No core schema changes.
- Complete vocabulary matching survives vault hydration. The producer receives vocabulary,
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
