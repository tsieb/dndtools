> Central dispatcher migration (2026-09-08): this project now uses `../agent-dispatcher` for task selection, execution, controls, Git, review and the dashboard. The old supervisor/runner entrypoints are retired. Use `python3 ../agent-dispatcher/dispatch.py serve` or https://dispatcher.sieb.land. The documentation below records the former loop and its preserved evidence formats; it is not the active operating procedure.

# The RC loop

Any number of headless agents (Claude Code slots, Codex slots) work `docs/planning/RC_ROADMAP.md`
to Release Candidate 1, around the clock, each in its own worktree. One supervisor process hosts
the local dashboard, keeps the slots alive, and polls the plan allowances. The loop is tuned for
**tokens per validated function point**: the wrapper does everything that costs no model tokens
(gates, formatting, rebasing, promotion, status sync), routes small stories to small models, drops
unused MCP tool definitions from ordinary standalone turns, batches tiny stories, and stops claiming work before the
plan's 5-hour or weekly window would lock the owner out of interactive use.

The general pool includes **GPT-6 Astra** through Codex. **GPT-5.3-Codex-Spark** has its own
capability filter and allowance policy: its default weekly target is **100%**, with no interactive
reserve deducted from Spark. General Claude/Codex headroom remains configurable.

## Shared dispatcher

The sibling [Agent Dispatcher](../../../agent-dispatcher/README.md) provides the common dashboard
at `http://127.0.0.1:4990`, global/per-project start, pause and graceful stop, host-wide task/provider
limits, and shared heavy-job capacity. Its dndtools detail page retains this dashboard's workboard,
model/effort policy, quota controls, logs and promotion actions. The existing RC scheduler, gates,
saved slot choices, native sessions and salvage behavior remain owned here.

From the `agent-dispatcher` directory, run `python3 dispatch.py serve`, then
`python3 dispatch.py control all start` and `python3 dispatch.py control dndtools start` when ready.
Both global and individual project states initially default to stopped; starting all preserves each
project's choice. A global pause cannot be cleared by starting this project. Existing admitted work
drains after pause/stop. Drain the old supervisor before switching to shared supervision.

Updated runners automatically source the sibling integration when present. Shared mode adds scoped
Headroom read/search/command/retrieval tools to native Claude/Codex launches; native tools may bypass
compression, and wrapper gates still retain their exact output. The default profile requires the
pinned Headroom environment described in the common README. A standalone checkout still works when
the shared tool is absent; `DISPATCH_DISABLED=1` explicitly bypasses shared controls and limits.
The commands below remain the repository's native operations and project-specific controls.

## Start, stop, look

```bash
tools/loop/loopctl.sh install      # systemd user unit + lingering — once
tools/loop/loopctl.sh start        # supervisor: dashboard at http://127.0.0.1:4991, slots follow config
tools/loop/loopctl.sh status       # one-screen summary
tools/loop/loopctl.sh dry-run      # rehearse the wrapper with a fake agent — no tokens, real gates
tools/loop/loopctl.sh stop         # slots finish their run, then idle;  kill-all = now
tools/loop/loopctl.sh once 1       # one run of slot 1 in the foreground
tools/loop/loopctl.sh models       # available model IDs and their pickup switches
tools/loop/loopctl.sh model-disable gpt-5.3-codex-spark
tools/loop/loopctl.sh model-enable gpt-6-astra
tools/loop/loopctl.sh config '{"spark":{"weekly_target_pct":100,"max_slots":2}}'
```

Everything else — pause/resume, how many slots, which backend/model/effort per slot, routing by
size, phase gating, usage thresholds, promotion, skipping/pinning/blocking stories, killing a run,
reading a live agent log — is on the dashboard. It writes `config.json` in the control directory
(`~/Programming/dndtools-loop/`, `LOOP_CTL`); slots re-read it at every run.

The dashboard has five views: **Overview** (release progress, model switches, separate allowances,
next work and promotion), **Workers** (family/model/reasoning pins, size/lane filters, start/stop
and logs), **Workboard** (search, filters and story actions), **Activity** (metrics, run history and
events), and **Policy** (routing, quotas, gates and resource controls). Light/dark themes use the
frontend-design toolkit's shared OKLCH tokens. Forms retain unsaved edits during refresh, command
failures remain visible, and no external fonts or scripts are loaded.

## Model pickup and reasoning

New workers default to `backend: auto`. Existing workers keep their configured family; choose
**All enabled models** in Workers to include Codex. A `codex` worker may use Astra or Spark;
pinning Spark makes it a specialist worker. Global model switches apply to every pickup,
including pins, allowance fallbacks and recovered claims. Disabling a model does not terminate
an existing run. All switches off means idle, never a fallback to a disabled model.

For automatic workers, eligible Spark work is preferred. Otherwise odd-numbered workers prefer
Claude and even-numbered workers prefer Astra, falling back to an enabled model with capacity.
Claude soft limits count active Claude workers, rather than comparing the absolute worker ID.

| Astra work                 | Default reasoning |
| -------------------------- | ----------------- |
| Documentation              | `low`             |
| S                          | `medium`          |
| M                          | `high`            |
| L / XL                     | `xhigh`           |
| Retry / difficult recovery | `max`             |

`codex.reasoning` controls the table; `codex.effort` or a worker effort pin overrides it. General
Codex uses `gpt-6-astra`; the old `gpt-5.6-sol` config default migrates on load. Spark defaults to
`high` and accepts `low`, `medium`, `high`, `xhigh`. Astra additionally accepts `max`. Unsupported
efforts and model/backend combinations are rejected before saving. Values were checked against
the installed Codex model catalog, the [official model guide](https://learn.chatgpt.com/docs/models)
and [Astra reasoning reference](https://developers.openai.com/api/docs/models/gpt-6-astra).

### Spark's weekly work

Spark receives one S story per run, within `spark.max_owns` paths and `spark.max_prompt_chars`
brief characters. Configurable specialties are documentation, tests/fixtures, and localized code
with named tests or explicit test acceptance. It does not receive operator work, retries,
security/authentication, migrations, architecture, audits/reviews, or visual/screenshot work.
These restrictions also apply to pinned and recovered stories; an unsuccessful attempt goes
back to a general model. Phase, dependency, lane and owns-overlap rules still apply.

The read-only Codex app-server handshake retains distinct limit IDs, including null display
names and the legacy single-pool response. Missing or expired quota snapshots cannot authorize
Codex/Spark pickup. A full Spark pool does not block Astra, and a full general pool does not
block Spark. Rate-limit recovery uses the selected model's reset window.

Spark keeps picking suitable work through the last available percentage, up to the configured
weekly target and short-window ceiling (both default to 100%). One Spark worker is normally
allowed; when usage is behind linear weekly pace or reset is within a day, up to `spark.max_slots`
(default 2) may pick up suitable work. The dashboard shows remaining allowance, reset time,
required daily burn and suitable ready stories. **100% is a consumption target, not a guarantee**
if dependencies, disabled workers/models, the short-window limit, or a lack of suitable work
prevent it. The loop does not invent busywork or relax capability checks to consume quota.

| Path                             | What                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `wt-N/`                          | slot N's worktree, detached, reset to `origin/loop/rc` at every run                       |
| `state/items.json`               | every story's status, attempts, claim, outcome                                            |
| `state/runs.jsonl`               | one line per run: tokens in/out/cache, cost, seconds, model, outcome — the metrics source |
| `state/usage.json`               | the last allowance snapshot (Claude OAuth usage endpoint, Codex app-server)               |
| `state/slot-N/`                  | per-run item, prompt, journal, nudges, heartbeat                                          |
| `logs/slot-N/`                   | raw agent output (stream-json), gate output, rebase/push logs                             |
| `salvage/`, `salvage/*` branches | uncommitted or unverified work, never deleted by the loop                                 |
| `events.log`, `summary-N.log`    | the narrative                                                                             |
| `STOP`, `STOP-N`, `PAUSE`        | the switches (the dashboard flips them)                                                   |

## How a run goes

1. **Claim.** `rcloop.py claim` parses the roadmap at the integration HEAD (story bullets + the §23
   index → id, size, phase, deps, owns, acceptance, named e2e specs), applies the phase gate, the
   dependency graph, the lane cap and the owns-overlap check, ranks by phase → pinned → attempts
   → lane priority → how many stories it transitively unblocks (computed, so the critical path
   comes first), and checks the allowances: above the soft threshold only one Claude slot claims, above
   the hard threshold nobody does, and weekly burn ahead of linear pace throttles to one slot.
   Small stories in one lane with disjoint owns are batched (`batch_small`).
2. **Route.** Size → model/effort (`routing`), docs-only stories to the cheap model, a slot may pin
   a model; a model whose scoped weekly limit is exhausted falls back to another enabled model.
   Astra uses the reasoning table above; Spark's capability and quota checks also apply to recovery.
3. **Brief.** The worktree is reset; `prompts/worker.md` is rendered with the story text verbatim,
   the roadmap line ranges to read (not the whole file), the condensed guardrails, the gates, and
   what other slots hold. A journal outside the worktree is the agent's durable memory, re-injected
   after compaction and after every resume (`hooks/`).
4. **Work.** `claude -p` (stream-json, MCP off in standalone mode; scoped tools in shared mode) or `codex exec --json`. The attempt cap resumes the
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

## Machine budget

Vitest and Playwright both default to "use every core", and every slot runs both — the agent
while it works, the wrapper at the gates — so five slots once meant 80 Node forks, 40 Chromiums
and an ffmpeg per browser on a 16-core box. `config.resources` bounds that:

| Key                  | Default (16 cores) | What                                                                                                                                                       |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heavy_jobs`         | 2                  | verify/promotion gates running at the same time across ALL slots (flock semaphore on `state/heavy-N.lock`; a slot past it shows `queued` on the dashboard) |
| `test_workers`       | 3                  | Vitest forks per run — exported as `DNDTOOLS_TEST_WORKERS`, repeated as `--maxWorkers` on the gates                                                        |
| `pw_workers`         | 2                  | Playwright workers per slot run — exported as `DNDTOOLS_PW_WORKERS`, repeated as `--workers` on the named-spec gate                                        |
| `promote_pw_workers` | 4                  | the full-suite promotion gate's Playwright workers                                                                                                         |
| `nice`               | 10                 | the runner renices itself (agent, its commands, gates inherit); the unit also sets `Nice=10`                                                               |

The repo's `vitest.workers.ts` and `playwright.config.ts` read the two `DNDTOOLS_*_WORKERS`
variables, so the agent's own test runs are capped too, and video recording is off unless
`DNDTOOLS_E2E_VIDEO=1`. The briefing tells the agent to run only the named specs and the changed
package's unit suite; the full suite is the promotion gate's job. Edit `resources` in
`config.json`; slots pick it up at their next run (the runner itself needs a restart for a new
`run-loop.sh`).

## Token economics

The dashboard's metrics table groups `runs.jsonl` by model, size and lane: tokens per landed
function point (S=1, M=3, L=6), output tokens per FP, dollars per FP (list price, from the CLI's
own accounting), land rate, minutes per run. Tune `routing` against it: if `size:S` on sonnet lands
at a fraction of opus's tokens/FP, keep it; if its land rate collapses, move it up.

What the wrapper does so the model does not have to: install deps once per lockfile, all gates,
formatting, rebase/push, promotion, roadmap status sync, salvage. What the prompt does: story text
inline, line ranges instead of whole docs, "decide, don't ask", no default MCP in standalone mode,
scoped Headroom tools in shared mode, and no isolated-worktree subagents.

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
`claude-settings.json` (auto-compact on for loop runs + the hooks), `dashboard.html`, `dashboard.css`,
`dashboard.js`, `loopctl.sh`, and `tests/test_rcloop.py`.

Verification (no model calls or production worker starts):

```bash
python3 -m unittest tools/loop/tests/test_rcloop.py
node tools/loop/tests/test_dashboard.mjs
bash -n tools/loop/run-loop.sh tools/loop/loopctl.sh tools/loop/lib/backend-codex.sh
```

The browser test runs the real local HTTP handlers against temporary config, fake usage and
fixture logs. It covers all five views in both themes at desktop/mobile sizes, model toggles,
worker pins, policy persistence/failure recovery, story actions, keyboard-accessible logs, and
overflow. Screenshots go to `/tmp/rcloop-dashboard-review/`. Chromium and a loopback listener
must be available. After updating an installed loop, reload the supervisor and runners so the
new Python/HTTP handler and shell wrapper are used; preserve any existing STOP/PAUSE flags.
