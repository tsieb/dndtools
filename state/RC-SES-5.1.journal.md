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

## Round 2 — quality-gate retry (head 2cf86fe4, rebased onto 884483b0)

- Gate feedback: `pnpm gates` failed with ONE problem — `[file-size-exceeded]`
  `screens/session/CombatTracker.tsx` was 1,042 lines, over the RC-STB-2.7 800-line hard limit (777
  before this story, so no grandfather exception applies). My own round-1 runs never included
  `pnpm gates`; they should have.
- Fix: restored `CombatTracker.tsx` to its pre-story content (`git show 884483b0:…`) and moved every
  initiative piece into `apps/gm-react/src/net/InitiativeCallParts.tsx` (owned dir; same precedent as
  `net/SessionPanelParts.tsx`, which RC-ENG-2.2 split out of `SessionPanel.tsx` for this gate). New
  files under `screens/session/` are outside the fence. The module exports `useCall` (call state +
  the call/adjust dispatches), `Banner`, `Badges`, `Adjust` and `Idle`; the tracker imports it as
  `* as Initiative` and gains eight one-line hooks → 789 lines. The idle "Roll for initiative"
  button moved from the panel header into the idle body (under the empty state, beside the readiness
  chips) — still inside `#main-content`, so the e2e locator is unchanged.
- `pnpm gates`: exit 0 ("quality-gate check passed: 6 gate(s)…"). ESLint on both files: exit 0.
  gm-react typecheck: exit 0. App suite 126 files / 1,327 tests; net suite 7 files / 69 tests.
- Red first (e2e, port 5744): 38 failed. Every mobile `responsive.spec` failure was
  `net::ERR_CONNECTION_REFUSED at localhost:5744` (the server vanished mid-run), and the collab case
  timed out waiting for "Roll for initiative" on a page whose tracker had NO such button at all — the
  shape of a stale server from another worktree: dispatcher worktrees derive e2e ports from
  5300–5899, and 5744 sits inside that range. Nothing was listening on 5740–5749 afterwards. Re-run
  on 6143 (outside the derived range, checked free first).
- Playwright collab, combat, responsive, a11y-axe-gate, shortcuts, session-posture (both projects,
  port 6143): 225 passed, 1 skipped — the collab initiative case passes on desktop and mobile.
- Playwright player-view, session-lifecycle, session-quick-timer, combat-quick-reference,
  combat-tile, dice-tray, player-inbox, player-private-notes, co-dm, sfx-events,
  combat-audio-automation, inline-roll (both projects, port 6144): 109 passed, 5 skipped.
- `pnpm lint`: exit 0 — 0 errors, the same 15 pre-existing warnings; raw-style count, boundary lint
  and the non-text contrast gate passed. `pnpm build`: exit 0; `check-prod-bundle: OK`.
- Lesson for this repo: include `pnpm gates` in the per-story run, and pick e2e ports OUTSIDE
  5300–5899 (or confirm the port is free) so a sibling worktree's server is never reused.

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

## Revision 2 — the two defects independent review reproduced (2026-09-17)

Review of `910ef3e8` requested changes on two behavioural defects, each with a saved deterministic
reproduction. Both are fixed here; the reviewer's own `reproduce.ts` was re-run unchanged against the
fixed tree and now reports the expected results.

### 1 · A late player roll could overwrite an initiative the DM had already set (core)

`handleCombatantInitiative`'s once-only guard tested for a prior `roll` log entry ONLY. A DM-set value
is logged as a `combatant-reordered` entry carrying the initiative in `delta`, so the guard did not see
it: a roll request still in flight when the DM finalized the row landed afterwards and replaced the
DM's number (reproduction: DM sets 50, player's roll lands, row becomes 20 and moves).

The guard now closes a row on either signal — a `roll`, or a `combatant-reordered` with a non-null
`delta` — which is exactly the predicate the view-model's `initiativeIsIn` already used, so the
authority and the read side finally agree on what "initiative is in" means. Two things deliberately
stay open: the DM is not subject to the guard, so they can keep adjusting their own value; and a plain
position nudge (`combat.reorder-combatant`) logs a NULL delta, so it moves a row without closing
rolling. `combat.start` logs a single `combat-started` entry with a null delta, so opening a call never
trips the guard. Both carve-outs are now tests.

### 2 · A player holding several characters could not finish rolling (view-model)

`buildInitiativeCall` picked the first granted character in TRACKER order regardless of whether its
initiative was already in. Roll the first character above the second and the next snapshot re-selected
the completed character; `shared.tsx` then hid the button because `rolled` was non-null, stranding the
second character (reproduction: Wren returned with `rolled: 30` while Tamsin stayed unrolled).

Selection now takes the first held character still owing an initiative, falling back to the last held
one once every one is in so the card reports a result instead of going blank. `InitiativeCallView`
gained `heldCount`; above one, the card says which character a result belongs to
(`play.initiative.rolledFor`, added to en + es) — otherwise "You rolled 18" is ambiguous across two
characters.

### Boundary note

`i18n/messages/{en,es}.ts` is outside `Owns`. The crossing is one key, `play.initiative.rolledFor`,
and matches the crossing the first revision already made for the rest of the `play.initiative.*` set.

### Gates re-run on this revision

- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0 — 0 errors, the same 15 pre-existing warnings.
- `pnpm --filter @dndtools/core test`: 274 files, 4795 passed (+2: the DM-set close and the nudge
  carve-out). `pnpm test:cloud`: 37 files, 490 passed (+1: the multi-character walk — `src/net/**` is
  excluded from `test:app` and owned by `vitest.cloud.config.ts`). `pnpm test:app`: 126 files, 1334
  passed. `pnpm test:tooling`: 24 files, 162 passed.
- `pnpm build`: exit 0; `check-prod-bundle: OK`.
- Playwright `collab.spec.ts`, both projects (port 5417): 12 passed — the initiative acceptance case
  passes on desktop-chromium and mobile-chromium.
- Reviewer's `reproduce.ts`, unchanged: case 1 now `"result": "rejected"` with the row still at 50
  (was accepted, overwritten to 20); case 2 now returns Tamsin still owing a roll (was Wren, done).

### Not addressed, and why

The review summary also noted that the readiness chips have no dedicated round-trip acceptance test.
The chips render from `session.peers` on a HOSTING DM, so a round-trip needs a real two-peer WebRTC
join, which the e2e suite does not stand up (`collab: the DM host panel` asserts an empty roster). The
presence→`peer.ready` mapping behind them is covered by `net/sessionStatus.test.ts`; the rendering is
not, and this app has no component-render harness (no `@testing-library/react`) to add one cheaply.
Left as a follow-up rather than pulled in here.

## Revision 3 — the emphasis lint the rebase brought with it (2026-09-17)

The branch was rebased onto a newer base (`dd7cd001`), which added `pnpm lint:emphasis` to the root
`lint` script. That gate did not exist when revision 2 ran its gates, so the failure is genuinely new
to this branch rather than something revision 2 missed — and it is caused by this story's change:

```
apps/gm-react/src/screens/play/Dice.tsx  multiple-accent-primaries  1 > 0
  Dice.tsx:110  2 accent-filled primaries can show at once in DiceSection
  (<button> with an accent fill at line 69, <InitiativeCallCard> (shared.tsx:346) at line 110).
```

RC-SES-5.1 put `InitiativeCallCard` (whose roll button is `<Button variant="primary">`) on the Dice
tab, which already painted an accent FILL on the active segment of its hand-rolled d20-mode toggle.
Two gold fills in one region, and Dice.tsx's baseline for the rule is 0.

### What was rejected

Passing the variant through a prop (`variant={emphasis}`) would have silenced the gate without fixing
anything: `attrLeaves` only reads string literals through ternaries and `||`/`??`, so an identifier
resolves to `[]` and the card would stop counting as a primary ANYWHERE, including on the Stage where
it legitimately is one. Raising `scripts/emphasis-baseline.json` is likewise not available — the lint's
own header says the baseline may only shrink and `--write` refuses to raise an entry.

### What was done

The d20-mode toggle was a bespoke `<button aria-pressed>` trio with `background: T.acc` on the active
one. Replaced with screen-kit's `Seg`, which the lint's rule doc names as the sanctioned tinted
alternative ("the subtle accent … is a tint, not a fill" — `Seg` paints `T.accSub`). So the single
primary in the region is the initiative roll, which is the right one: it is the DM-called, time-boxed
action, while the d20 mode is a selection, not an action. `Seg` is also a real ARIA radiogroup with
roving tabindex and arrow-key movement, which the hand-rolled trio was not, so this is an
accessibility gain rather than a lint dodge. Nothing in the test corpus selected the old buttons
(checked `tests/e2e` and the unit suites for the d20-mode labels).

Removing the bespoke control dropped Dice.tsx from 17 raw style values to 15, which tripped the
`dsn/no-raw-style-values` ratchet ("lower it … so the allow-list keeps shrinking"). Lowered that one
entry to 15. `scripts/eslint-rules/no-raw-style-values.allow.js` is outside `Owns`; the edit is a
single number and is the ratchet's own instruction on an owned-file change, so it is flagged here
rather than worked around.

`scripts/emphasis-baseline.json` is deliberately NOT touched. The run still prints "1 baseline entry
is above the current count" for `display-face-below-24px` (83 vs 84) — that note predates this branch
(it is in the failing log at `cfc1cea2` too), is informational, and the entry is not this story's.

### Gates re-run on this revision

- `pnpm lint`: exit 0 — raw-style count, eslint (0 errors, 15 pre-existing warnings), boundary lint,
  emphasis lint (`multiple-accent-primaries` back to 61 = baseline; Dice.tsx no longer listed) and the
  non-text contrast gate all pass. `pnpm gates`: exit 0. `pnpm typecheck`: exit 0.
- `pnpm format:check:changed`: exit 0. `pnpm build`: exit 0; `check-prod-bundle: OK`.
- `pnpm --filter @dndtools/core test`: 276 files, 4830 passed. `pnpm test:app`: 134 files, 1481 passed.
  `pnpm test:cloud`: 38 files, 499 passed. (Counts are above revision 2's because the rebase brought in
  newer main work.)
- Playwright `collab.spec.ts` + `dice-tray.spec.ts` + `a11y-axe-gate.spec.ts`, both projects (port 6231,
  checked free and outside the 5300–5899 derived range): 80 passed. The initiative acceptance passes on
  desktop-chromium and mobile-chromium, and the whole dice-tray suite passes over the swapped control.
