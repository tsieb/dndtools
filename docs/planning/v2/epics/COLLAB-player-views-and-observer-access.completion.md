# COLLAB-player-views-and-observer-access — Completion Evidence

Epic: `COLLAB-player-views-and-observer-access` — COLLAB: Player views and observer access
Requirement IDs: COLLAB-005, COLLAB-011
Architecture contracts: Contract 1 (Processing / Display Decoupling — policy/filtering in the Processing
Core; the GUI renders computed view models only); Contract 3 (Role, Visibility & Permission Grant Model —
Base Roles observer ceiling, scene visibility, character-data denial); Contract 4 (Scene & Widget Contract —
Player View Rules: per-player projection, `co-editor`-gated player-view edits, hidden bound fields never
reach a player device).

Workpack status: `complete`

This epic delivers the PLAYER VIEWS + OBSERVER ACCESS collaboration branch as PURE Processing-Core policy
that the GUI only renders (Contract 1). It REUSES the established COLLAB/PERM/CANVAS primitives and does not
duplicate them: per-player projection is the existing `session.project-player-view` command +
`getPlayerViewForActor` actor-filtered read; the observer ceiling is the PERM-001/011
`computeEffectivePermissions`; scene visibility is the PERM `evaluateSceneVisibility`; the character-data
denial is the PERM-011 `decideCharacterDataRead`; the `co-editor` gate is the same `actorCanCoEditScene`
rule the scene-edit command reducers enforce. The two new core modules compose those primitives into the
precise, fail-closed guarantees the two requirements need, and the observer write gate is wired into
`dispatchCommand` so every command an observer invokes is rejected BEFORE mutation. All new core logic is
deterministic over plain data — no DOM/Node/Svelte/clock/entropy/network. Boundary lint stays green; no v1
imports.

## Demo

Surface: the Session route, `/session/`. Start an active session from the home Command Center
(`session-workflow-active`), then open `/session/`. The "View as" header control (`view-as-select`)
re-renders every surface against another actor. The new PLAYER VIEW + OBSERVER ACCESS surface
(`player-view-access`) is PARTICIPANT-ONLY (a player/observer surface) — the DM never sees it. The surface
renders as a stacked panel on both desktop and compact (mobile) profiles, so the demo path is identical on
both Playwright projects. The DM controls per-player projection from the Scene editor (`/scene/[id]/` →
"Player View" → choose a player and a widget subset → Project).

### COLLAB-005 — per-player Player View assignments during one session

1. As the DM, open a shared scene (`/scene/[id]/`), add several widgets, then in the "Player View" panel
   project DIFFERENT widget subsets to DIFFERENT players (e.g. widget 1 to Demo Player, widget 2 to Demo
   Player 2). Each projection is a separate `session.project-player-view` command with its own
   `SessionPlayerViewAssignment`.
2. Switch "View as" to Demo Player and open `/session/`: the `player-view-access` panel shows ONLY that
   player's assigned subset (`player-view-widgets`). Switch to Demo Player 2: a DIFFERENT subset. Neither
   player's view ever contains the other's widget — the Processing Core resolves each view independently
   against that actor's own assignment + visibility.
3. A player with no projection sees an explicit "No active player view" state (`player-view-none`) — no
   default DM layout leaks.
4. A player WITHOUT a scene `co-editor` grant cannot add/move/configure a widget on their player view: the
   `scene.add-widget` (etc.) command is rejected fail closed (`actor-not-authorized`); the surface marks
   the view `read-only`. With a `co-editor` grant the same command is accepted (gate and command agree).

### COLLAB-011 — observer read-only access

1. Switch "View as" to Demo Observer and open `/session/`: the `player-view-access` panel shows the
   read-only note (`observer-readonly-note`, "read-only access to shared scenes only") and the observer's
   SHARED-SCENE list (`observer-visible-scenes`) — which excludes `dm-only` content, private player views
   projected to other actors, and character sheets by construction. With nothing shared, the list shows
   `observer-scenes-empty`.
2. The observer never sees a DM-only control surface (e.g. the `player-groups` panel is absent for the
   observer) and never sees any write affordance.
3. Any write-capable command the observer invokes is rejected BEFORE mutation by the Processing Core: the
   `dispatchCommand` observer gate classifies the actor and rejects EVERY command type for an observer
   (`actor-not-authorized`), so no reducer ever runs and state is unchanged. A non-observer passes through
   to the command's own reducer.

### Demo gaps intentionally deferred out of this epic

- Per ADR-014 the LIVE collaboration transport (websocket/push, real participant connection state) and
  cloud sync are deferred. This epic delivers the POLICY a transport plugs into; the multi-player
  projection snapshot and observer surface are computed from the local session state.
- The DM per-player projection UI in the Scene editor (one player at a time) predates this epic (CANVAS
  player-view). This epic adds the PARTICIPANT-facing surface + the multi-player projection/observer core
  policy and the fail-closed observer write gate; it does not redesign the DM projection UI.

## Requirement coverage / traceability

### COLLAB-005 — the DM controls different Player View assignments for different players during one session

- AC1 — "Given Player A and Player B are connected, when the DM projects different Scene subsets, then each
  player receives only their assigned subset."
  - Code: `apps/v2/packages/core/src/collab/player-views.ts` (`projectPlayerViews` resolves EACH connected
    non-DM participant's OWN filtered player view via `getPlayerViewForActor`; `deliveredWidgetInstanceIds`
    + `crossPlayerLeakedWidgetIds` prove a participant's delivered view never exceeds their own
    assignment). The underlying per-player assignment + actor-filtered read are
    `apps/v2/packages/core/src/commands/player-view.ts` (`handleProjectPlayerView`) and
    `apps/v2/packages/core/src/queries/scene.ts` (`getPlayerViewForActor`).
  - GUI: `apps/v2/app/src/lib/gui/PlayerViewAccess.svelte` (renders the participant's own filtered view).
  - Tests: `apps/v2/packages/core/tests/collab-player-views.test.ts` ("Player A and Player B each receive
    ONLY their own assigned widget subset"; "an unassigned connected player gets an unassigned view"; "the
    DM and an unknown id are excluded"). E2e:
    `apps/v2/app/tests/e2e/collab-player-views-observer-access.spec.ts` (participant-only; "no active player
    view" empty state).
- AC2 — "Given a player attempts to add a widget to their Player View without `co-editor`, when submitted,
  then the command is rejected."
  - Code: `apps/v2/packages/core/src/collab/player-views.ts` (`playerCanEditPlayerView`, delegating to
    `actorCanCoEditScene` — the SAME authority the scene-edit reducers enforce in
    `apps/v2/packages/core/src/commands/widget.ts`). Enforcement point unchanged: `handleAddWidget` rejects
    a non-`co-editor` with `actor-not-authorized`.
  - Tests: `apps/v2/packages/core/tests/collab-player-views.test.ts` ("a player WITHOUT co-editor cannot
    add a widget to their Player View (rejected)"; "a player WITH co-editor may edit"; "an observer can
    never edit a Player View, regardless of grants").

### COLLAB-011 — observers join as read-only participants with access only to shared scenes/maps/placeholders

- AC1 — "Given an observer joins a session, when join succeeds, then their visible scene list excludes
  character sheets, private player views, and DM-only content."
  - Code: `apps/v2/packages/core/src/collab/observer-access.ts` (`observerVisibleScenes` /
    `observerAccessSummary` — composes `evaluateSceneVisibility`
    (`apps/v2/packages/core/src/permissions/visibility.ts`), the observer ceiling
    `computeEffectivePermissionsForActor` (`apps/v2/packages/core/src/permissions/base-roles.ts`), and the
    character-data guard `decideCharacterDataRead` (`apps/v2/packages/core/src/permissions/consistency.ts`)).
    A `dm-only` scene is hidden; a `shared` scene projected privately to ANOTHER actor stays hidden to the
    observer; a non-observer/unknown actor is denied fail closed.
  - GUI: `apps/v2/app/src/lib/gui/PlayerViewAccess.svelte` (renders the observer read-only shared-scene
    list + read-only note).
  - Tests: `apps/v2/packages/core/tests/collab-observer-access.test.ts` ("an observer scene list excludes
    dm-only content and private player views"; "an observer access summary is read-only with no character
    data"; "denied fail closed for non-observers and unknown actors"). E2e:
    `apps/v2/app/tests/e2e/collab-player-views-observer-access.spec.ts` ("an observer sees a read-only
    surface with a shared-scene list and no controls").
- AC2 — "Given an observer invokes any write-capable command, when the command is validated, then it is
  rejected before mutation."
  - Code: `apps/v2/packages/core/src/collab/observer-access.ts` (`classifyObserverCommand` — fail-closed,
    rejects EVERY command type for an observer; an unknown actor is treated as the least-privileged observer
    ceiling). Wired into `apps/v2/packages/core/src/commands/dispatch.ts` (the observer gate runs BEFORE the
    command switch, so no reducer/mutation runs for an observer).
  - Tests: `apps/v2/packages/core/tests/collab-observer-access.test.ts` ("an observer invoking ANY
    write-capable command is rejected before mutation" — a representative spread across domains, state
    unchanged; "the observer command gate is exhaustive (fail closed) — even an unknown/forged command
    type"; "a DM write command still succeeds"). Regression-strengthened:
    `apps/v2/packages/core/tests/character-creation-and-drafts.test.ts` (an observer draft edit is now
    rejected at the read-only gate with `actor-not-authorized` rather than `not-draft-owner`).

## Quality gates

| Gate | Command | Result |
| --- | --- | --- |
| Core unit/integration tests | `pnpm --filter @dndtools/v2-core test` | PASS — 116 files, 1609 tests (12 new) |
| Type checks (core `tsc --noEmit` + app `svelte-check`) | `pnpm v2:typecheck` | PASS — 0 errors, 0 warnings |
| v2 boundary lint | `pnpm v2:lint` | PASS — v2 boundary lint passed |
| Full ESLint (CI gate) | `pnpm lint` | PASS — eslint + nav-layer + token-compliance + repo-boundary audit all clean |
| Docs validate (CI gate) | `pnpm docs:validate` | PASS — docs validation passed |
| Workpack validate | `pnpm v2:workpack:validate` | PASS — v2 workpack validation passed |
| Playwright e2e (desktop-chromium + mobile-chromium) | `pnpm --filter @dndtools/v2-app e2e` | 453 passed, 18 skipped, 1 PRE-EXISTING failure unrelated to this epic (see below). The new epic spec passes on BOTH projects (6/6). |

### E2e note (pre-existing, out-of-scope failure)

The single e2e failure is `session-handouts-and-tools.spec.ts:94` (SES-005 timer operate) on
`mobile-chromium` only: the `reconnect-status` section intercepts the pointer event for the `timer-start`
button on the narrow mobile viewport (a layout-overlap flake in the SES Live Tools surface). This was
confirmed REPRODUCIBLE on the baseline session page with this epic's GUI change stashed, so it is a
pre-existing flake unrelated to COLLAB-005/011 and outside this epic's scope (the SES-005 live-tools
surface). The new participant `player-view-access` surface is appended after the existing live-session
surfaces and does not introduce the overlap. The epic's own e2e spec
(`collab-player-views-observer-access.spec.ts`) passes 6/6 across both projects.

## Quality review summary

- Correctness: every mapped AC implemented and tested (unit + e2e). Fail-closed throughout.
- Architecture: pure Processing-Core policy; GUI renders computed view models only (Contract 1). Observer
  ceiling, scene visibility, and `co-editor` gate reuse existing PERM/CANVAS engines — no duplication, no
  second authority source. The observer write gate is enforced at the command boundary (Contract 1 binding
  rule 1: commands are the only mutation interface). No v1 runtime imports; boundary lint green.
- Security / permissions: observer is read-only with zero write authority — every command type rejected
  before mutation; an unknown actor is treated as the least-privileged observer ceiling. A player cannot
  edit a player view without `co-editor`. Hidden bound fields never reach a player device (the underlying
  actor-filtered read omits them).
- Data safety: the player-view snapshot and observer surface are derivations over local session state; no
  default DM layout leaks to an unassigned participant; private player views projected to other actors are
  never visible to an observer.
- Accessibility / UX: the participant surface uses semantic sections/headings/lists and renders as a
  stacked panel on both desktop and compact profiles (same view models, same commands).
- Performance: pure, synchronous, O(participants × widgets) derivations; no network/storage in the policy.
- Persistence / sync / offline: no new durable state document; per-player assignments are the existing
  durable `SessionPlayerViewAssignment`. Per ADR-014 the live transport and cloud sync remain deferred.
- Maintainability: two small, cohesive, typed modules + a focused GUI surface; comment density matches the
  existing COLLAB modules.
- Docs: this completion evidence + the epic packet; generated planning files regenerated via the workpack
  commands.

## Changed files

Modified:
- `apps/v2/packages/core/src/commands/dispatch.ts` (wire the fail-closed observer write gate before the
  command switch — COLLAB-011 AC2)
- `apps/v2/packages/core/src/index.ts` (export the COLLAB-005 player-views + COLLAB-011 observer-access APIs)
- `apps/v2/packages/core/tests/character-creation-and-drafts.test.ts` (regression: an observer draft edit is
  now rejected at the read-only gate; assertion updated per actor, AC3 intent preserved/strengthened)
- `apps/v2/app/src/routes/session/+page.svelte` (mount the participant `PlayerViewAccess` surface + doc note)
- `docs/planning/v2/epics/COLLAB-player-views-and-observer-access.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (source-of-truth status)

Added:
- `apps/v2/packages/core/src/collab/player-views.ts` (COLLAB-005 multi-player projection + `co-editor` gate)
- `apps/v2/packages/core/src/collab/observer-access.ts` (COLLAB-011 observer surface + write gate)
- `apps/v2/packages/core/tests/collab-player-views.test.ts` (COLLAB-005 unit/integration coverage)
- `apps/v2/packages/core/tests/collab-observer-access.test.ts` (COLLAB-011 unit/integration coverage)
- `apps/v2/app/src/lib/gui/PlayerViewAccess.svelte` (participant player-view + observer access surface)
- `apps/v2/app/tests/e2e/collab-player-views-observer-access.spec.ts` (e2e, both projects)
- `docs/planning/v2/epics/COLLAB-player-views-and-observer-access.completion.md` (this file)

## Known gaps / deferred

- Per ADR-014 the LIVE collaboration transport, real participant connection state, and cloud sync remain
  deferred; this epic delivers the policy a transport plugs into.
- The DM per-player projection UI in the Scene editor (one player at a time) is unchanged; the multi-player
  projection snapshot (`projectPlayerViews`) is the core policy a richer multi-player DM control could
  render later.
- Pre-existing mobile e2e flake in SES-005 live tools (`reconnect-status` overlaps the timer button on a
  narrow viewport) is out of scope for this epic and documented above.

## Git

Branch: `epic/COLLAB-player-views-and-observer-access` (chained off the prior epic HEAD
`COLLAB-live-session-state-and-presence` @ 9084735, per the v2 epic-branching convention).
Commit SHA (feat): _recorded in the follow-up `docs(v2): record commit SHA …` commit._

### Final `git status --short`

```
(to be captured after the completion commit; see the follow-up SHA commit)
```
