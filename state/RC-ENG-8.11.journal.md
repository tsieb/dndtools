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

## Claim-gate response

The gate rejected the two shared DS files as outside the claim. They are retained under the
explicit exception in the retry instructions; this does not widen the claim or clear that gate.
Operator decision required: widen the claim to include both paths, or revise the task scope.

- `apps/gm-react/src/ds/components/map/LayerPanel.tsx`: at base
  `4efd8df9adac9af0664a8e33598816a84eef6ad8`, the panel constructs every row internally. It has
  no row-rendering slot, and its `onChange` reports an already locally mutated layer array.
  Atlas needs controlled rows tied to accepted core commands, plus its busy/loading controls.
  The render slot is necessary to place Atlas's adapted LayerRow inside the actual DS panel.
- `apps/gm-react/src/ds/components/map/LayerRow.tsx`: the base API has only all-or-nothing
  `readOnly`. Editable mode always renders rename, opacity, lock and actions, even when their
  callbacks are absent. Atlas exposes only reorder, visibility and enabled callbacks. Read-only
  mode removes these actions too. The slots preserve the existing named switch (required by
  the pre-existing Atlas spec), touch reorder buttons and locked/opacity/mark-count text while
  avoiding unsupported editing controls. Reverting this file would remove the supported adapter.
- An owned-file-only substitution with the base APIs would either remove tested behavior, expose
  controls that do not persist, or retain hand-built rows instead of adopting the DS components.
  CSS/DOM interception of internal DS controls is not a sound substitute for explicit slots.
- No implementation changed during this retry. Re-read the base APIs and original local logs:
  33 Atlas specs passed with 1 existing skip, and 21 pinned Atlas visual comparisons passed.
  Those are prior implementation results, not new runs or evidence that the claim gate passed.
- This follow-up records the required-path justification in its commit message. No dispatcher
  state changed, and no push, promotion or agents were used.
