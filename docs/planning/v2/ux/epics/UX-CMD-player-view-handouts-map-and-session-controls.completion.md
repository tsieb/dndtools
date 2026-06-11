# Completion — UX-CMD-player-view-handouts-map-and-session-controls

UX workpack status: `complete`

Epic: Command Center Player Views, Handouts, Map, and Session Controls (phase "04 Trust and
Safety", P0).
Requirement coverage: `UX-CMD-004` (`UX-CMD-004-S01`), `UX-CMD-005` (`UX-CMD-005-S01`),
`UX-CMD-006` (`UX-CMD-006-S01`), `UX-CMD-007` (`UX-CMD-007-S01`), `UX-CMD-009`
(`UX-CMD-009-S01`), `UX-CMD-010` (`UX-CMD-010-S01`), `UX-CMD-011` (`UX-CMD-011-S01`).

## Summary

Finished the Command Center live-control surface on the `/` home route: per-participant PREVIEW and
PUSH affordances on the Player-View Controller rows, a DM-only player-view preview modal rendered
through the participant's OWN actor-filtered core query, a three-step confirmed push-handout flow
with a default-deny content selector, "Projecting / Not projecting" glance state + player-safe
projection on the active-map embed, the widget library converted to a quick-access drawer, a Phase
badge popover implementing the spec'd confirmation contract (pause/resume immediate, start/archive
one confirmation, end-session a hard two-step), and command palette parity for all of it.

One new pure Processing-Core read-model module — `packages/core/src/queries/command-center-live.ts`
— owns the live-control policy: `listSessionPhaseActions` (valid, spec'd transitions only — invalid
ones ABSENT, DM-gated fail closed), `listPushableContent` (DEFAULT-DENY: only `player-visible`
vault items are pushable; `dm-only` AND `shared` items are structurally absent),
`resolvePushHandoutCommand` (the single resolver producing the exact `session.deliver-handout`
command for both the visible flow and the palette), and `getActiveMapProjectionSummary` (DM-only
projection glance state matched against the CURRENT active map+region). The palette catalog
(`queries/command-actions.ts` + `queries/command-availability.ts`) gained DM-gated session-phase,
set-active-map, project-map, push-handout, and preview-player-view entries that dispatch/route to
the identical paths the visible controls use.

## Demo path / surfaces

`/` (Command Center home) with the header `View as` switch; `/session` to verify recipient-side
handout state; `/knowledge` and `/scenes` for authoring fixtures.

- **UX-CMD-004 Player-View Controller:** all connected participants (3 demo players + observer)
  are listed directly on the home — no drawer, no settings route. Each row keeps the Scene
  selector + Deliver/Queue/Revoke and adds a labelled "Preview" (`Preview <name>'s view`) and
  "Push handout" (`Push handout to <name>`) button.
- **UX-CMD-005 preview modal:** `cc-player-view-preview-<actor>` opens an a11y `Dialog` whose body
  is rendered from `getPlayerViewForActor(<participant actorId>)` — the SAME query the real player
  home consumes, never a cosmetic filter. Banner: "DM preview — players cannot see this preview."
  An unassigned participant shows "No scene assigned", never a blank frame. Escape closes and the
  focus trap restores focus to the eye button that opened it.
- **UX-CMD-006 push flow:** content → recipients ("All players" + per-participant checkboxes) →
  a confirmation that names the content AND every recipient before anything moves. Cancel at any
  step delivers nothing. The selector lists only `listPushableContent` (a dm-only note is
  structurally absent). Confirmed pushes dispatch `resolvePushHandoutCommand`'s
  `session.deliver-handout` — the recipient sees the handout on `/session`, a non-recipient sees
  nothing.
- **UX-CMD-007 active map:** the embed section surfaces "Projecting to N players / Projection
  queued / Not projecting" as text (`cc-map-projection-state`, `data-projecting` for the border
  tone) from `getActiveMapProjectionSummary`; the Project control reads "Project to players" /
  "Projecting" with `aria-pressed`. Projection now targets every player-role actor (matching the
  palette command). The player projection excludes dm-only layers ("Hidden Camps" never appears in
  `cc-player-map-preview`); "Change map" + re-bind swaps the embed without leaving the home and
  drops the stale "Projecting" state.
- **UX-CMD-009 widget library drawer:** the inline library became a drawer behind a single
  "Add widget" button (`cc-add-widget`). The search field is auto-focused on open; unsupported
  widgets stay visibly distinct with the core-reported reason and cannot be added; "Add" places
  the widget and closes the drawer immediately.
- **UX-CMD-010 phase controls:** the Phase badge (`cc-phase-badge`) opens a `role="menu"` popover
  listing ONLY the valid transitions from `listSessionPhaseActions`. Pause/resume dispatch
  immediately (no dialog); Start/Archive take one confirmation dialog naming the player-facing
  effect; End session is a hard two-step (dialog 1 "End this session?" → `ending`, dialog 2 "Open
  the session recap?" → `recap`). Cancel holds initial focus in confirmations (safer default);
  transitions announce via the shared assertive live region. Participants see the paused state on
  their own status strip and the Processing Core already blocks live commands while paused.
- **UX-CMD-011 palette parity:** Start/Pause/Resume/End/Archive (`cc.session.phase:<target>`,
  identical `session.set-workflow` payloads), "Set active map: <name>", "Project active map to
  players" (unavailable reasons are generic and non-leaking: "No active map selected." / "Session
  is not active."), "Push handout to players…" (`cc.push-handout` → `/?push-handout=1`, opening
  the SAME confirmed flow), and "Preview <player>'s view" (`cc.preview-view:<actor>` →
  `/?preview-view=<actor>`, opening the SAME modal). All DM-only entries are HIDDEN entirely for a
  non-DM actor (absent from the catalog, not disabled).

Platform parity: Desktop (popover menus, keyboard paths incl. Escape/focus restoration), Mobile
(same dialogs/flows as modal sheets, ≥44 px button targets via the comfortable-density global
rule) — the full new spec runs on BOTH Playwright projects.

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-CMD-004** participant list + ≤2-tap assignment + preview/push affordances | `apps/gm/src/routes/+page.svelte` Player-View Controller rows (preview/push buttons, aria-labels); existing `getPlayerViewController` | e2e `apps/gm/tests/e2e/command-center-live-controls.spec.ts` "UX-CMD-004"; assignment AC covered by `command-center-home.spec.ts` + `command-center.spec.ts` |
| **UX-CMD-005** DM-only preview, no hidden content, Escape/focus, "No scene assigned" | `apps/gm/src/lib/gui/ux-cmd/PlayerViewPreviewModal.svelte` (renders `getPlayerViewForActor(participant)`, a11y Dialog focus trap) | e2e "UX-CMD-005 … no DM-only leak; Escape restores focus" (marker `not.toContainText`, `toBeFocused`, unassigned state) |
| **UX-CMD-006** ≤3-action push, confirmation names content+recipients, cancel delivers nothing, hidden content never listed | core `packages/core/src/queries/command-center-live.ts` `listPushableContent` + `resolvePushHandoutCommand`; GUI `apps/gm/src/lib/gui/ux-cmd/HandoutPushFlow.svelte` | core `packages/core/tests/command-center-live.test.ts` (AC4 marker test, empty-push null, dispatchable command); e2e "UX-CMD-006" cancel + deliver tests (recipient/non-recipient via `/session`) |
| **UX-CMD-007** projection state, dm-only layer exclusion, change-map without navigation | core `getActiveMapProjectionSummary`; `+page.svelte` projection pill + toggle label + all-players projection; existing `getActiveMapViewForActor` filtering | core projection-summary tests; e2e "UX-CMD-007" (Hidden Camps excluded from player preview, Projecting↔Not projecting, URL stays home) |
| **UX-CMD-009** searchable drawer, unavailable distinct + reason, add closes ≤300 ms | `+page.svelte` `cc-add-widget` + `Dialog` drawer (search autofocus effect, add closes drawer) | e2e `apps/gm/tests/e2e/widget-library.spec.ts` (drawer open in beforeEach, filter AC, add closes drawer + widget renders) |
| **UX-CMD-010** phase badge popover, pause immediate, end two-step, archive confirm, paused participants | core `listSessionPhaseActions` (+ confirmation contract); GUI `apps/gm/src/lib/gui/ux-cmd/SessionPhaseControls.svelte` | core phase-action tests (per-state actions, fail-closed non-DM); e2e "UX-CMD-010" full lifecycle walk incl. participant paused strip |
| **UX-CMD-011** palette parity, identical commands, DM-only hidden for non-DM | `packages/core/src/queries/command-actions.ts` (session/map groups), `packages/core/src/queries/command-availability.ts` (push-handout + preview navigation entries), `+page.svelte` `?preview-view=` / `?push-handout=` param handling | core "UX-CMD-011" describe (identical pause payload, non-leaking reasons, non-DM `[]`, dm-only marker absent from DM palette); e2e "UX-CMD-011" parity + player-palette no-leak tests |

## Actor-safety / no-leak evidence

- **Preview modal (UX-CMD-005):** renders ONLY the output of `getPlayerViewForActor` queried AS the
  participant — the same default-deny read model the real player home uses, so DM-only
  scenes/widgets are structurally absent. E2E creates a dm-only scene named with marker
  `DMSECRETLIVE7Q` and asserts `cc-preview-modal` `not.toContainText` it (both profiles).
- **Push flow (UX-CMD-006):** `listPushableContent` is DEFAULT-DENY (only `player-visible`; both
  `dm-only` and grant-scoped `shared` items excluded, fail closed; non-DM actors get `[]`). Core
  test proves `JSON.stringify(pushable)` carries no marker; e2e proves the dialog never renders a
  dm-only note title and that a non-recipient's `/session` shows nothing after delivery.
- **Projection (UX-CMD-007):** the player-facing projection is the existing actor-filtered
  `getActiveMapViewForActor`; e2e asserts the dm-only "Hidden Camps" layer is absent from the
  player preview while the DM's own embed shows it.
- **Palette (UX-CMD-011):** `listCommandActions` returns `[]` for any non-DM (pre-existing gate);
  the new preview/push navigation entries sit behind the same `actorCanAuthorScene` guard, so they
  are ABSENT from a player's palette DOM (hidden, not disabled). E2E (player view-as) asserts zero
  `cc.session.phase:*` / `cc.push-handout` / `cc.preview-view:*` entries and no marker text. The
  participant home (`command-center-home.spec.ts`) additionally asserts `cc-phase-controls`,
  `cc-push-open`, and `cc-add-widget` have count 0 for a player.
- **Quick-switcher interaction:** per-item "Push to players: <title>" commands were intentionally
  NOT enumerated in the command registry (the registry also feeds the quick switcher's command
  mode, where entity titles must not surface — SRCH-005). Push parity is the single contextual
  `cc.push-handout` entry instead, with content chosen inside the confirmed flow.

## Tests / gates run

- `pnpm typecheck` (core `tsc` + app `svelte-check`) — **0 errors, 0 warnings (4727 files)**.
- Targeted core vitest (`packages/core/tests/command-center-live.test.ts` + affected
  `command-actions` / `command-availability` / `quick-switcher-query`) — **31 tests pass**.
- Full core vitest — **3073 tests pass (192 files)** (was 3061/191; +12 new).
- Full app vitest — **475 tests pass (60 files)** (includes the theme-token gate, fixed below).
- `pnpm lint` (full eslint + boundary + nav-registry + a11y contrast) — **PASS**.
- `pnpm docs:validate` — **PASS**.
- New e2e `apps/gm/tests/e2e/command-center-live-controls.spec.ts` — **16 pass** (8 tests ×
  desktop-chromium + mobile-chromium), all four no-leak/negative assertions included.
- Full Playwright suite, BOTH projects — **713 passed, 39 skipped, 0 failed** (baseline 697 + 16
  new). Note: the workstation was under heavy external desktop load during verification; some
  combined runs (including a BASELINE run with all changes stashed, which failed
  `session-combat-and-encounters` SES-002) dropped one random spec to contention. Every such spec
  (`command-palette-nav`, `perm-visibility-preview-badges`) passes in isolation and in the final
  clean combined run above; no failure is attributable to this epic's changes.
- `pnpm ux-workpack:validate` — **PASS** (after `ux-workpack:complete`; no generated drift).

## Files changed

New — Processing Core:
- `packages/core/src/queries/command-center-live.ts` (live-control read models:
  `listSessionPhaseActions`, `listPushableContent`, `resolvePushHandoutCommand`,
  `getActiveMapProjectionSummary`)

New — GUI (`apps/gm/src/lib/gui/ux-cmd/`):
- `PlayerViewPreviewModal.svelte`, `HandoutPushFlow.svelte`, `SessionPhaseControls.svelte`

New — tests:
- `packages/core/tests/command-center-live.test.ts`
- `apps/gm/tests/e2e/command-center-live-controls.spec.ts`

Modified — core:
- `packages/core/src/queries/command-actions.ts` (session-phase / set-active-map / project-map
  palette actions; `CommandActionStateView` widened with `session`/`maps`/`content`)
- `packages/core/src/queries/command-availability.ts` (DM-gated `cc.push-handout` +
  `cc.preview-view:<actor>` navigation entries; `map` category mapping)
- `packages/core/src/index.ts` (barrel exports for the live module)

Modified — app:
- `apps/gm/src/routes/+page.svelte` (preview/push row buttons + `cc-push-open`, phase controls
  mount, projection state pill + all-players projection, widget-library drawer + search autofocus,
  `?preview-view=` / `?push-handout=` palette-parity params with race-guards)
- `apps/gm/src/routes/styles.css` (baseline gate fix: the UX-PERM preview-mode shell offset
  `padding-top: 48px` → `var(--space-12)`; the raw px literal failed the UX-VIS-005 token unit
  gate at branch HEAD before this epic's changes)
- `apps/gm/tests/e2e/widget-library.spec.ts`, `apps/gm/tests/e2e/command-palette.spec.ts`
  (UX-CMD-009 drawer: readiness wait + open-drawer step), and
  `apps/gm/tests/e2e/command-center-home.spec.ts` (player no-leak now asserts the new DM-only
  controls `cc-add-widget` / `cc-phase-controls` / `cc-push-open` are absent)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CMD-player-view-handouts-map-and-session-controls.yaml`

## Known gaps / deferred

- **Preview modal fidelity (UX-CMD-005 §spec / §12.1):** the preview renders the participant's
  view as the core-filtered scene summary (name, delivery state, widget list), not a second live
  canvas render; the surface doc itself flags the render strategy as an open technical decision.
  The no-leak and interaction ACs are fully met; canvas-fidelity preview follows the deferred
  render-engine decision (ADR-014 / architecture-decisions §4).
- **Previous/next player arrows + swipe navigation in the preview modal** (spec nicety, not an AC)
  are deferred; each row's eye button opens its own preview directly.
- **Vault-browser right-click "Push to players" entry point** (UX-CMD-006 entry point (b)): the
  flow is reachable from participant rows, the panel-level "Push handout…" button, and the command
  palette; a vault-browser context-menu integration belongs to the CONTENT surface epics.
- **Per-item palette push commands** are intentionally replaced by the contextual
  `cc.push-handout` entry (see actor-safety notes — avoids entity titles in the quick switcher's
  command mode, per the UX-CMD-011 "contextual when content is selected" spec).
- The map embed remains the existing list-style preview (no WebGL/canvas embed) per the deferred
  render-engine decision; layer on/off toggles inside the embed ride with the maps surface epics.

## Git evidence

- Branch: `ux/UX-CMD-player-view-handouts-map-and-session-controls` (off
  `ux/UX-PERM-visibility-preview-badges-and-privacy-status` @ `a75e2e8`).
- Commit: `feat(ux): UX-CMD player views, handouts, map, and session controls` (recorded after
  this evidence file + regenerated UX state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/gm/src/routes/+page.svelte
 M apps/gm/src/routes/styles.css
 M apps/gm/tests/e2e/command-center-home.spec.ts
 M apps/gm/tests/e2e/command-palette.spec.ts
 M apps/gm/tests/e2e/widget-library.spec.ts
 M docs/planning/v2/ux/epics/UX-CMD-player-view-handouts-map-and-session-controls.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M packages/core/src/index.ts
 M packages/core/src/queries/command-actions.ts
 M packages/core/src/queries/command-availability.ts
?? apps/gm/src/lib/gui/ux-cmd/HandoutPushFlow.svelte
?? apps/gm/src/lib/gui/ux-cmd/PlayerViewPreviewModal.svelte
?? apps/gm/src/lib/gui/ux-cmd/SessionPhaseControls.svelte
?? apps/gm/tests/e2e/command-center-live-controls.spec.ts
?? docs/planning/v2/ux/epics/UX-CMD-player-view-handouts-map-and-session-controls.completion.md
?? packages/core/src/queries/command-center-live.ts
?? packages/core/tests/command-center-live.test.ts
```
