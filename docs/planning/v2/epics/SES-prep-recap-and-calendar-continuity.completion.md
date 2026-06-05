# Completion Evidence: SES-prep-recap-and-calendar-continuity

Epic: `SES-prep-recap-and-calendar-continuity` — SES: Prep, recap, and calendar continuity
Requirement IDs: SES-009, SES-012
Branch: `epic/SES-prep-recap-and-calendar-continuity` (created from `epic/SES-handouts-and-tools` HEAD `76ec924`).

## Summary

Delivered the SES prep/recap + calendar-continuity capability branch as pure Processing-Core derivation
plus a thin GUI surface on the `/session/` route. Both requirements are implemented strictly as
DERIVATIONS over the existing durable sources — nothing is duplicated:

- **SES-009 — pre-session prep and post-session recap.** A single pure query
  (`getPrepRecapDigest`) COMPUTES the prep/recap digest from the existing sources: unresolved threads
  (the SES-007 `open-thread` quick-reference panels, resolved live + actor-filtered), recent changes
  (the op-log / `SyncOperation[]`), handout outcomes (the SES-004 delivery history), combat summaries
  (the SES-002 actor-filtered encounter/combat log), calendar context (the SES-012 campaign date + linked
  past/upcoming events), and deterministically synthesized continuity prompts. No AI, no copied dataset
  (SES-009 AC2). The digest is DM-FACING: a non-DM (or unknown actor) receives an EMPTY digest — a hard,
  fail-closed no-leak guarantee. In `recap` (where the live combat/dice/handout fields were archived into
  the recap snapshot on workflow entry), the combat/handout outcomes derive from the archive snapshot of
  the just-ended session so the recap reflects what happened.
- **SES-012 — campaign calendar continuity.** A durable campaign-level slice
  (`CalendarContinuityState`, stored on the session document but never reset between sessions) holds the
  campaign CURRENT DATE (a structural `CustomDate`, rendered through the CONTENT-011 formatter into a
  stable canonical string — SES-012 AC1) and LINKS from dates to notes/sessions/maps/events/handouts BY
  REFERENCE. The link command REUSES `state/calendar.ts` for date validation (no calendar arithmetic
  re-implemented) and validates that a concrete target exists (fail closed). The actor-filtered read
  resolves each link against the LIVE target through the existing actor-filtered reads; a hidden or
  deleted/missing target degrades to one indistinguishable `unavailable` link (no leak, no clone). The
  calendar context (current date + linked past/upcoming events) feeds the prep/recap digest (SES-012 AC2).

## Architecture

- Pure Processing-Core policy: the digest derivation and calendar-link resolution are pure deterministic
  functions of explicit inputs (no `Date`/`Intl`/clock/random). Date math + formatting stay owned by
  `apps/v2/packages/core/src/state/calendar.ts` (CONTENT-011).
- Durable writes (campaign date, calendar links) enter through core commands and append op-log records;
  the GUI dispatches command intents and renders computed read models, never touching storage
  (Architecture Contract 1). The op-log entries carry only the REFERENCE (kind + target id + date), never
  target content.
- No v1 runtime imports; the v2 boundary lint stays green.

## Files Changed

### Core — new modules

- `apps/v2/packages/core/src/state/calendar-continuity.ts` — SES-012 durable campaign calendar
  continuity state (current date + dated links by reference) + pure reducers + fail-closed hydrate.
- `apps/v2/packages/core/src/commands/calendar-continuity.ts` — SES-012 `session.set-campaign-date`,
  `session.link-calendar-date`, `session.unlink-calendar-date` command handlers (DM-only; date validated
  against its calendar; link target existence validated fail-closed).
- `apps/v2/packages/core/src/queries/calendar-continuity-query.ts` — SES-012 actor-filtered calendar
  continuity read model (`getCalendarContinuityForActor`, `resolveCalendarLinkForActor`,
  `getCalendarContextForActor`); link resolution against live actor-filtered reads with degrade-on-hidden.
- `apps/v2/packages/core/src/queries/prep-recap-digest.ts` — SES-009 pure prep/recap digest derivation
  (`getPrepRecapDigest`) over the existing sources + DM-only no-leak gate + recap-from-archive selection.

### Core — modified

- `apps/v2/packages/core/src/state/session-state.ts` — added the `calendarContinuity` field on
  `SessionState`, the re-exports, and the `EMPTY_SESSION_STATE` default.
- `apps/v2/packages/core/src/commands/helpers.ts` — `ensureSessionState` hydrates `calendarContinuity`
  fail-closed.
- `apps/v2/packages/core/src/commands/dispatch.ts` — wired the three SES-012 command handlers.
- `apps/v2/packages/core/src/commands/types.ts` — added the three SES-012 `CoreCommand` variants and the
  `session.campaign-date-set` / `session.calendar-date-linked` / `session.calendar-date-unlinked`
  `CoreEvent` variants.
- `apps/v2/packages/core/src/schemas/commands.ts` — added `setCampaignDateInputSchema`,
  `linkCalendarDateInputSchema`, `unlinkCalendarDateInputSchema`.
- `apps/v2/packages/core/src/index.ts` — exported the new state, query, digest, and command-schema
  surfaces.
- `apps/v2/packages/core/src/testing/fixtures.ts` — added `calendarContinuity` to the initial-state
  fixture.

### App — new + modified

- `apps/v2/app/src/lib/gui/PrepRecap.svelte` — the SES-009/SES-012 surface (define calendar, set campaign
  date, link/unlink dates, the actor-filtered calendar continuity view, and the prep/recap digest with
  the DM-only fail-closed empty state).
- `apps/v2/app/src/routes/session/+page.svelte` — mounted `PrepRecap` on the `/session/` route.
- `apps/v2/app/src/lib/gui/QuickReference.svelte` — added the `open-thread` pin kind (the prep-digest
  thread source) to the existing SES-007 pin form.
- `apps/v2/app/src/lib/platform/storage/scene-store.ts` — hydrate `session.calendarContinuity`
  fail-closed on load (safe-default; no destructive migration).
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` — initial state + reload rebuild include
  `calendarContinuity` (fail-closed via `ensureCalendarContinuityState`).

### Tests — new + modified

- `apps/v2/packages/core/tests/calendar-continuity.test.ts` — SES-012 unit tests (custom-time storage +
  stable canonical format, date validation fail-closed, link-by-reference + no-clone + actor-filtered +
  degrade-on-hidden/deleted, target-existence fail-closed, bare markers, context partitioning,
  persistence across session resets).
- `apps/v2/packages/core/tests/prep-recap-digest.test.ts` — SES-009 unit tests (derivation from each
  source, determinism, recent-change bounding, DM-only no-leak hard assertion, recap-from-archive,
  dangling-thread degrade).
- `apps/v2/app/tests/e2e/session-prep-recap-and-calendar.spec.ts` — SES-009/SES-012 e2e on BOTH
  Playwright projects (stable canonical date rendering, link degrade-on-hidden for a player, prep digest
  gathering threads/handouts/recent-changes/prompts + DM-only no-leak).
- `apps/v2/packages/core/tests/map-query.test.ts` — added `calendarContinuity` to its local
  `EMPTY_SESSION()` builder (the new required `SessionState` field).

### Planning (generated via workpack commands; not hand-edited)

- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/SES-prep-recap-and-calendar-continuity.yaml`.

## Traceability

| Requirement | Implementation | Tests |
| --- | --- | --- |
| SES-009 (prep/recap workflows gather threads, changes, handout outcomes, combat summaries, continuity prompts) | `apps/v2/packages/core/src/queries/prep-recap-digest.ts`; GUI `apps/v2/app/src/lib/gui/PrepRecap.svelte`; open-thread source `apps/v2/app/src/lib/gui/QuickReference.svelte` | `apps/v2/packages/core/tests/prep-recap-digest.test.ts`; `apps/v2/app/tests/e2e/session-prep-recap-and-calendar.spec.ts` |
| SES-009 AC1 (open prep ⇒ open threads + session assets gathered from local indexes) | `getPrepRecapDigest` (unresolvedThreads + handoutOutcomes + combatSummary + recentChanges + calendarContext) | `apps/v2/packages/core/tests/prep-recap-digest.test.ts` ("prep digest derives items from each source") |
| SES-009 AC2 (recap draft without AI services) | `getPrepRecapDigest` recap mode + synthesized `continuityPrompts` (pure, no AI); recap derives from archive | `apps/v2/packages/core/tests/prep-recap-digest.test.ts` ("recap derives outcomes from the just-ended session archive") |
| SES-012 (maintain calendar/custom-time, link dates to notes/sessions/maps/events/handouts, include calendar context in prep/recap) | `apps/v2/packages/core/src/state/calendar-continuity.ts`; `apps/v2/packages/core/src/commands/calendar-continuity.ts`; `apps/v2/packages/core/src/queries/calendar-continuity-query.ts` | `apps/v2/packages/core/tests/calendar-continuity.test.ts`; `apps/v2/app/tests/e2e/session-prep-recap-and-calendar.spec.ts` |
| SES-012 AC1 (session date stored in campaign-calendar terms + stable canonical format) | `setCampaignDate` + `formatCustomDate` (CONTENT-011) in the continuity query | `apps/v2/packages/core/tests/calendar-continuity.test.ts` ("stores a session date ... stable canonical format") |
| SES-012 AC2 (prep/recap continuity prompts include visible calendar source links without AI) | `getCalendarContextForActor` feeds `getPrepRecapDigest.calendarContext` + `continuityPrompts` (source: calendar) | `apps/v2/packages/core/tests/prep-recap-digest.test.ts`; `apps/v2/packages/core/tests/calendar-continuity.test.ts` (context partitioning) |

## Demo

Path (visible behavior; runs identically on desktop and compact profiles):

1. Go to `/knowledge/`, click "Define demo calendar", then create a DM-only dated note (e.g.
   "The Burning of Highmoor", month 1 day 5 year 1372).
2. Go to `/session/` and scroll to "Prep, recap & calendar".
3. SES-012: set the campaign current date (month 2, day 14, year 1372) — it renders as the stable
   canonical "14 Alturiak 1372 DR". Link the note to month 1 day 5 — the DM sees "Highmoor fire" with the
   resolved live title and "5 Hammer 1372 DR".
4. Switch the header "view as" to a player: the link's label + date still render, but the dm-only title
   degrades to "(target unavailable — hidden or deleted)" — no leak.
5. SES-009: start an active session from `/` (Command Center), return to `/session/`, pin the note as an
   "Open thread", deliver a handout to a player. The DM prep digest gathers the unresolved thread, the
   handout outcome, recent changes (op-log), and continuity prompts. Switch "view as" to a player: the
   digest shows the fail-closed "available to the DM only" empty state.

Requirement IDs exercised by the demo: SES-009, SES-012.

## Quality Review

- **Correctness:** Both ACs for each requirement are implemented and covered by unit + e2e tests.
- **Architecture:** Pure derivation (no copied data); durable writes via commands + op-log; calendar math
  reuses `state/calendar.ts`; GUI never touches storage. Boundary lint + v2 gates green; no v1 imports.
- **Tests:** Core unit suites + targeted e2e on BOTH Playwright projects; deterministic-digest and
  no-leak assertions are hard.
- **Accessibility:** The GUI surface uses labelled controls, `aria-label`ed sections, and `role="alert"`
  for errors, consistent with the existing session surfaces; it runs on the compact profile.
- **Performance:** Pure synchronous reads over already-loaded state; recent changes are bounded.
- **Security / Permissions / Data-safety:** DM-only digest fails closed (empty for any non-DM/unknown
  actor); link resolution degrades hidden/deleted targets to one indistinguishable `unavailable`; op-log
  values carry references only (no content leak). New durable state hydrates fail-closed.
- **Sync/offline:** Campaign date + links append operation-shaped records; campaign continuity is
  campaign-level and never reset between sessions.
- **Persistence:** `calendarContinuity` is persisted on the session document and hydrated with
  safe defaults (no destructive migration; older vaults restore with no date/links).
- **UX:** Empty, available, and unavailable states render; the prep/recap mode toggles forward/back framing.
- **Docs:** This completion file; thorough module/GUI doc comments.

## Tests Run

- `pnpm lint` (full: `eslint . && lint:navigation && lint:tokens && audit:repo`) — passed.
- `pnpm docs:validate` — passed.
- `pnpm v2:typecheck` — 0 errors.
- `pnpm v2:lint` (boundary) — passed.
- `pnpm v2:gates` — passed.
- Core unit suite (`@dndtools/v2-core` vitest) — 92 files, 1267 tests passed.
- App unit suite (`@dndtools/v2-app` vitest) — 12 files, 55 tests passed.
- Full Playwright on BOTH projects (`desktop-chromium` + `mobile-chromium`) — green (see handoff).
- `pnpm v2:workpack:validate` — passed before and after `complete`.

## Known Gaps / Deferred

- The recap "optional summary artifact" persistence (a durable recap note) is intentionally NOT added as
  a separate copied dataset; the recap digest is computed from the sources, and a DM can already persist a
  note via the existing content write path. No new persistence surface was introduced for it.
- The e2e exercises the prep digest's thread/handout/recent-change/prompt derivation and the DM-only
  no-leak; the combat-summary and recap-from-archive derivations are covered by the core unit tests
  (`apps/v2/packages/core/tests/prep-recap-digest.test.ts`) rather than re-driven through the full combat
  GUI in e2e, to keep the browser test robust.

## Git

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SES-prep-recap-and-calendar-continuity`).

- Branch: `epic/SES-prep-recap-and-calendar-continuity` (from `epic/SES-handouts-and-tools` HEAD `76ec924`).
- Implementation commit SHA: `80b901ab72e1c3530dd9872fe921dcd0a420aaa9`.
- Final `git status --short`: clean (after this docs commit recording the SHA).

Final `git status --short` after the implementation commit:

```
(clean)
```
