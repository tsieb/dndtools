# RC-ENG-8.12 run journal

## Scope

Character history records rests, combats and level-ups. Each event appends a dated journal entry
under the journal's visibility rules, read through the actor-scoped journal query. Acceptance: core
tests per event (including a player who may not see a DM-only entry); the History spec shows all
three on both profiles; the limit leaves FEATURE-GAPS.md. No agents, dispatcher mutations, push or
promotion.

## Design

- `state/character-journal.ts`: three history kinds (`rest`, `combat`, `level-up`), the
  `historyEntryVisibility` rule and `withCharacterHistory(env, result, collect)`, which appends one
  dated entry per record to an ACCEPTED result and emits `character.journal-changed` per entry.
- Visibility: an owned character gets the journal's fail-closed default (`shared` to the owner, so
  the owner and the DM read it and nobody else). A `dm-only` character or one with no owner (a
  DM-run NPC/sidekick) gets `dm-only`. `player-visible` is never implicit.
- Per-event collectors live with their event: `restHistoryRecords` (character-resources.ts),
  `levelUpHistoryRecords` (character-advancement.ts; commit and atomic apply),
  `combatHistoryRecords` (combat-tracker.ts; one entry per character combatant, opponents never
  named so a hidden combatant cannot leak).
- Wiring: the companion `commands/dispatch.ts` wraps `character.rest`, `character.commit-advancement`,
  `character.apply-advancement` and `combat.end` (the RC-SES-7.3 wrapper pattern). No command
  handler outside the claim was edited.
- No extra sync op: the event's own op is the durable record and ops are audit records (snapshots
  are adopted, ops are not replayed), so no side entity is added to the op log.
- The history kinds are NOT in `journalEntryKindSchema`, so a player cannot author a fake level-up.

## Evidence

- `packages/core/tests/character-history-events.test.ts` — 10 tests: per event, owner + DM read
  the entry, another player and an observer do not; DM-run character entries are dm-only and no
  player sees them; rejected commands write nothing; DM narrowing to dm-only stays hidden.
- `character-history.spec.ts` "records a rest, a combat and a level-up as they happen" passes on
  desktop-chromium and mobile-chromium. Negative control: with the dispatch wiring reverted the
  test fails.
- Core 5415/5415, app (CI=true) 2389/2389, tooling 260/260; gm-react + core typecheck; eslint on
  the changed files; boundary lint; feature-audit exit 0. Neighbouring e2e (journal-downtime,
  levelup, rest, combat, combat-tile, companion-sheet, player-polish, history) on both profiles:
  107 passed, 5 skipped, 0 failed.
- FEATURE-GAPS: the Characters limit is gone (cell padded to keep table width). The three new
  en.ts keys moved six line-pinned anchors by 3, so they were re-pinned (same digit widths).

## Handoffs

- `screens/player/Journal.tsx` (not owned) shows history entries in the Journal tab with the raw
  kind as the badge (`rest`, `level-up`) because its labels come from `JOURNAL_KINDS`. Automatic history deletion is now prevented in core and its Delete affordance is hidden (see attempt 3).
- Entry titles/bodies are English strings written by core, like the encounter-log labels. The
  History badges are localised (en/es).

## Attempt 2 — visual gate

- Gate run `c5d7866e` failed 16 captures. 15 were `player-history-empty--*` (player-polish, every
  theme × desktop/rail/phone): attempt 1 reworded `character.history.emptyBody`. The 16th was
  scene editor inspector — dungeon (desktop only), a 5s `toBeVisible` timeout on a route this story
  does not touch: the known cold-chunk stall, which passes on re-run.
- Fix: restored the original empty-state copy (en/es + pseudo-locale regen) instead of
  re-baselining 15 PNGs. It still holds, because history entries are journal entries. en.ts line
  count is unchanged, so the FEATURE-GAPS anchors still match.
- Pinned container, `player-polish.spec.ts` + `scene-editor-polish.spec.ts`,
  `--update-snapshots=none`: 30 passed, exit 0.


## Attempt 3 — independent review correctness fixes

- Retain removed character participants and their departure HP in the durable combat slice. Hydration
  clones this additive data; starting the next fight clears it. Ending combat includes departed
  characters, deduplicates rejoined characters, and applies the existing journal visibility rules.
- Automatic rest/combat/level-up records cannot be deleted through the journal reducer/command.
  Player Journal hides their Delete action, so it cannot offer an Undo that the authoring schema
  rejects. The authoring schema still rejects fabricated automatic records. Companion command,
  public export and Player Journal edits are necessary to address the review's two reproducers.
- Added five core regressions for removal/rejoin, persisted-state hydration, subsequent fights,
  departed NPC privacy, and deletion/fabrication rejection for every automatic kind (owner and DM).
- History browser spec now also checks all three entries in Journal and absence of Delete actions.
- Validation: history core 15/15; related combat/resource/advancement tests 84/84; History browser
  tests 6/6 across desktop/mobile; changed-file ESLint exit 0; core and gm-react typechecks exit 0; pinned container
  player-polish visual suite 15/15 with --update-snapshots=none; git diff --check exit 0. No dispatcher state, push, promotion or additional agents.

## Attempt 4 — claim-gate response

- Compared the three flagged paths with base 68040135933bfc815fd1ae471682f1ba8cfc65c8.
- Restored `packages/core/src/commands/character-journal.ts` exactly to that base: its error-message
  improvement is optional; the owned journal reducer still rejects automatic-entry deletion.
- Retained `packages/core/src/commands/combat.ts`: the removal handler must preserve a character's
  participation before deleting the combatant. The end-event collector cannot reconstruct the lost
  character ID and departure HP afterward. Reverting this restores independent review finding 1.
- Retained `apps/gm-react/src/screens/player/Journal.tsx`: this is the actual Delete/Undo affordance
  consuming automatic entries. Hiding Delete there is required for the review-requested prevention
  approach; History.tsx does not own this UI. Reverting exposes an unusable Delete action, and
  allowing deletion again restores independent review finding 2.
- These two paths remain outside the claim. This commit explicitly requests the operator's claim
  decision; it does not widen the claim or assert that the candidate passed the claim gate.
- Validation after the revert: character-history-events.test.ts 15/15, exit 0. No UI or combat
  behavior changed in this attempt; prior browser/visual results are not new runs on this commit.
