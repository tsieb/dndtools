# RC-UX-2.3 run journal

- Scope: overlay primitives and repository tabindex lint. Per-screen POL fixes and core/Menu
  changes are outside ownership. No dispatcher edits, delegation, push or promotion.
- Audit: Dialog/Sheet provide title IDs, focus return, Escape layers, Android Back registration,
  modal isolation and scroll locking. Toast is a live region; Tooltip is a noninteractive
  description, so neither should trap focus or use dialog labelling. Menu delegates dismissal
  and return to Popover and supports arrows/Home/End; per-screen menuitem roles remain caller-owned.
- Fixed Tab eligibility (negative tabindex, hidden ancestors, disabled fieldsets), nested overlay
  Tab ownership and focus entry from the panel itself. Initial focus now skips unavailable fields
  and respects nested overlay ownership.
- Added repository lint for positive JSX tabindex, object props, DOM assignment and setAttribute.
- Validation in progress.

## Validation

- `node scripts/eslint-rules/no-positive-tabindex.test.js`: passed (RuleTester valid/invalid
  JSX and imperative DOM cases).
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/ds/components/overlay`:
  3 files, 9 tests passed, including both primitives' Tab wrapping, disabled/hidden controls,
  labels, Back/return focus and simultaneous nested focus entry.
- First lint run exposed 21 pre-existing JSX errors when JSX was newly included. Scoped JSX
  coverage to the new accessibility rule; existing JS/TS coverage remains intact.
- `pnpm lint`: exit 0, zero errors / 15 existing warnings, boundary and contrast gates passed.
- An attempted pnpm help invocation started a full browser run; stopped it and the overlapping
  targeted run. Neither counts as validation. Restarted targeted e2e on isolated port 15823:
  ux-audit, help-menu, responsive, a11y-axe-gate, desktop/mobile Chromium, two workers.
- Final targeted browser command: `DNDTOOLS_E2E_PORT=15823 pnpm --filter @dndtools/gm-react exec
playwright test tests/e2e/ux-audit.spec.ts tests/e2e/help-menu.spec.ts
tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts --workers=2`:
  exit 0, **146 passed (3.4m)**. This is the targeted suite, not all repository e2e tests.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- Prettier on all intended files and `git diff --check`: passed.
- Implementation and validation complete; central operator retains full gates and independent review.
