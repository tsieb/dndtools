# ci-recovery-5bcd0e609e8d — offline-gate rule flags the split-out presence hook

## Failure

- CI runs 37260483375 (`push`) and 37260485853 (`pull_request`) on `5bcd0e60` both failed
  `build-and-test` at **Run unit tests**, in the `cloud` vitest project:
  `apps/gm-react/src/cloud/offline.gate.test.ts > every module importing a network-backed cloud
client also imports the offline gate`, with `expected [ 'app/shell/presence.ts' ] to deeply
equal []`. Every other cloud test passed (564/565). `pnpm test` chains with `&&`, so `test:app`,
  `test:tooling` and the coverage-floor step never ran in CI.
- Reproduced locally with
  `pnpm exec vitest run --config vitest.cloud.config.ts apps/gm-react/src/cloud/offline.gate.test.ts`.

## Cause

`d84d9ec7` (RC-POL-1.23, shell polish) moved the footer presence-dot logic out of
`app/shell/rows.tsx` into a new `app/shell/presence.ts` hook. The hook imports
`cloud/CloudSyncContext`, which is on the rule's `NETWORK_MODULES` list. `rows.tsx` was already
allowlisted ("Displays state, offers no action"), but the new file was not. RC-CAN-8.1 did not
touch either file. It was simply the first promoted commit after RC-POL-1.23 to run CI.

`presence.ts` only reads `useSession()` and `useCloudSync()` state (`available`, `enabled`,
`engineStatus`) to produce a dot and a caption. It renders no JSX and calls no cloud method. Its
only consumer, `Sidebar.tsx`, has no cloud imports.

## Fix

- `apps/gm-react/src/cloud/offline.gate.test.ts`: added `app/shell/presence.ts` to
  `NO_CLOUD_CONTROLS` with its reason, next to `rows.tsx`. This is the remedy the assertion names,
  and it follows the precedent of the other split-out hooks (`usePublishModel.ts`,
  `useWikiModel.ts`). The rule itself, `NETWORK_MODULES` and the reason-length check are unchanged.

## Verification

- The targeted test passes 3/3, including the allowlist test (the entry exists, and its reason is
  longer than 40 characters).
- `pnpm test` (the CI step) exits 0: core 284 files / 5184 tests, cloud 46 / 565, app 165 / 1931,
  tooling 31 / 246.
- `pnpm test:coverage:core` (the next CI step, which was skipped) exits 0.
- `prettier --check` and `eslint` pass on the changed file.

## Not in scope

The Performance workflow run on the same SHA (37260485900) also failed:
`Budget "graph-indexing" REGRESSED: 201.4ms is 24.4% worse than the 161.9ms baseline (tolerance
20.0%)`. This task names only the CI workflow, so it is left for its own triage.
