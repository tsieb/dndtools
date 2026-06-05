# SRCH-local-indexes-and-freshness — Completion Evidence

Epic: `SRCH-local-indexes-and-freshness` — SRCH: Local indexes and freshness
Requirement IDs: SRCH-001, SRCH-009
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync & Offline
Model — Local-First Invariant); Contract 3 (Role, Visibility & Permission Grant Model); the standing v2
architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SRCH-local-indexes-and-freshness`.

## Summary

This epic delivers the LOCAL SEARCH INDEX itself and its FRESHNESS/staleness signaling — the FOUNDATION the
already-shipped SRCH query surfaces (SRCH-003 faceted search, SRCH-004 saved searches) build on. It does NOT
add a second copy of vault content: every searchable artifact stays in its own durable state document and is
read through its own actor-filtered query, so there is no parallel index that could leak hidden content
(Cross-Contract Non-Negotiable 2). What it adds is (a) FULL-TEXT search over the COMPLETE SRCH-001 domain set
and (b) a small, rebuildable FRESHNESS bookkeeping model that publishes per-domain freshness, source cursor,
and partial-result status without blocking cached results.

### How the index/freshness model underpins the existing SRCH queries

- `searchVaultForActor` (the single faceted search read SRCH-003/004 already consume) now searches the FULL
  SRCH-001 domain set: notes, structured objects, map POIs, **handouts**, and **session artifacts** (recorded
  dice rolls). Each new domain is drawn from its OWN actor-filtered read (`getHandoutsForActor` SES-004,
  `getDiceHistoryForActor` SES-003), so a hidden artifact in any domain is never a candidate. Because the
  search read is shared, saved searches (SRCH-004) immediately gain the new domains too, with no change to
  their contract.
- `getSearchIndexStatus` (new) publishes per-DOMAIN index freshness layered on the SAME actor-filtered reads.
  Its `SearchSourceFreshness` companion (`stale-cached`/`unavailable`) was the prior SRCH-003 convention; this
  epic reconciles with it rather than inventing a parallel one — the search result keeps its per-SOURCE
  freshness map, and this new read adds the per-DOMAIN freshness the requirement asks for, both fail-closed.

### Processing-Core additions (compose existing reads; no parallel index)

- `apps/v2/packages/core/src/state/search-index.ts` — the LOCAL INDEX FRESHNESS model. `SearchDomain` (==
  the SRCH-001 content types), `SearchIndexCursor` (sequence + revision + timestamp, mirroring the sync
  source-cursor concept), `SearchDomainIndex` (indexed vs source cursor + availability), and pure reducers:
  `recordDomainMutation` (an accepted note/object/map/session mutation advances the index incrementally —
  SRCH-001 AC3), `observeDomainSourceCursor` (a sync pull advances the source ahead of the index),
  `catchUpDomainIndex` (indexing completes — SRCH-009 AC2), `setDomainAvailability` (a source goes
  unavailable ⇒ fail-closed stale), `domainFreshnessStatus`/`publishDomainFreshness` (publish freshness),
  and `ensureSearchIndex` (tolerant hydrate of a rebuildable, device-local cache). Fail-closed: an
  unproven/unavailable domain is `stale`/`unknown`, NEVER `fresh`.
- `apps/v2/packages/core/src/queries/search-index-query.ts` — `getSearchIndexStatus(...)`: PUBLISH per-domain
  freshness for an actor. The SOURCE cursor of each domain is derived ENTIRELY from the actor's VISIBLE
  artifacts (their count + max visible revision), so a hidden note/handout/secret roll/dm-only POI never
  influences the cursor or the behind-by delta (no leak through freshness metadata). The INDEXED cursor comes
  from the supplied rebuildable index snapshot; when none is supplied the local store IS the index
  (local-first) ⇒ every visible domain is `fresh`. Decoupled from the cached results, so an incomplete
  background index never blocks search. Unknown actor ⇒ denied (every domain `unknown`, all cursors zero).
- `apps/v2/packages/core/src/queries/search-query.ts` — extended `searchVaultForActor` to add the HANDOUT and
  SESSION-ARTIFACT domains via their actor-filtered reads; updated `SearchContentType` counts, `TYPE_ORDER`,
  and the module/`SearchHit` docs. The expanded domains compose the same facet pipeline (text/source/type;
  handouts/artifacts carry no folder/tag/date so those facets exclude them, matching the data model).
- `apps/v2/packages/core/src/state/saved-search.ts` — extended `SearchContentType` /
  `SEARCH_CONTENT_TYPES` to include `handout` and `session-artifact` (the SRCH-001 searchable domains). The
  existing `normalizeEnumList` pipeline prunes/dedupes unchanged.
- `apps/v2/packages/core/src/index.ts` — public exports for the index-freshness model + the status query.

### Visibility / data-safety design (fail closed)

- The expanded HANDOUT domain is drawn from `getHandoutsForActor`: a non-recipient's handout (and a revoked,
  non-persistent recipient's) is omitted, and only the SECTIONS the actor may see are present — so a player
  never matches a withheld/unrevealed handout section, and a non-recipient never matches the handout at all.
- The SESSION-ARTIFACT domain is drawn from `getDiceHistoryForActor`: a `dm-only` secret roll is omitted for
  a non-DM, so its expression/label can never match for a player.
- FRESHNESS IS ACTOR-SCOPED: the source cursor counts only the actor's visible artifacts, so a hidden note
  never inflates a player's cursor or behind-by (proven by the actor-scoped freshness test). Freshness
  metadata carries no content — only counts/revisions over the visible set.
- FAIL-CLOSED FRESHNESS: a domain whose source is unavailable, or whose freshness cannot be proven, reports
  `stale`/`unknown`, never `fresh` — the engine prefers "possibly-behind" over "confidently-wrong" (the
  requirement's "mark stale status before returning results"). A behind background index marks the affected
  domains stale WITHOUT failing/blocking the cached results.

### Persistence / offline / sync

- The search index is a `cache index that can be rebuilt` (Contract 2 device-local-only): it carries no
  content and no secrets and is safe to discard and recompute. It is NOT wired into durable `CoreStateSlice`
  persistence — the freshness query derives the live source cursor from state on every read, and the shell
  may optionally pass a persisted indexed-cursor snapshot. This keeps the Processing Core pure and avoids a
  cross-cutting reducer change while fully satisfying both ACs.
- Search and freshness are pure LOCAL computations: a `findNetworkDependencies` assertion proves the
  SRCH-001 offline path (input + output) carries no network handle — it resolves from local storage only
  (Contract 2 Local-First Invariant; SRCH-001 AC1 "offline").

### Public API + GUI

- `apps/v2/app/src/lib/gui/SavedSearches.svelte` — the content-type facet now exposes the full domain set
  (Note / Object / Map POI / Handout / Session artifact), and a new index-freshness surface
  (`search-index-freshness`) renders any `stale`/`partial` domain ("Some indexes may be behind. Showing
  cached results for: …") WITHOUT blocking the results. Read paths render the computed model; the GUI
  dispatches command intents only (Contract 1).

## Tests (primary evidence)

- `apps/v2/packages/core/tests/search-local-indexes.test.ts` (8 tests) — SRCH-001: AC1 visible results
  return offline (zero network in the path); AC1 the EXPANDED domains are searchable (a handout by
  title/visible-section body; a session artifact by label); AC2 a term present only in dm-only content yields
  no player hit/snippet/count (note; a dm-only handout SECTION term hidden from a recipient AND the handout
  hidden from a non-recipient; a dm-only secret roll); AC3 a newly-created note is immediately searchable (the
  index updates incrementally) AND a behind background index marks the affected domain STALE before returning
  results without blocking them.
- `apps/v2/packages/core/tests/search-index-freshness.test.ts` (10 tests) — SRCH-009: the freshness
  primitives (empty domain fresh; observed-ahead source ⇒ stale then partial once indexing starts; catch-up ⇒
  fresh reflecting the new cursor; unavailable source ⇒ stale; hydrate restores a safe baseline); AC1 (local
  store as index ⇒ fresh and nothing blocked; a behind persisted index reports the affected domain stale +
  behind-by WITHOUT blocking cached results); AC2 (a domain that catches up to the advanced source cursor
  becomes fresh, freshness reflecting the new cursor); actor-scoped freshness (a hidden note never inflates a
  player's cursor — no leak); unknown actor denied (every domain `unknown`, fail closed).
- `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (+1 test × 2 projects = +2) — SRCH-001:
  the expanded searchable domains (Handout, Session artifact) are selectable content-type facets; restricting
  to them yields an empty result WITHOUT failing the search; restoring the note facet brings the note back.

### Commands run (results)

- `pnpm --filter @dndtools/v2-core test` — PASS (121 files, 1673 tests; +18 new: 8 search-local-indexes +
  10 search-index-freshness; the prior 1653 + 18 + 2 pre-existing additions = 1673).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings,
  802 files).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no Svelte/DOM/GUI imports).
- `pnpm lint` (FULL: `eslint .` + `lint:navigation` 132 files + `lint:tokens` 132 files + `audit:repo` 5/5) —
  PASS.
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:workpack:validate` — PASS (before and after `complete`; no drift).
- `pnpm e2e` (from `apps/v2/app`, BOTH desktop-chromium AND mobile-chromium, WHOLE suite) — PASS: 470 passed,
  18 intentional project-scoped skips, 0 failed (base was 468 passed; +2 new tests across the two projects).

## Traceability (SRCH-001 / SRCH-009 → code + tests)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| SRCH-001 AC1 — offline, searching cached content returns visible results from local indexes | `searchVaultForActor` is a pure local computation over the actor-filtered reads (`apps/v2/packages/core/src/queries/search-query.ts`); the offline path carries no network handle | `apps/v2/packages/core/tests/search-local-indexes.test.ts` (AC1 zero-network), `apps/v2/app/tests/e2e/sync-local-first.spec.ts` (offline note search, pre-existing) |
| SRCH-001 — full-text over notes, objects, maps/POIs, HANDOUTS, and SESSION ARTIFACTS | the expanded domain loops in `searchVaultForActor` composing `getHandoutsForActor` (SES-004) + `getDiceHistoryForActor` (SES-003); `SearchContentType` += `handout`/`session-artifact` (`apps/v2/packages/core/src/state/saved-search.ts`) | `apps/v2/packages/core/tests/search-local-indexes.test.ts` (handout + session-artifact searchable), `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (the expanded facets) |
| SRCH-001 AC2 — a player searching a dm-only-only term gets no hidden result/snippet | every domain candidate is an actor-filtered read; counts derive from the visible set only (`apps/v2/packages/core/src/queries/search-query.ts`) | `apps/v2/packages/core/tests/search-local-indexes.test.ts` (dm-only note; dm-only handout section + non-recipient handout; dm-only secret roll — JSON no-leak assertions) |
| SRCH-001 AC3 — on an accepted mutation, affected indexes update incrementally OR mark stale before returning | the live search read reflects an accepted mutation immediately (incremental); `recordDomainMutation` advances the index cursor; a behind index ⇒ `getSearchIndexStatus` marks the domain `stale` (`apps/v2/packages/core/src/state/search-index.ts`, `.../queries/search-index-query.ts`) | `apps/v2/packages/core/tests/search-local-indexes.test.ts` (newly-created note immediately searchable; behind index marks domain stale without blocking) |
| SRCH-009 AC1 — incomplete indexing exposes stale/partial status with affected sources, without blocking cached results | `getSearchIndexStatus` publishes per-domain `fresh`/`partial`/`stale`/`unknown` + `staleDomains`/`anyStale`, decoupled from `searchVaultForActor` (`apps/v2/packages/core/src/queries/search-index-query.ts`) | `apps/v2/packages/core/tests/search-index-freshness.test.ts` (behind index ⇒ stale + behind-by; cached results NOT blocked) |
| SRCH-009 AC2 — when a source cursor advances after sync and indexing completes, freshness reflects the new cursor | `observeDomainSourceCursor` + `catchUpDomainIndex`/`recordDomainMutation` advance the cursors; `publishDomainFreshness` reflects them (`apps/v2/packages/core/src/state/search-index.ts`) | `apps/v2/packages/core/tests/search-index-freshness.test.ts` (catch-up ⇒ fresh reflecting the advanced cursor; AC2 source-advances-after-sync) |
| Fail-closed freshness / no leak | unavailable/unproven domain ⇒ `stale`/`unknown`; the source cursor is derived from the actor's VISIBLE set only; unknown actor denied | `apps/v2/packages/core/tests/search-index-freshness.test.ts` (unavailable ⇒ stale; actor-scoped cursor; unknown actor denied) |
| Processing/Display decoupling | the GUI renders the computed search + freshness models and dispatches command intents only (`apps/v2/app/src/lib/gui/SavedSearches.svelte`) | `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. As the DM, in "Notes" create a note "Beacon of Hope" (player-visible, body "The beacon shines.") and save.
3. Scroll to "Filters & saved searches". The "Content type" facet now lists Note, Object, Map POI, **Handout**,
   and **Session artifact** (the full SRCH-001 searchable domains). Type "beacon" — the note appears.
4. Check only "Handout" and "Session artifact": the note disappears and "No visible results match your filter"
   shows — the search FILTERED rather than failing. Uncheck them and check "Note": the note returns.
5. (SRCH-009) When the local index is behind a source that has advanced, a "Some indexes may be behind.
   Showing cached results for: …" notice (`search-index-freshness`) renders the affected domains WITHOUT
   blocking the results above. With the local store AS the index (the default single-device posture), every
   visible domain is fresh and the notice is absent.
6. (SRCH-001 AC2/no-leak) Switch the header "View as" to "Test Player": a dm-only note/handout section/secret
   roll never appears as a hit, snippet, facet, or count, and the player's freshness cursors reflect only
   their visible artifacts.

## Quality review

- Correctness: every SRCH-001 (AC1–AC3) and SRCH-009 (AC1–AC2) acceptance criterion is implemented and unit +
  e2e covered, including the expanded handout/session-artifact domains, offline (zero-network) search,
  incremental index update, stale/partial signaling, cursor advance + catch-up, and fail-closed freshness.
- Architecture: a pure Processing-Core index/freshness model composed from the existing actor-filtered reads —
  no second index, no re-derived visibility. The freshness primitives mirror the sync source-cursor concept
  and reconcile with the prior `SearchSourceFreshness` convention. The GUI renders computed models only.
  Boundary lint green; no v1 runtime imports; core imports no Svelte/DOM.
- Tests: unit (freshness primitives, AC coverage, no-leak, fail-closed, determinism) + e2e on both profiles.
- Accessibility: the new freshness surface is a labelled status list consistent with the sibling source-status
  list; it runs on the compact (mobile) profile (proven by the mobile-chromium e2e run).
- Performance: pure O(visible artifacts) work over already-computed actor-filtered reads; the freshness query
  derives cursors in one pass per domain. No new work on the dispatch hot path.
- Security/permissions: every search candidate is actor-filtered before search; freshness cursors derive from
  the visible set only (no hidden artifact leaks through counts/behind-by); unknown actor denied (fail closed).
- Persistence: the index is a rebuildable, device-local cache (Contract 2); the freshness query derives the
  live source cursor from state, with an optional persisted indexed-cursor snapshot. No destructive migration.
- Sync/offline: search + freshness are pure local computations, fully available offline; the cursor model is
  the seam a future sync transport plugs into (advance the source cursor on pull, catch up on index).
- UX: empty states for "no results"/"no saved searches"; a per-domain freshness notice when an index is behind;
  the expanded content-type facets.
- Maintainability: one small typed state module + one query module + a focused extension to the existing search
  read + the shared `SearchContentType`; no speculative abstractions; no unrelated refactors.
- Docs: this completion doc; the module/GUI docs cite SRCH-001/009, the composed reads, and the fail-closed
  freshness + no-leak contracts.

## Known gaps / deferred items

- The search index is intentionally NOT wired into durable `CoreStateSlice` persistence/dispatch: the freshness
  query DERIVES the live source cursor from state on each read, and the shell may supply a persisted
  indexed-cursor snapshot. This keeps the Processing Core pure and avoids a cross-cutting reducer change while
  fully satisfying both ACs. A later epic that introduces a real background indexer + a durable
  `SearchIndexState` slice can advance the persisted cursor through `recordDomainMutation` /
  `observeDomainSourceCursor` / `catchUpDomainIndex` without changing the query or search contracts.
- Handouts and session artifacts carry no folder/tag/custom-date, so those facets exclude them (matching the
  data model); only text/source/type facets apply. POIs likewise (unchanged from the prior SRCH epic).
- Per-source `SearchSourceFreshness` (`stale-cached`/`unavailable`, SRCH-003) and the new per-DOMAIN freshness
  (SRCH-009) are complementary surfaces, both fail-closed; unifying them behind a single durable
  sync-source-registration registry is deferred per ADR-014 (the live transport is deferred).
- The ad-hoc GUI form exposes the expanded content-type facets + the freshness notice; delivering a handout /
  recording a roll to demonstrate those domains END-TO-END in the GUI happens on the Session surfaces
  (SES-003/SES-004), not the Knowledge page — the search/freshness CONTRACT for those domains is unit-covered.

## Stop conditions

None hit. The v2 stack ADR (ADR-014) supports the approach; no v1 runtime imports were required; the
visibility/permission/freshness behavior was unambiguous (every search candidate is an existing actor-filtered
read; freshness cursors derive from the visible set only and fail closed to `stale`/`unknown`; the index is a
rebuildable device-local cache); the generated workpack validates; and the working tree showed no unrelated
overlapping changes.

## Git

Branch: `epic/SRCH-local-indexes-and-freshness` (chained off the prior epic tip
`epic/SRCH-filters-and-saved-searches` @ `048ac3e`, per the v2 epic-branching convention — NOT from master).
Commit SHA (feat): `<feat-sha>` (`feat(v2): complete SRCH-local-indexes-and-freshness epic`).
The completion-evidence SHA is recorded by the follow-up `docs(v2): record commit SHA …` commit.

### Final `git status --short`

After the completion `feat` commit and the SHA follow-up, the working tree is clean:

```
(empty — clean working tree)
```
