# ADR-022: Co-DM Elevated Role and the Owner/Authority Permission Split

- Status: Accepted
- Date: 2026-07-11
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A

## Context

The permission model (`@dndtools/core`) had exactly three base roles — `dm`, `player`, `observer`
— with the DM as a single, all-powerful actor. Every "is this the DM?" check was a literal
`actor.role === 'dm'` comparison scattered across ~30 core modules (visibility, replication,
grants, session control, command handlers, query read models).

Meanwhile the shipping product advertises a **Co-DM seat** on paid plans
(`apps/gm-react/src/cloud/entitlements.ts`: "Up to 6 players + 1 co-DM" / "Up to 12 players +
3 co-DMs"), and `PlayerView.tsx` rendered a whole "Co-DM" tier of tools as *shown-locked* with the
honest note that "the core has no role above player yet." Initiative I7 deferred the role; the
release bar is now "every advertised feature functional." A trusted-elevated seat therefore had to
become a real core role, not a marketing string.

The design tension: a Co-DM must see and author DM-grade content (run the table), but must **not**
inherit the campaign-owner's administrative powers (assigning roles, granting/revoking permissions,
transferring ownership, minting invites, vault/account/sync settings, deleting the campaign). A flat
"DM" concept cannot express that; the model needs to distinguish *authority* from *ownership*.

## Decision

Introduce a fourth base role, **`co-dm`**, ranked between `dm` and `player`, and split the single
"is the DM" concept into two explicit predicates in
`packages/core/src/state/permission-state.ts`:

- **`hasDmAuthority(role)`** — true for `dm` **and** `co-dm`. This is the gate for DM-grade **read
  visibility** (dm-only scenes/notes/maps, hidden combatants, the creature roster) and DM-grade
  **authoring** (scenes, content, combat, session control). Every former `role === 'dm'` read/author
  check now calls this.
- **`isCampaignOwnerRole(role)`** — true for `dm` **only**, never a co-DM. This is the gate for the
  owner-scoped administrative powers: role assignment, grant/revoke/transfer, and (app-side) invites
  and vault/account settings. A new `requireCampaignOwner` command helper wraps it; the durable grant
  commands (`permission.grant-capability-set` / `revoke-grant` / `transfer-ownership`) now require it.

Both predicates fail closed on unknown input.

Add the **first actor-role-mutation command**, `permission.assign-role`
(`packages/core/src/commands/assign-role.ts`), because roles were previously only *seeded*, never
commanded. It is owner-only, refuses to touch the owner's own row or to assign `dm` (ownership moves
only through the separate `transfer-ownership` command), and enforces the **Co-DM seat entitlement**:
when promoting to `co-dm` it fails closed unless `countCoDmActors(state) < coDmSeatLimit`, where the
limit is the caller's plan seats (0 on plans without Co-DM seats), supplied by the app from
`coDmSeatsForPlan(plan)`. The command mutates the durable actor role and appends a
`permission.assign-role` sync operation (the op-growth signal the P2P host re-snapshots from).

Surface it end-to-end in `apps/gm-react`: the "view as" control and core `PreviewRole` gain `co-dm`
(with a reserved zero-grant generic preview actor); the P2P view-model
(`net/viewModels.ts`) preserves the `co-dm` role instead of flattening it to `player` and carries an
`elevated` payload (visible scenes incl. dm-only, full combat tracker, creature roster) built through
the same actor-filtered queries; `PlayerView` unlocks its elevated tier for a `co-dm` seat;
`SessionHost.invite` admits a `co-dm` peer; and Settings promotes/demotes actors and mints
Co-DM-tagged invites, all seat-gated.

## Consequences

### Positive

- The advertised Co-DM seat is now a real, enforced capability — no shown-locked dead ends.
- Authority and ownership are explicit and independently testable; a co-DM can never widen anyone's
  access, including their own (grants/roles/invites stay owner-only, fail closed).
- The elevated player view-model is safe **by construction**: it is produced by the same
  `*ForActor` visibility queries, so a co-DM's snapshot contains only what a co-DM may legitimately
  see, and a player/observer snapshot carries no `elevated` payload at all.
- Seat entitlement is enforced in the pure core reducer (replayable, deterministic), not just in the
  UI; the app supplies the plan number and the core is the authority on "would this exceed it."

### Negative

- The DM concept is now two predicates. Any **new** DM check must consciously choose
  `hasDmAuthority` (read/author) vs `isCampaignOwnerRole` (administration); picking the wrong one is a
  latent authority bug. The distinction is documented at both function sites.
- The Co-DM seat limit is a plan concept that core cannot know, so the limit is passed into the
  command payload (`coDmSeatLimit`). This couples the command's shape to a client-supplied entitlement
  number; a client that lies can only *lower* its own ceiling (fail-closed), never raise it, but the
  value is not independently verifiable server-side in the local-first path.
- `permission.assign-role` mutates `permissions.actors` (full-state persisted) rather than being
  rebuilt from the op log; the appended op is a replication/audit signal, not the source of truth for
  the role. This matches how actors are already persisted, but it means the op alone does not
  reconstruct the role on a hypothetical pure-op replay.

## Rejected Alternatives

| Alternative                                                                 | Why Rejected                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model Co-DM as a bundle of per-entity capability grants on a `player` actor | The existing grant machinery is additive per-entity; a campaign-wide "see and author everything except administration" is a role-level concept, not an entity grant. Faking it with grants would be unbounded and leaky. |
| Give Co-DM full DM powers (single `hasDmAuthority`, no owner split)          | Violates the core requirement: a Co-DM must not grant roles/permissions, mint invites, or delete the campaign. Collapsing the two predicates would hand a trusted helper the keys to the account.                        |
| Enforce the seat limit only in the app UI                                   | Seat entitlement is a security/fairness boundary; UI-only gating is bypassable and untestable in core. The pure reducer enforces it so it is replayable and covered by unit tests.                                       |
| A dedicated `permission.set-role` per-role command set                      | One parameterized `assign-role` with an allowlisted role enum is simpler, mirrors the existing single-command grant surface, and keeps ownership transfer on its own atomic command.                                     |

## Migration Impact

- **Code contracts:** `ActorRole` gains `'co-dm'`; view-model role unions widen to include it
  (`net/viewModels.ts` `PlayerData.role`, `net/messages.ts`, `signaling.ts`, `SessionClient.ts`,
  `SessionHost.ts`, and the core `search-index-query` / `sync-status` / `character.field-edited`
  role fields). New exports: `hasDmAuthority`, `isCampaignOwnerRole`, `countCoDmActors`,
  `PREVIEW_CODM_ACTOR_ID`, `permission.assign-role` command, `permission.role-assigned` event.
- **Data:** additive only. Existing actors keep their roles; no persisted-shape migration. Cloud
  invites gain an optional `role` field defaulting to `player` (legacy rows read as `player`).
- **Rollout:** no infra change required for the core/app work. The cloud invite `role` field is a
  backward-compatible addition to `packages/cloud-fns/src/app-api/handler.ts` and would ship on the
  next app-api deploy; until deployed, minted invites simply resolve as `player` seats.
- **Tests:** new `packages/core/tests/co-dm-role.test.ts` (role helpers, assign-role authority + seat
  enforcement, dm-only visibility, grant refusal, preview-as), `apps/gm-react/src/net/viewModels.test.ts`
  (elevation payload + no-leak), and extended cloud invite tests.

## Rollback Plan

- **Trigger conditions:** a discovered authority leak (a co-DM performing an owner-only action), or
  the elevated view-model exposing content a co-DM may not see.
- **Technical steps:** the role is additive and gated. The fastest mitigation is to make
  `hasDmAuthority` return true for `dm` only (reverting co-DM to no elevated read/author) and hide the
  promote control; the `co-dm` role value and `assign-role` command can remain dormant. Full removal
  means reverting this change set — no data migration is needed because no existing role changes.
- **Data recovery:** none required; any actor promoted to `co-dm` can be demoted with the same
  command, and a stranded `co-dm` role still resolves to a valid (elevated) actor.
- **Known risks:** if the elevated view-model shape (`ElevatedData`) has been persisted anywhere
  (it is not — it is a transient P2P snapshot), a rollback would need to tolerate it; today it lives
  only on the wire and in memory.

## Verification and Evidence

- **Role model + helpers:** `packages/core/src/state/permission-state.ts`
  (`ActorRole`, `hasDmAuthority`, `isCampaignOwnerRole`, `countCoDmActors`),
  `packages/core/src/permissions/base-roles.ts` (privilege rank + role floor),
  `packages/core/src/commands/helpers.ts` (`requireDm` = authority, `requireCampaignOwner` = owner).
- **Role-assignment command:** `packages/core/src/commands/assign-role.ts`,
  wired in `packages/core/src/commands/dispatch.ts`, schema in
  `packages/core/src/schemas/commands.ts` (`assignRoleInputSchema`).
- **Preview-as:** `packages/core/src/queries/preview-mode.ts` (`PreviewRole` incl. `co-dm`,
  `PREVIEW_CODM_ACTOR_ID`), `apps/gm-react/src/app/ViewAsControl.tsx`.
- **Elevated view-model + PlayerView:** `apps/gm-react/src/net/viewModels.ts` (`ElevatedData`,
  role preservation), `apps/gm-react/src/screens/PlayerView.tsx` (tier map + Atlas/Bestiary/Assist).
- **Seat entitlement:** `apps/gm-react/src/cloud/entitlements.ts` (`coDmSeatsForPlan`),
  Settings promote flow + invite role in `apps/gm-react/src/screens/Settings.tsx`.
- **Tests:** `packages/core/tests/co-dm-role.test.ts` (19 cases),
  `apps/gm-react/src/net/viewModels.test.ts`, extended
  `apps/gm-react/src/cloud/appApi.test.ts` and `packages/cloud-fns/src/app-api/handler.test.ts`.
- **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm -r build`, `pnpm test` all green
  (core 3223, cloud 142, app 107, tooling 41).
