# Workstation stability evidence — 2026-09-18

**PASS: five consecutive paired runs agree on all 11 CI-mode gate verdicts; every drift column is populated.** `scripts/perf/ci.sh` exited 0. Each comparison also passed on its own, with zero regressions, unmeasured budgets or missing baselines in every run.

Measured candidate: `7ccdfc0ace1e0223fb45c2854e7a5afe445efd9a`, the RC-ENG-1.3 perf commits rebased onto integration head `6a745225`. Pinned reference: `48a827861616fc3c3f6ccf69f0872edc1c8c771a`. The evidence commit that adds this directory changes only reports and the run journal, so the measured source and comparison policy are the same as in the candidate. This replaces the [2026-09-12 report](../2026-09-12-workstation/README.md), which measured `8193b9cb` before two rebases.

This is a local AMD Ryzen 7 5700X workstation with all 16 logical CPUs available, not a hosted runner, and it did not use `taskset`. `CI=true` selects CI grading and anonymizes the hostname. `ci.sh` sets `runnerLabel: github-ubuntu-24.04` from configuration. Neither field establishes hosted provenance. Node was v22.22.3 and pnpm was 10.34.5. Other dispatcher worktrees were running Playwright suites on the same machine during the capture, with the 1-minute load average between about 2 and 8.

## Procedure

From the candidate checkout, with dependencies and Playwright Chromium installed:

```bash
mkdir -p tmp/perf
PERF_PORT=15273 PERF_REFERENCE_PORT=15373 CI=true \
  RUNNER_TEMP="$(mktemp -d /tmp/rc-eng-1.3-XXXXXXXX)" \
  bash scripts/perf/ci.sh > tmp/perf/workstation.log 2>&1
```

The harness measured the reference and the candidate back to back for each scenario, alternating which revision ran first across seven batches. The comparator took the median of the seven batch statistics, with the committed 20% drift tolerance and 25 ms resolution floor. No scenario was skipped, and no batch was removed or replaced. The five runs were consecutive within one invocation.

## An earlier attempt that did not count

The invocation before this one is not part of the evidence. In its run 1, one `sync-reconciliation` batch timed out after 30 s waiting for the runtime to report `loaded` after a reload. The capture failed closed on both revisions, and `perf:baseline` and `perf:compare` refused the incomplete capture. The same scenario completed in that invocation's run 2 in 115 s, and all five runs below completed it. Without a verdict for run 1, that set could not pass the five-run check, so it was stopped during run 2 and restarted from scratch. The timeout happened while another worktree's Playwright suite was running. It reads as host contention rather than a code defect, but one occurrence cannot prove that. If hosted runs under RC-ENG-1.4 show it again, look at the scenario's 30 s ready timeout first.

## Drift by run

All 55 gate verdicts below are PASS. Positive drift is worse.

| Budget                | Run 1  | Run 2   | Run 3  | Run 4   | Run 5   |
| --------------------- | ------ | ------- | ------ | ------- | ------- |
| smoke-ci              | +6.4%  | +6.7%   | +6.2%  | +7.6%   | +6.4%   |
| app-startup           | -14.7% | -12.7%  | -14.6% | -13.7%  | -13.3%  |
| vault-open            | -2.2%  | -1.5%   | -3.0%  | -3.6%   | -2.1%   |
| scene-first-render    | -10.8% | -11.1%  | -10.8% | -9.6%   | -10.8%  |
| widget-update         | 0.0%   | -2.2%   | -7.7%  | +2.8%   | -1.1%   |
| map-pan-zoom-desktop  | 0.0%   | -0.6%   | -0.6%  | +0.6%   | +0.6%   |
| map-pan-zoom-slim     | 0.0%   | +0.6%   | -0.6%  | 0.0%    | 0.0%    |
| search                | +66.7% | +100.0% | 0.0%   | +100.0% | +116.7% |
| graph-indexing        | -3.7%  | -6.3%   | -4.2%  | +0.4%   | -2.0%   |
| sync-reconciliation   | -3.4%  | -2.7%   | -0.1%  | -0.1%   | -1.1%   |
| live-session-delivery | +0.6%  | 0.0%    | +3.6%  | 0.0%    | 0.0%    |

The reference is older code than the candidate, so a steady drift in either direction reflects the code between the two commits, not noise. `app-startup` and `scene-first-render` are 10–15% faster on the candidate in every run. `smoke-ci` is 6–8% slower in every run, which is within tolerance.

`search` is the only budget with large percentages. The reference median was 6.0 ms in all five runs, and the candidate read 10, 12, 6, 12 and 13 ms. A shift of at most 7 ms against a 250 ms target is well inside the 25 ms resolution floor, so the gate grades it steady. The candidate is consistently a few milliseconds slower on this scenario, though. That is a small real difference between the two commits, not a measurement flip.

## Scene rendering

| Run | Candidate | Reference | Target diagnostic | Drift  | Gate |
| --- | --------- | --------- | ----------------- | ------ | ---- |
| 1   | 1027.0ms  | 1151.7ms  | PASS              | -10.8% | PASS |
| 2   | 1014.0ms  | 1140.6ms  | PASS              | -11.1% | PASS |
| 3   | 1024.6ms  | 1148.8ms  | PASS              | -10.8% | PASS |
| 4   | 1028.0ms  | 1137.0ms  | PASS              | -9.6%  | PASS |
| 5   | 1020.6ms  | 1144.4ms  | PASS              | -10.8% | PASS |

The absolute 1500 ms target passed in every run this time. The 2026-09-12 capture breached it in three of five runs on unchanged code while the gate stayed stable. The targets remain diagnostics, and this report does not claim that any hardware other than this workstation meets them.

## Reviewable artifacts

[captures.tar.gz](captures.tar.gz) holds the exact, unformatted output bytes: five `current-N.json` captures, five `reference-N.json` captures, five measured `baseline-N.json` files, five `verdict-N.json` files, five `report-N.md` comparisons and `stability.txt`. Every capture keeps its raw samples and seven batch boundaries. [SHA256SUMS](SHA256SUMS) covers the archive and all 26 members. Before committing, the archive was extracted to a scratch directory, every checksum verified, and `stability.ts` rerun on the extracted copy.

To inspect and rerun the stability check from the repository root:

```bash
mkdir -p tmp/perf-evidence-review
cp tests/perf/reports/2026-09-18-workstation/{captures.tar.gz,SHA256SUMS} tmp/perf-evidence-review/
(cd tmp/perf-evidence-review && tar -xzf captures.tar.gz && sha256sum -c SHA256SUMS)
pnpm exec tsx scripts/perf/stability.ts tmp/perf-evidence-review
```

## Other validation and remaining gate

On the candidate tree, `pnpm test:tooling` passed 26 files / 193 tests, `pnpm exec vitest run --config tests/perf/vitest.config.ts` passed 2 files / 14 tests, `typecheck`, `lint` and `gates` exited 0, and `format:check:changed -- --base 6a745225` was clean.

This meets the amended workstation evidence requirement. Hosted five-run acceptance stays with RC-ENG-1.4 after integration. Central wrapper gates and independent review are still operator work. No push, promotion, hosted workflow dispatch, additional loop, or dispatcher control-state edit was performed.
