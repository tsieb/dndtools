# RC-UX-5.1 run journal

- Scope: section-level feature complexity inventory, generated reference, coverage tests and Settings metadata adapter. Preserve the existing compact onboarding summary and current enforcement policy. No agents, push, promotion, loop launches or dispatcher control changes.
- Read the current Settings shell/subpages, Extensions/Community panels, widget/system step declarations, map tool registry and onboarding tests. Headroom tools were not available in this session.
- Added typed section gates with label keys, tiers, surfaces, logical anchors and knowledge/misuse reasons. Private E2EE is explicitly advanced. Anchors are logical metadata, not a claim of existing DOM fragment support.
- Supporting changes outside the three primary owned files are limited to public exports, the deterministic doc generator, acceptance tests and this journal.
- Validation in progress: source-enumerating coverage and exact generated-document checks, followed by targeted type/lint/format checks.

## Validation and final scope

- Final inventory: 189 gates, including 85 Settings entries. Section data is separate from the ten compact onboarding summary gates to preserve existing experience-card content.
- `pnpm exec vitest run tests/unit/feature-complexity.test.ts`: 7 tests passed. Tests read actual Settings navigation/JSX (including conditional labels), both wizard step registries, map tool labels and Extensions/Community tabs; validate unique IDs/anchors and real translation keys; assert Private E2EE is advanced; compare the generated reference byte for byte. A synthetic new-section case verifies extraction is independent of the inventory.
- `pnpm --filter @dndtools/core exec vitest run tests/onboarding.test.ts`: 25 tests passed.
- Core and React typechecks passed. Targeted ESLint passed. `pnpm lint:boundary` passed. Prettier on all seven changed/new files passed. `git diff --check` passed.
- Generated reference command: `pnpm exec tsx scripts/feature-complexity.ts`. The table opts out of column-padding formatting to keep generated rows compact and deterministic.
- No browser/full-suite gate was run: this task supplies inventory metadata and regression checks, with no new enforcement/UI behavior. Central operator gates and independent review remain downstream.
