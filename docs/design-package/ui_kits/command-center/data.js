// Mock session/campaign data for the DND Tools UI kit. Plain global, no modules.
window.DNDData = {
  campaign: 'The Sunken Outpost',
  session: { status: 'active', round: 2, players: 4, audio: 'Tavern ambience' },
  combatants: [
    { id: 'c1', name: 'Mara Quill', kind: 'pc', init: 19, hp: 22, max: 30, ac: 16, conditions: ['Blessed'], active: true },
    { id: 'c2', name: 'Bandit Captain', kind: 'npc', init: 16, hp: 6, max: 52, ac: 15, conditions: ['Prone'], dmOnly: true },
    { id: 'c3', name: 'Bran Ironwood', kind: 'pc', init: 14, hp: 41, max: 44, ac: 18, conditions: [] },
    { id: 'c4', name: 'Lyra Vex', kind: 'pc', init: 11, hp: 27, max: 28, ac: 14, conditions: [] },
    { id: 'c5', name: 'Cult Acolyte', kind: 'npc', init: 8, hp: 13, max: 13, ac: 12, conditions: [], dmOnly: true },
  ],
  party: [
    { id: 'p1', name: 'Mara Quill', cls: 'Cleric 5', hp: 22, max: 30, conn: 'connected' },
    { id: 'p2', name: 'Bran Ironwood', cls: 'Fighter 5', hp: 41, max: 44, conn: 'connected' },
    { id: 'p3', name: 'Lyra Vex', cls: 'Rogue 5', hp: 27, max: 28, conn: 'connected' },
    { id: 'p4', name: 'Toral Dusk', cls: 'Wizard 5', hp: 18, max: 32, conn: 'offline' },
  ],
  players: [
    { id: 'p1', name: 'Mara Quill', scene: 'The Pier', status: 'live' },
    { id: 'p2', name: 'Bran Ironwood', scene: 'The Pier', status: 'live' },
    { id: 'p3', name: 'Lyra Vex', scene: 'The Pier', status: 'live' },
    { id: 'p4', name: 'Toral Dusk', scene: '—', status: 'queued' },
  ],
  maps: [
    { id: 'm1', name: 'The Pier', region: 'Outpost Yard', layers: 4, active: true, projecting: true },
    { id: 'm2', name: 'Drowned Hall', region: 'Lower Vaults', layers: 6, active: false },
    { id: 'm3', name: 'Outpost — Surface', region: 'Whole map', layers: 3, active: false },
  ],
  notes: [
    { id: 'n1', title: 'The Sunken Outpost', snippet: 'A half-drowned watchtower the cult has claimed as a smuggling waypoint…', vis: 'dm-only', src: 'Campaign', updated: '2m ago', open: true },
    { id: 'n2', title: 'Bandit Captain — Vorlag', snippet: 'Ex-watch sergeant. Will parley if the party mentions the missing shipment.', vis: 'dm-only', src: 'NPC', updated: '18m ago' },
    { id: 'n3', title: 'Handout — Smuggler\u2019s Ledger', snippet: 'Names three dock contacts and a date: the 14th, low tide.', vis: 'players', src: 'Handout', updated: '1h ago' },
    { id: 'n4', title: 'The Pier (read-aloud)', snippet: 'Brackish water laps at rotting planks; a lantern gutters at the far end.', vis: 'players', src: 'Scene', updated: '1h ago' },
    { id: 'n5', title: 'Lower Vaults — secrets', snippet: 'Pressure plate at the third archway. Trap: portcullis + rising water.', vis: 'hidden', src: 'Map', updated: '3h ago' },
    { id: 'n6', title: 'Session 6 recap', snippet: 'The party tracked the ledger to the outpost and bribed the dockhand.', vis: 'players', src: 'Recap', updated: 'Yesterday' },
  ],
  noteBody: `## The Sunken Outpost\n\nA half-drowned watchtower on the tidal flats, claimed by the **Brine Hand** cult as a smuggling waypoint. At low tide a stone causeway connects it to shore; at high tide it is an island.\n\n### Hooks\n- The missing shipment (the ledger names the 14th, low tide)\n- Vorlag will parley — he wants out, not a fight\n- The lower vaults flood on a 3-round timer once the portcullis drops\n\n### Read-aloud\n> Brackish water laps at the rotting pier. A single lantern gutters at the far end, throwing long shadows across crates stamped with a closed fist.`,
  dice: [
    { id: 'd1', notation: '1d20+7', total: 27, rolls: [20], modifier: 7, crit: 'success', who: 'Mara — Attack' },
    { id: 'd2', notation: '2d6+3', total: 11, rolls: [4, 4], modifier: 3, who: 'Mara — Radiant' },
  ],
};

// Command Center (navigational hub) — scenes you can drop into, plus manage/connection state.
window.DNDHub = {
  scenes: [
    { id: 's1', name: 'The Pier', region: 'Outpost Yard', status: 'live', players: 3, grad: 135 },
    { id: 's2', name: 'Drowned Hall', region: 'Lower Vaults', status: 'ready', grad: 200 },
    { id: 's3', name: 'Outpost — Surface', region: 'Whole map', status: 'ready', grad: 95 },
    { id: 's4', name: 'The Salt Bell', region: 'Saltmarsh town', status: 'draft', grad: 255 },
  ],
  library: [
    { id: 'atlas', label: 'Atlas', icon: 'atlas-map', count: '12 maps' },
    { id: 'characters', label: 'Characters', icon: 'characters-person', count: '4 PCs · 23 NPCs' },
    { id: 'knowledge', label: 'Knowledge', icon: 'knowledge-book', count: '38 notes' },
    { id: 'campaign', label: 'Campaign', icon: 'campaign-scroll', count: '6 sessions' },
  ],
  manage: [
    { id: 'players', label: 'Players', icon: 'UsersRound', meta: '4 invited · 3 online', tone: 'success' },
    { id: 'permissions', label: 'Permissions', icon: 'ShieldCheck', meta: 'DM + 4 roles', tone: 'neutral' },
    { id: 'vault', label: 'Vault connections', icon: 'DatabaseZap', meta: 'D&D Beyond · synced 2m ago', tone: 'success' },
  ],
  // Sidebar = scene switcher + the DM's own pinned shortcuts + recently-visited pages.
  pinned: [
    { id: 'pin-ledger', label: 'Smuggler’s Ledger', sub: 'Handout', icon: 'send', to: 'knowledge' },
    { id: 'pin-vorlag', label: 'Vorlag', sub: 'NPC', icon: 'characters-person', to: 'characters' },
    { id: 'pin-conditions', label: 'Conditions', sub: 'Rules', icon: 'book', to: 'knowledge' },
  ],
  recent: [
    { id: 'r1', label: 'Session 6 recap', icon: 'campaign-scroll', to: 'knowledge' },
    { id: 'r2', label: 'Drowned Hall', icon: 'atlas-map', to: 'atlas' },
    { id: 'r3', label: 'Lyra Vex', icon: 'characters-person', to: 'characters' },
  ],
};

window.DNDNav = [
  { id: 'home', label: 'Command Center', icon: 'home' },
  { id: 'session', label: 'Session', icon: 'session-bolt' },
  { id: 'characters', label: 'Characters', icon: 'characters-person' },
  { id: 'atlas', label: 'Atlas', icon: 'atlas-map' },
  { id: 'campaign', label: 'Campaign', icon: 'campaign-scroll' },
  { id: 'knowledge', label: 'Knowledge', icon: 'knowledge-book' },
];
