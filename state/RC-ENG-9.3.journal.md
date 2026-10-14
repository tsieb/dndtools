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

## Retry: independent review (head `8b09f32c`, rejected)

- Finding (high): the verdict and the five-run, a11y and regression evidence were bound to
  `7008d590`, not the candidate; the candidate's application tree (base `81b6b34c`) lacks
  RC-CAN-8.6, RC-CAN-8.7, RC-SES-7.3 and RC-UX-6.5. Confirmed: local `loop/rc` = `81b6b34c`
  (`74efcfe2` + RC-POL-1.2), while `origin/loop/rc` = `main` = `effe44cb` (v0.4.4, 63 commits past
  `74efcfe2`, carrying the four stories). `effe44cb` is not an ancestor of local `loop/rc`.
- Fix: merged `effe44cb` into the task branch (`d18a4272`). The 30 conflicts are all RC-POL-1.2 vs
  v0.4.4 (canvas, Board, board/scene-editor goldens, the raw-style allow-list). Every conflicted
  path, and then all of `apps/ packages/ scripts/ tests/`, was taken from `7008d590`, the existing
  integration of RC-POL-1.2 over `effe44cb`. The auto-merged side had picked up pre-rebase POL-1.2
  code that undoes `effe44cb`'s perf splits (e.g. `useEditWidget` imported from `WidgetBuilder`).
  Result: `git diff --stat 7008d590 d18a4272` lists only `docs/planning/FRICTIONLESS.md`,
  `docs/requirements/FEATURE-GAPS.md`, `state/RC-ENG-9.3.journal.md`, `state/RC-POL-1.2.journal.md`
  (the last kept as on the task base). `pnpm install --frozen-lockfile` exit 0.
- Claim fence: the dispatcher diffs `base_sha..HEAD`, so this merge puts every path v0.4.4 changed
  outside `Owns`. It is kept because the acceptance (and the review) require the dependency code
  in the candidate; the merge commit message says so. The claim decision is the operator's.
- Gate chain on `d18a4272` (local, not CI; evidence `~/.cache/rc-eng-9-3-evidence-d18a4272/`,
  `gates.log` first line `commit d18a4272…`): budget runs 1–5 (08:01–08:15Z) each expected 178,
  unexpected 0, flaky 0, skipped 0. `friction.py` extracted the 81 `friction` annotations per run
  (project, test, budget, count); all five are identical to each other and to the five `7008d590`
  runs. `pnpm a11y:gate` exit 0 (08:15–08:16Z): contrast 319 pairs + 16 forced-colors, axe 61
  passed 1 skipped, report 60 scans, 0 critical/serious, **1 moderate**, PASS. Story-spec
  regression (same 75 files): expected 1126, unexpected 0, flaky 0, skipped 18 (08:16–08:49Z).
- The moderate: the regression run cleared `test-results/` before I read the artifacts, so I re-ran
  `pnpm a11y:gate` alone (08:49–08:51Z, exit 0, same counts) and kept the artifacts
  (`a11y-artifacts-run2/`, `a11y-report-run2.json`). It is axe `region` on
  `div[data-testid="phone-session-strip"]`, `mobile-chromium` `/session#combat`: the RC-SES-1.1
  phone live-session strip (`Footer.tsx:31`) sits outside landmarks. Recorded as L12 (low) in
  FRICTIONLESS.md §5; moderate is non-blocking under the gate policy.
- The `7008d590` a11y report had merged only 5 scans (vs 60), so its "0 moderate" was partial.
  Most likely the probe runs in the same audit checkout cleared worker artifacts (inferred, not
  reproduced). §3 now says so and cites the `d18a4272` report.
- FRICTIONLESS.md rebound to `d18a4272`: header, §1 (19 remaining: 7 medium, 12 low), §2, §3,
  §4 note (probes on `7008d590`, same tree), §5 L12, §6, §8 reproduction and integration.
  `pnpm gates` exit 0 (docs check: 309 files reachable, 451 links); Prettier applied.
