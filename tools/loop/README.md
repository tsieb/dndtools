# The RC loop

Autonomous agents work `docs/planning/RC_ROADMAP.md` to Release Candidate 1, each in its own
worktree, integrating on `loop/rc` and promoting to `main`. Since 2026-09-08 task selection,
execution, controls, git, review, and the dashboard live in the sibling
[`../agent-dispatcher`](../../../agent-dispatcher/README.md) (`python3 dispatch.py serve`, then
`control all start` / `control dndtools start`; `DISPATCH_DISABLED=1` bypasses it). The old
supervisor and per-slot runner in this directory are retired stubs. What is still owned here:

- `rcloop.py`: the roadmap parser and the loop's brain (`claim`, `render`, `result`, `usage`,
  `roadmap-sync`, skip/pin/set). It reads story bullets and the §23 index (id, size, phase, deps,
  owns, acceptance, named e2e specs), applies the phase gate, dependency graph, lane cap, and
  owns-overlap check, ranks by how many stories a claim unblocks, and is the only thing that edits
  the repository (`roadmap-sync` rewrites the §23 Status column). Never edits anything else.
- `prompts/worker.md` and the three `nudge-*.md` prompts: the briefing rendered per story (story
  text verbatim, the roadmap line ranges to read, the condensed §0.3 guardrails at roadmap lines
  42–78, the gates, what other slots hold) and the resume, gates-failed, and rebase nudges. The
  journal outside the worktree is the agent's durable memory and is re-injected after compaction.
- `hooks/`, `claude-settings.json`: auto-compact and the journal hooks for headless runs.
- `tests/test_rcloop.py`, `tests/dashboard_fixture.py`: the parser and dispatcher tests.

Gates the wrapper re-runs on the committed tree, by what changed: Prettier on touched files,
typecheck and lint when code changed, the changed package's unit suite, the story's named e2e specs
plus specs sharing its owned paths and routes on both profiles, `build` for M/L, `feature-audit`
when screens or requirements changed. A failure wakes the agent one or two rounds, then the commits
are parked on `salvage/slotN-unverified-run-NNN`; dirty trees and unpushed HEADs are salvaged too,
never deleted. Every push to `loop/rc` also runs full CI. `SKIP <id>: reason` in a journal retires a
story an agent cannot do (money, accounts, prod); `PARTIAL` lands a green part; `HANDOFF` records a
change needed in a file the story does not own.

Machine budget: `DNDTOOLS_TEST_WORKERS`, `DNDTOOLS_PW_WORKERS`, and `DNDTOOLS_E2E_PORT` are set per
slot and honoured by `vitest.workers.ts` and `playwright.config.ts`; a slot runs only its named
specs, never the whole suite. Pass a free `DNDTOOLS_E2E_PORT` whenever running Playwright from a
worktree, because Playwright reuses whatever already listens on :5273.

Verification without model calls:

```bash
python3 -m unittest tools/loop/tests/test_rcloop.py
bash -n tools/loop/run-loop.sh tools/loop/loopctl.sh tools/loop/lib/backend-codex.sh
```
