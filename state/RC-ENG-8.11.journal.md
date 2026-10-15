# RC-ENG-8.11 run journal

## Scope and decisions

- Implement Atlas LayerRow/LayerPanel adoption and re-scope DEBT-2026-004.
- Headroom unavailable; native command output is the original evidence.
- Required supporting changes: DS LayerPanel and LayerRow composition slots. Existing DS APIs
  cannot express Atlas-only controls without exposing unsupported rename/opacity/lock actions.
  Slots preserve defaults for the editor and let Atlas retain its durable callbacks and labels.
- ImportWizard cannot host the native six-step flow or file selection. Documented composition
  conformance in ImportMapDialog and DEBT.md. No import state or persistence behavior changed.
- No agents, dispatcher control mutations, push or promotion.

## Validation

Original local command logs are under `/tmp/rc-eng-8.11-*.log`; results below are read from
those logs and process exit statuses, not compressed output.

- First Atlas pass: exit 0, 31 passed / 1 pre-existing mobile breadcrumb skip (1.3m).
- First pinned Atlas visual pass: exit 0, 12 passed across desktop/rail/phone (1.1m).
- App typecheck and focused ESLint: exit 0. Boundary lint: passed.
- Added durable-action regression and player no-controls assertions to the existing Atlas spec;
  final two-profile rerun is in progress. Expanded visual selector to include Atlas golden routes.
- Supporting test path: apps/gm-react/tests/e2e/atlas.spec.ts; required to exercise DS composition.

- New reorder test initially targeted Hidden Outpost, whose single layer correctly disables
  Move down. Original failure named the disabled `Move Outpost Base down` button. Corrected
  the fixture to open multi-layer Western Reaches. Focused corrected regression: exit 0,
  2 passed (desktop and mobile), including switch focus, visibility and reorder assertions.
- Pinned expanded Atlas visual comparison: exit 0, 21 passed (1.6m), all three layout tiers;
  command: `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh -g atlas`.
  No screenshot baselines changed. Original log: `/tmp/rc-eng-8.11-visual-final.log`.
- Raw-style ratchet passed (136 values); formatting passed. Final combined acceptance rerun
  with the corrected fixture is in progress (`/tmp/rc-eng-8.11-acceptance.log`).

## Final result

- Combined acceptance command: `pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/atlas.spec.ts tests/e2e/atlas-polish.spec.ts --workers=2`.
- Exit 0: **33 passed, 1 existing mobile breadcrumb skip**, both desktop-chromium and
  mobile-chromium (1.2m). Original evidence: `/tmp/rc-eng-8.11-acceptance.log`.
- Pinned Atlas visuals: **21 passed**, exit 0. App typecheck, focused ESLint, boundary lint,
  raw-style ratchet, Prettier and `git diff --check` passed.
- DEBT-2026-004 part (b) resolved; status explicitly re-scoped to non-primary generator/asset
  picker surfaces, listed by file. Import composition rationale recorded beside the implementation.
- Intended files committed on the current task branch, including the two necessary shared DS
  extensions and the supporting Atlas regression. No push or promotion. Central operator gates
  and independent review remain external to this implementation run.
