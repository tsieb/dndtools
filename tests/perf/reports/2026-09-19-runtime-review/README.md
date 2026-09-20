# RC-ENG-3.2 review recovery evidence

**Acceptance is not met.** The complete fresh capture establishes nine passing
targets and two breaches at the assigned larger workloads. CI drift passes, but
that does not override the absolute targets. The requested approximately 20%
scene improvement is also not demonstrated. No budget or tolerance was increased.

| Workload                                       | Reference |     Candidate |  Target |
| ---------------------------------------------- | --------: | ------------: | ------: |
| First navigation, 50 widgets / 10 map bindings | 1134.7 ms |     1081.4 ms | 1500 ms |
| Widget update                                  |   16.8 ms |       18.9 ms |  100 ms |
| Search, 2000 linked notes + demo content       |  270.4 ms |  **306.7 ms** |  250 ms |
| Graph update, 2000 linked notes + demo content | 1221.8 ms | **1209.4 ms** |  500 ms |
| Generated continent pan/zoom, desktop          |  59.5 fps |      59.5 fps |  50 fps |
| Generated continent pan/zoom, slim             |  59.5 fps |      59.5 fps |  30 fps |

[All eleven verdicts](comparison.md) include the remaining startup, vault,
reconciliation, delivery and smoke-check measurements. Both compared revisions
breach search and graph absolute targets. Scene improvement is **4.7%**, not 20%.

## Provenance

- Fully measured application/harness: `9aef81b3bc9b6f7524aa8882353867441d3fabd1`.
- Reference: actual integration base `dda3120a56153caab48207c8937cda65454cd35b`,
  in a detached checkout installed with frozen dependencies.
- Both raw captures record the exact commit and Git tree. The harness checks for
  a clean checkout at the start and end, rejecting revision changes during capture.
- Seven alternating paired batches per budget, with raw samples and grouping
  retained. One complete local workstation run, **not five-run stability or hosted CI**.
- Both Vite servers were started by the same candidate harness, ports 16273/16373.
  Hostname is sanitized to `ci-runner`; runner label is `local-workstation`.
- Default browser CPU speed, matching the standard capture protocol; no 2x claim.
- The final evidence commit restores the application and scripts to exactly the
  fully measured revision. Subsequent differences are this report, its artifacts,
  and the journal. Verify with the source-diff command below.

Scene setup issues real durable commands, exports IndexedDB, and navigates to the
board in fresh browser contexts. Samples require exactly 50 frames and ten map
bodies. This is first navigation into a prepared campaign, not a persisted-page
reload or first-ever empty-vault onboarding. Graph/search contexts independently
restore a real 2000-note command log; they do not reuse an in-memory index.
Map setup runs `world.continent` with defaults and seed `runtime-recovery`, then
adds the existing four-layer/100-POI workload. Search now brackets text entry and
result rendering; the former timer began after text entry and undercounted work.
The 2000-note workload remains below the registry's 10000-record future dataset.

## Additional diagnostics

`memo-*` measures the temporary `38fac4f00a2ab79f85d008a1807b55987cddc1df`
canvas memoization experiment against the same reference: scene 1487.2 → 1373.4 ms
(**7.7%**), widget update 21.8 → 20.6 ms. These are two-budget diagnostic captures,
not a complete acceptance run, and are not combined with the eleven-budget run.
The experiment was restored to the fully measured application after it also
failed to demonstrate the requested recovery. Both versions passed all five
custom-widget browser tests, including actual iframe execution and config updates.

`profile-queries.ts` and `query-timings.json` reproduce seven isolated Node calls
per query on 2000 real-command-created linked notes. Medians: visualization
19.7 ms, health 156.5 ms, clusters 167.0 ms. `query-profile-summary.json` retains
CPU sampling totals with source paths sanitized; JIT attribution can distribute
inlined work among caller frames. This is diagnostic evidence, not browser budget
evidence. Health and clustering repeatedly resolve every outbound link through
`packages/core/src/state/wikilink-graph.ts`'s linear candidate scan. That resolver
and the state-engine callers are outside this task's owned paths. Scope extension
was requested before editing them; they remain unchanged. Search also spends time
in browser rendering, so indexing alone is not yet claimed to resolve either breach.

## Reproduce and verify

From this report directory:

```sh
sha256sum -c archive.sha256
mkdir -p /tmp/runtime-review-evidence
tar -xzf captures.tar.gz -C /tmp/runtime-review-evidence
cp members.sha256 /tmp/runtime-review-evidence/
(cd /tmp/runtime-review-evidence && sha256sum -c members.sha256)
```

From the repository root, grading the absolute targets must exit **1**:

```sh
pnpm perf:compare -- --run /tmp/runtime-review-evidence/review-current.json --baseline /tmp/runtime-review-evidence/review-baseline.json --tolerance 0.2
pnpm perf:compare -- --ci --run /tmp/runtime-review-evidence/review-current.json --baseline /tmp/runtime-review-evidence/review-baseline.json --tolerance 0.2
# Must be empty: final executable source equals the measured candidate.
git diff 9aef81b3bc9b6f7524aa8882353867441d3fabd1 HEAD -- apps packages scripts
```

Fresh capture (prepare the detached reference and install frozen dependencies first):

```sh
CI=true PERF_RUNNER_LABEL=local-workstation pnpm perf:capture -- --out tmp/perf/review-current.json --port 16273 --reference-root /tmp/rc-eng-3.2-review-reference --reference-port 16373 --reference-out tmp/perf/review-reference.json
```

For query profiling, copy the archived `profile-queries.ts` into `tmp/perf/`
and run `pnpm exec tsx tmp/perf/profile-queries.ts`. It writes the original
CPU profile locally; that file includes local source paths and is not packaged.

Validation: 36 widget unit tests, 18 perf tests, application typecheck, and five
custom-widget browser tests passed for the fully measured code. No push,
promotion, extra loop, control-state edit or sub-agent was used.
