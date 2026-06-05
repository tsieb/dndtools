# COLLAB-join-reconnect-and-identity — Completion Evidence

Epic: `COLLAB-join-reconnect-and-identity` — COLLAB: Join, reconnect, and identity
Requirement IDs: COLLAB-001, COLLAB-002, COLLAB-013
Architecture contracts: Contract 2 (Cloud Sync & Offline Model); Contract 3 (Role, Visibility &
Permission Grant Model)

Workpack status: `complete`

This epic delivers the join / reconnect / identity collaboration branch as PURE Processing-Core policy that
the GUI only renders. Per ADR-014 the LIVE invitation/reconnect/mobile TRANSPORT and cloud sync are
deferred; this epic delivers the POLICY a transport plugs into (the established COLLAB-009/010/014 pattern
— a pure, fail-closed module + tests, no cloud, no live transport). It REUSES prior epics' primitives and
does not duplicate them: the join result reuses the PERM grant-active model
(`apps/v2/packages/core/src/permissions/grant-records.ts`, `isGrantActive`) and the capability-schema
version (`apps/v2/packages/core/src/permissions/capability-schema.ts`); reconnect catch-up reuses the
COLLAB-009 catch-up replication filter (`apps/v2/packages/core/src/collab/replication-filter.ts`,
`filterCatchUpStream`) and the SYNC-011 replay validator
(`apps/v2/packages/core/src/sync/replay-validation.ts`, `validateReplayBatch`); mobile catch-up reuses the
COLLAB-014 sealed-cache policy (`apps/v2/packages/core/src/collab/cache-privacy.ts`,
`isSealedCacheEntryUnreadable`) and the COLLAB-002 control gate. Operations are the canonical
`SyncOperation` (`apps/v2/packages/core/src/sync/operation-log.ts`). All new core logic is deterministic
over plain data — no DOM/Node/Svelte/clock/entropy/network. The GUI renders computed view models only
(Contract 1). Boundary lint stays green; no v1 imports.

## Demo

Surface: the Session route, `/session/`. Start an active session from the home Command Center
(`session-workflow-active`), then open `/session/`. The "View as" header control (`view-as-select`)
re-renders every surface against another actor. The new participant RECONNECT + CATCH-UP surface
(`reconnect-status`) is PARTICIPANT-ONLY (a player/observer surface) — the DM never sees it. The surface
renders as a stacked panel on both desktop and compact (mobile) profiles, so the demo path is identical on
both Playwright projects.

### COLLAB-001 — start a session and issue invitations / local pairing codes (identity)

The join/identity policy is pure Processing-Core logic (`joinSession`). A DM-issued invitation / local
pairing code authenticates a joiner as DM/Player/Observer; on success the filtered `SessionJoinResult`
(role, participant id, ACTIVE grants only, visible scenes, capability-schema version, sync cursor) is
returned. An expired/revoked/consumed credential discloses NOTHING (only a generic denial). A
remote-only credential over an unreachable network degrades to a local-paired join only when the
credential is local-pairing-capable. The visible, participant-facing result of a join is the
reconnect/catch-up status the joined participant sees (below). Per ADR-014 the live invitation transport
(issuing codes over a network, the auth handshake) is deferred.

### COLLAB-002 — reconnect catch-up filtered by current role/visibility/grants

1. As the DM, deliver a handout to Demo Player (`handout-title`, `handout-recipient-actor-player`,
   `deliver-handout`) — this appends durable operations to the session log.
2. Switch "View as" to Demo Player. The `reconnect-status` panel appears. With the default sync cursor
   (caught up to the latest op) the status is `live` (`reconnect-ui-status-value`), durable actions are
   `enabled` (`reconnect-controls-state`, `reconnect-durable-action` enabled), and there is nothing to
   catch up (`reconnect-catchup-empty`).
3. Select "Fresh join (no prior state)" in `reconnect-cursor` to simulate reconnecting having missed the
   session: the catch-up list (`reconnect-catchup-list`) shows the now-visible operations the participant
   may receive, in dependency order. DM-only content never enters the participant's catch-up stream
   (filtered at the source in the Processing Core).

### COLLAB-013 — mobile catch-up ordering, sealing, and stale-control disabling

1. As Demo Player, move the `reconnect-cursor` back to an earlier operation to simulate a mobile device
   waking after missing Scene projection / handout delivery / grant revocation / combat updates. The
   catch-up applies in DEPENDENCY order (`orderCatchUpByDependency`).
2. While catch-up is still applying or has failed mid-stream, the status shows `syncing` /
   `stale-reconnecting` and durable actions stay DISABLED (`reconnect-durable-action` disabled) until the
   participant is provably caught up against current grants.
3. A revoked/sealed cached handout becomes unreadable before stale UI can open it (`isCachedHandoutOpenable`
   — sealing on local-TTL expiry even OFFLINE).

Requirement IDs exercised by the demo: COLLAB-001 (identity backing the participant surface), COLLAB-002,
COLLAB-013.

## Traceability

### COLLAB-001 — start a session and issue invitations / local pairing codes that authenticate participants

- Acceptance criteria:
  - AC1 (valid invitation returns role/participant/grants/scenes/cursor): `joinSession` returns the
    filtered `SessionJoinResult` (role, participant id, ACTIVE grants only via
    `activeGrantsForParticipant`, visible scenes supplied by the actor-filtered read, capability-schema
    version, sync cursor) only when the credential authenticates.
  - AC2 (expired/revoked invitation discloses no session state): a non-`active` or expired credential
    returns `{ admitted: false, reason, message }` carrying ONLY a structured reason + generic message —
    no role, participant id, scenes, or session id. `isInvitationExpired` fails closed on a malformed
    expiry.
  - AC3 (local paired join continues offline per platform capability): a `local-paired` channel admits a
    credential only when `localPairingCapable`; a remote-only credential over an unreachable network fails
    closed (`network-unavailable`).
- Code:
  - `apps/v2/packages/core/src/collab/session-join.ts` — `joinSession`, `activeGrantsForParticipant`,
    `isInvitationExpired`, `ensureSessionInvitation`, `SessionInvitation`, `SessionJoinResult`,
    `SessionJoinOutcome`, `JoinChannel`, `InvitationStatus`. Fail closed: role mismatch / unregistered
    participant deny with no disclosure; an observer credential never carries grants.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-session-join.test.ts` — valid invitation returns the filtered
    identity (AC1); a joiner receives only their own active grants (expired/other-player excluded);
    expired/revoked/consumed credentials disclose NOTHING (AC2, key-set assertion + message non-leak);
    local paired join continues offline only when local-pairing-capable, remote-only over offline fails
    closed (AC3); role/identity mismatch denied; observer never carries write grants; fail-closed hydrate.

### COLLAB-002 — reconnect catch-up allowed only by current role/visibility/grants/cursor

- Acceptance criteria:
  - AC1 (revoked grant not restored from cache): `computeReconnectCatchUp` re-evaluates EVERY op against
    the CURRENT permission state via `filterCatchUpStream`, so an op visible only under a now-revoked grant
    is absent from `delivered` — a stale cache cannot restore it.
    `assertCatchUpRestoresNoRevokedAccess` is the boundary leak guard.
  - AC2 (hidden ops not sent): the same catch-up filter omits a now-`dm-only`/hidden op at the source (it
    never enters the player stream); the test serializes `delivered` and asserts the secret is absent.
  - AC3 (dependency order + revalidation before controls re-enable): the delivered batch is revalidated in
    dependency order by `validateReplayBatch`; an unsatisfied pending-op dependency DEFERS, a now-
    unauthorized op is REJECTED, and the control gate keeps durable controls disabled
    (`disabled-syncing` / `disabled-stale`) until catch-up applies cleanly (`enabled`).
- Code:
  - `apps/v2/packages/core/src/collab/reconnect-catchup.ts` — `computeReconnectCatchUp`,
    `assertCatchUpRestoresNoRevokedAccess`, `appliedIdsBeforeCursor`, `CatchUpControlState`. Entity-
    revision-marker dependencies (`entityKey@revision`, carrying `@`) are treated as satisfied base state
    so only genuine pending-op dependencies can defer (fail closed otherwise).
  - `apps/v2/app/src/lib/gui/ReconnectStatus.svelte` — participant-only surface rendering the catch-up,
    UI status, and durable-action gating; wired into `apps/v2/app/src/routes/session/+page.svelte`.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-reconnect-catchup.test.ts` — now-hidden op not sent (AC2, secret
    absent); revoked-grant op withheld (AC1); already-applied ops not re-delivered + dependency-ordered
    apply re-enables controls (AC3); deferred dependency keeps controls `disabled-syncing`; a now-
    unauthorized op rejected keeps controls `disabled-stale`; leak guard throws; unknown recipient gets
    the empty batch; cursor → applied-id-set expansion fail-closed.
  - `apps/v2/app/tests/e2e/collab-join-reconnect-identity.spec.ts` — COLLAB-002/013 (desktop + mobile).

### COLLAB-013 — mobile/reconnect catch-up ordering, cache invalidation, and stale-control disabling

- Acceptance criteria:
  - AC1 (wake → dependencies applied in order, controls match authority): `orderCatchUpByDependency` is a
    deterministic topological sort over Scene-projection / handout / grant / combat ops; a missing/cyclic
    dependency is HELD fail-closed (never applied out of order). `catchUpPhase` maps the outcome to a
    stream phase; `classifyCatchUpOp` categorizes the mixed op kinds.
  - AC2 (revoked handout in offline cache unreadable before stale UI opens it): `isCachedHandoutOpenable`
    returns false for a revoked handout, and seals an unrevoked-but-sealed handout on local-TTL expiry
    even OFFLINE (reusing `isSealedCacheEntryUnreadable`); a persistent-granted handout stays openable.
  - AC3 (catch-up fails mid-stream → stale/reconnecting + durable commands disabled):
    `deriveCatchUpFailureState` maps `failed`→`stale-reconnecting` (durable commands disabled),
    `in-progress`→`syncing` (disabled), `complete`→`live` (enabled).
- Code:
  - `apps/v2/packages/core/src/collab/mobile-catchup.ts` — `orderCatchUpByDependency`,
    `isCachedHandoutOpenable`, `deriveCatchUpFailureState`, `catchUpPhase`, `classifyCatchUpOp`,
    `CatchUpFailureState`, `CatchUpStreamPhase`, `CatchUpUiStatus`, `CatchUpOrderResult`.
  - `apps/v2/app/src/lib/gui/ReconnectStatus.svelte` — renders ordered catch-up, stale/reconnecting state,
    and disabled durable actions; held/rejected ops surfaced.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-mobile-catchup.test.ts` — mixed ops ordered by dependency not
    wall-clock (AC1); applied-before-disconnect dependency satisfied; missing-dependency / cycle HELD
    fail-closed; deterministic ordering; revoked/sealed cached handout unreadable, offline TTL seal,
    persistent exempt, non-positive TTL seals immediately (AC2); failed/in-progress/complete UI + control
    states (AC3); `catchUpPhase` mapping; op classification.
  - `apps/v2/app/tests/e2e/collab-join-reconnect-identity.spec.ts` — COLLAB-002/013 (desktop + mobile).

## Tests run / quality gates

- `pnpm --filter @dndtools/v2-core test` — PASS: 112 files, 1550 tests (includes the 3 new `collab-*`
  suites: session-join, reconnect-catchup, mobile-catchup — 34 new tests).
- `pnpm --filter @dndtools/v2-core typecheck` (`tsc --noEmit`) — PASS.
- `pnpm --filter @dndtools/v2-app typecheck` (`svelte-check`) — PASS: 0 errors, 0 warnings.
- `pnpm v2:lint` (boundary script) — PASS ("v2 boundary lint passed").
- `pnpm lint` (full eslint + nav/token lint + repo audit) — PASS.
- `pnpm docs:validate` — PASS ("docs validation passed").
- `pnpm v2:workpack:validate` — PASS ("v2 workpack validation passed").
- Playwright e2e on BOTH projects (desktop-chromium + mobile-chromium):
  - `collab-join-reconnect-identity.spec.ts` — PASS (4 tests; 2 per project).
  - `route-accessibility.spec.ts` + `collab-combat-handouts-groups.spec.ts` (regression for the touched
    `/session/` route) — PASS (16 tests).

## Data-safety / permission / identity review

- Join discloses NOTHING on a bad credential: an expired/revoked/consumed credential, a role mismatch, or
  an unregistered participant returns only a structured reason + a generic message — no role, participant
  id, scenes, or session id. Tests assert the denial object has exactly `{ admitted, reason, message }`
  and the message contains neither the session id nor the participant id. A credential can never elevate an
  actor's role (the credential role must match the registered actor's role), and an observer credential
  never carries write grants.
- Reconnect catch-up re-evaluates against CURRENT grants/visibility, never the cache: a revoked-grant op
  and a now-hidden op are both filtered out at the source (the secret is absent from the serialized
  delivered batch); the boundary guard throws if a buggy transport delivers a non-visible op. A grant is
  ACTIVE-filtered on join (`isGrantActive`), so an expired grant is never restored.
- Stale-control disabling fails closed: durable controls re-enable ONLY after a clean catch-up (no rejects,
  no defers, no held dependencies). A rejected (now-unauthorized) op ⇒ `disabled-stale`; a deferred/held
  dependency ⇒ `disabled-syncing` — a participant can never act on stale authority.
- Cache invalidation fails closed: a revoked handout is never openable from the cache; an unrevoked-but-
  sealed handout becomes unreadable on local-TTL expiry even OFFLINE (before the revoke op is delivered);
  only a persistent-granted handout survives.
- Dependency ordering fails closed: a missing or cyclic dependency is HELD and never applied out of order;
  an entity-revision-marker dependency refers to already-materialized base state and is treated as
  satisfied (only genuine pending-op dependencies can hold an op back).

## Architecture review summary

- Correctness: every mapped acceptance criterion is implemented and test-covered (unit + e2e).
- Architecture: pure Processing-Core policy; GUI renders view models only (Contract 1); visibility +
  permission evaluated before any catch-up op is delivered to a non-DM (Contract 2 replication filtering /
  Contract 3 Session Join rule 5); operation-based catch-up with dependency ordering (Contract 2 Sync
  Unit). No v1 runtime imports; boundary lint green.
- Tests: 1550 core tests pass; 3 new core suites (34 tests); 1 new e2e suite on both profiles.
- Accessibility/UX: the reconnect surface is a stacked panel equivalent on desktop and compact profiles;
  labeled select + buttons; explicit empty/syncing/stale/held/rejected states; the disabled durable-action
  button uses the native `disabled` attribute.
- Performance: pure functions over in-memory state; no new high-frequency subscriptions or timers.
- Security/permissions/identity/sync/offline: covered above (fail closed throughout).
- Maintainability: small typed modules; reuses existing PERM/SYNC/COLLAB primitives; no speculative
  abstractions or unrelated refactors.
- Docs: this completion file; generated planning files updated via the workpack commands.

## Known gaps / deferred

- Per ADR-014 the LIVE collaboration transport is deferred: issuing invitation/pairing codes over a
  network, the auth handshake, the realtime reconnect channel, mobile wake/background detection, and cloud
  sync are NOT implemented. This epic delivers the POLICY (join authentication, reconnect catch-up
  filtering + revalidation, mobile dependency ordering + seal-before-open + stale-control gating) at the
  boundary a transport plugs into. `joinSession`, `computeReconnectCatchUp`, `orderCatchUpByDependency`,
  `isCachedHandoutOpenable`, and `deriveCatchUpFailureState` are the seams; no further core change is
  required when the transport lands.
- The participant reconnect panel SIMULATES a sync cursor (a select control) because there is no live
  connection in the first prototype; it forces `player-visible` metadata for the simulation (the core
  still fails closed for real recorded metadata). Wiring a real connection/cursor signal is a
  transport-layer concern.
- Visible-scene resolution for the join result is supplied by the caller (the actor-filtered scene read)
  to keep the join policy pure and free of a query→collab dependency cycle.

## Git evidence

- Branch: `epic/COLLAB-join-reconnect-and-identity`
- Commit (feat): `a43819fa99d4d6fb51b3daba5d3b674746b2b423`

### `git status --short` (after the feat commit)

```
```

(Empty — clean working tree after the `feat(v2): complete COLLAB-join-reconnect-and-identity epic` commit.
This `docs(v2): record commit SHA` follow-up writes the SHA into the evidence and is itself the only
remaining change.)
