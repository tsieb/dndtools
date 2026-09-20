# CI acceptance lookup

Reviewed candidate: `1e1f38c63fbae9e69a0470471a5ff80da5fda701`.

The read-only GitHub lookup below exited 0 and returned zero runs on
2026-09-20. Its selected JSON response is retained in `candidate-runs.json`.

```sh
gh api 'repos/tsieb/dndtools/actions/runs?head_sha=1e1f38c63fbae9e69a0470471a5ff80da5fda701&per_page=100' --jq '{total_count, runs: [.workflow_runs[] | {id,name,head_sha,status,conclusion,html_url}]}'
```

This establishes only that the API returned no runs for this SHA at lookup
time. It is not performance evidence. The scoped performance suite passed
3 files / 16 tests on this candidate; those tests do not record a CI baseline.

Acceptance remains incomplete. The central operator must publish the candidate
when authorized and run the existing `Performance` workflow with its `ref`
input set to the exact published candidate SHA. Retain the run URL and uploaded
`perf-run` artifact. For each of the five paired runs, verify:

- `current-N.json` identifies the published candidate and `reference-N.json`
  identifies `48a827861616fc3c3f6ccf69f0872edc1c8c771a`.
- Both captures contain all eleven standard and eleven `:large` entries with
  nonempty real samples and seven completed batches per entry.
- `baseline-N.json` contains all 22 entries with numeric observations and
  positive sample counts backed by that run's reference capture.
- The comparison reports have populated drift for every entry, and the
  workflow's comparison and stability checks succeed.

The evidence-only commit containing this report changes no measured code.
No local measurements, synthetic samples, or configuration descriptions replace
the requested hosted artifact. This task prohibits pushing or promoting;
no publication or remote workflow dispatch was performed.
