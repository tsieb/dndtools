# RC-ENG-1.3 local acceptance run, 2026-09-10

This is **local** evidence, not a GitHub-hosted run. The hosted-runner evidence
still needs the branch pushed and the `Performance` workflow run; its `perf-run`
artifact carries the same files.

## What ran

`CI=true bash scripts/perf/ci.sh` on a workstation (AMD Ryzen 7 5700X), pinned to
4 cores with `taskset -c 0-3` to approximate the 4-vCPU hosted runner, on ports
5293/5393. The machine was shared with other dispatcher workers; the 1-minute load
average during the run ranged from 1.35 to 5.05.

- Candidate: `533d41a78ae63e3fc87919c65f67150b583494c3`, recorded by all five
  candidate captures.
- Reference: `48a827861616fc3c3f6ccf69f0872edc1c8c771a` (`referenceCommit`),
  recorded by all five reference captures. Its app code is identical to the
  candidate's; the candidate differs only in perf tooling, `tools/loop`, `ci.yml`
  and a workflow doc.
- Five paired runs. Each measured both revisions interleaved, 7 batches per side
  per budget, wrote its own baseline from the reference, and graded the candidate.

Result: `ci.sh` exit 0. `stability.txt`: "Five consecutive captures of 533d41a7…
agree on all 11 CI budget verdicts; every drift column is populated." Every run
reported `0 regressed · 0 not measured · 0 without a baseline`.

## Drift per run (all verdicts pass)

| Budget                | Run 1  | Run 2  | Run 3  | Run 4  | Run 5  | Largest shift |
| --------------------- | ------ | ------ | ------ | ------ | ------ | ------------- |
| smoke-ci              | +0.7%  | −0.3%  | −0.1%  | −1.4%  | −0.9%  | 195 ms        |
| app-startup           | −1.7%  | −2.3%  | +0.7%  | −1.3%  | +0.4%  | 25.4 ms       |
| vault-open            | +1.7%  | −0.4%  | +1.3%  | −1.1%  | +1.6%  | 12.1 ms       |
| scene-first-render    | −1.5%  | −1.2%  | −0.3%  | +0.4%  | −1.1%  | 18.5 ms       |
| widget-update         | −25.9% | −26.6% | −6.2%  | −11.9% | +36.5% | 7.3 ms        |
| map-pan-zoom-desktop  | 0.0%   | 0.0%   | 0.0%   | 0.0%   | 0.0%   | 0.0 fps       |
| map-pan-zoom-slim     | +0.6%  | 0.0%   | +0.6%  | 0.0%   | 0.0%   | 0.4 fps       |
| search                | −12.5% | −12.5% | −11.1% | −22.2% | 0.0%   | 2.0 ms        |
| graph-indexing        | +6.5%  | −3.7%  | +6.2%  | −4.6%  | +0.3%  | 7.4 ms        |
| sync-reconciliation   | −1.5%  | −1.7%  | −0.8%  | +0.9%  | −0.4%  | 12.3 ms       |
| live-session-delivery | −12.3% | +6.5%  | +4.7%  | −1.1%  | −3.4%  | 2.4 ms        |

Positive drift is worse. Budgets measured in hundreds of milliseconds or more
stayed within ±6.5%. `widget-update` in run 5 read +36.5% on a +7.0 ms shift:
without the 25 ms resolution floor it would have graded REGRESSED and the five
runs would have disagreed (four pass, one breach). The floor changed exactly that
one verdict.

## Why the design has interleaving and a floor

Two earlier local runs on the same app code failed, and each failure produced
one of the two fixes.

1. **Sequential reference, then candidates.** Another checkout's e2e suite started
   partway through the reference capture. The first candidate then read
   `app-startup` +34.4% and `vault-open` +35.5% (REGRESSED). All seven of its
   `app-startup` batches (1302–1513 ms) were slower than every reference batch
   (1063–1160 ms), so the median of seven could not help. Fix: interleave the two
   revisions batch by batch (`dd9fbfc7`). Under the same kind of load the next run
   read `app-startup` +0.7% and `vault-open` +1.1%.
2. **Interleaved, percentage tolerance only.** `search` went from 6 to 8 ms, which
   is +33.3% and REGRESSED against a 250 ms target. `widget-update` batches sit at
   about one or two display frames (~18 or ~30 ms), so its median flips between
   them: −38.8% in that run, and the flip the other way reads as roughly +65%.
   Fix: millisecond drift within 1.5 frames (25 ms) grades steady (`533d41a7`).

## Caveats

- Run files record `cpuCount: 16`: Node's `os.cpus()` ignores the `taskset`
  affinity. They also record `runnerLabel: github-ubuntu-24.04`, because `ci.sh`
  sets it from `baseline.ci.json`. This was a workstation, not a GitHub runner.
- A GitHub runner is a single-tenant VM, so it will not see another e2e suite on
  the same cores. It can still see hypervisor-level noise, which interleaving is
  meant to cancel.
- The five paired runs took about 90 minutes here. The workflow timeout is 300
  minutes.
