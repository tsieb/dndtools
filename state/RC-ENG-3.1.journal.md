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
