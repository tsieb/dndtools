# Runtime recovery — local evidence, 2026-09-19

**All 11 standard budgets pass**, with no target breaches, regressions, missing
samples or missing baselines. Both absolute-target and CI-mode regression
comparators exited 0. This is one complete paired workstation run, using
RC-ENG-1.3's seven interleaved batches per budget. It is not hosted CI or the
five-run stability check. See [the full comparison](comparison.md).

| Measurement                                       | Reference | Candidate |              Target |
| ------------------------------------------------- | --------: | --------: | ------------------: |
| Scene first render                                | 1077.9 ms | 1053.3 ms |             1500 ms |
| Widget update                                     |   16.8 ms |   17.8 ms |              100 ms |
| Reconciliation                                    |  688.6 ms |  684.0 ms |             2000 ms |
| Supplemental 50 widgets / 10 map bindings, 2x CPU | 1143.9 ms | 1102.0 ms | Separate diagnostic |

The supplemental result is a **3.7%** median improvement across seven alternating
pairs. It reloads a persisted fixture and waits for all 50 frames and ten map
bodies plus two animation frames. It is not a new 20% speedup or the standard
cold-context first-render measurement. The archived single-commit demo-seed
optimization was already in the starting revision.

## Provenance and limits

- Candidate: `1e962b8e9644ba72d74723e1d83708f75837b6a9`.
- Reference: task starting revision `eafbce28a4f78231185cbf44ccbd603ad489415a`.
- Both servers were started by the candidate harness from their isolated
  checkouts, ports 16273 and 16373. The reference used frozen dependencies.
- Ryzen 7 5700X workstation, 16 logical CPUs; `CI=true` sanitizes the hostname,
  and `PERF_RUNNER_LABEL=local-workstation` identifies the actual environment.
- The pinned hosted reference in `baseline.ci.json` was **not** changed. This
  comparison isolates this task against its starting revision; it does not
  replace central gates against the pinned hosted reference.
- The capture process loaded the committed harness at startup. The only later
  executable edit adds `cause` to errors in failure diagnostics; app code,
  measurement paths, budgets, tolerance and samples are unchanged.
- Standard search/graph fixtures remain 200 seeded notes, as the raw captures
  state. This is not a 2,000-note graph or a 10,000-record search validation.
- The supplemental script and application blobs match the measured candidate;
  its server revisions are recorded here because it accepts existing server URLs.

## Original evidence

`captures.tar.gz` contains twelve exact-byte output files. `final-*` is the fresh,
complete run and both comparison modes. `recovery-*` is the initial incomplete
full capture; `sync-*` is its failed targeted reproduction; neither is acceptance
evidence. `scene-stress.json` contains every supplemental sample.

The reference reproduction failed on its fifth rapid reload, before a runtime
existed, with Chromium `net::ERR_INSUFFICIENT_RESOURCES` module-fetch failures.
Waiting for network idle did not help. Releasing each page between timed reloads,
while retaining the seeded browser context and warming each replacement outside
the timer, passed twelve standalone reloads with zero failed requests. The fresh
full run then completed **35 measured reconciliation reloads per revision**.
The timeout, sample count and timed reload interval remain unchanged; failures
are never silently retried or removed from a passing capture.

From this directory, verify and extract into an empty scratch directory:

```sh
sha256sum -c archive.sha256
mkdir -p /tmp/rc-eng-3.2-evidence
tar -xzf captures.tar.gz -C /tmp/rc-eng-3.2-evidence
cp members.sha256 /tmp/rc-eng-3.2-evidence/
(cd /tmp/rc-eng-3.2-evidence && sha256sum -c members.sha256)
```

From the repository root, reproduce grading without replacing any committed baseline:

```sh
pnpm perf:compare -- --ci --run /tmp/rc-eng-3.2-evidence/final-current.json --baseline /tmp/rc-eng-3.2-evidence/final-baseline.json --tolerance 0.2
pnpm perf:compare -- --run /tmp/rc-eng-3.2-evidence/final-current.json --baseline /tmp/rc-eng-3.2-evidence/final-baseline.json --tolerance 0.2
```

Capture command (create the detached reference checkout and install its frozen
dependencies first):

```sh
CI=true PERF_RUNNER_LABEL=local-workstation pnpm perf:capture -- --out tmp/perf/final-current.json --port 16273 --reference-root /tmp/rc-eng-3.2-reference-eafbce28 --reference-port 16373 --reference-out tmp/perf/final-reference.json
```

Validation: 1,551 app tests, 17 perf tests, targeted ESLint, quality/documentation
gates, and production build passed. The production scan confirms `__rt` and the
component gallery are absent. Browser checks confirmed both lazy authoring dialogs
open and close and request no editor modules before opening. Final formatting,
archive verification and ownership checks are recorded in the task journal.
