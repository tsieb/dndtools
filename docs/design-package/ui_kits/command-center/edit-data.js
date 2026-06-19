// Edit-mode model. A scene is a canvas of positioned widgets. Two governing facts drive the whole
// edit experience:
//   • tier 'core'  — system widgets (party vitals, player views). Move/resize/visibility only;
//                    their CONTENT is managed by the app, so the inspector is deliberately thin.
//   • tier 'tool' / 'custom' — dice roller, timer, notes, etc. Fully customizable: title, type
//                    settings, appearance, visibility.
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
