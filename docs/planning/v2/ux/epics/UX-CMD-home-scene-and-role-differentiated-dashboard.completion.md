# Completion — UX-CMD-home-scene-and-role-differentiated-dashboard

UX workpack status: `complete`

Epic: Command Center Home Scene and Role-Differentiated Dashboard (phase "03 Canvas and Command
Center", P0). This is the final Phase 03 epic.
Requirement coverage: `UX-CMD-001` (`UX-CMD-001-S01`), `UX-CMD-002` (`UX-CMD-002-S01`),
`UX-CMD-003` (`UX-CMD-003-S01`), `UX-CMD-008` (`UX-CMD-008-S01`), `UX-CMD-012` (`UX-CMD-012-S01`).

## Summary

Turned the `/` home route into a populated, role-differentiated live-play Command Center on top of the
existing DM dashboard, the actor-filtered Processing-Core read models, and the design tokens / platform
profiles — without swapping the render engine (DOM/CSS baseline behind `ViewportController`, DEFERRED
per ADR-014 / architecture-decisions §4; no WebGL/Canvas/Pixi introduced) and without regressing to a
document-list home.

Added one pure, unit-tested Processing-Core read model — `queries/command-center-home.ts` — that is the
**single viewer-gated choke point** for the home. It exposes `getSessionStatusStrip` (the glanceable
session strip, built only from already-actor-filtered models) and `resolveCommandCenterHome` (the DM /
player / observer split). Added the UX-CMD-008 recoverable last-known-good slot to the durable
command-center state plus two DM-only commands (`command-center.snapshot-auto-save`,
`command-center.restore-auto-save`). On the GUI side, added two accessible Svelte surfaces
(`SessionStatusStrip`, `ParticipantHome`) under `apps/v2/app/src/lib/gui/ux-cmd/` and restructured
`routes/+page.svelte` so the DM dashboard is rendered ONLY for a DM, a player/observer receives their
own controlled view, and the layout has a glanceable status strip + a recoverable safe point.

The DM/player/observer boundary is enforced by `resolveCommandCenterHome`: a non-DM actor gets a
`participant` view carrying only the player-safe status strip + their OWN player-view scene (already
filtered by `getPlayerViewForActor`), so the DM dashboard, its presets, its widget library, its
player-view controller, and the DM home scene's title never enter the participant DOM at all (different
component tree, not a hidden one). The status strip routes every potentially-sensitive cell through the
same gate: the combat TURN comes from `getCombatTrackerForActor` (a hidden active combatant yields no
name to a non-DM), AUDIO from `getSessionAudioView` (a participant only sees the player-safe track), and
the PLAYERS roster cell is DM-only (`null` for participants) so a connected-count never leaks the table
roster (anti-pattern 10.7).

## Demo path / surfaces

`/` (Command Center home), with the header `View as` switch and `/scenes` for authoring.

- **UX-CMD-001 home affordance:** the seven-section primary nav pins the Command Center first
  (`nav-command-center`, `aria-current="page"` on `/`), the brand links to `/`, and `Alt+Shift+H` is the
  global home shortcut (shipped by the SHELL/NAV epics). From any deep route a single nav action returns
  home (verified from `/characters`).
- **UX-CMD-002 populated default:** a fresh vault instantiates the system Command Center template
  (`command-center.ensure-home`) with seven pre-placed tools — Active Map, Initiative, Dice, Timers,
  Audio, Quick Reference, Prep — so the first run is an operations console, never a blank canvas
  (Desktop widget grid / Mobile focused-panel tablist).
- **UX-CMD-003 status strip:** a fixed, always-visible `role="status"` strip surfaces session phase
  (text label + semantic tone + a paused-only pulse that drops under reduced motion), the current combat
  turn, the DM-only players roster cell, and the audio track — all glanceable with no interaction.
  Starting the session flips the phase cell to "Active" without any extra click.
- **UX-CMD-008 recoverable layout:** a baseline safe point is captured automatically when the home is
  ready and refreshed on preset save/apply; "Save safe point" re-checkpoints and "Restore last safe
  point" rolls an experimental change back to the last-known-good (re-materializing widgets with fresh
  ids at the captured positions, skipping any widget whose package was removed).
- **UX-CMD-012 role split:** `View as: Demo Player` renders a participant home — the player-safe status
  strip, their assigned scene (or a "Waiting for the Dungeon Master" state), and a slim personal toolbar
  — with no DM controls. `View as: Demo Observer` renders the same read-only with an "Observer mode"
  label and no toolbar.

Platform parity: Desktop (full dashboard + keyboard nav), Tablet/medium (the same strip + participant
surfaces, touch targets ≥44 px), Mobile/compact (status strip flex-wraps, DM tools via the focused-panel
tablist, participant home and the role split identical) — verified on `desktop-chromium` +
`mobile-chromium`.

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-CMD-001** persistent home affordance reachable in one action (`aria-current`, single nav action from any surface) | `GlobalNav.svelte` home item (`nav-command-center`, `aria-current="page"`), `+layout.svelte` brand `/` + `Alt+Shift+H` (pre-existing SHELL/NAV) | e2e `command-center-home.spec.ts` "UX-CMD-001 … reachable … in one action" |
| **UX-CMD-002** default populated layout, no blank-canvas home | `command-center.ensure-home` + `DEFAULT_COMMAND_CENTER_TOOLS` (7 tools), DM `$effect` guard | e2e `command-center.spec.ts` "default Command Center renders the DM tools as widgets"; `command-center-home.spec.ts` UX-CMD-003 (strip proves ready home) |
| **UX-CMD-003** glanceable session status strip (phase/turn/players/audio, non-colour, reduced-motion) | `queries/command-center-home.ts` `getSessionStatusStrip`, `SessionStatusStrip.svelte`, `+page.svelte` (DM strip) + `ParticipantHome.svelte` (participant strip) | core `command-center-home.test.ts` (UX-CMD-003 describe, incl. hidden-combatant turn); e2e "UX-CMD-003 … status strip surfaces phase, players, and audio" |
| **UX-CMD-008** named layout presets save/apply + recover (last-known-good auto-save) | `state/command-center-state.ts` `CommandCenterAutoSave`, `commands/command-center.ts` `handleSnapshotCommandCenterAutoSave`/`handleRestoreCommandCenterAutoSave` (shared `materializeLayoutOntoScene`), `+page.svelte` capture/restore | core `command-center-autosave.test.ts`; e2e "UX-CMD-008 … safe point restores the layout" |
| **UX-CMD-012** role-differentiated DM/player/observer home, no DM-only leak | `queries/command-center-home.ts` `resolveCommandCenterHome` (choke point), `+page.svelte` role branch, `ParticipantHome.svelte` | core `command-center-home.test.ts` (UX-CMD-012 describe + no-leak); e2e "UX-CMD-012 … player … no leak" + "… observer … no leak" (both profiles) |

## Actor-safety / no-leak evidence

The single choke point is `queries/command-center-home.ts`:

- `resolveCommandCenterHome` is the home's ROLE gate. A non-DM actor receives a `participant` view that
  carries only the player-safe status strip + their OWN `getPlayerViewForActor` scene summary. The DM
  dashboard markup in `+page.svelte` is gated behind `{:else if homeView.kind === 'dm'}`, so for a
  player/observer the DM dashboard, its session-workflow controls, presets, widget library, player-view
  controller, and the DM home scene's title are NOT in the DOM (a different component tree, not a hidden
  one — anti-pattern 10.7).
- `getSessionStatusStrip` routes each sensitive cell through an already-filtered model: the combat TURN
  via `getCombatTrackerForActor` (a hidden active combatant is absent from `activeCombatantId`, so the
  strip shows "Combat in progress" with no name), AUDIO via `getSessionAudioView` (participant → only the
  player-safe track), and the PLAYERS roster cell is DM-only (`null` for participants) so a
  connected-count never reveals the table roster.

Negative tests prove it. **Core** (`command-center-home.test.ts`): a hidden active combatant carrying
`FORBIDDEN-DM-SECRET-7Q` is named in the DM turn cell but the player's `turn.activeName` is `null` and
`JSON.stringify(playerStrip)` does NOT contain the marker; a DM-only scene named with the marker is
absent (`not.toContain`) from both the player and observer resolved home views; the players roster cell
is `null` for participants. **E2E both profiles** (`command-center-home.spec.ts`): the DM authors a
DM-only scene `Secret DMSECRETZZZ9` and shares a separate `player-visible` scene; switching to the
player renders the participant home showing the shared scene, with `session-workflow`,
`cc-player-view-controller`, `cc-preset-list`, `cc-library-list`, and `cc-status-players` all at count 0,
and `DMSECRETZZZ9` + the "Command Center" DM home-scene name appearing NOWHERE
(`not.toContainText`); the observer path asserts the "Observer mode" badge, no toolbar, and the marker
absent. The axe scan of `/` reports no critical/serious violations on both profiles.

## Tests / gates run

- `pnpm v2:typecheck` (core `tsc` + app `svelte-check`) — **0 errors, 0 warnings (4681 files)**.
- Targeted core vitest (the 2 new files) — **13 tests pass (2 files)**.
- Full core vitest — **2863 tests pass (184 files)** (was 2849/182; +13 new + sanity).
- Full app vitest — **453 tests pass (56 files)** (unchanged; sanity for the touched route).
- `pnpm lint` (eslint + `lint:navigation` [132 files] + `lint:tokens` [132 files] + `a11y:contrast`
  [79 pair checks × 5 themes + 4 forced-colors] + `audit:repo` [5 tests]) — **PASS**.
- `pnpm docs:validate` — **PASS**.
- `pnpm a11y:axe` — **PASS (16/16, both profiles)** against the empty known-violations register.
- Playwright `command-center-home.spec.ts` — **9 pass** (5 × desktop-chromium + 4 × mobile-chromium; the
  free-canvas safe-point-restore is desktop-layout and skips on mobile), including the player + observer
  no-leak boundary on both profiles.
- Full Playwright suite (both profiles) — **670 passed, 32 skipped, 0 failures**. (The two documented
  pre-existing flakes — `character-creation-and-drafts` CHAR-002 mobile and `scene-create` Timer under
  combined runs — did not surface.)
- `pnpm v2:ux-workpack:validate` — **PASS** (after `complete`; no generated-file drift).

## Files changed

New — Processing-Core read model:
- `apps/v2/packages/core/src/queries/command-center-home.ts` (the viewer-gated home choke point:
  `getSessionStatusStrip` + `resolveCommandCenterHome`)

New — GUI surfaces (`apps/v2/app/src/lib/gui/ux-cmd/`):
- `SessionStatusStrip.svelte`, `ParticipantHome.svelte`

New — tests:
- `apps/v2/packages/core/tests/command-center-home.test.ts`,
  `apps/v2/packages/core/tests/command-center-autosave.test.ts`
- `apps/v2/app/tests/e2e/command-center-home.spec.ts`

Modified — core:
- `apps/v2/packages/core/src/state/command-center-state.ts` (`CommandCenterAutoSave` + optional
  `autoSave` slot, fail-closed hydration)
- `apps/v2/packages/core/src/commands/command-center.ts` (snapshot/restore handlers + shared
  `materializeLayoutOntoScene`, refactored from preset-apply)
- `apps/v2/packages/core/src/commands/types.ts` (2 command variants, 2 event variants,
  `auto-save-not-available` rejection)
- `apps/v2/packages/core/src/commands/dispatch.ts` (2 new cases)
- `apps/v2/packages/core/src/schemas/commands.ts` (`commandCenterAutoSaveInputSchema`)
- `apps/v2/packages/core/src/index.ts` (barrel exports: home read model + `CommandCenterAutoSave`)

Modified — app:
- `apps/v2/app/src/routes/+page.svelte` (role branch on `resolveCommandCenterHome`; DM status strip;
  UX-CMD-008 capture/restore + baseline `$effect`)
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` (initialize the `autoSave` slot)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CMD-home-scene-and-role-differentiated-dashboard.yaml`

## Known gaps / deferred

- **Auto-save granularity (UX-CMD-008):** the last-known-good slot checkpoints at deliberate good
  states (home ready, preset save/apply) and on the explicit "Save safe point", NOT on every keystroke;
  raw widget moves are intentionally what "Restore" rolls back. The 30-second undo-restore toast
  (UX-CMD-008 §spec) is not wired — restore is its own explicit action with a status line.
- **Status-strip audio name:** the audio cell shows the track source id for the DM (a generic "Playing"
  for participants) rather than a friendly track name; a human-readable audio title is a follow-up that
  depends on the audio library naming surface.
- **Player personal toolbar (UX-CMD-012):** the slim player toolbar ships a "My characters" link; the
  full dice / chat quick-access from the spec is deferred to the respective domain epics (the canvas
  itself already renders the player's assigned widgets read-only).
- **Player-view preview modal / handout push / map projection controls** remain owned by their existing
  Command Center surfaces (UX-CANVAS preview, session handouts) and were out of this epic's five reqs.
- Final render engine remains DEFERRED per architecture-decisions §4; this epic adds no GPU backend.

## Git evidence

- Branch: `ux/UX-CMD-home-scene-and-role-differentiated-dashboard` (off chain tip
  `ux/UX-CANVAS-chrome-bindings-templates-and-view-modes` @ `f51083c`).
- Commit: recorded in the orchestrator handoff (committed after this evidence file + regenerated UX
  state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/packages/core/src/commands/command-center.ts
 M apps/v2/packages/core/src/commands/dispatch.ts
 M apps/v2/packages/core/src/commands/types.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/schemas/commands.ts
 M apps/v2/packages/core/src/state/command-center-state.ts
 M docs/planning/v2/ux/epics/UX-CMD-home-scene-and-role-differentiated-dashboard.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/ux-cmd/
?? apps/v2/app/tests/e2e/command-center-home.spec.ts
?? apps/v2/packages/core/src/queries/command-center-home.ts
?? apps/v2/packages/core/tests/command-center-autosave.test.ts
?? apps/v2/packages/core/tests/command-center-home.test.ts
?? docs/planning/v2/ux/epics/UX-CMD-home-scene-and-role-differentiated-dashboard.completion.md
```
