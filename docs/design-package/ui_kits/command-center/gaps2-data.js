// gaps2-data.js — vocabulary for the surfaces that had no design yet (the design-coverage gaps):
// Discovery (graph + search + ⌘K), AI & MCP tools, Audio & atmosphere, Onboarding & learnability,
// Session lifecycle, Content import / sources, Sync conflict, Collaboration presence, and the
// nav-profile / accessibility specimens. Same invented campaign ("The Sunken Outpost") so every
// cross-link resolves. Plain global, mirrors data.js / pages-data.js / gaps-data.js.
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
