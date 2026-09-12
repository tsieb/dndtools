# RC-SYS-3.6 run journal

- Scope: validator CLI, package scripts, author guide, PF2e sample if corrections are needed.
- No Headroom tools available. Read the strict schema, evaluator, icon registry and builder preview directly.
- Validator uses the existing schema and evaluator, reads icon names from the authoritative registry,
  reports leaf fields, checks condition keys and exercises all four formula sites at levels 1/5/10/20.
- Validation pending. No dispatcher state changes, delegation, push or promotion.

## Completed validation

- `pnpm systems:validate`: exit 0; 5e, Generic and PF2e each report PASS. Existing PF2e sample
  already meets the checks and was preserved without cosmetic changes.
- Five temporary JSON fixtures invoked the actual CLI and asserted exit 1 plus the exact field path:
  unknown `$.vocabulary.typo`, malformed `$.resources[0].maxFormula`, unknown
  `$.conditions[0].icon`, duplicate `$.conditions[1].key`, and division by zero at level 10 in
  `$.resources[0].maxFormula` (which passes the schema's level-1 probe).
- `pnpm exec eslint scripts/systems-validate.ts`: exit 0.
- Core targeted Vitest: system-package, systems-packages and system-package-portability;
  3 files, 87 tests passed.
- Executed the guide's exact TypeScript packaging example against PF2e; the resulting file had
  manifest kind `system-package` and the expected payload id. Temporary inputs/script/output removed.
- Prettier formatted the changed files; `git diff --check` passed.
- `package.json` places `pnpm systems:validate` first in `pnpm check`. The full check pipeline
  and independent review remain for the central operator; no full-pipeline pass claimed here.
