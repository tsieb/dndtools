# Workstation stability evidence — 2026-09-12

**PASS: five consecutive paired runs agree on all 11 CI-mode gate verdicts; every drift column is populated.** `scripts/perf/ci.sh` exited 0. Each comparison also passed independently; there were zero regressions, unmeasured budgets, or missing baselines in every run.

Measured implementation commit: `8193b9cba1360013b6b366bb71d525885bc0fb87`. Pinned reference: `48a827861616fc3c3f6ccf69f0872edc1c8c771a`. The implementation commit contains the ownership repair and manual-ref workflow input. The subsequent evidence commit changes only reports and the run journal; measured source and comparison policy are unchanged.

This is a local AMD Ryzen 7 5700X workstation run with all 16 logical CPUs available, not a hosted runner. `CI=true` selects CI grading and anonymizes the hostname; `ci.sh` sets `runnerLabel: github-ubuntu-24.04` from configuration. Those fields do not establish hosted provenance. Node was v22.22.3 and pnpm was 10.34.5. Unlike the earlier report, this run did not use `taskset`.

## Procedure

From the candidate checkout, with dependencies and Playwright Chromium installed:

```bash
mkdir -p tmp/perf
PERF_PORT=15273 PERF_REFERENCE_PORT=15373 CI=true \
  RUNNER_TEMP="$(mktemp -d /tmp/rc-eng-1.3-XXXXXXXX)" \
  bash scripts/perf/ci.sh > tmp/perf/workstation.log 2>&1
```

The harness measured reference and candidate back to back for each scenario, alternating which revision ran first across seven batches. The comparator took the median of the seven batch statistics, using the committed 20% drift tolerance and 25 ms resolution floor. No scenario was skipped and no batch was removed or replaced. The five runs were consecutive within one invocation, without restarting after a failed verdict.

## Drift by run

All 55 gate verdicts below are PASS. Positive drift is worse.

| Budget                | Run 1  | Run 2  | Run 3  | Run 4  | Run 5  |
| --------------------- | ------ | ------ | ------ | ------ | ------ |
| smoke-ci              | +2.8%  | +4.7%  | +4.3%  | +6.8%  | +5.3%  |
| app-startup           | -0.2%  | +0.6%  | +2.7%  | +3.1%  | +3.5%  |
| vault-open            | +6.0%  | -5.4%  | +0.2%  | +0.9%  | +1.6%  |
| scene-first-render    | +2.8%  | +1.4%  | +5.0%  | +3.2%  | -4.1%  |
| widget-update         | +5.5%  | +12.2% | -0.3%  | +0.3%  | 0.0%   |
| map-pan-zoom-desktop  | -0.6%  | 0.0%   | -0.6%  | +0.6%  | 0.0%   |
| map-pan-zoom-slim     | 0.0%   | 0.0%   | +0.6%  | -0.6%  | 0.0%   |
| search                | +6.7%  | -26.7% | +18.2% | 0.0%   | 0.0%   |
| graph-indexing        | +4.1%  | +1.8%  | -10.0% | +14.5% | +11.0% |
| sync-reconciliation   | +8.0%  | -1.9%  | +2.6%  | +3.0%  | +3.2%  |
| live-session-delivery | +20.2% | +4.6%  | -6.2%  | 0.0%   | 0.0%   |

## Scene rendering: target flips, gate stays stable

| Run | Candidate | Reference | Target diagnostic | Drift | Gate |
| --- | --------- | --------- | ----------------- | ----- | ---- |
| 1   | 1957.1ms  | 1904.3ms  | BREACH            | +2.8% | PASS |
| 2   | 1981.1ms  | 1953.9ms  | BREACH            | +1.4% | PASS |
| 3   | 1545.4ms  | 1471.9ms  | BREACH            | +5.0% | PASS |
| 4   | 1486.9ms  | 1440.5ms  | PASS              | +3.2% | PASS |
| 5   | 1406.1ms  | 1466.6ms  | PASS              | -4.1% | PASS |

The absolute 1500 ms target breached in runs 1–3 and passed in runs 4–5 on unchanged candidate code. All five baseline-based verdicts passed. The targets remain visible diagnostics; this evidence does not claim that the workstation met every absolute target.

## Reviewable artifacts

[captures.tar.gz](captures.tar.gz) contains the exact, unformatted output bytes: five `current-N.json` captures, five `reference-N.json` captures, five measured `baseline-N.json` files, five `verdict-N.json` files, five `report-N.md` comparisons, and `stability.txt`. Every capture retains its raw samples and seven batch boundaries. [SHA256SUMS](SHA256SUMS) covers the archive and all 26 members. Archive round-trip bytes, capture SHAs, matching host metadata, batch counts, flattened samples, and all 55 verdicts were verified before committing.

To inspect and rerun the stability check from the repository root:

```bash
mkdir -p tmp/perf-evidence-review
cp tests/perf/reports/2026-09-12-workstation/{captures.tar.gz,SHA256SUMS} tmp/perf-evidence-review/
(cd tmp/perf-evidence-review && tar -xzf captures.tar.gz && sha256sum -c SHA256SUMS)
pnpm exec tsx scripts/perf/stability.ts tmp/perf-evidence-review
```

## Other validation and remaining gate

`pnpm exec vitest run --config tests/perf/vitest.config.ts` passed 2 files / 14 tests. Targeted ESLint, Prettier, shell syntax, and the base-to-candidate owned-path check passed. The full capture itself ran the real smoke target seven times per revision in each run.

This satisfies the amended workstation evidence requirement. Hosted five-run acceptance remains assigned to RC-ENG-1.4 after integration; central wrapper gates and independent review are still operator work. No push, promotion, hosted workflow dispatch, additional loop, or dispatcher control-state edit was performed.
