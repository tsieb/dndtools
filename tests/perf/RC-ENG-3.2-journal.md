# RC-ENG-3.2 runtime performance recovery

**Current status (2026-09-27): graph and search recovered; scene first render unmet.** The branch
is rebased onto `loop/rc` `cc47d694`. In paired local captures against that commit, search and
graph-indexing pass in every run, while the reference breaches both
([evidence](reports/2026-09-27-rebased-recovery/README.md)). Scene first render breaches on both
sides on this loaded host, and its candidate/reference gap swung between −18% and 0%, so the
approximately 20% win is not demonstrated. The remaining large graph/search lever is the result
list in `graph/Search.tsx`, which is not owned; see the scope request below. Earlier sections are
historical.

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
