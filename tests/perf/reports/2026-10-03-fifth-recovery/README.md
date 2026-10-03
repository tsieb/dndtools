# RC-ENG-3.2 fifth recovery

Paired local capture of candidate `42d518fda46eaeb42d0c374f2dfee191c10b2a6a` (tree
`d5904c8b255e1e82f292fe3d46d48eaf486d34a7`) against the review base
`f9ab3d74855c462613793ee87ce0034fd712d637` (tree `92c764052621d844f367d5e15225309592666202`).
Each side ran on its own dev server, seven batches per budget, interleaved and alternating
which side went first. **All eleven absolute targets pass on the candidate**, and the paired
comparator (baseline written from the reference capture of the same run) exits 0 with no
regression. Host load during the capture ranged 2.7–9.0 (1-minute average, sampled each
minute). This is one local run, not the hosted five-run stability gate.

| Budget                | Candidate | Reference | Target | Candidate batches (min–max) |
| --------------------- | --------: | --------: | -----: | --------------------------- |
| smoke-ci              |  15238 ms |  15297 ms | 180000 | 12435–16298                 |
| app-startup           |    1170.7 |    1176.6 |   2000 | 1122.2–1204.4               |
| vault-open            |     900.4 |     916.3 |   3000 | 868.0–947.6                 |
| scene-first-render    |    1408.9 |  1538.1 ✗ |   1500 | 1361.9–1453.4               |
| widget-update         |      33.0 |      34.3 |    100 | 20.6–46.4                   |
| map-pan-zoom-desktop  |  59.5 fps |  59.5 fps |   ≥ 50 | 59.5–59.9                   |
| map-pan-zoom-slim     |  59.5 fps |  59.9 fps |   ≥ 30 | 59.5–59.9                   |
| search                |     149.0 |     224.5 |    250 | 125.6–189.7                 |
| graph-indexing        |     277.4 |   867.4 ✗ |    500 | 248.8–401.9                 |
| sync-reconciliation   |     971.2 |     956.4 |   2000 | 719.0–978.0                 |
| live-session-delivery |      18.1 |      18.2 |    500 | 16.8–21.0                   |

Values are `measureCapture`: the median of the seven batch statistics. ✗ marks a reference
breach. Search and graph use the disclosed 2,000-note fixture.

**Scene.** All seven candidate batches (1361.9–1453.4 ms) are below all seven reference
batches (1514.4–1562.1 ms): −8.4% on the graded value. That is the whole story's gain
against the base. It is not the anticipated ~20%. The fourth recovery's breakdown still
holds: about two thirds of the interval is dev-server module transport and graph
evaluation outside this story's paths.

**This attempt's increment.** A second paired capture ran `scene-first-render` and
`widget-update` against the previous head `638d7b81` (tree `3535ee66…`) at load 4.9–8.9.
Scene was 1399.4 against 1437.7 ms (−2.7%), with the candidate faster in six of seven
batch pairs. Widget update was 31.8 against 37.2 ms. The interleaved probes in
`ab-probes/`, run at load 10–17 with the harness's exact mark, measured larger
paired-median gains as load rose: −67 ms for the prefetch alone, then −174 ms with the
fitting-tile fast path, 10/14 pairs faster each time. A deferred-measurement variant
measured +18 ms (5/12) and was dropped.

**Load caveat, stated plainly.** The previous review measured 1968 ms at load 9–15. At
loads like that, both revisions run slower, and the candidate's ~90 ms margin under the
1500 ms target can be consumed by host contention. This capture does not show the target
holding on a host that busy. It shows the candidate beating the base batch for batch.

## Validation on `42d518fd`

Full browser suite 1654 passed / 32 skipped (both projects). App tests 1756/1756.
Perf-harness tests 25/25. App typecheck. Production build plus `check-prod-bundle`, and
the core bundle budget passes at 633.3 KiB gzipped. Pinned-container visuals for board,
screen and scene routes 42/42. Targeted ESLint and Prettier. The `map-tile` logs show the
`seedFresh` race before the helper fix (3/6 desktop failures), the reference passing 6/6,
and 17 passed after the fix.

## Reproduction and retained evidence

```sh
pnpm exec tsx scripts/perf/capture.ts --port 19961 --out current.json \
  --reference-root <f9ab3d74 checkout> --reference-port 19962 --reference-out reference.json
pnpm perf:baseline --run reference.json --baseline baseline-paired.json --tolerance 0.2
pnpm perf:compare --run current.json --baseline baseline-paired.json --tolerance 0.2 \
  --markdown report-paired.md --json verdict-paired.json
sha256sum -c SHA256SUMS
```

Extract `evidence.tar.gz` into a scratch directory and run `sha256sum -c MEMBERS.sha256`
inside it. It holds both raw captures for each paired run, the comparator's baseline,
report, verdict and log, `grade.txt` (per-batch statistics), load samples, the A/B probe
scripts and their raw results, and the validation logs. Local checkout paths are replaced
with `<candidate>`, `<reference-…>`, `<scratch>` and `<home>`. `verification.txt` records
the checked commit and tree provenance, 77 nonempty batch groups per side, and exact
flattening of samples into batches.
