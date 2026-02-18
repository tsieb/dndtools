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

- `note://{id}` style note resource (see `mcp/resources/note.ts`)
- vault structure resource
- vault tag resource

## 6. Recommended Agent Execution Sequence

1. Discover: `get_vault_summary`, `list_notes`, `search_notes`.
2. Inspect target notes with `read_note`.
3. Apply focused mutations with `create_note`/`update_note`.
4. Validate impact using `get_backlinks` and `get_link_graph`.
5. In staged mode, review and approve in app Settings MCP tab.

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

## 8. Safety Requirements

- default to soft delete, not permanent delete
- avoid bulk destructive operations without explicit user intent
- keep edits idempotent where possible
- return explicit summaries of created/updated/deleted notes

## 9. Known Gaps

`TODO(APP):` Document and enforce tool-level permissions (read-only, staged-write, direct-write).

`TODO(APP):` Add end-to-end test coverage for staged MCP approval workflows.

`TODO(APP):` Add examples for object/session-board workflows in this doc.
