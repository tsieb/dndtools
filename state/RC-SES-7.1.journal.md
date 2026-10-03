# RC-SES-7.1 run journal

## Implementation

- The Core already accepted `dice.roll` in every workflow (RC-SES-6.1); the only gate left was the
  companion UI. `Dice.tsx` no longer disables the dice. In Standby a quiet one-line note
  (`play.dice.standbyNote`) says only live rolls reach the table log, and each companion log row made
  outside a session carries the existing "Outside a session" tag (Core `happenedLive`).
- `sessionActive` stays in the player view model; its doc comment now says it drives that note only.
- `play.dice.needsSession` removed from EN and ES. `play.dice.logFillsUp` ("fills up during a live
  session") was removed too because a Standby roll now fills the companion log; the empty state
  always uses `play.dice.noRolls`. Pseudo catalog regenerated (`tsx scripts/i18n-catalog.ts pseudo`).
- Outside owned paths, as the acceptance requires: EN/ES/qps-ploc catalogs and a new e2e in
  `tests/e2e/collab.spec.ts` (reuses the `live-session-delivery` budget read from the perf registry).
- Headroom tools not used. No agents, push, promotion, loop launch or dispatcher edits.

## Validation

- First e2e run: the demo vault opens with `workflow: 'active'`; the spec now resets to Standby via
  `session.set-workflow` (which also clears the live log) before rolling.
- Second run: the unjoined demo companion names the actor ("Demo Player") rather than "You"; the
  row assertion now matches the "· Outside a session · d20" suffix.
- Final: new spec passes on desktop-chromium and mobile-chromium. collab + play-polish +
  player-view + player-join-first: 60/60 on both profiles. Vitest src/i18n, src/net,
  src/screens/play: 117/117. tsc --noEmit, eslint and prettier clean on touched files.
