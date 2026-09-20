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
