// Extended campaign data for the gap surfaces (Characters, Character sheet, Campaign, Settings).
// One cohesive campaign — "The Sunken Outpost" / the Brine Hand cult in the Saltmarsh — reused
// across every surface so cross-links resolve. Plain global, mirrors data.js / pages-data.js style.
window.DNDGaps = {
  campaign: 'The Sunken Outpost',
  party: 'The Lantern Company',
  session: 6,

  /* ---------------- Characters roster ---------------- */
  // Party vitals overview (the strip atop the roster).
  partyVitals: [
    { id: 'p1', name: 'Mara Quill', cls: 'Cleric 5', hp: 22, max: 30, ac: 16, conditions: ['Blessed'], conn: 'online' },
    { id: 'p2', name: 'Bran Ironwood', cls: 'Fighter 5', hp: 41, max: 44, ac: 18, conditions: [], conn: 'online' },
    { id: 'p3', name: 'Lyra Vex', cls: 'Rogue 5', hp: 27, max: 28, ac: 14, conditions: [], conn: 'online' },
    { id: 'p4', name: 'Toral Dusk', cls: 'Wizard 5', hp: 18, max: 32, ac: 12, conditions: ['Concentrating'], conn: 'offline' },
  ],
  characters: [
    { id: 'mara', name: 'Mara Quill', kind: 'PC', sub: 'Human · Cleric 5 (Life)', hp: 22, max: 30, ac: 16, init: '+2', conditions: ['Blessed'], owner: 'Devin', vis: 'players', faction: 'The Lantern Company', grad: 18 },
    { id: 'bran', name: 'Bran Ironwood', kind: 'PC', sub: 'Dwarf · Fighter 5 (Battle Master)', hp: 41, max: 44, ac: 18, init: '+1', conditions: [], owner: 'Aša', vis: 'players', faction: 'The Lantern Company', grad: 135 },
    { id: 'lyra', name: 'Lyra Vex', kind: 'PC', sub: 'Half-elf · Rogue 5 (Arcane Trickster)', hp: 27, max: 28, ac: 14, init: '+4', conditions: [], owner: 'Kit', vis: 'players', faction: 'The Lantern Company', grad: 285 },
    { id: 'toral', name: 'Toral Dusk', kind: 'PC', sub: 'Tiefling · Wizard 5 (Evocation)', hp: 18, max: 32, ac: 12, init: '+2', conditions: ['Concentrating'], owner: 'Sam', vis: 'players', faction: 'The Lantern Company', grad: 255, offline: true },
    { id: 'vorlag', name: 'Vorlag', kind: 'NPC', sub: 'Bandit captain · ex-watch sergeant', hp: 52, max: 52, ac: 15, init: '+2', cr: '2', conditions: [], owner: 'You', vis: 'dm-only', faction: 'Brine Hand (defecting)', grad: 30 },
    { id: 'sild', name: 'Mother Sild', kind: 'NPC', sub: 'Brine Hand high priest', hp: 66, max: 66, ac: 13, init: '+0', cr: '5', conditions: [], owner: 'You', vis: 'dm-only', faction: 'Brine Hand', grad: 320 },
    { id: 'pell', name: 'Dockmaster Pell', kind: 'NPC', sub: 'Smuggler contact · informant', hp: 11, max: 11, ac: 12, init: '+1', cr: '1/2', conditions: [], owner: 'You', vis: 'dm-only', faction: 'Dockworkers’ Union', grad: 95 },
    { id: 'henna', name: 'Old Henna', kind: 'NPC', sub: 'Tavernkeep · the Salt Bell', hp: 4, max: 4, ac: 10, init: '+0', cr: '0', conditions: [], owner: 'You', vis: 'dm-only', faction: 'Saltmarsh town', grad: 60 },
    { id: 'acolyte', name: 'Brine Hand Acolyte', kind: 'Monster', sub: 'Cultist · drowned rites', hp: 13, max: 13, ac: 12, init: '+0', cr: '1/4', count: 4, conditions: [], owner: 'You', vis: 'dm-only', faction: 'Brine Hand', grad: 300 },
    { id: 'thrall', name: 'Drowned Thrall', kind: 'Monster', sub: 'Undead · waterlogged', hp: 22, max: 22, ac: 11, init: '-1', cr: '1', count: 2, conditions: [], owner: 'You', vis: 'dm-only', faction: 'Brine Hand', grad: 210 },
    { id: 'serpent', name: 'Tide Serpent', kind: 'Monster', sub: 'Beast · guards the lower vaults', hp: 52, max: 52, ac: 14, init: '+3', cr: '3', count: 1, conditions: [], owner: 'You', vis: 'dm-only', faction: '—', grad: 190 },
  ],

  /* ---------------- Character sheet (Mara Quill) ---------------- */
  sheet: {
    id: 'mara', name: 'Mara Quill', kind: 'PC', vis: 'players', owner: 'Devin',
    race: 'Human', cls: 'Cleric', level: 5, subclass: 'Life Domain', background: 'Acolyte', align: 'Lawful good',
    hp: 22, max: 30, temp: 0, ac: 16, speed: 30, init: '+2', prof: '+3', hitDice: '5d8', passivePerc: 16, inspiration: true,
    deathSaves: { success: 1, fail: 0 },
    conditions: ['Blessed'],
    abilities: [
      { key: 'STR', val: 13, mod: '+1', save: '+1' },
      { key: 'DEX', val: 14, mod: '+2', save: '+2' },
      { key: 'CON', val: 13, mod: '+1', save: '+1' },
      { key: 'INT', val: 10, mod: '+0', save: '+0' },
      { key: 'WIS', val: 16, mod: '+3', save: '+6', prof: true },
      { key: 'CHA', val: 12, mod: '+1', save: '+4', prof: true },
    ],
    skills: [
      { name: 'Insight', mod: '+6', prof: true }, { name: 'Medicine', mod: '+6', prof: true },
      { name: 'Persuasion', mod: '+4', prof: true }, { name: 'Religion', mod: '+3', prof: true },
      { name: 'Perception', mod: '+3' }, { name: 'History', mod: '+0' },
    ],
    attacks: [
      { name: 'Mace', kind: 'Melee', hit: '+4', dmg: '1d6+1', type: 'bludgeoning' },
      { name: 'Sacred Flame', kind: 'Cantrip', hit: 'DEX 14', dmg: '1d8', type: 'radiant' },
      { name: 'Healing Word', kind: '1st · bonus', hit: '—', dmg: '1d4+3', type: 'healing' },
      { name: 'Spiritual Weapon', kind: '2nd · bonus', hit: '+6', dmg: '1d8+3', type: 'force' },
    ],
    spells: { dc: 14, atk: '+6', slots: [{ lvl: 1, total: 4, used: 1 }, { lvl: 2, total: 3, used: 1 }, { lvl: 3, total: 2, used: 0 }] },
    prepared: ['Bless', 'Cure Wounds', 'Guiding Bolt', 'Healing Word', 'Lesser Restoration', 'Spiritual Weapon', 'Revivify', 'Mass Healing Word'],
    inventory: [
      { name: 'Mace', meta: 'Weapon', qty: 1 }, { name: 'Chain mail', meta: 'Armor · AC 16', qty: 1 },
      { name: 'Shield', meta: '+2 AC', qty: 1 }, { name: 'Holy symbol of the Dawn', meta: 'Focus', qty: 1 },
      { name: 'Healer’s kit', meta: '10 uses', qty: 1 }, { name: 'Potion of healing', meta: '2d4+2', qty: 2 },
      { name: 'Rations', meta: 'Days', qty: 5 },
    ],
    coin: { gp: 14, sp: 8, cp: 0 },
    bio: 'Raised in the Dawnfather’s cloister above Saltmarsh, Mara left her vows to chase the rumor that the Brine Hand was reviving something in the tidal flats. She keeps a lantern lit for the company at every camp.',
    dmNotes: 'Secretly carries a debt to Dockmaster Pell — leverage if the party stalls. Will refuse to leave a downed ally, exploitable by Sild.',
  },

  /* ---------------- Campaign — entity browser ---------------- */
  arcs: [
    { id: 'arc1', name: 'The Brine Hand', status: 'active', sessions: '3–6', desc: 'A drowned cult claims the outpost as a smuggling waypoint and a temple.', quests: 4, color: 'accent' },
    { id: 'arc2', name: 'Debts of Saltmarsh', status: 'looming', sessions: '6–?', desc: 'The favors the company owes the town come due as the cult applies pressure.', quests: 2, color: 'info' },
    { id: 'arc3', name: 'The Drowned King', status: 'foreshadowed', sessions: '?', desc: 'Whatever Mother Sild is praying to in the lower vaults.', quests: 0, color: 'neutral' },
  ],
  quests: [
    { id: 'q1', name: 'The missing shipment', arc: 'The Brine Hand', status: 'active', tag: 'Main', npc: 'Vorlag', scene: 'The Pier', due: 'The 14th, low tide', desc: 'Recover the cargo the cult intercepted before the next low tide reveals the causeway.' },
    { id: 'q2', name: 'Parley with Vorlag', arc: 'The Brine Hand', status: 'active', tag: 'Side', npc: 'Vorlag', scene: 'The Pier', desc: 'He wants out, not a fight — if the party names the missing shipment first.' },
    { id: 'q3', name: 'Seal the lower vaults', arc: 'The Brine Hand', status: 'looming', tag: 'Main', scene: 'Drowned Hall', desc: 'The vaults flood on a 3-round timer once the portcullis drops.' },
    { id: 'q4', name: 'Find the smuggler’s ledger', arc: 'The Brine Hand', status: 'done', tag: 'Side', desc: 'Names three dock contacts and a date. Recovered in session 5.' },
    { id: 'q5', name: 'Repay Pell’s favor', arc: 'Debts of Saltmarsh', status: 'looming', tag: 'Side', npc: 'Dockmaster Pell', desc: 'He fed the party the ledger. He will collect.' },
  ],
  factions: [
    { id: 'f1', name: 'Brine Hand', kind: 'Cult', stance: 'hostile', leader: 'Mother Sild', power: 3, desc: 'Drowned-god cult running the outpost.' },
    { id: 'f2', name: 'Saltmarsh Watch', kind: 'Militia', stance: 'neutral', leader: 'Captain Roese', power: 2, desc: 'Understaffed; lost Vorlag to the cult.' },
    { id: 'f3', name: 'Dockworkers’ Union', kind: 'Guild', stance: 'friendly', leader: 'Dockmaster Pell', power: 2, desc: 'Knows every tide and bribe on the waterfront.' },
    { id: 'f4', name: 'The Lantern Company', kind: 'Party', stance: 'allied', leader: 'The party', power: 1, desc: 'Your adventurers.' },
  ],
  timeline: [
    { id: 't6', label: 'Session 6 — The Pier', when: 'Last session', summary: 'Tracked the ledger to the outpost and bribed the dockhand; combat broke out on the pier.', tag: 'Combat' },
    { id: 't5', label: 'Session 5 — The Salt Bell', when: '2 weeks ago', summary: 'Recovered the smuggler’s ledger from Henna’s cellar.', tag: 'Investigation' },
    { id: 't4', label: 'Session 4 — Low tide', when: '3 weeks ago', summary: 'First sighting of the drowned thralls on the causeway.', tag: 'Travel' },
    { id: 't3', label: 'Session 3 — Saltmarsh', when: '1 month ago', summary: 'The company took the missing-shipment job from the Watch.', tag: 'Social' },
  ],
  items: [
    { id: 'it1', name: 'Smuggler’s ledger', kind: 'Handout', vis: 'players', rarity: 'Mundane', desc: 'Three dock contacts and a date: the 14th, low tide.' },
    { id: 'it2', name: 'Tidecaller’s bell', kind: 'Artifact', vis: 'dm-only', rarity: 'Legendary', desc: 'Sild rings it to wake the vaults. Do not let the party ring it twice.' },
    { id: 'it3', name: 'Closed-fist sigil', kind: 'Clue', vis: 'dm-only', rarity: 'Mundane', desc: 'Stamped on every cult crate. Marks Brine Hand property.' },
  ],
  relationships: [
    { id: 're1', from: 'Vorlag', to: 'Brine Hand', kind: 'is defecting from', tone: 'warning' },
    { id: 're2', from: 'Mother Sild', to: 'The Drowned King', kind: 'is a devotee of', tone: 'error' },
    { id: 're3', from: 'Dockmaster Pell', to: 'The Lantern Company', kind: 'is owed a favor by', tone: 'info' },
    { id: 're4', from: 'Mara Quill', to: 'Dockmaster Pell', kind: 'is in debt to', tone: 'neutral' },
  ],

  /* ---------------- Settings ---------------- */
  // Sources / sync folded in from manage-vault; roles folded from manage-permissions.
  sources: [
    { id: 's1', name: 'Campaign Vault', kind: 'Local vault', state: 'synced', pending: 0, last: 'just now' },
    { id: 's2', name: 'Brine Hand Notes', kind: 'Obsidian', state: 'syncing', pending: 3, last: 'syncing…' },
    { id: 's3', name: 'Session Prep', kind: 'Google Docs', state: 'needs-auth', pending: 0, last: '2 days ago' },
    { id: 's4', name: 'Monster Manual (SRD)', kind: 'Open5e / SRD', state: 'synced', pending: 0, last: '1h ago' },
    { id: 's5', name: 'Old Roll20 export', kind: 'Roll20 import', state: 'error', pending: 1, last: 'failed' },
  ],
  roles: [
    { id: 'dm', name: 'Dungeon Master', count: 1, desc: 'Full authoring & live control.', tone: 'accent' },
    { id: 'codm', name: 'Co-DM', count: 1, desc: 'Authors content; cannot manage permissions.', tone: 'info' },
    { id: 'player', name: 'Player', count: 4, desc: 'Edits owned/granted content; sees assigned view.', tone: 'neutral' },
    { id: 'observer', name: 'Observer', count: 1, desc: 'Read-only. No character data. Always.', tone: 'neutral' },
  ],
};
