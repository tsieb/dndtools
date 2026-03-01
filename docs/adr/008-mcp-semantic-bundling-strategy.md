# ADR-008: MCP Semantic Bundling Strategy

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, UX
- Supersedes: N/A

## Context

Fine-grained MCP tool calls are flexible but can increase LLM prompt overhead and workflow latency for common tasks (session prep, recap, continuity checks). The product direction favors high-signal, task-oriented bundle responses that reduce call count while retaining deterministic, inspectable behavior.

## Decision

Use semantic, algorithmic bundle tools as the default high-level read path:

- Bundle tools (`get_session_prep_bundle`, `get_recap_generation_bundle`, `get_continuity_check_bundle`) return task-oriented payloads that aggregate multiple signals.
- Bundle construction relies on deterministic vault intelligence computation, not opaque model-side summarization.
- Trust model remains staged-write-first: bundles guide read/analysis flows, while writes remain permission-gated and staged by default.
- Caching strategy uses contract-server idempotency key response caching and in-flight de-duplication for retry-safe calls.
- Extension interface remains contract-driven: new bundle tools must register through shared tool contracts and validation envelopes.

## Consequences

### Positive

- Lower LLM context and orchestration overhead for common multi-step workflows.
- More predictable, testable outputs versus ad hoc prompt-level aggregation.
- Clear separation between read intelligence bundles and write mutation pathways.

### Negative

- Bundle schema evolution requires careful versioning and compatibility discipline.
- Over-bundling can return more data than needed for narrow tasks.
- Cache behavior is currently request-level and idempotency-key-driven, not a full persistent intelligence cache.

## Rejected Alternatives

| Alternative                                                        | Why Rejected                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Keep only fine-grained CRUD-style tools                            | Higher call count and higher context assembly overhead for agents.                            |
| Delegate aggregation to model prompts only                         | Less deterministic and harder to validate or regression-test.                                 |
| Introduce complex persistent global intelligence cache immediately | Higher invalidation complexity and operational risk before proving bundle contract stability. |

## Migration Impact

- New bundle capabilities must define explicit response contracts and pass shared response-schema validation.
- Tool registration must stay centralized so discoverability and permission checks remain consistent.
- Future persistent intelligence caching can layer behind current bundle contracts without breaking tool callers.

## Rollback Plan

- Trigger: bundle outputs become unreliable or too expensive for operational budgets.
- Rollback action: direct agents to fine-grained read tools and temporarily disable affected bundle tools while preserving existing write safety controls.
- Data safety: no data-format migration is required because this decision concerns read orchestration and tool contracts.
- Risk: higher MCP call volume and increased prompt assembly overhead during fallback.

## Verification and Evidence

- `mcp/tools/index.ts`
- `mcp/tools/vault/get-session-prep-bundle.ts`
- `mcp/tools/vault/get-recap-generation-bundle.ts`
- `mcp/tools/vault/get-continuity-check-bundle.ts`
- `mcp/tools/vault/vault-intelligence.ts`
- `mcp/tools/shared/contracts.ts`
- `mcp/tools/shared/contract-server.ts`
- `docs/AGENTIC_NOTES_WORKFLOW.md`
