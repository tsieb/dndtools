# ci-recovery-f38d7a47 run journal

## Scope

Repair GitHub CI for promoted commit `f38d7a47ea282cbec18d600fb13217ea3d033285`. Reported
failing workflows: `Performance` and `CI`. Reproduce locally, fix the cause, verify without
weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

### CI — `Android unit, lint, and package checks` (the real break)

- Run [35072858383](https://github.com/tsieb/dndtools/actions/runs/35072858383) on
  `f38d7a47`: `Android unit, lint, and package checks` was the **only** failing job. It died
  35s in at `Set up Android SDK`: `Warning: Failed to find package 'tools'` →
  `Error: The process '…/cmdline-tools/20.0/bin/sdkmanager' failed with exit code 1`.
- `android-actions/setup-android@v4.0.1` (pinned `40fd30fb`) defaults to
  `packages: 'tools platform-tools'`; the pinned `action.yml` confirms the default. `tools` is
  the obsolete standalone SDK Tools package that `cmdline-tools` replaced.
- Google has removed it from the SDK repository manifests. Both live manifests were fetched:
  `repository2-3.xml` has 279 `remotePackage` entries and no `tools`; `repository2-1.xml` has
  234 and no `tools`. `platform-tools`, `cmdline-tools;20.0`, `platforms;android-36`,
  `build-tools;36.0.0` and `emulator` are all still present, so only the obsolete package is
  gone.
- Not specific to the promoted commit and not a code failure. The Android job last ran to
  completion on 2026-09-14T16:38Z (run 34869901604, 8m31s, pass) and failed in setup on every
  run from 2026-09-16T07:45Z onward. The package disappeared inside that ~39h window.
- Reproduced against a real local SDK. `sdkmanager tools platform-tools` exits 1 with
  `Warning: Failed to find package 'tools'` — the runner's exact message and exit code.
  `sdkmanager platform-tools` exits 0.

### Performance — `scene-first-render` (not a regression)

- Run [35072858399](https://github.com/tsieb/dndtools/actions/runs/35072858399): one breach,
  `scene-first-render` max 1504.8ms against the 1500ms target — 0.3% over. Every other budget
  passed.
- The commit under test changes one CSS token (`Note.tsx` heading `--font-display` →
  `--font-sans`) plus a journal entry. It cannot carry 100ms of first render.
- The budget did not stay broken. Across the six `loop/rc` perf runs of 2026-09-16 the same
  budget measured 1413.3, **1504.8**, 1369.9, 932.5, 1226.4 and 1245.9ms; the four runs after
  the breach all contain this commit and all passed.
- Re-checked at reconciliation time (2026-09-17): the twelve most recent `Performance` runs on
  `loop/rc` are all `success`, up to and including the integration tip `31acff8e`
  (run 35243238698). The breach did not recur on any of them.
- Reproduced locally on the candidate: `pnpm perf:capture --only scene-first-render` recorded
  1064.5 / 1014.6 / 1044.4ms, max 1064.5ms against 1500ms. The recorded baseline on this same
  host is 1068.3ms, so the candidate sits on its baseline and the commit costs nothing
  measurable.
- Conclusion: CI-hardware variance on a 4× EPYC 7763 runner. The target was left at 1500ms and
  the metric shape (`duration-ms`, graded on the max sample) was left alone — raising either
  would weaken the budget to hide a measurement the repo deliberately reports rather than
  absorbs.

## Reconciliation with the integration branch

One retired SDK package produced sibling recovery tasks, because several commits were promoted
while the same setup step was red across every branch.

The sibling `ci-recovery-41ebc122f9d8` landed the root-cause fix first, as `31acff8e` on
`loop/rc`. This task's original candidate (`f13b64b6`, kept at the local tag
`backup/pre-reconcile-f38d7a47`) fixed the same three call sites independently, which is why
rebasing onto `31acff8e` conflicted in `ci.yml`, `release.yml` and `validate.yml`.

The conflict is resolved in favour of the integration branch. The two fixes are functionally
identical, and that was verified rather than assumed: `31acff8e` sets `packages: platform-tools`
at exactly the three `setup-android` call sites the candidate touched — `ci.yml:366`,
`release.yml:343`, `validate.yml:88` — and `git grep setup-android@` over `.github/workflows/`
at `31acff8e` returns those three and no others, so no call site is left on the broken default.
The candidate's diff carries no behavioural difference; only its comment wording differs.

Nothing from the original candidate is worth carrying forward, so this branch keeps only this
run journal on top of `31acff8e`. No workflow file is modified by this branch.

## Out of scope, flagged not absorbed

CI on `995ec816` (the commit immediately before the fix) fails **two** jobs: the Android setup
step, and `visual regression (golden routes)` at `Compare the golden routes with the committed
baselines`. The visual-regression failure is **not** part of this task. On `f38d7a47` the
Android job was the only failure — the golden-route break arrived later on the integration
branch, with the RC-KNW-2.2 note-card work. It needs its own owner and its own re-baseline
decision; re-baselining it from here would be an unreviewed visual change outside this
recovery's scope.

## Validation

Local checks on the candidate tree, before reconciliation:

- `actionlint` v1.7.12 (the release and SHA-256 the Supply Chain job pins) over the whole
  workflow tree: exit 0, no findings.
- `zizmor --pedantic .` v1.27.0 (same pinned release): exit 0, "No findings to report"
  (4 suppressed, unchanged).
- `pnpm ci:local`: exit 0, all eight steps PASS — gates, `security:secrets`,
  `format:check:changed`, `lint`, `typecheck`, `build`, `test`, `test:coverage:core`.
- Unit totals, all passing: core 273 files / 4,779 tests; cloud 36 / 482; app 127 / 1,386;
  tooling 25 / 187. Core coverage: statements 89.76%, branches 79.78%, functions 93.05%,
  lines 93.97%.
- `pnpm check:bundle-budget` against the completed production build: pass, core bundle
  540.9 KiB gzipped. This step is not part of the `ci:local` wrapper, so it was run separately.
- An earlier `ci:local` attempt was killed mid-`test` by session teardown (exit 143, SIGTERM).
  That was not a gate result; the run above is a complete re-run on the committed tree.

### Reconciled tree (on top of `31acff8e`, 2026-09-17)

- `pnpm ci:local` exit 0, **all eight steps PASS** — `gates`, `security:secrets`,
  `format:check:changed`, `lint`, `typecheck`, `build`, `test`, `test:coverage:core`.
- `pnpm test` exit 0, all four suites: critical 276 files / 4,830 tests; cloud 38 / 499;
  app 134 / 1,481; tooling 26 / 191 — 7,001 tests, 0 failures.
- `pnpm gates` exit 0: quality gate 6 gates owned, budgeted and wired; docs check 255 files
  reachable from `docs/README.md`, 283 relative links resolved. The `file-size-warn` lines are
  warn-only (RC-STB-2.7) and pre-exist on `31acff8e`.
- `pnpm format:check:changed` exit 0 — Prettier reflowed this journal once and it was
  re-checked clean, not exempted.
- Lint reported only pre-existing `multiple-accent-primaries` and `display-face-below-24px`
  warnings; no errors.

No assertion, budget, job condition or workflow protection was weakened. This branch adds no
test and changes no source or workflow file — its only diff against `31acff8e` is this
markdown file.

The Android gradle gates themselves could not be rerun here and did not need to be: they passed
end to end on 2026-09-14 and the break is entirely in SDK setup. This machine has a JRE and no
JDK, so `gradlew` aborts before configuring.

## Gotchas

- When a promoted commit's CI failure is an environment break rather than a code break, every
  in-flight commit fails identically and the dispatcher opens one recovery task per promoted
  SHA. Diff `loop/rc` before writing any code — otherwise the rebase conflict is the first
  sign, and by then several candidates exist for one bug.
- A perf budget that fails once and passes on later runs containing the same commit is runner
  variance. Confirm it against the run history before touching the target; `scene-first-render`
  has 0–38% headroom on GitHub's runners and will breach again.
- Open item for the Canvas owner, not fixed here: `scene-first-render` needs either real
  first-render work or a baseline recorded on CI hardware, not a looser target.
