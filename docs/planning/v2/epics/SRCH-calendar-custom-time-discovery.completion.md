# SRCH-calendar-custom-time-discovery — Completion Evidence

Epic: `SRCH-calendar-custom-time-discovery` — SRCH: Calendar/custom-time discovery
Requirement IDs: SRCH-010
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); the standing v2 architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SRCH-calendar-custom-time-discovery`.

## Summary

SRCH-010 delivers the FIRST SRCH slice: a CALENDAR / CUSTOM-TIME DISCOVERY surface that searches and
filters VISIBLE content by campaign calendar dates, custom-time RANGES, timeline EVENTS, and session
CHRONOLOGY. It is a pure DISCOVERY surface composed ENTIRELY from the EXISTING actor-filtered reads — it
adds NO second index and re-derives NO calendar math or visibility policy:

- DATED CONTENT (note/object date fields + timeline references) ← `getCalendarTimelineForActor`
  (CONTENT-011). A `dm-only` dated note is already omitted at that source.
- TIMELINE EVENTS (campaign calendar links by reference) ← `getCalendarContinuityForActor` (SES-012). A
  link to a hidden/deleted target already degrades there; discovery surfaces only the DM-authored label
  the link already carries, never the target name.
- SESSION CHRONOLOGY (the archived sessions, anchored to the campaign date that was current at archive
  time) ← `SessionState.archives`. Session archives are a DM surface (mirroring the SES-012 session-link
  rule), so a non-DM never receives a chronology row.

Because EVERY source is itself actor-filtered, the data layer decided visibility BEFORE discovery sees
anything (Cross-Contract Non-Negotiable 2). The discovery result — including its COUNTS — is computed
over ONLY the actor-visible set, so a player searching a range that contains hidden events sees neither
the hidden events NOR a count that reveals their existence (SRCH-010 AC2). Dates render through the pure
CONTENT-011 formatter, so a visible in-range event shows a stable, locale/clock/timezone-independent
string (SRCH-010 AC1). The Processing Core owns the range filter, text match, and deterministic ordering;
the GUI renders the computed result and dispatches NO commands (Architecture Contract 1).

### New Processing-Core query (composes existing reads; no parallel index)

- `apps/v2/packages/core/src/queries/calendar-discovery-query.ts` — `searchCalendarTimeForActor(...)`,
  the single actor-filtered discovery read. It composes the three actor-filtered sources above, applies
  an INCLUSIVE custom-date RANGE filter (`CalendarDateRange`, either bound open) and an optional
  case-insensitive text query over the visible event title/label, and returns `CalendarDiscoveryResult`:
  the matching events (deterministically ordered by absolute day index, then a stable source order, then
  id), a `totalCount`, per-source `countsBySource`, and the echoed `appliedRange` with stable formatted
  bounds. An unknown/unauthenticated actor or a missing calendar yields an empty, calendar-less result
  (fail closed). The `sources` selector narrows which sources contribute.

### Public API + GUI

- `apps/v2/packages/core/src/index.ts` — exports `searchCalendarTimeForActor`, `CALENDAR_EVENT_SOURCES`,
  and the `CalendarDiscovery*` / `DiscoveryDateView` / `CalendarDateRange` / `CalendarEventSource` types,
  next to the SES-012 continuity exports it composes.
- `apps/v2/app/src/lib/gui/CalendarDiscovery.svelte` — the discovery surface: a date-range + text filter
  form and a results list, rendered ENTIRELY from `searchCalendarTimeForActor` with the actor-filtered
  runtime state. It dispatches NO commands (read-only discovery). Mounted on the canonical Knowledge
  section route `apps/v2/app/src/routes/knowledge/+page.svelte` after `CalendarContent`.

## Tests (primary evidence)

- `apps/v2/packages/core/tests/calendar-discovery.test.ts` (15 tests) — fail-closed empties (unknown
  actor, unknown calendar); AC1 (a visible dated event appears in its range with the stable formatter;
  out-of-range exclusion; inclusive bounds on both ends; open range returns all); AC2 (a dm-only dated
  event is omitted for a player AND not counted, with a JSON no-leak assertion; observer scoping); the
  timeline-link source (visible bare marker included; a link to a HIDDEN content target surfaces only its
  DM-authored label — no leak); session chronology is DM-only (a player never gets an archive row or
  count); text-query filtering; the `sources` selector; deterministic stable ordering across repeated
  runs; and the echoed applied range.
- `apps/v2/app/tests/e2e/calendar-discovery.spec.ts` (3 tests × 2 projects = 6) — full Playwright on
  BOTH desktop-chromium AND mobile-chromium: AC1 (a visible dated event appears in its date range with
  stable Harptos formatting; an out-of-range event excluded; count = 1), AC2 (a dm-only dated event shows
  for the DM but is hidden from the player and the count is not inflated; the hidden title appears nowhere
  on the surface), and text-query filtering.

### Commands run (results)

- `pnpm --filter @dndtools/v2-core test` — PASS (117 files, 1625 tests; +15 new SRCH-010 tests).
- `pnpm --filter @dndtools/v2-app test` — PASS (12 files, 55 tests).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings, 794
  files).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no Svelte/DOM/GUI imports).
- `pnpm lint` (FULL: `eslint .` + `lint:navigation` 132 files + `lint:tokens` 132 files + `audit:repo`
  5/5) — PASS.
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:workpack:validate` — PASS (before and after `complete`; no drift).
- `pnpm e2e` (from `apps/v2/app`, BOTH projects) — PASS: 460 passed, 18 intentional project-scoped skips,
  0 failed (base was 454 passed; +6 new discovery tests across the two projects).

## Traceability (SRCH-010 → code + tests)

| SRCH-010 facet | Implementation | Tests |
| --- | --- | --- |
| Search/filter visible content by calendar dates + custom-time RANGES | `searchCalendarTimeForActor` + `CalendarDateRange` / `dateInRange` in `apps/v2/packages/core/src/queries/calendar-discovery-query.ts` | `apps/v2/packages/core/tests/calendar-discovery.test.ts` (range, inclusive bounds, open range, text query), `apps/v2/app/tests/e2e/calendar-discovery.spec.ts` |
| Timeline EVENTS source | `timelineLinkEvents` composing `getCalendarContinuityForActor` (SES-012) | `apps/v2/packages/core/tests/calendar-discovery.test.ts` (timeline-link inclusion + hidden-target no-leak) |
| Session CHRONOLOGY source (DM-only) | `sessionChronologyEvents` over `SessionState.archives` | `apps/v2/packages/core/tests/calendar-discovery.test.ts` (DM sees rows; player gets none) |
| AC1 — visible event in range with stable date formatting | `contentEvents` (composes `getCalendarTimelineForActor`) + `formatDate` via the pure CONTENT-011 formatter | `apps/v2/packages/core/tests/calendar-discovery.test.ts` (AC1 cases), `apps/v2/app/tests/e2e/calendar-discovery.spec.ts` (AC1) |
| AC2 — hidden events AND revealing counts omitted/generalized for a player | every source is actor-filtered; `totalCount`/`countsBySource` derived from the visible event set only | `apps/v2/packages/core/tests/calendar-discovery.test.ts` (AC2 + no-leak JSON assertions), `apps/v2/app/tests/e2e/calendar-discovery.spec.ts` (AC2) |
| Deterministic ranking/ordering | `compareDiscoveryEvents` (absolute day index → source order → id) | `apps/v2/packages/core/tests/calendar-discovery.test.ts` (stable repeated-run ordering) |
| Processing/Display decoupling | GUI renders the computed result, dispatches no commands (`apps/v2/app/src/lib/gui/CalendarDiscovery.svelte`) | `apps/v2/app/tests/e2e/calendar-discovery.spec.ts` |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. As the DM, in "Calendar & custom-time content" click "Define the demo calendar (Harptos)", then create
   two dated notes: e.g. "Founding Day" (month 1, day 5) `player-visible`, and "Secret Ritual" (month 1,
   day 12) `dm-only`.
3. Scroll to "Calendar & custom-time discovery". With an open range, both events are listed and the count
   reads "2 matching events". Set the From/To bounds to month 1, day 1..30 — only the Hammer-dated events
   appear, with stable formatted dates ("… Hammer, 1372 DR"). Type "founding" into the search box — only
   "Founding Day" remains.
4. Use the header "View as" control to switch to "Test Player": the dm-only "Secret Ritual" disappears
   from the discovery list AND the count drops to "1 matching event" — the hidden event is omitted and
   never revealed by a count (AC2).

## Quality review

- Correctness: both SRCH-010 acceptance criteria are implemented and unit + e2e covered; inclusive range,
  open bounds, text query, source selector, and deterministic ordering are tested.
- Architecture: pure Processing-Core discovery composed from the existing actor-filtered reads (no second
  index, no re-derived calendar math); the GUI renders the computed model and dispatches no commands.
  Boundary lint green; no v1 runtime imports; core imports no Svelte/DOM.
- Tests: unit (fail-closed, AC1/AC2, no-leak, determinism) + e2e on both profiles.
- Accessibility: the surface uses a labelled `section`/`form`/`fieldset`/`legend`/`input` structure
  consistent with the sibling Knowledge surfaces; it is a stacked list/form that runs on the compact
  (mobile) profile.
- Performance: pure O(visible events) work over already-computed actor-filtered reads; no new heavy work
  on the dispatch hot path.
- Security/permissions: every source is actor-filtered before discovery; counts derive from the visible
  set only; session chronology is DM-only; an unknown actor receives an empty result (fail closed).
- Persistence: read-only over existing durable state; no new durable document or migration.
- Sync/offline: no new mutations; discovery is a pure read, fully available offline over cached state.
- UX: empty states for "no calendar" and "no matching events"; a live count; stable formatted dates.
- Maintainability: one small typed query module + one read-only GUI; no speculative abstractions; no
  unrelated refactors.
- Docs: this completion doc; the module/GUI docs cite SRCH-010, the composed reads, and the no-leak
  contract.

## Known gaps / deferred items

- Session chronology dates each archive by the campaign current date (the SES-012 continuity thread) when
  it is expressed in the searched calendar; archive snapshots do not yet carry their own per-session
  custom date, so archives with no in-calendar campaign date are not part of the dated discovery surface.
  This is a non-speculative composition over the existing model; a later SES/SRCH epic can attach a
  per-archive date without changing the discovery contract.
- Discovery composes the dated content/timeline/chronology surfaces (the calendar/custom-time scope of
  SRCH-010). Broader full-text/facet/saved-search SRCH capabilities (SRCH-001..009/011) are owned by the
  other SRCH epics; the quick-switcher is owned by `SRCH-quick-switcher-and-command-discovery`.
- The Knowledge section remains a `planned` IA section (NAV-009): `/knowledge` is directly reachable for
  this slice but is not yet promoted into primary navigation.

## Stop conditions

None hit. The v2 stack ADR (ADR-014) supports the approach; no v1 runtime imports were required; the
permission/visibility model was unambiguous (every source is an existing actor-filtered read; session
chronology is DM-only, matching the SES-012 session-link rule); the generated workpack validates; and the
working tree showed no unrelated overlapping changes.

## Git

Branch: `epic/SRCH-calendar-custom-time-discovery` (chained off the prior epic tip
`epic/COLLAB-player-views-and-observer-access` @ `e162589`, per the v2 epic-branching convention — NOT
from master).
Commit SHA (feat): `__FEAT_SHA__` (`feat(v2): complete SRCH-calendar-custom-time-discovery epic`).
The completion-evidence SHA is recorded by a follow-up `docs(v2): record commit SHA …` commit.

### Final `git status --short`

After the completion `feat` commit and the SHA follow-up, the working tree is clean:

```
(empty — clean working tree)
```
