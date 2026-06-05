# COLLAB-authority-filtering-and-cache-privacy — Completion Evidence

Epic: `COLLAB-authority-filtering-and-cache-privacy` — COLLAB: Authority, filtering, and cache privacy
Requirement IDs: COLLAB-008, COLLAB-009, COLLAB-010, COLLAB-014
Architecture contracts: Contract 2 (Cloud Sync & Offline Model — Sync Security and Privacy); Contract 3
(Role, Visibility & Permission Grant Model — DM Authority)

This is the FIRST COLLAB epic. It establishes a clean, cohesive collaboration authority / filtering /
cache-privacy model as PURE Processing-Core policy. Per ADR-014 the LIVE replication transport and the
real key custody / crypto are DEFERRED, so this epic delivers the POLICY that filters the stream and
seals the cache AT THE BOUNDARY — the seam a transport / crypto implementation plugs into. It REUSES
the prior epics' primitives and does NOT duplicate them: the replication filter reuses the PERM
visibility-filter engine (`apps/v2/packages/core/src/permissions/visibility-filter.ts`,
`filterEntityForActor` / `evaluateVisibility`); the DM-authority resolver reuses the PERM base-role
authority + grant model (`apps/v2/packages/core/src/permissions/base-roles.ts`,
`apps/v2/packages/core/src/permissions/grants.ts`); the cache policy reuses the grant model
(`hasGrantedCapability`) and mirrors the fingerprint/seal discipline of the capability cache
(`apps/v2/packages/core/src/permissions/capability-cache.ts`); operations are the canonical
`SyncOperation` (`apps/v2/packages/core/src/sync/operation-log.ts`,
`apps/v2/packages/core/src/sync/operation-model.ts`). All new logic is deterministic over plain data —
no DOM/Node/Svelte/clock/entropy/network; the GUI dispatches no command and reaches no storage — it
only renders the computed models (Contract 1). Boundary lint stays green; no v1 imports.

## Demo

Surface: the PLAT-owned Settings route, `/settings/`, where the new `SessionPrivacyPanel` mounts
alongside the existing diagnostics / sync-status / source-adapter panels. The privacy decisions are
pure-core policy proven by tests (the live replication/cache transport is deferred per ADR-014). The
panel is presentation-equivalent across profiles, so the demo path is identical on desktop and mobile.

1. Open `/settings/` and scroll to "Session privacy" (`session-privacy-panel`).
2. Under "Replication stream (filter-before-send)", the recipient defaults to Player: the delivered
   stream is `op-public, op-handout`, `op-secret` is "Withheld at source", and "Outbound stream
   contains the DM-only secret: no". Switch the recipient to Observer — the player-shared handout is
   also withheld (delivered = `op-public`), secret still absent. Switch to DM — the full stream
   delivers including the secret ("contains the DM-only secret: yes") (COLLAB-009).
3. Under "Concurrent command authority", with `dm-authoritative` policy the outcome is `dm-supersedes`
   and the winning actor is `demo-dm` with value `60`. Switch the policy to `shared-merge` — the
   outcome becomes `conflict` and no command is elevated merely for being the DM's (COLLAB-008).
4. Under "Participant cache on leave", online shows the persistent-granted handout RETAINED and the
   projected scene PURGED. Uncheck "participant online" — the projected scene becomes SEALED (key
   invalidation on) instead of purged, while the persistent handout stays retained (COLLAB-010 /
   COLLAB-014).
5. Under "Purge confirmation", `demo-player` reads `confirmed` and `demo-observer` reads
   `purge-unconfirmed`; the status names no cached entity ids (COLLAB-010 AC4 / COLLAB-014 AC4).

Requirement IDs exercised by the demo: COLLAB-008, COLLAB-009, COLLAB-010, COLLAB-014.

## Traceability

### COLLAB-008 — valid DM commands supersede non-DM commands where session policy grants DM authority

- Code:
  - `apps/v2/packages/core/src/collab/dm-authority.ts` — `resolveSessionFieldAuthority` resolves
    concurrent commands on one session field. A valid DM command SUPERSEDES concurrent non-DM commands
    under `dm-authoritative` policy (`dm-supersedes`); under `shared-merge` normal rules apply (no DM
    override; ≥2 valid commands `conflict`); an unauthorized non-DM command is REJECTED, not conflicted
    (`RejectedSessionCommand` with `unknown-actor` / `not-permitted` / `observer-write`); a non-DM can
    never override a DM (fail closed). Reuses `hasGrantedCapability` for the non-DM write check and the
    base-role for DM authority. `DEFAULT_SESSION_FIELD_AUTHORITY` fails closed to `dm-authoritative`.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-dm-authority.test.ts` — AC1: DM supersedes a permitted player
    command and the DM value determines final state; a non-DM never overrides a DM even when issued
    later; latest DM command wins deterministically. AC2: an out-of-grant player command, observer
    write, unknown actor, and a non-DM command on a DM-only field are all rejected (not conflicted).
    The non-authority case: `shared-merge` with a DM + a permitted player command CONFLICTS; a single
    valid command is `sole-valid`; `dm-authoritative` with no valid DM command falls back to conflict
    among players.
  - `apps/v2/app/tests/e2e/collab-authority-filtering-cache-privacy.spec.ts` — "COLLAB-008 DM authority
    resolution".

### COLLAB-009 — filter player/observer replication streams BEFORE data leaves the host (the keystone)

- Code:
  - `apps/v2/packages/core/src/collab/replication-filter.ts` — `filterReplicationStream` takes the FULL
    op stream + a recipient actor and emits ONLY the ops that actor may see, gating each op with
    `isOperationVisibleToRecipient` (which delegates to the PERM `evaluateVisibility` engine for
    entity- and field-scoped visibility). A withheld op is OMITTED from `delivered` (not redacted in
    place) and recorded in `withheld` with only entity references + a reason (no op value). Fail closed:
    absent visibility metadata ⇒ `dm-only`; unknown/unauthenticated recipient ⇒ empty stream. The DM
    stream is unfiltered. `filterCatchUpStream` delivers only NOW-visible, not-yet-delivered ops (AC2).
    `assertStreamCarriesNoHiddenContent` is the fail-closed boundary leak guard a transport runs before
    replicating.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-replication-filter.test.ts` — HARD assertions: a player's
    delivered stream is serialized and the DM-only secret is proven ABSENT (`expect(wire).not.toContain
    (SECRET)`); the same for the observer (no dm-only AND no shared-to-others content); the DM stream
    contains the secret. Filtering happens at the source (the withheld record carries no value).
    Fail-closed: orphan-metadata op withheld; unknown recipient gets the empty stream; a hidden field on
    a visible entity is withheld (`field-not-visible`). AC2: catch-up delivers only the newly-authorized
    op after a grant, never the already-sent op nor the secret. The leak guard passes on a filtered
    stream and throws on a wrongly-included hidden op.
  - `apps/v2/app/tests/e2e/collab-authority-filtering-cache-privacy.spec.ts` — "COLLAB-009 filter-before
    -send replication stream".

### COLLAB-010 — purge or seal participant device caches on leave unless persistent access granted

- Code:
  - `apps/v2/packages/core/src/collab/cache-privacy.ts` — `evaluateCachePrivacy` classifies every
    participant cache entry on `left`/`ended`: a session-only entry without a persistent grant is
    `purge` (online) or `seal` (offline); a session-only entry with a persistent (active, viewer-capable)
    grant is `retained` (the COLLAB-010 exception, via `hasPersistentAccess` reusing
    `hasGrantedCapability`); a non-session-only (durable owned) entry is always retained. An `active`
    lifecycle retains everything. Observers never hold a persistent grant.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-cache-privacy.test.ts` — AC1: leave online purges both session-
    only entries, retains the durable character. AC2: the DM-granted persistent handout is retained
    while the session-only scene is purged. AC3: leave offline seals session-only content. AC4 covered
    below. Plus: an observer's session-only cache is always purged; an EXPIRED grant is not persistent
    access (fail closed).
  - `apps/v2/app/tests/e2e/collab-authority-filtering-cache-privacy.spec.ts` — "COLLAB-010 / COLLAB-014
    participant cache purge/seal".

### COLLAB-014 — explicit session-cache policy (TTL, key invalidation, persistent-grant, offline revoke)

- Code:
  - `apps/v2/packages/core/src/collab/cache-privacy.ts` — the computed `SessionCachePolicy` carries the
    `ttlMs`, the `issuedAt` TTL origin, `invalidatesSessionKey: true` (sealing IS key invalidation), and
    `persistentGrantExemptKeys`. `isSealedCacheEntryUnreadable` evaluates the OFFLINE-REVOCATION rule: a
    sealed entry becomes unreadable at `issuedAt + ttlMs` with no network round-trip, EVEN IF the revoke
    op was never delivered (fail closed: non-positive TTL ⇒ immediate; bad clock ⇒ unreadable). A
    persistent-granted key is exempt from TTL sealing. `computeParticipantCachePrivacyStatus` marks an
    unconfirmed device `purge-unconfirmed` with only the participant id + coarse status + a generic
    message (no device secrets — COLLAB-014 AC4). `SESSION_CACHE_POLICY_SCHEMA_VERSION` /
    `DEFAULT_SESSION_CACHE_TTL_MS` declared.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-cache-privacy.test.ts` — AC1: the policy declares a TTL + key
    invalidation + issue time. AC2: a sealed entry is readable before TTL and unreadable at/after TTL
    with no network; non-positive TTL and a bad clock both fail closed to unreadable. AC3: a persistent-
    granted key is exempt from TTL sealing (still readable long after TTL) while the session-only scene
    is sealed. AC4: an unconfirmed participant is `purge-unconfirmed`; the status leaks no entity ids /
    device secrets.
  - `apps/v2/app/tests/e2e/collab-authority-filtering-cache-privacy.spec.ts` — "COLLAB-010 / COLLAB-014
    participant cache purge/seal" (offline-seal + purge-unconfirmed cases).

## Changed files

- `apps/v2/packages/core/src/collab/replication-filter.ts` (new) — COLLAB-009 filter-before-send.
- `apps/v2/packages/core/src/collab/dm-authority.ts` (new) — COLLAB-008 authority resolution.
- `apps/v2/packages/core/src/collab/cache-privacy.ts` (new) — COLLAB-010 + COLLAB-014 cache policy.
- `apps/v2/packages/core/src/index.ts` — public exports for the three COLLAB modules.
- `apps/v2/packages/core/tests/collab-replication-filter.test.ts` (new) — COLLAB-009 tests.
- `apps/v2/packages/core/tests/collab-dm-authority.test.ts` (new) — COLLAB-008 tests.
- `apps/v2/packages/core/tests/collab-cache-privacy.test.ts` (new) — COLLAB-010 + COLLAB-014 tests.
- `apps/v2/app/src/lib/gui/SessionPrivacyPanel.svelte` (new) — the session-privacy demo surface.
- `apps/v2/app/src/routes/settings/+page.svelte` — mounts `SessionPrivacyPanel`.
- `apps/v2/app/tests/e2e/collab-authority-filtering-cache-privacy.spec.ts` (new) — e2e (both profiles).
- `docs/planning/v2/epics/COLLAB-authority-filtering-and-cache-privacy.completion.md` (this file).
- `docs/planning/v2/workpack-state.yaml` + generated planning files (status active → complete via the
  workpack commands).

## Tests run (pass/fail)

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`) — PASS (navigation 132
  files, tokens 132 files, repo-boundary + ci-guardrails 5 tests).
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:typecheck` — PASS (0 errors; core `tsc --noEmit`, app `svelte-check` 0 errors/0 warnings).
- `pnpm v2:lint` (boundary) — PASS ("v2 boundary lint passed").
- `pnpm v2:gates` — PASS (7 gates owned/budgeted/wired).
- Core unit suite (`pnpm --filter @dndtools/v2-core test`) — PASS (106 files, 1493 tests; +3 new files,
  +33 new tests).
- App unit suite (`pnpm --filter @dndtools/v2-app test`) — PASS (12 files, 55 tests).
- `pnpm --filter @dndtools/v2-app exec playwright test` — FULL Playwright on BOTH projects
  (desktop-chromium AND mobile-chromium) — PASS, 0 failed (the pre-existing intentional project-scoped
  skips remain). The new spec `collab-authority-filtering-cache-privacy.spec.ts` runs on both profiles.
- `pnpm v2:workpack:validate` — PASS before and after `complete` (no drift).

## Quality review

- Correctness: every mapped acceptance criterion (COLLAB-008 AC1/AC2; COLLAB-009 AC1/AC2; COLLAB-010
  AC1–AC4; COLLAB-014 AC1–AC4) is implemented and test-covered, including fail-closed negative cases.
- Architecture: pure Processing-Core policy (deterministic functions over plain data); the
  replication/cache boundary is the injectable seam (the visibility source + the cache-entry list are
  passed in); the GUI renders computed models and dispatches no command. Reuses PERM visibility / base-
  roles / grants and the canonical `SyncOperation`; no parallel permission or op model. Boundary lint
  green; no v1 imports.
- Tests: unit tests are the primary evidence — hard serialized-stream assertions for filter-at-source,
  DM-supersedes + non-authority + reject-not-conflict cases, and purge/seal/persistent-grant/offline-
  revocation with fail-closed clocks. E2e runs both profiles.
- Accessibility: the panel uses labelled `section`/`select`/`checkbox` controls and the established
  `.scene-list`/`.scene-card` patterns; route-accessibility + scene-accessibility e2e remain green.
- Performance: all functions are O(stream)/O(entries) single passes; no allocation-heavy work.
- Security/permissions/privacy: filter-before-send guarantees a player/observer outbound stream never
  contains dm-only/hidden content (proven by asserting the secret is absent from the serialized
  payload); cache sealing fails closed on offline revocation and bad clocks; purge-unconfirmed status
  leaks no device secrets; a non-DM can never override a DM.
- Persistence / sync / offline: operations are the canonical idempotent `SyncOperation`; sealing is
  local key invalidation requiring no network (offline-correct); the persistent-grant exception is the
  only path that retains session-only content.
- UX: the demo surface has interactive recipient/policy/online controls with clear computed readouts;
  presentation-equivalent across profiles.
- Maintainability: three small, cohesive, fully-typed modules with no speculative abstractions; the
  live transport/crypto seam is documented as deferred per ADR-014.
- Docs: this completion file plus inline module docs tracing each requirement to its contract.

## Known gaps / deferred items

- The LIVE replication transport and the real participant-cache key custody / encryption are DEFERRED
  per ADR-014 and Contract 2's blocked decisions. This epic delivers the pure policy + the boundary seam
  (visibility source, cache-entry classification, sealed-key invalidation model); a future ADR/epic
  supplies the concrete transport + crypto and wires them to these functions without changing the
  policy. The `SessionPrivacyPanel` uses fixed local demo fixtures because there is no live session
  transport to source a real participant stream from yet.

## Stop conditions

No stop condition was hit. The ADR-014 stack supports the approach (pure-core policy + deferred
transport); no v1 runtime import was required; visibility/permission/sync behavior was unambiguous
(reused the existing PERM/SYNC primitives); the workpack validates; `git status --short` showed no
unrelated overlapping changes.

## Git

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic
COLLAB-authority-filtering-and-cache-privacy`).

- Branch: `epic/COLLAB-authority-filtering-and-cache-privacy` (created from the prior epic HEAD
  `110f2b9`, not master).
- Commit SHA: recorded in the follow-up docs commit on this branch (see git log).
- Final `git status --short`:

```
(clean)
```
