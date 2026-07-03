// ============================================================================================
// scene-data.js — the unified Scene / Widget model for the canvas prototype.
//
// ONE primitive: a Scene is a canvas of Widgets. The Command Center is simply a *pinned,
// system-seeded* Scene — same model, two differences only:
//   1) it is seeded with system widgets (content locked; still movable + restyleable), and
//   2) its overflow POLICY is "bounded" (fits to screen / scrolls — no pan-zoom) for glanceable,
//      keyboard-first access. Custom scenes use the "canvas" policy (free pan + zoom).
//
// Widget TIERS describe how editable a widget is:
//   system   — provided by the app; content is system-managed (locked). You may move, resize,
//              restyle, and scope it — not rewrite what it shows.
//   template — provided, fully configurable presets (note, clock, dice…).
//   custom   — you built it (code / visuals / data). Fully editable.
//   ai       — generated for you from a prompt. Fully editable once placed.
// ============================================================================================

window.SCN = {
  // ── Widget type registry: render body + default geometry + which tier ───────────────────
  types: {
    // system (Command Center base widgets)
    resume:     { label: 'Resume session',  icon: 'play',           tier: 'system',   cat: 'System',       w: 540, h: 152, defaults: { accent: true } },
    scenes:     { label: 'Your scenes',      icon: 'scene',          tier: 'system',   cat: 'System',       w: 540, h: 264, defaults: {} },
    create:     { label: 'Create',           icon: 'add',            tier: 'system',   cat: 'System',       w: 296, h: 208, defaults: {} },
    library:    { label: 'Library',          icon: 'knowledge-book', tier: 'system',   cat: 'System',       w: 296, h: 236, defaults: {} },
    quicklinks: { label: 'Quick access',     icon: 'pin',            tier: 'system',   cat: 'System',       w: 296, h: 236, defaults: {} },

    // template (provided, configurable)
    note:       { label: 'Note',             icon: 'note-edit',      tier: 'template', cat: 'Provided',     w: 280, h: 200, defaults: { text: 'A note. Double-click in the inspector to edit.', size: 'md', accent: false } },
    clock:      { label: 'Progress clock',   icon: 'recent',         tier: 'template', cat: 'Provided',     w: 240, h: 200, defaults: { label: 'Countdown', filled: 3, segments: 6, accent: false } },
    tracker:    { label: 'Status bars',      icon: 'Activity',       tier: 'template', cat: 'Provided',     w: 280, h: 214, defaults: { bars: [['Hull integrity', 70], ['Alarm', 30]], accent: false } },
    dice:       { label: 'Dice roller',      icon: 'dice',           tier: 'template', cat: 'Provided',     w: 260, h: 196, defaults: { presets: ['1d20', '2d6+3'], accent: false } },
    initiative: { label: 'Initiative',       icon: 'session-bolt',   tier: 'template', cat: 'Provided',     w: 320, h: 268, defaults: { accent: true } },

    // custom (user-built)
    randomtable:{ label: 'Random table',     icon: 'Dices',          tier: 'custom',   cat: 'Your widgets', w: 280, h: 232, defaults: { title: 'Drowned omens', rows: ['A bell tolls underwater', 'The tide runs backward', 'Salt blooms on the walls', 'A drowned face surfaces, then sinks'], accent: false } },
    loot:       { label: 'Loot split',       icon: 'Coins',          tier: 'custom',   cat: 'Your widgets', w: 260, h: 188, defaults: { gold: 1240, party: 4, accent: false } },
    factions:   { label: 'Faction standing', icon: 'campaign-scroll',tier: 'custom',   cat: 'Your widgets', w: 300, h: 244, defaults: { rows: [['Brine Hand', -3], ['Saltmarsh Watch', 1], ['Dockworkers', 2]], accent: false } },
    image:      { label: 'Handout / image',  icon: 'map',            tier: 'custom',   cat: 'Your widgets', w: 320, h: 240, defaults: { caption: 'Drop an image', accent: false } },

    // ai (generated)
    ai:         { label: 'AI widget',        icon: 'sparkle',        tier: 'ai',       cat: 'Generated',    w: 280, h: 216, defaults: { spec: null, accent: true } },
    // custom (authored in the Widget Builder — not shown in the palette)
    custom:     { label: 'Custom widget',    icon: 'Code2',          tier: 'custom',   cat: null,           w: 280, h: 216, defaults: { spec: null, accent: false } },
  },

  // ── Scenes. Command Center is first and pinned; the rest are ordinary scenes. ───────────
  scenes: [
    {
      id: 'home', name: 'Command Center', pinned: true, system: true, policy: 'bounded',
      sub: 'Home · fits to screen', icon: 'home',
      widgets: [
        { id: 'h1', type: 'resume',     title: 'Resume session',  tier: 'system',   vis: 'dm',      x: 40,  y: 40,  w: 540, h: 152, props: { accent: true } },
        { id: 'h2', type: 'scenes',     title: 'Your scenes',     tier: 'system',   vis: 'dm',      x: 40,  y: 220, w: 540, h: 264, props: {} },
        { id: 'h3', type: 'create',     title: 'Create',          tier: 'system',   vis: 'dm',      x: 612, y: 40,  w: 296, h: 208, props: {} },
        { id: 'h4', type: 'quicklinks', title: 'Quick access',    tier: 'system',   vis: 'dm',      x: 612, y: 276, w: 296, h: 208, props: {} },
        // user-added widgets living right on the home scene:
        { id: 'h5', type: 'clock',      title: 'Next session',    tier: 'template', vis: 'dm',      x: 940, y: 40,  w: 240, h: 200, props: { label: 'Days until', filled: 4, segments: 7, accent: false } },
        { id: 'h6', type: 'note',       title: 'Table reminders', tier: 'custom',   vis: 'dm',      x: 940, y: 264, w: 240, h: 220, props: { text: 'Devin out on the 14th · order pizza · recap last 3 min before combat.', size: 'sm', accent: false } },
      ],
    },
    {
      id: 'lore', name: 'Brine Hand — lore board', policy: 'canvas',
      sub: 'Canvas · pan & zoom', icon: 'campaign-scroll',
      widgets: [
        { id: 'l1', type: 'note',        title: 'The cult',         tier: 'template', vis: 'dm',      x: 80,   y: 80,   w: 320, h: 240, props: { text: 'The Brine Hand worship something drowned beneath the outpost. Mother Sild rings the Tidecaller\u2019s bell to wake the vaults.', size: 'md', accent: true } },
        { id: 'l2', type: 'randomtable', title: 'Drowned omens',    tier: 'custom',   vis: 'dm',      x: 460,  y: 90,   w: 300, h: 240, props: { title: 'Drowned omens', rows: ['A bell tolls underwater', 'The tide runs backward', 'Salt blooms on the walls', 'A drowned face surfaces'], accent: false } },
        { id: 'l3', type: 'factions',    title: 'Standing',         tier: 'custom',   vis: 'dm',      x: 840,  y: 70,   w: 300, h: 244, props: { rows: [['Brine Hand', -3], ['Saltmarsh Watch', 1], ['Dockworkers', 2]], accent: false } },
        { id: 'l4', type: 'image',       title: 'The outpost',      tier: 'custom',   vis: 'players', x: 120,  y: 400,  w: 360, h: 260, props: { caption: 'Map sketch — half-drowned watchtower' } },
        { id: 'l5', type: 'note',        title: 'Read-aloud',       tier: 'template', vis: 'players', x: 540,  y: 410,  w: 320, h: 200, props: { text: 'Brackish water laps the rotting pier. A lantern gutters at the far end \u2014 and the water between is too still.', size: 'md', accent: false } },
        { id: 'l6', type: 'ai',          title: 'Tide clock',       tier: 'ai',       vis: 'dm',      x: 980,  y: 420,  w: 280, h: 216, props: { accent: true, spec: { kind: 'clock', label: 'Low tide in', filled: 2, segments: 6, note: 'Generated from \u201ca clock counting down to low tide\u201d' } } },
      ],
    },
    {
      id: 'pier', name: 'The Pier — live', policy: 'canvas',
      sub: 'Canvas · pan & zoom', icon: 'session-bolt',
      widgets: [
        { id: 'p1', type: 'initiative', title: 'Combat — round 2', tier: 'template', vis: 'dm',      x: 80,  y: 80,  w: 360, h: 280, props: { accent: true } },
        { id: 'p2', type: 'dice',       title: 'Dice',             tier: 'template', vis: 'players', x: 480, y: 80,  w: 280, h: 200, props: { presets: ['1d20', '2d6+3', '1d8+2'], accent: false } },
        { id: 'p3', type: 'tracker',    title: 'Flood timer',      tier: 'template', vis: 'dm',      x: 480, y: 312, w: 280, h: 200, props: { bars: [['Water level', 55], ['Rounds left', 60]], accent: false } },
        { id: 'p4', type: 'image',      title: 'Battle map',       tier: 'custom',   vis: 'players', x: 800, y: 80,  w: 380, h: 300, props: { caption: 'The Pier — projecting to players' } },
      ],
    },
  ],

  // ── New-scene templates: a fresh scene = pick a starting kit of widgets ─────────────────
  sceneTemplates: [
    { id: 'blank',   name: 'Blank canvas',    icon: 'scene',           desc: 'An empty pan & zoom canvas.', policy: 'canvas', seed: [] },
    { id: 'prep',    name: 'Session prep',     icon: 'note-edit',       desc: 'Notes, a random table and a clock to plan the next session.', policy: 'canvas',
      seed: [['note', 0, 0], ['randomtable', 320, 0], ['clock', 640, 0]] },
    { id: 'world',   name: 'Worldbuilding',    icon: 'campaign-scroll', desc: 'Lore notes, factions and a handout board.', policy: 'canvas',
      seed: [['note', 0, 0], ['factions', 340, 0], ['image', 0, 240]] },
    { id: 'combat',  name: 'Live encounter',   icon: 'session-bolt',    desc: 'Initiative, dice and a status tracker for running a fight.', policy: 'canvas',
      seed: [['initiative', 0, 0], ['dice', 380, 0], ['tracker', 380, 220]] },
    { id: 'party',   name: 'Party management',  icon: 'new-character',  desc: 'Track loot, standings and shared notes.', policy: 'canvas',
      seed: [['loot', 0, 0], ['factions', 300, 0], ['note', 620, 0]] },
  ],

  // ── AI generation: canned prompt → widget spec (the "generate a widget" flow) ───────────
  aiExamples: [
    'a clock counting down to low tide',
    'track each player\u2019s inspiration',
    'a loot tracker that splits gold across the party',
    'a random table of dockside rumors',
  ],
  aiGenerate: function (prompt) {
    const p = (prompt || '').toLowerCase();
    if (p.includes('tide') || p.includes('clock') || p.includes('countdown'))
      return { title: 'Tide clock', spec: { kind: 'clock', label: 'Low tide in', filled: 2, segments: 6, note: 'AI built a 6-segment clock and bound it to the session timer.' }, w: 280, h: 216 };
    if (p.includes('inspiration') || p.includes('tally') || p.includes('track each'))
      return { title: 'Inspiration', spec: { kind: 'tally', items: [['Mara', 1], ['Bran', 0], ['Lyra', 2], ['Toral', 0]], note: 'AI read your party roster and made a per-player tally.' }, w: 280, h: 224 };
    if (p.includes('loot') || p.includes('gold') || p.includes('split'))
      return { title: 'Loot split', spec: { kind: 'loot', gold: 1240, party: 4, note: 'AI bound this to party gold from the campaign economy.' }, w: 280, h: 200 };
    if (p.includes('table') || p.includes('rumor') || p.includes('random'))
      return { title: 'Dockside rumors', spec: { kind: 'table', rows: ['The harbormaster takes cult coin', 'A ship sailed out crewless', 'Nets keep coming up empty', 'Someone is buying every lantern in town'], note: 'AI generated a 4-entry rollable table.' }, w: 300, h: 232 };
    return { title: 'New widget', spec: { kind: 'note', text: 'AI drafted a widget from your prompt. Open the inspector to refine, or switch to Code.', note: 'Generated.' }, w: 280, h: 200 };
  },
};
