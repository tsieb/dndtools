# MCP Inspector Workflow

This guide defines the repository-standard workflow for inspecting the DND Tools MCP server with the MCP Inspector.

## 1. Architecture Context

Relevant runtime components:

- MCP entrypoint: `mcp/index.ts`
- Tool registration: `mcp/tools/index.ts`
- Resource registration: `mcp/resources/index.ts`
- Storage adapters:
  - direct writes: `mcp/storage.ts`
  - staged writes: `mcp/staged-storage.ts`

Runtime model alignment:

- staged mode is default and matches production safety posture.
- direct mode is for controlled write testing only.

## 2. Prerequisites

- install dependencies: `pnpm install`
- choose a vault path:
  - existing vault
  - local default: `<repo>/vault`

## 3. Launch Inspector

From repository root:

- staged mode (recommended):
  - `pnpm mcp:inspect -- <ABSOLUTE_VAULT_PATH>`
- direct mode (write-direct tools enabled):
  - `pnpm mcp:inspect -- <ABSOLUTE_VAULT_PATH> --direct`

Notes:

- `pnpm mcp:inspect` runs `npx @modelcontextprotocol/inspector tsx mcp/index.ts`.
- first path argument is resolved by `mcp/index.ts` as `process.argv[2]`.

## 4. Verification Checklist

After connecting in Inspector:

1. Confirm resource discovery:
   - read `dndtools://v1/resources/catalog`
2. Confirm baseline read tools:
   - run `get_vault_summary`
   - run `get_campaign_health`
   - run `get_link_graph`
3. Confirm task bundles:
   - run `get_session_prep_bundle`
   - run `get_recap_generation_bundle`
   - run `get_continuity_check_bundle`
4. Confirm staged/direct permissions:
   - in staged mode, verify a `write-direct` tool returns `MCP_PERMISSION_DENIED`
   - in direct mode, verify the same tool executes successfully

## 5. Debugging Patterns

- invalid input:
  - tools return `MCP_INVALID_INPUT` envelope with hint text
- permission issues:
  - `MCP_PERMISSION_DENIED` indicates mode mismatch (`staged` vs required `write-direct`)
- contract failures:
  - `MCP_RESPONSE_SCHEMA_INVALID` indicates tool output drift from `mcp/tools/shared/contracts.ts`
- resource contract failures:
  - verify response against `mcp/resources/shared/contracts.ts`

## 6. Safe Operating Defaults

- default to staged mode for real vaults
- run read bundles before any write tool
- use `idempotencyKey` for retrying non-idempotent writes
- keep Inspector sessions scoped to explicit vault paths
