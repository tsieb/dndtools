# RC-ENG-3.2 runtime performance recovery

**Current status: acceptance unmet; resolver scope extension pending.** The latest
[complete paired capture](reports/2026-09-19-runtime-second-review/README.md) has
10 passing targets and a graph breach at 1238.0/500 ms. Scene recovery is 2.3%,
short of approximately 20%. Search passes at 240.1/250 ms. Historical captures
below do not establish acceptance for the current tree.

## 2026-09-19 implementation

Starting revision: `eafbce28`; clean task worktree. No applicable AGENTS.md or
Headroom tools were available. No agents or dispatcher control actions used.

Inspected both archived candidates: their single-commit demo seed optimization
is already present, as are the service-boundary UTF-8 fast path and suppression
of pending-only notifications. Preserve those changes. Add synchronous React
batching around the observable listener fanout; retain version advancement and
per-dispatch durable replication. Memoize Board's actor/permission-aware scene
query and defer the generator/manual widget editors until opened. No budget,
reference, comparison policy or measurement scenario changed.

Validation and timing results pending. A detached checkout of the starting
revision provides the unchanged-code reference for the interleaved comparison.

Existing runtime serialization suite: 8/8 passed. Added regression coverage for
synchronous version/preview delivery, unsubscribe, per-command replication after
persistence, and rollback without replication. Perf config: 17/17 passed before
a type-only correction to the preview selection fixture (`role: 'player'`).
Targeted source ESLint and formatting passed. The supplemental large-scene
script uses 10 bound map tiles and 40 demo-derived tiles; it fails on rejected
fixture commands or missing rendered tiles and retains all seven paired samples.

The first complete capture finished but is **incomplete evidence**: reconciliation
hit the unchanged 30-second runtime-ready timeout, so both paired captures record
that budget unavailable. Baseline generation correctly refused it. All ten other
budgets have seven batches. Scene first render: 1084.9 -> 1046.8 ms; widget update:
16.8 -> 18.5 ms. These partial results do not establish all-green acceptance.
Logs show a pre-existing Graph font/lineHeight warning on both revisions; no
runtime error was exposed by the original timeout. Added failure-only diagnostics
(side, batch, reload, runtime load flags/error) without changing samples, timeout,
fixtures or grading. A targeted paired reconciliation run follows.

Shortened the new Board comment to remain below the 800-line hard limit; no
executable app change since the measured implementation. Perf tests rerun: 17/17
passed. Repository quality and documentation gates passed.

The targeted run reproduced failure on **reference batch 1, reload 5** with no
runtime instance. A standalone browser reproduction showed Chromium rejecting
module fetches with `net::ERR_INSUFFICIENT_RESOURCES`, leaving a blank document.
Waiting for network idle outside each timing interval did not resolve it (failed
on reload 4). This is not evidence of slow replay or a candidate regression.
Testing fresh pages within the same seeded browser context preserves IndexedDB
and the five measured reloads while releasing each previous page's resources.

Fresh-page reproduction: 12 consecutive measured reloads, zero failed requests.
The harness now releases each page between reconciliation samples but retains
the same seeded browser context/IndexedDB/cache. Each replacement is opened before
the next measured reload; neither setup nor cleanup enters the timing interval.
Seven batches, five reload samples per batch, targets and timeout are unchanged.
Both revisions use this same harness. No retry discards a failing timing sample.

Full app suite: **142 files / 1551 tests passed**. Perf suite after the harness
repair: **3 files / 17 tests passed**. Final harness lint then required preserving
caught errors with `cause`; that failure-diagnostic-only adjustment is pending the
final checks below. It does not change the measured path.

Supplemental scene capture: seven alternating pairs at 2x CPU throttle, after one
warmup per revision, all 50 widget frames and exactly 10 map bodies verified.
Median reference **1143.9 ms**, candidate **1102.0 ms** (**-3.7%**). The earlier
fixture attempt failed before recording samples because hydration auto-binds every
map tile; the corrected 40 remaining tiles use non-map demo types. This is a modest
incremental win on a base that already includes the archived seed optimization,
not a new 20% speedup. It is a persisted-vault reload, distinct from the standard
cold-context demo-first-render scenario.

Browser authoring check passed: zero generator/builder module requests before
opening; both dialogs load, open and close through Board's gallery, and the board
remains mounted. A first manual script forgot to reopen the gallery after closing
the builder; correcting that test sequence required no app change.

## Historical local acceptance

The fresh complete capture on `1e962b8e9644ba72d74723e1d83708f75837b6a9`
against starting revision `eafbce28a4f78231185cbf44ccbd603ad489415a`
completed with all **11 budgets / seven batches per revision** populated.
Both comparators exited 0: **zero target breaches, zero regressions, zero missing
measurements and zero missing baselines**. Scene first render is **1053.3 ms**
(target 1500), widget update **17.8 ms** (target 100), and reconciliation
**684.0 ms** (target 2000). All 35 reconciliation reloads per revision completed.
No previous failed run was spliced into this complete run.

[Evidence and reproduction commands](reports/2026-09-19-runtime-recovery/README.md)
include the exact raw captures and both verdict sets, the earlier failed captures,
and the supplemental scene samples. All 13 checksums (archive plus twelve members)
passed after extraction. Verified both source SHAs, all 154 batch groups, raw
sample flattening, numeric drift, and both all-pass verdict sets. Archive ownership
metadata is normalized, and the captures contain the sanitized `ci-runner` hostname.

Final validation: targeted ESLint (including preserved error causes) exit 0;
perf tests **17/17**; full app tests **1551/1551**; quality/documentation gates
exit 0; production build and production test-seam exclusion scan exit 0.
The final error-cause addition changes failure diagnostics only; measured app code,
measurement paths, budgets, pinned CI reference and comparison policy are unchanged.

This is workstation evidence using the task's starting revision for isolation,
not hosted CI or five-run stability evidence. Standard graph/search fixtures
remain 200 notes; no 2,000-note claim is made. The separate 50-widget / ten-map-binding
measurement is a 3.7% incremental win, not a newly achieved 20% reduction.
Central gates and independent review remain the operator's next steps.
No push, promotion, workflow dispatch, extra loop, dispatcher control-state edit,
or sub-agent was used.

Final artifact replay through the CI-mode comparator also exited 0. The changed-file
formatting gate and explicit Prettier checks on all nine changed text/source files
passed, as did the staged whitespace check. All twelve changed/new paths are within
the task claim. The clean temporary reference worktree was removed after capture.

## Review recovery, 2026-09-19

Review correctly identified that the archive predates the rebased application tree
and cannot establish acceptance for 3d73bff2. That archive is historical evidence.
The new reference is the actual integration base dda3120a56153caab48207c8937cda65454cd35b,
in an isolated detached checkout with frozen dependencies. No Headroom tools or
applicable AGENTS.md were exposed. No agents or control-state changes used.

Extending scene-first-render to a prepared 50-widget/10-binding campaign in NEW
browser contexts (IndexedDB snapshot, no page/module cache), and graph/search to
at least 2,000 linked notes. Setup rejects any failed fixture command. Initial
fixture diagnostics exposed a setup race before home creation, then a tsx named
function helper in page.evaluate; both were corrected before collecting samples.
Diagnostic runs with uncommitted harness changes are not acceptance evidence.
Fresh committed-code capture and grading remain pending.

Fresh complete capture of 9aef81b3 against dda3120a finished all eleven budgets,
seven alternating batches each. Source/tree checks passed with both checkouts
clean. Absolute comparator FAILS: search 306.7 ms / 250 ms and graph indexing
1209.4 ms / 500 ms at 2,000 notes. All nine other targets pass; no drift regression.
CI-only drift comparison passes but is NOT all-green acceptance. Large-scene
first navigation is 1081.4 ms versus 1134.7 ms (-4.7%), still short of ~20%.

Custom-host browser checks passed all five tests, including actual iframe code,
configuration changes, isolation and board resize. 36 widget unit tests, 18 perf
tests and application typecheck passed before the full capture.

An isolated seven-sample Node query profile on 2,000 linked notes shows median
visualization ~19.7 ms, health ~156.5 ms, clustering ~167.0 ms. The latter two
repeat linear wikilink lookup for every outbound edge; the canonical resolver is
packages/core/src/state/wikilink-graph.ts, outside this task's owned paths. A
narrow ownership extension has been requested before editing that engine.
Continuing the authorized scene path: memoize render slots and retain per-widget
command callbacks across canvas geometry/focus renders, refreshing them whenever
the host callback or widget set changes. Fresh measurements pending.

## Review recovery handoff

The memoization experiment 38fac4f0 completed seven paired batches for both scene
and widget update. Scene 1487.2 -> 1373.4 ms (-7.7%); widget 21.8 -> 20.6 ms.
It also fails the ~20% recovery expectation. Its five custom-widget browser tests
passed. Restored its two application files to 9aef81b3, retaining raw diagnostic
samples separately; no partial run was spliced into a complete run.

Final application and measurement scripts exactly match fully captured 9aef81b3.
The new [review evidence](reports/2026-09-19-runtime-review/README.md) retains all
11 budgets, explicit source trees, failed absolute verdicts, passing drift-only
verdicts, and the separate memo/query diagnostics. The historic archive remains
explicitly historical. The final source-diff and archive verification are checked
before commit. This task is **not ready for acceptance**: search 306.7/250 ms,
graph 1209.4/500 ms, and only 4.7% large-scene improvement. The requested core
resolver ownership extension remains pending; no out-of-claim engine change was
made. No dispatcher control state, remote branch, or promotion was touched.

Handoff verification: archive plus all twelve member checksums passed; both source
trees match Git; all 154 batch groups are populated and flatten exactly to their
raw samples; packaged paths are sanitized. Final executable source diff against
9aef81b3 is empty. Perf tests rerun 18/18; targeted ESLint and Prettier passed;
repository quality/documentation gates passed. Absolute-target comparator exit 1
is the retained, expected failure evidence; CI drift comparator exit 0 is recorded
separately and is not presented as acceptance.

## Scheduled lint repair after rebase

Starting head: a3c708013521a4b6a3886a72c9e699155b9972bb; worktree clean.
Read the original failed lint output from attempt
0e3a1e66-96c9-4651-b231-3ca8478f94c1. Its sole error was explicit `any` in the
previous diagnostic scratch file tmp/perf/profile-queries.ts:14. Git ignores that
file, but the repository-wide ESLint invocation still scans it. The other fifteen
ESLint findings were warnings. No Headroom tools were exposed.

Added the maintained scripts/perf/profile-queries.ts using Node's typed inspector
Promise API and output-directory creation. Replaced our leftover scratch copy with
that same lint-clean script, preserving its output files. Updated reproduction
instructions to use the maintained script rather than extracting the historical
scratch script from the evidence archive. Original archive bytes/checksums remain
unchanged. Marked the timing archive historical after the branch rebase: unrelated
application changes mean its original exact-source identity claim no longer applies
to the current candidate. Those changes were preserved.

Validation: full `pnpm lint` exited 0 (ESLint, boundary, emphasis and non-text
contrast); the maintained profiler exited 0 and produced seven positive finite
samples for each of three queries plus a populated CPU profile; targeted Prettier
passed. No app/runtime behavior changed in this lint repair, and no fresh browser
budget claim is made. Search/graph breaches and the missing ~20% scene win remain
acceptance gaps. Resolver scope extension remains pending; no out-of-claim engine
edit, push, promotion, additional loop, sub-agent or dispatcher-state edit occurred.

## Second independent-review recovery

Starting head: `24b6da0fd8846181018a80f57a3394a5efeea1b3`, clean worktree.
Fresh independent review establishes a graph breach (936.9/500 ms), search passing
(203.5/250 ms), and no full-candidate capture. Historical captures above do not
establish acceptance for this tree. No applicable AGENTS.md or Headroom tool was
available. The shared resolver and direct graph-engine callers remain outside the
owned paths; a narrow scope extension was requested through the active user-input
channel. Meanwhile, profiling the owned scene paths and checking in-scope query
opportunities. No budgets, thresholds, dispatcher state or remote refs changed.

The browser CPU profile identifies a forced `clientWidth` read in the canvas
resize effect (23.3 ms self time in one diagnostic sample). Consume the observer's
completed content-box measurement instead; the wrapper has no padding, so rounding
preserves the former clientWidth semantics. The graph capture now invalidates a
batch on command rejection or a render timeout, instead of dropping rejected
samples or recording a timeout as successful work. Three focused tests cover these
outcomes. The performance suite passes 21/21, targeted ESLint and app typecheck
exit 0, and quality/documentation gates exit 0. Full browser checks and exact-source
performance capture follow. No claim of graph recovery or a 20% scene win yet.

Final second-review capture: exact executable source `67b57da0` versus integration
base `e0d2031b`, 11 budgets and seven alternating batches per revision. All 154
batch groups populated and flatten exactly to the raw samples; both source trees
match Git. Absolute comparator exits 1 for graph alone: 1238.0/500 ms (reference
1167.5 ms). Search passes at 240.1/250 ms. Scene first render 1140.4 -> 1114.2 ms
(-2.3%) does not meet the requested approximately 20% recovery. Widget update is
18.3/100 ms. CI drift-only comparator exits 0 with no regressions, missing values
or missing baselines; that does not override the absolute failure.

Canvas browser suite: 82/82 passed across desktop/mobile. The final performance
suite has 21/21 passing tests, including real runtime notifications and graph
capture rejection/timeout checks. App typecheck, targeted ESLint and
quality/documentation gates passed. Archive retains all raw timings, both verdicts,
validation logs and explicit source/tree identities. The evidence-only follow-up
has no executable diff from the captured commit. No resolver scope approval
arrived, so the three state-engine files remain unchanged; graph recovery and the
approximately 20% scene win are still blocked/unresolved. No acceptance claim,
push, promotion, extra loop, sub-agent or dispatcher control-state change.

Archive verification passed: archive plus all 13 member checksums, sanitized paths,
source trees and batch/sample integrity. Final formatting and whitespace checks
passed. Quality/documentation gates reran successfully. The temporary reference
checkout and task-owned capture servers were removed/stopped.
