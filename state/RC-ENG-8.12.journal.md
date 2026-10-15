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
  kind as the badge (`rest`, `level-up`) because its labels come from `JOURNAL_KINDS`. Its delete
  undo re-adds through `character.add-journal-entry`, which refuses history kinds (the same lossy
  restore the `downtime` kind already has). Small follow-up for whoever owns the player journal.
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
