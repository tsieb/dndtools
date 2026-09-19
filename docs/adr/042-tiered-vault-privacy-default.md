# ADR-042: Simple Modes Default to Cloud-Enhanced

- Status: Accepted
- Date: 2026-09-12
- Deciders: Product (RC roadmap §1.6 D3)
- Consulted: Engineering; security findings recorded in the run journal
- Supersedes: the forced, undefaulted privacy choice for every new vault and the rejection of a
  Cloud-Enhanced default for simpler tiers in [ADR-026](./026-opt-in-vault-privacy-modes.md).
  Amends ADR-026; its Private security boundary, legacy fallback, recovery and release gates remain.

## Context

[RC roadmap §1.6 D3](../planning/RC_ROADMAP.md#16-direction-set-on-2026-09-12) chooses short,
tiered onboarding. Beginner and Standard are interface complexity tiers, not paid plans or privacy
modes. Requiring every new user to compare encryption models and choose sample versus fresh content
conflicts with that direction. This decision accepts the privacy-expectation cost of a disclosed
default while preserving an explicit Private choice at Expert.

## Decision

For **new vault creation only**:

| Interface tier | Privacy behavior                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Beginner       | Create `cloud-enhanced`; show the one-line disclosure and Settings link.                                                        |
| Standard       | Create `cloud-enhanced`; show the same disclosure and Settings link.                                                            |
| Expert         | Require an explicit, unselected Private (E2EE) or Cloud-Enhanced choice; Private retains the user-held recovery acknowledgment. |

The simple-tier disclosure must say what the server can read, including campaign secrets. Target
copy when the server-readable pipeline is available: **“This vault uses Cloud-Enhanced: our server
can read your campaign content, including secrets, to provide cloud features. Manage this in
Settings.”** While phase 2 remains blocked, use truthful phase-1 copy: **“This vault uses
Cloud-Enhanced: upcoming cloud features let our server read your campaign content, including
secrets; backups are still end-to-end encrypted today. Manage this in Settings.”** These are copy
contracts, not claims that those strings or capabilities have shipped.

A separate privacy prompt is not required at Beginner or Standard. The disclosure must remain
visible on the creation/completion path, including skip paths; skipping optional setup must not
bypass it. Expert's privacy decision cannot be skipped. The forced sample-or-fresh step is removed:
new vaults start empty, and the demo is available from the vault switcher (RC-UX-3.7).

Settings must show the effective mode at every tier and explain how to change it. At simpler tiers,
it must make the route to Expert and the explicit Private choice discoverable; Private has no paid
plan requirement. Changing interface tier, replaying onboarding, upgrading the app, opening an
existing vault or clearing preferences must **never** change an existing vault's mode.

An absent, legacy, invalid or unreadable mode continues to resolve to `private-e2ee`. Implement the
simple-tier default in the new-vault creation path, never in the fallback reader. Persist the new
vault's mode and disclosure record against that vault; failed persistence must not authorize server
readability. A device-local preference is not server authorization. Phase 2 still requires an
authenticated, server-held vault registration and all checks in the
[threat model](../security/vault-privacy-modes-threat-model.md). This ADR does not approve phase 2.

### Later Cloud-Enhanced → Private moves and costs

**Supported today only as a local preference change while both modes use E2EE transport. A migration
of server-readable cloud content to Private is not implemented or supported today.** Settings must
not describe its local flag setter as a completed cloud migration.

The accepted target supports a later move to Private only through a verified migration: establish
client-held keys and recovery export, fence writes, encrypt and re-upload the complete vault, verify
the replacement, then delete old readable artifacts and derived indexes. Keep the previous usable
copy on interruption and do not report completion until cleanup is confirmed. Before phase-2
release, implement this path or explicitly show it as unavailable in Settings; never offer an
instant privacy toggle over server-readable data.

Costs are a full-vault transfer (bandwidth, time and temporary duplicate storage), interrupted sync
while writes are fenced, user responsibility for safeguarding recovery keys, and loss of
server-readable features such as server search, managed RAG and keyless access. No monetary price or
migration duration is established. A switch protects future storage; it cannot undo prior server or
operator access, copies already exfiltrated, or promise immediate erasure from retained backups.
Retention and deletion limits must be disclosed before confirmation. Existing Private →
Cloud-Enhanced moves still require explicit informed consent and a migration, never a tier change.

## Consequences

### Positive

- Simple onboarding avoids a specialist choice and the sample-content decision.
- Private remains available through Expert, with unchanged legacy behavior and recovery duties.
- Creation defaults are separated from storage fallback and server authorization.

### Negative

- A disclosed default is weaker evidence of user intent than an explicit choice; users may miss the
  line or assume “encrypted” means the operator cannot read their secrets.
- Settings must keep privacy discoverable even when other expert controls are hidden.
- Phase-1 wording and unsupported migration need explicit UI treatment to avoid false assurances.

## Rejected Alternatives

| Alternative                                                | Why Rejected                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Retain forced privacy and sample choices for everyone      | Reversed by D3's short, tiered onboarding decision.                                 |
| Truly silent Cloud-Enhanced default                        | The default is accepted only with a visible plain disclosure of server readability. |
| Change the absent-mode fallback to Cloud-Enhanced          | Would silently widen trust for legacy vaults and lost preferences.                  |
| Change privacy when the interface tier changes             | A presentation preference cannot authorize a vault migration.                       |
| Claim switching a flag restores historical confidentiality | Neither migrates cloud artifacts nor undoes previous access.                        |

## Migration Impact

RC-UX-3.6 owns the onboarding implementation and consent-test rewrite; RC-UX-3.7 moves the demo.
The `VaultPrivacyMode` values and fail-closed reader remain compatible. The current single
localStorage key is not a per-vault registration schema; creation must gain vault-scoped persistence
before applying a default across multiple vaults. Existing recorded modes are preserved, including
Cloud-Enhanced choices. No runtime, storage schema or cloud configuration changes ship in this docs
task. Server-readable enablement remains dependent on RC-CLD-2.2's separate security review.

Required implementation validation: simple-tier creation records the disclosed default, including
skip paths; Expert requires a choice and Private acknowledgment; legacy/invalid/unreadable storage
stays Private; replay, tier changes and vault switching preserve existing modes; Settings reports
mode and migration availability truthfully. Browser tests must cover these behaviors and the demo's
removal from forced onboarding. Existing tests do not establish that this target is implemented.

## Rollback Plan

If disclosure is missed or privacy expectations are misleading, restore explicit choice for future
vault creation. Preserve existing modes and the Private fallback; do not reset flags or silently
migrate vaults. Phase 1 requires no cloud data conversion because both transports remain E2EE.
After phase 2, rollback of already-readable vaults needs the verified migration and cleanup above;
prior disclosure to the server cannot be rolled back.

## Verification and Evidence

Local source reviewed on 2026-09-12 at commit `8b582677939ad2d89ff843affa60af78bd578ae9`:

- [Mode reader and setter](../../apps/gm-react/src/cloud/vaultMode.ts) and
  [tests](../../apps/gm-react/src/cloud/vaultMode.test.ts): Private fallback; one device-local key.
- [Onboarding](../../apps/gm-react/src/app/Onboarding.tsx) and
  [consent e2e spec](../../apps/gm-react/tests/e2e/onboarding-consent.spec.ts): still the ADR-026
  forced-choice implementation, not the tiered target.
- [Settings](../../apps/gm-react/src/screens/settings/SyncPrivacy.tsx): shows the mode and confirms
  switching, but only calls the local setter; no verified cloud migration.
- [Core decision schema and records](../../packages/core/src/security/cloud-security-decision.ts)
  and [tests](../../packages/core/tests/security-vault-privacy-modes.test.ts): two mode values,
  Cloud-Enhanced `approved: false`, scoped visibility checks and recovery tests.
- [Run journal and security-review report](../../state/RC-UX-5.3.journal.md): validation performed
  and remaining review boundaries. Acceptance of this decision is not evidence of deployed behavior.
