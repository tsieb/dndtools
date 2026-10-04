# Characters

Keep everyone at the table in one place: the party, the people they meet, and the things that want to eat them.

## Build the roster

Open **Characters**. Choose **New character** to add someone, or **Import character (JSON)** to bring in a character file. The filters along the top narrow the roster to **Party**, **NPCs** or **Bestiary**, and **Filter characters** narrows it further by player or tag. Each card shows level, hit points, conditions and who plays the character.

Your game system decides which attributes, resources and conditions a sheet has. The **Systems** guide explains how to choose one.

## Read and change a sheet

Open a character to see the sheet: ability scores, skills and saves, attacks, conditions and a bio. **Damage** and **Heal** change hit points, and **Add condition** applies one from the active system. Tags help you find people later, and **Mentioned in** lists the notes that link to this character.

**Visible to** shows who can see the sheet. The GM's notes on a sheet are for the GM; check the player view before sharing a character with the table.

<!-- keyboard -->

With a keyboard, the arrow keys move between cards in the roster and Enter opens one. Press Ctrl+K (⌘K on a Mac) and type a name to open a character from anywhere.

<!-- touch -->

On a phone, **Characters** is in the tab bar. Tap a card to open the sheet, and use the breadcrumb at the top to return to the roster. Tap **Search** in the top bar and type a name to open a character from anywhere.

## Bring them into a fight

**Start combat** on the roster starts an encounter with every player character and rolls their initiative. On narrower screens it sits under **More character actions**. The **Session** screen runs the fight. The **Running a session** guide covers turns, hit points and conditions during play.

## Implementation references

Source review: 2026-10-04, repository baseline `9a7b675d` (app 0.3.7, RC-UX-6.6). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [index.tsx](../../apps/gm-react/src/screens/characters/index.tsx)
- [CharacterSheet.tsx](../../apps/gm-react/src/screens/characters/CharacterSheet.tsx)
- [RosterActions.tsx](../../apps/gm-react/src/screens/characters/RosterActions.tsx)
