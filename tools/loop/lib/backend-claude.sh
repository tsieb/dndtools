#!/usr/bin/env bash
# Claude Code backend for run-loop.sh. Called with the worktree as the working directory.
#   backend-claude.sh start SID PROMPT_FILE      new headless session with this id
#   backend-claude.sh resume SID NUDGE_FILE      continue that session with a nudge
#   backend-claude.sh new-sid                    a fresh session id
# Output is stream-json: the final `result` event carries token usage and errors (rcloop.py result).
# MCP servers are dropped by default (LOOP_MCP=none): their tool definitions cost tokens on every turn.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
common=(--settings "$HERE/claude-settings.json" --permission-mode bypassPermissions --output-format stream-json --verbose
        --model "${LOOP_MODEL:-opus}" --effort "${LOOP_EFFORT:-medium}")
if [ "${LOOP_MCP:-none}" = none ]; then common+=(--strict-mcp-config --mcp-config '{"mcpServers":{}}'); fi
case "${1:-}" in
  start)  exec claude -p "$(cat "$3")" --session-id "$2" "${common[@]}" ;;
  resume) exec claude -p "$(cat "$3")" --resume "$2" "${common[@]}" ;;
  new-sid) uuidgen ;;
  *) echo "usage: $0 start|resume|new-sid" >&2; exit 2 ;;
esac
