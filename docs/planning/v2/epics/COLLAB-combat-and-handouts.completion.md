# COLLAB-combat-and-handouts — Completion Evidence

Epic: `COLLAB-combat-and-handouts` — COLLAB: Combat and handouts
Requirement IDs: COLLAB-006, COLLAB-007, COLLAB-012
Architecture contracts: Contract 2 (Cloud Sync & Offline Model); Contract 3 (Role, Visibility &
Permission Grant Model); Contract 4 (Scene and Widget Contract)

Workpack status: `complete`

This epic delivers the combat-and-handouts collaboration branch as PURE Processing-Core policy that the
GUI only renders. It REUSES prior epics' primitives and does not duplicate them: the shared combat view
builds on the SES-002 actor-filtered tracker (`apps/v2/packages/core/src/queries/combat-tracker-view.ts`,
`getCombatTrackerForActor`) and the combat command authority
(`apps/v2/packages/core/src/commands/combat.ts`); the handout read/seal builds on the SES-004 handout
read model (`apps/v2/packages/core/src/queries/handout-query.ts`) and the PERM visibility filter; the
replication filter and the cache/seal disposition reuse the COLLAB-009/010/014 model
(`apps/v2/packages/core/src/collab/cache-privacy.ts`, `replication-filter.ts`); operations are the
canonical `SyncOperation` (`apps/v2/packages/core/src/sync/operation-log.ts`). All new core logic is
deterministic over plain data — no DOM/Node/Svelte/clock/entropy/network. The GUI dispatches command
intents and renders computed view models only (Contract 1). Boundary lint stays green; no v1 imports.

## Demo

Surface: the Session route, `/session/`. Start an active session from the home Command Center
(`session-workflow-active`), then open `/session/`. The "View as" header control (`view-as-select`)
re-renders every surface against another actor, proving the role/grant/visibility filtering. The
surfaces render as stacked panels on both desktop and compact (mobile) profiles, so the demo path is
identical on both Playwright projects.

### COLLAB-006 — shared combat view by role and grants

1. As the DM, build an encounter (`encounter-title`, `add-combatant`, `build-encounter`), select it
   (`start-encounter-select`), and start combat (`start-combat`). The DM sees the initiative order, the
   round (`combat-round`), every combatant (including any hidden ones with a hidden count), and the
   `advance-turn` / `end-combat` controls and per-combatant `apply-hp-*` controls.
2. Switch "View as" to Demo Player. The player sees the live tracker (round + the visible combatant)
   but the `advance-turn` / `end-combat` controls are ABSENT and there is no per-combatant edit control
   (no `apply-hp-*`) — fail closed, because the player holds no `combat-participant` grant. A hidden
   combatant's identity and stats never appear in the player's view.

### COLLAB-007 — handout delivery, acknowledgement, revocation

1. As the DM, fill the handout form (`handout-title`), check a recipient
   (`handout-recipient-actor-player`), optionally reveal the cipher (`handout-reveal-cipher`), and
   deliver (`deliver-handout`). The DM-only "Recipient status" surface (`handout-status`) shows the
   recipient as `delivered`.
2. Switch "View as" to Demo Player. They see the handout with its kind and a "Confirm receipt" button
   (`acknowledge-*`). Click it; the status shows "Receipt confirmed".
3. Switch back to the DM (`local-dm`): the recipient status now reads `opened`. Click `Revoke`
   (`revoke-*`); the row shows `sealed`.
4. Switch back to Demo Player: the handout is GONE (`handouts-received-empty`) — sealed, with no
   content leak (indistinguishable from a non-recipient). A persistent recipient would keep it.

### COLLAB-012 — player groups (delivery target only)

1. As the DM, create a Player Group (`player-groups`, `player-group-name`,
   `player-group-member-*`, `create-player-group`). The group appears in `player-group-list`.
2. Deliver a handout to Demo Player ONLY (no group). Switch "View as" to Demo Player 2 (a group member
   added AFTER): they still see NOTHING for that prior handout — membership delivered nothing.
3. Deliver a NEW handout to the GROUP (`handout-group-<slug>`). Now Demo Player 2 sees the group
   delivery but still not the earlier solo handout.
4. As a player, the `player-groups` management surface is absent entirely (DM-only).

Requirement IDs exercised by the demo: COLLAB-006, COLLAB-007, COLLAB-012.

## Traceability

### COLLAB-006 — participants view shared combat state according to role and grants

- Acceptance criteria:
  - AC1 (visible turn/status refresh): `getSharedCombatView` returns the SES actor-filtered tracker
    (`tracker.round`, `tracker.status`, visible combatants) for the participant; the view is a pure
    function of the live combat state so it refreshes on every combat update.
  - AC2 (hidden enemy omitted/placeholdered): the tracker omits/redacts hidden combatants; the
    replication filter `filterCombatStreamForRecipient` withholds hidden-combatant ops at the source
    and `redactCombatLevelOpForRecipient` strips hidden ids from the initiative `order`;
    `assertCombatStreamCarriesNoHiddenCombatant` is the hard boundary leak guard.
  - AC3 (cached/offline view marked stale, no live-authority commands): `CombatViewLiveness = 'stale'`
    sets `stale: true` and disables every live-authority control (`canAdvanceTurn` / `canEndCombat` /
    `canEditAnyCombatant` / `editableCombatantIds`) via `computeCombatControls` (fail closed).
- Code:
  - `apps/v2/packages/core/src/collab/combat-view.ts` — `getSharedCombatView`, `computeCombatControls`,
    `filterCombatStreamForRecipient`, `assertCombatStreamCarriesNoHiddenCombatant`,
    `combatantIdFromOpPath`. Permitted controls mirror the combat command authority exactly
    (`actorMayEditCombatant`): DM always; player only on a character combatant they hold
    `combat-participant` on; observer never; editable set is always a subset of the VISIBLE combatants.
  - `apps/v2/app/src/lib/gui/CombatTracker.svelte` — renders the shared view; the `advance-turn` /
    `end-combat` buttons gate on `controls.canAdvanceTurn` / `controls.canEndCombat`; the per-combatant
    edit controls gate on `controls.editableCombatantIds`.
  - `apps/v2/packages/core/src/index.ts` — public exports.
- Tests:
  - `apps/v2/packages/core/tests/collab-combat-view.test.ts` — visible combatant + current turn for a
    player, hidden combatant omitted with no count/name leak (AC1/AC2); role/grant-gated controls fail
    closed; stale view disables all live-authority controls (AC3); ops filtered before reaching a
    player with the boundary guard throwing on a leak; unknown actor gets an empty control-less view.
  - `apps/v2/app/tests/e2e/collab-combat-handouts-groups.spec.ts` — "COLLAB-006" (desktop + mobile).

### COLLAB-007 — deliver handouts (kinds) with acknowledgement and revocation state

- Acceptance criteria:
  - AC1 (DM sees delivered/opened status): `getHandoutStatusForDm` returns a DM-only per-recipient
    surface with `acknowledged` (opened) / `revoked` / `sealed` / `persistent`; a recipient acknowledges
    via `session.acknowledge-handout`. Non-DM gets an empty status list (fail closed).
  - AC2 (revoke removes the widget unless persistent): `session.revoke-handout` records a revocation;
    `handoutRecipientSealed` seals a revoked, non-persistent recipient so `getHandoutForActor` returns
    `{ kind: 'unavailable' }` (no content leak). A `persistentRecipientActorIds` recipient is never
    sealed (the COLLAB-010 persistent-grant exception applied to handouts).
  - AC3 (queued delivery + revocation replay order / final visibility): commands accept
    `connectionState: 'offline'` → `deliveryStatus: 'queued'`; ops are appended to the ordered
    operation log so the LAST accepted operation determines final visibility — re-delivering to a
    revoked recipient CLEARS their seal (recovery order), and persistent recipients are retained.
- Code:
  - `apps/v2/packages/core/src/commands/handout.ts` — `handleAcknowledgeHandout`,
    `handleRevokeHandout`; `handleDeliverHandout` extended with `kind`, `persistentRecipientActorIds`,
    seal-clearing on re-delivery, and group resolution.
  - `apps/v2/packages/core/src/queries/handout-query.ts` — `handoutRecipientSealed`,
    `handoutRecipientPersistent`, `getHandoutStatusForDm`; `getHandoutForActor` seals first and carries
    `handoutKind` / `acknowledged` / `persistent`.
  - `apps/v2/packages/core/src/state/session-state.ts` — `HandoutKind`, `HANDOUT_KINDS`,
    `HandoutAcknowledgement`, `HandoutRevocation`, `persistentRecipientActorIds` /
    `acknowledgements` / `revocations` on `SessionHandout`.
  - `apps/v2/packages/core/src/schemas/commands.ts` — `acknowledgeHandoutInputSchema`,
    `revokeHandoutInputSchema`, `handoutKindSchema`, and the extended `deliverHandoutInputSchema`.
  - `apps/v2/packages/core/src/commands/{dispatch,types,helpers,session-control}.ts` — wiring, command
    union, fail-closed hydration (`ensureHandouts`), and immutable archive cloning.
  - `apps/v2/app/src/lib/gui/HandoutDelivery.svelte` — recipient-status surface (acknowledge/revoke
    buttons, sealed/persistent/opened labels), kind label, and group delivery targets.
- Tests:
  - `apps/v2/packages/core/tests/collab-handout-ack-revoke.test.ts` — kind carried + acknowledgement
    recorded + DM status (AC1); revoke → sealed/unavailable, no leak, sealed recipient cannot ack
    (AC2); persistent survives revocation; re-delivery clears the seal (AC3 recovery order); fail-closed
    authority (player cannot revoke; DM cannot ack; persistent must be a recipient).
  - `apps/v2/app/tests/e2e/collab-combat-handouts-groups.spec.ts` — "COLLAB-007" (desktop + mobile).

### COLLAB-012 — player groups for projection and handout delivery targets (delivery only)

- Acceptance criteria:
  - AC1 (group delivery reaches only current members): `resolveDeliveryTarget` expands group ids to
    their CURRENT members; `handleDeliverHandout` / `handleProjectPlayerView` record the delivery
    against the resolved INDIVIDUAL recipients (not the group).
  - AC2 (later membership does not retroactively deliver): the delivery records resolved recipients at
    delivery time, so adding a player to a group later confers nothing; the critical invariant
    (membership grants ZERO permission) is structural — a `PlayerGroup` holds no permission data and
    the group commands never touch `permissions`/grants — and proven by
    `groupMembershipGrantsNoCapability`.
  - AC3 (offline group edits applied before later queued deliveries): group create/update/delete ops
    are appended to the ordered operation log before later delivery ops, so a membership change applies
    first and a later delivery resolves against the updated membership.
- Code:
  - `apps/v2/packages/core/src/state/player-group.ts` — `PlayerGroup` (plain membership list, no
    permission link), `normalizeMembers`, `ensurePlayerGroups`, `clonePlayerGroup`.
  - `apps/v2/packages/core/src/collab/player-groups.ts` — `resolveDeliveryTarget` (fail closed: unknown
    group → no recipients; DM/unknown → skipped), `groupMembershipGrantsNoCapability`,
    `groupsContainingActor`.
  - `apps/v2/packages/core/src/commands/player-group.ts` — DM-only create/update/delete; members must be
    registered non-DM participants; writes only the `playerGroups` slice, never grants.
  - `apps/v2/packages/core/src/commands/{player-view,handout}.ts` — `groupIds` resolution at projection
    and delivery time.
  - `apps/v2/packages/core/src/schemas/commands.ts` — `create/update/deletePlayerGroupInputSchema`, and
    `groupIds` on `projectPlayerViewInputSchema` / `deliverHandoutInputSchema`.
  - `apps/v2/app/src/lib/gui/PlayerGroups.svelte` — DM-only group management surface (wired into
    `apps/v2/app/src/routes/session/+page.svelte`); `HandoutDelivery.svelte` exposes group delivery
    targets.
- Tests:
  - `apps/v2/packages/core/tests/collab-player-groups.test.ts` — group delivery reaches only current
    members (AC1); adding a player to a group grants ZERO permission and never retroactively delivers
    (AC2, hard assertion + no grants created); `groupMembershipGrantsNoCapability` proof; membership
    change applied before a later delivery (AC3); `resolveDeliveryTarget` fail-closed cases; DM-only
    management with member validation.
  - `apps/v2/app/tests/e2e/collab-combat-handouts-groups.spec.ts` — two "COLLAB-012" tests (desktop +
    mobile).

## Tests run / quality gates

- `pnpm --filter @dndtools/v2-core test` — PASS: 109 files, 1513 tests (includes the 3 new
  `collab-*` suites: combat-view, handout-ack-revoke, player-groups).
- `pnpm --filter @dndtools/v2-core typecheck` (`tsc --noEmit`) — PASS.
- `pnpm --filter @dndtools/v2-app typecheck` (`svelte-check`) — PASS: 0 errors, 0 warnings.
- `pnpm v2:lint` (boundary script) — PASS ("v2 boundary lint passed").
- `pnpm lint` (full eslint + nav/token lint + repo audit) — PASS.
- `pnpm docs:validate` — PASS ("docs validation passed").
- `pnpm v2:workpack:validate` — PASS ("v2 workpack validation passed").
- Playwright e2e on BOTH projects (desktop-chromium + mobile-chromium):
  - `collab-combat-handouts-groups.spec.ts` — PASS (8 tests; 4 per project).
  - `session-handouts-and-tools.spec.ts` + `session-combat-and-encounters.spec.ts` +
    `route-accessibility.spec.ts` (regression for the touched components/route) — PASS.

## Data-safety / permission review

- Combat view is filtered by role + grants; controls are derived from the SAME authority the command
  reducer enforces (no wider GUI-only affordance); a stale/cached view disables every live-authority
  control; combat ops are filtered before they reach a non-DM recipient with a hard boundary leak
  guard. Fail closed for unknown actors.
- Handout revocation actually revokes access: a revoked, non-persistent recipient is sealed and the
  read returns `{ kind: 'unavailable' }` with no content leak; a sealed recipient cannot probe
  existence (acknowledge returns not-found). Persistent access is the only exception and must be a
  subset of the recipients.
- Player groups confer NO visibility/write by themselves: the `PlayerGroup` record holds no permission
  data, the group commands never create/modify grants, group membership only expands a delivery's
  resolved recipient list, and `groupMembershipGrantsNoCapability` is the executable proof. Tests
  assert no grants are created and a later-added member gains nothing.
- Persistence/offline: new durable fields hydrate fail-closed (`ensureHandouts`, `ensurePlayerGroups`,
  scene-store/runtime defaults); a legacy handout restores as kind `handout`, never-acknowledged,
  never-revoked. Offline delivery/revocation queue with `deliveryStatus: 'queued'` and replay in
  operation-log order.

## Architecture review summary

- Correctness: every mapped acceptance criterion is implemented and test-covered (unit + e2e).
- Architecture: pure Processing-Core policy; GUI renders view models only (Contract 1); visibility +
  permission evaluated before the read returns (Contract 3); handouts/combat are session-state with
  scene-widget delivery (Contract 4); operation-based offline queue (Contract 2). No v1 runtime imports;
  boundary lint green.
- Tests: 1513 core tests pass; 3 new core suites; 1 new e2e suite on both profiles.
- Accessibility/UX: surfaces are stacked panels equivalent on desktop and compact profiles; controls use
  labeled buttons/checkboxes; empty/sealed/unavailable states render explicit placeholders.
- Performance: pure functions over in-memory state; no new high-frequency subscriptions.
- Security/permissions/sync/offline: covered above (fail closed).
- Maintainability: small typed modules; reuses existing primitives; no speculative abstractions or
  unrelated refactors.
- Docs: this completion file; generated planning files updated via the workpack complete command.

## Known gaps / deferred

- Per ADR-014 the LIVE replication/collaboration transport and real crypto key-custody for cache
  sealing are deferred. This epic delivers the POLICY (filter-before-send, seal disposition) at the
  boundary a transport plugs into; `filterCombatStreamForRecipient` /
  `assertCombatStreamCarriesNoHiddenCombatant` and the handout seal are the seam.
- Real-time "delivered/opened" telemetry from a remote player device depends on the deferred live
  transport; the model and DM status surface are complete and the acknowledgement command is wired, so
  no further core change is required when the transport lands.
- Stale combat liveness is computed from a `CombatViewLiveness` argument; wiring a real
  connection/catch-up signal into the GUI runtime is a transport-layer concern (COLLAB-013) and is out
  of scope for this epic.

## Git evidence

- Branch: `epic/COLLAB-combat-and-handouts`
- Commit (feat): TO_BE_FILLED_BY_FOLLOWUP

### `git status --short` (after the feat commit)

```
TO_BE_FILLED_BY_FOLLOWUP
```
