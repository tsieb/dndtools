# RC-ENG-3.1 run journal

## Scope and evidence

Promote the owned budget registry and rewrite PERFORMANCE.md as required by acceptance.
The clean task branch contains the RC-ENG-1.1 artifact at tests/perf/baseline.json:
all eleven budgets have non-null observed values and positive sample counts, recorded
2026-09-06 on a local Ryzen 7 5700X. No Headroom tools were available.

## Changes

All eleven registry entries now use baseline maturity dated to the existing recording.
Targets and target qualification fields remain unchanged. Registry comments and the performance
document distinguish measured fixtures from target scope. The document lists all observations,
sample counts, hardware, reduced fixtures, and the excluded network hop. Existing renderer and
boot-path guidance is retained. No new capture or CI performance claim is made.

## Validation

- Core registry and measurement suites: 68 tests passed (2 files).
- Baseline artifact suite: 7 tests passed (1 file).
- Direct acceptance check: all 11 entries use baseline maturity, dates match the artifact,
  each has finite observed evidence and positive samples, and registry validation returns no problems.
- Prettier and git diff --check passed; final diff reviewed. Only the registry, required performance
  document, and this journal are included in the commit.
- Central operator gates and independent review remain external to this task; no push or promotion.

## 2026-09-20 ownership retry

The 2026-09-18 operator brief explicitly adds docs/development/PERFORMANCE.md to ownership,
resolving the previous candidate's reported path-claim mismatch. Commit 3a0465c9 is already
present on this task branch; its implementation is retained, not recreated.

Path justification:

- packages/core/src/perf/budget-registry.ts: the existing promotion sets all eleven entries to
  baseline maturity using the artifact date, preserving targets and schema compatibility.
- docs/development/PERFORMANCE.md: the required rewrite supplies the measured values, sample
  counts and limitations supporting promotion. This retry only corrects "16-core" to
  "16 logical CPUs", consistent with the recorded eight-core Ryzen hardware.
- state/RC-ENG-3.1.journal.md: updated as explicitly required by the task's run-journal instruction.

Fresh validation: 68 core registry/measurement tests and 7 baseline artifact tests passed.
The direct acceptance check confirms eleven baseline entries, matching recorded dates, finite
observations with positive sample counts, and no registry problems as of 2026-09-20.
No fresh browser performance capture was claimed. Formatting and diff checks passed.
The central operator still owns wrapper gates and independent review; this retry does not claim
that the ownership gate itself has run. No dispatcher state changes, push, promotion, or agents.

## Visual-gate retry after dba0673b

Read the original failed gate log at
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/8d8920b1-9fd7-4167-a8e0-49be6873c680/output.log`
(no Headroom tools available). It reports 134 passing tests and one failure: desktop tavern
`/board`, with 13,330 differing pixels. Inspected the original actual and diff PNGs: the actual
shows the shell with "Loading your vault…" instead of board widgets. Preserved those artifacts
under `/tmp/rc-eng-3.1-visual-evidence/` before rerunning.

`App.tsx` uses that message for its Boot/Suspense fallback. `golden-routes.spec.ts` waits for
runtime loaded, the shell main and the first h1, but not board-content readiness. This supports
a lazy-surface readiness race; it does not prove the underlying timing cause. No owned-file
change can appropriately repair that visual-test readiness condition. No test, app, snapshot,
or dispatcher files were changed.

The exact failing case passed unchanged in the pinned container:
`apps/gm-react/tests/visual/run-in-container.sh --project=visual-desktop -g 'tavern.* /board$' --update-snapshots=none`
(1/1). The full pinned-container comparison then passed all 135 tests in 2.4 minutes
(exit 0); the original output is `/tmp/rc-eng-3.1-visual-rerun.log`, and its final result was
read directly. Snapshot updates remained disabled. This successful rerun does not establish
that the readiness race is fixed. The acceptance assertion
also passed again: eleven baseline entries with dates matching populated measurement evidence
and no registry validation errors. Existing implementation and documentation are retained;
this retry changes only the explicitly required run journal to record gate evidence.
