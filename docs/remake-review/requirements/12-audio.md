## AUDIO - Audio and Atmosphere

Capability tree:

- Scene/map audio association: `AUDIO-001`
- Playback and session state: `AUDIO-002`, `AUDIO-003`
- Assets, licensing, and source scope: `AUDIO-004`, `AUDIO-009`, `AUDIO-010`, `AUDIO-011`
- Automation: `AUDIO-005`
- Platform and player degradation: `AUDIO-006`, `AUDIO-007`, `AUDIO-008`, `AUDIO-012`, `AUDIO-013`

### AUDIO-001
**Statement:** The DM shall be able to associate ambient audio, playlists, and atmosphere presets with a Scene, map, or map layer.
**Source:** Vision "Audio & Atmosphere"; Feature Inventory I11.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a Scene has an audio preset, when the DM activates the Scene, then the preset is available to the audio widget.
- Given an audio asset is missing on a device, when playback is requested, then the UI shows a missing asset state.

### AUDIO-002
**Statement:** The DM shall be able to control playback through an audio widget on the Command Center, including play, pause, stop, volume, crossfade, and active track display.
**Source:** Vision Command Center; Feature Inventory I11.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a local audio track is available, when the DM presses play, then session audio state records the active track.
- Given browser autoplay policy blocks playback, when a player device receives audio state, then it shows a user-action-required degraded state.
- Given a player locally mutes or lowers volume, when the DM changes session audio state, then the player preference remains device-local and does not mutate authoritative session audio.

### AUDIO-003
**Statement:** The system shall persist currently playing audio state in Session State and sync it to collaborators as session state, not widget-private state.
**Source:** Vision Audio state; Architecture Contract 4 Widget State Ownership.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given audio is playing during a session, when a second DM device reconnects, then it receives active audio state.
- Given a widget is removed from a Scene, when audio is session-owned, then removing the widget does not delete session audio state without a stop command.
- Given remote participants are unavailable, when the DM changes local audio state, then the state is queued or marked undelivered without blocking local playback.

### AUDIO-004
**Statement:** The DM shall be able to import and manage local audio assets with metadata, licensing notes, tags, and source references.
**Source:** Feature Inventory I11 licensing concern; Content asset model.
**Priority:** Nice-to-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an audio file is imported, when metadata is saved, then tags, license note, source, and asset hash are recorded.
- Given licensing metadata is missing, when the DM prepares export, then the asset is flagged for review.

### AUDIO-005
**Statement:** The DM shall be able to configure atmosphere automation triggers from session events such as combat start, map reveal, Scene activation, or handout delivery.
**Source:** Feature Inventory I11 atmosphere automation; Architecture Contract 4 automation.
**Priority:** Nice-to-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a combat-start trigger is configured, when combat starts, then the automation requests the declared audio command.
- Given the command fails permission or asset validation, when triggered, then no hidden bypass occurs and a diagnostic is recorded.

### AUDIO-006
**Statement:** Audio features shall degrade gracefully on platforms that lack audio permissions, background playback, output routing, or required local assets.
**Source:** Feature Inventory I11 concerns; Architecture Contract 1 Platform Profiles.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a mobile browser blocks background playback, when audio sync state changes, then the app shows a degraded status rather than retrying indefinitely.
- Given a participant cannot play an audio asset, when the DM inspects session status, then the participant's audio delivery state is visible without exposing device secrets.

### AUDIO-007
**Statement:** Any release that enables audio shall allow participants to control device-local audio consent, mute, output, and volume preferences without changing DM-authored session audio state.
**Source:** Vision Audio & Atmosphere; platform degradation audit.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a participant declines audio playback, when the DM starts a track, then the participant device remains silent and reports consent-blocked status.
- Given a participant changes local volume, when sync state is inspected, then authoritative session volume is unchanged.
**Notes:** Release-blocking only for releases that enable audio.

### AUDIO-008
**Statement:** Any release that enables audio shall make audio visualizers, transitions, and state announcements respect reduced motion, live announcement, and non-color accessibility requirements.
**Source:** Accessibility requirements; UX reduced-motion guidelines.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given reduced motion is active, when audio crossfade or visualizer effects would animate, then the effects are reduced or disabled according to the resolved motion state.
- Given playback state changes, when announced to assistive technology, then announcements are concise and not repeated for high-frequency progress updates.
**Notes:** Release-blocking only for releases that enable audio.

### AUDIO-009
**Statement:** The DM shall be able to configure only declared audio source types, with unsupported providers blocked before playback or package import.
**Source:** Feature Inventory I11 audio sources; Open Gaps; platform degradation audit.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an audio source is configured, when release review runs, then it is classified as local file, bundled preset, web stream, or unsupported with licensing and cache behavior recorded.
- Given an unsupported audio provider is selected, when configuration is saved, then the source is rejected with an unsupported-source diagnostic and no playback state is created.

### AUDIO-010
**Statement:** Audio cache and offline behavior shall be declared per source type before audio playback is enabled for that source.
**Source:** Feature Inventory I11 audio sources; Open Gaps; local-first requirements.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a local file source is configured, when the app is offline, then playback uses local asset availability and reports missing assets without network retry loops.
- Given a web stream source is configured, when the app is offline, then the source reports unavailable unless an explicitly cached asset exists.
- Given an audio cache is evicted, when playback is requested, then the app reports missing cached audio and preserves session state without substituting another track.

### AUDIO-011
**Statement:** The DM shall be able to import and export Scene audio package references only when required assets, licensing metadata, and unsupported stream behavior are validated before commit.
**Source:** Feature Inventory I11 scene packages; Open Gaps.
**Priority:** Nice-to-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a Scene package includes audio presets, when imported or exported, then missing assets, licensing metadata, unsupported streams, and device-local output routes are reported before commit.
- Given a package export includes local audio assets, when validation runs, then each included asset has source, license metadata, content hash, and portability status.

### AUDIO-012
**Statement:** Audio output routing shall use platform-declared capabilities and fall back to default output or unavailable-routing status when routing is unsupported.
**Source:** Feature Inventory I11 browser/device routing concerns; Architecture Contract 1 Platform Profiles.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given output routing is unsupported on a platform, when playback starts, then the app uses default output or reports unavailable routing without failing session audio state.
- Given a participant changes device-local output routing where supported, when session audio state syncs, then the route choice remains device-local and does not mutate DM-authored playback state.

### AUDIO-013
**Statement:** Audio playback shall enforce performance-safe failure modes so repeated failures or excessive resource use degrade audio without blocking other session commands.
**Source:** Feature Inventory I11 performance concerns; Performance requirements.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given playback repeatedly fails or consumes excessive resources, when safety limits trigger, then the track is stopped or degraded and the DM sees diagnostics without blocking other session commands.
- Given audio is degraded by safety limits, when the DM advances combat, rolls dice, or projects a handout, then those session commands remain within their configured responsiveness budgets.
