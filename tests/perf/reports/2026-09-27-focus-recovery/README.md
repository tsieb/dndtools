# RC-ENG-3.2 third-review recovery

Acceptance remains **unmet**: ten of eleven absolute targets pass. This is one
complete local paired run, with seven alternating batches per budget, not the
five-run hosted stability gate. Budgets, tolerances, scenarios and comparator are
unchanged. Both checkouts were clean throughout capture.

- Candidate: `864b5e15d87fb89a9a57ba24a620c4b23c1a7857`
- Candidate tree: `a08bec47fc45bf22e5af35e74deb5c55b77c7b98`
- Reference (review base): `6dd4f09c1a0873491cb51a5c8f9da1367103e8f7`
- Reference tree: `5bcba1ad74836c5f080f92ad073c94e303649120`

The evidence follow-up changes documentation/artifacts only. Application source and
capture/comparison scripts remain identical to the measured candidate.

| Budget                |  Reference |     Candidate |         Target |
| --------------------- | ---------: | ------------: | -------------: |
| smoke-ci              | 21985.0 ms |    20135.0 ms |      180000 ms |
| app-startup           |  1446.2 ms |     1436.0 ms |        2000 ms |
| vault-open            |  1103.3 ms |     1111.2 ms |        3000 ms |
| scene-first-render    |  1805.1 ms | **1684.9 ms** |    **1500 ms** |
| widget-update         |    26.3 ms |       33.5 ms |         100 ms |
| map-pan-zoom-desktop  |   59.5 fps |      59.5 fps | 50 fps minimum |
| map-pan-zoom-slim     |   59.5 fps |      59.5 fps | 30 fps minimum |
| search                |   268.9 ms |      175.6 ms |         250 ms |
| graph-indexing        |   980.5 ms |      302.2 ms |         500 ms |
| sync-reconciliation   |   985.8 ms |     1010.3 ms |        2000 ms |
| live-session-delivery |    18.5 ms |       17.5 ms |         500 ms |

Absolute comparator exits **1** for scene alone. Drift-only CI comparator exits 0;
that is not absolute-budget acceptance. Widget drift is +27.4%, but the unchanged
comparator classifies the 7.2 ms movement as steady under its resolution floor.
The scene win is only 6.7%, not approximately 20%. Host load moved during capture:
scene batch maxima fall on both sides, and three candidate batches pass. All seven
are retained; their median still breaches. This is not proof of a regression.
Graph passes in every batch (maxima 280.3–361.9 ms).

Scene fixture: 50 mounted frames and ten active map bodies in fresh contexts.
Graph/search fixture: 2,000 linked notes plus demo content. The registry describes
10,000 records; no claim of measuring that larger fixture is made here.

The browser focus probe seeds `Z Hub` plus 160 earlier-sorted linked notes, selects
the hub, then presses Focus. The hub stays selected, the inspector remains present,
focus stays enabled and active, and exactly 150 canvas nodes remain. The unit case
also covers distinct selection/focus IDs and missing actor-filtered anchors.

A separate, uncommitted CSS experiment tried `content-visibility: auto` on widget
regions without unmounting widgets or bindings. Five alternating cold-context pairs
showed no useful gain (plain median 1563.9 ms; contained 1583.3 ms). It was not applied
and its samples are not spliced into the full capture.

## Reproduce

From the measured candidate, prepare a separate clean reference checkout with
frozen dependencies, then run:

```sh
CI=true pnpm exec tsx scripts/perf/capture.ts --port 19883 \
  --out /tmp/recovery/current.json --reference-root /path/to/reference \
  --reference-port 19884 --reference-out /tmp/recovery/reference.json
pnpm exec tsx scripts/perf/compare.ts --run /tmp/recovery/reference.json \
  --write-baseline --baseline /tmp/recovery/baseline.json
pnpm exec tsx scripts/perf/compare.ts --run /tmp/recovery/current.json \
  --baseline /tmp/recovery/baseline.json
```

The archive retains both raw captures, derived baseline, absolute and CI verdicts,
logs and the standalone browser focus reproduction (run from the candidate root
with its dev server on port 19883). Validation and checksum verification are
recorded in the run journal. Text logs replace local checkout roots with neutral
labels; raw timing JSON is unchanged and the harness records hostname `ci-runner`.

## Validation and archive

Performance tests 25/25; focused app tests 229/229; browser tests 107 passed / one
existing desktop-only exclusion (mobile case passes); pinned-container visuals
33/33. App typecheck, full lint, quality/documentation gates and changed-file
formatting pass. The standalone high-degree browser focus probe also passes.

Verify [the archive](evidence.tar.gz) against [its checksum](SHA256SUMS), extract it,
then verify the member `SHA256SUMS`. All 22 member hashes, both Git source trees,
and all 154 batch groups were verified. No executable diff follows the captured
commit.
