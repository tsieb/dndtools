# RC-CHR-6.1 run journal

- 2026-10-04: start. Read play/Sheet, play/Frame, player/{Vitals,Sheet,index,Combat,usePlayerData},
  net/{SessionHost,SessionClient,viewModels}, golden-path fake-LAN e2e. Host already relays `character.*`
  requests with a stamped actor id; companion sheet is read-only with the "full character app" copy.
  Companion paths (manifest): i18n messages, e2e specs, \*.test.ts(x).
- Finding: the tracker's combatant is a SEPARATE copy of the character's combat block (seeded at
  combat.start), so a `character.*` write alone never reaches the DM's combat tracker. Companion now
  mirrors hp/temp-hp/condition onto the PC's row (`sheetCombatCommands`); host allow-list widened to
  `combat.apply-resource` kinds hp/temp-hp/condition (core still checks combat-participant).
- `finalize-draft` grants no `owner`; the demo seed grants it explicitly (tests do too).
- Built: viewModels `sheetWrites` (core grant check) + `pcCombatantId`; Vitals `CharacterVitals`
  (HP stepper + exact undo, temp HP, conditions) inside PlayerResources, every control gated;
  play/Sheet renders PlayerResources; Frame `writeSheet` (request when joined / local dispatch,
  toast on refusal); "full character app" copy + its unused keys deleted. Crossed minimally into
  player/index.tsx (pass `vitals` so /player renders the same block).
- Unit: net/companionSheet.test.ts (6 pass), initiativeCall hp→death-save refusals, play/Sheet.test.tsx
  fixture (3 pass; verified it fails when helper is handed manage writes).
- E2E: tests/e2e/companion-sheet.spec.ts passes on desktop-chromium + mobile-chromium (damage 3,
  Poisoned, slot spend each timed against the `live-session-delivery` budget on the DM tracker /
  DM sheet; another PC refused by the core; axe on `#player-main`). Mutation check: disabling the
  tracker mirror makes the tracker assertion fail.
- Regression run (both profiles): play-polish, player-join-first, player-polish, player-preview,
  character-resources, character-rest, collab, golden-path, companion-sheet → 138 passed.
  `pnpm test:app` 1776/1776; `pnpm test:cloud` 564/565 — the one failure is
  `cloud/offline.gate.test.ts` naming `app/shell/presence.ts` (from RC-POL-1.23, untouched here).
- Visual: /play golden route captures the Stage, /player visual captures the Sheet tab — neither
  surface changed, so no baselines regenerated.
