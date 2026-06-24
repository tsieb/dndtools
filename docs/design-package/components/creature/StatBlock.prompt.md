The creature/NPC reference card — the one artifact a DM pulls up constantly while building an encounter or running combat. Cinzel name, italic type line, a tinted AC · HP · Speed defenses band, the six ability cells, the property list, then traits / actions / reactions / legendary actions separated by the tapered gold rules. All numbers are mono.

```jsx
<StatBlock
  name="Bandit Captain"
  meta="Medium humanoid (any race), any non-good alignment"
  ac={15} acNote="(studded leather)"
  hp={65} hpFormula="(10d8 + 20)"
  speed="30 ft."
  abilities={{ str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14 }}
  saves="Str +4, Dex +5, Wis +2"
  skills="Athletics +4, Deception +4"
  senses="passive Perception 10"
  languages="any two languages"
  cr="2" xp="450" proficiency="+2"
  traits={[]}
  actions={[
    { name: 'Multiattack', text: 'The captain makes three melee attacks: two with its scimitar and one with its dagger.' },
    { name: 'Scimitar', text: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.' },
  ]}
  reactions={[{ name: 'Parry', text: 'The captain adds 2 to its AC against one melee attack that would hit it.' }]}
  dmOnly
/>
```

Mid-combat, pass `live={{ current, max }}` to overlay an editable HP track. Use `dmOnly` for hidden NPCs (purple cue). For a character sheet, reuse `AbilityScore` directly — it's the shared six-stat cell. Width ~360–460px reads best.
