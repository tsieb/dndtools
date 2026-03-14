# ADR-012: Progressive Disclosure via Vault Maturity

- Status: Accepted
- Date: 2026-03-13
- Deciders: Engineering
- Consulted: Product, UX
- Supersedes: N/A

## Context

The application has a large feature surface spanning notes, knowledge graph, session boards, combat, maps, and campaign entities. Presenting all features simultaneously overwhelms new users with an empty vault. A disclosure mechanism is needed that reveals features as the vault grows, without requiring explicit user configuration for basic progression.

## Decision

Adopt a vault-maturity-driven progressive disclosure system:

- `VaultMaturitySignals` captures six numeric metrics: note count, link count, tag count, session count, map count, and object note count.
- `deriveVaultDisclosureState()` computes boolean feature gates from signals against configurable thresholds.
- Disclosure gates control navigation visibility (knowledge tags, graph link, collections, session section, campaign entities).
- Thresholds are defined in `maturity-thresholds.ts` and are tunable without code changes.
- Vault maturity state is reactive via `src/lib/state/vault-maturity.svelte.ts`.
- Advanced features beyond maturity-gated ones require explicit user opt-in.

## Consequences

### Positive

- New users see a focused, approachable interface that grows with their content.
- Feature discovery is organic rather than requiring documentation or tutorials.
- Thresholds are centralized and testable.

### Negative

- Users with specific workflows may not see features until thresholds are met.
- Threshold tuning requires user research to avoid frustrating power users.
- Two-tier system (maturity gates + explicit opt-in) adds complexity to feature visibility logic.

## Rejected Alternatives

| Alternative                   | Why Rejected                                                           |
| ----------------------------- | ---------------------------------------------------------------------- |
| Show all features immediately | Overwhelms new users and conflicts with learnability goals.            |
| Manual feature toggle panel   | Requires user knowledge of features before they can enable them.       |
| Time-based disclosure         | Arbitrary; does not correlate with actual vault activity or readiness. |

## Migration Impact

- New navigation entries or feature surfaces must declare their disclosure gate.
- Threshold changes must be tested against fresh vault, small vault, and large vault scenarios.
- Feature tier documentation in `docs/reference/FEATURE_TIERS.md` must stay synchronized.

## Rollback Plan

- Trigger: disclosure gates block critical features or confuse users.
- Rollback action: set all disclosure booleans to `true` unconditionally.
- Data safety: no vault data affected; disclosure is a UI-only concern.
- Risk: temporary feature overload for new users.

## Verification and Evidence

- `src/lib/domain/vault-maturity.ts`
- `src/lib/domain/maturity-thresholds.ts`
- `src/lib/state/vault-maturity.svelte.ts`
- `src/lib/domain/vault-maturity.test.ts`
- `docs/reference/FEATURE_TIERS.md`
