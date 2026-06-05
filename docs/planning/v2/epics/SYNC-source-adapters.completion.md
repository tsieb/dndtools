# SYNC-source-adapters — Completion Evidence

Epic: `SYNC-source-adapters` — SYNC: Source adapters
Requirement IDs: SYNC-003, SYNC-004, SYNC-005, SYNC-012, SYNC-015, SYNC-016
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync & Offline
Model — Sync Source Contract)

This epic delivers the SOURCE ADAPTER seam the architecture contract's "Sync Source Contract" defines: a
single `SyncSourceAdapter` interface that local-vault, Obsidian, Google Docs, and FUTURE sources plug into,
transforming external source content ↔ canonical `SyncOperation`s AT THE BOUNDARY. It builds ON the prior
epics' artifacts and does NOT duplicate them: the Obsidian transforms reuse `markdown.ts`; the per-source
lossy/feature classification reuses the `content-constraints.ts` taxonomy; emitted ops reuse the canonical
`SyncOperation` shape + `validateSyncOperationShape` conformance guard (`sync/operation-model.ts`); the
capability-descriptor pattern mirrors `platform/support-status.ts` and the MAP-020 adapter registry. Per
ADR-014 the LIVE transports (real filesystem / Obsidian / Google Drive network) are DEFERRED — the adapters
are exercised over an IN-MEMORY / FAKE transport (`sync/source-transport.ts`), which is the seam a real
transport plugs into later. All new logic is pure Processing-Core policy (deterministic functions over
plain data — no DOM/Node/Svelte/clock/entropy/network); the GUI dispatches nothing and reaches no storage —
it only renders the computed registry/status (Contract 1).

## Demo

Surface: the PLAT-owned Settings route, `/settings/`, where the new `SourceAdaptersPanel` mounts alongside
the existing diagnostics / sync-status / cloud-storage panels. The transforms themselves are pure-core
policy proven by tests (the live transports are deferred per ADR-014).

1. Open `/settings/` and scroll to "Source adapters". The panel renders the declared adapter capability
   registry: `local-vault`, `Obsidian vault`, and `Google Docs`, each with its supported schema/source
   versions, auth modes, offline availability, and per-feature transform fidelity
   (`source-adapter-<kind>`). Obsidian lists every note feature as supported with no lossy/unsupported
   entries; Google Docs lists front matter / wikilinks / aliases as unsupported and inline `#tags` as
   lossy (SYNC-004 / SYNC-005 / SYNC-015).
2. The "Explicit sync states" chips render the full SYNC-016 state vocabulary (`auth-required`,
   `reauth-required`, `offline-queued`, `conflict`, `deleted-remote`, …).
3. Under "Google Docs authorization", toggle online / valid-token / token-expired. The state is derived
   purely in the core: offline with no token ⇒ `auth-required` with "Cached content remains readable"; a
   valid token ⇒ `idle`; an expired token ⇒ `reauth-required` with "queued changes are kept" (SYNC-016).
4. Under "Write preflight", the default (Google Docs + front matter present) shows `blocked` with an
   explicit `lossy-transform` rejection; checking "acknowledge loss" flips it to `allowed`. Switching the
   source to Obsidian shows `allowed` with no rejections — the same content is faithful there (SYNC-015).

Requirement IDs exercised by the demo: SYNC-003, SYNC-004, SYNC-005, SYNC-015, SYNC-016. (SYNC-012 pull/push
round-trips are proven by the core tests over the fake transport.)

## Traceability

### SYNC-003 — adapter interface; adapters plug in without changing core command/reducer contracts

- Code:
  - `apps/v2/packages/core/src/sync/source-adapters.ts` — the `SyncSourceAdapter<ExternalEntity>` interface
    (capability metadata + `toCanonical` import transform + `fromCanonical` export transform), the
    `buildCanonicalOperation` helper (stamps the single supported `SYNC_OPERATION_SCHEMA_VERSION`), and the
    SYNC-003 PROOF: `assertAdapterEmitsCanonicalOperations` / `adapterEmitsCanonicalOperations` assert an
    adapter's emitted ops pass the SAME `validateSyncOperationShape` guard every in-process command op
    satisfies — so an adapter is new transform code, never a new command/reducer signature.
  - `apps/v2/packages/core/src/sync/source-transport.ts` — the injectable in-memory FAKE transport
    (`FakeVaultTransport`, `FakeDriveTransport`); a real transport later implements the same shapes.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/sync-source-adapters.test.ts` — "SYNC-003 adapter interface plugs in
    without a core-contract change": the Obsidian and Google Docs adapters emit conformant ops; a
    hand-rolled FUTURE adapter conforms via the same interface + op shape with no core change; a malformed
    adapter op fails closed at the guard.

### SYNC-004 — Obsidian round-trip preserves user content and namespaces DND metadata

- Code:
  - `apps/v2/packages/core/src/sync/obsidian-adapter.ts` — `obsidianFileToCanonicalNote` /
    `canonicalNoteToObsidianFile` REUSE `markdown.ts` (parse/serialize) and `extractMarkdownLinks` /
    `extractHeadings`. They preserve YAML properties, tags, aliases, internal `[[wikilinks]]`, markdown
    links, headings, and USER-AUTHORED frontmatter, and ISOLATE DND Tools metadata into a separate
    `dndtoolsMetadata` map keyed under the `dndtools.*` namespace (reusing `DNDTOOLS_PROPERTY_NAMESPACE`)
    so it never collides with a user's common property of the same bare name.
- Tests:
  - `apps/v2/packages/core/tests/sync-source-adapters.test.ts` — "SYNC-004 Obsidian round-trip…": parses
    every listed structure; a parse → canonical → serialize → parse round-trip is byte-stable; DND metadata
    and a same-named user property (`visibility` vs `dndtools.visibility`) coexist without collision.

### SYNC-005 — Google Docs tracks file ids, cursors, revisions, transforms, and unsupported formatting loss

- Code:
  - `apps/v2/packages/core/src/sync/google-docs-adapter.ts` — `googleDocsFileToCanonicalNote` (IMPORT
    transform) tracks the Drive FILE ID, NAME, and REVISION ID and reports UNSUPPORTED FORMATTING as an
    explicit loss diagnostic (never silently dropped); `canonicalNoteToGoogleDocsFile` (EXPORT transform);
    `pullGoogleDocsChanges` walks the Drive CHANGES feed from a stored cursor and returns the NEXT cursor to
    persist (SYNC-005 AC1). The per-feature fidelity reuses the `content-constraints.ts` lossy taxonomy.
  - `apps/v2/packages/core/src/sync/source-transport.ts` — `FakeDriveTransport` models the file store,
    the change feed keyed by page token, and revision metadata.
- Tests:
  - `apps/v2/packages/core/tests/sync-source-adapters.test.ts` — "SYNC-012 / SYNC-005 Google Docs pull +
    push…": pulls changes, stores the next cursor, reports the formatting-loss diagnostic; a push preserves
    the tracked file id + revision + loss diagnostic.

### SYNC-012 — both pull and push proven for Obsidian and Google Docs

- Code:
  - `apps/v2/packages/core/src/sync/obsidian-adapter.ts` — `pullObsidianNote` (PULL) / `pushObsidianOperation`
    (PUSH, staged-commit — the input transport is never mutated).
  - `apps/v2/packages/core/src/sync/google-docs-adapter.ts` — `pullGoogleDocsChanges` (PULL) /
    `pushGoogleDocsOperation` (PUSH).
- Tests:
  - `apps/v2/packages/core/tests/sync-source-adapters.test.ts` — "SYNC-012 Obsidian pull + push round-trip
    over the fake transport" (notes, properties, links, headings preserved) and "SYNC-012 / SYNC-005 Google
    Docs pull + push…" (revisions + unsupported formatting reported across the round-trip).

### SYNC-015 — capability metadata + fail-closed across every dimension

- Code:
  - `apps/v2/packages/core/src/sync/source-adapters.ts` — `SourceAdapterCapability` (the declared metadata:
    supported schema versions, source versions, auth modes, entity types, transform fidelity) +
    `checkSchemaVersionSupported` / `checkSourceVersionSupported` / `checkAuthModeSupported` /
    `checkEntityTypeSupported` / `checkTransformFidelity` (each fails closed with an explicit reason).
  - `apps/v2/packages/core/src/sync/source-adapter-registry.ts` — `SOURCE_ADAPTER_CAPABILITIES` (the
    inspectable registry incl. the `local-vault` baseline), `capabilityForSourceKind` (unknown kind ⇒ null,
    fail closed), `preflightSourceAdapter` (rejects an unsupported schema/source version, auth mode, entity
    type, or lossy transform BEFORE any mutation, collecting every failing dimension), and
    `validateSourceAdapterCapability` / `validateRegisteredSourceAdapters` (the descriptor-shape guard so a
    mis-declared NEW adapter fails closed).
- Tests:
  - `apps/v2/packages/core/tests/sync-source-adapters.test.ts` — "SYNC-015 every adapter declares
    capability metadata and fails closed": the registry shape; an unsupported schema version / source
    version / auth mode / entity type each rejects with its precise reason; an unknown kind fails closed; a
    lossy write is blocked until acknowledged; a faithful write needs no acknowledgment.

### SYNC-016 — Google Docs auth / rename / delete / offline-queue / unsupported-formatting / conflict as explicit states

- Code:
  - `apps/v2/packages/core/src/sync/source-adapters.ts` — the `SyncSourceLifecycleState` typed enum
    (`SYNC_SOURCE_LIFECYCLE_STATES`) and `deriveAuthorizationState` (first-time `auth-required`,
    `reauth-required` keeping queued work, `idle`, fail-closed `unsupported`).
  - `apps/v2/packages/core/src/sync/google-docs-adapter.ts` — `pullGoogleDocsChanges` records `renamed-remote`
    (identity preserved by Drive file id) and `deleted-remote` (delete intent, never a silent resurrection);
    `detectGoogleDocsConflict` builds an explicit `GoogleDocsConflict` carrying local markdown, the remote
    revision metadata, the unsupported-format diagnostics, and safe resolution actions for a diverged
    revision or a delete-vs-update race.
- Tests:
  - `apps/v2/packages/core/tests/sync-source-adapters.test.ts` — "SYNC-016 explicit Google Docs sync
    states": authorization (offline keeps cached content readable), reauthorization (queued work kept),
    unsupported auth mode, rename (id-preserving), deletion (delete intent), conflict (diverged revision and
    delete-vs-update), and the idempotent no-conflict case.

### GUI surface (Contract 1)

- `apps/v2/app/src/lib/gui/SourceAdaptersPanel.svelte` — renders the core-computed capability registry, the
  explicit sync-state vocabulary, the authorization-state derivation, and the fail-closed preflight. It
  dispatches NO command and reaches NO storage/network — pure render of Processing-Core models.
- `apps/v2/app/src/routes/settings/+page.svelte` — mounts the panel on the existing PLAT-owned Settings
  route.
- E2E: `apps/v2/app/tests/e2e/sync-source-adapters.spec.ts` — capability registry, explicit states,
  authorization-state derivation, and the fail-closed preflight, run on BOTH profiles.

## Tests run

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`) — PASS (0 errors; nav lint
  132 files, token lint 132 files, repo-boundary audit 5 tests pass; no eslint-disable; `SvelteMap`/`SvelteSet`
  convention not applicable — no new Map/Set state in components).
- `pnpm docs:validate` — PASS (see below; full repo-relative paths used throughout this doc).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` clean; app `svelte-check` 766 files, 0 errors, 0 warnings).
- `pnpm v2:lint` (boundary) — PASS ("v2 boundary lint passed"; core imports no Svelte/DOM/Node/cloud; no v1
  imports).
- `pnpm v2:gates` — PASS ("7 gate(s) owned, budgeted, and wired").
- Core unit suite (`pnpm --filter @dndtools/v2-core test`) — PASS, 103 files, 1457 tests (incl. the new
  `apps/v2/packages/core/tests/sync-source-adapters.test.ts`, 32 tests).
- App unit suite (`pnpm --filter @dndtools/v2-app exec vitest run`) — PASS, 12 files, 55 tests.
- Full Playwright (`pnpm --filter @dndtools/v2-app exec playwright test`) — PASS on BOTH `desktop-chromium`
  AND `mobile-chromium`: 422 passed, 18 intentional project-scoped skips, 0 failed (baseline was 412/18/0;
  +10 from the new `apps/v2/app/tests/e2e/sync-source-adapters.spec.ts`, 5 tests × 2 projects).
- `pnpm v2:workpack:validate` — PASS before (`active`) and planned after `complete`.

## Quality review

- Correctness: every mapped acceptance criterion has implementing code + a test. The fail-closed checks
  (schema/source version, auth mode, entity type, lossy transform, unknown kind) each reject with an
  explicit reason; the Obsidian round-trip is byte-stable; the Google Docs states are explicit, never
  silent. Fixed a latent stateful-`/g`-regex bug in the present-feature detector (now non-global `.test()`).
- Architecture: pure Processing-Core policy; the fake transport is injected; the GUI only renders computed
  models and dispatches nothing. Adapters emit only the canonical op shape (proven), so no core command or
  reducer changed. Boundary lint green; no v1 imports; no new packages (ADR-014).
- Tests: unit (32 new core tests across all six requirements) + e2e (5 new specs × 2 profiles) + the
  cross-command canonical-op conformance guard is reused as the no-core-contract-change proof.
- Accessibility: the new panel uses labelled `section`/`h2`/`h3`, native `label`-wrapped checkboxes and a
  labelled `select`; it renders text status, not color-only. Presentation-equivalent across profiles (the
  e2e runs the same testids on mobile-chromium).
- Performance: pure synchronous derivations over tiny in-memory data; no I/O, no new network.
- Security / permissions / privacy: capability + auth checks fail closed; diagnostics are generic and
  non-leaking (they name the dimension/feature, never raw external content, tokens, or paths). The auth
  state never carries a token; offline first-time auth is reported unavailable while cached content stays
  readable (local-first invariant preserved).
- Persistence / sync / offline: nothing here writes durable state (the live transports are deferred); the
  `SourceCursorRecord` models the durable per-source change cursor a future transport advances. Offline
  keeps cached content readable; queued work is never dropped on a reauth.
- UX: the panel has interactive auth-state + preflight demos with explicit blocked/allowed status and
  reasons; empty lossy/unsupported lists are simply omitted.
- Maintainability: small, cohesive, typed modules that reuse `markdown.ts`, the content-constraint taxonomy,
  and the canonical op shape rather than duplicating them; no unrelated refactors.
- Docs: this completion doc + thorough module-level doc comments tracing each requirement.

## Files changed

- Added: `apps/v2/packages/core/src/sync/source-adapters.ts`
- Added: `apps/v2/packages/core/src/sync/source-transport.ts`
- Added: `apps/v2/packages/core/src/sync/obsidian-adapter.ts`
- Added: `apps/v2/packages/core/src/sync/google-docs-adapter.ts`
- Added: `apps/v2/packages/core/src/sync/source-adapter-registry.ts`
- Added: `apps/v2/packages/core/tests/sync-source-adapters.test.ts`
- Added: `apps/v2/app/src/lib/gui/SourceAdaptersPanel.svelte`
- Added: `apps/v2/app/tests/e2e/sync-source-adapters.spec.ts`
- Modified: `apps/v2/packages/core/src/index.ts` (public exports for the source-adapter modules)
- Modified: `apps/v2/app/src/routes/settings/+page.svelte` (mounts `SourceAdaptersPanel`)
- Modified (generated by workpack commands, not hand-edited): `docs/planning/v2/workpack-state.yaml`,
  `docs/planning/v2/status.yaml`, `docs/planning/v2/epics/SYNC-source-adapters.yaml`
- Added: `docs/planning/v2/epics/SYNC-source-adapters.completion.md` (this file)

## Known gaps / deferred items

- LIVE transports (real filesystem / Obsidian vault / Google Drive network, OAuth token storage) remain
  DEFERRED per ADR-014. This epic delivers the adapter INTERFACE + adapter LOGIC + capability metadata +
  explicit state handling over a FAKE transport — the seam a real transport plugs into without changing
  adapter or core code. No live network, OAuth flow, or filesystem watcher is implemented.
- Wiring adapter-produced canonical ops through a dispatch command into durable state is intentionally out
  of scope; the existing `content.write-to-source` / import commands already cover the in-vault write path,
  and a future transport epic will connect a live pull/push loop to the op log.

## Status

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SYNC-source-adapters`).

## Git

- Branch: `epic/SYNC-source-adapters` (created from the prior epic HEAD `57a099f`, NOT from master).
- Commit: recorded in a follow-up docs commit after the implementation commit (SHA appended below).
- Final `git status --short`: clean (recorded below).

### Final `git status --short`

```
(clean — recorded at handoff after the implementation + completion-doc commits)
```
