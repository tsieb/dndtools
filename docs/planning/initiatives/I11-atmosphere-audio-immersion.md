# Initiative 11 — Atmosphere, Audio & Immersive Scene Management

## Status: NOT STARTED

**Outcome:** DND Tools creates a multi-sensory session experience. The DM can set
the mood with ambient audio, display scene images on a secondary screen or TV,
and trigger atmospheric cues tied to the evolving narrative. The app becomes the
atmospheric backbone of the session, not just a reference tool.

**Why this matters:** Atmosphere is the difference between "we looked it up on the
laptop" and "we were transported." Sound design and visual scene management are
table-standard tools for experienced DMs. Building them into the app — with vault
integration and session automation — creates a uniquely immersive experience no
competing tool offers end-to-end.

---

## Epic 11.1 — Ambient Audio Engine

**Goal:** A full ambient audio system is integrated into the app, playing multi-layer
soundscapes from locally stored files or web audio links, with smooth crossfading
between scenes and intuitive volume control.

**Stories:**

- **S11.1.1 — Audio engine foundation with Web Audio API**
  Implement an `AmbientAudioEngine` in `src/lib/domain/audio-engine.ts` using the
  Web Audio API. Support: loading audio files from the vault assets folder, looping
  audio with seamless loop points, stacked layer mixing (up to 6 simultaneous
  sources), per-layer volume with a master volume override, and crossfade between
  two presets (default 3 seconds, DM-configurable). All audio state is in-memory and
  session-scoped; no audio data is written to the vault.

- **S11.1.2 — Local audio file import and vault asset management**
  Add an audio asset library under `.vault/assets/audio/`. DMs can import audio
  files (MP3, OGG, WAV, M4A up to 50MB each) from the settings audio page or by
  dragging into the app. Imported files show name, duration, size, and a waveform
  thumbnail. Files can be tagged for organization. A free starter pack of 20 Creative
  Commons ambient tracks is bundled with the desktop app (dungeon, wilderness,
  tavern, combat categories).

- **S11.1.3 — Web audio source support (YouTube / SoundCloud links)**
  Allow audio presets to include web URLs as sources via `<iframe>` embed (YouTube,
  SoundCloud). Web sources are secondary to local — they require internet access.
  The UI clearly marks web sources as network-dependent with a connection indicator.
  Web sources are not cached locally (license compliance). The system gracefully
  falls back to local layers if a web source fails to load.

- **S11.1.4 — Audio control panel and quick-access widget**
  Add a compact audio control widget available in the toolbar, as a session board
  tile, and as a floating overlay (`Ctrl+Shift+A`). Controls: play/pause, active
  preset name, master volume slider, and crossfade button to the next preset. The
  full audio panel shows all layers with individual controls. Audio state is reflected
  in the status bar so the DM always knows what's playing.

---

## Epic 11.2 — Scene Cards & Visual Display Mode

**Goal:** DMs can create richly presented scene cards — title, mood image, flavor
text, music association — and display them in a fullscreen "scene display mode"
suitable for a second monitor, tablet, or TV visible to players.

**Stories:**

- **S11.2.1 — Scene card object type**
  Add `scene_card` as a structured object type with fields: title, mood (combat,
  exploration, mystery, social, rest), hero image (linked from vault image objects
  or URL), flavor text (markdown, max 500 chars), audio preset reference, and
  visibility (dm_only / shared / public). Scene cards are created from the command
  palette, the session board, or via MCP `create_scene_card`. Scenes are stored in
  `.vault/objects.json` and searchable.

- **S11.2.2 — Scene display mode (fullscreen / second screen)**
  `Ctrl+Shift+S` enters scene display mode: fullscreen view showing the active
  scene card as a visually rich layout — full-bleed hero image with title and flavor
  text overlaid, color-coded by mood. A "secondary screen" mode opens the scene
  display in a separate `window` (Electron `BrowserWindow` or browser popup)
  designed for a TV or projector. DM controls remain in the primary window.

- **S11.2.3 — Scene queue and transitions**
  DMs can queue multiple scene cards in order. Advancing the queue transitions to
  the next scene with a configurable animation (crossfade, slide, or cut). Each
  transition can trigger the associated audio preset crossfade. The scene queue
  is visible in the session board as an ordered tile list. Keyboard shortcut
  `Ctrl+Right` advances the queue during play.

- **S11.2.4 — Player device scene push**
  In a connected session, activating a scene card pushes the shared scene to all
  player devices. Players see the hero image and flavor text in a banner overlay
  on their DND Tools screen. The banner is dismissible after 5 seconds. Scene
  pushes are logged in the session event timeline. Players can review the session's
  scene history from their player journal.

---

## Epic 11.3 — Audio Preset Library & Custom Scene Builder

**Goal:** The DM has a rich library of curated, categorized audio presets and a
custom scene builder that combines images, audio, and flavor text into reusable
scene packages shareable across vaults and the community.

**Stories:**

- **S11.3.1 — Categorized preset library**
  Ship a built-in preset library with 40+ named presets across categories: Dungeon
  (6 presets: stone corridor, flooded cave, trap room, boss chamber, safe room,
  undead crypt), Wilderness (6: dense forest, open plains, thunderstorm, mountain
  pass, haunted wood, sunlit meadow), Urban (6: bustling market, dark alley, tavern,
  throne room, harbor, slums), Combat (4: battle, pursuit, ambush, final stand),
  Social (4: formal court, interrogation, celebration, funeral), and Mystical
  (4: arcane lab, divine temple, void, dreamscape). Presets are non-deletable system
  objects but fully customizable via copy.

- **S11.3.2 — Custom preset creation and editing**
  The preset editor shows: preset name, category, and a multi-layer audio mixer.
  Each layer has: audio source (vault file or web URL), loop enabled, volume (0–100),
  and a start offset (for variation). Save creates a vault audio-preset object.
  Test playback is available inline in the editor. Custom presets appear in the
  preset library alongside built-ins.

- **S11.3.3 — Scene package bundling**
  A "Scene Package" bundles a scene card + audio preset + optional lighting color
  suggestion into a single named package stored as a vault object. Scene packages
  are the primary activation unit: one click plays the audio, displays the scene
  card, and pushes to players. Packages can be assigned to map POIs — arriving at
  a location auto-activates its scene package.

- **S11.3.4 — Scene package export and sharing**
  Scene packages are exportable as `.dndscene` bundles (ZIP containing metadata
  JSON + bundled local audio files). Packages can be imported into any vault.
  Packages without local audio (using only web sources) are shareable as small
  JSON files. Community scene packages are a planned content category in the
  Community Content Ecosystem (I12).

---

## Epic 11.4 — Atmosphere Automation & Trigger System

**Goal:** Atmospheric changes happen automatically in response to session events —
combat start triggers combat music, entering a location triggers its scene package,
dice rolls trigger sound effects — without the DM manually switching presets.

**Stories:**

- **S11.4.1 — Event-driven atmosphere triggers**
  Define a trigger system: `on(event, action)`. Events: `combat.start`,
  `combat.end`, `note.open(noteId)`, `map.poi.enter(poiId)`,
  `session.board.tile.activate(tileId)`. Actions: `audio.play(presetId)`,
  `audio.crossfade(presetId, durationMs)`, `scene.activate(packageId)`.
  Triggers are configured per-vault in `.vault/settings.json` under `atmosphereTriggers`.
  Triggers can be disabled globally from the audio widget.

- **S11.4.2 — Combat music automation**
  When the combat tracker (I4.2) is activated (first initiative is rolled), if a
  combat preset is configured for the current location, automatically crossfade from
  the current ambient to the combat preset. When combat ends (all enemies defeated
  or tracker cleared), crossfade back to the ambient preset. The DM can override
  the automatic transition at any time from the audio widget.

- **S11.4.3 — Sound effect triggers for dice and events**
  Define a sound effects layer (separate from ambient): short one-shot clips for
  specific events. Configurable events: natural 20 (triumph fanfare), natural 1
  (failure sting), death save failure, spell cast (by school), critical hit. Sound
  effects are played from a dedicated SFX channel independent of the ambient mix.
  The DM can enable/disable SFX globally or per event type from Settings → Audio.

- **S11.4.4 — MCP atmosphere control tools**
  Add MCP tools: `set_active_scene(packageId)`, `play_audio_preset(presetId)`,
  `get_available_scenes()`. These allow AI agents to suggest and activate atmosphere
  changes as part of session prep bundles. For example, a session prep bundle for a
  dungeon crawl might include `suggestedScenePackageId` in its response. The DM
  reviews and activates via a one-click button in the bundle response UI.

---

---
