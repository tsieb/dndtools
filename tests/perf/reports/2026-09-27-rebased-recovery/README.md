# RC-ENG-3.2 rebased recovery evidence (2026-09-27)

**Graph indexing and search are back under target. Scene first render is not.** These are paired
local captures of the branch, rebased onto `loop/rc` `cc47d694`, against that same `loop/rc`
commit. Seven interleaved batches per revision, `taskset -c 0-7`, on a shared 16-core workstation
under heavy unrelated load (load average 10–18 throughout). No target, tolerance, fixture size or
aggregation policy changed.

## Full capture (all eleven budgets)

Candidate `1da4d6a3` (tree `c468ee52`, code identical to `f2b4a205`) against reference `cc47d694`
(tree `c9f834c7`). The complete table is in [comparison.md](comparison.md), graded against a baseline
derived from the paired reference capture:

| Workload                            | Reference |     Candidate |  Target |
| ----------------------------------- | --------: | ------------: | ------: |
| Scene first render, 50 widgets / 10 | 1898.4 ms | **1855.3 ms** | 1500 ms |
| Widget update                       |   45.2 ms |       45.1 ms |  100 ms |
| Search, 2000 linked notes + demo    |  339.1 ms |      211.8 ms |  250 ms |
| Graph update, 2000 linked notes     | 1359.8 ms |      450.5 ms |  500 ms |

The other seven budgets pass on both revisions, all within 3.0% of the reference except
`live-session-delivery`: 30.0 ms against 25.9 ms, which is +15.8% but under the 25 ms
frame-quantization floor, so it grades steady.
The absolute comparator exits **1** for scene first render only, and the reference breaches it
too, at 1898.4 ms against a 1068.3 ms desktop baseline. This host was not quiet enough to decide
that budget.

## Final four-budget capture

Candidate `9a332698` (tree `88ceb2c9`, the branch head carrying code changes) against the same
reference, load average about 10:

| Workload           | Reference | Candidate |  Target |
| ------------------ | --------: | --------: | ------: |
| Scene first render | 1745.2 ms | 1743.3 ms | 1500 ms |
| Widget update      |   34.7 ms |   35.9 ms |  100 ms |
| Search (p95)       |  276.9 ms |  174.3 ms |  250 ms |
| Graph indexing     | 1194.9 ms |  380.6 ms |  500 ms |

Scene first render, candidate relative to reference, across the four captures of this pass: −17.6%,
−18.1%, −2.3%, −0.1%. That spread is host noise. It does not demonstrate the approximately 20% win
the story asks for.

## Contents

`captures.tar.gz` (checksum in `archive.sha256`, members in `members.sha256`) holds every raw
capture of this pass. Captures 1–3 (`ref-/cand-1..3.json`) cover the four at-risk budgets. The
full capture (`ref-/cand-full.json`) covers all eleven. The archive also holds the derived reference
baseline, the capture and comparator logs, and summaries of the two browser suites (150/150 graph,
screens and canvas; 284/285 a11y, responsive, canvas and golden-path, where the single failure is the
known jump-sheet color-contrast flake, and 6/6 reruns pass on both the candidate and the reference).
Local paths in the logs are replaced with `<candidate>`, `<reference>` and `<home>`. Capture 1's
first attempt was refused by the harness because the tree was dirty; `run-1.log` is the rerun.
