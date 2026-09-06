#!/usr/bin/env bash
# Rehearsal backend: no model, no tokens. Makes one docs-only commit so the wrapper's gates,
# integration and accounting can be exercised end to end (`loopctl.sh dry-run`).
set -uo pipefail
case "${1:-}" in
  start|resume)
    f="docs/planning/LOOP_DRYRUN.md"
    { echo "# Loop dry-run"; echo; echo "- $(date -Is) slot ${LOOP_SLOT:-?} rehearsed a run for ${LOOP_ITEM_ID:-?}"; } >> "$f"
    git add "$f" && git commit -q -m "chore(loop): dry-run commit for ${LOOP_ITEM_ID:-?}" -m "Fake backend, no model involved."
    echo '{"type":"result","is_error":false,"result":"fake run done","total_cost_usd":0,"num_turns":1,"duration_ms":10,"usage":{"input_tokens":0,"output_tokens":0},"modelUsage":{}}'
    ;;
  new-sid) uuidgen ;;
  *) exit 2 ;;
esac
