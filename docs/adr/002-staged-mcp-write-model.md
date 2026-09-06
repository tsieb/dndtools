# ADR-002: Staged MCP Write Model

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, Security
- Supersedes: N/A
- Amended by: ADR-031 (2026-09-04) — the staged-write model is extended to a **widget package
  draft** (`widget.package.propose`), an artifact that can carry executable code. Approving such a
  proposal means "create this package", not "trust it": it installs unreviewed with every host
  permission denied, and capabilities are granted only by a separate DM `widget.package.review`.
- Amended by: its own RC-AI-2.2 as-built section below — "deterministic conflict detection before
  applying staged writes" is made resolvable, not just detectable.

## Context

MCP tools can generate high-volume write operations quickly. Default direct writes increase risk of accidental data mutation and reduce user trust during live session workflows. The product goal is AI partnership with human oversight by default.

## Decision

MCP write behavior is staged by default:

- Default runtime uses staged storage where writes become pending change records.
- Approval behavior is policy-driven with three presets: `strict_review`, `balanced`, and `trusted`.
- Direct mode remains available only via explicit opt-in runtime flags.
- Tool permissions enforce staged/direct boundaries via shared contracts.

## Consequences

### Positive

- Human review gate for high-risk mutations by default.
- Full audit trail for staged, approved, rejected, and conflict-blocked actions.
- Deterministic conflict detection before applying staged writes to live notes.

### Negative

- Additional operational complexity versus always-direct writes.
- More UI and policy surfaces to maintain.
- Users in trusted mode can still bypass review by explicit configuration.

## Rejected Alternatives

| Alternative                      | Why Rejected                                                          |
| -------------------------------- | --------------------------------------------------------------------- |
| Direct writes by default         | Too much accidental mutation risk for local-first vault safety goals. |
| Single global approval mode only | Insufficient flexibility across agent trust levels and workflows.     |
| Disable MCP writes entirely      | Removes major product value and blocks guided automation workflows.   |

## Migration Impact

- New write-capable tools must declare `write-staged`/`write-direct` permissions in shared contracts.
- MCP settings and policy schemas must remain synchronized across main process, preload bridge, and renderer types.
- Operational docs and testing must continue to cover staged conflict detection and policy behaviors.

## Rollback Plan

- Trigger: staged mode causes blocking operational regressions that cannot be fixed quickly.
- Rollback action: run MCP in direct mode (`--direct` or `DNDTOOLS_MCP_STAGED=0`) while preserving auditability where possible.
- Data safety: capture a safety snapshot before switching mode for production vaults.
- Risk: direct mode increases chance of unintended writes and should be temporary.

## Verification and Evidence

- `mcp/index.ts`
- `mcp/staged-storage.ts`
- `mcp/storage.ts`
- `mcp/tools/shared/contracts.ts`
- `mcp/tools/shared/contract-server.ts`
- `mcp/staged-storage.test.ts`
- `mcp/tools/all-tools.test.ts`

## As built — RC-AI-2.2: the conflict is resolvable, not merely detected (2026-09-06)

The consequence above promised "deterministic conflict detection before applying staged writes to
live notes". Detection was real — `content.update-item` compares the staged `baseRevision` against the
item's current revision — but the outcome was the one shape this ADR exists to prevent: approving a
diverged proposal recorded a `content.item-conflict` op, left the note UNCHANGED, and still marked the
proposal approved. The DM was told a write landed that had not.

Three decisions close that:

1. **The base is captured at staging.** `baseRevision` can detect divergence but cannot resolve it: a
   three-way merge needs the base TEXT, the vault keeps no revision history, and by review time the
   prose the agent started from is gone. `McpStagedProposal.baseSnapshot` (title/body/revision) is
   written at staging, read AS THE BOUND ACTOR, so it can hold nothing that actor could not already
   read. The field is OPTIONAL and additive: the `mcp` document's schema version is unchanged, because
   there is nothing to migrate — a proposal staged by an older build simply has no base, and the
   conflict record then says so and withholds the merge rather than inventing a baseline.
2. **The merged text is computed by the core, never supplied by the caller.**
   `computeMcpProposalConflict` (`packages/core/src/mcp/proposal-conflict.ts`) aligns both sides to the
   base by LCS and classifies every region as `ai-only`, `mine-only`, `agreed` or `conflicting`. A
   merge is offered ONLY when no region conflicts. `mcp.resolve-proposal-conflict` takes
   `{proposalId, resolution}` and nothing else — for the same reason approval re-dispatches the
   captured payload rather than a client-supplied one, a client can never smuggle prose into the vault
   under the guise of "the merge".
3. **Resolving is one validated command, and it rebases through the ordinary dispatch.** `keep-ai` and
   `merge` re-dispatch `content.update-item` as the proposal's OWN bound actor onto the note's current
   revision, so a grant revoked since staging still blocks the write; `keep-mine` writes nothing and
   makes the proposal terminal. In the review panel the three-way choice REPLACES the approve control
   while a proposal is in conflict, because an approve that could only record another conflict is a
   control that cannot do what it says.
