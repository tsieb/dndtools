// nav.js — the single navigation source of truth for the Command Center kit.
//
// The kit is a set of separate HTML pages (each its own @dsCard). This module is what binds
// them into one connected app: every section, creator, and management surface maps to a real
// URL here, so cross-links resolve the same way from any page. Plain global — load it after
// data.js and before the app scripts on EVERY page.
(function () {
  // ---- Route id → URL ---------------------------------------------------------------------
  // The four screens that live INSIDE index.html (home/session/knowledge/atlas) deep-link via a
  // hash, so arriving from another page opens the right screen.
  var ROUTES = {
    home:        'index.html',
    session:     'index.html#session',
    knowledge:   'index.html#knowledge',
    atlas:       'index.html#atlas',
    // durable global sections (own pages)
    characters:  'characters.html',
    campaign:    'campaign.html',
    settings:    'settings.html',
    // character detail
    'character-sheet':        'character-sheet.html',
    'character-sheet-mobile': 'character-sheet-mobile.html',
    // create / authoring tools
    scene:       'scene-creator.html',
    character:   'character-creator.html',
    map:         'map-builder.html',
    widget:      'widget-builder.html',
    note:        'note-editor.html',
    edit:        'edit-mode.html',
    // management surfaces
    players:     'manage-players.html',
    permissions: 'manage-permissions.html',
    vault:       'manage-vault.html',
    // newly-designed gap surfaces
    graph:        'graph-search.html',
    search:       'command-palette.html',
    ai:           'ai-tools.html',
    audio:        'audio.html',
    onboarding:   'onboarding.html',
    'session-live': 'session-live.html',
    'content-import': 'content-import.html',
    collab:       'collab-presence.html',
    'sync-conflict': 'sync-conflict.html',
    profiles:     'nav-profiles.html',
    a11y:         'accessibility.html',
    extensions:   'extensibility.html',
    player:       'player.html',
    community:    'community.html',
  };

  // ---- The seven-section IA, in order -----------------------------------------------------
  // Rendered as the sidebar's "Sections" nav on every page so the destinations are always
  // visible and the current one is highlighted.
  var SECTIONS = [
    { id: 'home',       label: 'Command Center', icon: 'home' },
    { id: 'session',    label: 'Session',        icon: 'session-bolt' },
    { id: 'characters', label: 'Characters',     icon: 'characters-person' },
    { id: 'atlas',      label: 'Atlas',          icon: 'atlas-map' },
    { id: 'campaign',   label: 'Campaign',        icon: 'campaign-scroll' },
    { id: 'knowledge',  label: 'Knowledge',      icon: 'knowledge-book' },
  ];

  // ---- Focused (PageShell) surfaces: a clickable breadcrumb trail for context -------------
  // Each crumb is [label] (current page, not a link) or [label, routeId] (a link). The trail's
  // second-to-last crumb is also the "back" target.
  var PAGE_META = {
    'scene-creator.html':      { trail: [['Command Center', 'home'], ['Create', 'home'], ['New scene']] },
    'character-creator.html':  { trail: [['Command Center', 'home'], ['Characters', 'characters'], ['New character']] },
    'map-builder.html':        { trail: [['Command Center', 'home'], ['Atlas', 'atlas'], ['Map builder']] },
    'widget-builder.html':     { trail: [['Command Center', 'home'], ['Create', 'home'], ['Widget builder']] },
    'note-editor.html':        { trail: [['Command Center', 'home'], ['Knowledge', 'knowledge'], ['Note editor']] },
    'edit-mode.html':          { trail: [['Command Center', 'home'], ['Session', 'session'], ['Edit layout']] },
    'manage-players.html':     { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['Players']] },
    'manage-permissions.html': { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['Permissions']] },
    'manage-vault.html':       { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['Vault connections']] },
    'graph-search.html':       { trail: [['Command Center', 'home'], ['Knowledge', 'knowledge'], ['Relationship graph']] },
    'command-palette.html':    { trail: [['Command Center', 'home'], ['Search']] },
    'ai-tools.html':           { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['AI & Tools']] },
    'audio.html':              { trail: [['Command Center', 'home'], ['Session', 'session'], ['Audio & atmosphere']] },
    'onboarding.html':         { trail: [['Welcome']] },
    'session-live.html':       { trail: [['Command Center', 'home'], ['Session', 'session'], ['Live session']] },
    'content-import.html':     { trail: [['Command Center', 'home'], ['Knowledge', 'knowledge'], ['Import']] },
    'collab-presence.html':    { trail: [['Command Center', 'home'], ['Knowledge', 'knowledge'], ['Co-editing']] },
    'sync-conflict.html':      { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['Sync & conflicts']] },
    'nav-profiles.html':       { trail: [['Command Center', 'home'], ['Navigation profiles']] },
    'accessibility.html':      { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['Accessibility']] },
    'extensibility.html':      { trail: [['Command Center', 'home'], ['Settings', 'settings'], ['Extensions & systems']] },
    'player.html':             { trail: [['Command Center', 'home'], ['Characters', 'characters'], ['Player mode']] },
    'community.html':          { trail: [['Command Center', 'home'], ['Community']] },
  };

  function basename() {
    var parts = location.pathname.split('/');
    return parts[parts.length - 1] || 'index.html';
  }

  function navigate(id) {
    if (!id) return;
    window.location.href = ROUTES[id] || id;
  }

  function meta() {
    return PAGE_META[basename()] || null;
  }

  function back() {
    var m = meta();
    var up = m && m.trail.length > 1 ? m.trail[m.trail.length - 2][1] : 'home';
    navigate(up || 'home');
  }

  window.DNDNavigate = navigate;
  window.DNDBack = back;
  window.DNDPageMeta = meta;
  window.DNDSections = SECTIONS;
  window.DNDRoutes = ROUTES;
})();
