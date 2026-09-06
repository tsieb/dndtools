# The RC loop

Any number of headless agents (Claude Code slots, Codex slots) work `docs/planning/RC_ROADMAP.md`
to Release Candidate 1, around the clock, each in its own worktree. One supervisor process hosts
the local dashboard, keeps the slots alive, and polls the plan allowances. The loop is tuned for
**tokens per validated function point**: the wrapper does everything that costs no model tokens
(gates, formatting, rebasing, promotion, status sync), routes small stories to small models, drops
MCP tool definitions from every turn, batches tiny stories, and stops claiming work before the
plan's 5-hour or weekly window would lock the owner out of interactive use.

## Start, stop, look

```bash
tools/loop/loopctl.sh install      # systemd user unit + lingering — once
tools/loop/loopctl.sh start        # supervisor: dashboard at http://127.0.0.1:4991, slots follow config
tools/loop/loopctl.sh status       # one-screen summary
tools/loop/loopctl.sh dry-run      # rehearse the wrapper with a fake agent — no tokens, real gates
tools/loop/loopctl.sh stop         # slots finish their run, then idle;  kill-all = now
tools/loop/loopctl.sh once 1       # one run of slot 1 in the foreground
```

Everything else — pause/resume, how many slots, which backend/model/effort per slot, routing by
size, phase gating, usage thresholds, promotion, skipping/pinning/blocking stories, killing a run,
reading a live agent log — is on the dashboard. It writes `config.json` in the control directory
(`~/Programming/dndtools-loop/`, `LOOP_CTL`); slots re-read it at every run.

| Path | What |
| --- | --- |
| `wt-N/` | slot N's worktree, detached, reset to `origin/loop/rc` at every run |
| `state/items.json` | every story's status, attempts, claim, outcome |
| `state/runs.jsonl` | one line per run: tokens in/out/cache, cost, seconds, model, outcome — the metrics source |
| `state/usage.json` | the last allowance snapshot (Claude OAuth usage endpoint, Codex app-server) |
| `state/slot-N/` | per-run item, prompt, journal, nudges, heartbeat |
| `logs/slot-N/` | raw agent output (stream-json), gate output, rebase/push logs |
| `salvage/`, `salvage/*` branches | uncommitted or unverified work, never deleted by the loop |
| `events.log`, `summary-N.log` | the narrative |
| `STOP`, `STOP-N`, `PAUSE` | the switches (the dashboard flips them) |

## How a run goes

1. **Claim.** `rcloop.py claim` parses the roadmap at the integration HEAD (story bullets + the §23
   index → id, size, phase, deps, owns, acceptance, named e2e specs), applies the phase gate, the
   dependency graph, the lane cap and the owns-overlap check, ranks by phase → pinned → attempts
   → lane priority → how many stories it transitively unblocks (computed, so the critical path
   comes first), and checks the allowances: above the soft threshold only slot 1 claims, above
   the hard threshold nobody does, and weekly burn ahead of linear pace throttles to one slot.
   Small stories in one lane with disjoint owns are batched (`batch_small`).
2. **Route.** Size → model/effort (`routing`), docs-only stories to the cheap model, a slot may pin
   a model; a model whose scoped weekly limit is exhausted falls back to another.
3. **Brief.** The worktree is reset; `prompts/worker.md` is rendered with the story text verbatim,
   the roadmap line ranges to read (not the whole file), the condensed guardrails, the gates, and
   what other slots hold. A journal outside the worktree is the agent's durable memory, re-injected
   after compaction and after every resume (`hooks/`).
4. **Work.** `claude -p` (stream-json, MCP off) or `codex exec --json`. The attempt cap resumes the
   same session. A usage limit mid-run: if nothing is committed and the reset is far, the story is
   handed back and the slot sleeps; otherwise the slot waits for the reset time (from the usage
   endpoint, not prose) and resumes.
5. **Verify** on the committed tree, by what changed: prettier on the touched files (committed as
   its own commit), typecheck + lint when code changed, `test:critical`/`test:app`/`test:cloud`/
   `test:tooling` by package, the story's named e2e specs on both Playwright profiles, `build` for
   M/L, `feature-audit` when screens or requirements changed. A failure wakes the agent (1–2 rounds
   by size); then the commits are parked on `salvage/slotN-unverified-run-NNN`.
6. **Integrate.** Rebase onto `origin/loop/rc` (conflict → the agent resolves it → gates again),
   push. The claim is released with the token accounting.
7. **Promote.** Every `promote_interval_s` (or "Promote now"), after the §23 status sync commit and
   the promotion gate (`e2e` = typecheck + build + full Playwright suite; `build`; `none`), `main`
   is fast-forwarded. CI and the dev deploy run on `main` only, so the integration branch is free.

`SKIP <id>: reason` in the journal retires a story the agent cannot do (money, accounts, prod);
`PARTIAL <id>: …` lands a green part and keeps the story open; `HANDOFF` lines go to the events.
A story that fails `give_up_after` runs is retired to `skipped(loop …)` — reopen it on the dashboard.

## Token economics

The dashboard's metrics table groups `runs.jsonl` by model, size and lane: tokens per landed
function point (S=1, M=3, L=6), output tokens per FP, dollars per FP (list price, from the CLI's
own accounting), land rate, minutes per run. Tune `routing` against it: if `size:S` on sonnet lands
at a fraction of opus's tokens/FP, keep it; if its land rate collapses, move it up.

What the wrapper does so the model does not have to: install deps once per lockfile, all gates,
formatting, rebase/push, promotion, roadmap status sync, salvage. What the prompt does: story text
inline, line ranges instead of whole docs, "decide, don't ask", no MCP, no isolated-worktree subagents.

## Safety model

- Agents edit and commit in their own worktree; the wrapper does every fetch/rebase/push. The
  owner's checkout is only ever `git worktree add`ed and fetched.
- Self-reports are not evidence: gates re-run in the wrapper; an agent that edits `tools/loop/` is
  refused.
- Nothing is destroyed: dirty trees → `salvage/slotN-wip-*` + patch; unpushed HEADs →
  `salvage/slotN-orphan-*`; unverified commits → `salvage/slotN-unverified-run-NNN`.
- The 5h/weekly thresholds leave headroom for interactive use; the IdlerGame loop draws on the same
  plan, so lower them (or pause that loop) when both run.
- Three runs in a row that land nothing back the slot off exponentially and post an event.

## Files

`rcloop.py` (parser, dispatcher, usage, render, result accounting, roadmap sync, dashboard +
supervisor), `run-loop.sh` (the per-slot runner), `lib/backend-*.sh`, `prompts/`, `hooks/`,
`claude-settings.json` (auto-compact on for loop runs + the hooks), `dashboard.html`, `loopctl.sh`,
`tests/test_rcloop.py` (`python3 -m unittest tools/loop/tests/test_rcloop.py`).
