# RC-ENG-3.2 scope recovery

Fresh local capture of `955c54200b2421098f7d9d349edca4953e777d8f`, tree
`b7710ad378b5bfcca84886f03b4dadb8fb824d02`. All eleven absolute targets pass.
This is one unpaired local run, not paired drift evidence or hosted stability evidence.
The default comparator exits **1**: six regressions against the September 6 static
baseline. No baseline, budget, scenario, sample count or tolerance was changed.
In particular, that static search baseline predates the 2,000-note fixture.

| Budget                |   Observed |         Target |
| --------------------- | ---------: | -------------: |
| smoke-ci              | 16052.0 ms |      180000 ms |
| app-startup           |  1291.6 ms |        2000 ms |
| vault-open            |  1003.5 ms |        3000 ms |
| scene-first-render    |  1485.1 ms |        1500 ms |
| widget-update         |    33.5 ms |         100 ms |
| map-pan-zoom-desktop  |   59.5 fps | 50 fps minimum |
| map-pan-zoom-slim     |   59.5 fps | 30 fps minimum |
| search                |   160.6 ms |         250 ms |
| graph-indexing        |   346.2 ms |         500 ms |
| sync-reconciliation   |  1080.2 ms |        2000 ms |
| live-session-delivery |    18.7 ms |         500 ms |

Scene has only 14.9 ms of margin; this run does not establish the anticipated
20% scene improvement. Host load readings during capture ranged approximately
7.6–11.3. The comparator's six drift failures are startup, vault open, scene,
search, graph indexing and reconciliation. No causal attribution is made from
comparison with a historical run on different load and fixture conditions.

The scope repair removes this task's added localization key and reports the drawn
canvas count using the existing translated `graph.showing` message. English,
Spanish and the pseudo catalog exactly match integration base `09347dc8`.
The graph/search/runtime optimizations from the candidate remain present.

Validation: localization 32/32, perf unit tests 29/29, large-vault browser tests
6/6 (desktop/mobile), pinned-container graph visuals 15/15, app typecheck,
targeted ESLint, formatting, whitespace and quality/documentation gates pass.
The capture also completed seven successful smoke checks. Central gates and
independent review remain separate.

## Reproduction and retained evidence

```sh
CI=true pnpm exec tsx scripts/perf/capture.ts --port 19875 --out current.json
pnpm exec tsx scripts/perf/compare.ts --run current.json --json verdict.json --markdown comparison.md
sha256sum -c SHA256SUMS
```

Extract `evidence.tar.gz` into a scratch directory, then run `sha256sum -c SHA256SUMS`
inside it. The archive contains the unmodified raw capture, comparator output,
verdicts and validation logs with local checkout paths replaced by `<candidate>`.
All 77 nonempty batch groups, exact sample flattening, source commit/tree, archive
checksum and member checksums were verified. `clean: false` in `verdict.json`
means the comparator failed; the measured Git checkout was clean throughout.
