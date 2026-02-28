# Agentic Notes Workflow

This guide defines the MCP workflow for AI-assisted vault operations.

## 1. Server Startup

From repo root:

- Development:
  - `pnpm mcp:dev <ABSOLUTE_VAULT_PATH>`
- Production bundle:
  - `pnpm mcp:build`
  - `node mcp/dist/index.cjs <ABSOLUTE_VAULT_PATH>`

Default vault resolution in `mcp/index.ts`:

1. `process.argv[2]`
2. `DNDTOOLS_VAULT`
3. `./vault`

## 2. MCP Modes

- Staged mode (default): writes become pending changes requiring approval.
- Direct mode: pass `--direct` or set `DNDTOOLS_MCP_STAGED=0`.

Recommendation:

- use staged mode for agent-driven edits in real vaults.
- use direct mode only for controlled automation/test contexts.

## 3. Generic MCP Client Config

```json
{
	"mcpServers": {
		"dndtools": {
			"command": "node",
			"args": ["C:/path/to/dndtools/mcp/dist/index.cjs", "C:/path/to/vault"]
		}
	}
}
```

## 4. Tool Contract (Current)

### Notes

- `list_notes`
- `read_note`
- `create_note`
- `update_note`
- `delete_note`
- `restore_note`

### Search

- `search_notes`
- `get_backlinks`
- `get_tags`

### Vault

- `get_vault_summary`
- `get_campaign_health`
- `get_coverage_gaps`
- `get_stale_notes`
- `get_session_prep_bundle`
- `get_recap_generation_bundle`
- `get_continuity_check_bundle`
- `get_folder_tree`
- `get_recent_activity`
- `get_link_graph`
- `vault_health_check`

### Session Boards

- `list_session_boards`
- `create_session_board`
- `update_session_board`
- `delete_session_board`
- `suggest_related_board_notes`

### Objects

- `list_objects`
- `read_object`
- `create_stat_block_object`
- `create_character_object`
- `create_image_object`
- `create_character_sheet_note`
- `create_stat_block_note`
- `update_object`
- `delete_object`
- `embed_object_in_note`
- `embed_note_in_note`
- `import_image_note`

## 5. Resource Contract (Current)

- Canonical URI set (stable, versioned):
  - `dndtools://v1/notes/{id}`
  - `dndtools://v1/vault/structure`
  - `dndtools://v1/vault/tags`
  - `dndtools://v1/resources/catalog`
- Backward-compatible legacy aliases are still registered:
  - `note://{id}`
  - `vault://structure`
  - `vault://tags`
- Discoverability metadata is available in the resource catalog:
  - handler: `mcp/resources/resource-catalog.ts`
  - strategy constants: `mcp/resources/uri-strategy.ts`

## 6. Recommended Agent Execution Sequence

1. Discover baseline:
   - `get_vault_summary`, `get_campaign_health`, `get_coverage_gaps`
2. Select task bundle:
   - session prep: `get_session_prep_bundle`
   - recap generation: `get_recap_generation_bundle`
   - continuity audit: `get_continuity_check_bundle`
3. Inspect scoped notes:
   - `search_notes`, `read_note`, `get_backlinks`
4. Mutate only after reads:
   - `create_note` / `update_note` / object or board write tools
5. Validate and close:
   - `get_link_graph`, `vault_health_check`
   - staged mode approval in Settings MCP tab

## 7. Prompt Contract (Strict)

Use this structure:

```text
TASK: <objective>
VAULT_SCOPE: <folder/path or entire vault>
ALLOWED_ACTIONS: <read|create|update|delete-soft|restore>
CONSTRAINTS:
- Preserve valid YAML frontmatter.
- Preserve existing wikilinks unless explicitly asked.
- Return changed note ids/titles and unresolved questions.
```

### 7.1 Task Prompt Templates

Session prep (read-only):

```text
TASK: Prepare next session brief
VAULT_SCOPE: /campaign
ALLOWED_ACTIONS: read
CONSTRAINTS:
- Start with get_session_prep_bundle and get_campaign_health.
- Cite note ids for every claim.
- Call out high severity coverage gaps before drafting prep bullets.
```

Recap generation (read-only draft):

```text
TASK: Draft recap from last session updates
VAULT_SCOPE: /campaign
ALLOWED_ACTIONS: read
CONSTRAINTS:
- Use get_recap_generation_bundle since <ISO timestamp>.
- Do not invent events not present in changed notes/objects/boards.
- Return unresolved continuity questions as a separate list.
```

Safe edit pass (staged writes):

```text
TASK: Normalize stale NPC notes
VAULT_SCOPE: /campaign/npcs
ALLOWED_ACTIONS: read|update
CONSTRAINTS:
- Read note before each update.
- Keep wikilinks and frontmatter valid.
- Use idempotencyKey on retries.
- Summarize changed note ids/titles and why each edit was needed.
```

## 8. Safety Requirements

- default to soft delete, not permanent delete
- avoid bulk destructive operations without explicit user intent
- keep edits idempotent where possible
- return explicit summaries of created/updated/deleted notes
- block write execution when `get_campaign_health` reports `needs_attention` unless user explicitly overrides

## 9. Tool Permissions and Retry Safety

Tool permissions are enforced server-side:

- `read-only`: no mutations, available in all modes
- `write-staged`: allowed in staged and direct modes
- `write-direct`: blocked in staged mode; requires direct mode

Retry guidance:

- idempotent tools: safe to retry directly
- non-idempotent tools: pass `idempotencyKey` on retries
- if `MCP_PERMISSION_DENIED` is returned for direct-write tools, restart MCP with `--direct`

## 10. MCP Inspector

Inspector workflow is documented in:

- `docs/MCP_INSPECTOR_WORKFLOW.md`

This flow is tied to the runtime model in:

- `docs/ARCHITECTURE.md` section 1.3 and section 5.

## 11. Known Gaps

`TODO(APP):` Add end-to-end test coverage for staged MCP approval workflows.
Reason: backlog item tracked for planned implementation.
Target: see the surrounding section and referenced files in this block.
Risk: quality and behavior drift if deferred.
