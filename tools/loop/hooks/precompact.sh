#!/usr/bin/env bash
# PreCompact hook: what this prints becomes the compaction's custom instructions.
set -u
cat <<'TXT'
You are compacting one run of the dndtools RC loop. The run is NOT finished: it must still verify
and commit. Optimize the summary for continuing the job, not describing it. Dense checklist, no prose.

PRESERVE verbatim: (1) the story id(s), title, size, Owns and Acceptance lines; (2) the ledger —
every finding/decision with `file:line` and STATUS (PENDING/DONE/REJECTED(why)); (3) every file
edited and what changed, precisely enough not to redo or revert it, plus commits made (sha +
subject); (4) tests added and whether each RAN and PASSED; (5) the exact gate commands already run,
their exit status, and which still need to run — a gate is void once any file changed after it;
(6) the remaining ordered steps to a green commit; (7) the absolute path of the journal, and the
standing rules: verify synchronously in the foreground, never push/rebase/reset/amend/switch
branches, stay inside the story's Owns, run `pnpm format:fix:changed` before committing, end with
`git commit` in this worktree.

DISCARD: raw file contents and diffs (keep file:line), subagent transcripts (keep distilled
findings), verbose test output (keep pass/fail counts and failing test names), search results already
acted on, dead ends (one line each).
TXT
