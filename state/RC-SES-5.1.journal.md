# RC-SES-5.1 run journal

## Scope

Player-rolled initiative and readiness from the companion. The DM opens a "roll for initiative" call,
each player rolls from `/play`, the rolls land on the tracker rows, the DM accepts or adjusts and
starts. A per-player "ready" chip covers the same companion → tracker path outside combat.

Owned: `packages/core/src/commands/combat.ts`, `apps/gm-react/src/net`, `apps/gm-react/src/screens/play`,
`apps/gm-react/src/screens/session/CombatTracker.tsx`. Companions (§21.2): `src/i18n/messages/*.ts`,
`*.test.ts*`, `tests/e2e/*.spec.ts`. No agents, dispatcher mutations, push or promotion.

## Findings before implementing

- The fence rules out every core file a NEW command type needs: `commands/types.ts` (the `CoreCommand`
  union), `commands/dispatch.ts` (the switch), `schemas/commands.ts`, `state/combat-tracker.ts` (the
  state/log-kind types) and `lifecycle/session-workflow.ts`. So the feature rides EXISTING command
  types whose handlers live in `combat.ts`:
  - the call: `combat.start` with an optional `rollForInitiative` flag, validated by a schema built in
    `combat.ts` from `startCombatInputSchema.shape` (strict, so an unknown key is still refused);
  - the player's roll and the DM's adjustment: `combat.apply-resource` with `kind: 'initiative'`,
    intercepted in `handleApplyCombatResource` before the shared strict union parse. This is the one
    combat command that already carries per-character player authority (`actorMayEditCombatant`:
    DM, or `combat-participant` on that character), which is exactly "a player cannot set another
    player's initiative";
  - the start: `combat.advance-turn` from the call begins round 1.
- The call is represented as `status: 'running'` with `round: 0` — "before round 1". `round` is already
  documented as 0 before combat starts, and nothing in core requires a running combat to be ≥ 1
  (`combat-tracker.ts` hydrates `round ?? 0`; previous-turn already refuses round ≤ 1 / turn 0).
- No new log kind can be added. A player's roll is logged as kind `roll` (a dice roll made during
  combat, `session-visible`, `delta` = total) and a DM adjustment as `combatant-reordered` (it moves
  the row). The tracker derives "awaiting / rolled / set by DM" per row from those entries.
- `index.ts` (not owned) re-exports nothing from `combat.ts`, so gm-react cannot import a new core
  helper; the UI derives call state from the tracker view and `viewModels.ts` from core state.
- The system package's `initiativeFormula` ('modifier' in 5e) does not say WHICH attribute feeds
  `modifier`, and nothing evaluates it for a character today. The core rolls the d20 itself (the
  player never sends a total) and the player's device declares a bounded modifier from its sheet; the
  log label shows both, and the DM remains the authority.
- The P2P host allow-list (`PLAYER_REQUESTABLE_PREFIXES`) refuses `combat.*`. Widening it to all of
  `combat.apply-resource` would newly let player devices edit HP over P2P, so the host admits
  `combat.apply-resource` only with `kind: 'initiative'`.
- Presence (`ready`) is a side-channel by design and must not ride the command path. The "ready" chip
  on the tracker reads the host's peer roster (the same beat the player's toggle already sends).
- `screens/session/index.tsx` (which wires `CombatPanel`'s callbacks) is not owned, so the tracker's
  new controls dispatch through `useRuntime()` inside `CombatTracker.tsx`.

## Implementation

- `combat.ts`: `initiativeCallOpen(combat)` (running ∧ round 0). `combat.start` parses
  `startCombatWithCallInputSchema` (shared shape + `rollForInitiative`, strict); a call opens at round
  0 and logs "Initiative called for N combatant(s)."; the start op records `initiativeCall`.
  `combat.apply-resource` routes `kind: 'initiative'` to `handleCombatantInitiative`: `roll: {modifier}`
  (the core rolls `1d20±mod` seeded by the op id, modifier bounded ±20) or `value` (DM-only). Players:
  own character only (`actorMayEditCombatant`), only during the call, roll only, once. The row is
  re-inserted at `initiativeInsertionIndex`; the cursor stays 0 during the call. A roll logs `roll`
  (session-visible; `dm-only`/`shared` for a hidden combatant so its name never leaks), an adjustment
  `combatant-reordered` with `delta` = value. Op `combat.resource.initiative` under the combatant path.
  `advance-turn` from the call begins round 1 at turn 0 with no condition tick; `previous-turn` refuses
  during the call; `add-combatants`/`reorder-combatant` keep the cursor at 0 during the call.
- `net/SessionHost.ts`: exported `isPlayerRequestable(command)` — prefixes unchanged, plus exactly
  `combat.apply-resource` with `kind: 'initiative'`.
- `net/viewModels.ts`: `PlayerData.initiativeCall` (`InitiativeCallView`: own combatant via
  `combat-participant` grant, players only; DEX-derived modifier; rolled; counts over visible rows).
  During the call `turnOrder` marks nobody active, owed character rows show `init: null`, and
  `round`/`activeName` are null.
- `screens/play/shared.tsx`: `InitiativeCallCard` (prompt → "Roll initiative (d20 ±n)" → "You rolled
  N"). Rendered above the Stage grid (`Home.tsx`) and on the Dice tab (`Dice.tsx`); `Frame.tsx` sends
  the request via `session.requestCommand` when joined, else local dispatch as the viewer.
- `screens/session/CombatTracker.tsx`: idle "Roll for initiative" (DM, live, not previewing) starts a
  call with every PC; during the call a banner (help, live-region "N of M characters rolled", "Start
  round 1" = `onAdvance`) replaces the round strip; rows show "Awaiting roll" / "Rolled N" /
  "Adjusted" and no Active; the DM's `InitiativeAdjust` field sits in the selected-combatant panel;
  idle "Table readiness" chips from the host's connected player peers.
- i18n: `session.combat.initiative.*`, `session.combat.ready.*`, `play.initiative.*` (en + es; the
  player strings use `{gm}`, never a literal DM, per RC-SYS-2.6).
- `dsn/no-raw-style-values` is a per-file ratchet (allow-list not owned): every added layout value
  uses `T.space.*` / `T.radius.*`, so each file stays exactly at its allowance.

## Tests added

- `packages/core/tests/rc-ses-5-1-player-initiative.test.ts`: call opens at round 0 (sorted, cursor
  0); plain start unchanged; strict start schema; player roll = core d20 + modifier, reorders, logs a
  session-visible roll, op under the combatant path with seed; deterministic replay; **a player
  cannot set another player's initiative** (roll or value); no roll for a monster or as an observer;
  player cannot name a value; once per call and never after round 1; modifier bound + mixed shape
  refused; DM adjustment moves the row and logs a reorder with the value; first advance begins round
  1 on the highest initiative, previous-turn refused in the call; add during the call keeps cursor 0;
  a hidden combatant's roll is dm-only and absent from a player's tracker log.
- `apps/gm-react/src/net/initiativeCall.test.ts` (cloud/net vitest config): `isPlayerRequestable`
  matrix; host → REAL core: the stamped player's roll is recorded (a client-supplied envelope actor id
  is ignored), a roll for another player's character comes back as the core's refusal, an HP change
  via the same command never reaches dispatch; `buildPlayerData.initiativeCall` for player / second
  player / observer, no active row, owed rows `init: null`, rolled state, null after round 1.
- `apps/gm-react/tests/e2e/collab.spec.ts` "collab: player-rolled initiative": DM presses Roll for
  initiative on /session → banner 0 of N; DM adds monsters at 40 / −10; player rolls on /play (card →
  "You rolled N", roll logged by `actor-player`); rolls for another PC (roll and value) rejected; the
  tracker row shows "Rolled N" in order between the monsters, the other PC "Awaiting roll", 1 of N;
  DM adjusts the other PC to 50 → top row, "Adjusted"; Start round 1 → banner gone, top row Active,
  round 1.

## Validation results

- Red first: the root `vitest` config only includes `tests/unit`, so the core tests ran from
  `packages/core` (its own config); the `vitest.app.config.ts` run silently EXCLUDES
  `apps/gm-react/src/net/**` (owned by `vitest.cloud.config.ts`), so the new net test was run there.
- Red first (lint): `dsn/no-raw-style-values` flagged 18 overflow findings — exactly the raw layout
  values I had added (incl. `margin: 0`/`padding: 0`), reported against the tail of each file by the
  ratchet. All converted to `T.space.*` / `T.radius.*`; re-lint exit 0.
- `pnpm --filter @dndtools/core typecheck`: exit 0. `pnpm --filter @dndtools/gm-react typecheck`: exit 0
  (after every edit, incl. the token pass).
- Core vitest (packages/core, full suite): 274 files, 4,793 tests passed (incl. the new file and every
  existing combat / collab-combat-view / session-lifecycle suite).
- `vitest --config vitest.cloud.config.ts apps/gm-react/src/net`: 7 files, 69 tests passed.
- `vitest --config vitest.app.config.ts` (full app suite): 126 files, 1,327 tests passed ("renderer
  exploded" lines are expected error-boundary logs from passing tests).
- `pnpm format:fix:changed`: 5 files reformatted; ESLint re-run on them from the repo root: exit 0.
- `pnpm lint`: exit 0 — 0 errors, the same 15 pre-existing warnings (none in changed files); boundary
  lint and the non-text contrast gate passed.
- `pnpm build`: exit 0; `check-prod-bundle: OK` (85 assets). Chunk-size notice is Vite's advisory.
- Playwright `collab.spec.ts` (desktop + mobile Chromium, port 5741): 12 passed — the new case on both.
- Playwright combat, player-view, responsive, a11y-axe-gate, shortcuts, session-posture (both
  projects, port 5742): 225 passed, 1 skipped.
- Playwright session-lifecycle, session-quick-timer, combat-quick-reference, combat-tile, dice-tray,
  player-inbox, player-private-notes, co-dm, sfx-events, combat-audio-automation, inline-roll (both
  projects, port 5743): 97 passed, 5 skipped.
- Not run by me: the complete Playwright suite (the three batches above cover every spec that drives
  /session, /play, the tracker, the quick panel or layout/axe on both projects), a real two-device
  WebRTC join (the host relay is unit-tested against a real core instead), Android/Electron. The
  central operator's gates are the evidence for the rest.

## Follow-ups (not owned here)

- `queries/command-center-home.ts` / `queries/combat-tracker-view.ts`: during a call they still report
  `round: 0` and an active combatant (`order[0]`). The tracker and `/play` suppress both, but the
  command-center status strip and the quick panel's turn readout will read "Round 0 · <name>" until
  those queries learn the call.
- A dedicated command (`combat.roll-initiative`) and log kind (`initiative-rolled`) would be cleaner
  than riding `combat.apply-resource` + `roll` / `combatant-reordered`; that needs `commands/types.ts`,
  `commands/dispatch.ts`, `schemas/commands.ts`, `state/combat-tracker.ts`. The `round` doc comment in
  `state/combat-tracker.ts` ("0 while idle") should also mention the call.
- The Encounter builder (`app/EncounterBuilder`, wired in `screens/session/index.tsx`) cannot open a
  call; the call starts from the tracker with every PC, and monsters join through Add.
- The system package's `initiativeFormula` does not name the attribute behind `modifier`; the player's
  device declares a DEX-derived modifier (bounded, shown in the log). A package-driven modifier needs
  the formula scope defined.
- Readiness stays a presence side-channel, shown only on a hosting DM's tracker; a solo device has
  no remote roster to show.
