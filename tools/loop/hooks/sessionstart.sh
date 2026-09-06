#!/usr/bin/env bash
# SessionStart hook: on compact|resume|fork re-inject the run journal, the agent's durable memory.
set -u
SRC="$(cat 2>/dev/null | tr -d '\000' | sed -nE 's/.*"source"[[:space:]]*:[[:space:]]*"([a-z]+)".*/\1/p' | head -1)"
J="${LOOP_JOURNAL:-}"
case "$SRC" in compact|resume|fork) ;; *) exit 0 ;; esac
if [ -n "$J" ] && [ -s "$J" ]; then BODY="$(cat "$J")"; else
  BODY="(The journal at ${J:-<unset>} is empty or missing. Recover from \`git status --porcelain\`, \`git diff --stat\`, \`git log --oneline -5\`, then rebuild it before doing anything else.)"; fi
CTX="## Recovered run state (source: $SRC)

You are mid-way through one run of the dndtools RC loop; your context was just $( [ "$SRC" = compact ] && echo compacted || echo resumed ).
Below is the journal YOU maintain at \`$J\`. Reconcile it against \`git status --porcelain\`, \`git diff --stat\`,
\`git log --oneline -5\` in the worktree and continue. Keep updating the journal.
Rules that survive: verify synchronously in the foreground; finish with green commits here; never push,
rebase, reset, amend or switch branches (unless the wrapper's message asked you to finish a rebase);
stay inside the story's Owns; \`pnpm format:fix:changed\` before committing.

--- BEGIN JOURNAL ---
$BODY
--- END JOURNAL ---"
python3 - "$CTX" <<'PY'
import json, sys
print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": sys.argv[1]}}))
PY
