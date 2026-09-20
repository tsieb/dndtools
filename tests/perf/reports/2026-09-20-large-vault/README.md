# Large-vault local verification

This is local functional capture evidence, not hosted CI acceptance or a stable
reference/candidate regression comparison. The raw capture retains all seven
batches for each of eight selected rows. Only the hostname was redacted; all
samples and other capture metadata are unchanged. The recorded revision is
`882a242bf7c2412b41f60b82c0599c15458cef03`. The final edit during this capture restored a TypeScript-only
Page interface member; the measured runtime implementation was unchanged.

The fixture build took **614.3 ms** and produced exactly
5,000 notes, 200 maps, 60 tiles and 40 characters, plus a 200-operation delta.
The deterministic-count, independent-state, storage-validation and ten-second
build assertions pass in the scoped performance tests.

| Workflow            | Standard |     Large |
| ------------------- | -------: | --------: |
| vault-open          | 798.1 ms |  829.3 ms |
| search              |  45.5 ms |  402.3 ms |
| graph-indexing      | 103.7 ms | 3258.5 ms |
| sync-reconciliation | 782.4 ms |  824.3 ms |

Values use the pipeline's median of seven per-batch statistics. Completion means
samples were recorded, not that every absolute target passed. Large graph indexing
measured **3,258.5 ms**, above its provisional **1,000 ms** target; the other seven
selected rows met their absolute targets. No threshold was relaxed to hide that
result. A same-runner reference comparison is still needed to establish drift. This selected run
is intentionally insufficient to write a complete 22-entry CI baseline.
The performance pipeline tests exercise the CI baseline writer and verify all
11 standard and 11 large entries, numeric values, and fail-closed missing rows.
The hosted workflow must still record and compare all 22 rows on its runner.

Reproduce the selected capture:

```sh
pnpm exec vitest run --config tests/perf/vitest.config.ts
pnpm perf:capture -- --only vault-open,search,graph-indexing,sync-reconciliation --out tmp/perf/navigation.json
```

See the [run journal](../../run-journal.md) for the separate paired-reference restore check, the other
large-scenario functional probes, the failed diagnostic runs and their recovery.
No publication, workflow dispatch or central gate result is claimed.
