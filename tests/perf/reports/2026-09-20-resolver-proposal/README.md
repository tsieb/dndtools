# RC-ENG-3.2 resolver scope handoff

**Blocked on scope authorization; acceptance is not met.** Recovery resumed at
`52070b7e` with a clean worktree. The preserved implementation was rebased onto
unrelated atlas changes, so the prior complete capture is historical. No current
browser-budget claim is made, and no additional full capture was run merely to
remeasure the unchanged graph bottleneck.

The task's repeated ownership list excludes the shared resolver and its two graph
callers. The scope request names exactly these files:

- `packages/core/src/state/wikilink-graph.ts`
- `packages/core/src/state/graph-quality.ts`
- `packages/core/src/state/graph-clusters.ts`

The [reviewable patch](../../../../scripts/perf/proposals/rc-eng-3.2-wikilink-index.patch)
is **not applied**. It builds a first-match normalized title/alias index once per
calculation, then delegates each lookup to the canonical resolver with its single
matching candidate. The canonical availability and section rules remain intact.
The index is local to the calculation; it is never cached across mutations or
actor changes. Both engines still receive only actor-filtered candidates.

The [checker](../../../../scripts/perf/check-resolver-proposal.ts) applies that patch
only to three regular temporary copies, checks that its destinations are exactly
the three expected files, and verifies that application source bytes remain
unchanged. Other imports reference the original source. Temporary copies are
removed afterward. `git apply --check` also succeeds against the current source.

## Diagnostic evidence, not acceptance evidence

[Raw diagnostics](diagnostic.json) retain the source commit, patch SHA-256 and all
seven alternating timing samples. The baseline commit identifies application
source only; this is a proposal experiment, not an immutable-candidate browser
capture. The checker passed **468** resolver comparisons and
**12** complete graph-report comparisons against the original code.
Cases include duplicate titles, an earlier alias matching a later title, whitespace
and case normalization, unavailable sources, section matches/misses, Unicode,
empty or restricted candidate sets, and rebuilding after candidate changes.

| Isolated 2000-note calculation | Original median | Proposed median |
| ------------------------------ | --------------: | --------------: |
| Graph quality                  |       87.953 ms |        2.478 ms |
| Clusters                       |       88.884 ms |         6.64 ms |

These are Node calculations over synthetic graph nodes, not real durable commands,
permission-query integration tests, browser rendering or measurements of the
500 ms graph budget. They support the proposed optimization but do not establish
all-green acceptance. The approximately 20% scene improvement remains unresolved.

Reproduce without changing the application:

```sh
pnpm exec tsx scripts/perf/check-resolver-proposal.ts
git apply --check scripts/perf/proposals/rc-eng-3.2-wikilink-index.patch
```

After the central operator authorizes/claims these three paths, apply the patch,
add integrated regression coverage, and run actual graph and scene captures before
attempting full acceptance. No budget, fixture size or tolerance was relaxed. No
push, promotion, additional loop, sub-agent or dispatcher-state edit was performed.

Handoff checks: existing performance suite **21/21**, checker comparisons above,
targeted ESLint, Prettier, whitespace, patch applicability, and repository
quality/documentation gates pass. Application source remains unchanged.
