# ADR-002: Staged MCP Write Model

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, Security
- Supersedes: N/A

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
