# RC-ENG-9.3 run journal

## Setup (2026-10-13/14)

- Task branch `dispatch/dndtools/d5f44549f17f9f4db0c1`, base `81b6b34c` (RC-POL-1.2 candidate on
  `74efcfe2`). Clean on entry. No agents, push, promotion, loop launch or dispatcher control-state
  edits. Dispatcher store read read-only to confirm all 45 `Deps:` are `succeeded`.
- The task base predates four dependencies: RC-CAN-8.6 (`d97ed6db`), RC-CAN-8.7 (`31642649`),
  RC-SES-7.3 (`75477463`) and RC-UX-6.5 (`36c67231`) landed on `loop/rc` after `74efcfe2`. Auditing
  the task base would audit a tree without them. The audit commit is therefore **`7008d590`**:
  `loop/rc` `effe44cb` plus RC-POL-1.2 (named in `state/RC-POL-1.2.journal.md` as that story's
  resolution onto `loop/rc`). It contains every dependency. Checked out detached in a scratch
  worktree `~/.cache/rc-eng-9-3-audit-7008d590`; `pnpm install --frozen-lockfile` exit 0.
- Gate chain script `~/.cache/rc-eng-9-3-evidence/run-gates.sh`: five consecutive invocations of
  the five budget-asserting specs (`golden-path`, `friction-budgets`, `companion-sheet`,
  `widget-quick-builder`, `table-view`) on `desktop-chromium` + `mobile-chromium` with the JSON
  reporter (friction annotations retained), then `pnpm a11y:gate`. Port 5391, default workers.

## Gate chain on `7008d590` (original outputs inspected)

- Budget runs, `golden-path` + `friction-budgets` + `companion-sheet` + `widget-quick-builder` +
  `table-view`, `--project=desktop-chromium --project=mobile-chromium`, retries 0 (local, not CI):
  run 1 (06:58–07:01Z) **178 passed**; run 2 **178 passed**; run 3 **178 passed**;
  run 4 **178 passed**; run 5 **178 passed**. JSON stats: expected 178, unexpected 0, flaky 0,
  skipped 0 in every run. Logs `~/.cache/rc-eng-9-3-evidence/budgets-run{1..5}.{log,json}`.
- Counted actions from the `friction` annotations, real journeys only (the boundary fixtures sit at
  the ceiling by construction and are excluded): onboarding-clicks 4/5, onboarding-keys 9/12,
  capture-note 2/2, quick-track 6/6 (Party list and Counter or clock), tile-layout 4/4,
  player-damage 2/2, help 1/1 on all 20 GM shell routes plus entity details, table-scene 1/1.
  Identical on both profiles in all five runs. The review probe specs ran concurrently with runs
  2–5 (extra load), and the runs still passed. Runs ended 07:12Z; a11y gate 07:12–07:14Z.
- `pnpm a11y:gate` exit 0: non-text contrast 319 pair checks across 5 themes passed; axe 61 passed,
  1 skipped (the phone-only `/board` Layout test on desktop, `test.skip` by project); report:
  0 critical/serious/moderate/minor, 0 approved known violations, "Gate result: PASS".

## Review re-run on `7008d590`

- Probe specs (scratch, never committed) under the audit worktree's `tests/e2e/zz-eng93/`, run with
  `DNDTOOLS_E2E_PORT=5392 pnpm exec playwright test tests/e2e/zz-eng93/<file> --project=desktop-chromium`
  against a dev server started with the Playwright config's env blanks. Postures 1440×900,
  834×1112 touch, 390×844 touch/mobile. Screenshots, ARIA snapshots and `metrics.jsonl` under
  `~/.cache/rc-eng-9-3-evidence/shots/<surface>/`.
- Probe failures were probe bugs, fixed and re-run: a locator `innerText` with no timeout (widgets),
  `gotoRoute` on standalone `/play` (no `#main-content`), the phone Story link (knowledge), the
  palette `combobox` matching the map tile's select, Ctrl+N pressed before the Notes hook mounted.
- All 90 findings of 2026-09-29 re-checked. 0 critical, 0 high remain. New or residual: medium 7,
  low 11 (recorded in FRICTIONLESS.md §5 with evidence). Two remain open by decision (D6 freeze):
  PLY-11 (medium) and KNW-18 (low).
- Notable negatives found and confirmed by a second probe: on 834 and 1024 widths (touch and mouse)
  a new note focuses the detail `<section>`, not the body (3 actions there; the two budget profiles
  are unaffected); the full builder's Review copy says a widget "installs disabled" while the
  template install is enabled and author-trusted.
- Keyboard pass: 40-stop Tab walks on `/`, `/board`, `/knowledge`, `/campaign`, `/graph`,
  `/screens` (desktop and phone): every stop has a visible ring. Reduced motion: no running
  animations on `/`, `/board`, `/session`, `/graph`.
- Loaded the `design-polish` and `design:design-critique` checklists and applied them to the
  captures (review-only; no code edited).

## Story-spec regression on `7008d590`

- 75 spec files collected from the commits of the 45 dependency stories plus five surface specs
  (`player-join-first`, `companion-frame`, `play-polish`, `session-standby`, `onboarding-polish`),
  excluding the five budget specs and the axe gate. Both profiles, retries 0, 07:25–07:55Z:
  JSON stats expected 1126, unexpected 0, flaky 0, skipped 18 (all declared single-profile skips
  or the demo vault's performance capture). Log `~/.cache/rc-eng-9-3-evidence/regression.{log,json}`.
- Recorded in FRICTIONLESS.md §6; the "(spec)" rows in §4 rest on it.

## Cleanup

- Probe dev server (port 5392) stopped; scratch worktree `~/.cache/rc-eng-9-3-audit-7008d590`
  removed with `git worktree remove --force` (it held only the uncommitted probe specs). Evidence
  kept in `~/.cache/rc-eng-9-3-evidence/` (logs, JSON reports, screenshots, metrics).
- Not pushed; no dispatcher control state edited. Central gates and independent review are the
  operator's. This branch is based on `81b6b34c`; FRICTIONLESS.md describes `7008d590` and is
  accurate only once integrated onto `loop/rc` at or after that commit.

## Retry: quality gate (attempt `7805a19e`, head `6122e4bc`)

- Failure, read from the original log: `pnpm gates` docs check, `[unreachable-doc]
docs/planning/FRICTIONLESS.md: no chain of relative links from docs/README.md reaches this file`.
  The file-size lines in the same log are warn-only and predate this task.
- Fix: one paragraph in `docs/planning/README.md`, the planning index `docs/README.md` already links,
  pointing to FRICTIONLESS.md, the 2026-09-29 reviews and FRICTION_BUDGETS.md. This crosses the
  claim (`Owns` is FRICTIONLESS.md only) by the minimum the reachability gate needs. No owned or
  companion path is a natural home: FEATURE-GAPS.md rows are parsed by `feature-audit` and edited in
  place only; `docs/reference` and `docs/architecture` hold no friction material.
- Re-run on this tree: `pnpm gates` exit 0 ("docs check passed: 309 file(s) reachable from
  docs/README.md, 453 relative link(s) resolved"); Prettier check clean on the README; no audit
  content changed.

## Retry: claim fence (head `f5096498`)

- Fence feedback: `docs/planning/README.md` is outside the claim. Reverted it to base `81b6b34c`
  (`git checkout 81b6b34c… -- docs/planning/README.md`); the preceding entry's README change is
  undone.
- Reachability inside the fence instead: `scripts/validate/docs-links.ts` walks relative links from
  `docs/README.md` through files under `docs/`. `docs/requirements/FEATURE-GAPS.md` is a manifest
  companion path that `docs/README.md` already links, and its intro already sends readers to the
  roadmap for what is missing. One prose sentence there (outside the parsed inventory table) now
  points to FRICTIONLESS.md for the friction findings that remain after the M2.6 audit.
- Re-run on this tree: `pnpm gates` exit 0 ("docs check passed: 309 file(s) reachable from
  docs/README.md, 451 relative link(s) resolved"); `pnpm feature-audit` exit 0 ("40 declared limits
  (0 stale)"); Prettier clean on the edited files.
