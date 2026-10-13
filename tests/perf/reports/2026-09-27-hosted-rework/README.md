# RC-ENG-3.3 hosted-capture rework (2026-09-27)

The owner-authorized Performance run
[36282130325](https://github.com/tsieb/dndtools/actions/runs/36282130325)
captured `2c2ac85e` and was cancelled at the 300-minute job timeout during run 5.
`hosted-run-36282130325-timings.txt` holds its per-row timing lines, extracted
from the job log.

## Defect 1: large map rows recorded no samples

Both `map-pan-zoom-*:large` rows failed on every run with
`Payload of 5244507 bytes exceeds the 5242880 byte limit for storage.persistFullState`.
The pinned reference `48a82786` validates `{ previous, next }` at that boundary
(its `coreStore.ts`, line 716). A commit there therefore costs about twice the
vault. The map scenario's first command (`map.create`) crossed the cap by ~1.6 KB.
The candidate's own boundary sends `{ next, appended }` and had ~50% to spare.

After rebasing onto loop/rc `6dd4f09c`, note history (RC-KNW-5.2) doubled the
fixture's operation count. A live probe restored the old fixture into the
reference and dispatched one note. The reference rejected it at
**5,343,213 bytes**, so every committing large row would have failed.

The fix keeps the cap. It shortens ids and note bodies, keeps two links per
note, and records 100 note edits (200 operations on this core). One of the 200
maps is the pan/zoom map, built by the same `map.create` / `map.create-poi`
commands. The large map rows pan it without committing anything. The snapshot
is 2,354,674 bytes and builds in 492–643 ms.

`tests/perf/large-vault.test.ts` replays each `:large` scenario's commits,
using UUID-length ids. It requires 384 KiB of headroom on both boundary shapes.

| Boundary                        | Peak commit (widget-update:large) | Under the 5 MiB cap |
| ------------------------------- | --------------------------------- | ------------------- |
| This revision, real validator   | 2,364,007 B                       | 2,878,873 B (54.9%) |
| Pinned reference, `{prev,next}` | 4,726,918 B                       | 515,962 B (9.8%)    |

Against the previous fixture, the test fails at 5,342,569 B. The live reference
measured 5,343,213 B, so the prediction is within 0.02%.

## Defect 2: runtime

Hosted runs 1–4 took 65.0, 63.8, 63.6 and 63.4 min (dev-server start to next start). The standard rows took ~1,285 s per run
and the large rows ~2,505 s. The large figure excludes map time, because both map
rows failed within 20 s. Five runs could not fit in `timeout-minutes: 300`.

Changes made, all in `scripts/perf/capture.ts`:

- The snapshot is built and serialized once per capture. Each restore parses
  its own copy in the page.
- `smoke-ci:large` records the `smoke-ci` batches from the same capture, because
  smoke CI never opens a vault. The fixture label says so.
  Hosted cost was 294 s per run.
- `app-startup:large` and `scene-first-render:large` restore once per batch and
  give each sample a new page in that context. This is the state each sample
  started from before, when every sample restored first.
  Restores drop from 56 to 14 per row per run.
- `search:large` and `graph-indexing:large` skip a reopen that only in-page
  seeding needs.
- `search:large` resets each sample with a query that matches nothing. Clearing
  the box rendered all 5,000 notes between samples, which was ~50 s per batch on
  the hosted runner.

## Local verification (not hosted evidence)

One full paired capture of `1d7de2da` against the pinned reference ran on a
Ryzen workstation at load average ~15 (`local-full-capture.log`).

- Exit 0. Both files have 22 rows, seven nonempty batches each.
- Wall time: **47.2 min** (03:47:27–04:34:38 PDT). Standard rows: 1,525 s.
  Large rows: 1,303 s, down from ~2,505 s hosted with the maps failing.
- This host ran the standard rows 1.19× slower than the hosted runner
  (1,525 s vs 1,285 s). Scaling by that factor gives **~40 min per hosted run**.
  Five runs would take ~200 min, plus ~2 min of setup.
- If hosted runs matched this host's 47.2 min, five runs would take 236 min.
  That still leaves over an hour under the 300-minute timeout.

`perf:baseline --ci` wrote all 22 rows from the reference capture.
`perf:compare --ci` (`local-full-report.md`) graded every row and exited 1 on
two large rows:

- `search:large`: +48.5%. The hosted runs on the old fixture also showed the
  candidate slower (+5%, +29%, +23%, +47%). Standard `search` was +23% to +34%
  there too. This is candidate-versus-reference product drift, not a harness
  artifact.
- `graph-indexing:large`: +23.5% locally. It was −2% to −4% on the hosted runs,
  which predate the rebase. Unconfirmed on a hosted runner.

Neither verdict was tuned away. The capture's host field reads `ci-runner`
because `CI=true` was set; the machine was the workstation described above.

`navigation-browser.tap` is the opt-in Chromium boundary check. It passed 4/4
with context reuse: every large sample navigation started after the restore.

Hosted acceptance still requires the owner's next Performance run on the
published candidate.
