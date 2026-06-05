# COLLAB-live-session-state-and-presence — Completion Evidence

Epic: `COLLAB-live-session-state-and-presence` — COLLAB: Live session state and presence
Requirement IDs: COLLAB-003, COLLAB-004
Architecture contracts: Contract 1 (Processing / Display Decoupling — `PresenceState` as the seventh,
ephemeral state document); Contract 2 (Cloud Sync & Offline Model — local-first/degraded sync, presence
"Ephemeral broadcast, no durable merge"); Contract 3 (Role/Visibility/Permission — fail-closed
filter-before-send); Contract 4 (Scene/Widget — projected combat/scene updates).

Workpack status: `complete`

This epic delivers the live session state + presence collaboration branch as PURE Processing-Core policy
that the GUI only renders (Contract 1). Per ADR-014 the LIVE collaboration transport (websocket/push/cursor
awareness) and cloud sync are deferred; this epic delivers the POLICY a transport plugs into — the
established COLLAB pattern (a pure, fail-closed core module + tests + a participant-facing surface, no cloud,
no live transport). It REUSES prior epics' primitives and does not duplicate them: the COLLAB-003 delivery
filter reuses the COLLAB-009 filter-before-send replication filter
(`apps/v2/packages/core/src/collab/replication-filter.ts`, `filterReplicationStream`) so a hidden op never
enters a participant's live stream; operations are the canonical `SyncOperation`
(`apps/v2/packages/core/src/sync/operation-log.ts`); presence participant visibility reuses the PERM actor
model (`apps/v2/packages/core/src/state/permission-state.ts`). Presence is classified `presence-state` /
`device-local` in the existing storage-classification registry
(`apps/v2/packages/core/src/sync/storage-classification.ts`), so it never enters durable storage or the op
log. All new core logic is deterministic over plain data — no DOM/Node/Svelte/clock/entropy/network.
Boundary lint stays green; no v1 imports.

## Demo

Surface: the Session route, `/session/`. Start an active session from the home Command Center
(`session-workflow-active`), then open `/session/`. The "View as" header control (`view-as-select`)
re-renders every surface against another actor. The new LIVE SESSION STATE + PRESENCE surface
(`live-session-status`) is PARTICIPANT-ONLY (a player/observer surface) — the DM never sees it. The surface
renders as a stacked panel on both desktop and compact (mobile) profiles, so the demo path is identical on
both Playwright projects.

### COLLAB-003 — near-real-time live session state

1. As the DM, drive the live session (advance combat in `CombatTracker`, deliver a handout in
   `HandoutDelivery`, roll dice, etc.) — these append durable session operations to the log.
2. Switch "View as" to Demo Player. The `live-session-status` panel appears. Connected and caught up, the
   live status (`live-status-value`) is `live`.
3. Uncheck `live-connected` to simulate the live channel dropping: the status becomes `reconnecting` (the
   view may be behind). Re-check it, set `live-pending` > 0 to simulate updates in flight: the status
   becomes `syncing`. Set `live-undeliverable` > 0 to simulate an out-of-order (held) update: the status
   becomes `stale` even while connected — a behind view is never reported `live` (fail closed).
4. The Processing Core builds the deliverable batch fail-closed: a DM-only/hidden session op NEVER enters
   the player's live stream (filtered at the source by the COLLAB-009 replication filter); an out-of-order
   op is held until its dependency arrives (never applied out of order); measured delivery latencies are
   reported against the configured product latency budget (p95 + stale thresholds).

### COLLAB-004 — ephemeral presence

1. As Demo Player on the `live-session-status` panel, the "Who's here" list (`presence-list`) shows the
   ephemeral presence (online status + device) of the player and authorized co-participants (e.g. the DM,
   `presence-local-dm`).
2. A participant the viewer may NOT see is OMITTED entirely from the list (fail closed — not merely hidden),
   and a cursor/selection hint scoped to a scene the viewer cannot see is STRIPPED, so presence never leaks
   a hidden participant or a hidden scene/widget.
3. Presence is EPHEMERAL: it is rebuilt every render from the live participant snapshot and never persisted.
   After everyone goes offline and reconnects, durable state (the op log / state documents) is intact, but
   old presence is NOT replayed as authoritative history (`restorePresenceOnReconnect` always returns the
   empty presence; `assertNoPresenceInOperationLog` proves no presence op is durable).

Requirement IDs exercised by the demo: COLLAB-003, COLLAB-004.

## Traceability

### COLLAB-003 — share real-time / near-real-time session state for active scenes, combat, dice, timers, handouts, and visible map updates

- Acceptance criteria:
  - AC1 (projected combat advance updates the player's visible combat widget near-real-time):
    `deliverableSessionUpdates` keeps only live-session updates (combat/dice/timers/handouts/map/scene
    projection) the participant has not applied, then filters them through the COLLAB-009 replication filter
    — so a projected combat op reaches the player and a hidden op NEVER enters their stream (filter-before-
    send). The DM receives every live update; an unknown recipient receives none.
  - AC2 (network latency / pending updates → stale or reconnecting status): `deriveLiveSessionStatus`
    computes `live`/`syncing`/`stale`/`reconnecting` from the connection + pending-update state. Fail closed:
    disconnected ⇒ `reconnecting`; an undeliverable (held) update or a pending update older than the stale
    threshold ⇒ `stale`; pending within threshold ⇒ `syncing`; caught up ⇒ `live` (a behind view is never
    `live`).
  - AC3 (out-of-order delivery → defer until dependencies arrive or report stale): `bufferOutOfOrderUpdate`
    buffers an op delivered before its dependencies; `drainApplicableUpdates` is a deterministic fixed-point
    that applies every op whose dependencies are satisfied IN dependency order and HOLDS the rest (never
    applied out of order). A base-state revision-marker dependency (`entityKey@revision`, carrying `@`) is
    treated as satisfied. The held count drives the `stale` status (AC2 cross-check).
  - AC4 (latency budget → report p95 delivery + stale-state thresholds against the budget):
    `reportLatencyBudget` computes measured p95 (nearest-rank `percentile`) + max delivery, whether p95 is
    within the configured `SessionLatencyBudget`, and how many deliveries exceeded the stale threshold;
    `DEFAULT_SESSION_LATENCY_BUDGET` is the documented near-real-time product target (500ms p95, 2s stale).
- Code:
  - `apps/v2/packages/core/src/collab/session-sync.ts` — `deliverableSessionUpdates`, `isLiveSessionUpdate`,
    `LIVE_SESSION_ENTITY_TYPES`, `deriveLiveSessionStatus`, `LiveSessionStatus`, `bufferOutOfOrderUpdate`,
    `drainApplicableUpdates`, `DrainResult`, `reportLatencyBudget`, `percentile`, `SessionLatencyBudget`,
    `DEFAULT_SESSION_LATENCY_BUDGET`. Pure + fail closed; reuses the COLLAB-009 replication filter.
  - `apps/v2/app/src/lib/gui/LiveSessionStatus.svelte` — participant-only surface rendering the live status
    + presence; wired into `apps/v2/app/src/routes/session/+page.svelte`.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-session-sync.test.ts` — projected combat advance reaches the player
    (AC1); a dm-only/hidden session op never enters the player/observer stream (secret absent in serialized
    delivery); DM gets all, unknown recipient gets none; already-applied + non-session ops excluded;
    disconnected→reconnecting / caught-up→live / pending→syncing / overdue→stale / out-of-order→stale (AC2);
    out-of-order op held then applied when dependency arrives, base-state ref satisfied, orphan held forever,
    deterministic ordering (AC3); p95 + max + stale-threshold reporting, p95-over-budget flagged, empty
    sample met, non-finite samples ignored, nearest-rank edge percentiles (AC4).
  - `apps/v2/app/tests/e2e/collab-live-session-presence.spec.ts` — COLLAB-003 live→reconnecting→syncing→stale
    status (desktop + mobile).

### COLLAB-004 — ephemeral presence (online status, cursors, selections, device availability) without persisting or merging for offline correctness

- Acceptance criteria:
  - AC1 (two participants online; one moves a visible cursor → presence appears to authorized viewers):
    `projectPresenceForViewer` / `projectSessionPresence` project the ephemeral presence to a viewer FAIL
    CLOSED — a participant the viewer may not see is OMITTED entirely (not merely hidden, its existence is
    not probeable); a cursor/selection hint scoped to a scene the viewer cannot see is STRIPPED (coarse
    online status survives, the hidden scene/widget never leaks); the viewer always sees their own presence;
    the DM sees everyone; an unknown viewer sees nothing. `assertPresenceProjectionIsClean` is the boundary
    leak guard.
  - AC2 (all go offline and reconnect → durable state intact but old presence not replayed as authoritative
    history): presence is a fully-replaceable per-actor SNAPSHOT (no revision/dependency/base/idempotency).
    An `offline` broadcast REMOVES the entry; a fresh broadcast REPLACES (never merges) a prior entry.
    `restorePresenceOnReconnect` ALWAYS returns the EMPTY presence (old presence is never restored from a
    cache). `assertNoPresenceInOperationLog` throws if any op looks like a presence op — proving presence
    never enters the durable op log (Contract 2 "Presence | Ephemeral broadcast, no durable merge"; Cloud
    Storage Model: presence is device-local only).
- Code:
  - `apps/v2/packages/core/src/state/presence-state.ts` — the ephemeral `PresenceState` document:
    `PresenceEntry`, `PresenceCursor`, `PresenceSelection`, `PresenceOnlineStatus`, `PresenceDeviceKind`,
    `EMPTY_PRESENCE_STATE`, `buildPresenceEntry` (clamps unit-interval cursor, fail-closed status/device
    normalization, drops malformed hints), `applyPresenceBroadcast` (replace, offline→remove),
    `removePresence`, `ensurePresenceState`.
  - `apps/v2/packages/core/src/collab/presence.ts` — `projectPresenceForViewer`, `projectSessionPresence`,
    `ParticipantVisibilitySource`, `PresenceSceneVisibilitySource`, `PresenceProjection`,
    `restorePresenceOnReconnect`, `assertNoPresenceInOperationLog`, `assertPresenceProjectionIsClean`,
    `PRESENCE_ENTITY_TYPE`. Pure + fail closed; reuses the PERM actor model for participant visibility.
  - `apps/v2/app/src/lib/gui/LiveSessionStatus.svelte` — renders the projected presence list.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-presence.test.ts` — authorized co-participants visible (AC1); a
    hidden participant OMITTED entirely (id absent from serialized projection); DM sees everyone; viewer sees
    own presence with no source; unknown viewer sees nothing; hidden-scene cursor/selection/activeScene
    STRIPPED while a visible-scene hint survives; staleness reclassifies to `away` and drops the cursor; leak
    guard throws; offline broadcast removes the entry, fresh broadcast replaces (no merge), removePresence
    idempotent (AC2); `restorePresenceOnReconnect` always empty, presence never in the op log, durable state
    intact across disconnect (AC2); construction/normalization fail-closed (cursor clamp, bad status/device,
    hydrate drops malformed, selection dedupe).
  - `apps/v2/app/tests/e2e/collab-live-session-presence.spec.ts` — COLLAB-004 presence lists authorized
    co-participants; surface participant-only (desktop + mobile).

## Tests run / quality gates

- `pnpm --filter @dndtools/v2-core test` — PASS: 114 files, 1595 tests (includes the 2 new `collab-*` suites:
  collab-presence (24 tests), collab-session-sync (18 tests) — 42 new tests; +3 base over prior epic's 1550
  reflects the 1550 baseline confirmed clean before edits, then +45 across both new files).
- `pnpm --filter @dndtools/v2-core typecheck` (`tsc --noEmit`) — PASS.
- `pnpm --filter @dndtools/v2-app typecheck` (`svelte-check`) — PASS: 786 files, 0 errors, 0 warnings.
- `pnpm v2:lint` (boundary script) — PASS ("v2 boundary lint passed").
- `pnpm lint` (full eslint + nav/token lint + repo audit) — PASS.
- `pnpm docs:validate` — PASS ("docs validation passed").
- `pnpm v2:workpack:validate` — PASS ("v2 workpack validation passed").
- Playwright e2e on BOTH projects (desktop-chromium + mobile-chromium):
  - `collab-live-session-presence.spec.ts` — PASS (6 tests; 3 per project).
  - `collab-join-reconnect-identity.spec.ts` + `collab-combat-handouts-groups.spec.ts` (regression for the
    touched `/session/` route) — PASS (12 tests).

## Data-safety / presence / permission review

- COLLAB-003 delivery fails closed: a participant's live-session stream is a STRICT subset of the live op
  stream, filtered at the SOURCE by the COLLAB-009 replication filter — a dm-only/hidden session op never
  enters a player's/observer's stream (the tests serialize the delivered batch and assert the secret is
  absent). An unknown/unauthenticated recipient receives the empty stream.
- COLLAB-003 status fails closed: a behind view is NEVER reported `live`. Disconnected ⇒ `reconnecting`; any
  out-of-order (held) update or an overdue pending update ⇒ `stale`; pending within threshold ⇒ `syncing`.
- COLLAB-003 out-of-order ordering fails closed: an op delivered before its dependencies is HELD and never
  applied out of order; an orphan (a dependency that never arrives) stays held forever; ordering is
  deterministic (ties break by `issuedAt` then id).
- COLLAB-004 presence fails closed: a participant the viewer may not see is OMITTED entirely (its existence
  is not probeable from the projection); a cursor/selection/activeScene hint scoped to a hidden scene is
  STRIPPED (coarse online status survives, the hidden scene/widget never leaks); the DM sees everyone; an
  unknown viewer sees nothing. The leak guard throws if a non-visible participant slips into a projection.
- COLLAB-004 presence is ephemeral by construction: a per-actor snapshot with no revision/dependency/base;
  an `offline` broadcast removes the entry; a fresh broadcast replaces (never merges). Presence is classified
  `device-local` and `assertNoPresenceInOperationLog` proves no presence op is durable — old presence is
  never replayed as authoritative history (`restorePresenceOnReconnect` always returns empty). Durable state
  (the op log / state documents) is unaffected by the disconnect/reconnect.

## Architecture review summary

- Correctness: every mapped COLLAB-003 (AC1–AC4) and COLLAB-004 (AC1–AC2) acceptance criterion is implemented
  and test-covered (unit + e2e).
- Architecture: pure Processing-Core policy; the GUI renders computed view models only (Contract 1);
  visibility + permission evaluated before any live-session op is delivered to a non-DM (Contract 2
  replication filtering); presence is the seventh, ephemeral, device-local state document and never merges or
  persists (Contract 1 State Shape / Contract 2 Presence merge strategy + Cloud Storage Model). No v1 runtime
  imports; boundary lint green.
- Tests: 1595 core tests pass; 2 new core suites (42 tests); 1 new e2e suite on both profiles (6 tests).
- Accessibility/UX: the live-session surface is a stacked panel equivalent on desktop and compact profiles;
  labeled select/checkbox/number controls; explicit live/syncing/stale/reconnecting states and a
  presence list with online status + device.
- Performance: pure functions over in-memory state; the latency-budget reporter is the COLLAB-003 AC4
  measurement seam (p95 + stale thresholds against the configured budget); no new high-frequency
  subscriptions or timers in the core.
- Security/permissions/presence/sync/offline: covered above (fail closed throughout).
- Maintainability: small typed modules; reuses existing PERM/SYNC/COLLAB primitives; no speculative
  abstractions or unrelated refactors.
- Docs: this completion file; generated planning files updated via the workpack commands.

## Known gaps / deferred

- Per ADR-014 the LIVE collaboration transport is deferred: the realtime delivery channel (websocket/push),
  cursor/awareness streaming, connection/latency signals, and cloud sync are NOT implemented. This epic
  delivers the POLICY at the boundary a transport plugs into — `deliverableSessionUpdates` (what a
  participant may receive), `deriveLiveSessionStatus` (live/stale status from connection + pending state),
  `bufferOutOfOrderUpdate` / `drainApplicableUpdates` (in-order apply with deferral),
  `reportLatencyBudget` (p95 + stale reporting against the configured budget), and
  `projectPresenceForViewer` / `restorePresenceOnReconnect` (fail-closed presence projection + no-replay).
  No further core change is required when the transport lands.
- The participant live-session panel SIMULATES the connection + pending-update state (a checkbox + number
  inputs) and a presence snapshot (derived from the registered participants) because there is no live
  connection in the first prototype. The core still fails closed for real recorded metadata; wiring a real
  connection/latency/presence-broadcast signal is a transport-layer concern.
- The configured product latency budget (`DEFAULT_SESSION_LATENCY_BUDGET`: 500ms p95, 2s stale) is the
  first-prototype default; a later performance ADR may tune it. The reporter consumes whatever budget is
  configured.

## Git evidence

- Branch: `epic/COLLAB-live-session-state-and-presence`
- Commit (feat): _recorded in the follow-up `docs(v2): record commit SHA` commit._

### `git status --short` (after the feat commit)

```
```

(Empty — clean working tree after the `feat(v2): complete COLLAB-live-session-state-and-presence epic`
commit. This `docs(v2): record commit SHA` follow-up writes the SHA into the evidence and is itself the only
remaining change.)
