# CONTENT-calendar-custom-time-content — Completion Evidence

Epic: `CONTENT-calendar-custom-time-content` — CONTENT: Calendar/custom time content
Requirement IDs: CONTENT-011
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Permissions &
Visibility); the standing v2 architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-calendar-custom-time-content`.

## Summary

CONTENT-011 delivers the FIRST CONTENT slice: calendar-aware notes and structured objects with
CUSTOM-DATE FIELDS, TIMELINE REFERENCES, and STABLE DISPLAY FORMATTING, authored by an authorized
editor (fail closed) and read through a single actor-filtered query. No prior note/object/content
model existed in `apps/v2/packages/core/src/state/`, so a clean, minimal, extensible content model was
established (the closest precedent — the per-character journal slice — was used as the structural
template for visibility, command-lifecycle, and cross-surface-invalidation patterns).

The determinism deliverable is the keystone. `apps/v2/packages/core/src/state/calendar.ts` is a PURE
calendar engine that follows the SAME discipline as the seeded PRNG (`apps/v2/packages/core/src/state/prng.ts`):
every function is a pure function of its explicit inputs and consults NOTHING ambient — no `Date`, no
`Date.now()`, no `Intl`, no host locale, no timezone. Custom months/day counts/epoch drive day-of-year,
month rollover, comparison/ordering, weekday derivation, and formatting. Formatting is a pure function
of `(calendar definition, date value, format spec)`.

### New content model (cohesive + extensible)

- `apps/v2/packages/core/src/state/calendar.ts` — `CalendarDefinition` (custom months with their own
  day counts, optional weekday cycle, optional epoch label), `CustomDate`, and the pure arithmetic:
  `validateCustomDate`, `dayOfYear`, `absoluteDayIndex`/`fromAbsoluteDayIndex` (the ordering key and its
  inverse), `compareCustomDates`, `addDays` (month/year rollover), `weekdayName`, and `formatCustomDate`
  (`iso-like` / `long` / `medium` / `day-month`). Intentionally no speculative leap/intercalary
  machinery — months carry fixed day counts, which already expresses fixed-length custom calendars; a
  later CONTENT epic can extend `CalendarDefinition` without changing the value shape.
- `apps/v2/packages/core/src/state/content.ts` — the durable `VaultContentState`: a campaign CALENDAR
  REGISTRY plus CONTENT ITEMS (note / structured object), each with an open `fields` map, named
  `dateFields` (custom-date values), `timelineRefs` (custom-date-anchored references), and per-item
  canonical visibility (`dm-only` / `player-visible` / `shared` + `sharedWith`). Pure reducers only; a
  new item FAILS CLOSED to `dm-only`. Slice keyed for later CONTENT epics (notes/editor/wikilinks) to
  build on.

### Durable commands (authorized-editor, fail closed)

`apps/v2/packages/core/src/commands/content.ts` adds five command handlers wired through
`apps/v2/packages/core/src/commands/dispatch.ts`:

- `content.define-calendar` and `content.create-item` are VAULT-LEVEL authoring acts (no pre-existing
  entity to grant against) and are DM-only — mirroring `actorCanAuthorScene`. A player/observer is
  rejected `actor-not-authorized`.
- `content.update-item` / `content.set-item-visibility` / `content.remove-item` additionally allow a
  player holding a write-capable grant (`section-editor`/`contributor`) on that `content-item` entity —
  an authorized editor. An observer never qualifies; a player with no grant is rejected.
- DATA SAFETY: every custom-date field and timeline-reference date is validated against its referenced
  calendar BEFORE the item is committed (`calendar-not-found` / `invalid-calendar-date`), so an
  unrepresentable date can never enter durable state.
- Every accepted mutation appends a durable `content.*` operation through the op-log
  (`appendOperationDraft`) and emits a `content.item-changed` event carrying the DATA-LAYER
  invalidation audience (the union of the previous and new delivery audiences; `*` = all players) so a
  visibility change is the explicit cross-surface invalidation trigger (CONTENT-011 AC2).

The `content-item` entity type was added to the PERM capability schema and inheritance graph (reusing
the note authoring/viewing sets) in `apps/v2/packages/core/src/permissions/capability-schema.ts` and
`apps/v2/packages/core/src/permissions/capability-sets.ts`, so a DM can grant authorized-editor/viewer
access to an item and the grant consistency audit recognizes it.

### Single actor-filtered read path (cross-surface consistency)

`apps/v2/packages/core/src/queries/content-query.ts` is THE sanctioned non-DM read path. It decides
per-item visibility BEFORE any content is returned to ANY surface, and renders every date through the
pure formatter, so the formatted date is identical across the item list, graph, search, and session
recap (CONTENT-011 AC1), and a `dm-only` dated note is OMITTED ENTIRELY from a player's calendar/timeline
view (CONTENT-011 AC2). `getCalendarTimelineForActor` orders events deterministically by absolute day
index with a stable id tie-break.

### State plumbing

A new top-level `content` slice was added to `CoreStateSlice`
(`apps/v2/packages/core/src/commands/types.ts`), the test fixtures
(`apps/v2/packages/core/src/testing/fixtures.ts`), the migration document set
(`apps/v2/packages/core/src/migration/schema-versions.ts`), the platform-service persist schema
(`apps/v2/packages/core/src/schemas/platform-service.ts`), and the public API
(`apps/v2/packages/core/src/index.ts`). The app persists/loads it through the storage adapter with
safe-default hydration for pre-content vaults (`apps/v2/app/src/lib/platform/storage/scene-store.ts`),
seeds it in the runtime (`apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts`), and reports its schema
health in diagnostics (`apps/v2/app/src/lib/platform/diagnostics-context.ts`).

### GUI

`apps/v2/app/src/lib/gui/CalendarContent.svelte` renders the calendar/timeline/content surface ENTIRELY
from the actor-filtered query and dispatches command intents — it never touches storage (Contract 1).
It is mounted on the canonical CONTENT section route `apps/v2/app/src/routes/knowledge/+page.svelte`
(`/knowledge`, the `planned` IA section owned by CONTENT per NAV-009), with
`apps/v2/app/src/routes/knowledge/+page.ts` keeping it client/static (ADR-014).

## Tests (primary evidence)

- `apps/v2/packages/core/tests/calendar.test.ts` — custom-calendar arithmetic (non-Gregorian year
  length, day-of-year, absolute-index round-trip incl. pre-epoch, comparison/ordering, month/year
  rollover via `addDays`, weekday derivation) and STABLE formatting proven locale/clock/timezone
  independent by mutating `process.env.TZ` and `Date.now` and asserting the output is unchanged.
- `apps/v2/packages/core/tests/content-calendar.test.ts` — authorized-editor fail-closed (player/observer
  rejected from calendar/item authoring; granted `section-editor` player may edit; a different ungranted
  player is rejected), custom-date + timeline-reference validation (`calendar-not-found` /
  `invalid-calendar-date`), per-item visibility filtering across the item and timeline views (dm-only
  omitted from the player timeline), cross-surface stable-date consistency, `shared` delivery targeting,
  and the visibility-change invalidation audience.
- `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` — full Playwright on BOTH projects
  (desktop-chromium AND mobile-chromium): AC1 (same stable date string in the item and the timeline),
  AC2 (dm-only dated note omitted from the player timeline), authorized-editor fail-closed (a player has
  no authoring affordances), observer never sees dm-only/shared content, and durable persistence across
  reload.
- `apps/v2/app/tests/unit/route-audit.test.ts` — updated to include `/knowledge` in the scaffolded route
  set; the route maps to the canonical CONTENT IA section so the NAV-006 audit gate stays green.

### Commands run (results)

- `pnpm lint` (FULL: `eslint .` + `lint:navigation` + `lint:tokens` + `audit:repo`) — PASS (navigation
  lint 132 files; token lint 132 files; repo-boundary/CI guardrails 5/5).
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:typecheck` — PASS (core `tsc` 0 errors; app `svelte-check` 0 errors / 0 warnings).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no GUI/DOM imports).
- `pnpm v2:gates` — PASS (7 gates owned, budgeted, wired).
- Core unit suite — PASS (70 files, 962 tests).
- App unit suite — PASS (12 files, 55 tests).
- `pnpm --filter @dndtools/v2-app exec playwright test` — PASS on BOTH desktop-chromium AND
  mobile-chromium: 284 passed, 18 intentional project-scoped skips, 0 failed (base was 274 passed; +10
  new content tests).
- `pnpm v2:workpack:validate` — PASS before and after `complete` (no drift).

## Traceability (CONTENT-011 → code + tests)

| CONTENT-011 facet | Implementation | Tests |
| --- | --- | --- |
| Custom-date fields (custom months/day counts/epoch, not Gregorian) | `apps/v2/packages/core/src/state/calendar.ts`, `apps/v2/packages/core/src/state/content.ts` (`dateFields`) | `apps/v2/packages/core/tests/calendar.test.ts`, `apps/v2/packages/core/tests/content-calendar.test.ts` |
| Timeline references by custom date | `apps/v2/packages/core/src/state/content.ts` (`TimelineReference`), `apps/v2/packages/core/src/queries/content-query.ts` (`getCalendarTimelineForActor`) | `apps/v2/packages/core/tests/content-calendar.test.ts`, `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` |
| Stable display formatting (locale/clock/timezone independent) | `apps/v2/packages/core/src/state/calendar.ts` (`formatCustomDate`) | `apps/v2/packages/core/tests/calendar.test.ts` (TZ/`Date.now` mutation), `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` (AC1) |
| Cross-surface consistency (AC1) | `apps/v2/packages/core/src/queries/content-query.ts` (single read path, same formatter) | `apps/v2/packages/core/tests/content-calendar.test.ts`, `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` |
| Visibility policy — hidden dated note omitted (AC2) | `apps/v2/packages/core/src/queries/content-query.ts` (`itemVisibleToActor`) | `apps/v2/packages/core/tests/content-calendar.test.ts`, `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` (AC2) |
| Authorized editor fail closed | `apps/v2/packages/core/src/commands/content.ts` (`actorMayAuthorVault`/`actorMayEditItem`), `apps/v2/packages/core/src/permissions/capability-schema.ts`, `apps/v2/packages/core/src/permissions/capability-sets.ts` | `apps/v2/packages/core/tests/content-calendar.test.ts`, `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` |
| Durable, undoable, sync-shaped writes | `apps/v2/packages/core/src/commands/content.ts` (op-log drafts), `apps/v2/app/src/lib/platform/storage/scene-store.ts` | `apps/v2/packages/core/tests/content-calendar.test.ts` (op assertions), `apps/v2/app/tests/e2e/content-calendar-and-time.spec.ts` (reload persistence) |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. As the DM, click "Define the demo calendar (Harptos)" — a custom calendar with unequal-length months
   (Hammer 30, Alturiak 28, Ches 31), a 5-day week, and a `DR` epoch label is registered.
3. Create a calendar-aware note with a custom date (e.g. month 1, day 5, year 1372) and visibility
   `player-visible`; create a second note dated month 2, day 14 with visibility `dm-only`. The item
   list and the Timeline render the same stable formatted date (e.g. "5 Hammer, 1372 DR"), ordered by
   custom date.
4. Use the header "View as" control to switch to "Demo Player": the dm-only dated note is omitted from
   both the item list and the Timeline, and there are no authoring affordances. Switch to "Demo
   Observer": dm-only/shared content is not visible.
5. Reload the page: the calendar and the notes persist (durable IndexedDB via the storage adapter).

## Quality review

- Correctness: every CONTENT-011 facet is implemented and unit/e2e covered; date math is round-trip and
  rollover tested incl. pre-epoch dates.
- Architecture: pure Processing-Core policy for calendar arithmetic/validation/formatting/comparison
  (no ambient state, matching the PRNG discipline); durable mutations only via core commands + op-log;
  GUI dispatches intents and renders the computed model, never touching storage. Boundary lint green; no
  v1 runtime imports; core imports no Svelte/DOM.
- Tests: unit (arithmetic, determinism, permissions, visibility, validation) + e2e on both profiles +
  boundary/route-audit gates.
- Accessibility: the Knowledge surface uses labelled `section`/`form`/`select` controls and an `alert`
  for errors, consistent with the existing journal/party surfaces; runs on the mobile (compact) profile.
- Performance: pure O(months) / O(items) computations; no new heavy work on the dispatch hot path.
- Security/permissions: authoring is fail-closed DM/authorized-editor only; per-item visibility composes
  with the canonical three-level model; an unknown actor receives an empty content view.
- Persistence: a new durable `content` document with safe-default hydration for pre-content vaults; the
  "no durable change without an accepted operation" invariant covers the new slice.
- Sync/offline: writes are operation-shaped (actor/target/revision) and offline-durable, preserving the
  sync seam.
- UX: empty states for "no calendar", "no visible items", and "no visible timeline"; error alert on
  rejection.
- Maintainability: small typed modules; the content model is deliberately minimal and extensible for
  later CONTENT epics; no speculative fields; no unrelated refactors.
- Docs: this completion doc; inline module docs cite the requirement and the determinism contract.

## Known gaps / deferred items

- The Knowledge section remains a `planned` IA section (NAV-009): `/knowledge` is directly reachable for
  this slice but is not yet promoted into the primary navigation, and the full note/object tree,
  wikilinks, templates, and import/export are owned by later CONTENT/NAV epics (CONTENT-001..010/012/013).
- No leap-year/intercalary calendar machinery (fixed-length months only) — an intentional
  non-speculative omission; `CalendarDefinition` can be extended later without changing the value shape.
- Graph and search surfaces are not yet built in v2, so cross-surface consistency is proven via the
  single shared read path + formatter (the item list and timeline), which all future surfaces consume.

## Stop conditions

None hit. The v2 stack ADR (ADR-014) supports the approach; no v1 runtime imports were required; the
permission/visibility model was unambiguous (reused the canonical three-level model + authorized-editor
grants); the generated workpack validates; and the working tree showed no unrelated overlapping changes.

## Git

- Branch: `epic/CONTENT-calendar-custom-time-content` (created from `epic/CHAR-widget-data-exposure` HEAD
  `2768033`, per the chained-epic workflow — NOT from master).
- Commit: recorded in a follow-up docs commit (see below).
- Final `git status --short`: clean (no untracked or unstaged files) after the epic commit(s).
