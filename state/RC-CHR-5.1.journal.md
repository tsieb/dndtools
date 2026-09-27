# RC-CHR-5.1 — Character sheet template fidelity

## Implementation

- Matched the supplied template hierarchy: identity/portrait/rest band; desktop 1:1.25 columns; stacked phone; three-by-two ability grid with compact statistics; saves and skills; raised live combat panel; spell slots and known spells.
- Preserved existing identity/backstory edits, attacks, inventory, resource and advancement tabs. Sheet identity edits now respect preview mode.
- Added validated PNG/JPEG/WebP upload through the content-addressed asset store, with a durable character asset ID, object-URL cleanup, upload/error feedback, and DM/preview permission checks.
- Unknown ability scores render as em dashes rather than invented scores/modifiers.
- Supporting changes outside the UI directories are limited to required translations, browser regression coverage, player golden baselines and the inline-style allowance ratchet (25 down to 6 for Sheet.tsx).

## Validation

- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- Focused ESLint, Prettier and `git diff --check`: passed.
- `pnpm lint:boundary`: passed.
- AbilityScore unit suite: 7 passed.
- `pnpm a11y:contrast`: passed, 319 checks across five themes plus 16 forced-colors checks.
- Focused Playwright desktop/mobile suite: 8 passed. Includes /player axe gate (2), template geometry/HP/slot/portrait persistence (2), invalid upload/read-only preview (2), and existing short-rest regression (2).
- Test setup corrections: use a real active scene and name-sorted selected PC; generate valid PNG bytes in-browser; share a seeded character with an explicit player before testing preview. Final tests pass through real commands and persisted state.
- Pinned-container golden update: 9 player captures updated across three themes and three tiers. Desktop and phone captures visually inspected against template structure.
- Final no-update pinned-container comparison: 9 passed (28.9s), using `bash apps/gm-react/tests/visual/run-in-container.sh -g player --update-snapshots=none --workers=2`.

No dispatcher control state changed; no push or promotion. Central gates and independent review remain the operator's next stage.
