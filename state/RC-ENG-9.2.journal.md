# RC-ENG-9.2 run journal

## Implementation

- Clean task branch on entry. No Headroom tools available; native original output used.
- Read existing golden, onboarding, Quick builder, Add panel, resize, joined companion and table-view journeys. Manifest permits e2e specs and helper companions plus this journal.
- Implement browser-event counting and shared ceilings; wire real journeys on both projects, scripted counter tests and one-extra-dialog boundary mutations. Document measurement boundaries and tightening policy.
- No agents, push, promotion, loop launch or dispatcher control-state changes.

## Implemented acceptance

- `_helpers.ts`: trusted capture-phase browser input counter, ordered action diagnostics,
  whole-gesture drag/tap counting, modifier chord handling, scroll exclusion, explicit segment
  lifetime and fail-closed document navigation. All input kinds count toward each ceiling.
- Shared executable budgets match the new planning table; regression checks prohibit exceeding
  original ceilings or any tighter table version in reachable Git history. Shallow-history
  limitations are documented. Every GM shell route is checked against the declared route inventory.
- Existing first-run, capture, Quick builder, joined companion and table projection journeys now
  assert budgets. New browser journeys cover keyboard onboarding, four-action tile editing and
  Help on every GM shell route, including dynamic details. Both browser profiles run all rows.
- Scripted browser unit fixture counts clicks, a real tap, keyboard activation without a duplicate
  click, a chord, typed keys, a whole drag, and excluded wheel scrolling. Every ceiling has a
  baseline-at-limit fixture followed by one actual modal confirmation that must exceed it and
  identify the extra action. These reuse the exact assertion used by application journeys.
- TESTING.md documents the helper, focused command, table and fixture contract. Text payloads
  use fill/insertText; focus/navigation remains counted. Capture asserts title focus before fill.

## Validation (original native outputs inspected)

- `pnpm e2e friction-budgets.spec.ts --workers=2 --retries=0`:
  initial run 62 passed, 2 failed, in `/tmp/rc-eng92-friction.log`. Both failures were the new
  entity-detail Help loop: it retained the previous Help modal across hash navigation, leaving
  the next trigger inert. Error context showed the existing Screens dialog. Fixed by closing
  Help after stopping each measurement and asserting it hidden before the next route.
- `pnpm e2e golden-path.spec.ts widget-quick-builder.spec.ts companion-sheet.spec.ts table-view.spec.ts --workers=2 --retries=0`:
  **94 passed**, exit 0, `/tmp/rc-eng92-journeys.log`.
- `pnpm e2e friction-budgets.spec.ts golden-path.spec.ts -g 'entity details|inventory|fails closed|knowledge: capture' --workers=2 --retries=0`:
  **8 passed**, exit 0, `/tmp/rc-eng92-followup.log`. Rechecks both corrected detail-route tests,
  new route inventory and document-navigation regressions, and the capture journey after adding
  its title-focus assertion. Combined with the initial 62 passing friction cases, all 68 current
  friction cases and all 94 existing-spec cases have passed; this is evidence across focused runs,
  not a claim of one 162-test run.
- ESLint on all six changed/new e2e TypeScript files: exit 0, no diagnostics.
- Prettier check on all changed/new TypeScript and documentation: exit 0.
- `git diff --check`: exit 0.
- No production UI changed; no screenshot baselines or visual gate run. Full central gates and
  independent review remain the central operator's responsibility.

## Review round 2 (candidate 90dbcaf0 rejected)

Findings addressed:

- **High — Help accepted any dialog.** The Help journey is now `openHelp()`, measured until real
  Help shows: the Help menu dialog with its Guides region, or the route's own guide dialog (article
  plus "All help topics"). The stricter check showed that 13 routes (and the entity details) open
  their route guide, not the menu, so both are accepted and nothing else is. New
  `seedExtraDialog()` in `_helpers.ts` holds the first trusted activation of a named control
  behind one native "Extra confirmation" dialog; confirming it replays the action untrusted. Every
  journey at its ceiling takes an optional `FrictionSeed` (`armFrictionSeed` before
  `countActions`, `interrupt()` after the seeded step). Each seeded run proves the step has not
  taken effect while the dialog shows, then requires `expectOneExtraStep`, i.e. limit+1 counted
  and `assertWithin` rejecting with the count and "Confirm extra step". In-app seeds: Help
  (`/`, `/board`), tile-layout (Add), quick-track (Add to screen), capture-note (New note),
  table-scene (Start session), player-damage (Damage 2, step 5 of the joined-sheet test).
  Onboarding journeys run below their ceilings (9/12 keys, 4/5 clicks), so an in-app seed cannot
  exceed them; the probe confirmed it (seeded keyboard onboarding counted 10). The test was dropped
  and the doc explains this. Quick-track now asserts only after the widget is placed.
- **Medium — shallow-history loosening.** `recordedTables()` reads all committed table versions in
  HEAD's history. Shallow checkouts fetch HEAD's commit graph and trees from `origin` with
  `--filter=blob:none` into a scratch bare repo (GitHub main: about 6 s, 3.8 MB). Any failure throws
  "Friction budget history unavailable" (fail closed). Git runs with `-c safe.directory=*`
  because CI runs as root in a container over a runner-owned checkout. ci.yml is unchanged.

Validation (native logs inspected):

- Probe `/tmp/rc-eng92-scripts/history-probe.mjs` transpiles and runs the spec's exact
  `recordedTables` source. Depth-1 clone of the candidate: 1 version, no loosening. Depth-1 clone
  of a tighten(6→5)-then-restore(6) branch: 3 versions recovered, `quick-track 6>5` detected.
  Depth-1 clone with unreachable origin: throws. Full worktree: 1 version. Scratch dirs removed.
- `pnpm e2e friction-budgets.spec.ts widget-quick-builder.spec.ts table-view.spec.ts companion-sheet.spec.ts golden-path.spec.ts --workers=2 --retries=0`:
  **174 passed**, exit 0, `/tmp/rc-eng92-r2-all.log`.
- After doc/table edits, `pnpm e2e friction-budgets.spec.ts --workers=2 --retries=0`: **74 passed**,
  exit 0, `/tmp/rc-eng92-r2-friction2.log`.
- Seeded tests plus the joined-sheet journey, `--repeat-each=3`: **138 passed**, exit 0,
  `/tmp/rc-eng92-r2-seeded-repeat.log`.
- ESLint on all six changed e2e files: exit 0. Prettier on changed files: clean. The two warnings
  (isolation-guard, permissions specs) are in untouched files. `git diff --check`: clean.
- Not run: full browser suite, visual gate, hosted CI. Those belong to the central operator.

## Review round 3 — native HTML drag counting

- Entry HEAD: c9a51f9b2; clean tracked worktree. No Headroom tools exposed and no
  applicable AGENTS.md found. No agents or dispatcher control-state changes.
- Added a completed native HTML drag to the scripted counter regression. The first
  probe encountered an ambiguous Drag locator; made it exact. The corrected probe
  reproduced the review defect on both profiles: successful drop, but one missing
  drag in the action sequence (exit 1, /tmp/rc-eng92-native-red2.log).
- Count trusted native dragstart once and retire its matching pending pointer
  gesture. Chromium's subsequent pointercancel cannot erase that action; ordinary
  touch-scroll cancellation still discards its pending pointer gesture.
- Added real CDP touch scrolling on both profiles, verifying pointercancel, positive
  scroll offset and zero counted actions. These passed before the repair as well.
- Updated TESTING.md with native drag attempt semantics and scroll regression coverage.
  Validation (original logs inspected):

- Five-spec suite: `pnpm e2e friction-budgets.spec.ts golden-path.spec.ts widget-quick-builder.spec.ts companion-sheet.spec.ts table-view.spec.ts --workers=2 --retries=0`:
  **176 passed**, exit 0 (2.8m), /tmp/rc-eng92-native-green.log. Includes both profiles'
  native drag and touch-scroll regressions, all budget journeys and seeded mutations.
- Reviewer's exact external counter-regression.config.ts command: **2 passed**, exit 0,
  /tmp/rc-eng92-review-regression.log.
- ESLint on the helper and friction spec: exit 0, no diagnostics.
- Prettier check on all four changed files: exit 0. `git diff --check`: exit 0.
- No production UI changes. Full browser suite, visual gate, wrapper gates and hosted CI
  were not run; central gates and independent review remain with the operator.
