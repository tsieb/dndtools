# ADR-040: Commit Cost and Boot Path Remediation

- Status: Accepted
- Date: 2026-09-11
- Deciders: Engineering
- Consulted: Product
- Supersedes: N/A
- Amends: ADR-004 (the `storage.persistFullState` boundary request is now `{ next, appended }`, and
  the adapter writes only the slice documents whose reference changed since the last committed
  transaction) and ADR-024 (the generator registry is no longer imported by the `map.generate`
  reducer; the host supplies it through `CoreEnvironment.mapGenerators`, loaded on demand from the
  `@dndtools/core/map-generators` entry).

## Context

The Performance workflow (ADR-009) breached `scene-first-render` on six of eight runs between
2026-09-10 and 2026-09-11 with no single regressing commit, and a local capture of `main` on
2026-09-11 graded five budgets as regressed against the checked-in baseline. Profiling a cold boot to
`/#/board` at 4× CPU throttle put the cost in three places:

1. **Every accepted command committed the whole vault.** `persistFullState` wrote all twelve slice
   documents to IndexedDB (each `put` structured-clones its document), and the PLAT-007 boundary
   serialized the previous AND next state for the size check and ran the zod schema over every
   operation ever logged. A commit's cost grew with the vault's age. The first-run demo seed ran
   ~42 such commits before the first scene could render: ~420 ms in Dexie and ~270 ms serializing
   states at 4× throttle.
2. **The shell's eager module graph carried code no boot reaches.** The Cognito SDK and its `buffer`
   polyfill, the sign-in dialog, the onboarding overlay, the command palette, the host dialog, the AI
   provider-key store and the whole `CHANGELOG.md` (parsed on every shell render). In production that
   was 81 modules and the entire `vendor-auth` chunk; on the Vite dev server the perf pipeline
   measures, each was a separate request and transform.
3. **The procedural map generators shipped in the eager core chunk.** The `map.generate` reducer
   imported the registry statically, and the Vite `manualChunks` rule folded every core module into
   `processing-core`, so ~260 KiB of unminified generator code (city, dungeon, cave, region, world,
   scatter) loaded before the Command Center could paint, for a feature most sessions never open.

A fourth, smaller cost: `SceneRuntime.dispatch` emitted a version bump on the command's pending
phase, which nothing renders, so every command re-rendered all ~120 `useRuntime()` consumers twice.

## Decision

1. **The durable commit writes what changed and validates what it appends.** The storage adapter
   remembers, per slice, the object reference last committed to disk. Reducers are immutable, so a
   slice whose reference is unchanged is byte-for-byte the document already in IndexedDB and is not
   rewritten. The map is filled only by a committed transaction and emptied by every other path that
   touches the documents table (load, restore, reset, migration recovery, the test seams), so a stale
   entry can never suppress a write. The PLAT-007 request for `storage.persistFullState` is
   `{ next, appended }`: the appended operations are validated entry by entry (they are what reaches
   the operations table) and the rest of the log is checked for shape only. The previous state does
   not cross the boundary; it was the `next` of the last accepted commit and was validated then. The
   adapter still enforces "no durable change without an accepted operation" against the previous
   state it holds. The demo seed runs every command through the reducer but commits once.
2. **Optional surfaces load when first used.** `React.lazy` for the sign-in dialog, the command
   palette and the host dialog, each mounted on first open and kept mounted so its state survives a
   close; the onboarding overlay behind a gate that reads the same `localStorage` flag it does; the
   Cognito SDK imported inside `auth.ts` on first use; the changelog fetched when the Help menu
   opens, with the "unseen release" badge comparing the seen version against the built version
   (`__APP_VERSION__` from `package.json`, pinned to the changelog's latest release by a unit test).
3. **The map generators are a host-supplied capability.** `CoreEnvironment.mapGenerators` is an
   optional registry. `map.generate` resolves generators through it and is rejected fail-closed
   (`generator-not-found`) when none is supplied; it never fabricates a map. `buildMapInverse` takes
   the registry from its caller and reports a generate as not undoable without one. The registry is
   the `@dndtools/core/map-generators` entry, not part of the barrel; `SceneRuntime` imports it on
   the first `map.generate` and caches it, and Vite routes the generator modules into their own
   chunk. Replay determinism is unchanged: the op still records the generator id, its version, the
   seed and the params, and the same registry produces the same geometry on every device.
4. **One render per command.** The pending-phase emit is gone; the lifecycle is still recorded.

## Consequences

### Positive

- Cold boot to a painted board, dev server, same machine, interleaved with `main`: 1876–2066 →
  1696–1776 ms at 1×; 4873–4967 → 2668–3566 ms at 4× CPU throttle (the slow-runner reproduction).
- Widget update (`scene.move-widget` round trip) median 17 → 9 ms; a moved widget writes one
  document and the operation tail instead of twelve documents.
- Eager production JS 2172 → 1863 KiB unminified (826 → 736 modules); `processing-core` 1012 →
  868 KiB; the `vendor-auth` chunk leaves the boot path entirely. The dev server serves 25 fewer
  modules on a cold boot.
- The effective size ceiling on a vault doubles: the 5 MiB boundary limit now measures one state,
  not two.

### Negative

- A second contract surface for the core: hosts that dispatch `map.generate` must supply
  `mapGenerators` (the app runtime does so automatically; core test fixtures do so by default).
- The first `map.generate`, the first sign-in, the first palette open and the first Help open each
  pay one chunk fetch. On the web that is one round trip; on Electron and Android a local file.
- The per-slice reference map is module state in the adapter. Any NEW code path that writes the
  documents table must call `forgetPersistedSlices()`; `coreStore.test.ts` pins the existing ones.

## Rejected Alternatives

| Alternative                                                          | Why Rejected                                                                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loosen the `scene-first-render` target or measure a production build | Weakens the gate rather than the cost; the dev-server measurement is deliberate (`scripts/perf/capture.ts`) and the same work shows in both.                           |
| Skip unchanged slices by comparing `previous` to `next`              | Slices hydrated by `ensureDefaultActor` exist only in memory until the first commit and would never be written; the last-committed reference is the fact that matters. |
| Keep validating the whole op log at the boundary                     | O(history) per command; every entry was validated when appended and again, fail-closed, on load.                                                                       |
| Dynamic `import()` of the generators inside the reducer              | The reducer is synchronous and pure; an async reducer would change the command contract for every command to serve one.                                                |
| Preload the lazy Board chunk                                         | Boot is main-thread-CPU bound, not fetch bound (measured; see the perf memory).                                                                                        |

## Migration Impact

- App code that imported `GENERATORS`, `getGenerator`, `generatorsByGroup`, `generatorsByScale`,
  `GENERATOR_GROUPS` or `isImmediateParamChange` from `@dndtools/core` imports them from
  `@dndtools/core/map-generators`. Vitest configs alias the new entry.
- `buildMapInverse(command, stateBefore)` callers that can undo a generate pass the registry as the
  third argument.
- No persisted data changes. No schema version changes.

## Rollback Plan

- Trigger: a durable write lost after a restore/reset path that bypassed `forgetPersistedSlices()`,
  or a `map.generate` rejected in a host that cannot supply generators.
- Rollback action: revert the four commits on `perf/remediation-2026-09` together; the boundary
  schema and the reducer contract change in lockstep with their callers.
- Data safety: every commit is still one Dexie transaction; a partial rollback cannot leave a slice
  without its operation.

## Verification and Evidence

- `packages/core/tests/platform-service-boundary.test.ts` — `{ next, appended }` shape, per-entry
  validation of the appended tail, rejection of a `previous` payload.
- `apps/gm-react/src/platform/storage/coreStore.test.ts` — the write set per commit, invalidation on
  load/restore/reset, the failed-transaction case, the no-change-without-operation invariant, boundary
  rejection of a malformed appended op.
- `apps/gm-react/src/runtime/SceneRuntime.test.ts` — the seed commits once, holds later commands,
  leaves the vault untouched on a failed commit.
- `packages/core/tests/map-commands-v2.test.ts` — `map.generate` fail-closed without generators;
  the inverse builder with and without a registry.
- `apps/gm-react/src/app/help/changelog.test.ts` — the changelog's latest release equals
  `package.json`'s version.
- Measurements: `docs/development/PERFORMANCE.md` §5.
