#!/usr/bin/env bash
# Codex CLI backend for run-loop.sh (same verbs as backend-claude.sh). Codex assigns its own thread
# id, read back from the JSONL stream by run-loop.sh (`"thread_id":"…"`), so new-sid prints nothing.
set -uo pipefail
common=(--json --dangerously-bypass-approvals-and-sandbox -c "model_reasoning_effort=\"${LOOP_EFFORT:-medium}\"" -m "${LOOP_MODEL:-gpt-6-astra}")
native=()
if [ -n "${DISPATCH_PROJECT:-}" ] && [ "${DISPATCH_DISABLED:-0}" != 1 ]; then
  native=(python3 "$DISPATCH_HOME/dispatch.py" agent --backend codex --)
fi

case "${1:-}" in
  start)  exec "${native[@]}" codex exec "${common[@]}" -C "$PWD" - < "$3" ;;
  resume) exec "${native[@]}" codex exec resume "$2" "${common[@]}" - < "$3" ;;
  new-sid) echo "" ;;
  *) echo "usage: $0 start|resume|new-sid" >&2; exit 2 ;;
esac
