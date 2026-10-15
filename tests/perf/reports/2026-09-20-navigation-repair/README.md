# Navigation timing repair verification

Implementation measured: `cd075a5306534e25cfee1ad1abd76e4c8dd81908`.
The working tree was clean during this run. `browser.tap` is the original,
unmodified stdout/stderr from a local Chromium regression run (exit 0).
This report adds evidence only; it does not change the measured implementation.

```sh
pnpm --filter @dndtools/gm-react exec vite --host localhost --port 15573 --strictPort
# In another terminal:
PERF_BROWSER_URL=http://localhost:15573 pnpm exec tsx tests/perf/navigation.browser.ts
```

Four tests passed, covering standard and large startup and scene first render.
Each runs one discarded warmup and three recorded samples. The tests insert a
100 ms post-restore delay and require each large navigation time origin to follow
completed setup. All 24 navigations returned document responses; all eight large
measured-document origins followed setup. Thus fixture generation, transfer,
restore and the injected delay are excluded from the navigation-based timings.

| Scenario           | Standard samples (ms)  | Large samples (ms)     |
| ------------------ | ---------------------- | ---------------------- |
| app-startup        | 881.5, 862.3, 875.0    | 845.1, 798.9, 822.7    |
| scene-first-render | 1101.0, 1071.1, 1075.4 | 1153.5, 1150.1, 1141.4 |

This is a local regression test with one batch per scenario, not a complete
22-row capture, measured CI baseline, or stability comparison. Hosted acceptance
remains pending. Run the Performance workflow on the published candidate and
retain its exact-SHA `perf-run` artifact, including all 22 measured baseline rows.
Neither the old selected capture nor this report establishes that criterion.
