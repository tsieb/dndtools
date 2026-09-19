# RC-ENG-3.2 runtime performance recovery

## 2026-09-19 implementation

Starting revision: `eafbce28`; clean task worktree. No applicable AGENTS.md or
Headroom tools were available. No agents or dispatcher control actions used.

Inspected both archived candidates: their single-commit demo seed optimization
is already present, as are the service-boundary UTF-8 fast path and suppression
of pending-only notifications. Preserve those changes. Add synchronous React
batching around the observable listener fanout; retain version advancement and
per-dispatch durable replication. Memoize Board's actor/permission-aware scene
query and defer the generator/manual widget editors until opened. No budget,
reference, comparison policy or measurement scenario changed.

Validation and timing results pending. A detached checkout of the starting
revision provides the unchanged-code reference for the interleaved comparison.
