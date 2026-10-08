# RC-WID-5.6 — Shipped home definitions round-trip byte-identically

## 2026-10-08

Started with a clean task worktree. No AGENTS.md files or dispatch Headroom tools
were available. Original command output is read directly; no additional agents.

The home definitions omit fields the builder emits: computedFields, token-derived
style.cssVariables and configurationSchema.properties. Align only homePart's
output, keeping other system definitions and persisted boards unchanged. Remove
the five repaid ledger entries without weakening the checker. Add a first-builder-trip
byte assertion for each home type and a core export/import/export test (the latter
is outside the owned source paths because the acceptance explicitly requires it).
Document the remaining debt. No changes to dispatcher controls or remote branches.

The first focused run identified one additional original-byte difference: home-create
and home-manage lacked dataQueries while the builder emits an empty array. Read the
original diff in /tmp/rcwid56-parity.log and added explicit empty queries in homePart.
The negative byte probe now mutates the original export directly, without first
normalising it through the builder. No builder implementation change was needed.

Final focused parity: 41/41 passed (/tmp/rcwid56-parity-final.log). Core round-trip
and home preservation tests: 13/13 passed (/tmp/rcwid56-core-final.log). Typecheck
and ESLint for changed TypeScript files passed. Full pnpm test results follow below;
original logs are under /tmp/rcwid56-\*.log. Central wrapper gates and independent
review remain the operator's responsibility, as instructed.

Final full `pnpm test`: exit 0, 291 core files / 5,292 tests, 46 cloud files /
569 tests, 177 app files / 2,186 tests, 31 tooling files / 249 tests. Original
summaries inspected in `/tmp/rcwid56-test.log`. The full run began before the
empty-query correction; the affected core cases and final parity source were
also rerun afterward in the focused passes above. Typecheck exit 0, changed-file
ESLint exit 0, changed-file Prettier and `git diff --check` passed. All five
RC-WID-5.6 ledger entries are removed; the exact ledger test passes with only
RC-WID-5.7 debt remaining. No push, promotion, loop or control-state edits.
