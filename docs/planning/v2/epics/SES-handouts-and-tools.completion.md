# Completion Evidence: SES-handouts-and-tools

Epic: `SES-handouts-and-tools` — SES: Handouts and tools
Requirement IDs: SES-004, SES-005, SES-007
Branch: `epic/SES-handouts-and-tools` (created from `epic/SES-dice-and-tables` HEAD `efc9d2c`).

## Summary

Delivered the SES handouts-and-tools capability branch as pure Processing-Core policy plus thin GUI
surfaces on the `/session/` route:

- **SES-004 — handout delivery.** The DM delivers a handout as a Scene widget to selected recipients,
  with durable delivery history, visibility enforcement (non-recipients receive nothing), and optional
  progressive reveal. Delivery composes the PERM visibility-filter (the recipient set is the `shared`
  audience); the handout is delivered through a Scene widget that references the handout by id (no
  content clone). Non-recipient non-leak is a hard test assertion.
- **SES-005 — operate vs configure.** A participant holding a timer/tool widget `operator` grant can
  START, PAUSE, RESUME, RESET, ADVANCE the tool but cannot CONFIGURE it (`timer.set-duration` requires
  `manager`). A new pure policy module classifies each widget command as operate-vs-configure and
  decides authority fail-closed both ways (operator can operate, not configure; non-operator cannot
  operate).
- **SES-007 — quick-reference panels.** The DM creates, pins, and uses quick-reference panels (notes,
  stat blocks, rules snippets, open threads, session context) that reference content by reference. Each
  panel resolves against the live, actor-filtered target; a pin to a now-hidden/deleted target degrades
  to an unavailable state (no leak, no crash). Pin state is durable.

## Files Changed

### Core — new modules

- `apps/v2/packages/core/src/permissions/widget-operator-authority.ts` — SES-005 operate-vs-configure
  policy (command classification, required-capability mapping, fail-closed authority decision).
- `apps/v2/packages/core/src/commands/handout.ts` — SES-004 `session.deliver-handout` +
  `session.reveal-handout-section` command handlers (DM-only, active-session-gated, delivery history,
  reveal).
- `apps/v2/packages/core/src/queries/handout-query.ts` — SES-004 actor-filtered handout read model
  (`getHandoutForActor`, `getHandoutsForActor`, `getHandoutDeliveryHistory`); non-recipient ⇒
  `unavailable` with no content.
- `apps/v2/packages/core/src/commands/quick-reference.ts` — SES-007 `session.pin-quick-reference` +
  `session.unpin-quick-reference` command handlers (DM-only, durable pins).
- `apps/v2/packages/core/src/queries/quick-reference-query.ts` — SES-007 actor-filtered quick-reference
  read model (`getQuickReferencePanelsForActor`, `resolveQuickReferencePanelForActor`); reference
  resolution against live actor-filtered content/character reads with degrade-on-hidden.

### Core — modified

- `apps/v2/packages/core/src/state/session-state.ts` — added the durable `SessionHandout` /
  `HandoutSection` / `HandoutDeliveryRecord` and `QuickReferencePanel` models, the `handouts` and
  `quickReferencePanels` fields on `SessionState`/`SessionArchiveSnapshot`, and `EMPTY_SESSION_STATE`
  defaults.
- `apps/v2/packages/core/src/commands/widget-command.ts` — rewrote the widget-command reducer to use
  `decideWidgetCommandAuthority` (SES-005) and to handle the full timer operate surface
  (start/pause/resume/reset/advance) plus the configure command (`timer.set-duration`, scene-config
  write).
- `apps/v2/packages/core/src/state/widget-package-state.ts` — extended the timer widget with the
  operate/configure commands; added the `handout` system widget type.
- `apps/v2/packages/core/src/schemas/commands.ts` — added `deliverHandoutInputSchema`,
  `revealHandoutSectionInputSchema`, `pinQuickReferenceInputSchema`, `unpinQuickReferenceInputSchema`.
- `apps/v2/packages/core/src/commands/types.ts` — added the four new `CoreCommand` variants, the
  `session.timer-operated` / `session.handout-delivered` / `session.handout-revealed` /
  `session.quick-reference-pinned` / `session.quick-reference-unpinned` `CoreEvent`s.
- `apps/v2/packages/core/src/commands/dispatch.ts` — wired the four new command handlers.
- `apps/v2/packages/core/src/commands/helpers.ts` — hydrate `handouts`/`quickReferencePanels`
  fail-closed in `ensureSessionState`.
- `apps/v2/packages/core/src/commands/session-control.ts` — archive + reset the new session fields in
  the workflow reducer.
- `apps/v2/packages/core/src/index.ts` — exported the new state types, schemas, queries, and the
  operator-authority policy.
- `apps/v2/packages/core/src/testing/fixtures.ts` — added the new session fields to the fixture builder.

### App (GUI)

- `apps/v2/app/src/lib/gui/HandoutDelivery.svelte` — SES-004 handout delivery surface (recipients,
  reveal, delivery history, received handouts via the actor-filtered read).
- `apps/v2/app/src/lib/gui/LiveTools.svelte` — SES-005 live tools surface (grant operator/manager,
  project, operate, configure).
- `apps/v2/app/src/lib/gui/QuickReference.svelte` — SES-007 quick-reference surface (pin notes/session
  context, resolved panels, unpin).
- `apps/v2/app/src/routes/session/+page.svelte` — mounted the three new surfaces.
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` — initialized + hydrated the new session
  fields in the runtime store.
- `apps/v2/app/src/lib/platform/storage/scene-store.ts` — hydrate the new session fields fail-closed on
  load.

### Tests

- `apps/v2/packages/core/tests/widget-operator-authority.test.ts` — SES-005 (11 cases): classification,
  fail-closed misconfig handling, DM/operator/manager/observer/no-grant authority, and the full
  operate-allowed / configure-denied boundary through dispatch.
- `apps/v2/packages/core/tests/handout-delivery.test.ts` — SES-004 (5 cases): deliver to selected
  recipient + non-recipient non-leak (hard assertion), hidden-section exclusion, progressive reveal,
  delivery history (DM-only), and fail-closed negatives (player-deliver, DM-recipient, idle-session).
- `apps/v2/packages/core/tests/quick-reference.test.ts` — SES-007 (6 cases): pin + durable state,
  degrade-on-delete, degrade-on-hide, session-context panel, DM-only (non-DM empty + player cannot
  pin), unpin + pin order.
- `apps/v2/packages/core/tests/map-query.test.ts` — updated the local `EMPTY_SESSION` fixture for the
  new fields.
- `apps/v2/app/tests/e2e/session-handouts-and-tools.spec.ts` — SES-004/005/007 e2e on BOTH Playwright
  projects (desktop-chromium + mobile-chromium).

### Planning (generated, via workpack commands only)

- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/SES-handouts-and-tools.yaml` — status transitions (active → complete) via
  `pnpm v2:workpack:set-status` / `pnpm v2:workpack:complete`.

## Traceability

| Requirement | Implementation | Tests |
| --- | --- | --- |
| SES-004 (handout delivery, history, visibility enforcement, reveal) | `apps/v2/packages/core/src/commands/handout.ts`, `apps/v2/packages/core/src/queries/handout-query.ts`, `apps/v2/packages/core/src/state/session-state.ts`, `apps/v2/packages/core/src/state/widget-package-state.ts` (handout widget), `apps/v2/app/src/lib/gui/HandoutDelivery.svelte` | `apps/v2/packages/core/tests/handout-delivery.test.ts`, `apps/v2/app/tests/e2e/session-handouts-and-tools.spec.ts` |
| SES-005 (operate vs configure capability boundary) | `apps/v2/packages/core/src/permissions/widget-operator-authority.ts`, `apps/v2/packages/core/src/commands/widget-command.ts`, `apps/v2/packages/core/src/state/widget-package-state.ts` (timer commands), `apps/v2/app/src/lib/gui/LiveTools.svelte` | `apps/v2/packages/core/tests/widget-operator-authority.test.ts`, `apps/v2/app/tests/e2e/session-handouts-and-tools.spec.ts` |
| SES-007 (quick-reference panels by reference, degrade-on-hidden, durable pins) | `apps/v2/packages/core/src/commands/quick-reference.ts`, `apps/v2/packages/core/src/queries/quick-reference-query.ts`, `apps/v2/packages/core/src/state/session-state.ts`, `apps/v2/app/src/lib/gui/QuickReference.svelte` | `apps/v2/packages/core/tests/quick-reference.test.ts`, `apps/v2/app/tests/e2e/session-handouts-and-tools.spec.ts` |

## Tests Run

- `pnpm lint` (FULL: eslint + lint:navigation + lint:tokens + audit:repo) — **passed** (0 errors).
- `pnpm docs:validate` — **passed** (includes the v2 workpack validator).
- `pnpm v2:typecheck` — **passed** (0 errors, both packages).
- `pnpm v2:lint` (boundary lint) — **passed**.
- `pnpm v2:gates` — **passed** (7 gates owned/budgeted/wired).
- Core unit suite (`pnpm --filter @dndtools/v2-core test`) — **1242 passed** (90 files), including the
  3 new SES test files (22 new cases).
- App unit suite (`pnpm --filter @dndtools/v2-app test`) — **55 passed** (12 files).
- `pnpm --filter @dndtools/v2-app exec playwright test` — FULL Playwright on BOTH projects
  (desktop-chromium AND mobile-chromium): **368 passed, 18 skipped (intentional project-scoped), 0
  failed** (base was 362 passed; +6 from 3 new tests × 2 projects).
- `pnpm v2:workpack:validate` — **passed** before and after `complete` (no drift).

## Demo Notes

Path a reviewer can follow (all on the live app):

1. Start the dev/build app; on `/` (Command Center) click `session-workflow-active` to start an active
   session.
2. **SES-004:** Go to `/session/`. In "Handouts", fill a title, check a recipient (e.g. Demo Player),
   optionally check "Reveal the cipher section on delivery", click "Deliver handout". The delivery
   history records the delivery. Use the global "view as" control: as the recipient the handout (and
   revealed cipher) appears; as a NON-recipient (Demo Player 2) the received list is empty — no title
   or content leaks.
3. **SES-005:** In "Live tools", select a player + "Operator", click "Grant" then "Project to player".
   "View as" that player: Start/Pause/Resume/Advance/Reset operate the timer; "Configure duration"
   is rejected with "requires manager". Grant "Manager" instead to see configure succeed.
4. **SES-007:** Create a `player-visible` note on `/knowledge/`. On `/session/` "Quick reference", pin
   the note. Navigate away and back — the pin persists. Delete the note on `/knowledge/`; back on
   `/session/` the panel shows "Reference unavailable" with no leaked content.

## Quality Review

- **Correctness:** every mapped acceptance criterion (SES-004 AC1/AC2, SES-005 AC1/AC2, SES-007
  AC1/AC2) is covered by unit + e2e tests, including fail-closed negatives.
- **Architecture:** delivery resolution, operator-authority, and quick-ref resolution are pure
  deterministic Processing-Core functions; durable writes go through `appendOperationDraft` op-log
  entries; the GUI dispatches command intents and renders actor-filtered models, never touching
  storage. Boundary lint (`pnpm v2:lint`) green; no v1 runtime imports.
- **Tests:** primary evidence is the core unit suites (22 new cases) plus e2e on both profiles.
- **Accessibility:** GUI surfaces use labelled controls, `role="alert"` error regions, and section
  `aria-label`s, consistent with the existing session surfaces; route a11y suite stays green.
- **Performance:** all reads are O(handouts/panels) pure functions; no new heavy work.
- **Security / permissions:** SES-004 enforces visibility via the PERM filter (non-recipient non-leak,
  proven); SES-005 fails closed both ways; SES-007 is DM-only and degrades hidden/deleted targets
  without leaking existence.
- **Persistence / sync:** the new session fields are durable, hydrated fail-closed on load (core +
  app), archived on recap, and reset on idle; every mutation appends an op-log record carrying only
  references/audit data (no recipient content beyond the authored handout).
- **Sync/offline:** delivery accepts `connectionState` and records `queued` vs `delivered`, mirroring
  the existing player-view/active-map projection pattern.
- **UX:** active-session gating, empty states, and error states are rendered on all three surfaces.
- **Maintainability:** small typed modules; reused the existing visibility-filter, grants, content/
  party actor-filtered reads, op-log/lifecycle, and player-view projection rather than parallel
  systems.
- **Docs:** this completion file; `pnpm docs:validate` green.

## Known Gaps / Deferred

- Handout "groups": recipients are selected as individual players/observers. A named Player Group
  abstraction is not part of this epic's scope (no PERM group model exists yet); group delivery would
  be a thin expansion over the existing recipient list.
- Quick-reference stat-block panels resolve a character via the party overview or a content-item stat
  block; a dedicated stat-block entity type is not introduced (none exists in v2 yet).
- The handout widget is binding-free and references the handout by configuration id; a richer
  in-canvas handout renderer is left to a later canvas slice (per ADR-014 the first slice renders via
  the actor-filtered read).

## Stop Conditions

None hit. The ADR-014 stack supports the approach; no v1 runtime imports were required; visibility/
permission/persistence behavior was unambiguous (reused the documented PERM + session patterns); the
workpack validates; and `git status --short` showed no unrelated overlapping changes.

## Status Command

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SES-handouts-and-tools`;
`pnpm v2:workpack:validate` passes with no drift).

## Git Evidence

- Branch: `epic/SES-handouts-and-tools` (from `efc9d2c`).
- Commit SHA: recorded in the follow-up docs commit.
- Final `git status --short`: clean (recorded after the commit below).
