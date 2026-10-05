# RC-CHR-6.2 run journal

- 2026-10-04: start. Read the three sheets (`characters/CharacterSheet` + `characters/sheet/*`,
  `player/{index,Sheet,Vitals,Combat,SheetSpellcasting,Advancement,usePlayerData}`, `play/Sheet` +
  its 6.1 fixture test), the core authority per command (`character-resources` CHAR-007/008,
  `character-advancement` advanceGuard = DM or owner incl. `set-xp`, `set-sharing`/`set-combat`
  DM-only, `edit-field` field-scoped), and the specs that touch the sheets (character-sheet,
  player-polish, companion-sheet, equipment, character-rest/levelup/resources, responsive).
  Companion paths (manifest): FEATURE-GAPS, architecture docs, i18n catalogs, e2e specs,
  `*.test.ts(x)`, `*/__snapshots__/*`, visual baselines.
- Design: the composition lives in `characters/sheet/` (owned directory). `capabilities.ts` derives
  `{ combat, manage, dm }` from the core (DM authority / `owner` / `combat-participant` grants,
  folded with read-only preview) and `sheetPlan(caps)` lists the sections and panels; `SheetBody`
  renders that plan (tabs Sheet · Resources · Level up · Journal · History) and every panel carries
  `data-sheet-panel`. Frames stay per route: `/characters/:id` header, `/player` vitals bar + picker
  (+ its own Party tab, not a sheet panel), the companion strip. Per-panel edit affordances replace
  the DM sheet's global Edit/Done, each gated by the capability its command needs.
- Built: `characters/sheet/{capabilities,subject,feedback,SheetBody,VitalsBlock,DmCombatEditor,
  IdentityPanel,XpPanel,DeathSavesPanel}` + reworked Abilities/Combat/Attacks/Spells/Sharing/Tags
  panels (each owns its editor; global Edit/Done retired). `player/Vitals.tsx` is now the Resources
  section panels (750 → ~390 lines); `player/Sheet.tsx`, `AdvancementPanel`, `useAdvancementEditor`
  deleted. `/characters/:id`, `/player` and `play/Sheet.tsx` are frames around `SheetBody`.
- CROSSED the claim once, minimally: `net/viewModels.ts` gains an additive `sheet` field (derived
  reads, inventory, encumbrance, advancement + eligibility for the viewer's own PC, read after the
  same visibility gate as `resources`). Without it the companion would draw Equipment and Level up
  with no data, so the panel set could not be the same on all three routes (acceptance 1).
  `net/viewModels.ts` belongs to RC-CHR-6.1's claim (done).
- Known limit (HANDOFF, not in this claim): `app/character/LevelUp.tsx` resolves the system package,
  hit die and dice history from the device's OWN runtime. On a joined companion that is not the
  DM's vault, so the wizard works (open/choices/commit go to the host) but the hit-die roll button
  stays disabled and the step header names the id. Feeding those from the view-model is a follow-up
  for the owner of `app/character/LevelUp.tsx`.
- Dead after this story, outside the claim: `screens/player/{Combat,SheetSpellcasting}.tsx` (no
  importer left). Left in place; delete with the next owner of `screens/player`.
- Unit: `characters/sheet/SheetBody.routes.test.tsx` (7 pass) renders `/characters/:id`, `/player`
  and the companion per viewer (DM, owner, combat participant, read-only preview), reads every
  section's `data-sheet-panel` set, asserts it equals `sheetPlan(caps)` on each route, and keeps one
  snapshot per route. `play/Sheet.test.tsx` now walks every section (tabs excluded as controls) and
  asserts no AUTHORITY refusal, with an observer negative control (overspending a coin is a value
  refusal equipment.spec relies on). `pnpm lint` 0 errors (raw-style allow-list lowered for the
  files that went to zero); `pnpm test:app` 1921/1921.
