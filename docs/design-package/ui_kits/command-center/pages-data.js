// Data for the authoring & management pages, using the real product's vocabulary (mapped from the
// gm/ codebase: source adapters & sync states, capability-set grants, player roles/groups, map
// layer categories, widget catalogue, scene templates).
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
