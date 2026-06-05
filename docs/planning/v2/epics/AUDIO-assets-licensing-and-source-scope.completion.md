# AUDIO-assets-licensing-and-source-scope — Completion Evidence

Workpack status: `complete`

Epic: **AUDIO-assets-licensing-and-source-scope** — AUDIO: Assets, licensing, and source scope
Requirements: **AUDIO-004, AUDIO-009, AUDIO-010, AUDIO-011**
Branch: `epic/AUDIO-assets-licensing-and-source-scope` (chained off the prior epic tip `d44a794`)

This is the FIRST AUDIO-domain epic. It establishes the durable audio asset / licensing /
source-scope model as pure Processing-Core policy, composing the existing content-addressed asset
pattern (`state/map-assets.ts`), the source-capability-registry pattern
(`sync/source-adapter-registry.ts`), the fail-closed classification pattern
(`sync/storage-classification.ts`), and the validation-report pattern (`state/content-export.ts`,
`state/map-import.ts`). No new parallel asset/source layer was invented. Playback state is NOT in
scope here — currently-playing audio is `SessionState` (Contract 4 Widget State Ownership) and is
owned by a later AUDIO playback epic.

## Demo path (programmatic — DM-only, pure-core)

The audio library is DM-only config; it is exercised through core commands + the actor-filtered read
model (no GUI route was added). A reviewer can drive it from a Vitest harness or a console:

1. **AUDIO-004 import + license review**: dispatch `audio.import-asset` with bytes + metadata; the
   asset lands in the library content-addressed (id == hash), with tags/license/source recorded. An
   undeclared license leaves the asset flagged — `listAudioAssetsNeedingReview(...)` returns it. A
   `restricted` license or a `cc-by` missing attribution is likewise flagged.
2. **AUDIO-009 source scope**: dispatch `audio.configure-source` with `type: 'spotify'` → rejected
   `unsupported-audio-source`, NO source record (and so no playback state). A declared type
   (`local-file` / `bundled-preset` / `web-stream`) is accepted and classified.
3. **AUDIO-010 cache/offline**: a source configured without a cache behavior is `playback-disabled`;
   `resolveAudioPlaybackAvailability(...)` reports `missing-asset` (local, offline, absent),
   `unavailable-offline` (web stream, offline, uncached), and `cache-evicted` (evicted cache) with no
   network retry and no track substitution.
4. **AUDIO-011 package validation**: dispatch `audio.validate-package` with presets referencing a
   missing asset / an unlicensed asset / an unsupported stream → rejected `audio-package-invalid`
   with the per-preset findings; a clean package is accepted (no durable mutation) and the validation
   report carries the per-asset portability manifest (source + license + content hash + portability).

## Requirement coverage / traceability

### AUDIO-004 — import & manage local audio assets with metadata, licensing notes, tags, source refs
- **AC1 (tags, license note, source, asset hash recorded on import)** —
  `apps/v2/packages/core/src/state/audio-asset.ts` (`buildAudioAsset`, content-addressed id == hash),
  `apps/v2/packages/core/src/commands/audio.ts` (`handleImportAudioAsset`),
  `apps/v2/packages/core/src/state/audio-state.ts` (durable library slice).
  Tests: `apps/v2/packages/core/tests/audio-assets.test.ts`.
- **AC2 (missing licensing flagged for review before export)** — `assetNeedsLicenseReview` /
  `licenseReviewReason` (`audio-asset.ts`), `listAudioAssetsNeedingReview`
  (`apps/v2/packages/core/src/queries/audio-library-query.ts`); the AUDIO-011 export path reuses this
  same gate. Tests: `audio-assets.test.ts`, `audio-package.test.ts`.

### AUDIO-009 — configure only declared audio source types; unsupported providers blocked
- **AC1 (classify local file / bundled preset / web stream / unsupported with licensing + cache
  behavior)** — `apps/v2/packages/core/src/state/audio-source.ts`
  (`AUDIO_SOURCE_TYPE_CAPABILITIES`, `classifyAudioSource`),
  `listAudioSourceClassificationsForActor` (`audio-library-query.ts`).
- **AC2 (unsupported provider rejected; no playback state)** — `configureAudioSource` returns
  `unsupported-source-type`; `handleConfigureAudioSource` maps it to the `unsupported-audio-source`
  rejection and writes NO source record. Tests: `apps/v2/packages/core/tests/audio-sources.test.ts`.

### AUDIO-010 — cache/offline behavior declared per source type before playback enabled
- **AC1 (local source offline → local availability, no retry, missing reported)** —
  `resolveAudioPlaybackAvailability` (`audio-source.ts`) → `available` / `missing-asset`.
- **AC2 (web stream offline → unavailable unless explicitly cached)** → `unavailable-offline` /
  `available`.
- **AC3 (evicted cache → missing cached audio, session state preserved, no substitution)** →
  `cache-evicted` (precedence; the resolver only reports, never substitutes).
- **Prerequisite (cache behavior declared before playback)** — `configureAudioSource` /
  `classifyAudioSource` / `ensureAudioState` force `playbackEnabled === false` while cache behavior is
  `undeclared`. Tests: `audio-sources.test.ts`.

### AUDIO-011 — import/export Scene audio package only when assets/licensing/streams validated
- **AC1 (missing assets, licensing metadata, unsupported streams, device-local output routes reported
  before commit)** — `apps/v2/packages/core/src/state/audio-package.ts` (`validateAudioPackage`,
  fail-closed `committable`), `handleValidateAudioPackage`
  (`apps/v2/packages/core/src/commands/audio.ts`) rejects `audio-package-invalid` with the blocking
  findings on the rejection `issues`.
- **AC2 (each included asset has source, license metadata, content hash, portability status)** —
  the validation report's `manifest` (`AudioPackageManifestEntry`); `assetPortability`. Tests:
  `apps/v2/packages/core/tests/audio-package.test.ts`.

## Quality gates (all run; results)

| Gate | Command | Result |
| --- | --- | --- |
| Core targeted tests | `pnpm --filter @dndtools/v2-core test` | **136 files, 1925 tests passed** (40 new audio tests) |
| Type checks | `pnpm v2:typecheck` | **clean** (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings / 833 files) |
| Boundary lint | `pnpm v2:lint` | **passed** |
| Full ESLint (CI gate) | `pnpm lint` | **passed** (eslint + nav-layer + token-compliance + repo-boundary audit) |
| Docs validation (CI gate) | `pnpm docs:validate` | **docs validation passed** |
| Workpack validation | `pnpm v2:workpack:validate` | **v2 workpack validation passed** |
| Playwright e2e (both projects) | `pnpm e2e` (from `apps/v2/app`) | **509 passed, 21 skipped, 0 failed** (desktop-chromium + mobile-chromium) — unchanged from the green baseline |

### Why e2e was run
This epic is predominantly pure-core, but it adds a new durable `audio` VaultState slice that is
wired into the app's persistence adapter (`scene-store.ts`) and canvas runtime (`runtime.svelte.ts`).
No route/layout/Svelte component was added or changed; the touched app files only initialize and
persist the new (empty) slice. Because persisted-state load/persist is exercised by the existing
scene-create/reload e2e flows, the FULL Playwright suite was run on both projects to confirm no
regression. It remains fully green.

## Architecture / data-safety review (fail-closed)

- **Processing/Display decoupling (Contract 1)**: all audio policy lives in `@dndtools/v2-core`; the
  app only initializes/persists the durable slice and (in future GUI work) would render the
  actor-filtered read model. No v1 runtime imports; boundary lint passes.
- **Licensing fails closed**: license kind is a CLOSED enum; an undeclared/unrecognized kind hydrates
  to `unknown` (flagged), never silently cleared; free-text notes/attribution are preserved verbatim,
  never fabricated. The export path reuses the AUDIO-004 review gate (one licensing policy).
- **Source scope fails closed**: an unsupported provider is rejected with an unsupported-source
  diagnostic and NO source/playback record is created (AUDIO-009 AC2).
- **Offline/sync (Contract 2)**: cache/offline behavior is a typed, per-source-type declaration and a
  playback prerequisite; offline availability is resolved with no network retry and no track
  substitution; asset ops carry content-addressed metadata only (never bytes).
- **Visibility/permission (Contract 3)**: the audio library + sources are DM-only; the read model
  returns EMPTY lists / `null` to players/observers, and the observer write-gate + per-command
  `requireDm` reject all non-DM mutations before any reducer runs.
- **Hydration safety**: `ensureAudioState` re-defaults invalid persisted license/cache values
  fail-closed; a pre-existing vault with no audio document hydrates to an empty library (no
  destructive migration). The `audio` document is registered with the migration schema-version
  registry.

## Known gaps / deferred

- **Playback runtime + GUI surface** are intentionally NOT in this epic. Currently-playing audio
  state (SessionState), the Command Center audio widget, autoplay/consent degradation, output
  routing, and the visible audio-library GUI belong to other AUDIO requirements
  (AUDIO-001/002/003/005/006/007/008/012/013). This epic delivers the durable asset/license/
  source-scope MODEL + validation policy + the actor-filtered read model only.
- Asset bytes are modeled behind a content-addressed reference per ADR-014 (no blob CDN in the
  prototype); the storage adapter persists the metadata document.

## Changed files (full repo-relative paths)

New (core):
- `apps/v2/packages/core/src/state/audio-asset.ts`
- `apps/v2/packages/core/src/state/audio-source.ts`
- `apps/v2/packages/core/src/state/audio-state.ts`
- `apps/v2/packages/core/src/state/audio-package.ts`
- `apps/v2/packages/core/src/queries/audio-library-query.ts`
- `apps/v2/packages/core/src/commands/audio.ts`
- `apps/v2/packages/core/tests/audio-assets.test.ts`
- `apps/v2/packages/core/tests/audio-sources.test.ts`
- `apps/v2/packages/core/tests/audio-package.test.ts`

Modified (core):
- `apps/v2/packages/core/src/commands/types.ts` (audio slice, commands, events, rejection codes)
- `apps/v2/packages/core/src/commands/dispatch.ts` (audio handler wiring)
- `apps/v2/packages/core/src/commands/helpers.ts` (`ensureAudioStateSlice`)
- `apps/v2/packages/core/src/schemas/commands.ts` (audio command input schemas)
- `apps/v2/packages/core/src/migration/schema-versions.ts` (`audio` durable document)
- `apps/v2/packages/core/src/testing/fixtures.ts` (empty audio slice in initial state)
- `apps/v2/packages/core/src/index.ts` (public audio exports)

Modified (app — durable slice wiring only; no route/layout/component):
- `apps/v2/app/src/lib/platform/storage/scene-store.ts`
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts`

Generated planning files (via `set-status` / `complete`):
- `docs/planning/v2/epics/AUDIO-assets-licensing-and-source-scope.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/workpack-state.yaml`
- this completion evidence file

## Git evidence

Branch: `epic/AUDIO-assets-licensing-and-source-scope`
Commit SHA (feat): `3744fd915df28db11d63cbaf358db71ed0477ad6`
Commit SHA (workpack complete): `4fb490a`

Final `git status --short` (clean slate after the completion commits):

```
(empty — clean working tree)
```
