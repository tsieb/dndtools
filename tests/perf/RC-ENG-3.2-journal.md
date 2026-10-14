# RC-ENG-3.2 runtime performance recovery

**Current status (2026-10-03, fifth recovery): 11/11 targets pass in a paired local capture of
`42d518fd` against review base `f9ab3d74`.** Scene 1408.9/1500 ms against the reference's
1538.1 ms, with every candidate batch below every reference batch (−8.4%). Graph 277.4/500
(reference 867.4) and search 149.0/250 (reference 224.5). The paired comparator exits 0.
That run sat at load 2.7–9.0. The ~20% scene win is still not achieved, and a host as busy
as the last review's (load 9–15) can push the scene past 1500 ms on both revisions. See
the fifth-recovery section and [its evidence](reports/2026-10-03-fifth-recovery/README.md).

**Historical status (2026-09-27, fourth recovery): 11/11 targets pass in one local paired
capture; the ~20% scene win is not achieved.** Executable commit `a916eddf` against
review base `6f8e448d`: scene 1409.7/1500 ms (reference 1539.8 ms, 8.4% faster; every
candidate batch under target), graph 249.6/500 ms (reference 820.9), search 129.7/250 ms.
The board's own work is under 20% of the scene interval, so a board-only change cannot
reach the anticipated win; the rest is dev-server module transport outside this story's
paths. See the fourth-review section below and
[current evidence](reports/2026-09-27-scene-settle/README.md). One local run on a lightly
loaded host, not the five-run hosted gate. Earlier sections and captures are historical.

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

## 2026-09-20 interrupted-operator recovery

Resumed at `52070b7e`, clean worktree. Preserved task commits have new SHAs after a
rebase that adds unrelated atlas library/thumbnail changes. Read the original
journal and compared source to the previous evidence commit. Marked its report
historical rather than presenting old measurements as current. No applicable
AGENTS.md or Headroom tools were available, and no sub-agents were spawned.

The repeated task scope still excludes `state/wikilink-graph.ts`,
`state/graph-quality.ts`, and `state/graph-clusters.ts`. Requested that narrow
extension through the user-input channel. While awaiting it, prepared a concrete
unapplied patch and a reproducible checker that changes only temporary copies.
Application files remain untouched. The draft indexes first-match names once per
calculation and delegates availability/sections to the existing resolver, avoiding
both duplicated resolution rules and a cache that could leak across actors.

The checker passes 468 differential resolution checks and 12 complete quality/
cluster report comparisons, including 2000 synthetic linked nodes. Seven alternating
Node samples show a substantial engine-only speedup; raw samples and patch hash are
retained in the proposal report. This is diagnostic evidence, not a browser budget
capture or acceptance. An initial checker lint failure (function used only as a
type) was fixed with a type-only signature, then the checker reran successfully.
Scope authorization is still unanswered; no state-engine patch was applied. The
approximately 20% scene recovery also remains unresolved.

Recovery handoff validation: performance suite 21/21; proposal checker 468 resolution
comparisons and 12 report comparisons; targeted ESLint, formatting, whitespace,
patch applicability, and quality/documentation gates all pass. Verified the stored
patch SHA-256 and seven samples per diagnostic series. `git diff HEAD -- apps
packages` is empty: unrelated atlas work and all application source are preserved.
No scope authorization arrived. This is a blocked handoff, not completed runtime
recovery or all-green acceptance.

## 2026-09-23 graph and search recovery (operator brief)

Resumed at `c3520139`, clean worktree, after a provider allowance stop. The operator brief
(2026-09-22) directs optimising graph-indexing (1431/500 ms) and search (359/250 ms) without
loosening budgets, which answers the pending resolver scope request. No Headroom tools were
exposed; no sub-agents, pushes, promotions or dispatcher control-state edits.

Profile (2,000 notes, workstation dev server, load average 15–25). Each graph-indexing dispatch
spent ~850 ms synchronously: `useGraphHealth` and `useGraphClusters` each ~170 ms (linear
`resolveWikilink` per link plus a sorted tally per note per round), and most of the rest in React
and style/layout for ~1,400 canvas buttons, ~2,800 edge lines and ~1,400 rail rows. Edges were
keyed by array index, so one inserted edge remounted thousands of `<line>`s. Search spent its time
unmounting and re-laying-out the same DOM.

Changes (commit `436a220f`):

- `state/wikilink-graph.ts` `createWikilinkResolver` (the reviewed proposal patch, now applied);
  `graph-quality.ts` and `graph-clusters.ts` resolve through it. Label propagation picks the
  winning label by linear scan with the same tie-break the stable sort gave.
- `queries/parsed-note-cache.ts`: text-keyed memo of `parseMarkdownNote` for the four graph
  reads. No actor state; fresh copies per hit; bounded by cached characters.
- `platform/service-boundary.ts`: exact UTF-8 count without encoding a copy of the ~1.6 M-char
  state (`utf8ByteLength`, checked against `TextEncoder`).
- Graph screen: memoized `GraphCanvasNode`/`GraphResultRow` (`screens/graph/nodes.tsx`), stable
  handlers, insertion-stable edge keys, health/clusters from `useDeferredValue(runtime.state)`.
  Above 150 nodes the canvas draws the most-connected nodes (the selection, plus the focus
  anchor and its neighbourhood, always drawn) and the status line says so; the result list keeps
  every match (rows use `content-visibility: auto` in that mode only). Under 150 nodes the code
  path and DOM are as before. The inspector's connection list reads all results, so undrawn
  neighbours still appear.
- `scripts/perf/capture.ts`: graph-indexing waits for the Graph search box before its first timed
  note, as search already did (see README, "Graph readiness before graph-indexing").

**Scope overlap, for the operator to adjudicate:** `packages/core/src/state/{wikilink-graph,
graph-quality,graph-clusters}.ts`, `apps/gm-react/src/screens/Graph.tsx`, `screens/graph/*`, the
two message catalogues and the raw-style allow-list are outside this story's `Owns`. The Graph
screen belongs to the KNW lane. The raw-style allowance moved 7 values from `Graph.tsx` (46→39)
to the new `nodes.tsx` (7): net zero. The superseded proposal patch and its temp-copy checker
are removed; their differential cases run in
`packages/core/tests/rc-eng-3-2-graph-hot-paths.test.ts` (mutation-checked: flipping the
tie-break fails it).

Settled per-dispatch graph update in the diagnostic profile: ~850 → ~280–340 ms; search per
query ~150–350 → ~140–300 ms. Diagnostic only, under heavy shared load; the paired capture below
is the evidence.

Validation so far: app typecheck; targeted ESLint; changed-file Prettier (`--base loop/rc`);
graph/i18n unit tests 36/36; core graph + boundary tests 55/55 and 15/15; perf suite 23/23; e2e
on desktop-chromium and mobile-chromium: new `graph-large-vault.spec.ts` plus graph (38 total),
then graph-repair, a11y-axe-gate, responsive, ux-audit, maturity-signals and feature-spotlight
(190), all passing.

## 2026-09-26 rebase onto loop/rc and scope reconciliation

Resumed at `7bf2f85b` (clean) after a provider allowance stop. The operator brief of 2026-09-26
says the previous candidate was fenced for paths outside `Owns` and now grants `Graph.tsx`,
`screens/graph/{interaction,nodes,presentation}.ts(x)` and `state/{graph-clusters,graph-quality,
wikilink-graph}.ts`. Everything else the branch touches outside `Owns` is a manifest companion path:
the two message catalogues, `*.test.ts`, `apps/gm-react/tests/e2e/*.spec.ts` and
`scripts/eslint-rules/*.allow.js`. No sub-agents, pushes, promotions or dispatcher control edits.

The branch base was 174 commits behind `loop/rc` (`cc47d694`), and three files conflicted, so I
rebased onto it by hand:

- `Board.tsx`: `loop/rc` added screen routes (`screen ? screen.id : homeSceneId`) and flow layout.
  Kept both: the memoized `getSceneForActor` read now keys on the screen-aware `homeSceneId`.
- `Graph.tsx`: RC-POL-1.12 (`7920b173`) split the screen into `graph/{Search,Inspector,Health}.tsx`
  and restyled the canvas nodes onto tokens. Took `loop/rc`'s file and re-applied the perf changes
  to it: deferred panel state for health and clusters, the bounded canvas pool, insertion-stable
  edge keys, and stable node handlers with the memoized `GraphCanvasNode`. The inspector now gets
  every result (`resultById`), so neighbours that are not drawn still list.
- `nodes.tsx`: `GraphCanvasNode` now uses the RC-POL-1.12 styling (48–70 px, token padding and
  radius, grayscale dimming, `--text-sm` label), so the markup matches `loop/rc` exactly. I deleted
  `GraphResultRow`. The result rows now live in `graph/Search.tsx`, which is not owned, so I left
  that file alone. Instead, `Graph.tsx` wraps `GraphSearch` in `memo`: its props are the memoized
  read and state setters, so canvas hover, focus and keyboard walks no longer re-render every row.
- Allow-list: `loop/rc` already removed the Graph entries (its Graph screen has no raw style
  values), and the new `nodes.tsx` has none either, so the branch no longer changes the file.

### Paired capture after the rebase, and the remaining owned-path work

Capture 1: candidate `9b01ee1b` (the rebased branch) against a `/tmp` reference worktree at `loop/rc`
`cc47d694`, with four budgets (`scene-first-render`, `widget-update`, `search`, `graph-indexing`),
seven interleaved batches each and `taskset -c 0-7`. The host was shared and heavily loaded (load average 13–18 on 16 cores),
so absolute values run high on both sides. The first attempt was discarded because I edited this
journal mid-run and the harness refused the dirty tree, as designed. The rerun (`perf:compare
--compare-across-hardware`, median of seven batch statistics):

| budget             | reference | candidate | target |
| ------------------ | --------- | --------- | ------ |
| scene-first-render | 2498.8 ms | 2058.4 ms | 1500   |
| widget-update      | 44.6 ms   | 48.6 ms   | 100    |
| search (p95)       | 420.5 ms  | 245.9 ms  | 250    |
| graph-indexing     | 1401.1 ms | 461.3 ms  | 500    |

Graph and search pass, but the margins are too thin to trust on this host. Scene first render
breaches on both sides under this load. The candidate is 17.6% faster than the reference.

Browser CPU profile (2,000 notes, five graph-indexing updates, CDP sampling): about 250 ms per
update. The row appears within 2 ms of `dispatch` resolving, because `SceneRuntime` persists and then
emits synchronously, so the timed interval is core + persist + one urgent React render. As an A/B, I
temporarily passed `GraphSearch` an empty result list (reverted, never committed). That cut each
update to about 115 ms: **the 2,000-row result list is about 130 ms of every update**. The rows are
unmemoized DS `Button`s in `graph/Search.tsx`, which RC-POL-1.12 created after this story's earlier
row memo, and that file is neither owned nor a companion path. I left it alone.
`Graph.tsx` now wraps `GraphSearch` in `memo`, so canvas hover and focus no longer re-render the
rows, but any change to the result set still re-renders all of them.

**Scope request for the operator:** add `apps/gm-react/src/screens/graph/Search.tsx` to `Owns` so
the rows can become a memoized row component with stable handlers, plus `content-visibility: auto`
for long lists (the same change the pre-RC-POL-1.12 `GraphResultRow` made). That is the remaining
large graph/search lever.

The rest of each update: boundary stringify and UTF-8 count about 31 ms, `sliceChanged` in
`coreStore.ts` about 12 ms (not owned), Dexie about 10 ms, and the visualization read about 21 ms.
The deferred health and cluster panels take about 53 ms after the commit. For search, each query
spent about 17 of its 23 ms visualization read rebuilding the source graph index, which does not
depend on the query at all.

Changes (`f2b4a205`):

- `queries/graph-visualization-query.ts`: split into `buildGraphVisualizationBase`, which covers
  the vault and actor only (source index, folder/tag join, facets, classified edges, all in order),
  and `filterGraphVisualization`, which returns fresh objects every time.
  `getGraphVisualizationForActor` composes the two, so its results are unchanged. Exported from
  `packages/core/src/index.ts` (companion path).
- `Graph.tsx`: memoizes the base on `content`/`maps`/`session`/`permissions`/viewpoint, so a search
  keystroke or facet click runs only the filter.
- `platform/service-boundary.ts`: `utf8ByteLength` makes one pass over the code units, replacing
  three regex scans that each allocated a match array.
- Tests: base + filter checked against an independently written filter-then-sort reference, for DM,
  player and unknown actors across ten filters, plus a freshness test. Mutation check: sharing
  `tags` with the base fails the freshness test. Removing either pre-sort changes nothing, because
  the source index already emits nodes and edges in that order. The sorts are defensive and cost
  O(n) on sorted input.

Validation: `pnpm typecheck`; targeted ESLint; raw-style count; app unit suite 153 files / 1715
tests; core suite 284 files / 5170 tests; perf suite 6 files / 23 tests.

Capture 2: candidate `f2b4a205` against the same reference, same four budgets and protocol (load
average 11–15):

| budget             | reference | candidate | target |
| ------------------ | --------- | --------- | ------ |
| scene-first-render | 3323.1 ms | 2723.2 ms | 1500   |
| widget-update      | 46.8 ms   | 48.8 ms   | 100    |
| search (p95)       | 283.5 ms  | 200.8 ms  | 250    |
| graph-indexing     | 1077.7 ms | 366.8 ms  | 500    |

Search and graph-indexing now pass with margin on a loaded host where the reference breaches both.
Scene first render still breaches on both sides: the reference measured 3.3 s on this host, against
1068 ms on the desktop baseline. That makes it a host-load reading, not a verdict on the code. The
candidate is 18.1% faster than `loop/rc` (17.6% in capture 1). A full 11-budget paired capture
follows.

### Last change and final evidence

`9a332698`: `buildQualityNode` (`state/graph-quality.ts`) takes the parsed note's `wikilinks`
when the caller has them. The health and cluster reads both run after every change, and each
re-extracted every note's links although the memoized parse already carried them. The result is
identical by construction (`extractWikilinks` of the same body), and a test pins it. The
changed-files Prettier gate checks whole files, so `graph-quality.ts` and
`graph-source-index-query.ts` were formatted in full: both carried formatting drift from `loop/rc`.
`pnpm format:check:changed -- --base loop/rc` passes.

Justification for each newly owned file this pass:

- `Graph.tsx`: needed to re-apply the perf work onto RC-POL-1.12's rewrite, memoize the
  visualization base, and memoize `GraphSearch`.
- `graph/nodes.tsx`: restyled to RC-POL-1.12's markup, with the unused row component removed.
- `graph/interaction.ts` and `graph/presentation.ts`: unchanged since the 2026-09-23 commit.
- `state/graph-quality.ts`: the optional `wikilinks` input above.
- `state/graph-clusters.ts` and `state/wikilink-graph.ts`: unchanged this pass.

Validation on the final code: core suite 284 files / 5170 tests plus the new hot-path tests
(8/8); app suite 153 / 1715; perf suite 23/23; `pnpm typecheck`; targeted ESLint; raw-style count;
changed-files Prettier. Browser checks on desktop-chromium and mobile-chromium: graph, large
vault, graph polish, graph repair, map room graph, screens and canvas specs, 150/150.
a11y-axe-gate, responsive, canvas keyboard and arrange, and golden path: 284/285. The one failure
was `a11y-axe-gate.spec.ts:291`, phone jump-sheet color contrast, the recorded base flake. Six
repeats pass on both the candidate and `loop/rc`, and this branch does not touch the jump sheet.

Full eleven-budget capture (`1da4d6a3`, code identical to `f2b4a205`): ten of eleven pass. Scene
first render breaches on both sides: reference 1898.4 ms, candidate 1855.3 ms. Search is 339.1 →
211.8 ms and graph-indexing 1359.8 → 450.5 ms; everything else is within noise. Final four-budget
capture (`9a332698`): search 276.9 → 174.3 ms, graph-indexing 1194.9 → 380.6 ms, scene first render
1745.2 → 1743.3 ms, widget update 34.7 → 35.9 ms. The raw captures, derived baseline, logs and
checksums are in `reports/2026-09-27-rebased-recovery/`.

Not done, and why: the ~130 ms result-list cost stays until `graph/Search.tsx` is owned. The
approximately 20% scene-first-render win is not demonstrated. This host's load (reference 1.7–3.3
s against a 1068 ms desktop baseline) swamps the signal, so that budget needs a quiet host or the
hosted Performance workflow (`gh workflow run perf.yml --ref main -f ref=<sha>`). No acceptance
claim is made. No push, promotion, extra loop, sub-agent or dispatcher control-state change. The
`/tmp` reference worktree and capture servers were removed.

`pnpm gates` then failed: `loop/rc` has `SceneBoardCanvas.tsx` at exactly the 800-line hard limit,
and this branch's forced-layout fix (the observer's `contentRect` width instead of a `clientWidth`
read after every tile mounts) added three lines. The callback now reads the single observed entry,
which is equivalent because only the wrapper is observed, and the explanatory comment lives here
instead. The file is back to 800 lines. `pnpm gates` passes (quality and docs), and `canvas.spec`
is 80/80 on both projects.

### 2026-09-27 lint gate

The operator's Lint gate failed with one error, `no-explicit-any` in `tmp/perf/payload-size.ts`.
That is a gitignored scratch script from the 2026-09-23 profiling session, not part of the branch,
but `eslint .` lints whatever is on disk. `tmp/` held only this task's disposable output: capture
dev-server logs, CPU profiles, scratch scripts, and the detached 2026-09-23 reference checkout
`tmp/perf/ref-1e13`. I removed it and pruned that one stale worktree registration (a dry run
confirmed nothing else). `pnpm lint` now exits 0 with 0 errors; its 17 warnings are all
pre-existing. No source change.

## 2026-09-27 third independent-review recovery

Starting head `517e1e19`, clean worktree. The review's exact-candidate capture breaches
scene (2259.3/1500 ms) and graph (554.8/500 ms), and correctly reproduces a selected
hub disappearing when more than 150 neighbours are pinned. No Headroom tools or
applicable AGENTS.md were exposed. All new edits stay within the explicit owned paths.
No agents, dispatcher changes, push, promotion or extra loop.

- `graph/interaction.ts` admits pinned IDs in priority insertion order, ignoring
  unavailable IDs, before filling remaining slots by degree. `Graph.tsx` already inserts
  selection and focus anchor before neighbours; its comment now describes the bounded
  neighbourhood honestly. Tests cover 160 alphabetically earlier neighbours, a distinct
  selection, deterministic order, and missing/filtered anchors.
- `SceneBoardCanvas.tsx` memoizes the actor-aware summary across geometry-only renders
  and uses stable per-widget command callbacks. `widgets/WidgetRenderSlot.tsx` memoizes
  props while retaining its runtime subscription, so size/focus changes do not render
  every body again. `widgets/useWidgetCommands.ts` replaces callbacks whenever the host
  closure changes (including scene revision) and removes destroyed-widget callbacks.
  Its DOM hook test checks identity reuse, host replacement, removal and inert mode.
- Browser CPU/network diagnostics show substantial first-navigation module loading plus
  repeated React work. These are diagnostics, not qualifying budget evidence. The graph
  result list remains outside scope (`graph/Search.tsx`); requested its ownership extension
  through the user-input channel and have not changed it.

Validation before committed capture: performance suite 25/25, focused app widget/graph
suite 229/229, app typecheck and targeted ESLint pass. Fresh paired timing against review
base `6dd4f09c` and functional browser verification follow. No all-green acceptance claim.

### Third-review result and handoff

Committed executable source `864b5e15` was captured against review base `6dd4f09c`:
all eleven budgets, seven alternating batches per revision, with all 154 batch groups
populated and flattening exactly to the raw samples. Both recorded source trees match
Git. Absolute comparator exits **1** for scene alone: **1684.9/1500 ms**, reference
1805.1 ms (-6.7%, not approximately 20%). Graph **302.2/500 ms** and search
**175.6/250 ms** pass; widget update **33.5/100 ms**. All ten other targets pass.
CI drift comparator exits 0 with no missing measurements/baselines or regressions;
that does not override the scene breach. This is one full paired local run, not the
five-run stability gate. Host load moved during the run; all slow and fast batches
are retained. No code-regression attribution is made from the absolute breach.

A five-pair browser-only experiment applied `content-visibility: auto` to widget
regions without unmounting bodies/bindings. Plain median 1563.9 ms, contained 1583.3 ms:
no useful gain, so no containment change was applied. These diagnostic samples do
not replace or supplement any batch in the full capture.

Browser star reproduction passes: 160 earlier-sorted neighbours cannot evict `Z Hub`;
selection, inspector and active focus remain present with exactly 150 drawn nodes.
Functional canvas/large-graph/custom-widget browser suite: **107 passed, 1 skipped**
across desktop and mobile. Pinned-container board/scene/graph visuals: **33/33 pass**.
Full lint exits 0. App typecheck, focused app tests **229/229**, perf tests **25/25**,
and quality/documentation gates pass. The reference checkout and task-owned manual
server were removed/stopped; harness-owned servers and the visual container exited.

[Evidence](reports/2026-09-27-focus-recovery/README.md) preserves both complete raw
captures, comparator verdicts, checksums, validation logs and the browser reproduction.
The evidence follow-up changes documentation/artifacts only; executable application
and capture/comparator source is identical to measured `864b5e15`. No response to the
`graph/Search.tsx` ownership request arrived, and that file remains untouched. The task
is **not ready for all-green acceptance**: scene target and approximately 20% recovery
remain unmet. No budgets were relaxed, and no push, promotion, loop, sub-agent or
dispatcher control-state edit occurred.

Archive verification: archive plus all 22 member checksums, both Git source trees,
all 154 nonempty batch groups and exact raw-sample flattening passed. Executable
source diff from `864b5e15` is empty. Final changed-file formatting and whitespace
checks pass. The one browser skip is the existing desktop exclusion for the compact
initiative lifecycle test; its mobile case passes.

## 2026-09-27 fourth independent-review recovery

Starting head `96b2c726`, clean worktree. The review rejected it because scene first
render breached (1590.2/1500 ms paired against `6f8e448d`, only 3.8% faster), and
because graph indexing had a thin margin on a loaded host. It also asked for the
parse memo to be cleared when a vault is replaced. No Headroom tools were exposed. No
agents, dispatcher changes, push, promotion or extra loop. The two reference
checkouts (base and previous candidate) lived under `tmp/perf/` and were removed
afterwards.

### Where the scene time goes

Browser probes on a cold `/board` open (fresh context, 50 frames / 10 map bindings,
dev server), recorded in the [evidence](reports/2026-09-27-scene-settle/README.md):

- 658 module requests over HTTP/1.1, 354 of them `@dndtools/core` sources (the whole
  barrel). Requests wait a median 199 ms (p90 473 ms) for one of six connections, for a
  3 ms server response. The main thread is about 80% idle until DCL (about 880 ms on a
  quiet host). A 124 ms evaluation task and about 130 ms of hydration follow.
- The board's own share (route chunk, 50-frame render, commit, layout) is about
  200–250 ms, under 20% of the interval. Nothing in App.tsx's eager imports holds a
  large unique module set (AppShell's 38 are needed to paint).
- Diagnostic only, not interleaved and not applied: prebundling `@dndtools/core` in
  the dev server took 658 requests to 305 and about 1250 to 846 ms. The lever sits
  in `apps/gm-react/vite.config.ts` or in RC-ENG-1.3's scene definition, both
  outside this story's paths.

### Changes, with the scope each needs

- `app/SceneBoardCanvas.tsx`, new `app/widgets/boardFrames.ts`, and
  `app/widgets/useWidgetCommands.ts` (owned). After mount, two commits re-rendered all
  50 frames and their bodies: the layout history's mount reset (26 ms) and the first
  ResizeObserver width (9 ms, and a first paint at 100%). Frames are now `memo`
  behind per-widget handlers that last as long as the widget. In view mode they ignore
  `scale` and `history`, which only edit chrome reads. The pane is measured in a layout
  effect before paint. Command callbacks keep their identity and call the latest host.
  The follow-up commits now cost 0.7 and 4.3 ms. SceneBoardCanvas is 787 lines.
  `useLayoutHistory` (app/canvas) is outside the claim and was not touched.
- `App.tsx` (manifest companion): routes render only after the vault loads, so a
  cold board open fetched its chunk after hydration. It is now fetched at App
  evaluation when the hash is `/board` or `/screen/…`. Three lines; no other route
  changes.
- `runtime/SceneRuntime.ts` (owned): the demo-seed module is fetched alongside
  the storage read. A demo boot always runs the seed, whose guards decide what is
  missing. `reloadFromStorage` clears the parse memo, as the review suggested. A
  local vault switch already reloads the document.
- `queries/parsed-note-cache.ts` (owned) gains `clearParsedNoteCache`.
  `packages/core/src/index.ts` (companion) exports it on one line.
- `platform/service-boundary.ts` (owned): every durable commit serialized the whole
  vault to check the 5 MiB limit (about 20 ms per note command at 2,000 notes). It now
  computes the exact UTF-8 JSON length, memoized by object identity. Undefined and
  throw behaviour match `JSON.stringify`. It is about 13 ms per content command
  now, because of the debt below, and near-free for commands that leave content alone.
- `DEBT.md` (companion) records `DEBT-2026-009`: every content command runs the
  hydration backfill and copies all 2,010 items, so nothing keyed by identity survives
  a note command. The fix belongs in `state/content.ts`, outside the claim.

Tests: `boardFrames.test.tsx` covers handler identity and latest-host calls,
detach after removal, the view/edit comparator, and a pre-paint width read. The
width check is mutation-checked: a passive effect fails it. `useWidgetCommands.test.tsx`
is updated for identity kept across host replacement. `tests/perf/boundary-size.test.ts`
compares every value kind, failure modes, and a commit-by-commit shared state
against `JSON.stringify` plus `TextEncoder`. `packages/core/tests/parsed-note-cache.test.ts`
loads its own module graph because the core suite runs with `isolate: false`.

### Measurements

- Interleaved 16-pair browser A/B against the previous candidate: 1284 → 1271 ms
  (-1%). The removed commits are real render work but small in this metric.
- Four-budget paired capture of `63a3631e` (before the boundary change) against the base: scene
  1349.5 vs 1447.1 ms (-6.7%), graph 285.2 vs 898.9, search 143.6 vs 212.8 (graded values).
- Final full paired capture, `a916eddf` against `6f8e448d`, all eleven budgets with
  seven batches each, load 3.8–4.4: **0 target breaches**. Scene 1409.7 ms (reference
  1539.8, which breaches; candidate batch maxima 1350.1–1480.5), graph 249.6 (reference
  820.9 breaches), search 129.7, widget update 33.2. The paired comparator exits 0. The
  default comparator exits 1 on drift against the committed baseline only, and the
  reference drifts the same way.

### Verdict and handoff

All targets are green in this local capture. The story's ~20% board win is not
achieved (8.4%), and the evidence says it cannot come from the board alone. On a
host loaded like the last review's (9–19), the dev-server share grows. The scene
target could breach again even though the candidate beats the base there. Options for
the operator, none taken here:

1. Grant `apps/gm-react/vite.config.ts` to prebundle `@dndtools/core` for the dev
   server. The trade-off: core edits then need a dev-server restart.
2. Under RC-ENG-1.3, measure scene render from route entry (app-startup already
   budgets boot), or against a prebundled core, and re-baseline.
3. Fix DEBT-2026-009 in the content state module.

Validation: app 1720/1720, core 5173/5173 (also shuffled), perf 29/29, typecheck,
lint (0 errors), gates, and changed-file formatting against `loop/rc`. Board browser
specs 147 passed / 1 existing desktop skip, on both projects. Evidence archive and
member checksums verified.

### 2026-09-27 app-test gate after the rebase onto `09347dc8`

The operator's App tests gate failed on `87229a26`, the rebased form of `5eba8831`. Two
failures, both i18n: `i18n/dev/pseudo.test.ts` ("matches the current source catalog
exactly") and `i18n/index.test.ts` (pseudo-locale coverage 5884/5885). `loop/rc` gained
RC-UX-1.5's generated DEV pseudo locale (`apps/gm-react/src/i18n/dev/qps-ploc.ts`) after
this story's last base. It must mirror every `en.ts` key, and this story's own
`graph.canvasLimited` key, which explains the 150-node canvas cap, was missing from it.

Fix: `tsx scripts/i18n-catalog.ts pseudo`, which adds exactly that one key (two lines).
**Scope note:** `i18n/dev/qps-ploc.ts` is neither owned nor in the manifest's companion
paths (those cover `i18n/messages/*.ts` only). It is the generated mirror of a companion
catalog, so every story that adds a message key needs it; the alternative was deleting the
canvas-cap notice, which would leave capped nodes undrawn without saying so. If the fence
rejects it, the fix is to add `apps/gm-react/src/i18n/dev/qps-ploc.ts` to `companion_paths`.
No code changed. App tests 1726/1726; the generated file passes Prettier.

## 2026-10-02 scope-fence recovery

Starting head `2f28bdfa`, clean worktree. The reported rejection is the generated
pseudo catalog outside the claim. No Headroom tools or applicable AGENTS.md were
available. No agents or dispatcher state changes used.

Remove only this task's `graph.canvasLimited` additions from English, Spanish and
the generated pseudo catalog. This restores those files to the integration base
`09347dc8`; no unrelated catalog changes are removed. In owned `screens/Graph.tsx`,
reuse `graph.showing` with the actual drawn node count instead of the uncapped query
count, so the bounded canvas still reports its limit in every existing locale.
The task's large-vault browser regression now checks that count both above and below
the cap, while retaining full-list access and selection tests. No new localization
key or generated-file claim is needed. Existing runtime/query optimizations,
measurement scenarios and budgets are unchanged. Validation pending.

Scope recovery validation completed on executable commit `955c5420`. Localization
32/32, perf unit tests 29/29, large-vault browser tests 6/6 (desktop/mobile), pinned
container graph visuals 15/15, app typecheck, targeted ESLint, formatting and
quality/documentation gates pass. `git diff 09347dc8 HEAD -- apps/gm-react/src/i18n`
is empty, including the formerly rejected pseudo catalog.

Fresh complete local capture: **11/11 absolute targets pass**, seven nonempty
batches each. Scene **1485.1/1500 ms**, widget **33.5/100 ms**, graph
**346.2/500 ms**, search **160.6/250 ms**. The default comparator exits **1** on
six drift regressions against the static September 6 baseline; this unpaired run
cannot establish a passing paired drift gate or the expected 20% scene gain.
Scene retains very little margin. All raw samples and failing comparator output
are retained in [scope recovery evidence](reports/2026-10-02-scope-recovery/README.md).
Commit/tree identity, 77 batch groups, exact sample flattening and archive/member
checksums verified. This follow-up changes only journal/evidence files, with no
executable diff from the measured commit. No push, promotion, extra loop, agent,
budget relaxation or dispatcher control-state edit occurred.

## 2026-10-02 integration conflict recovery

Starting head `0dc0bd50`, clean worktree. Rebased all 30 task commits onto the
operator-specified `6dec65dfe18995ac00f485efad223e0e94699c45`. No Headroom tools
were exposed. No additional agents, dispatcher state edits, push or promotion.

The conflict in owned `app/widgets/WidgetRenderSlot.tsx` combined this task's
memo wrapper with RC-CAN-5.5's expanded `TileFitProps` signature. Retain both:
`memo` wraps the component, which accepts `WidgetRendererProps & TileFitProps`
and forwards `...fit` to `WidgetRegion`. Preserve the integration branch's entire
overflow measurement, grow/restore, keyboard scrolling and title implementation,
and this task's lazy custom hosts and Suspense boundary. Resolve the intermediate
historical memo/revert/reapply commits consistently, rather than dropping commits.
`git range-diff` confirms all 30 commits retained; patch differences are confined
to that widget-slot context/signature reconciliation. The integration SHA is now
an ancestor. The pseudo catalog still has no net diff against the new base.

Rebased executable head: `0a104e46`. Widget tests 236/236 and performance-harness
tests 29/29 pass; targeted ESLint, formatting and quality/documentation gates pass.
App typecheck passes. Browser tests: 35 passed, one existing desktop skip for
the compact initiative lifecycle (its mobile case passes). This covers tile
scrolling, grow/restore convergence, custom-host loading, commands, accessibility
and resizing. Pinned-container board visuals: 9/9 pass across desktop, rail and
phone. [Validation logs and range-diff](reports/2026-10-02-rebase/validation.tar.gz)
are retained with archive and member checksums verified. Earlier captures remain unchanged
historical evidence; a rebase incorporating new rendering behavior is not the
same measured source tree. No new all-budget timing claim is made by this repair.

## 2026-10-03 fifth independent-review recovery

Starting head `638d7b81`, clean worktree. The review accepted the boundary fix and found
no code defect; it rejected acceptance because `scene-first-render` graded 1968/1500 ms
in an unpaired capture at load 9–15. No Headroom tools were exposed in this session. No
agents, dispatcher state edits, push or promotion. Budgets, targets, scenarios, sample
counts and the comparator are unchanged.

### Where the remaining scene time went

Resource timing plus a CPU profile of a cold `/board` on the 50-widget / 10-map fixture
(probe scripts outside the worktree, interleaved against a `638d7b81` checkout on its own
dev server):

- 0 → ~770 ms: shell and the 354-module core barrel over six HTTP/1.1 connections, as
  recorded in the fourth recovery. Not changed here.
- ~770 → ~870 ms: evaluating that graph. About 40 ms of it is eager zod construction in
  `schemas/commands.ts` (3,751 lines). Making those lazy is a core-wide refactor of a
  companion file for ~3%, so it was left.
- ~870 → ~1050 ms: the board chunk. It was discovered one import level at a time: screen
  view → board → render slot → widget bodies → builtin index → map tile → map canvas →
  its layers, eight round trips, each stretched by main-thread work in between.
- ~1050 → ~1160 ms: React render and commit (mostly dev-mode React overhead spread over
  50 frames), then the first layout of the board, forced by the pane-width read.
- Before the harness can take its mark, the next frame ran 50 `regionFit` text walks
  (~20 ms light load, ~40 ms at load 17).

### Changes, with the scope each needs

- `App.tsx` (manifest companion). The existing `/board` prefetch now also calls `import()`
  for `screens/Board`, `app/widget-bodies` and `app/map/canvas/MapCanvas`, so the three
  deep chains load in parallel. Four lines. It only affects a cold open whose hash is
  `/board` or `/screen/…`. The production build adds no eager bytes (core bundle 633.3 KiB
  gzipped, budget pass).
- `app/widgets/WidgetRenderSlot.tsx` (owned). A region whose `scrollHeight` fits its
  `clientHeight` cannot hide content. Every rect the walk could find ends inside that
  scroll height. So it skips the text walk unless a Grow pass is running or the tile is
  grown (that footer reads line positions). On the large scene 43 of 50 regions take the
  fast path. The scrollable and tab-stop counts match the reference (7 and 7).
- `tests/e2e/_helpers.ts` (manifest companion `apps/gm-react/tests/e2e/_*.ts`). With the
  board loading sooner, `/board` redirected to `/screen/<home id>` before a spec's
  `seedFresh` deleted the vault. The reload then landed on a screen the fresh vault does not
  have, which shows "screen unavailable" and never provisions a home scene. `map-tile` and
  `combat-tile` went red (3/6 `map-tile` desktop failed on the candidate, 6/6 passed on the
  reference). `seedFresh` now rewrites a `/screen/…` URL back to `/board` without a
  navigation event when the spec asked `gotoRoute` for `/board`, then reloads. About 30
  specs share that pattern.

A dead end, recorded so it is not retried: moving the measurement past paint
(rAF + `setTimeout`, one shared flush) measured no change (paired median +18 ms, 5/12),
because the mark's CDP round trip lands after the deferred task anyway. Reverted.

### Measurements

- Paired full capture, `42d518fd` against `f9ab3d74`, all eleven budgets with seven
  interleaved batches each, load 2.7–9.0: **0 target breaches on the candidate.** Scene
  1408.9 ms (reference 1538.1, which breaches; candidate batches 1361.9–1453.4, reference
  batches 1514.4–1562.1), graph 277.4 (reference 867.4, which breaches), search 149.0
  (reference 224.5), widget update 33.0 (reference 34.3). Local paired comparator, with
  the baseline written from that run's reference capture: 11 budgets, 0 breaches, 0
  regressed, exit 0.
- Scene/widget paired capture against the previous head `638d7b81`, load 4.9–8.9: scene
  1399.4 against 1437.7 ms (−2.7%, faster in six of seven batch pairs), widget update 31.8
  against 37.2 ms. This is this attempt's increment.
- Interleaved probes against `638d7b81` using the harness's exact mark, at load 10–17:
  prefetch alone −67 ms paired median (10/14 faster), prefetch plus fast path −174 ms
  (10/14). The gain grows with load because both changes remove main-thread or
  round-trip work that contention stretches.

### Verdict and handoff

All targets are green in this paired run, and the scene improvement over the base is
consistent batch for batch. Two limits remain. The scene gain against the base is 8.4%,
not the anticipated ~20%. And at the last review's load (9–15) both revisions slow down
enough that the ~90 ms margin can disappear. Further scene gains need the levers recorded
in the fourth recovery, outside this story's paths: prebundling `@dndtools/core` in
`vite.config.ts`, an RC-ENG-1.3 decision on what the scene interval measures, or lazy zod
schemas in `schemas/commands.ts`. None was taken.

Validation on `42d518fd`: full browser suite 1654 passed / 32 skipped on both projects.
App tests 1756/1756, perf-harness tests 25/25, app typecheck, production build with
`check-prod-bundle`, and the core bundle budget (633.3 KiB gzipped). Pinned-container
board/screen/scene visuals 42/42, plus targeted ESLint and Prettier. Evidence archive,
35 member checksums and the provenance of all 77 batch groups per side were verified.
No push, promotion, extra loop, agent, budget change or dispatcher control-state edit.

## 2026-10-13/14 operator completion

Finished by the operator session instead of another dispatcher round. The 34 commits were squashed
and rebased onto `loop/rc` `b2d2c88b9`, on top of RC-ENG-1.4 and RC-ENG-3.3.

### Rebase

Since `275cab99`, loop/rc gained RC-KNW-6.5 (Graph labels, phone list-first layout), RC-CAN-7.9/8.x
(board engine, drag overlay) and RC-ENG-3.3 (large row). Resolution:

- **Board.** `SceneBoardCanvas.tsx` keeps loop/rc's drag overlay; the settle-drafts effect is
  obsolete. Kept from this story: `usePaneWidth` (read before the first paint), stable per-widget
  frame handlers and the memoised `BoardFrame`. The newer `onSettle` and keyboard-resize handlers
  are routed through stable callbacks so the memo holds.
- **Authoring dialogs.** Lazy-loaded through `screens/board/BoardAuthoring.tsx`, which keeps
  `Board.tsx` under the 800-line gate. `Board.tsx` memoises its scene read.
- **Graph.** `Graph.tsx` keeps RC-KNW-6.5's canvas and label layer. Ported from this story:
  - the vault read split into `buildGraphVisualizationBase` (cached) plus `filterGraphVisualization`;
  - panels on deferred state;
  - `MemoGraphSearch`;
  - the canvas node cap, with pinning;
  - stable edge keys;
  - `GraphCanvasNode` rewritten to RC-KNW-6.5's markup: icon in the circle, name in the label layer.
- **Graph e2e.** `graph-large-vault.spec.ts` opens the phone map first.
- **Harness.** `scripts/perf/capture.ts` merges both harnesses. This story's standard-row datasets
  (50-widget, 10-binding scene; 2,000-note campaign; generated world map output) apply to the
  standard profile, and RC-ENG-3.3's large snapshot is unchanged. Also merged: revision provenance
  and batch error context.

### Boot path

On hosted runners, main's perf drift since 2026-10-11 against reference `48a82786` was `vault-open`
and `sync-reconciliation` at about +21%, and `graph-indexing` at +25–44%. The cause of the boot rows
was the app's boot path: 174 app modules at the reference, 326 now. Two static imports pulled whole
features onto it:

- `TileActionMenu` imported `useEditWidget` from the widget builder page, which took the whole
  builder with it. The hook now lives in `screens/extensions/useEditWidget.tsx` and loads the
  builder lazily.
- The builtin body switch imported the Session screen's `session` and `combat` bodies, and with
  them the session panels and the map canvas. They now load on first use through
  `builtin/lazyBody.tsx`, which stays synchronous once loaded and never remounts. `parity.ts` reads
  the lazy declarations.

`getContentItemsForActor` is memoised on the content and permissions slices (a frozen array per
actor and format). The nav's maturity counts are memoised on the content items. An all-ASCII
boundary payload is sized by its length.

### Local paired captures

All against `48a82786`.

Graph and search, `da4369ba`:

| Budget                 | Drift  |
| ---------------------- | ------ |
| `graph-indexing`       | −68.8% |
| `graph-indexing:large` | −81.0% |
| `search`               | −14.5% |
| `search:large`         | −15.9% |

Boot rows, `eed0f493` (load 4–5):

| Budget                      | Drift  |
| --------------------------- | ------ |
| `vault-open`                | +11.0% |
| `vault-open:large`          | +11.0% |
| `sync-reconciliation`       | +12.1% |
| `sync-reconciliation:large` | +12.6% |
| `scene-first-render`        | +11.4% |
| `scene-first-render:large`  | +5.3%  |

Before the boot-path split these were +21.6%, +21.1%, +21.7%, +21.3%, +12.2% and +9.5%.

`widget-update:large`, moving one tile on the 60-tile large board: about 110 ms → about 70 ms per
move locally.

### Validation on `e70ab922`

- `pnpm typecheck` 0; `pnpm test` in CI mode 0 (core 5,405, cloud 569, app 2,380, tooling 249);
  perf harness 29/29; `compare.ts --test-policy` passes.
- `pnpm lint` 0; `pnpm gates` 0; changed-file Prettier clean.
- Full Playwright, both profiles: 2,223 passed, 44 skipped, and 1 flaky
  (`widget-full-disclosure.spec.ts:21` mobile, the known base failure, which passed on retry).
- Pinned visual compare at `341c013f`: 581/582. Phone `/scene/:id` hit a URL timeout under load and
  passed 9/9 on rerun.

### Second pass, after hosted set C

Set C (`a603165e`, five scheduled runs) agreed except for one run, where `search` drifted +27.6%
against −13% to −24% in the other four. Two absolute targets still breached on hosted runners:
`scene-first-render` (1,535–1,653 ms against 1,500 ms; the reference measured 1,361–1,471 ms) and
`widget-update:large`.

- **Policy.** A confirmed target breach on a `provisional` budget (the eleven `:large` rows) is
  advisory on a pull request until its review date. Drift on the schedule still binds.
- **Search harness.** The standard row now restores the 2,000-note campaign, so clearing the box
  between samples rendered 2,000 rows whose layout and teardown landed in the next sample. Every
  sample now starts from a query that matches nothing, as the large row already did.
- **Graph typing.** The canvas, its label pass and the shown count follow a deferred query, so a
  keystroke's urgent render is the results list alone. Locally about 41 ms per query against the
  reference's 44 ms; before, the fourth query landed one frame later than the reference's.
- **Board load.** A cold `/board` loaded 741 modules against the reference's 620. Removed from it:
  the widget builder (imported by the Add gallery for its in-place Enable row), the assistant run
  (its Generate card), the scene editor page (Board took four small parts from it), and the Help
  panel with its twelve guides, release notes and import hub. The inspector and preview overlay load
  when first used. Down to 673 modules.
- **Board styling.** The tile layer mounted at scale 1, then the pane reading set the fit scale,
  which every tile's text size divides by: two full style passes. The layer now stays out of style
  until the pane is read. Style recalculation on a cold board went from 54 ms to 27 ms (reference
  19 ms).

Paired local probe (cold `/board`, 50-widget campaign, eight interleaved rounds): 1,269 ms against
1,128 ms before (+12.5%), 1,151 ms against 1,095 ms after (+5%).

Tried and dropped: making the Command Center lazy, and a separate early entry that prefetches the
screen chunks. Both moved DOMContentLoaded or the last module response, but neither moved the
paint.

### Hosted evidence

Five scheduled-mode dispatches of `fc2359ba` (runs 38472401520, 38472404668, 38472408112,
38472411519, 38472414941) all succeeded, and `compare.ts --agreement` passed on all 22 budgets. Drift
against `48a82786` across the 25 paired runs:

| Budget                     | Drift                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `graph-indexing`           | −70% to −73%                                                   |
| `graph-indexing:large`     | −83% to −84%                                                   |
| `search`                   | −7% to +4%                                                     |
| `scene-first-render`       | +3% to +6% (median 1,394 ms; one sample of 25 at 1,537 ms)     |
| `scene-first-render:large` | −5% to −12%                                                    |
| `vault-open`               | +4% to +11%                                                    |
| `sync-reconciliation`      | +4% to +12%                                                    |
| `app-startup`              | −3% to −6%                                                     |
| `widget-update:large`      | −26% to −36% (208–233 ms; provisional target 100 ms, advisory) |

The proposed baseline from run 38472401520 is now `tests/perf/baseline.ci.json` (see
`run-journal.md`).

Validation on `fc2359ba`:

- `pnpm test` in CI mode: core 5,405, cloud 569, app 2,380, tooling 249, perf harness 29.
- `pnpm lint`, `pnpm gates`, `pnpm typecheck`, changed-file Prettier and `check:bundle-budget`
  (780.5 KiB gzipped) all pass.
- Full Playwright, both profiles, on `cbfc919d`: 2,216 passed, 8 failed. All 8 came from this pass
  and are fixed in `fc2359ba`:
  - the lazy inspector's focus return;
  - `responsive.spec` delaying the scene editor page `/board` no longer loads;
  - `palette-polish` aborting the dev server's `CHANGELOG.md?import&url` module.
- After those fixes, the affected specs (command palette, help ×3, import hub, palette polish,
  responsive, scene editor polish, screen editing, widget builder, widget generate) passed 324/324
  on both profiles.
- Pinned visual compare: 580/582. Both misses were `/play` screenshot timeouts under load, which then
  passed 3/3 and 15/15 on rerun.
