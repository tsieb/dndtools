# MCP Tool Reference

This document is the canonical tool inventory for the MCP sidecar.

- Source of truth for tool registration: `mcp/tools/index.ts`
- Contract definitions: `mcp/resources/shared/contracts.ts`
- Handler schema validation: per-tool Zod schema in `mcp/tools/**`

## Update Policy

When adding or changing a tool:

1. Update registration in `mcp/tools/index.ts`.
2. Update contract metadata in `mcp/resources/shared/contracts.ts`.
3. Add or update a dedicated test in `mcp/tools/**`.
4. If workflow behavior changes, update `docs/AGENTIC_NOTES_WORKFLOW.md`.

## Permission Classes

- `read`: Returns data without mutating vault state.
- `write`: Mutates vault state immediately.
- `staged_write`: Proposes changes for approval through staged storage.

## Retry Guidance

- Safe retries: `read` tools and idempotent `write` operations.
- Cautious retries: non-idempotent writes unless caller provides an idempotency key.

## Idempotency Guidance

- Required for non-idempotent write tools that may be retried by callers.
- Optional for pure reads and deterministic updates that can safely replay.
