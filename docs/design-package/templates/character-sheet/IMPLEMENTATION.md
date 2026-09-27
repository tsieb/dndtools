# Character sheet implementation

RC-CHR-5.1 maps `CharacterSheet.dc.html` onto `/player` using real character data.

- Identity band: 64px portrait, name and identity, short/long rest dialogs.
- Desktop: `minmax(0,1fr) minmax(0,1.25fr)` columns with 20px gaps. Below 768px the columns stack in reading order.
- Left: three-by-two AbilityScore grid, compact derived statistics, saving throws and skills.
- Right: raised combat panel with AC, speed, initiative, live HP commands/bar and conditions, followed by spell slots and known spells. Existing identity editing, attacks, backstory and inventory remain available below.
- Portrait: PNG/JPEG/WebP up to 5 MB, decoded before storing. Only the content-addressed asset ID is written to `data.portraitAssetId`; the asset store owns the bytes and the object-URL hook handles cleanup. Full-vault backups include stored bytes. Editing follows the existing DM-only identity-field authority; previews cannot upload.

Template sample values (Mara Quill, spells and combat values) are illustrative, never fallback data. Unknown abilities/identity fields stay absent. Spell DC/attack statistics and feature descriptions are not invented when the character record does not supply them.

## Verification

The `player--*.png` golden-route baselines cover tavern, parchment and high-contrast at desktop, rail and phone sizes in the pinned Playwright image. Review these against the template's hierarchy and proportions; they contain the application's seeded character, rather than the template's fictional character. Compare with:

```sh
bash apps/gm-react/tests/visual/run-in-container.sh -g player --update-snapshots=none --workers=2
```

`tests/e2e/character-sheet-template.spec.ts` checks column geometry, live HP writes, slot persistence, portrait upload/reload, invalid-file feedback and read-only preview. The existing `/player` axe gate runs at desktop and phone sizes; the non-text contrast gate covers all five themes. The short-rest regression verifies that rest dialogs still spend hit dice and heal through core commands.
