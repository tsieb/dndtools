#!/usr/bin/env bash
# Codex CLI backend for run-loop.sh (same verbs as backend-claude.sh). Codex assigns its own thread
# id, read back from the JSONL stream by run-loop.sh (`"thread_id":"…"`), so new-sid prints nothing.
set -uo pipefail
common=(--json --dangerously-bypass-approvals-and-sandbox -c "model_reasoning_effort=\"${LOOP_EFFORT:-medium}\"" -m "${LOOP_MODEL:-gpt-5.6-sol}")
case "${1:-}" in
  start)  exec codex exec "${common[@]}" -C "$PWD" - < "$3" ;;
  resume) exec codex exec resume "$2" "${common[@]}" - < "$3" ;;
  new-sid) echo "" ;;
  *) echo "usage: $0 start|resume|new-sid" >&2; exit 2 ;;
esac
