# RC-ENG-3.2 fourth-review recovery

One complete local paired capture, seven alternating batches per budget, measured
executable commit `a916eddf` against review base `6f8e448d`. All eleven absolute
targets pass: the comparator reports **0 target breaches**. The reference breaches
two (scene 1539.8 ms and graph 820.9 ms). This is not the five-run hosted stability
gate. Budgets, tolerances, scenarios, fixtures and the comparator are unchanged.
Both checkouts were clean throughout the capture. Host load average was 3.8–4.4.

- Candidate: `a916eddf7b5a659fbc9a17aa9fce8c55bcb90fc9`
- Candidate tree: `20f7b63651b3e8b45e01ffa7e54844689e52501e`
- Reference (review base): `6f8e448d22b0c96efc0c7ae0d5b2fbea431b525b`
- Reference tree: `333e201cff2b4f17723764c169ab739c3dda9fec`

| Budget                |  Reference |     Candidate |         Target |
| --------------------- | ---------: | ------------: | -------------: |
| smoke-ci              | 16140.0 ms |    16155.0 ms |      180000 ms |
| app-startup           |  1178.9 ms |     1209.7 ms |        2000 ms |
| vault-open            |   933.0 ms |      901.4 ms |        3000 ms |
| scene-first-render    |  1539.8 ms | **1409.7 ms** |    **1500 ms** |
| widget-update         |    39.4 ms |       33.2 ms |         100 ms |
| map-pan-zoom-desktop  |   59.5 fps |      59.5 fps | 50 fps minimum |
| map-pan-zoom-slim     |   59.9 fps |      59.9 fps | 30 fps minimum |
| search                |   215.4 ms |      129.7 ms |         250 ms |
| graph-indexing        |   820.9 ms |      249.6 ms |         500 ms |
| sync-reconciliation   |   754.5 ms |      748.2 ms |        2000 ms |
| live-session-delivery |    16.9 ms |       18.0 ms |         500 ms |

Scene batch maxima: candidate 1350.1–1480.5 ms, all seven under the target;
reference 1466.1–1597.8 ms. Graph batch maxima: candidate 243.1–259.8 ms.

Three comparator verdicts are retained:

- **Paired:** the candidate against a baseline written from the reference run. Exit 0, no
  target breach, no regression.
- **Default:** against the committed `tests/perf/baseline.json`. Exit 1, but only on drift:
  app-startup, vault-open, scene and search. The reference also drifts against that
  file (and breaches two targets), so the drift is not this candidate's. The `search`
  baseline of 13 ms predates the 2,000-note fixture.
- **Reference:** the same default comparator over the reference run.

## What the scene number is made of

The scenario times a cold browser context from navigation start until the board has
painted 50 frames and 10 map tiles, against the Vite dev server. One cold `/board`
open on the starting head `96b2c726` (`cold-board-resource-timing.json`):

- 658 module requests over HTTP/1.1. 354 are `@dndtools/core` source files, which is
  everything the core barrel reaches, and none of them is optional.
- Chromium's six connections are the bottleneck. The median request waits 199 ms in
  the queue (p90 473 ms) for a 3 ms server response. The main thread is about 80% idle
  until the module graph has arrived (about 880 ms on a quiet host).
- Runtime hydration takes about 130 ms. The board's own work takes about 200–250 ms:
  the route chunk arriving, the render of 50 frames, commit and layout.

The scene-specific share is therefore under 20% of the measured interval. A change
limited to the board can lower it by only part of that share. A diagnostic run with
`@dndtools/core` prebundled by the dev server cut the requests from 658 to 305 and
the time from about 1250 ms to about 846 ms, a 32% drop. That run was not
interleaved and changed nothing in the product, so it is not evidence and is not
applied. It shows where the rest of the time is.

## What changed for the board

- The layout history resets its stacks on mount, and the pane reports its width only
  after first paint. Both used to re-render all 50 frames and their bodies (commits
  of 66 + 26 + 9 ms of React time). Frames are now memoized behind per-widget handlers,
  and the width is read before first paint. The follow-up commits cost 0.7 and 4.3 ms.
- A cold `/board` or `/screen/:id` open fetches the screen chunk while the vault
  hydrates, instead of after it. The demo-seed module is fetched alongside the storage
  read.
- Every durable commit used to serialize the whole vault to check the 5 MiB boundary
  limit. The boundary now measures exact UTF-8 JSON length, memoized by object
  identity. A related core finding is recorded as `DEBT-2026-009`: every content
  command copies every content item.

An interleaved 16-pair browser A/B against the previous candidate `96b2c726` measured
1284 → 1271 ms: the board work is real but small in this metric. The scene win over
the base is 8.4% here (6.7% in the four-budget run, `four-budget-*.json`), not the
roughly 20% the story anticipated. Under heavier host load than this capture's, the
dev-server share grows and the scene target is at risk again.

## Reproduce

From the candidate, with a clean reference checkout on frozen dependencies:

```sh
CI=true pnpm exec tsx scripts/perf/capture.ts --port 19911 \
  --out current.json --reference-root /path/to/reference \
  --reference-port 19913 --reference-out reference.json
pnpm exec tsx scripts/perf/compare.ts --run reference.json --write-baseline --baseline baseline.json
pnpm exec tsx scripts/perf/compare.ts --run current.json --baseline baseline.json
pnpm exec tsx scripts/perf/compare.ts --run current.json
```

## Validation and archive

App tests 1720/1720; core 5173/5173 (also shuffled); perf 29/29; typecheck, lint
(0 errors), quality and docs gates, and formatting of the changed files against
`loop/rc` pass. Board browser specs (canvas, arrange, keyboard, screens, flow,
custom widgets, starter widgets, widget kit, authoring layout): 147 passed, 1
skipped, on desktop and mobile. That skip is the existing desktop exclusion. Text logs
replace local roots with `<candidate>` and `<reference>`. The raw timing JSON is
unchanged, and the harness records hostname `ci-runner`.

Verify [the archive](evidence.tar.gz) against [its checksum](SHA256SUMS), then the
member `SHA256SUMS` inside it.
