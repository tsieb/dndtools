# RC-ENG-3.2 runtime performance recovery

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

## Final local acceptance

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
