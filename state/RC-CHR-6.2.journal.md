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
- E2E (DNDTOOLS_E2E_PORT=5391, both profiles): character-sheet + player-polish + companion-sheet
  26/26 after selector-only edits (the Combat/Identity panel's own Edit; several panels now carry
  one). Wider set (20 specs) 274 passed / 8 failed → fixed: (a) XpPanel repeated the wizard's
  "Level 2" readout — readout dropped; (b) roster tags flow scoped to the Tags panel's Edit/Done and
  the tags editor stays open after Save as before; (c) `co-dm.spec.ts:342` and
  `character-sheet-template.spec.ts:105` asserted the OLD `/player` preview behaviour (a greyed HP
  stepper named "Preview mode is read-only…"). The shared body follows RC-CHR-6.1's rule — nothing
  drawn that the viewer cannot dispatch — so in a read-only preview the stepper is absent; both
  assertions now check that (co-dm's own test title says the screen HIDES its manage controls).
  Re-run: 32/32. responsive + a11y-axe-gate: 221 passed, 1 skipped, 2 failed → the rotate test's
  `Edit` scoped to the Combat panel → 6/6.
- Reference panel trimmed to rows no other panel shows (kind, alignment, visibility, DM notes): race
  and speed were duplicated with Identity ("Wood elf" twice broke player-polish), AC/HP with Combat.
- i18n: removed the 31 keys this change orphaned (old DM abilities/combat/advancement/reference
  copy, `player.sheet.noAttacks`) from en/es; regenerated qps-ploc; i18n tests 47/47.
- Docs: NAVIGATION.md §1 `/player` row + a paragraph on the one sheet body; FEATURE-GAPS: the
  Player (DM-side) row folded into the Characters row (one body on `/characters/:id`, `/player`, the
  companion; History limit carried over; the stale "No printable sheet" limit dropped — RC-CHR-2.4
  is done and `/player` exports a PDF), Player app row names the shared sheet. Cells sized to the
  existing column widths so the table is not re-padded. `pnpm feature-audit`: 40 limits, 0 stale.
