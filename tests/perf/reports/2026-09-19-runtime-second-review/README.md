# RC-ENG-3.2 second-review recovery evidence

**Acceptance remains unmet.** This complete paired run measures all eleven budgets
on the current executable source. Ten absolute targets pass; graph indexing still
breaches 500 ms. Scene first render improves only 2.3%, short of the requested
approximately 20%. No target, tolerance, fixture size or aggregation policy changed.

| Workload                                         | Reference |     Candidate |  Target |
| ------------------------------------------------ | --------: | ------------: | ------: |
| Scene first render, 50 widgets / 10 map bindings | 1140.4 ms |     1114.2 ms | 1500 ms |
| Widget update                                    |   16.8 ms |       18.3 ms |  100 ms |
| Search, 2000 linked notes + demo content         |  241.2 ms |      240.1 ms |  250 ms |
| Graph update, 2000 linked notes + demo content   | 1167.5 ms | **1238.0 ms** |  500 ms |

[All eleven results](comparison.md) retain each fixture and target. The absolute
comparator exits **1**. The CI drift-only comparator exits **0**, with zero drift
regressions, missing measurements or missing baselines. Both revisions breach the
graph target; this is an unresolved recovery target, not evidence that this change
introduced the slowdown. The JSON comparator's `clean: false` denotes its failing
verdict, not a dirty checkout.

## Source identity and measurement

- Candidate: `67b57da06bab7d564ef0105a9af02d6134391eae`.
- Candidate tree: `049ba61a0e31238fecd72bc66cd8b19eacf98de4`.
- Reference: actual integration base `e0d2031b677dbbf8ef14c893699ba7052f3480e6`.
- Reference tree: `c08e8d954686009c4de633cd63beba9cdb70f6cf`.
- Clean source identity verified by the harness before and after capture. The
  reference used an isolated detached checkout with frozen dependencies.
- One complete local workstation run using RC-ENG-1.3's seven alternating batches
  per revision; all 154 batch groups and their flattened raw samples verified.
  This is not hosted CI or five-run stability evidence. Default CPU speed, not 2x.
- The candidate harness drives both servers with identical scenarios, including
  the strengthened graph failure checks. The scene uses fresh browser contexts,
  not warmed pages. Graph/search seed 2000 notes; map scenarios generate real
  `world.continent` output. Other fixtures are stated in the comparison.
- The capture ended at `2026-09-20T05:39:09.661Z` (September 19 locally).
  Hostname is `ci-runner`; local checkout paths in validation logs are sanitized.
- The subsequent evidence commit changes documentation/artifacts only. The
  application and measurement scripts remain identical to the captured revision;
  the source-equivalence command below must remain empty. Any later executable
  change requires a new capture.

## Changes and remaining blocker

The canvas consumes `ResizeObserver`'s completed content-box measurement instead
of forcing a `clientWidth` read after mounting the widget tree. Its wrapper has no
padding; rounding preserves the prior width semantics. The complete desktop/mobile
canvas suite passes, including fit presets, overflow, keyboard use and persistence.

The graph capture now rejects the whole batch when a command is rejected or its
changed note never appears. Previously a rejection dropped a sample, and a render
timeout was recorded as successful work. The extracted browser helper has tests
for successful updates and both failures; the real browser capture also exercised
all 70 accepted/rendered updates across the two revisions.

The shared resolver still performs a full candidate scan for every link in both
health and clustering. A single first-match name index, built for each supplied
actor-filtered candidate array, would preserve title/alias precedence, availability
and section handling while removing these repeated scans. The narrow implementation
requires `packages/core/src/state/wikilink-graph.ts`, `graph-quality.ts`, and
`graph-clusters.ts`. These are outside the task's listed owned paths. Scope
extension was requested, but no response arrived; these files remain unchanged.
The separate approximately 20% scene recovery requirement also remains unresolved.

Validation: 21 performance tests, 82 canvas browser checks (desktop/mobile), app
TypeScript, targeted ESLint, formatting and quality/documentation checks pass.
Validation logs with sanitized paths and a source/exit-code manifest are retained
in the archive.
No push, promotion, additional loop, dispatcher-state edit or sub-agent was used.

## Verify and reproduce

From this report directory:

```sh
sha256sum -c archive.sha256
mkdir -p /tmp/runtime-second-review-evidence
tar -xzf captures.tar.gz -C /tmp/runtime-second-review-evidence
cp members.sha256 /tmp/runtime-second-review-evidence/
(cd /tmp/runtime-second-review-evidence && sha256sum -c members.sha256)
```

From the repository root (absolute grading must exit **1**; CI drift grading **0**):

```sh
pnpm exec tsx scripts/perf/compare.ts --run /tmp/runtime-second-review-evidence/current.json --baseline /tmp/runtime-second-review-evidence/baseline.json
pnpm exec tsx scripts/perf/compare.ts --ci --run /tmp/runtime-second-review-evidence/current.json --baseline /tmp/runtime-second-review-evidence/baseline.json
git diff --exit-code 67b57da06bab7d564ef0105a9af02d6134391eae HEAD -- apps packages scripts 'tests/perf/*.test.ts'
```

For a new capture, prepare a detached reference at the recorded base and install
frozen dependencies, then run from a clean candidate checkout:

```sh
CI=true PERF_RUNNER_LABEL=local-workstation pnpm exec tsx scripts/perf/capture.ts --port 19573 --reference-root /tmp/rc-eng-3.2-second-reference --reference-port 19673 --out /tmp/current.json --reference-out /tmp/reference.json
pnpm exec tsx scripts/perf/compare.ts --write-baseline --run /tmp/reference.json --baseline /tmp/baseline.json
pnpm exec tsx scripts/perf/compare.ts --run /tmp/current.json --baseline /tmp/baseline.json
```
