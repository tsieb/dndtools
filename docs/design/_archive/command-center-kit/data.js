// ============================================================================================
// data.js — all mock data for the Command Center UI kit, in ONE module.
//
// The kit's pages are separate HTML files; every page loads this single file (after _ds_bundle.js,
// before nav.js). One cohesive campaign — "The Sunken Outpost" / the Brine Hand cult — runs through
// all of it so cross-links resolve. Each section assigns its own plain global; no collisions.
//   window.DNDData  — live session / combat state (Command Center, Session)
//   window.DNDPages — authoring & management page vocabulary (notes, vault, players, permissions…)
//   window.DNDEdit  — scene edit-mode widget model
//   window.DNDGaps  — durable global sections (Characters, Campaign, Settings, character sheet)
//   window.DNDGaps2 — the later gap surfaces (graph/search, AI, audio, onboarding, sync, collab…)
// ============================================================================================


// ────────────────────────────────────────────────────────────────────────────────────────
// LIVE SESSION / COMBAT STATE  (window.DNDData)
// ────────────────────────────────────────────────────────────────────────────────────────
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


// ────────────────────────────────────────────────────────────────────────────────────────
// AUTHORING & MANAGEMENT PAGES  (window.DNDPages)
// ────────────────────────────────────────────────────────────────────────────────────────
window.DNDPages = {
  // --- Note editor ---
  noteBody: `## The Sunken Outpost\n\nA half-drowned watchtower on the tidal flats, claimed by the **Brine Hand** cult as a smuggling waypoint. At low tide a stone causeway connects it to shore; at high tide it is an island.\n\n### Hooks\n- The missing shipment — the ledger names the 14th, low tide\n- [[Vorlag]] will parley; he wants out, not a fight\n- The lower vaults flood on a 3-round timer once the portcullis drops\n\n> Brackish water laps at the rotting pier. A single lantern gutters at the far end, throwing long shadows across crates stamped with a closed fist.`,
  backlinks: [
    { id: 'b1', title: 'Session 6 recap', kind: 'Recap' },
    { id: 'b2', title: 'Vorlag', kind: 'NPC' },
    { id: 'b3', title: 'The Pier (read-aloud)', kind: 'Scene' },
  ],
  related: [
    { id: 'r1', title: 'Smuggler’s Ledger', kind: 'Handout' },
    { id: 'r2', title: 'Lower Vaults — secrets', kind: 'Map note' },
  ],

  // --- Map builder: layer categories mirror gm MapLayerPanel (base/grid/walls/lights/tokens/fog/dm-annotations) ---
  mapLayers: [
    { id: 'l1', name: 'Base map', cat: 'Base', tone: 'base', vis: 'player-visible', opacity: 100, locked: true, marks: 1, enabled: true },
    { id: 'l2', name: 'Grid', cat: 'Grid', tone: 'grid', vis: 'player-visible', opacity: 40, locked: false, marks: 1, enabled: true },
    { id: 'l3', name: 'Walls', cat: 'Walls', tone: 'walls', vis: 'dm-only', opacity: 100, locked: false, marks: 24, enabled: true },
    { id: 'l4', name: 'Fog of war', cat: 'Fog', tone: 'fog', vis: 'player-visible', opacity: 85, locked: false, marks: 3, enabled: true },
    { id: 'l5', name: 'Lighting', cat: 'Lights', tone: 'lights', vis: 'player-visible', opacity: 70, locked: false, marks: 6, enabled: true },
    { id: 'l6', name: 'Tokens', cat: 'Tokens', tone: 'tokens', vis: 'player-visible', opacity: 100, locked: false, marks: 5, enabled: true },
    { id: 'l7', name: 'DM notes', cat: 'DM notes', tone: 'dm', vis: 'dm-only', opacity: 100, locked: false, marks: 4, enabled: false },
  ],
  mapTools: [
    { id: 'select', icon: 'MousePointer2', label: 'Select' },
    { id: 'pan', icon: 'Hand', label: 'Pan' },
    { id: 'wall', icon: 'Spline', label: 'Walls' },
    { id: 'fog', icon: 'Cloud', label: 'Fog' },
    { id: 'token', icon: 'MapPin', label: 'Token' },
    { id: 'light', icon: 'Lightbulb', label: 'Light' },
    { id: 'poi', icon: 'Flag', label: 'POI' },
    { id: 'route', icon: 'Route', label: 'Route' },
    { id: 'measure', icon: 'Ruler', label: 'Measure' },
    { id: 'text', icon: 'Type', label: 'Text' },
  ],
  tokens: [
    { id: 't1', label: 'Mara', x: 28, y: 40, tone: 'pc' },
    { id: 't2', label: 'Bran', x: 38, y: 55, tone: 'pc' },
    { id: 't3', label: 'Vorlag', x: 64, y: 36, tone: 'npc' },
    { id: 't4', label: 'Acolyte', x: 72, y: 60, tone: 'npc' },
  ],

  // --- Character creator wizard (mirrors CharacterDraftFlow steps + QuickCreate kinds) ---
  charKinds: ['PC', 'NPC', 'Monster', 'Sidekick'],
  charSteps: [
    { id: 'identity', title: 'Identity', icon: 'characters-person' },
    { id: 'class', title: 'Class & level', icon: 'shield' },
    { id: 'stats', title: 'Ability scores', icon: 'Dices' },
    { id: 'kit', title: 'Attacks & kit', icon: 'sword' },
    { id: 'bio', title: 'Bio & DM notes', icon: 'NotebookPen' },
  ],
  abilities: [
    { key: 'STR', val: 15, mod: '+2' }, { key: 'DEX', val: 14, mod: '+2' }, { key: 'CON', val: 13, mod: '+1' },
    { key: 'INT', val: 10, mod: '+0' }, { key: 'WIS', val: 16, mod: '+3' }, { key: 'CHA', val: 12, mod: '+1' },
  ],

  // --- Scene creator: built-in templates from gm canvas-templates.ts ---
  sceneTemplates: [
    { id: 'combat', name: 'Combat Session', desc: 'Initiative tracker, a battle map, and a dice roller for running a fight.', widgets: 3, builtin: true, grad: 135 },
    { id: 'prep', name: 'Prep Board', desc: 'A notes-and-reference board for prepping the next session.', widgets: 3, builtin: true, grad: 200 },
    { id: 'handout', name: 'Player Handout Canvas', desc: 'A player-facing canvas with a handout and a shared note.', widgets: 2, builtin: true, grad: 95 },
    { id: 'blank', name: 'Blank canvas', desc: 'Start empty and add widgets yourself.', widgets: 0, builtin: false, grad: 255 },
  ],
  // Widget catalogue (gm widget-library.ts categories/types)
  widgetCatalogue: [
    { type: 'initiative-tracker', label: 'Initiative Tracker', cat: 'Combat', on: true },
    { type: 'map', label: 'Map', cat: 'Maps', on: true },
    { type: 'dice', label: 'Dice Roller', cat: 'Dice & Timers', on: true },
    { type: 'character', label: 'Character Sheet', cat: 'Characters', on: false },
    { type: 'note', label: 'Note', cat: 'Notes', on: false },
    { type: 'audio', label: 'Ambience', cat: 'Atmosphere', on: true },
    { type: 'quick-reference', label: 'Quick Reference', cat: 'Reference', on: false },
    { type: 'timer', label: 'Timer', cat: 'Dice & Timers', on: false },
  ],

  // --- Vault connections (gm SourceAdaptersPanel / SyncStatusPanel) ---
  sources: [
    { id: 's1', name: 'Campaign Vault', kind: 'Local vault', state: 'synced', pending: 0, last: 'just now', auth: 'On this device' },
    { id: 's2', name: 'Brine Hand Notes', kind: 'Obsidian', state: 'syncing', pending: 3, last: 'syncing…', auth: 'Folder linked' },
    { id: 's3', name: 'Session Prep', kind: 'Google Docs', state: 'needs-auth', pending: 0, last: '2 days ago', auth: 'Re-authorize' },
    { id: 's4', name: 'Monster Manual (SRD)', kind: 'Open5e / SRD', state: 'synced', pending: 0, last: '1h ago', auth: 'Read-only' },
    { id: 's5', name: 'Old Roll20 export', kind: 'Roll20 import', state: 'error', pending: 1, last: 'failed', auth: 'Reconnect' },
  ],
  integrations: [
    { id: 'i1', name: 'D&D Beyond', kind: 'Characters & content' },
    { id: 'i2', name: 'Obsidian', kind: 'Markdown vault' },
    { id: 'i3', name: 'Google Docs', kind: 'Cloud docs' },
    { id: 'i4', name: 'Open5e / SRD', kind: 'Rules reference' },
  ],

  // --- Players (gm PlayerGroups / permissions actors: dm / player / observer) ---
  roster: [
    { id: 'p1', name: 'Mara Quill', role: 'player', char: 'Cleric 5', status: 'online', view: 'The Pier' },
    { id: 'p2', name: 'Bran Ironwood', role: 'player', char: 'Fighter 5', status: 'online', view: 'The Pier' },
    { id: 'p3', name: 'Lyra Vex', role: 'player', char: 'Rogue 5', status: 'online', view: 'The Pier' },
    { id: 'p4', name: 'Toral Dusk', role: 'player', char: 'Wizard 5', status: 'offline', view: '—' },
    { id: 'p5', name: 'Sam (guest)', role: 'observer', char: '—', status: 'online', view: 'Spectating' },
  ],
  invites: [
    { id: 'v1', email: 'devin@table.night', role: 'player', sent: '2h ago' },
  ],
  playerGroups: [
    { id: 'g1', name: 'The party', members: 4 },
    { id: 'g2', name: 'Front line', members: 2 },
  ],

  // --- Permissions (gm GrantManager capability sets + roles) ---
  roles: [
    { id: 'dm', name: 'Dungeon Master', count: 1, desc: 'Full authoring & live control.', tone: 'accent' },
    { id: 'codm', name: 'Co-DM', count: 1, desc: 'Authors content; cannot manage permissions.', tone: 'info' },
    { id: 'player', name: 'Player', count: 4, desc: 'Edits owned/granted content; sees assigned view.', tone: 'neutral' },
    { id: 'observer', name: 'Observer', count: 1, desc: 'Read-only. No character data. Always.', tone: 'neutral' },
  ],
  capabilitySets: [
    { value: 'viewer', label: 'Viewer', write: false, explain: 'Can view the entity. No edits.' },
    { value: 'co-editor', label: 'Co-editor', write: true, explain: 'Can view and edit content on the entity.' },
    { value: 'owner', label: 'Owner', write: true, explain: 'Full control of the entity, including sharing.' },
  ],
  grants: [
    { id: 'gr1', set: 'co-editor', type: 'scene', entity: 'The Pier', to: 'Mara Quill', expires: null },
    { id: 'gr2', set: 'viewer', type: 'map', entity: 'Drowned Hall', to: 'Bran Ironwood', expires: 'session end' },
    { id: 'gr3', set: 'owner', type: 'character', entity: 'Mara Quill', to: 'Mara Quill', expires: null },
  ],
  entityTypes: ['scene', 'map', 'character', 'note', 'widget'],

  // --- Widget builder (gm widget-library.ts: authoring with progressive complexity) ---
  widgetBuilder: {
    modes: [
      { value: 'basic', label: 'Basic', icon: 'Sparkles', blurb: 'Pick a preset and fill in a few fields. No code.' },
      { value: 'advanced', label: 'Advanced', icon: 'SlidersHorizontal', blurb: 'Bind live data, tune behavior, and set access — still no code.' },
      { value: 'code', label: 'Code', icon: 'Code2', blurb: 'Full HTML / CSS / JS. Override anything the presets generate.' },
    ],
    // Basic-mode starting points
    presets: [
      { id: 'counter', name: 'Counter', desc: 'A labelled number you can step up and down.', icon: 'Hash', grad: 135 },
      { id: 'loot', name: 'Loot Tracker', desc: 'Party gold plus an even-split button.', icon: 'Coins', grad: 95, bound: true },
      { id: 'tracker', name: 'Status Tracker', desc: 'Named bars — HP, resources, clocks.', icon: 'Activity', grad: 200 },
      { id: 'reference', name: 'Reference Card', desc: 'A titled block of rich text or rules.', icon: 'BookOpen', grad: 255 },
      { id: 'blank', name: 'Blank', desc: 'Empty shell — build it up yourself.', icon: 'Square', grad: 20 },
    ],
    sizes: ['Small · 240×160', 'Medium · 320×240', 'Large · 560×320', 'Custom…'],
    // Theme presets for Basic styling (no raw color pickers)
    themes: [
      { id: 'tavern', name: 'Tavern', accent: '#e0b06f', surface: '#1f1810', text: '#f2e8d8' },
      { id: 'parchment', name: 'Parchment', accent: '#9a5b34', surface: '#efe2c8', text: '#3a2c1a' },
      { id: 'arcane', name: 'Arcane', accent: '#9d7bd8', surface: '#1a1626', text: '#ece6f7' },
      { id: 'ember', name: 'Ember', accent: '#d8693f', surface: '#241310', text: '#f6e3da' },
      { id: 'custom', name: 'Custom', accent: '#e0b06f', surface: '#1f1810', text: '#f2e8d8' },
    ],
    // Advanced-mode live data bindings (map to gm campaign data adapters)
    bindings: [
      { id: 'gold', label: 'Party gold', source: 'Campaign · economy', on: true },
      { id: 'initiative', label: 'Initiative order', source: 'Encounter · live', on: false },
      { id: 'selected', label: 'Selected token', source: 'Canvas · selection', on: false },
      { id: 'scene', label: 'Active scene', source: 'Session · current', on: true },
      { id: 'timer', label: 'Session timer', source: 'Session · clock', on: false },
    ],
    // Advanced-mode behavior options
    refreshOpts: ['Live (on change)', 'Every 5s', 'Every 30s', 'Manual only'],
    events: [
      { id: 'onMount', label: 'On mount', desc: 'Runs once when the widget loads.' },
      { id: 'onData', label: 'On data change', desc: 'Re-renders when a bound source updates.' },
      { id: 'onClick', label: 'On interaction', desc: 'Handles player/DM clicks inside the widget.' },
    ],
    perms: [
      { label: 'Read campaign data', desc: 'Notes, characters, economy.', on: true },
      { label: 'Read dice results', desc: 'Recent rolls from the table.', on: true },
      { label: 'Write to vault', desc: 'Persist values back to the campaign.', on: false },
      { label: 'Network egress', desc: 'Fetch from outside the vault.', on: false },
    ],
  },
};


// ────────────────────────────────────────────────────────────────────────────────────────
// SCENE EDIT-MODE MODEL  (window.DNDEdit)
// ────────────────────────────────────────────────────────────────────────────────────────
window.DNDEdit = {
  grid: 20,

  // Registry: what can live on a canvas + how editable each kind is.
  types: {
    initiative: { label: 'Initiative tracker', icon: 'session-bolt', cat: 'Tools', tier: 'tool', w: 560, h: 300, defaults: { autoAdvance: true, showHpToPlayers: false, accent: true } },
    dice:       { label: 'Dice roller', icon: 'dice', cat: 'Tools', tier: 'tool', w: 300, h: 300, defaults: { presets: ['1d20', '2d6+3', '1d8+2'], advantage: false, history: true, accent: false } },
    timer:      { label: 'Timer', icon: 'recent', cat: 'Tools', tier: 'tool', w: 240, h: 140, defaults: { minutes: 5, accent: false } },
    audio:      { label: 'Audio', icon: 'audio', cat: 'Tools', tier: 'tool', w: 240, h: 120, defaults: { track: 'Tavern ambience', loop: true, accent: false } },
    conditions: { label: 'Quick reference', icon: 'book', cat: 'Reference', tier: 'tool', w: 300, h: 160, defaults: { items: ['Conditions', 'Cover', 'Death saves', 'Exhaustion'], accent: false } },
    party:      { label: 'Party vitals', icon: 'heart', cat: 'Core', tier: 'core', w: 360, h: 220, defaults: {} },
    players:    { label: 'Player views', icon: 'visibility-players', cat: 'Core', tier: 'core', w: 300, h: 220, defaults: {} },
    note:       { label: 'Note', icon: 'NotebookPen', cat: 'Custom', tier: 'custom', w: 280, h: 180, defaults: { text: 'Vorlag will parley if the party mentions the missing shipment.', size: 'md', accent: false } },
    image:      { label: 'Handout / image', icon: 'map', cat: 'Custom', tier: 'custom', w: 280, h: 200, defaults: { caption: 'Smuggler’s Ledger', accent: false } },
  },

  // The Pier — a live scene mid-session, a deliberate mix of core + customizable widgets.
  initial: [
    { id: 'w1', type: 'initiative', title: 'Combat — Round 2', vis: 'dm',      x: 20,  y: 20,  w: 560, h: 300, props: { autoAdvance: true, showHpToPlayers: false, accent: true } },
    { id: 'w2', type: 'dice',       title: 'Dice',            vis: 'shared',  x: 600, y: 20,  w: 300, h: 300, props: { presets: ['1d20', '2d6+3', '1d8+2'], advantage: false, history: true, accent: false } },
    { id: 'w3', type: 'party',      title: 'Party vitals',    vis: 'dm',      x: 20,  y: 340, w: 360, h: 220, props: {} },
    { id: 'w4', type: 'players',    title: 'Player views',    vis: 'dm',      x: 400, y: 340, w: 280, h: 220, props: {} },
    { id: 'w5', type: 'note',       title: 'Vorlag',          vis: 'dm',      x: 700, y: 340, w: 200, h: 220, props: { text: 'Ex-watch sergeant. Will parley if the party mentions the missing shipment.', size: 'md', accent: false } },
  ],
};


// ────────────────────────────────────────────────────────────────────────────────────────
// DURABLE GLOBAL SECTIONS  (window.DNDGaps)
// ────────────────────────────────────────────────────────────────────────────────────────
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


// ────────────────────────────────────────────────────────────────────────────────────────
// LATER GAP SURFACES  (window.DNDGaps2)
// ────────────────────────────────────────────────────────────────────────────────────────
window.DNDGaps2 = {

  /* ───────────────── Graph · search · discovery (UX-GRAPH / UX-SRCH) ───────────────── */
  // Relationship graph — normalized 0..100 coordinates; the renderer would position; here laid out.
  graph: {
    nodes: [
      { id: 'party', label: 'The Lantern Company', type: 'faction', vis: 'players', x: 26, y: 30, r: 30 },
      { id: 'mara', label: 'Mara Quill', type: 'character', vis: 'players', x: 13, y: 16, r: 22 },
      { id: 'bran', label: 'Bran Ironwood', type: 'character', vis: 'players', x: 12, y: 46, r: 22 },
      { id: 'lyra', label: 'Lyra Vex', type: 'character', vis: 'players', x: 38, y: 12, r: 22 },
      { id: 'brine', label: 'Brine Hand', type: 'faction', vis: 'dm-only', x: 72, y: 36, r: 30 },
      { id: 'sild', label: 'Mother Sild', type: 'character', vis: 'dm-only', x: 85, y: 24, r: 22 },
      { id: 'vorlag', label: 'Vorlag', type: 'character', vis: 'dm-only', x: 56, y: 54, r: 22 },
      { id: 'pell', label: 'Dockmaster Pell', type: 'character', vis: 'dm-only', x: 40, y: 70, r: 20 },
      { id: 'pier', label: 'The Pier', type: 'place', vis: 'players', x: 56, y: 80, r: 24 },
      { id: 'vaults', label: 'Lower Vaults', type: 'place', vis: 'dm-only', x: 82, y: 66, r: 22 },
      { id: 'ledger', label: 'Smuggler’s Ledger', type: 'item', vis: 'players', x: 25, y: 86, r: 18 },
      { id: 'bell', label: 'Tidecaller’s Bell', type: 'item', vis: 'dm-only', x: 90, y: 50, r: 18 },
    ],
    edges: [
      { from: 'mara', to: 'party', kind: 'member of' },
      { from: 'bran', to: 'party', kind: 'member of' },
      { from: 'lyra', to: 'party', kind: 'member of' },
      { from: 'sild', to: 'brine', kind: 'leads' },
      { from: 'vorlag', to: 'brine', kind: 'defecting', tone: 'warning' },
      { from: 'pell', to: 'party', kind: 'owed a favor', tone: 'info' },
      { from: 'mara', to: 'pell', kind: 'in debt to', tone: 'neutral' },
      { from: 'brine', to: 'pier', kind: 'controls' },
      { from: 'brine', to: 'vaults', kind: 'controls' },
      { from: 'party', to: 'pier', kind: 'fought at' },
      { from: 'ledger', to: 'pell', kind: 'names' },
      { from: 'sild', to: 'bell', kind: 'wields', tone: 'error' },
      { from: 'pier', to: 'vaults', kind: 'descends to' },
    ],
  },
  nodeTypes: [
    { id: 'character', label: 'Characters', icon: 'characters-person', tone: 'accent' },
    { id: 'place', label: 'Places', icon: 'atlas-map', tone: 'info' },
    { id: 'faction', label: 'Factions', icon: 'campaign-scroll', tone: 'warning' },
    { id: 'item', label: 'Items', icon: 'tag', tone: 'success' },
    { id: 'note', label: 'Notes', icon: 'knowledge-book', tone: 'neutral' },
  ],
  // Faceted search results.
  searchResults: [
    { id: 'sr1', title: 'Vorlag', type: 'character', vis: 'dm-only', source: 'NPC', snippet: 'Ex-watch sergeant turned bandit captain — will parley if the party names the missing shipment.', score: 98 },
    { id: 'sr2', title: 'The missing shipment', type: 'quest', vis: 'players', source: 'Quest', snippet: 'Recover the cargo the cult intercepted before the next low tide reveals the causeway.', score: 91 },
    { id: 'sr3', title: 'Smuggler’s Ledger', type: 'item', vis: 'players', source: 'Handout', snippet: 'Names three dock contacts and a date: the 14th, low tide.', score: 88 },
    { id: 'sr4', title: 'The Pier', type: 'place', vis: 'players', source: 'Scene · Map', snippet: 'Brackish water laps at rotting planks; a lantern gutters at the far end.', score: 84 },
    { id: 'sr5', title: 'Lower Vaults — secrets', type: 'note', vis: 'hidden', source: 'Map note', snippet: 'Pressure plate at the third archway. Trap: portcullis + rising water.', score: 72 },
    { id: 'sr6', title: 'Session 6 recap', type: 'note', vis: 'players', source: 'Recap', snippet: 'The party tracked the ledger to the outpost and bribed the dockhand.', score: 64 },
  ],
  searchFacets: [
    { id: 'all', label: 'All', count: 38 },
    { id: 'character', label: 'Characters', count: 27 },
    { id: 'place', label: 'Places', count: 6 },
    { id: 'note', label: 'Notes', count: 38 },
    { id: 'item', label: 'Items', count: 9 },
    { id: 'quest', label: 'Quests', count: 5 },
  ],
  // ⌘K command palette.
  paletteRecent: [
    { id: 'pr1', label: 'Session 6 recap', kind: 'Note', icon: 'campaign-scroll' },
    { id: 'pr2', label: 'The Pier', kind: 'Scene', icon: 'scene' },
    { id: 'pr3', label: 'Vorlag', kind: 'NPC', icon: 'characters-person' },
  ],
  paletteCommands: [
    { id: 'pc1', label: 'Start session', kind: 'Command', icon: 'play', keys: 'S' },
    { id: 'pc2', label: 'Roll dice…', kind: 'Command', icon: 'dice', keys: 'R' },
    { id: 'pc3', label: 'New note', kind: 'Create', icon: 'note-edit', keys: 'N' },
    { id: 'pc4', label: 'Project map to players', kind: 'Command', icon: 'atlas-map' },
    { id: 'pc5', label: 'Push handout…', kind: 'Command', icon: 'send' },
    { id: 'pc6', label: 'Open Settings → AI & Tools', kind: 'Go to', icon: 'settings-gear' },
  ],

  /* ───────────────── AI & MCP tools (UX-MCP) ───────────────── */
  ai: {
    enabled: true,
    scope: 'AI helps with writing and named-entity extraction. It never owns graph intelligence, relationship scoring, or permission decisions — algorithms do.',
    baselineTools: [
      { id: 'bt1', name: 'Vault summary read', cap: 'read', on: true },
      { id: 'bt2', name: 'Note read / list / search', cap: 'read', on: true },
      { id: 'bt3', name: 'Graph context read', cap: 'read', on: true },
      { id: 'bt4', name: 'Character query', cap: 'read', on: true },
      { id: 'bt5', name: 'Dice roll', cap: 'read', on: true },
      { id: 'bt6', name: 'Session prep bundle', cap: 'read', on: true },
    ],
    agents: [
      { id: 'ag1', name: 'Claude (web)', actor: 'dm-assistant', status: 'connected', policy: 'strict_review' },
      { id: 'ag2', name: 'Local model', actor: 'unbound', status: 'disabled', policy: 'disabled' },
    ],
    policies: [
      { value: 'disabled', label: 'Disabled', desc: 'Connected but cannot run any tool.' },
      { value: 'strict_review', label: 'Strict review', desc: 'Every write is staged for your approval.' },
      { value: 'balanced', label: 'Balanced', desc: 'Batches low-risk writes; flags the rest for review.' },
      { value: 'trusted_direct', label: 'Trusted direct', desc: 'Writes directly. Opt-in; high trust only.' },
    ],
    staged: [
      { id: 'st1', kind: 'Create note', title: 'The Withered Oak', agent: 'Claude', policy: 'strict_review', when: '14:41',
        diff: [['+', 'Title: The Withered Oak'], ['+', 'Tags: #location #cursed'], ['+', 'A lightning-split oak on the causeway road; the cult hangs warnings from it.']] },
      { id: 'st2', kind: 'Update character', title: 'Vorlag — backstory', agent: 'Claude', policy: 'strict_review', when: '14:38',
        diff: [['-', 'Ex-watch sergeant.'], ['+', 'Ex-watch sergeant who lost his post when the cult framed him for the missing shipment.']] },
      { id: 'st3', kind: 'Link entities', title: 'Pell → Ledger', agent: 'Claude', policy: 'balanced', when: '14:36',
        diff: [['+', 'Smuggler’s Ledger  —names→  Dockmaster Pell']] },
    ],
    // inline-suggestion demo (diff card in the editor)
    suggestion: {
      prompt: 'Make the read-aloud more ominous',
      sources: ['The Pier (scene)', 'Session 7 notes'],
      diff: [
        ['ctx', 'Brackish water laps at the rotting pier.'],
        ['-', 'A single lantern gutters at the far end.'],
        ['+', 'A single lantern gutters at the far end, and the water between you and it is too still — as if something beneath is holding its breath.'],
      ],
    },
  },

  /* ───────────────── Audio & atmosphere (UX-AUDIO) ───────────────── */
  audio: {
    projecting: true, listeners: 3,
    nowScene: 'The Pier',
    ambience: [
      { id: 'a1', name: 'Rain on the pier', loop: true, vol: 62, on: true, icon: 'CloudRain' },
      { id: 'a2', name: 'Harbour swell', loop: true, vol: 44, on: true, icon: 'Waves' },
      { id: 'a3', name: 'Distant gulls', loop: true, vol: 18, on: true, icon: 'Bird' },
      { id: 'a4', name: 'Tavern murmur', loop: true, vol: 0, on: false, icon: 'Beer' },
      { id: 'a5', name: 'Cult chant (low)', loop: true, vol: 30, on: false, dm: true, icon: 'Music2' },
    ],
    master: 70,
    cues: [
      { id: 'c1', label: 'Combat start', icon: 'sword', tone: 'error', hot: '1' },
      { id: 'c2', label: 'Victory sting', icon: 'sparkle', tone: 'success', hot: '2' },
      { id: 'c3', label: 'Door / portcullis', icon: 'lock', tone: 'neutral', hot: '3' },
      { id: 'c4', label: 'Thunderclap', icon: 'CloudLightning', tone: 'warning', hot: '4' },
      { id: 'c5', label: 'Dice / coin', icon: 'dice', tone: 'neutral', hot: '5' },
      { id: 'c6', label: 'Bell toll', icon: 'Bell', tone: 'accent', hot: '6' },
      { id: 'c7', label: 'Whispers', icon: 'audio', tone: 'info', hot: '7' },
      { id: 'c8', label: 'Reveal stinger', icon: 'reveal', tone: 'accent', hot: '8' },
    ],
    scenes: [
      { id: 'sc1', name: 'The Pier', tracks: 3, bound: true },
      { id: 'sc2', name: 'Drowned Hall', tracks: 4, bound: false },
      { id: 'sc3', name: 'The Salt Bell (tavern)', tracks: 2, bound: false },
    ],
  },

  /* ───────────────── Onboarding & learnability (UX-ONB) ───────────────── */
  onboarding: {
    steps: [
      { id: 'welcome', title: 'Welcome', icon: 'sparkle' },
      { id: 'vault', title: 'Your vault', icon: 'vault' },
      { id: 'campaign', title: 'First campaign', icon: 'campaign-scroll' },
      { id: 'players', title: 'Invite players', icon: 'players' },
    ],
    vaultChoices: [
      { id: 'new', name: 'Start a fresh vault', desc: 'A new local vault on this device. Sync later.', icon: 'add', rec: true },
      { id: 'sample', name: 'Open the sample campaign', desc: 'Land in “The Sunken Outpost” with maps, NPCs and a live scene already set up.', icon: 'scene' },
      { id: 'import', name: 'Import from a source', desc: 'Obsidian vault, Google Docs, or a Roll20 export.', icon: 'import' },
    ],
    timeToValue: '~2 min',
    // per-surface empty states (the illustration + first-action pattern)
    empties: [
      { id: 'e1', section: 'Atlas', icon: 'atlas-map', head: 'No maps yet', body: 'Create a map or import an image to build your first region.', cta: 'New map', alt: 'Import image' },
      { id: 'e2', section: 'Characters', icon: 'characters-person', head: 'Your roster is empty', body: 'Add the party’s heroes, then the NPCs they’ll meet.', cta: 'New character', alt: 'Import from D&D Beyond' },
      { id: 'e3', section: 'Knowledge', icon: 'knowledge-book', head: 'Nothing written down', body: 'Notes, handouts and read-aloud text live here. Backlinks connect them automatically.', cta: 'New note', alt: 'Open sample' },
      { id: 'e4', section: 'Search', icon: 'search', head: 'No results for “drowned king”', body: 'Try fewer words, or search a different type. DM-only entities are never shown to players.', cta: null, alt: null },
    ],
    tour: [
      { id: 'tr1', title: 'This is your Command Center', body: 'The board of live-play widgets — session, combat, dice, maps. Everything you run at the table starts here.', step: 1 },
      { id: 'tr2', title: 'Resume drops you into the live scene', body: 'The gold action is always the one primary thing to do next.', step: 2 },
      { id: 'tr3', title: 'Press ⌘K to go anywhere', body: 'Search every entity, run a command, or push a handout — without leaving the table.', step: 3 },
    ],
    checklist: [
      { id: 'ck1', label: 'Create your vault', done: true },
      { id: 'ck2', label: 'Add the party', done: true },
      { id: 'ck3', label: 'Build a map', done: false },
      { id: 'ck4', label: 'Invite a player', done: false },
      { id: 'ck5', label: 'Run your first scene', done: false },
    ],
  },

  /* ───────────────── Session lifecycle (UX-SES) ───────────────── */
  session: {
    phase: 'live', // prep · live · recap
    number: 7, title: 'Low tide at the outpost', elapsed: '1:48',
    prep: [
      { id: 'pp1', label: 'Encounter built — Pier ambush', done: true, icon: 'sword' },
      { id: 'pp2', label: 'Map ready — The Pier (projecting)', done: true, icon: 'atlas-map' },
      { id: 'pp3', label: 'Handout queued — Smuggler’s Ledger', done: true, icon: 'send' },
      { id: 'pp4', label: 'Recap read-aloud written', done: false, icon: 'note-edit' },
      { id: 'pp5', label: 'Ambience bound — Rain on the pier', done: true, icon: 'audio' },
    ],
    feed: [
      { id: 'sf1', t: '1:48', text: 'Round 2 — Mara’s turn', kind: 'combat', icon: 'sword' },
      { id: 'sf2', t: '1:46', text: 'Lyra rolled 27 to hit (crit)', kind: 'dice', icon: 'dice' },
      { id: 'sf3', t: '1:41', text: 'Pushed handout: Smuggler’s Ledger', kind: 'share', icon: 'send' },
      { id: 'sf4', t: '1:33', text: 'Revealed area: the far pier', kind: 'map', icon: 'reveal' },
      { id: 'sf5', t: '1:20', text: 'Combat started — Pier ambush', kind: 'combat', icon: 'flag' },
    ],
    recap: [
      { id: 'rc1', text: 'The company crossed the causeway at low tide and reached the pier.', tag: 'Travel' },
      { id: 'rc2', text: 'A Brine Hand ambush broke out; Vorlag held back, watching.', tag: 'Combat' },
      { id: 'rc3', text: 'Lyra recovered the second half of the ledger from a sunken crate.', tag: 'Loot' },
    ],
    stats: [
      { k: 'Duration', v: '1:48' }, { k: 'Rounds', v: '2' }, { k: 'Rolls', v: '23' }, { k: 'Handouts', v: '1' },
    ],
  },

  /* ───────────────── Content import / source-of-truth (UX-CONTENT) ───────────────── */
  import: {
    steps: ['Source', 'Review', 'Map fields', 'Commit'],
    source: { name: 'Brine Hand Notes', kind: 'Obsidian vault', path: '~/vaults/saltmarsh', files: 214 },
    classified: {
      importable: [
        { id: 'im1', name: 'NPCs / Vorlag.md', as: 'Character', vis: 'dm-only' },
        { id: 'im2', name: 'NPCs / Mother Sild.md', as: 'Character', vis: 'dm-only' },
        { id: 'im3', name: 'Places / The Pier.md', as: 'Place + Scene', vis: 'players' },
        { id: 'im4', name: 'Handouts / Ledger.md', as: 'Handout', vis: 'players' },
      ],
      lossy: [
        { id: 'lo1', name: 'Maps / outpost.excalidraw', as: 'Image only', note: 'Vector layers flattened to a single image.' },
        { id: 'lo2', name: 'index.canvas', as: 'Backlinks only', note: 'Canvas layout dropped; links preserved.' },
      ],
      unsupported: [
        { id: 'un1', name: 'plugins/dataview-queries', note: 'Dynamic queries can’t be imported.' },
      ],
    },
    reconcile: { entity: 'The Pier', field: 'Read-aloud', local: 'A lantern gutters at the far end.', incoming: 'A single lantern gutters at the far end, throwing long shadows.' },
  },

  /* ───────────────── Sync & offline (UX-SYNC) ───────────────── */
  sync: {
    online: false, queued: 4, lastSync: '6 min ago',
    queue: [
      { id: 'sq1', op: 'Update', entity: 'Mara Quill — HP 22→18', icon: 'characters-person' },
      { id: 'sq2', op: 'Create', entity: 'Note — “Pier ambush”', icon: 'note-edit' },
      { id: 'sq3', op: 'Fog', entity: 'The Pier — revealed far dock', icon: 'reveal' },
      { id: 'sq4', op: 'Roll', entity: 'Lyra — 1d20+7 = 27', icon: 'dice' },
    ],
    conflicts: [
      { id: 'cf1', entity: 'The Pier', field: 'Read-aloud text', kind: 'note',
        mine: 'A lantern gutters at the far end of the pier.', minWhen: 'this device · 14:31',
        theirs: 'A single lantern gutters at the far end, throwing long shadows across the crates.', theirWhen: 'Co-DM Aša · 14:29' },
      { id: 'cf2', entity: 'Vorlag', field: 'Current HP', kind: 'character',
        mine: '52 / 52', minWhen: 'this device · 14:30',
        theirs: '41 / 52', theirWhen: 'Co-DM Aša · 14:33' },
    ],
  },

  /* ───────────────── Collaboration presence (UX-COLLAB) ───────────────── */
  collab: {
    doc: 'The Sunken Outpost',
    editors: [
      { id: 'me', name: 'You', role: 'DM', color: '#e0b06f', at: 'Hooks', self: true },
      { id: 'asa', name: 'Aša', role: 'Co-DM', color: '#5aa6e0', at: 'Read-aloud', line: 12 },
      { id: 'kit', name: 'Kit', role: 'Player', color: '#7bcf9a', at: 'viewing', line: 3, view: true },
    ],
    activity: [
      { id: 'av1', who: 'Aša', text: 'edited the read-aloud paragraph', when: 'now', color: '#5aa6e0' },
      { id: 'av2', who: 'You', text: 'added a hook: “Vorlag will parley”', when: '2m', color: '#e0b06f' },
      { id: 'av3', who: 'Kit', text: 'commented: “can players see this?”', when: '5m', color: '#7bcf9a' },
    ],
    shareScopes: [
      { id: 'ss1', label: 'Co-DM Aša', sub: 'Can edit', icon: 'characters-person', level: 'edit' },
      { id: 'ss2', label: 'The party', sub: 'Can view (player-visible blocks only)', icon: 'players', level: 'view' },
      { id: 'ss3', label: 'Observer (Sam)', sub: 'No access — DM-only note', icon: 'dm-only', level: 'none' },
    ],
  },

  /* ───────────────── Accessibility specimen (UX-A11Y) ───────────────── */
  a11y: {
    shortcuts: [
      { keys: '⌘K', action: 'Open command palette / search' },
      { keys: 'Tab / ⇧Tab', action: 'Move focus forward / back' },
      { keys: '↑ ↓', action: 'Move within initiative / lists' },
      { keys: 'N', action: 'Next turn (combat)' },
      { keys: 'Space', action: 'Toggle the focused control' },
      { keys: 'Esc', action: 'Dismiss popover / sheet / suggestion' },
    ],
    announcements: [
      { id: 'an1', live: 'polite', text: 'Round 2. Mara Quill’s turn.', icon: 'sword' },
      { id: 'an2', live: 'assertive', text: 'Change approved. Note created.', icon: 'check' },
      { id: 'an3', live: 'polite', text: 'Projecting to 3 players.', icon: 'reveal' },
      { id: 'an4', live: 'polite', text: 'Offline. 4 changes queued.', icon: 'audio-off' },
    ],
    leakChecks: [
      { id: 'lc1', label: 'DM-only entities excluded from player search results', ok: true },
      { id: 'lc2', label: 'Hidden layers never enter the player query model', ok: true },
      { id: 'lc3', label: 'alt-text / aria-labels carry no DM-only content', ok: true },
      { id: 'lc4', label: 'Live-region announcements actor-filtered before render', ok: true },
      { id: 'lc5', label: 'Sync diffs strip DM-only fields from player payloads', ok: true },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────
// EXTENSIBILITY & ECOSYSTEM  (window.DNDExt)  — Initiative 8
// Plugins, the Open5e compendium, custom object types, the campaign-system
// module boundary, and the theme studio. Same Sunken Outpost campaign so
// cross-links resolve. Every write a plugin or import makes still routes
// through the staged-review model the AI surface already shows.
// ─────────────────────────────────────────────────────────────────
window.DNDExt = {

  /* ── Plugins (S8.1) — registry + sandbox capability declarations ── */
  // Each capability badge mirrors the manifest's enumerated capability list.
  capabilityMeta: {
    object_types:          { label: 'object types',   tone: 'info' },
    toolbar_actions:       { label: 'toolbar',        tone: 'neutral' },
    render_hooks:          { label: 'render hooks',   tone: 'neutral' },
    command_contributions: { label: 'commands',       tone: 'neutral' },
    mcp_tools:             { label: 'MCP tools',       tone: 'warning' },
    write_access:          { label: 'write access',   tone: 'error' },
    compendium_source:     { label: 'compendium',     tone: 'info' },
  },
  plugins: [
    { id: 'pl-open5e', name: 'Open5e Compendium', author: 'DND Tools', version: '1.4.0', on: true, builtin: true,
      desc: 'Searches the public Open5e SRD for monsters, spells, items and conditions; imports them as vault objects.',
      caps: ['compendium_source', 'object_types'], hooks: [], grants: ['network: api.open5e.com'] },
    { id: 'pl-tables', name: 'Random Tables Pro', author: 'fenwick.dev', version: '0.9.2', on: true, builtin: false,
      desc: 'Adds a “roll on table” toolbar action and a /table command. Reads tables from your vault; never writes.',
      caps: ['toolbar_actions', 'command_contributions'], hooks: ['onRender'], grants: ['vault: read'] },
    { id: 'pl-ships', name: 'Spelljammer Ships', author: 'community', version: '2.1.0', on: false, builtin: false,
      desc: 'Registers a “Ship” object type with deck plans, crew slots and an AC/HP track for vehicle combat.',
      caps: ['object_types', 'render_hooks', 'write_access'], hooks: ['onNoteSave'], grants: ['vault: read', 'vault: write (staged)'] },
    { id: 'pl-discord', name: 'Discord Recap Poster', author: 'wisp', version: '1.0.3', on: false, builtin: false, needsReview: true,
      desc: 'Posts published session recaps to a Discord webhook. Requested write access — pending your review.',
      caps: ['command_contributions', 'mcp_tools', 'write_access'], hooks: ['onExport'], grants: ['network: discord.com', 'vault: read'] },
  ],
  // The config schema a selected plugin declares (rendered by the generic form renderer).
  pluginConfig: {
    'pl-tables': [
      { key: 'folder', label: 'Tables folder', type: 'text', value: 'Tables/' },
      { key: 'reroll', label: 'Allow reroll on duplicate', type: 'switch', value: true },
      { key: 'visibility', label: 'Default result visibility', type: 'select', value: 'dm-only', options: ['dm-only', 'player-visible'] },
    ],
  },

  /* ── Compendium (S8.4) — Open5e search → import-to-object ── */
  compendium: {
    sources: [
      { id: 'open5e', label: 'Open5e SRD', count: '3.2k', on: true },
      { id: 'srd', label: 'Local SRD cache', count: '1.1k', on: true },
    ],
    types: [
      { id: 'monster', label: 'Monsters', icon: 'sword', count: 1840 },
      { id: 'spell', label: 'Spells', icon: 'sparkle', count: 614 },
      { id: 'item', label: 'Magic items', icon: 'tag', count: 362 },
      { id: 'condition', label: 'Conditions', icon: 'cond-poisoned', count: 15 },
    ],
    results: [
      { id: 'cr-sahuagin', name: 'Sahuagin', type: 'monster', meta: 'Medium humanoid · CR 1/2', sub: 'Open5e · SRD', imported: false,
        line: 'Shark-kin raiders of the Brine Hand’s tide-temple. Pack tactics; limited amphibious.' },
      { id: 'cr-merrow', name: 'Merrow', type: 'monster', meta: 'Large monstrosity · CR 2', sub: 'Open5e · SRD', imported: true,
        line: 'Corrupted sea-ogres. The cult chains them beneath the lower vaults.' },
      { id: 'cr-watershaper', name: 'Water Elemental', type: 'monster', meta: 'Large elemental · CR 5', sub: 'Open5e · SRD', imported: false,
        line: 'Whelm, engulf, freedom of movement. Mother Sild’s closing trick.' },
      { id: 'cr-tidal', name: 'Control Water', type: 'spell', meta: 'Lvl 4 transmutation · 1 action', sub: 'Open5e · SRD', imported: false,
        line: 'Flood, part, redirect or create a whirlpool in a large body of water.' },
      { id: 'cr-trident', name: 'Trident of Fish Command', type: 'item', meta: 'Weapon (trident) · uncommon', sub: 'Open5e · SRD', imported: false,
        line: 'Cast dominate beast on a creature with a swimming speed. 3 charges.' },
    ],
    // The selected entry's field map — API field → vault object field, editable before save.
    selected: 'cr-sahuagin',
    mapping: [
      { api: 'name', field: 'Name', value: 'Sahuagin', kind: 'text' },
      { api: 'size + type', field: 'Defenses band', value: 'Medium humanoid', kind: 'text' },
      { api: 'armor_class', field: 'AC', value: '12', kind: 'num' },
      { api: 'hit_points', field: 'HP', value: '22 (4d8 + 4)', kind: 'num' },
      { api: 'challenge_rating', field: 'CR', value: '1/2 (100 XP)', kind: 'num' },
      { api: 'actions[]', field: 'Actions', value: '3 mapped (Multiattack, Bite, Spear)', kind: 'list' },
      { api: 'special_abilities[]', field: 'Traits', value: '3 mapped (Limited Amphibiousness, Pack Tactics, Shark Telepathy)', kind: 'list' },
      { api: '—', field: 'Linked note', value: 'Create “Sahuagin” + backlink to Brine Hand', kind: 'new' },
    ],
  },

  /* ── Custom object types (S8.3) — schema-backed type builder ── */
  objectTypes: {
    fieldTypes: [
      { id: 'text', label: 'Text', icon: 'tool-text' },
      { id: 'number', label: 'Number', icon: 'distance' },
      { id: 'boolean', label: 'Toggle', icon: 'check' },
      { id: 'tag-list', label: 'Tag list', icon: 'tag' },
      { id: 'note-ref', label: 'Note reference', icon: 'link' },
      { id: 'relationship', label: 'Relationship', icon: 'group' },
    ],
    types: [
      { id: 'ot-ship', name: 'Ship', icon: 'Sailboat', from: 'Spelljammer Ships plugin', count: 4, fields: 7, builtin: false },
      { id: 'ot-deity', name: 'Deity', icon: 'Sparkles', from: 'Custom', count: 9, fields: 5, builtin: false },
      { id: 'ot-treaty', name: 'Faction Treaty', icon: 'Scroll', from: 'Custom', count: 3, fields: 6, builtin: false },
      { id: 'ot-npc', name: 'NPC', icon: 'characters-person', from: '5e system module', count: 41, fields: 12, builtin: true },
    ],
    // The "New type" draft form — a faction-treaty being defined.
    draft: {
      name: 'Faction Treaty', icon: 'Scroll',
      fields: [
        { key: 'parties', label: 'Signatory factions', type: 'relationship', required: true },
        { key: 'signed', label: 'Signed (in-world date)', type: 'text', required: true },
        { key: 'terms', label: 'Terms', type: 'text', required: true },
        { key: 'broken', label: 'Broken', type: 'boolean', required: false },
        { key: 'witnesses', label: 'Witnesses', type: 'tag-list', required: false },
        { key: 'related', label: 'Related quest', type: 'note-ref', required: false },
      ],
    },
  },

  /* ── Campaign system module (S8.2) — the swappable rules boundary ── */
  campaignSystem: {
    active: 'dnd5e',
    modules: [
      { id: 'dnd5e', name: 'D&D 5e', from: 'Built-in', desc: 'Full stat blocks, the 15 conditions, the CR→XP table, class names and spell slots.', active: true },
      { id: 'generic', name: 'Generic / narrative', from: 'Built-in', desc: 'No stat blocks, no CR. Freeform character sheets for system-agnostic or fiction-first play.', active: false },
      { id: 'pf2e', name: 'Pathfinder 2e', from: 'Community plugin', desc: 'Three-action economy, PF2e conditions and creature schema. Provided by a plugin.', active: false },
    ],
    // Dry-run preview shown before switching dnd5e → generic.
    migration: {
      to: 'generic',
      rows: [
        { label: 'Characters', count: 12, effect: 'keep', note: 'Ability scores kept as freeform fields' },
        { label: 'Stat blocks', count: 41, effect: 'flatten', note: 'AC / HP / CR collapse into notes; no mechanics' },
        { label: 'Conditions', count: 7, effect: 'drop', note: '5e condition tags have no generic equivalent' },
        { label: 'Spell slots', count: 28, effect: 'drop', note: 'Slot tracks removed from sheets' },
        { label: 'Notes & maps', count: 318, effect: 'keep', note: 'Untouched — system-agnostic content' },
      ],
    },
  },

  /* ── Theme studio (S8.5) — token override editor + live preview ── */
  theme: {
    presets: [
      { id: 'tavern', label: 'Tavern', active: true },
      { id: 'parchment', label: 'Parchment', active: false },
      { id: 'high-contrast', label: 'High contrast', active: false },
      { id: 'custom', label: 'Candle (custom)', active: false, custom: true },
    ],
    groups: [
      { label: 'Surface', tokens: [
        { name: '--color-bg', value: '#14100b', swatch: '#14100b' },
        { name: '--color-surface-raised', value: '#211a12', swatch: '#211a12' },
        { name: '--color-surface-sunken', value: '#0d0a07', swatch: '#0d0a07' },
      ]},
      { label: 'Content', tokens: [
        { name: '--color-text-primary', value: '#f2e8d8', swatch: '#f2e8d8' },
        { name: '--color-text-secondary', value: '#c4b298', swatch: '#c4b298' },
        { name: '--color-border', value: '#3a2f22', swatch: '#3a2f22' },
      ]},
      { label: 'Accent', tokens: [
        { name: '--color-accent', value: '#e0b06f', swatch: '#e0b06f', edited: true },
        { name: '--color-status-success', value: '#5b9d6b', swatch: '#5b9d6b' },
        { name: '--color-status-error', value: '#c25c52', swatch: '#c25c52' },
      ]},
    ],
  },
};

// ─────────────────────────────────────────────────────────────────
// PLAYER CHARACTER SUITE  (window.DNDPlayer)  — Initiative 10
// The second persona. Everything here is the PLAYER's own surface, not the
// DM's read-only view: a complete 5e sheet, session-scoped resources, the live
// party panel, the guided level-up wizard, and a DM-invisible private journal.
// Mara Quill (a PC of The Lantern Company) at the Sunken Outpost.
// ─────────────────────────────────────────────────────────────────
window.DNDPlayer = {
  character: {
    name: 'Mara Quill', player: 'Ren', cls: 'Cleric', subclass: 'Light Domain', level: 5,
    race: 'Half-elf', background: 'Acolyte', alignment: 'NG', xp: 8200, xpNext: 14000,
    profBonus: 3, inspiration: true,
    hp: { cur: 27, max: 38, temp: 0 }, ac: 18, speed: 30, init: 2, hitDice: '5d8', hitDiceLeft: 4,
    abilities: [
      { key: 'STR', score: 10, mod: 0, save: false },
      { key: 'DEX', score: 14, mod: 2, save: false },
      { key: 'CON', score: 14, mod: 2, save: false },
      { key: 'INT', score: 11, mod: 0, save: false },
      { key: 'WIS', score: 18, mod: 4, save: true },
      { key: 'CHA', score: 12, mod: 1, save: true },
    ],
    passives: { perception: 17, investigation: 13, insight: 17 },
    skills: [
      { name: 'Acrobatics', abil: 'DEX', mod: 2, prof: 0 },
      { name: 'Animal Handling', abil: 'WIS', mod: 4, prof: 0 },
      { name: 'Arcana', abil: 'INT', mod: 0, prof: 0 },
      { name: 'Athletics', abil: 'STR', mod: 0, prof: 0 },
      { name: 'Deception', abil: 'CHA', mod: 1, prof: 0 },
      { name: 'History', abil: 'INT', mod: 0, prof: 0 },
      { name: 'Insight', abil: 'WIS', mod: 7, prof: 1 },
      { name: 'Intimidation', abil: 'CHA', mod: 1, prof: 0 },
      { name: 'Investigation', abil: 'INT', mod: 0, prof: 0 },
      { name: 'Medicine', abil: 'WIS', mod: 7, prof: 1 },
      { name: 'Nature', abil: 'INT', mod: 0, prof: 0 },
      { name: 'Perception', abil: 'WIS', mod: 4, prof: 0 },
      { name: 'Performance', abil: 'CHA', mod: 1, prof: 0 },
      { name: 'Persuasion', abil: 'CHA', mod: 4, prof: 1 },
      { name: 'Religion', abil: 'INT', mod: 3, prof: 1 },
      { name: 'Sleight of Hand', abil: 'DEX', mod: 2, prof: 0 },
      { name: 'Stealth', abil: 'DEX', mod: 2, prof: 0 },
      { name: 'Survival', abil: 'WIS', mod: 4, prof: 0 },
    ],
    conditions: ['blessed', 'concentration'],
    equipment: [
      { name: 'Chain mail', qty: 1, wt: 55, equipped: true, linked: true },
      { name: 'Shield', qty: 1, wt: 6, equipped: true, linked: true },
      { name: 'Mace', qty: 1, wt: 4, equipped: true, linked: true },
      { name: 'Holy symbol (amulet)', qty: 1, wt: 1, equipped: true, linked: false },
      { name: 'Healer’s kit', qty: 1, wt: 3, equipped: false, linked: false },
      { name: 'Tidecaller’s charm', qty: 1, wt: 0, equipped: false, linked: true },
    ],
    currency: { cp: 0, sp: 14, ep: 0, gp: 86, pp: 2 },
    carried: 71, carryMax: 150,
    features: [
      { name: 'Radiance of the Dawn', src: 'Light Domain', lvl: 2, note: 'Channel Divinity: dispel magical darkness; 2d10 + level radiant in a 30-ft radius (Con save halves).' },
      { name: 'Warding Flare', src: 'Light Domain', lvl: 1, note: 'Reaction: impose disadvantage on an attack against you. WIS-mod uses per long rest.' },
      { name: 'Destroy Undead (CR 1/2)', src: 'Cleric', lvl: 5, note: 'Turned undead of CR 1/2 or lower are destroyed instead.' },
      { name: 'Fey Ancestry', src: 'Half-elf', lvl: 1, note: 'Advantage vs. charmed; magic can’t put you to sleep.' },
    ],
  },

  // Spell slots (session overlay — restores on long rest). filled = available.
  spellSlots: [
    { lvl: 1, max: 4, used: 1 },
    { lvl: 2, max: 3, used: 2 },
    { lvl: 3, max: 2, used: 0 },
  ],
  classResources: [
    { name: 'Channel Divinity', cur: 0, max: 1, recover: 'short rest', icon: 'sparkle' },
    { name: 'Warding Flare', cur: 2, max: 4, recover: 'long rest', icon: 'reveal' },
    { name: 'Inspiration', cur: 1, max: 1, recover: 'awarded', icon: 'flag' },
  ],
  concentration: { spell: 'Bless', since: 'Round 1', note: '+1d4 to allies’ attacks & saves' },
  deathSaves: { successes: 0, failures: 0 },
  spells: [
    { name: 'Bless', lvl: 1, school: 'Enchantment', time: '1 action', range: '30 ft', dur: 'Conc. 1 min', conc: true, prepared: true, active: true },
    { name: 'Cure Wounds', lvl: 1, school: 'Evocation', time: '1 action', range: 'Touch', dur: 'Instant', conc: false, prepared: true },
    { name: 'Guiding Bolt', lvl: 1, school: 'Evocation', time: '1 action', range: '120 ft', dur: 'Instant', conc: false, prepared: true },
    { name: 'Lesser Restoration', lvl: 2, school: 'Abjuration', time: '1 action', range: 'Touch', dur: 'Instant', conc: false, prepared: true },
    { name: 'Spiritual Weapon', lvl: 2, school: 'Evocation', time: '1 bonus', range: '60 ft', dur: '1 min', conc: false, prepared: true },
    { name: 'Spirit Guardians', lvl: 3, school: 'Conjuration', time: '1 action', range: 'Self (15 ft)', dur: 'Conc. 10 min', conc: true, prepared: true },
    { name: 'Revivify', lvl: 3, school: 'Necromancy', time: '1 action', range: 'Touch', dur: 'Instant', conc: false, prepared: true },
  ],

  // Live party panel — propagated over the session channel.
  party: [
    { id: 'mara', name: 'Mara Quill', cls: 'Cleric 5', cur: 27, max: 38, self: true, conds: ['blessed', 'concentration'], res: 'CD 0/1 · slots 3·1·2' },
    { id: 'bran', name: 'Bran Ironwood', cls: 'Fighter 5', cur: 41, max: 49, conds: [], res: 'Second Wind ✓ · Action Surge ✓' },
    { id: 'lyra', name: 'Lyra Vex', cls: 'Rogue 5', cur: 9, max: 33, conds: ['poisoned'], res: 'Sneak attack 3d6' },
    { id: 'doran', name: 'Doran Pike', cls: 'Druid 4', cur: 0, max: 27, conds: ['unconscious'], res: 'Wild Shape 1/1 · slots 2·0' },
  ],
  marchingOrder: [
    { row: 'Front', members: ['Bran Ironwood', 'Mara Quill'] },
    { row: 'Middle', members: ['Doran Pike'] },
    { row: 'Back', members: ['Lyra Vex'] },
  ],
  partyStash: [
    { name: 'Smuggler’s Ledger', tag: 'quest', wt: 1 },
    { name: 'Pearl of Power', tag: 'magic', wt: 0 },
    { name: 'Salt-crusted key', tag: 'quest', wt: 0 },
    { name: 'Healing potion', tag: 'consumable', qty: 3, wt: 1.5 },
  ],

  // Guided level-up wizard — 5 → 6.
  levelUp: {
    from: 5, to: 6, mode: 'milestone',
    steps: [
      { id: 'hp', label: 'Hit points', done: true, choice: 'Average +5 (8/2+1) +2 CON', detail: 'New max HP 45', kind: 'roll' },
      { id: 'feat', label: 'Channel Divinity', done: true, choice: '2 uses per rest', detail: 'Was 1/rest', kind: 'auto' },
      { id: 'domain', label: 'Light Domain feature', done: false, choice: 'Improved Flare', detail: 'Warding Flare can now protect another creature you can see within 30 ft.', kind: 'feature' },
      { id: 'spells', label: 'Prepared spells', done: false, choice: 'Prepare 9 (WIS mod + level)', detail: 'One more than at level 5', kind: 'choice' },
    ],
  },

  // DM-invisible private space.
  journal: {
    bookmarks: [
      { title: 'The Pier', when: 'Session 7', note: 'Water too still — Doran thinks something’s under it. Don’t trust the lantern.' },
      { title: 'Smuggler’s Ledger', when: 'Session 6', note: 'The 14th, low tide. Pell’s name is on it — leverage?' },
    ],
    impressions: [
      { npc: 'Dockmaster Pell', mood: 'wary', note: 'Owes us a favor but won’t meet our eyes. Hiding something about the shipment.', shared: false },
      { npc: 'Vorlag', mood: 'curious', note: 'Says he was framed. Might flip on the cult if we name the cargo. Mara wants to believe him.', shared: true },
      { npc: 'Mother Sild', mood: 'afraid', note: 'The Bell answers her. We are not ready for that fight.', shared: false },
    ],
    quests: [
      { goal: 'Find who poisoned the temple well in Saltmarsh', status: 'active', note: 'Mara’s reason for leaving the order.' },
      { goal: 'Return the Tidecaller’s charm to its shrine', status: 'active', note: '' },
      { goal: 'Prove Vorlag innocent — or don’t', status: 'active', note: 'Conflicts with Bran’s grudge.' },
      { goal: 'Survive the causeway crossing', status: 'completed', note: '' },
    ],
    highlights: [
      { kind: 'RP moment', text: 'Mara talked the merrow down instead of fighting. The table went quiet.', when: '21:14' },
      { kind: 'Memorable quote', text: '“The light doesn’t ask permission.”', when: '20:48' },
      { kind: 'Tactical success', text: 'Spirit Guardians + the chokepoint = four kills in one round.', when: '20:02' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────
// COMMUNITY & CONTENT ECOSYSTEM  (window.DNDCommunity)  — Initiative 12
// The platform layer: the in-app directory browser, the module export &
// import format, the creator publish workflow, and the public campaign wiki.
// One-click sharing makes every DM's vault richer. Same campaign for continuity.
// ─────────────────────────────────────────────────────────────────
window.DNDCommunity = {
  featured: [
    { id: 'fc1', label: 'Best starter adventures', count: 14 },
    { id: 'fc2', label: 'Atmospheric scene packs', count: 22 },
    { id: 'fc3', label: '5e monster supplements', count: 31 },
  ],
  typeFilters: [
    { id: 'all', label: 'All', count: 1284 },
    { id: 'adventure', label: 'Adventures', count: 412 },
    { id: 'supplement', label: 'Supplements', count: 506 },
    { id: 'world', label: 'Worlds', count: 188 },
    { id: 'toolkit', label: 'Toolkits', count: 178 },
  ],
  modules: [
    { id: 'm-saltmarsh', name: 'Ghosts of the Tidewater', author: 'brinekeeper', type: 'adventure', system: 'dnd5e', levels: '1–5', license: 'CC BY-SA', installs: 8420, rating: 4.8, updated: '3 days ago', tone: 'info', featured: true,
      desc: 'A coastal cult campaign: maps, 40 linked notes, 12 stat blocks, ambience presets. Drops straight into a fresh vault.' },
    { id: 'm-merchant', name: 'Waterdeep Merchant District', author: 'cobble', type: 'world', system: 'dnd5e', levels: 'any', license: 'CC BY', installs: 15300, rating: 4.9, updated: '1 week ago', tone: 'success', featured: true,
      desc: 'A fully-linked city ward: shops, NPCs, rumor tables, and a battle map per street. The reference everyone forks.' },
    { id: 'm-horror', name: 'Tide-Temple Horrors', author: 'wisp', type: 'supplement', system: 'dnd5e', levels: '3–8', license: 'CC BY', installs: 3110, rating: 4.6, updated: '2 weeks ago', tone: 'warning', featured: false,
      desc: '18 aquatic monsters with lair actions and a CR-balanced encounter table for seaside dungeons.' },
    { id: 'm-tables', name: 'Coastal Random Tables', author: 'fenwick', type: 'toolkit', system: 'generic', levels: 'any', license: 'CC BY', installs: 6740, rating: 4.7, updated: '5 days ago', tone: 'neutral', featured: false,
      desc: '60 roll tables — weather, hooks, salvage, dockside rumors. System-agnostic; works with any vault.' },
  ],
  // selected module detail
  detail: {
    id: 'm-saltmarsh',
    contents: [
      { kind: 'Notes', n: 40, icon: 'knowledge-book' },
      { kind: 'Maps', n: 6, icon: 'atlas-map' },
      { kind: 'Stat blocks', n: 12, icon: 'sword' },
      { kind: 'Scenes', n: 5, icon: 'scene' },
      { kind: 'Ambience presets', n: 4, icon: 'audio' },
      { kind: 'Random tables', n: 9, icon: 'dice' },
    ],
    deps: [{ name: 'Tide-Temple Horrors', need: 'optional' }],
    changelog: [
      { v: '2.1.0', when: '3 days ago', note: 'Added the Lower Vaults map + 6 linked secrets notes.' },
      { v: '2.0.0', when: '1 month ago', note: 'Re-cut for the new module format; fixed 11 broken wikilinks.' },
    ],
    reviews: [
      { who: 'mapwright', stars: 5, verified: true, text: 'Imported clean, every link resolved. Ran it Friday with zero prep.' },
      { who: 'saltlick', stars: 4, verified: true, text: 'Great bones. I reskinned the cult but the maps alone are worth it.' },
    ],
  },
  // export module workflow
  export: {
    scope: 'tagged',
    scopes: [{ value: 'vault', label: 'Entire vault' }, { value: 'folder', label: 'Selected folder' }, { value: 'tagged', label: 'Tagged subset' }],
    contentTypes: [
      { id: 'notes', label: 'Notes', n: 40, on: true },
      { id: 'objects', label: 'Objects (stat blocks, items)', n: 21, on: true },
      { id: 'maps', label: 'Maps', n: 6, on: true },
      { id: 'audio', label: 'Audio presets', n: 4, on: true },
      { id: 'templates', label: 'Templates', n: 3, on: false },
    ],
    includePrivate: false,
    validation: [
      { label: 'No broken internal links', status: 'pass' },
      { label: 'All referenced assets present', status: 'pass' },
      { label: '2 audio sources lack license metadata', status: 'warn' },
      { label: 'Thumbnail image set', status: 'pass' },
    ],
    output: 'ghosts-of-the-tidewater-2.1.0.dndmodule',
  },
  // creator publish workflow
  publish: {
    completeness: 86,
    checklist: [
      { label: 'Manifest complete (name, version, system, license)', status: 'pass' },
      { label: 'All declared files present and not corrupt', status: 'pass' },
      { label: 'No broken wikilinks', status: 'pass' },
      { label: 'Thumbnail + level range set', status: 'pass' },
      { label: '2 audio files missing license metadata', status: 'warn' },
      { label: 'Description under 280 chars', status: 'fail' },
    ],
    version: { from: '2.1.0', bump: 'minor', to: '2.2.0' },
    license: 'CC BY-SA',
  },
  // campaign wiki
  wiki: {
    slug: 'brinekeeper.dndtools.app/tidewater',
    access: 'unlisted',
    accessModes: [
      { value: 'public', label: 'Public', note: 'Indexed by search engines' },
      { value: 'unlisted', label: 'Unlisted', note: 'Direct link only, not indexed' },
      { value: 'password', label: 'Password', note: 'Visitors enter a password once' },
    ],
    theme: 'parchment',
    pages: 28, eligible: 28, totalNotes: 41,
    recaps: [
      { n: 7, title: 'The lantern at the pier', when: '2 days ago' },
      { n: 6, title: 'The ledger names a name', when: '2 weeks ago' },
      { n: 5, title: 'Low tide on the causeway', when: '3 weeks ago' },
    ],
  },
};
