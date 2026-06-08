# UX Requirements — Audio & Atmosphere

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md` first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `AUDIO-001..013`
> **Owner surface(s):** Audio Controls widget (Command Center), Scene audio panel, soundboard panel, track library drawer, audio status cell (session status strip)

---

## 1. Scope

- **Covers:** The Audio Controls widget that lives on the Command Center canvas as a first-class panel; the now-playing transport (play/pause/stop/volume/crossfade); per-Scene and per-map ambient audio association and atmosphere presets; the soundboard pad grid for one-shot SFX; the channel mixer (ambience bed, music, SFX with per-channel volume); playlists and the track library drawer; the audio-as-session-state sync model and the "what players hear vs. DM monitor" indicator; autoplay policy handling and graceful degradation; and all mobile/desktop behavioral differences for background audio.
- **Does NOT cover:** The visual design tokens, spacing scale, or icon set — those are owned by `01-visual-design-system.md`. Global navigation affordances — owned by `02-navigation-and-platform-profiles.md`. The session status strip's Audio cell is specified in full here but its strip container is owned by `05-command-center.md`. The underlying session-state sync protocol — owned by the functional requirement `../requirements/06-sync.md`; the collaboration permission model — owned by `11-collaboration-permissions.md` (when written). The Session widget placement/resize mechanics — owned by `04-canvas-scene-widgets.md`.
- **Related functional requirements:** `../requirements/12-audio.md`
  - `AUDIO-001` — Scene/map audio association and atmosphere presets
  - `AUDIO-002` — DM playback control widget: play, pause, stop, volume, crossfade, now-playing display
  - `AUDIO-003` — Audio state persisted in Session State; synced to collaborators
  - `AUDIO-004` — Local audio asset import with metadata and licensing
  - `AUDIO-005` — Atmosphere automation triggers from session events
  - `AUDIO-006` — Graceful platform degradation (no audio permission, no background playback)
  - `AUDIO-007` — Device-local consent, mute, and volume without mutating session audio state
  - `AUDIO-008` — Reduced-motion, live-announcement, and non-color accessibility requirements
  - `AUDIO-009` — Declared audio source types only; unsupported providers blocked before playback
  - `AUDIO-010` — Audio cache and offline behavior declared per source type
  - `AUDIO-011` — Scene audio package import/export with validation
  - `AUDIO-012` — Output routing with fallback to default
  - `AUDIO-013` — Performance-safe failure modes; audio degradation must not block session commands
- **Related UX docs:**
  - `01-visual-design-system.md` — design tokens, motion system, `prefers-reduced-motion` contract
  - `02-navigation-and-platform-profiles.md` — platform profiles (Desktop/Tablet/Mobile), global nav patterns
  - `03-accessibility.md` — global a11y baseline, WCAG 2.2 AA floor, live-region policy
  - `04-canvas-scene-widgets.md` — widget placement, resize, and chrome mechanics
  - `05-command-center.md` — Command Center layout, session status strip, Audio cell

---

## 2. UX goals for this surface

Audio is a **live atmosphere tool during play**, not a media player bolted onto a VTT. The DM is managing conversation, rules, and improvisation simultaneously — audio controls must be instantly readable, operable in one or two actions without interrupting the mental flow of the game, and never capable of surprising anyone with sudden loud audio. Players receive synced atmosphere; they cannot disrupt DM-authored state but can protect their own ears.

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | The audio widget should feel like a premium studio transport — purposeful, compact, and atmospheric — without being a recreation of a DAW. Channel strip metaphor using vertical sliders with clear labels; the soundboard pad grid feels tactile and immediately understandable as "press a button, hear a sound." Visual hierarchy supports the genre without obscuring function. |
| Information scent | At a glance: what is playing, on which channel, at what volume, and whether it is reaching players. Labels use DM mental-model language ("Ambience", "Music", "SFX", "Players hear:"). The now-playing card is the dominant element so it can be read peripherally. |
| Navigability | The Audio widget is reachable from the session status strip Audio cell (one click/tap from anywhere on the Command Center) and from global nav. The soundboard and track library are one layer down. No audio control requires more than three taps from the Command Center. |
| Intuition / learnability | A DM who has never used the audio system sees: a now-playing area with transport buttons, three volume sliders, and a soundboard grid. Empty states teach by example (placeholder "No track loaded", "Add a sound" pads). Channel concepts are labelled plainly, not with DAW jargon. |
| Accessibility | Audio must never be the sole channel of information. Every state that plays a sound has a visible label or indicator. Playback state changes are announced to assistive technology via live regions. All controls meet WCAG 2.2 AA contrast; all touch targets ≥44×44 CSS px; no interaction requires sustained holding or multi-point gestures without a discrete alternative. |
| Adaptability (platform profiles) | Desktop: full multi-channel mixer panel always visible alongside soundboard and library. Tablet: tabbed compact widget (Transport | Soundboard | Library); landscape can split two tabs. Mobile: slim bottom-drawer with transport + volume; soundboard in a full-screen sheet; library in a separate sheet. Same Processing Core command on all profiles. |
| Effective emphasis (visual hierarchy) | Now-playing card is the largest element. Transport buttons (play/pause/stop) are the primary affordance. Channel sliders are secondary. Soundboard pads are the SFX-specific path, visually distinct. Master volume is the highest-priority control for player safety and occupies a persistently visible position. |
| Feedback & responsiveness | Acknowledgment of any transport button within 100 ms (visual state change). Autoplay-blocked state surfaces immediately with a user-action prompt — not silent failure. Player delivery status shows within 500 ms of a sync event. |
| Error prevention & recovery | No audio should play at surprise volume. Default volumes are conservative (see UX-AUDIO-002). Missing asset state is clear and non-blocking. Autoplay-blocked state is explained with a recovery action, not a cryptic silence. |
| Consistency | Channel strip anatomy, pad grid sizing, and transport button shapes follow the shared component anatomy from `01-visual-design-system.md`. The audio widget uses the same widget chrome as all other Command Center widgets (from `04-canvas-scene-widgets.md`). |

---

## 3. Researched best practices

**3.1 Transport controls — universal visual conventions**

The play/pause/stop/skip transport pattern is a de-facto universal convention established by cassette/CD hardware and inherited by every digital media player. Nielsen Norman Group's icon usability research confirms that these symbols (▶ ⏸ ⏹) achieve the highest recognition rates of any UI iconography — above 95% without labels, across cultures and age groups [1]. Spotify's desktop transport bar retains explicit labels ("Now Playing") alongside icons, reducing scanning time by ~30% [2]. Apple Music's compact transport uses a single Play/Pause toggle at the largest target size (≥36 px icon within a ≥44 px button), reserving stop for a distinct secondary position [3]. *Implication: The Audio widget transport must use standard ▶ ⏸ ⏹ icons at ≥44 px targets; a combined Play/Pause toggle is the primary affordance; Stop is secondary but always visible.*

**3.2 Mixer channel strips — OBS Audio Mixer and DAW conventions**

OBS Studio's Audio Mixer uses vertical channel strips: each strip has a VU meter, a vertical volume fader, a mute toggle, and a channel label [4]. This layout is copied from physical audio consoles (Behringer X32, Allen & Heath) because it supports fast glanceability — all channels are visible simultaneously and volume is read as physical height. Ableton Live labels channels by role, not by index number, enabling non-engineers to immediately identify which channel does what [5]. *Implication: The three audio channels (Ambience, Music, SFX) should each have a vertical slider, a mute toggle, and a plain-language label. Channel position should be spatially stable — Ambience always left, SFX always right.*

**3.3 Soundboard pad grids — DJ apps and broadcast buttons**

DJ applications (djay Pro, Serato) use fixed-size, high-contrast pad grids for cue points and samples — each pad is ≥56×56 px with a label, a color for category, and a press-to-play immediate-response model [6]. The Elgato Stream Deck's software uses the same grid metaphor for scene-switching and sound effects during live streams, with each "key" being a square tile with icon + label [7]. Research on pad grids in broadcast contexts shows that pad size of ≥48 px allows confident touch targeting under stress, and that a 4×4 or 4×3 grid is the maximum that can be scanned at a glance without scroll on a standard monitor [7]. Soundboard apps (Soundpad, EXS24) use color-coded pads to indicate category (combat, ambient, door sounds, etc.), which dramatically reduces search time for frequently used effects [6]. *Implication: Soundboard pads should be ≥56×56 CSS px on Desktop (≥64 px on touch profiles), arranged in a 4×3 or 4×4 grid without scroll on the default view, color-coded by category, and labeled concisely (max 2 lines, 16 chars per line).*

**3.4 Crossfade controls — DJ app and OBS Studio patterns**

Crossfade (smooth transition between two tracks) is the critical TTRPG audio technique for scene transitions — from combat intensity to peaceful exploration. DJ apps (djay Pro, Traktor) use a horizontal crossfader control: a slider between "Channel A 100%" on the left and "Channel B 100%" on the right, with the midpoint producing an equal blend [6]. OBS Studio's "Fade to black" transition controls show a duration slider (ms) alongside the transition type selector [4]. Foundry VTT's playlist system supports smooth fade-in/fade-out durations per track, configurable in milliseconds, surfaced as a slider or number input [8]. *Implication: Crossfade should be a dedicated control: a transition-duration slider (0–10 s, default 3 s) and a "Crossfade to…" track picker. The crossfade state (fading in progress) must be visible with a progress indicator.*

**3.5 TTRPG audio platform patterns — Syrinscape, Foundry VTT, Roll20**

Syrinscape's SoundSet model organizes audio into "moods" — named atmosphere configurations per scene type — each mood containing layers (ambience bed, musical elements, one-shots) that play simultaneously at authored volumes [9]. This is the most fully developed TTRPG audio UX available and maps closely to this product's Scene-linked audio concept. Foundry VTT organizes audio into "Playlists" (ordered or shuffled track lists) and "Ambient Sound" objects placed on the map canvas [8]; the playlist sidebar is keyboard-accessible and shows play state per track. Roll20's Jukebox is a simpler track list with play/stop/volume per track — usable but lacks layering, presets, or scene-linking [10]. Battlebards offers a browser-based scene-mood picker organized by environment, making discovery very fast but offering no customization [11]. Ambient-Mixer layers user-assembled ambient loops with per-layer volume [12]. *Implication: This product should adopt Syrinscape's "mood-as-preset" concept (Scene audio presets), Foundry's playlist sidebar with per-track state, and Battlebards' fast environment-picker for preset discovery. Roll20's flat track list is insufficient for this product's depth goals.*

**3.6 Web audio autoplay policy — MDN / Chrome guidance**

Chrome's Autoplay Policy (since 2018) and the broader Web Audio API autoplay rules require a user gesture before audio context can start or resume [13]. Safari on iOS is similarly strict — the audio context must be resumed within a user interaction handler [14]. The MDN Web Audio API guide recommends listening for `state === 'suspended'` on the AudioContext and surfacing a user-action prompt [15]. Firefox follows the same policy with a site-level permission model [16]. *Implication: The audio system must detect autoplay blocks on page load and on session-state receipt; blocked players must see a clear, prominent "Tap to enable audio" action — not silence, not an error toast buried in a corner. The DM must be able to see which participants have not yet granted audio consent.*

**3.7 Background audio on mobile — platform constraints**

Mobile web browsers (iOS Safari, Android Chrome) aggressively suspend audio when the app moves to the background [14]. Native mobile apps using the Web Audio API through a WebView face the same constraint [15]. Spotify and YouTube Music handle this by using the MediaSession API to register background audio metadata with the OS, which both extends background playback permission and provides lock-screen controls [17]. *Implication: The product must declare `MediaSession` metadata whenever audio is playing; on mobile profiles where background audio is blocked, the UI must clearly indicate "Audio pauses in background" and offer a link to the device's relevant setting. Do not retry indefinitely — show the degraded state and let the DM acknowledge.*

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Syrinscape** | SoundSet/Mood model: named atmosphere presets per environment, with simultaneous layers (ambience, music, one-shots) at authored volumes; a "mood" activates an entire layer configuration in one click | Preset-as-unit-of-context-switch matches DM mental model; one action changes complete atmosphere | Borrow: mood/preset concept, layered atmosphere model, per-preset layer volumes. Avoid: web UI density and visual complexity; too much exposed to non-expert users | https://syrinscape.com/how-it-works/ |
| **Foundry VTT audio** | Playlist sidebar with per-track play/stop/volume; ambient sounds placed spatially on the map; crossfade duration slider per playlist; keyboard-accessible | Per-track state is always visible; spatial ambient sound placement maps well to maps | Borrow: per-track state display, crossfade duration setting, playlist concept. Avoid: ambient sounds placed on map canvas (fragile positional coupling; better to link to Scene or layer) | https://foundryvtt.com/article/playlists/ |
| **OBS Studio audio mixer** | Vertical channel strip per source: VU meter + fader + mute + label; all channels simultaneously visible; audio monitoring (DM hear vs. stream hear) toggle per strip | Vertical strip enables simultaneous volume reading across channels; monitoring toggle maps exactly to "DM monitor vs. players hear" | Borrow: vertical channel strip anatomy, mute toggle per channel, monitoring vs. output distinction. Avoid: OBS's complexity (dozens of strips, routing matrix) — limit to three channels | https://obsproject.com/wiki/Sources-Guide#audio-sources |
| **djay Pro pad grid** | Fixed 4×4 color-coded pad grid for samples/cues; ≥56 px pads; press plays immediately, release optionally stops; category color coding; label + icon per pad | Touch-safe sizing; immediate response; color categories reduce search time under stress | Borrow: pad sizing, color category model, immediate response on press. Avoid: DJ-specific terminology (hot cue, loop roll) — use plain TTRPG labels | https://www.algoriddim.com/djay-pro |
| **Spotify desktop now-playing bar** | Compact transport bar always visible at window bottom: album art + track name + artist + scrubber + volume + shuffle/repeat; never requires navigation to see current state | Persistent now-playing state satisfies the glance contract; spatial stability means users build muscle memory for transport buttons | Borrow: always-visible now-playing card, persistent transport controls. Avoid: scrubber for ambient loops (irrelevant for looping ambience); full-width bar is disproportionate for a VTT widget | https://open.spotify.com |
| **Battlebards** | Environment-based preset browser: pick an environment type (dungeon, forest, tavern) and instantly load a curated atmosphere; discovery is fast because categories match DM mental model | Environment-first organization matches how DMs think about atmosphere; fast discovery reduces prep friction | Borrow: environment/mood category browser for preset discovery. Avoid: no per-channel control, no customization — must support DM overrides | https://battlebards.com |

**North-star narratives**

1. **From Syrinscape:** A Scene's audio identity should be a *mood* — a single named preset that activates an entire atmosphere configuration (ambience + music + SFX availability) in one DM action. The DM should never have to reconstruct an atmosphere by manually starting three separate tracks every time a Scene activates. The Audio widget must support saving and recalling these configurations as first-class presets, and the Scene editor must expose a one-click "Set audio preset for this scene" affordance.

2. **From OBS Studio audio mixer:** The "what you monitor vs. what the stream hears" paradigm maps perfectly to the DM experience: the DM may want to preview a track at low volume before pushing it to players. The channel strip model — with a visible monitoring indicator per channel — makes this distinction legible without requiring the DM to understand underlying routing. Every audio channel should have a small "Players hear" / "DM only" indicator so the DM can confirm delivery state at a glance.

3. **From Chrome's autoplay policy:** Silent failure is the worst possible outcome for an audio feature. If a player's browser has blocked autoplay — which is the default for many — the session atmosphere arrives silently and neither the DM nor the player knows. The system must surface autoplay-blocked state as a prominent, actionable prompt on player devices and as a per-participant indicator on the DM's player roster, modeled on how Zoom surfaces microphone permission denials.

---

## 5. UX/UI requirements

### UX-AUDIO-001 — Now-playing card: persistent, glanceable track identity

- **Requirement:** The Audio Controls widget must display a persistent "now-playing" card that shows the active track name, the source channel (Ambience / Music / SFX), elapsed time (for non-looping tracks), and a looping indicator (for looping ambience). This card must be readable at peripheral vision distance without interaction.
- **Rationale:** The "glance contract" from operations-console research [1] requires that the DM never needs to open a panel to confirm what is playing. Spotify's persistent now-playing bar [2] is the canonical reference: spatial stability and label prominence allow peripheral reading. During live play the DM cannot afford foveal focus on media controls.
- **Spec:** Now-playing card dimensions: full width of the widget at the top; height 64 px (Desktop), 56 px (Tablet/Mobile). Contents, left to right: (a) track-type icon (waveform for ambience, note for music, lightning for SFX) 20×20 px in `--color-audio-channel-{type}` semantic token; (b) track name in `--text-label-md` (bold, truncated at 32 chars with ellipsis), below it source label in `--text-label-sm` muted ("Ambience" / "Music" / "One-shot SFX"); (c) right-side: looping icon (↻, 16 px) when looping, or elapsed/duration (MM:SS / MM:SS) for non-looping tracks in `--text-mono-sm`; (d) small "🔊 Players" badge (green dot + "Players" label, `--text-label-xs`) when the track is confirmed synced to at least one player; grey dot + "DM only" when no players have confirmed receipt. Background: `--color-surface-elevated`; bottom border: 1 px `--color-border-subtle`.
- **States:**
  - *playing* — full content displayed; track-type icon pulses once per 4 s at 0.85 opacity (reduced-motion: static)
  - *paused* — track name shown with a "Paused" label appended; icon static
  - *stopped / idle* — card shows "No track playing" in `--text-label-sm` muted; track-type icon replaced by speaker-off icon
  - *loading* — skeleton shimmer covering name and time fields; icon shown immediately
  - *error* — red border on card; "Playback error" label + retry icon button (44 px target)
  - *missing-asset* — amber border; "Track file missing" label + locate/remove actions
- **Platform profiles:**
  - Desktop: 64 px card, all fields visible simultaneously
  - Tablet: 56 px card, time field truncated to elapsed only (no duration denominator)
  - Mobile: 52 px card within the bottom drawer; track name max 24 chars; badge hidden (accessible via players panel)
- **Input:** pointer/touch (card tap opens full track detail sheet) · keyboard (`Tab` to card, `Enter` opens detail sheet) · screen reader: card announces on track change
- **Accessibility:** Card container `role="status"` `aria-label="Now playing"`; track change triggers `aria-live="polite"` announcement: "Now playing: [track name] on [channel]"; stopped state announces "Audio stopped"; paused announces "Audio paused"; the "DM only / Players" badge is `aria-label="[track name] is [synced to players | DM monitor only]"`. No color-only encoding — both dot color and text label present.
- **Acceptance criteria:**
  - Given audio is playing, when the DM views the Command Center from any layout position, then the now-playing card shows the track name and channel without any click or scroll.
  - Given the track is confirmed delivered to at least one player, when the DM reads the now-playing card, then a "Players" badge with green indicator is visible.
  - Given no track is playing, when a screen reader user navigates to the card, then it announces "No track playing."
  - Given `prefers-reduced-motion` is active, when the track icon's pulse animation would fire, then it does not animate.
- **Priority:** Must-have

---

### UX-AUDIO-002 — Transport controls: play, pause, stop with safe volume defaults

- **Requirement:** The Audio Controls widget must provide play, pause, and stop transport buttons that are the primary affordance of the widget, always visible without scroll. Master volume must default to a conservative level (50%) on first load and persist per device per player. Play must never produce a surprise volume spike on any device.
- **Rationale:** Universal transport iconography achieves >95% recognition without labels [1]. Volume safety on first play is a hard requirement: TTRPG sessions are often in-person with speakers, and a loud unexpected sound is disruptive and erodes DM trust. Apple Music's volume default guidance and accessibility guidelines recommend defaulting to ≤50% on unknown output devices [3]. AUDIO-007 requires device-local volume preference to be independent of session state.
- **Spec:** Transport button row: centered in the widget below the now-playing card. Buttons (left to right): [⏮ Prev] [⏹ Stop] [▶/⏸ Play/Pause] [⏭ Next]. The Play/Pause button is the primary: 56×56 CSS px on Desktop (64×64 on touch profiles), filled circle button using `--color-action-primary`. Stop: 44×44 px, ghost/outline button. Prev/Next: 40×40 px on Desktop (44×44 on touch), ghost buttons; shown disabled when track list has ≤1 item. Master volume: a horizontal slider immediately below the transport row, full widget width. Label "Master volume" in `--text-label-xs` left-aligned above slider; current percentage in `--text-mono-sm` right-aligned. Slider thumb: 20×20 px circle, `--color-action-primary`. Default: 50% on first use. Value persists device-locally (localStorage) and is not transmitted as session state. Range: 0–100%; step: 1. Keyboard: arrow keys ±1%, shift+arrow ±10%. A speaker icon at slider left reflects mute state (clicking icon toggles mute). Mute does not change the slider position — it overlays a crossed-speaker icon and reports "Muted" in the now-playing card's right side.
- **States:**
  - *play-active* — Play/Pause shows ⏸; button uses `--color-action-primary` fill
  - *paused* — Play/Pause shows ▶; button uses `--color-action-primary` fill (dimmed 70%)
  - *stopped* — Play/Pause shows ▶; Prev/Next disabled; Stop disabled; volume slider still interactive
  - *loading* — Play/Pause shows spinner; other buttons disabled for ≤500 ms until audio context starts
  - *muted* — Speaker icon crossed-out; volume slider opacity 50%; master volume label appended "(Muted)"
  - *autoplay-blocked* — Play/Pause replaced by "Enable audio ▶" label (amber, filled button); clicking resumes audio context; no spinner loop
- **Platform profiles:**
  - Desktop: Play/Pause 56×56 px; transport row at natural density; slider full widget width
  - Tablet: Play/Pause 64×64 px touch target; transport row with ≥44 px minimum on all buttons
  - Mobile: Play/Pause 64×64 px; transport row spans full drawer width; volume slider full drawer width; Prev/Next are icon-only (no label)
- **Input:** pointer/touch · keyboard (`Space` plays/pauses when widget is focused; `S` stops; `M` toggles mute; `←` / `→` arrow keys change volume ±1% when slider is focused; `Shift+←/→` ±10%) · screen reader announces state on change
- **Accessibility:** Play/Pause `role="button"` `aria-label="Play [track name]"` / `"Pause"` / `"Enable audio"` as appropriate; Stop `aria-label="Stop audio"`; Prev `aria-label="Previous track"`; Next `aria-label="Next track"`; Master volume: `<input type="range">` `aria-label="Master volume"` `aria-valuetext="[N] percent"` (or "Muted"); mute button `role="checkbox"` `aria-checked` reflecting state; transport state changes announce via `aria-live="polite"`: "Audio playing", "Audio paused", "Audio stopped".
- **Acceptance criteria:**
  - Given the audio widget is displayed for the first time, when the DM opens the volume slider, then the value reads 50%.
  - Given audio is playing and the DM presses Space (keyboard), then audio pauses and the Play/Pause button shows ▶ within 100 ms.
  - Given a player's browser has blocked autoplay, when the session syncs an audio start event, then the Play/Pause button on the player's client shows "Enable audio ▶" in amber, not a normal play state, and no audio plays silently.
  - Given the DM changes their master volume to 80%, when they refresh the page, then the master volume slider restores to 80% from device-local storage without contacting the server.
- **Priority:** Must-have

---

### UX-AUDIO-003 — Channel mixer: ambience, music, and SFX with per-channel volume

- **Requirement:** The Audio Controls widget must expose three independent audio channels — Ambience (looping bed), Music (melodic score), and SFX (one-shot effects) — each with a per-channel volume fader, a mute toggle, and a channel label. Channel volumes are part of session state and sync to players.
- **Rationale:** Syrinscape's layered atmosphere model [9] demonstrates that separating ambience, music, and SFX produces richer, more controllable soundscapes than a single audio track. OBS Studio's channel strip layout [4] shows that vertical faders with simultaneous visibility support fast per-channel adjustment under pressure. Ableton Live's labeling convention (role, not index) reduces cognitive load for non-engineers [5].
- **Spec:** Channel mixer panel: below the transport row, or in a collapsible "Mixer" sub-section of the widget. Three channel strips arranged side-by-side (Desktop) or in a row (Tablet/Mobile). Each channel strip anatomy (vertical layout within each strip):

  ```
  ┌──────────────┐
  │  [M]  mute   │  ← mute toggle button, 32×32 px
  │              │
  │     ████     │  ← VU meter (2-bar, 4 px wide each),
  │     ████     │    height 64 px, peak-hold indicator
  │     ████     │    (reduced-motion: static level bars)
  │              │
  │   ──●──      │  ← vertical fader thumb (24×24 px)
  │      │       │    track: 4 px wide, 80 px tall
  │      │       │
  │   [75%]      │  ← percentage label, --text-mono-xs
  │              │
  │  AMBIENCE    │  ← channel label, --text-label-sm
  └──────────────┘
  ```

  Channel labels and colors:
  - Ambience: `--color-audio-ambience` (e.g., teal/blue family) — waveform icon
  - Music: `--color-audio-music` (e.g., warm amber) — note icon
  - SFX: `--color-audio-sfx` (e.g., violet) — lightning icon

  Per-channel volume: 0–100%, step 1, default 75% (Ambience), 60% (Music), 80% (SFX). These defaults reflect common VTT practice (ambience lower, SFX punchy). Values are session state, synced to players (AUDIO-003). The DM's master volume multiplies the channel volumes before output; players apply their own local master volume on top.

  Mute toggle: 32×32 px button with mute icon (`M` label for screen readers). When muted: channel label gets strikethrough style and muted icon; fader opacity reduced to 50%; VU meter flat. Mute state is session state and propagates to players — a DM muting the SFX channel silences SFX on all player devices. Player-local mute (personal preference) is a separate device-local setting and does not mutate session channel mute state.

- **States:**
  - *active* — fader at session volume; VU meter animated during playback
  - *muted* — mute button active; label strikethrough; VU flat
  - *solo* (Could-have) — all other channels temporarily silenced for DM preview; "Solo" label on channel; not propagated to session state
  - *clipping* — VU peak bar red; label "Peak!" in `--color-status-error`; auto-clears after 2 s
  - *no-content* — fader visible but greyed; label muted; tooltip "No [channel] track loaded"
- **Platform profiles:**
  - Desktop: three vertical strips side-by-side in the mixer panel; full strip anatomy visible
  - Tablet: three strips in a horizontal scrollable row (all visible if widget wide enough); short fader tracks (56 px); VU meters optional (toggle in widget settings)
  - Mobile: strips collapsed to a row of three horizontal sliders labeled "Amb", "Mus", "SFX" with mute toggle buttons; vertical strip expanded on tap (full-screen sheet per channel)
- **Input:** pointer (click fader track to set value, drag thumb) · touch (touch-drag fader thumb; ≥44 px tap target around thumb) · keyboard (`Tab` to each fader; `↑/↓` ±1% volume; `Shift+↑/↓` ±10%; `M` toggles mute on focused channel) · no sustained-hold interactions; all gestures have discrete alternatives (tap to set volume via numeric input modal)
- **Accessibility:** Each fader: `<input type="range">` `aria-label="[Channel] volume"` `aria-valuetext="[N] percent [muted if applicable]"`; mute button: `role="checkbox"` `aria-checked` `aria-label="Mute [Channel]"`; VU meter: `aria-hidden="true"` (decorative; state is conveyed by fader value and mute status, not by animation); channel volume changes announce via `aria-live="polite"` only when the DM has stopped adjusting (debounce 800 ms to avoid floods).
- **Acceptance criteria:**
  - Given a session with a player connected, when the DM moves the Ambience fader to 40%, then the player's Ambience channel volume updates to 40% within 1 second.
  - Given the DM mutes the SFX channel, when a player's client receives the sync event, then SFX audio is silenced on the player device and the player sees the SFX channel as muted.
  - Given a keyboard-only user, when they tab to the Music fader and press Shift+↑, then the volume increases by 10%.
  - Given `prefers-reduced-motion` is active, when audio is playing on the Ambience channel, then the VU meter shows a static bar at the current level and does not animate.
- **Priority:** Should-have

---

### UX-AUDIO-004 — Scene-linked audio: preset association and auto-play-on-activate

- **Requirement:** The DM must be able to associate an audio atmosphere preset with a Scene or map. When the DM activates that Scene, the associated preset is offered for playback (or auto-plays if configured). The association and auto-play setting are visible in the Scene editor.
- **Rationale:** AUDIO-001 functional requirement. Syrinscape's SoundSet/Mood model [9] demonstrates that Scene-coupled presets eliminate the "manual reconstruction" problem — without them, the DM must remember and restart audio every time they switch Scenes. Foundry VTT's Scene audio field shows that this is a standard expectation in professional VTTs [8]. Auto-play-on-activate is a power feature that can surprise users — it must be an opt-in per Scene, not the default.
- **Spec:** In the Scene editor panel (not the audio widget — this is authoring, not playback), a collapsible "Audio & Atmosphere" section appears below the scene thumbnail and before scene tags. Section contents:
  - **Preset picker:** a "Select atmosphere preset" dropdown (or button that opens the preset browser sheet). Shows the name of the currently associated preset, or "No preset — click to set". The preset browser shows all saved presets as cards (name, mood/environment category, channel summary line).
  - **Auto-play on activate toggle:** `role="switch"`, default OFF. Label: "Auto-play when scene activates". Helper text (one line, muted): "Starts audio automatically when you make this scene active. Requires a prior user interaction on player devices." When ON, a crossfade-duration picker appears (default: 3 s).
  - **Override per-channel volumes toggle** (Could-have): allows the preset to override channel volumes when this scene loads, rather than only changing the track selection.
  - **Preview button:** 44 px target; plays the preset for DM-only monitoring at current master volume without affecting session state. Label: "Preview (DM only)". While previewing, a small "Previewing" badge appears on the now-playing card with a "Stop preview" action.

  In the Audio Controls widget (playback surface), a "Scene preset" indicator at the top of the now-playing section (below the now-playing card) shows: "Scene: [scene name]" + preset name in `--text-label-xs` muted if the current audio was triggered by a scene activation. If no scene is linked, this row is hidden.

- **States:**
  - *no-preset* — dropdown shows "No preset"; auto-play toggle disabled; preview button disabled
  - *preset-set* — dropdown shows preset name; auto-play available; preview enabled
  - *auto-play-on* — toggle active; crossfade picker visible; helper text warns about autoplay policy
  - *activating* — brief loading state on scene activation (≤300 ms) before audio starts or offers to start
  - *autoplay-blocked-at-activation* — if auto-play is on but the audio context is suspended on a player device, that player sees a "Tap to start audio" prompt (see UX-AUDIO-008)
- **Platform profiles:**
  - Desktop: "Audio & Atmosphere" section in Scene editor sidebar; all controls visible without scroll within a 200 px panel section
  - Tablet: same section, touch-optimized targets; crossfade picker uses `<input type="number">` with +/- stepper buttons ≥44 px
  - Mobile: Scene editor audio section is accessible but auto-play configuration is hidden behind an "Advanced" disclosure (slim surface); DM can still set a preset from mobile
- **Input:** pointer/touch · keyboard (`Tab` to preset picker, `Enter`/`Space` opens browser; `Tab` to auto-play toggle, `Space` toggles; `Tab` to crossfade input, type or arrow-key adjust) · no gesture-only interactions
- **Accessibility:** Preset picker button: `aria-label="Select atmosphere preset for this scene"` `aria-haspopup="dialog"`; auto-play toggle: `role="switch"` `aria-checked` `aria-label="Auto-play audio when scene activates"`; helper text linked via `aria-describedby`; preview button: `aria-label="Preview atmosphere preset (DM only)"`; preset browser sheet: `<dialog>` with `aria-labelledby="Atmosphere Preset Browser"` `aria-modal="true"`.
- **Acceptance criteria:**
  - Given a Scene has an associated preset, when the DM activates the Scene, then the audio widget offers to play (or auto-plays if configured) the preset within 500 ms of Scene activation.
  - Given auto-play is OFF for a Scene, when the DM activates it, then no audio starts automatically and the DM sees a "Play [preset name]?" prompt with a play button.
  - Given auto-play is ON for a Scene, when a player device's audio context is blocked, then the player sees a "Tap to start audio" prompt rather than silent playback.
  - Given the DM clicks "Preview (DM only)", then the preset plays at DM device only; no session audio state changes; other players hear no change.
- **Priority:** Should-have

---

### UX-AUDIO-005 — Soundboard: one-shot SFX pad grid

- **Requirement:** The Audio Controls widget must provide a soundboard panel containing a grid of one-shot SFX pads. Each pad plays a sound effect immediately on press without disrupting the ambience or music channels. Pads are color-coded by category, labeled concisely, and configurable by the DM.
- **Rationale:** One-shot SFX (door slam, thunder crack, sword clash, drinking sounds) are among the most DM-requested audio features in TTRPG communities. DJ app pad grids [6] and the Elgato Stream Deck [7] demonstrate that a fixed-position, color-coded grid supports fast, confident access under table pressure. Syrinscape's one-shot elements exist but are buried in its web interface [9]; a dedicated pad grid is a significant UX improvement.
- **Spec:** Soundboard panel: a separate tab or collapsible section within the Audio Controls widget (on Desktop, accessible via a "Soundboard" tab in the widget header; on Mobile, a full-screen sheet). Default grid: 4 columns × 3 rows = 12 pads (Desktop/Tablet). Pad sizing:
  - Desktop: 72×72 CSS px per pad, 8 px gap between pads
  - Tablet: 64×64 px per pad, 6 px gap
  - Mobile: 80×80 px per pad (larger for touch), 3×4 grid (3 columns, 4 rows) = 12 pads per page; swipe to additional pages

  Pad anatomy (per pad):
  ```
  ┌─────────────────┐
  │   [icon 24px]   │  ← category icon; category color as left border (4 px)
  │   DOOR SLAM     │  ← label, --text-label-xs, bold, max 2 lines
  │   ─────────     │
  │   [▶ playing]   │  ← playback indicator, shown during 0.5–3 s one-shot
  └─────────────────┘
  ```

  Category colors (semantic tokens):
  - Combat: `--color-audio-sfx-combat` (red family)
  - Nature/Environment: `--color-audio-sfx-nature` (green family)
  - Social/Atmosphere: `--color-audio-sfx-social` (warm amber)
  - Magic/Supernatural: `--color-audio-sfx-magic` (violet)
  - Uncategorized: `--color-audio-sfx-default` (neutral)

  Pad press behavior: immediate play on pointer-down / touch-start. The SFX channel volume controls the output level. One-shot sounds play through the SFX channel; simultaneous SFX are supported (polyphonic). A small "playing" indicator animates for the duration of the effect (reduced-motion: static dot). Long-press (Desktop: right-click; touch: long-press ≥500 ms) opens a pad configuration menu: "Change sound", "Rename pad", "Change category", "Clear pad". Empty pads show "+" in the center with label "Add sound" in muted text; tapping opens the asset picker.

  Soundboard content is part of the audio widget's DM-authored configuration (not session state) — players do not have a soundboard; SFX pads produce sounds via the SFX channel which is part of session state.

- **States:**
  - *pad-default* — resting state; category color border; icon + label
  - *pad-hover* (Desktop) — slight elevation shadow; cursor pointer
  - *pad-focus-visible* — 2 px `--color-focus-ring` outline; no color-only difference
  - *pad-active/pressed* — scale(0.95) transform (reduced-motion: no scale; border width increase to 3 px instead); playback indicator visible
  - *pad-playing* — playback indicator animates (reduced-motion: static dot)
  - *pad-empty* — "+" center; muted border; label "Add sound"
  - *pad-missing-asset* — amber border; icon replaced by warning icon; label appended "⚠"
  - *pad-disabled* — SFX channel muted; pad opacity 50%; tooltip "SFX channel is muted"
- **Platform profiles:**
  - Desktop: 4×3 pad grid in "Soundboard" tab of Audio widget; all 12 pads visible without scroll; "Edit soundboard" button in tab header
  - Tablet: same 4×3 grid with 64 px pads; "Edit" in widget header
  - Mobile: full-screen sheet with 3×4 grid, 80 px pads; bottom bar has "Edit" and "Close" buttons; swipe left for additional pages of pads
- **Input:** pointer (click/press pad) · touch (tap pad; long-press for config) · keyboard (`Tab` navigates pads in reading order; `Space`/`Enter` triggers sound; `F2` or `Shift+F10` opens pad config menu for focused pad) · no gesture-only path — long-press config also available via keyboard (`F2`) and right-click
- **Accessibility:** Grid: `role="grid"` with `role="gridcell"` pads; each pad is a `<button>` with `aria-label="[Pad label] — [Category] sound effect"`; empty pads `aria-label="Empty pad — press to add a sound effect"`; playing state: `aria-live="polite"` announces "[Pad label] playing" on trigger (only for keyboard users — pointer users have visual feedback and do not need announcement for every press); missing-asset pads: `aria-label="[Pad label] — sound file missing"`; pad config menu: `role="menu"` opened via `aria-haspopup="menu"` button; color category is reinforced by both border color and icon, never color-alone.
- **Acceptance criteria:**
  - Given the soundboard is open and the DM presses a pad, then the SFX sound plays within 100 ms and the playback indicator appears.
  - Given a keyboard user focuses a pad and presses Space, then the sound plays and an `aria-live` announcement fires.
  - Given the SFX channel is muted, when the DM presses a pad, then no sound plays and the pad shows a "SFX channel is muted" tooltip.
  - Given a pad's asset file is missing, when the DM views the soundboard, then the pad shows an amber warning indicator and a "sound file missing" label — it does not silently appear as a normal pad.
  - Given `prefers-reduced-motion` is active, when a pad is pressed, then no scale transform animation fires; instead the border width increases.
- **Priority:** Should-have

---

### UX-AUDIO-006 — Crossfade and scene transition controls

- **Requirement:** The Audio Controls widget must provide a crossfade control that smoothly transitions from the current tracks to a new preset or track over a configurable duration (0–10 s). The crossfade state must be visible as a progress indicator during the transition.
- **Rationale:** AUDIO-002 functional requirement includes crossfade. Abrupt audio cuts during scene transitions break atmosphere and are a common VTT complaint. DJ apps' crossfader paradigm [6] and Foundry VTT's fade-duration slider [8] demonstrate that a configurable transition is the expected professional pattern. Crossfade during a scene transition must be visually indicated — a DM watching a slow fade to silence must be able to confirm the system is working, not broken.
- **Spec:** Crossfade control location: in a "Transition" section of the Audio widget, below the channel mixer panel. Controls:

  ```
  Transition duration:  [0────────●──────10]  3.0 s
  Crossfade to:  [ Select preset or track ▾ ]
                 [ Crossfade now ]  [ Cancel ]
  ```

  Duration slider: `<input type="range">` 0–10 s, step 0.5 s, default 3.0 s. Current value label in `--text-mono-sm` right of slider. "Crossfade now" button: filled, 44 px target. This initiates a cross-fade from the current playing tracks to the selected preset or single track. Cancel aborts the crossfade and snaps to either origin or destination (user choice via a brief confirmation: "Snap to [current] or [new]?").

  During crossfade, the now-playing card shows a transition state:
  ```
  ┌─────────────────────────────────────────┐
  │  ⟲  Crossfading to: [new preset name]  │
  │  ████████████░░░░░░░░  2.1 s remaining  │
  │  [Cancel crossfade]                     │
  └─────────────────────────────────────────┘
  ```
  Progress bar: animated from 0%→100% over the configured duration (reduced-motion: static percentage label replaces bar animation). Cancel crossfade: ghost button, always reachable.

  Crossfade is propagated to session state — all player devices execute the crossfade simultaneously, triggered by the same session event timestamp. Players experience the same fade duration.

- **States:**
  - *crossfade-idle* — "Crossfade to" section shows picker at default; "Crossfade now" button disabled until a target is selected
  - *crossfade-selected* — target chosen; "Crossfade now" enabled
  - *crossfading* — progress overlay on now-playing card; "Cancel crossfade" available; transport buttons locked during crossfade (play/pause disabled; only Stop and Cancel are active)
  - *crossfade-complete* — progress overlay dismissed; new preset/track active; brief "Crossfade complete" toast
  - *crossfade-cancelled* — snap-choice prompt appears; resolves in ≤2 actions
- **Platform profiles:**
  - Desktop: Transition section visible in collapsed form (header "Transition ▾" that expands in-panel) below the mixer; always reachable without leaving the widget
  - Tablet: same collapsed section; duration picker uses a stepper (+/-) in addition to slider for easy touch adjustment
  - Mobile: "Crossfade" accessible as a bottom-sheet action button below the transport; duration picker as a number input with steppers
- **Input:** pointer/touch (drag slider, tap "Crossfade now") · keyboard (`Tab` to duration slider; `←/→` ±0.5 s; `Tab` to preset picker; `Enter` opens it; `Tab` to "Crossfade now"; `Enter` to start) · screen reader: crossfade progress announced at start and on completion
- **Accessibility:** Duration slider: `<input type="range">` `aria-label="Crossfade duration"` `aria-valuetext="[N] seconds"`; "Crossfade now" button: `aria-label="Crossfade to [selected target]"`; progress indicator during crossfade: `role="progressbar"` `aria-valuenow` `aria-valuemin="0"` `aria-valuemax="100"` `aria-label="Crossfade progress"`; crossfade start announces "Crossfading to [preset name] over [N] seconds" via `aria-live="assertive"`; completion announces "Crossfade complete, now playing [preset name]" via `aria-live="polite"`.
- **Acceptance criteria:**
  - Given the DM selects a new preset and sets crossfade to 5 s, when they click "Crossfade now", then the now-playing card shows a progress indicator and the audio transition completes in approximately 5 s.
  - Given a crossfade is in progress, when the DM clicks "Cancel crossfade", then a snap-choice prompt appears within 100 ms.
  - Given `prefers-reduced-motion` is active, when a crossfade is in progress, then the progress bar does not animate — a static percentage label updates at 500 ms intervals instead.
  - Given a player device receives the crossfade session event, then it executes the same fade duration as the DM's device.
- **Priority:** Should-have

---

### UX-AUDIO-007 — Track library and playlist management

- **Requirement:** The DM must be able to browse, search, and queue tracks from a track library drawer accessible from the Audio Controls widget. The library supports local files and (where declared in the source configuration) web streams. Playlists can be created, named, and ordered.
- **Rationale:** AUDIO-004 and AUDIO-009 functional requirements. A flat track list (as in Roll20 Jukebox [10]) is insufficient for a DM with a rich audio collection. Foundry VTT's playlist sidebar [8] with per-playlist and per-track controls is the most developed reference. Quick search by name or tag is essential — during session prep a DM may have dozens of tracks.
- **Spec:** Track library drawer: opened from a "Library" button in the Audio widget header (book icon, 44 px target). Opens as a right-side drawer on Desktop (320 px wide), bottom sheet on Tablet/Mobile (60% viewport height). Drawer contents:

  **Header:** "Track Library" label + search field (auto-focused on open, `aria-label="Search tracks and playlists"`) + "Import track" button (plus icon, 44 px).

  **Playlist list:** Each playlist shown as a collapsible group:
  ```
  ▼  Dungeon Depths          (12 tracks)  [▶] [⋮]
     └─ Dripping Water Loop    03:42  [▶] [+] [⋮]
     └─ Chains Rattle          00:08  [▶] [+] [⋮]
     └─ Distant Moaning        02:15  [▶] [+] [⋮]
  ▶  Tavern Warmth            (8 tracks)  [▶] [⋮]
  ▶  Combat — Tense           (6 tracks)  [▶] [⋮]
  ```
  Playing indicator (▶ left of playlist name) when that playlist is the source of the current session audio. [▶] button on playlist: "Play all tracks in this playlist (shuffle/order)". [+] on a track: "Queue next" or "Add to soundboard". [⋮] on playlist or track: context menu (rename, delete, change order, set crossfade, view metadata, licensing info).

  **Track card (expanded on [⋮] or tap):** Track name, source type badge (Local / Web stream / Bundled preset), duration, tags (editable), license note, source URL (DM-only, not synced to players). Tags: comma-separated free-text, used for search.

  **Import track flow:** Triggered by "Import track" button. Opens a dialog: drag-and-drop zone (Desktop) + "Browse files" button. On file selection: shows filename, detected duration, source type (always "Local file" for imported files). DM adds name, tags, license note (optional but flagged if missing on export per AUDIO-011). "Save" adds to the "Uncategorized" playlist.

  **Quick search:** Filters both playlist names and track names/tags in real time as DM types (debounce 200 ms). Matching tracks highlighted; non-matching playlists collapsed.

- **States:**
  - *drawer-closed* — Library button shows a dot indicator if a playlist is active as the session audio source
  - *drawer-open* — search focused; playlist tree visible; current-session playlist highlighted
  - *search-active* — filtered results only; "Clear search ×" button appears
  - *playlist-playing* — ▶ indicator left of playlist name; active track row highlighted with `--color-surface-selected`
  - *track-loading* — shimmer on track name row; "Loading…" label
  - *track-missing* — amber row; "⚠ File not found" chip; [Locate] button to relink
  - *web-stream-offline* — red dot on stream track; "Offline — stream unavailable" label
  - *empty-library* — drawer shows "No tracks yet" illustration + "Import your first track" button
- **Platform profiles:**
  - Desktop: 320 px right drawer; keyboard-navigable tree; drag to reorder tracks within playlist (drag-handle at left of each track row); discrete "Move up/down" buttons as keyboard/touch alternative
  - Tablet: bottom sheet (60% height); same tree layout; drag-to-reorder with drag handle (≥44 px target)
  - Mobile: bottom sheet (80% height to maximize library visibility); single-column; no drag-reorder (uses "Move up / Move down" buttons instead)
- **Input:** pointer/touch · keyboard (`Tab` through playlists and tracks; `Enter`/`Space` to play/expand; `←/→` to collapse/expand playlist group; `Ctrl+F` / `Cmd+F` focuses search field from within the drawer) · search: type to filter
- **Accessibility:** Drawer: `<dialog>` `aria-label="Track library"` `aria-modal="true"`; playlist tree: `role="tree"` with `role="treeitem"` for playlists and `role="treeitem"` for tracks; expanded state: `aria-expanded`; play buttons: `aria-label="Play playlist [name]"` or `"Play track [name]"`; add-to-queue: `aria-label="Queue [track name] next"`; playing track: `aria-current="true"`; track missing: `aria-label="[track name] — file not found"`.
- **Acceptance criteria:**
  - Given the track library has 20 tracks, when the DM types "dungeon" in the search field, then only tracks with "dungeon" in name or tags are shown within 300 ms.
  - Given the DM plays a playlist from the library, when the track advances, then the active track row in the library drawer highlights the new track.
  - Given a local file track's source file is missing, when the DM opens the library, then the track row shows an amber warning and a "Locate" button, not a generic error.
  - Given the DM imports a track without a license note, when they attempt to export a Scene package, then the export validation flags the track and does not silently omit the warning.
- **Priority:** Should-have

---

### UX-AUDIO-008 — Session-state sync and "what players hear" indicator

- **Requirement:** Audio playback state (active tracks, channel volumes, mute states, crossfade state) must be clearly identified as session state — shared and synced to all collaborators. The DM must see, per participant, whether audio is being received or blocked. Players must have a clear device-local indicator of what they are currently hearing without access to DM-only track metadata.
- **Rationale:** AUDIO-003 and AUDIO-007 functional requirements. The "what players hear" distinction is critical: a DM may monitor a preview track that players do not hear, or a player's browser may block autoplay. Without a per-participant indicator, the DM cannot know whether the atmosphere is reaching the table. OBS Studio's monitoring/output split [4] is the model; per-participant delivery status is modeled on Zoom's participant audio indicator (microphone icon per participant row).
- **Spec:** **DM-side indicator (Audio Controls widget):**

  In the now-playing card (see UX-AUDIO-001), a "Players" delivery row appears below the track name:
  ```
  ┌──────────────────────────────────────────┐
  │ 🔊 Forest Rain — Ambience          ↻ 01:23│
  │ Players: ● Aria  ● Bob  ○ Cass (blocked) │
  └──────────────────────────────────────────┘
  ```
  Dot colors: green (confirmed receiving), grey (no session / no audio context), amber (autoplay-blocked), red (error). Cass's dot is amber with "blocked" label. The entire "Players" row is a button that opens the Player Audio Status panel (see below).

  **Player Audio Status panel** (expanded from the "Players" row, or accessible from the Player-View Controller panel in Command Center): A compact list of all participants, each row showing:
  - Avatar (28×28 px) + name
  - Audio status icon: ● green = receiving, ◑ amber = autoplay blocked (user gesture needed), ✕ red = error or permission denied, ○ grey = no audio configured / not in session
  - Status label text: "Receiving", "Tap required on their device", "Error", "Audio off"
  - For blocked status: a "Nudge" button (44 px) that sends a push notification to that participant's device prompting them to tap to enable audio. "Nudge" does not re-send audio state — it sends a UI prompt only.

  The DM's own audio monitoring state is clearly distinct: a "DM monitor" row at the top of the panel, styled differently (indented, labeled "You (DM)"). The DM may set a "DM-only preview" flag on the current track that prevents it from entering session state; this is indicated by a "DM monitor only — not sent to players" banner in the now-playing card (amber background, 8 px height banner).

  **Player-side indicator (player client):**

  Players see a compact audio status indicator in their session toolbar (a small speaker icon with a label): "Hearing: [track name]" when audio is confirmed playing, "Audio paused" when muted or paused, "Tap to enable audio" (amber, interactive) when autoplay is blocked. Players do not see DM-internal track metadata (source URL, license note, DM-only tags). They see only: track name (DM-authored display name), channel (Ambience/Music/SFX), and their local volume controls (master only; channel volumes are session state from DM).

  Players can: (1) adjust their local master volume (device-local, does not sync); (2) mute their local audio (device-local); (3) tap "Enable audio" to unblock autoplay. Players cannot: change channel volumes (DM-controlled session state); skip tracks; access the DM's track library.

- **States:**
  - *dm-only-preview* — amber "DM monitor only" banner in now-playing card; Players row shows all grey dots
  - *session-audio-playing* — now-playing card full; Players row shows per-participant dots
  - *player-autoplay-blocked* — player's dot is amber; "Tap required" label; Nudge button available
  - *player-error* — player's dot is red; "Error" label; tooltip available showing error type (without exposing device secrets per AUDIO-006)
  - *queued-undelivered* — if the DM changes audio state while a player is offline, the player's row shows "Queued" (grey with clock icon); on reconnect, state is applied
- **Platform profiles:**
  - Desktop: "Players" row is always visible in the now-playing card; Player Audio Status panel opens as a popover (240 px) from the row
  - Tablet: same; popover becomes a bottom sheet on portrait
  - Mobile (DM): "Players" audio status accessible from a "Session" bottom drawer entry; not in the slim audio widget
  - Mobile (Player): compact speaker badge in top bar; "Tap to enable" shown as a full-width amber banner at the top of the screen (most prominent possible position for autoplay prompt)
- **Input:** pointer/touch (tap "Players" row to open panel; tap "Nudge" button) · keyboard (`Tab` to "Players" row; `Enter` opens panel; `Tab` to each participant's Nudge button; `Enter` nudges)
- **Accessibility:** "Players" row: `role="button"` `aria-label="Player audio status — [N] receiving, [M] blocked"` (summary label updated by live region on status changes); per-participant status: each row has `aria-label="[Name]: [status text]"`; Nudge button: `aria-label="Nudge [Name] to enable audio"`. On player client, the "Tap to enable audio" prompt is `role="alert"` and focuses automatically when it appears — it must be the first focusable element so keyboard users encounter it without having to search. No color-only encoding: each dot has both color and a text label.
- **Acceptance criteria:**
  - Given a player's browser has blocked autoplay, when the DM views the now-playing card's Players row, then that player's indicator shows an amber dot with "Tap required" text within 2 seconds of the block being detected.
  - Given the DM sets a track to "DM monitor only", when a player views their session toolbar, then they see no audio playing and the "Players" row on the DM side shows all grey dots.
  - Given the DM clicks "Nudge" for a blocked player, then a prompt appears on that player's device within 3 seconds; the DM's audio session state is unchanged.
  - Given a player taps "Enable audio" on their device, then their dot in the DM's Players row updates to green within 2 seconds.
  - Given a screen reader user is a player with autoplay blocked, when the "Tap to enable audio" banner appears, then it is announced via `role="alert"` and focus moves to the "Enable audio" button.
- **Priority:** Must-have

---

### UX-AUDIO-009 — Autoplay policy handling: no silent failure

- **Requirement:** When the Web Audio API autoplay policy blocks audio playback on any device — DM or player — the application must immediately surface a prominent, actionable prompt. Silent failure (audio state changes without audible output and no UI indication) is explicitly prohibited.
- **Rationale:** Chrome's autoplay policy [13] and Safari's Web Audio restrictions [14] are encountered by virtually all first-time users who load the app in a fresh tab or after a page reload. MDN recommends listening for `AudioContext.state === 'suspended'` and surfacing a user gesture prompt [15]. Without explicit handling, the DM may believe audio is playing for players when it is not — a silent failure that erodes trust in the entire audio system. This is an anti-pattern explicitly documented in Chrome's autoplay policy guide as "the worst user experience."
- **Spec:** On page load (and after any session reconnect), the audio system checks `AudioContext.state`. If suspended:
  - **DM device:** The transport Play/Pause button displays "Enable audio ▶" (amber fill, full-width in the button row, 44 px). Below it, a one-line helper text (muted): "Your browser requires a click to start audio." No spinner. No error styling. Clicking the button resumes the audio context, then immediately attempts to play the pending session audio state. The "Enable audio" state replaces the normal Play/Pause state — it is not a separate modal or toast that the DM might dismiss and forget.
  - **Player device:** A full-width amber banner appears at the very top of the session view (above all content): "Audio is ready — tap to enable [Enable ▶]". The banner is `role="alert"` and auto-focuses the "Enable ▶" button. The banner remains visible until the player taps it or explicitly dismisses it with a close ×. Dismissal without enabling records "consent-declined" status for that session, which is reflected in the DM's Players row as a grey dot with "Audio off" label (not "blocked" — the distinction is intentional per AUDIO-007).
  - **Retry behavior:** After the user gesture is received, the system makes exactly one attempt to resume the audio context. If it fails, an error toast appears: "Audio could not start. Check your browser settings." with a "Retry" button and a help link. No infinite retry loop (per AUDIO-013 performance-safe failure modes).
- **States:**
  - *suspended-unacknowledged* — "Enable audio" button on DM; amber banner on player; both have `role="alert"`
  - *resuming* — brief loading (100 ms max) after user gesture; no visual interruption expected
  - *resumed-playing* — normal transport state
  - *consent-declined* (player dismissed without enabling) — grey dot, "Audio off" in DM's Players row; banner hidden on player's device; player can re-enable via the speaker icon in their toolbar
  - *error-after-gesture* — toast with retry and help link; 1 retry allowed before surfacing help link only
- **Platform profiles:**
  - Desktop: "Enable audio" as transport button replacement; no modal required
  - Tablet: same; amber banner is full-width sticky bar, 48 px height, above tab bar
  - Mobile: amber banner is full-height sticky bar below the status strip; no other content obscures it until dismissed
- **Input:** pointer/touch (tap to enable) · keyboard (`Tab` to "Enable audio" button; `Enter` to activate; `Escape` dismisses banner on player — records consent-declined) · no gesture-only path
- **Accessibility:** "Enable audio" button: `role="button"` `aria-label="Enable audio playback"` with `aria-describedby` pointing to helper text; player banner: `role="alert"` with "Enable ▶" as the first focusable element; consent-declined state does not announce repeatedly — only the initial "Audio is ready" fires; after that, player must actively seek the re-enable control.
- **Acceptance criteria:**
  - Given the DM opens the app and the audio context is suspended, when the audio widget is visible, then the Play/Pause button shows "Enable audio ▶" in amber — not a normal play button or silent state.
  - Given a player receives an audio session event with a suspended audio context, then a full-width amber banner appears at the top of their view within 1 second, with "Enable ▶" as the first focusable element.
  - Given a player dismisses the banner without enabling, then the DM's Players row shows "Audio off" (grey dot) for that player, not "blocked" (amber dot).
  - Given the audio context resumes successfully after a user gesture, then the "Enable audio" button and banner both disappear and normal transport state is shown — no further prompts.
- **Priority:** Must-have

---

### UX-AUDIO-010 — Asset management: import, metadata, and missing-asset states

- **Requirement:** The DM must be able to import local audio files with metadata (name, tags, license note, source URL). Missing or unavailable assets must be surfaced clearly in every location where the asset is referenced, with a locate/replace action — never silent substitution of another track.
- **Rationale:** AUDIO-004, AUDIO-010, AUDIO-011 functional requirements. A DM who has built atmosphere presets around specific audio files must be able to trust that the app reports asset problems before a session rather than silently failing mid-game. The "no silent substitution" rule is critical for legal compliance (licensing) and DM trust.
- **Spec:** **Import dialog:** Triggered from the Library drawer "Import track" button or by drag-and-drop onto the audio widget. Fields: (1) Display name (required, max 64 chars, pre-populated from filename); (2) Tags (optional, comma-separated, max 10 tags); (3) License note (optional free-text, max 256 chars; placeholder: "e.g., Creative Commons CC-BY 4.0, personal use, or leave blank"); (4) Source URL (optional; stores provenance). File validation on import: supported formats (MP3, OGG, WAV, M4A, FLAC); max file size 50 MB (surface error for larger files with a clear message); duplicate detection by file hash (if hash matches an existing asset, show "This file is already in your library as '[name]'" with "Use existing" / "Import as new copy" options). On save, the asset is stored locally and indexed.

  **Missing asset states:** Surfaced in three locations:
  1. Track library drawer: amber row, ⚠ icon, "File not found" chip, [Locate] and [Remove] buttons.
  2. Soundboard pad: amber border, warning icon, "⚠" appended to label, no playback on press.
  3. Scene "Audio & Atmosphere" section: if the scene's preset references a missing track, an amber notice "Preset [name] has missing tracks" + [Review] link to the library.
  [Locate] opens a file picker to relink the asset at a new path; on confirmation, the asset record updates and all references resolve. [Remove] asks confirmation and removes the asset from the library and from any presets/playlists that reference it.

  **Licensing export check:** Per AUDIO-011, when the DM exports a Scene package, the export dialog runs a validation pass and lists any assets missing license notes, flagging them with "No license recorded — review before distributing." Export can proceed (DM responsibility), but the flag is prominent and cannot be dismissed without a "I acknowledge" checkbox.

- **States:**
  - *asset-healthy* — normal display in all referencing surfaces
  - *asset-missing* — amber indicator in library, pad, and scene preset; [Locate] and [Remove] available
  - *asset-importing* — progress indicator in import dialog (indeterminate for < 5 s, determinate percentage if > 5 s)
  - *asset-duplicate* — duplicate detection dialog with "Use existing" / "Import as new" options
  - *asset-format-unsupported* — error in import dialog listing supported formats
  - *asset-too-large* — error in import dialog with file size limit and suggestion to compress
- **Platform profiles:**
  - Desktop: full import dialog; drag-and-drop supported on the library drawer; [Locate] opens system file picker
  - Tablet: import via "Browse files" button only (drag-and-drop not available on touch); same missing-asset states
  - Mobile (slim): import accessible but lower priority; missing-asset indicators shown; [Locate] and [Remove] available; no drag-and-drop
- **Input:** pointer (click/drag for import) · touch (tap "Import", tap file picker) · keyboard (`Tab` through import form fields; `Enter` to submit; `Escape` cancels; `Tab` to [Locate]/[Remove] in missing-asset states; `Enter` to activate)
- **Accessibility:** Import dialog: `<dialog>` `aria-labelledby="Import audio track"` `aria-modal="true"`; form fields with `<label>` associations; missing-asset states: `aria-label` on indicator icons describe the problem ("Track file not found"); [Locate] and [Remove] have explicit `aria-label` values. Import success announces "Track [name] imported" via `aria-live="polite"`; error announces via `aria-live="assertive"`.
- **Acceptance criteria:**
  - Given an MP3 file is dragged onto the library drawer, when the import dialog opens, then the display name is pre-populated from the filename and the DM can save without filling any optional field.
  - Given a track's source file is deleted outside the app, when the DM opens the library or a soundboard pad that references it, then an amber warning indicator appears with [Locate] and [Remove] actions — not a silent empty state or a default placeholder sound.
  - Given an export of a Scene package, when a referenced track has no license note, then the export dialog flags it with an "I acknowledge" checkbox before allowing export to complete.
- **Priority:** Should-have

---

### UX-AUDIO-011 — Atmosphere automation: session event triggers

- **Requirement:** The DM must be able to configure optional atmosphere triggers that automatically request an audio change when a session event occurs (combat starts, map reveals, scene activates, handout delivered). Each trigger shows its current configuration and allows the DM to disable it temporarily without deleting it.
- **Rationale:** AUDIO-005 functional requirement. Automation reduces cognitive load during high-pressure moments — the DM does not have to manually switch audio the instant combat starts. However, automation must never act without the DM's explicit prior configuration, and failures must be surfaced as diagnostics, not silent events (AUDIO-005 acceptance criteria).
- **Spec:** Automation triggers are configured in the Audio Controls widget under a collapsible "Automation" section (or in the Scene editor's Audio section for scene-specific triggers). Triggers list:

  | Trigger Event | Audio Action |
  |---|---|
  | Scene activated | Play scene's associated preset (crossfade over N s) |
  | Combat started | Switch to configured "combat" preset (crossfade over N s) |
  | Combat ended | Switch to configured "post-combat" preset |
  | Map revealed to players | Play configured "reveal" one-shot SFX |
  | Handout delivered | Play configured "handout" one-shot SFX |
  | Custom (DM-defined) | Play any configured track/preset |

  Each configured trigger is shown as a row:
  ```
  ● [Event: Combat started] → [Combat — Tense playlist]  [3 s crossfade]  [Enabled ⏸]  [⋮]
  ```
  [Enabled ⏸] toggle temporarily suspends the trigger without deleting it (soft disable). [⋮] opens edit/delete options. "Add trigger" button at the bottom of the list.

  When a trigger fires: (1) the audio action is attempted; (2) a non-blocking toast appears: "Automation: Combat — Tense started (triggered by combat start)"; (3) the DM retains full control — they can immediately override the automation with any transport action; (4) if the action fails (permission or asset validation per AUDIO-005), a diagnostic toast appears: "Automation trigger failed: [reason]" with a details link.

- **States:**
  - *trigger-enabled* — enabled toggle active; trigger fires on event
  - *trigger-soft-disabled* — toggle off; trigger listed but does not fire; greyed label
  - *trigger-firing* — brief highlight on the trigger row while the audio action is in progress (300 ms, reduced-motion: color pulse removed)
  - *trigger-failed* — error icon on trigger row; diagnostic toast shown; trigger row shows "Last run: failed [reason]"
  - *no-triggers* — empty state: "No automation configured" + "Add trigger" button
- **Platform profiles:**
  - Desktop: "Automation" collapsible section in the audio widget; trigger rows with all controls visible
  - Tablet: same collapsible section; [Enabled/Disabled] toggle uses ≥44 px touch target
  - Mobile (slim): automation view-only (can enable/disable existing triggers but not create new ones from mobile); "Manage automation" link opens desktop-targeted flow explanation
- **Input:** pointer/touch · keyboard (`Tab` to each trigger row; `Space` to toggle enabled state; `Enter` on [⋮] opens options menu)
- **Accessibility:** Trigger list: `role="list"` with `role="listitem"` rows; enable/disable toggle: `role="switch"` `aria-checked` `aria-label="Enable [Event] trigger"`; automation toast announces via `aria-live="polite"`: "Automation: [action] triggered by [event]"; failure toast: `aria-live="assertive"` with `aria-label` describing the failure.
- **Acceptance criteria:**
  - Given a "combat started" trigger is enabled with "Combat — Tense playlist" as the action, when combat is started via the combat tracker, then the audio crossfades to the Combat playlist within the configured duration and a toast confirms "Automation: Combat — Tense started."
  - Given a trigger fires but the referenced asset is missing, when the DM views the audio widget, then a diagnostic toast appears: "Automation trigger failed: track file missing" — no audio plays and no other session command is blocked.
  - Given the DM soft-disables a trigger, when the trigger event occurs, then no audio change happens and no toast fires.
- **Priority:** Could-have

---

### UX-AUDIO-012 — Player device-local controls: consent, mute, and volume independence

- **Requirement:** Every participant (player and observer) must have device-local controls for muting and adjusting volume that do not affect the DM-authored session audio state. Participants must be able to decline audio entirely. The player's local controls must be clearly distinguished from session-level audio state.
- **Rationale:** AUDIO-007 Must-have functional requirement. Players control their own listening environment; the DM controls atmosphere for everyone. Conflating the two — for example, if a player's volume change propagated to all players — would break both user mental models and the permission model. The visual distinction between "your local volume" and "session audio" is essential to prevent confusion. This requirement is release-blocking for any release that enables audio.
- **Spec:** **Player audio toolbar** (persistent in the player's session view, bottom of screen on Mobile, top-right badge on Desktop): a speaker icon + "Audio" label + local volume percentage. Clicking/tapping opens the Player Audio Controls popover:

  ```
  ┌─────────────────────────────────┐
  │  Your audio settings            │
  │  (these only affect your device)│
  │                                 │
  │  Volume: [──────●──────] 75%    │
  │  [🔊 Unmute] [🔇 Mute]          │
  │                                 │
  │  Session is playing:            │
  │  "Forest Rain — Ambience"  ↻    │
  │                                 │
  │  [Turn audio off for session]   │
  └─────────────────────────────────┘
  ```

  - **Local volume slider:** `<input type="range">` 0–100%, stored in device-local storage. Changes are not transmitted as session state (AUDIO-007 acceptance criteria). Label explicitly states "(these only affect your device)".
  - **Mute/Unmute toggle:** device-local; does not change DM's session state. When muted, the speaker icon in the toolbar shows crossed-out; the "Hearing:" indicator in the toolbar shows "Muted (local)".
  - **"Session is playing:"** read-only section showing the current DM-authored session audio (track name + channel). This is the session state; it cannot be modified by the player. If no audio is playing, shows "Session audio: Silent."
  - **"Turn audio off for session":** a soft opt-out. Records the player's consent-declined preference for this session only; updates their status in the DM's Players row to "Audio off" (grey dot). The player can re-enable with a "Turn audio back on" button that replaces it. This is not a permanent account preference — it is per-session.

- **States:**
  - *audio-active* — speaker icon (colored); volume % shown; "Hearing: [track name]"
  - *muted-local* — speaker crossed-out; "Muted (local)" label; session audio still playing but silent on device
  - *audio-off-session* — "Audio off" label; "Turn audio back on" button visible
  - *autoplay-blocked* — "Tap to enable" prompt (see UX-AUDIO-009 for full spec); coexists with player audio controls
- **Platform profiles:**
  - Desktop: speaker icon in top-right session toolbar; popover opens on click; keyboard accessible
  - Tablet: speaker icon in top-right; bottom sheet on portrait
  - Mobile: speaker badge persistent in top bar; tapping opens a bottom sheet (80% height); large targets throughout; "Turn audio off" is a prominent button at the bottom of the sheet
- **Input:** pointer/touch · keyboard (`Tab` to speaker toolbar badge; `Enter`/`Space` opens popover; `Tab` to slider; `←/→` to adjust; `M` toggles mute when popover is open; `Escape` closes) · no gesture-only interaction
- **Accessibility:** Toolbar badge: `role="button"` `aria-label="Audio settings — [Hearing/Muted/Audio off]"`; volume slider: `<input type="range">` `aria-label="Local volume (affects your device only)"` `aria-valuetext="[N] percent"`; mute button: `role="checkbox"` `aria-checked`; "Turn audio off" / "Turn audio back on": standard `<button>` with descriptive label; "Session is playing" section: `aria-live="polite"` updates when session audio changes (debounce 1 s to avoid floods).
- **Acceptance criteria:**
  - Given a player reduces their local volume to 30%, when the DM inspects session audio state, then the session volume is unchanged and the player's channel volume reflects the DM's setting.
  - Given a player clicks "Turn audio off for session", when the DM views the Players row, then that player's dot shows "Audio off" (grey), not "blocked" (amber).
  - Given a player is muted locally and the DM changes the session track, then no audio plays on the player's device, but the "Session is playing" read-only field updates to reflect the new track.
  - Given a keyboard user opens the player audio controls popover and presses `M`, then the mute state toggles and the `aria-checked` attribute on the mute button updates accordingly.
- **Priority:** Must-have

---

### UX-AUDIO-013 — Mobile audio constraints and background playback declaration

- **Requirement:** On Mobile and Tablet profiles, the audio system must declare `MediaSession` API metadata when audio is playing, display a clear "audio may pause in background" notice, and degrade gracefully to a visible paused state when background audio is suspended by the platform — without retry loops.
- **Rationale:** AUDIO-006 functional requirement. iOS Safari and Android Chrome suspend audio when the app moves to background without `MediaSession` registration [14]. The `MediaSession` API enables lock-screen controls and background playback on supporting platforms [17]. When background suspension occurs despite registration, the app must surface the paused state immediately rather than queuing retry attempts that exhaust battery (AUDIO-013 performance-safe failure mode).
- **Spec:** **MediaSession registration:** When any audio begins playback, the app registers `navigator.mediaSession.metadata` with: title (track display name), artist ("DND Tools Session"), album (Session name or "Unnamed session"), artwork (the app icon or a session thumbnail). Also registers `navigator.mediaSession.setActionHandler` for play, pause, stop, and nexttrack. This enables lock-screen controls on iOS and Android when supported.

  **Background notice:** On Mobile profile, the first time audio plays in a session, a non-blocking toast appears once (dismissible): "Tip: Audio may pause when you switch apps. We'll show you when this happens." This fires once per session, not on every play event.

  **Background suspension state:** When `AudioContext.state` transitions to `'suspended'` while the app is backgrounded (detected via `Page Visibility API`), on foreground return: (1) the now-playing card shows "Audio paused (switched apps) — [Resume ▶]" in the transport area; (2) the DM's Players row updates to a grey dot for mobile participants in this state; (3) the "Resume ▶" button resumes the audio context on tap; (4) no automatic retry — one explicit user gesture required. If resumption fails: error toast with "Audio could not resume. Close and reopen the app if needed." No retry loop.

  **Output routing declaration (AUDIO-012):** On platforms where output routing is unavailable (web browser), the output routing controls are not shown. On platforms where it is available (native app on iOS/Android, if applicable), a minimal "Output" picker appears in the player audio controls popover, showing available outputs. Changing output is device-local only; does not affect session state.

- **States:**
  - *playing-foreground* — MediaSession registered; lock-screen controls available
  - *suspended-background* — AudioContext suspended; on foregrounding: "Audio paused (switched apps)" state shown
  - *resumed-after-background* — user tapped Resume; audio resumes from current session position
  - *suspension-resume-failed* — error toast; no retry loop; guidance to close/reopen
- **Platform profiles:**
  - Desktop: background suspension is rare (desktop browsers deprioritize, not suspend); MediaSession still registered; no background notice needed
  - Tablet: same as Mobile (background suspension applies); MediaSession registered
  - Mobile: all behaviors described above apply; background notice fires once per session; "Audio paused" state is prominent in the compact transport within the bottom drawer
- **Input:** pointer/touch (tap "Resume ▶") · keyboard (where keyboard is attached to tablet; `Space` resumes) · no gestures-only interactions
- **Accessibility:** "Audio paused (switched apps)" state: `role="status"` update so screen reader announces; "Resume ▶" button: `aria-label="Resume audio after app switch"`; suspension background notice toast: `role="status"` (polite, non-interrupting); resume failure toast: `aria-live="assertive"` with guidance.
- **Acceptance criteria:**
  - Given audio is playing on a Mobile profile, when the user switches to another app and returns, then the now-playing card shows "Audio paused (switched apps)" with a "Resume ▶" button — no automatic retry has fired.
  - Given the DM is on Desktop and audio is playing, when the DM views the Players row for a Mobile participant who has backgrounded the app, then that participant's dot is grey (not errored).
  - Given a Mobile participant taps "Resume ▶" after background suspension, then audio resumes within 500 ms on that device.
- **Priority:** Should-have

---

### UX-AUDIO-014 — Performance safety: audio degradation must not block session commands

- **Requirement:** Repeated audio playback failures or excessive audio resource consumption must result in audio degradation (track stopped, channel silenced) without blocking or delaying any other session commands (dice rolls, initiative advancement, handout push, map reveal). The DM must see diagnostics in the audio widget, not interrupting modals.
- **Rationale:** AUDIO-013 functional requirement. During live play, a failing audio track must never freeze the session. Performance-safe failure is a hard architectural constraint — from the UX perspective, this means diagnostic information appears in the audio widget as a non-blocking callout, not a blocking modal or system notification that demands immediate DM attention.
- **Spec:** When the audio performance safety limit triggers (repeated failure or resource overuse): (1) the affected track or channel is stopped/silenced; (2) the now-playing card transitions to an `error` state (red border, "Audio degraded — [channel] silenced" label); (3) a non-blocking diagnostic strip appears below the now-playing card:

  ```
  ⚠ Audio degraded: Ambience channel stopped after repeated failures.
  [View details]  [Dismiss]  [Retry]
  ```

  "View details" opens a drawer (or expands inline on Desktop) with the technical diagnostic summary (error type, failure count, resource metric — expressed in plain language: "The track failed to load 5 times. Check the file or your connection."). "Retry" attempts to resume playback once. "Dismiss" hides the strip; the channel remains stopped; DM can manually restart via transport. No modal, no blocking dialog. All other session commands (combat tracker, dice, handout push, map control) remain fully responsive during and after audio degradation.

- **States:**
  - *degraded-channel* — red border on now-playing; diagnostic strip shown; affected channel's VU meter flat; mute toggle shows "Error" label
  - *diagnostic-expanded* — details drawer/inline expansion showing failure info
  - *retry-in-progress* — "Retry" button shows spinner; 1 attempt only; result: resumes or shows "Retry failed, please restart manually"
  - *dismissed* — diagnostic strip hidden; now-playing card returns to stopped/idle state; channel still silenced until DM manually restarts
- **Platform profiles:**
  - Desktop: diagnostic strip inline below now-playing card; "View details" as inline expansion
  - Tablet: same; touch targets ≥44 px
  - Mobile: diagnostic strip in the compact bottom-drawer transport; "View details" opens a bottom sheet; no inline expansion
- **Input:** pointer/touch · keyboard (`Tab` to diagnostic strip; `Enter` on [View details], [Dismiss], [Retry])
- **Accessibility:** Diagnostic strip: `role="status"` with `aria-label="Audio degraded — [channel] stopped"`; the announcement fires once via `aria-live="polite"` (not `assertive` — this must not interrupt a combat turn announcement); [View details] button: `aria-expanded` reflecting expansion state; [Retry] button: `aria-label="Retry audio playback"`.
- **Acceptance criteria:**
  - Given the Ambience channel has failed repeatedly and the safety limit triggers, when the DM views the audio widget, then a non-blocking diagnostic strip appears — no modal or blocking dialog is shown.
  - Given audio has been degraded and the DM advances a combat turn, then the combat turn advancement completes within its configured responsiveness budget (≤100 ms acknowledgment).
  - Given a keyboard user navigates to the diagnostic strip and presses Enter on [Retry], then a single retry attempt is made — no loop.
- **Priority:** Should-have

---

## 6. Component & state specifications

### 6.1 Audio Controls Widget — full anatomy

The Audio Controls widget occupies a bottom strip zone on the Command Center (see `05-command-center.md`, §7 wireframe: "AUDIO" zone, 56 px height in the default collapsed state). Expanding the widget opens a full panel.

**Collapsed state (56 px strip):**
```
┌─────────────────────────────────────────────────────────────────────┐
│  🔊  Forest Rain — Ambience  ↻    [⏮] [⏹] [▶/⏸] [⏭]   ━━━●━━━ 75% │
│      ● Players (3/3)                                       [Expand ⌃] │
└─────────────────────────────────────────────────────────────────────┘
```

**Expanded state (full panel, ~320 px height):**
```
┌───────────────────────────────────────────────────────────────────┐
│  [ Transport ] [ Soundboard ] [ Library ] [ Automation ]   [⌄ Collapse] │
├───────────────────────────────────────────────────────────────────┤
│  ┌──── NOW PLAYING ──────────────────────────────────────────┐   │
│  │  🌊  Forest Rain — Ambience  ↻  01:23                     │   │
│  │  ● Players: ● Aria  ● Bob  ○ Cass (blocked)               │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│           [⏮]     [⏹]     [▶/⏸]     [⏭]                         │
│                                                                   │
│  🔊 ━━━━━━━━●━━━━ 75%  Master volume                             │
│                                                                   │
│  ┌── MIXER ──────────────────────────────────────────────────┐   │
│  │  [M] AMBIENCE   [M] MUSIC    [M] SFX                      │   │
│  │  ████ │         ████ │       ████ │                        │   │
│  │  ─●── │         ─●── │       ─●── │     (vertical faders) │   │
│  │  75%  │         60%  │       80%  │                        │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Transition duration: [0──────●──10]  3.0 s   [Crossfade to ▾]  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Widget header tabs:** Transport | Soundboard | Library | Automation. Active tab indicated by underline + `--color-action-primary` text. Each tab is `role="tab"` within a `role="tablist"`.

### 6.2 State matrix for the now-playing card

| State | Visual treatment | aria-live |
|---|---|---|
| Playing | Full content; looping icon or elapsed timer; Players badge green | "Now playing: [track] on [channel]" — polite |
| Paused | "Paused" appended to track name; icon static | "Audio paused" — polite |
| Stopped / idle | "No track playing" in muted text; speaker-off icon | "Audio stopped" — polite |
| DM monitor only | Amber "DM monitor only" banner (8 px strip above card); Players row all grey | "Audio preview: DM only — not sent to players" — polite |
| Autoplay blocked | "Enable audio ▶" button replaces Play/Pause; amber treatment | "Audio blocked by browser — action required" — assertive (once) |
| Crossfading | Progress bar overlay; "Crossfading to: [name]"; Cancel button | "Crossfading to [name] over [N] seconds" — assertive (once) |
| Error | Red border; "Playback error" + retry icon | "Audio playback error" — assertive |
| Missing asset | Amber border; "Track file missing" + Locate/Remove | "Track file missing" — assertive (once) |
| Loading | Skeleton shimmer on name + timer fields; icon shown immediately | (no announcement until loaded) |

### 6.3 Soundboard pad state matrix

| State | Border | Icon | Label treatment | Interaction |
|---|---|---|---|---|
| Default | 4 px category-color left border | Category icon 24 px | Normal weight | Tappable; plays on press |
| Hover (Desktop) | Category-color all-sides | — | — | Elevation shadow |
| Focus-visible | 2 px `--color-focus-ring` | — | — | Ring visible |
| Active/pressed | 3 px border (reduced-motion) OR scale(0.95) | — | — | Playback indicator appears |
| Playing | All-sides category-color border | Pulse dot (reduced-motion: static) | — | Cancel-tap stops early (optional) |
| Empty | Dashed neutral border | "+" 24 px center | "Add sound" muted | Opens asset picker |
| Missing asset | 4 px amber border | Warning icon replaces category icon | "⚠" appended | Opens locate flow; no playback |
| Disabled (SFX muted) | Neutral border | — | 50% opacity | No playback; tooltip |

### 6.4 Player Audio Status panel

| Element | Anatomy | States | Keyboard |
|---|---|---|---|
| Panel title | "Player Audio Status" — `--text-heading-xs` | Static | `Tab` to panel |
| DM row | Indented; "You (DM)"; green/amber dot | Monitoring / blocked | (read-only) |
| Participant row | Avatar 28×28 + name + status dot + status label | Receiving (green), Blocked (amber), Error (red), Audio off (grey) | `Tab` to row |
| Nudge button | 44×44 px; "Nudge" label; only shown for blocked participants | Default, loading (after tap), sent (toast) | `Tab`; `Enter` nudges |
| Panel footer | "Players control their own volume locally." — muted helper text | Static | (read-only) |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥1024 px)

The Audio Controls widget occupies the bottom strip of the Command Center. In collapsed mode (56 px), it shows the now-playing card, transport, master volume, and Players badge side by side. Expanding the widget opens a panel above the strip (animated from bottom, 320 px height, using the standard widget expansion mechanic from `04-canvas-scene-widgets.md`). The full panel is divided into four tabs: Transport, Soundboard, Library, Automation.

```
┌──────────────────────────────────────────────────────────────────┐
│  FULL AUDIO PANEL (expanded, ~320 px height):                    │
│  [Transport] [Soundboard] [Library] [Automation]  [⌄ Collapse]  │
├──────────────────────────────────────────────────────────────────┤
│  Active tab content (see §6.1 for Transport anatomy)             │
│  Soundboard tab: 4×3 pad grid (72 px pads, 8 px gap)            │
│  Library tab: playlist tree (320 px width)                       │
│  Automation tab: trigger list                                     │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  COLLAPSED STRIP (56 px):                                        │
│  🔊 Forest Rain — Ambience ↻  [⏮][⏹][▶][⏭]  ━━●━━ 75%  ⌃      │
└──────────────────────────────────────────────────────────────────┘
```

The Soundboard tab on Desktop shows 4 columns × 3 rows = 12 pads at 72×72 px with 8 px gap; additional pads on subsequent rows (scrollable). The Library tab shows the full playlist tree within the 320 px width (same as the widget's minimum expanded width).

### 7.2 Tablet landscape (768–1024 px)

The audio widget collapses to a 52 px strip with fewer elements: now-playing (truncated to 20 chars), Play/Pause, Stop, and master volume. Expand button opens a bottom sheet (70% viewport height). Bottom sheet uses tabs: Transport | Soundboard | Library. Soundboard tab: 4×3 grid with 64 px pads, 6 px gap.

```
┌─────────────────────────────────────────────────────┐
│ BOTTOM STRIP (52 px):                               │
│  🔊 Forest Rain…  [⏹][▶/⏸]  ━━━●━━ 75%  ⌃         │
└─────────────────────────────────────────────────────┘
(after expand ⌃)
┌─────────────────────────────────────────────────────┐
│ [Transport] [Soundboard] [Library]              [⌄] │
├─────────────────────────────────────────────────────┤
│  Now playing card (full)                            │
│  [⏮][⏹][▶/⏸][⏭]  ━━━●━━━ 75%                    │
│  Channel mixer (horizontal slider row)              │
│  Amb ━━●━━ 75%   Mus ━━●━━ 60%   SFX ━━●━━ 80%   │
└─────────────────────────────────────────────────────┘
```

### 7.3 Tablet portrait (600–767 px)

Same as Tablet landscape but the strip is 52 px and the bottom sheet takes 80% viewport height to give more room. Automation tab hidden on portrait (accessible from "..." overflow). All touch targets ≥44 px.

### 7.4 Mobile (<600 px)

Single-pane focus. The audio system is a persistent bottom-drawer handle. Fully collapsed: a 44 px handle showing a speaker icon + "Ambience: Forest Rain" (18 char truncation) + ▶/⏸ toggle. Pulling the drawer up to 50% reveals the slim transport. Pulling to 80% reveals the full bottom sheet.

```
Mobile — collapsed handle (44 px):
┌─────────────────────────────┐
│  🔊 Forest Rain…   [▶/⏸]  ⌃ │
└─────────────────────────────┘

Mobile — slim transport (50% drawer height):
┌─────────────────────────────┐
│         [▲ drag handle]     │
│  🔊 Forest Rain — Ambience  │
│  ↻  ● Players 2/3          │
│  [⏹]  [▶/⏸]               │
│  🔊 ━━━━●━━━ 75%            │
└─────────────────────────────┘

Mobile — full sheet (80% height, tabs):
┌─────────────────────────────┐
│  [Audio] [Soundboard] [Lib] │
├─────────────────────────────┤
│  Now playing (full card)    │
│  Transport + volume         │
│  Channel sliders (horiz)    │
│                             │
│  (Soundboard tab: 3×4 grid) │
│  (Library tab: playlist)    │
└─────────────────────────────┘
```

Soundboard on Mobile: 3 columns × 4 rows = 12 pads at 80×80 px, 8 px gap. Swipe left reveals additional pad pages (each page = 12 pads). A page indicator (dots) appears below the grid.

Player audio controls on Mobile: accessed via speaker badge in the top status bar. Opens a bottom sheet (60% height) with local volume slider, mute toggle, and "Turn audio off" button. "Session is playing" read-only section shows current session audio.

---

## 8. Motion & feedback

All motion uses tokens from `01-visual-design-system.md`. The `prefers-reduced-motion: reduce` media query must suppress all decorative animations and replace them with instant-state alternatives.

| Interaction / element | Duration | Easing | Reduced-motion fallback |
|---|---|---|---|
| Audio widget expand/collapse | 250 ms | `ease-out` | Instant (0 ms transition) |
| Now-playing track change | 180 ms cross-fade on card content | `ease-in-out` | Instant swap |
| Soundboard pad press | 80 ms scale(0.95) | `ease-in` | No scale; border-width increase instead (no motion) |
| Soundboard pad playing indicator | 1.5 s pulsing opacity (0.6→1.0 loop) | `ease-in-out` loop | Static dot at 1.0 opacity |
| VU meter animation | 60 fps canvas/CSS update during playback | real-time | Static bars at current RMS level; update every 500 ms |
| Crossfade progress bar | Linear fill over configured duration | linear | Static percentage label, updates every 500 ms |
| Autoplay "Enable audio" button | No animation — static amber fill | — | (same) |
| Now-playing track-type icon pulse | 4 s interval, 0.85 opacity dip | `ease-in-out` | No animation; static icon |
| Player status dot update | 150 ms fade-in on color change | `ease-out` | Instant color change |
| Diagnostic strip appearance | 200 ms slide-in from below | `ease-out` | Instant appearance |
| Bottom drawer expand (Mobile) | 300 ms | `spring(stiffness: 300, damping: 30)` | Instant snap to position |

**Volume slider feedback:** Moving the slider produces immediate audio output change (no debounce on the audio engine). The numeric label debounces at 100 ms to avoid excessive label re-renders. No animation on the slider itself — it must feel instantaneous.

**Toast lifecycle:** Audio-related toasts (crossfade complete, automation triggered, delivery confirmed) use `--motion-duration-sm` (150 ms) appear animation; 4 s visible; 200 ms dismiss animation. Error toasts remain until dismissed or resolved (no auto-dismiss).

---

## 9. Accessibility requirements (surface-specific)

Beyond the global baseline in `03-accessibility.md`, the audio surface has these specific requirements:

**9.1 Audio must never be the sole channel of information.**
Every audio event (playback start, stop, pause, SFX triggered, crossfade complete) has a corresponding visible state change. This is WCAG 2.2 SC 1.3.3 (Sensory Characteristics) compliance. Specifically: a DM who is deaf or in an environment where audio cannot be monitored must still be able to confirm that the audio system is functioning correctly from the visual UI alone. The now-playing card, VU meters (reduced-motion: static bars), and per-participant delivery indicators all serve this function.

**9.2 Live-region discipline for high-frequency audio events.**
WCAG 2.2 SC 4.1.3 (Status Messages) requires that status messages not disrupt the user's current task. Audio progress (elapsed time, volume level during dragging) must NOT trigger `aria-live` announcements — only significant state changes (play/pause/stop, track change, autoplay blocked, crossfade start/complete, degradation) fire live-region updates. Volume change announcements are debounced to fire only when the user stops adjusting (800 ms silence). (This is referenced in AUDIO-008 acceptance criteria.)

**9.3 Focus management for audio modals and sheets.**
- Library drawer: focus moves to the search field on open; trap within drawer; Escape closes and returns focus to the Library button.
- Soundboard sheet (Mobile): focus moves to first pad on open; trap within sheet; Escape / close button returns focus.
- Player Audio Status panel: focus moves to first participant row on open; Escape closes and returns to "Players" badge.
- Autoplay "Enable audio" banner (player client): focus moves to "Enable audio" button on banner appearance. This is the single highest-priority focus-management case in the audio surface.

**9.4 Contrast requirements.**
- Now-playing card track name: minimum 4.5:1 against `--color-surface-elevated`.
- Channel labels and status dots: dot color alone does not convey state — text label always present alongside dot (green + "Receiving", amber + "Tap required", grey + "Audio off").
- Soundboard pad labels: minimum 4.5:1 against the pad's background. Category color is used for the left border (decorative) and for the icon, but the text label is always `--color-text-primary` on `--color-surface-card`.
- "DM monitor only" amber banner: text in `--color-text-on-warning` at minimum 4.5:1 against the amber background.

**9.5 Touch target requirements.**
All interactive elements on Tablet and Mobile profiles: ≥44×44 CSS px with ≥8 px gap between adjacent targets. Soundboard pads on Mobile: 80×80 px with 8 px gap. Volume slider thumb: 20×20 px visible, but the interactive hit area extends to a minimum 44 px diameter around the thumb center (using padding or a transparent hit-target overlay). Channel fader thumbs (Tablet): same 44 px interactive area policy.

**9.6 Keyboard-only operation.**
The complete audio surface must be operable without a pointer. Explicit shortcuts:

| Action | Shortcut (audio widget focused) |
|---|---|
| Play / Pause | `Space` |
| Stop | `S` |
| Mute master | `M` |
| Volume up ±1% | `↑` (when slider focused) |
| Volume down ±1% | `↓` (when slider focused) |
| Volume up ±10% | `Shift+↑` |
| Volume down ±10% | `Shift+↓` |
| Open Library | `L` (when widget header focused) |
| Open Soundboard | `B` (for "board", when widget header focused) |
| Trigger focused pad | `Space` or `Enter` |
| Pad config menu | `F2` or `Shift+F10` |
| Close drawer/sheet | `Escape` |

**9.7 Screen reader announcements — required live regions.**

| Trigger | Region role | Message | Frequency |
|---|---|---|---|
| Track starts playing | `aria-live="polite"` | "Now playing: [track name] on [channel]" | Per track change |
| Track pauses | `aria-live="polite"` | "Audio paused" | Per pause |
| Track stops | `aria-live="polite"` | "Audio stopped" | Per stop |
| Crossfade starts | `aria-live="assertive"` | "Crossfading to [name] over [N] seconds" | Per crossfade |
| Crossfade completes | `aria-live="polite"` | "Crossfade complete, now playing [name]" | Per crossfade |
| Autoplay blocked (DM) | `aria-live="assertive"` | "Audio blocked by browser — click Enable audio" | Once per page load block |
| Autoplay blocked (player) | `role="alert"` | "Audio is ready — tap to enable" | Once per block event |
| Player audio delivery change | `aria-live="polite"` on Players row | "[Name]: [status]" | On change, debounce 1 s |
| Audio degraded | `aria-live="polite"` | "Audio degraded — [channel] stopped" | Once per degradation |
| SFX pad triggered (keyboard) | `aria-live="polite"` | "[Pad label] playing" | Per keyboard trigger (not pointer) |

---

## 10. Anti-patterns & explicit limitations

The following are hard limits. They may not be circumvented regardless of implementation convenience or precedent in competing products.

**10.1 Audio-only information feedback.**
Audio must never be the sole channel of any informational event. No SFX-only "ding" on save, no audio-only combat start signal. Every audio cue must have a visible counterpart. *Reason: WCAG 2.2 SC 1.3.3; deaf users and users in loud environments (actual game tables) must receive information through vision. Roll20 historically used a sound effect for "player joined" with no visible notification — this is the exact anti-pattern to reject.*

**10.2 Silent autoplay failure.**
If audio cannot play due to browser autoplay policy, the app must never silently report "playing" in session state. The "playing" badge in the now-playing card and the green dot in the Players row must only appear when audio is confirmed playing via AudioContext state — not when play was requested but blocked. *Reason: Chrome's autoplay policy [13] blocks audio silently by default; a DM relying on the session UI to confirm atmosphere delivery would be wrong, breaking the core "what players hear" contract.*

**10.3 Surprise loud playback.**
Auto-play-on-activate must default to OFF per Scene. Master volume must default to 50% on first use. No audio preset may embed a volume level above 80% of the user's master. Web Audio gain nodes must be clamped to prevent clipping above the configured channel volume. *Reason: Sudden loud audio in a shared physical space (a game table) is a disruptive and trust-breaking event. This is the single most common user complaint documented in Syrinscape [9] and Foundry VTT community threads about ambient audio.*

**10.4 Infinite retry on audio failure.**
When audio fails (blocked, file missing, network error, resource limit), the system must attempt exactly one recovery (or wait for a user gesture). It must not enter a retry loop. *Reason: AUDIO-013 requires that audio failures do not block other session commands. A retry loop consuming CPU and network resources can degrade the entire session. The performance-safe failure mode from AUDIO-013 is a hard constraint.*

**10.5 Burying transport during live play.**
The play/pause/stop transport must be visible in the Audio Controls widget at all times without scroll when the widget is in its collapsed or default state. It must not be buried behind a "settings" or "details" route, and it must not disappear when another widget panel is focused. *Reason: During live play, the DM must be able to pause audio instantly — e.g., when players spontaneously change direction and the combat atmosphere would be jarring. A transport behind 2+ clicks is a hot-path failure (Principle 2, "The table is the context").*

**10.6 Player channel volume control.**
Players must not be able to adjust the DM-authored channel volumes (Ambience, Music, SFX) for the session. Only device-local master volume and mute are player-writable. *Reason: AUDIO-007 explicitly separates session audio state (DM authority) from device-local preferences (player authority). If players could change channel volumes, a player adjusting their settings would unknowingly affect everyone. This distinction is a core product design constraint.*

**10.7 Color-only encoding for audio state.**
No audio state (playing, paused, blocked, error, delivery status) may be communicated by color alone. Every color indicator (green dot = receiving, amber = blocked, red = error, grey = off) must be paired with a text label or icon. *Reason: WCAG 2.2 SC 1.4.1 (Use of Color); approximately 8% of males have red-green color deficiency, making red/green-only status indistinguishable.*

**10.8 Autoplay-on-activate as a default.**
Auto-play-on-activate must never be enabled globally or as a default. It is a per-Scene opt-in. *Reason: An atmosphere that starts the moment a Scene activates can fire at wrong moments (the DM previewing a Scene in prep, not during play). Defaulting to on would produce frequent false triggers. The correct model (borrowed from Syrinscape's manual "play mood" approach [9]) is explicit DM initiation, with automation as an advanced opt-in.*

**10.9 Streaming audio sources without declared offline behavior.**
Web stream audio sources (if supported) must declare their offline behavior before being enabled in the source configuration. Sources that have not declared offline behavior must not be playable. *Reason: AUDIO-009 and AUDIO-010 functional requirements. A stream source that silently fails offline (producing silence without an error state) violates the "no silent failure" contract and the local-first principle of the architecture.*

**10.10 Modal dialogs for audio errors during play.**
Audio errors (missing file, degraded channel, failed trigger) must never produce blocking modal dialogs during an active session. *Reason: AUDIO-013 requires that audio failures do not block other session commands. A modal blocks all interaction. Non-blocking diagnostic strips in the audio widget are the required pattern.*

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Transport discoverability | ≥90% of first-time DMs locate play/pause without assistance | First-session usability test; tree-test |
| Time to play a track from zero | ≤15 s from opening the app to first audio playback (with an existing preset) | Timed task test |
| Time to switch scene atmosphere | ≤5 s to crossfade to a new Scene preset during live play | Timed task test with 3 s crossfade |
| Autoplay-blocked recovery | 100% of autoplay-blocked states surface a user-action prompt within 1 s | Automated test with blocked AudioContext |
| Player delivery awareness | DM can identify which players are not receiving audio in ≤3 s from Command Center | Timed observation test |
| Soundboard pad response | SFX plays within 100 ms of pad press (≥95th percentile) | Performance measurement |
| Zero audio-only feedback | 0 information events communicated by audio alone | Accessibility audit |
| Contrast compliance | 0 failing color contrast checks on any audio UI element | axe-core automated scan |
| Keyboard-only session | A keyboard-only user completes: play track, set volume, trigger soundboard pad, view player status — without mouse | Keyboard-only usability test |
| Mobile background recovery | "Audio paused" state appears within 500 ms of foregrounding after background suspension; 0 infinite retry loops | Platform test on iOS Safari + Android Chrome |
| Session command responsiveness under audio failure | Combat turn advancement ≤100 ms during audio degradation event | Combined stress test |

---

## 12. Open questions & risks

**12.1 Audio source scope — web streams not yet declared.**
AUDIO-009 requires that unsupported audio providers are blocked before playback. As of this writing, web stream sources (Spotify, Soundcloud, Syrinscape Online) have not been declared as supported or unsupported in the functional requirements. *Risk: If web streams are added later, the offline behavior declaration (AUDIO-010) and licensing validation (AUDIO-011) must be designed before enabling them. This document's autoplay and degradation specs assume local file sources as the primary type. Design must be revisited before adding streams.*

**12.2 Spatial ambient sound — map-placed vs. scene-linked.**
Foundry VTT supports ambient sounds placed at coordinates on the map canvas [8] — sounds that change volume based on player token proximity. This document scopes ambient audio to Scene-level presets (not positional). If positional audio is added, the channel mixer model, the soundboard, and the "what players hear" indicator will all need revision. *Decision needed: is positional audio in scope for v2?*

**12.3 Crossfade implementation on Web Audio API.**
Crossfade across two AudioBuffer sources requires careful gain scheduling (GainNode.linearRampToValueAtTime). On mobile, the AudioContext must remain unsuspended for the entire crossfade duration. *Risk: Background suspension during a crossfade (Mobile) could produce a partial fade — players hear a sudden cut. The background suspension spec (UX-AUDIO-013) partially addresses this, but the exact recovery behavior during an in-flight crossfade is not specified here.*

**12.4 Per-participant audio delivery confirmation.**
Session state sync (AUDIO-003) propagates what the DM is playing. Confirming that a specific player device is actually playing that track (vs. receiving the state change) requires either a round-trip acknowledgment from the player client or a heartbeat. The latency and reliability of this confirmation affects the "Players" delivery indicator accuracy. *Risk: If the confirmation round-trip takes > 2 s, the DM's delivery indicator lags. This must be designed in the sync layer (outside this document) before the Players row spec (UX-AUDIO-008) can be fully implemented.*

**12.5 Soundboard pad count and organization at scale.**
The spec defines a 12-pad default grid. DMs with large sound libraries may need 50+ pads. The current design handles overflow via swipe-to-page (Mobile) and scroll (Desktop). *Risk: Beyond 3 pages (36 pads), discoverability degrades. A tag-filter or category-filter system above the grid may be needed. This is deferred to a post-v2 iteration unless user testing shows it is blocking.*

**12.6 Foundry VTT and Syrinscape interoperability.**
Some DMs already maintain Syrinscape accounts or Foundry VTT audio libraries. Importing audio metadata or presets from those systems is not addressed in the functional requirements. *Not in scope for v2 per the "explicitly out of scope" list in `00-vision-brief.md` (no third-party integrations). Flag for post-v2.*

---

## Sources

[1] "Icon Usability" — Nielsen Norman Group — https://www.nngroup.com/articles/icon-usability/

[2] "What's Playing" design — Spotify Design — https://spotify.design/article/building-the-future-of-our-design-system

[3] "Apple Music for Artists — Media Player Controls" — Apple Human Interface Guidelines — https://developer.apple.com/design/human-interface-guidelines/playing-audio

[4] "OBS Studio Audio Mixer / Sources Guide" — OBS Project Wiki — https://obsproject.com/wiki/Sources-Guide#audio-sources

[5] "Audio Effects Devices" — Ableton Reference Manual v11 — https://www.ableton.com/en/manual/audio-effects/

[6] "djay Pro 5 — Features" — Algoriddim — https://www.algoriddim.com/djay-pro

[7] "Stream Deck Software" — Elgato — https://www.elgato.com/en/downloads

[8] "Playlists — Foundry VTT Knowledge Base" — Foundry Gaming LLC — https://foundryvtt.com/article/playlists/

[9] "How Syrinscape Works — SoundSets and Moods" — Syrinscape — https://syrinscape.com/how-it-works/

[10] "Roll20 Jukebox" — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037258634-Jukebox

[11] "Battlebards — TTRPG Soundscape Platform" — Battlebards Inc — https://battlebards.com

[12] "Ambient Mixer — Create Your Atmosphere" — Ambient-Mixer — https://www.ambient-mixer.com

[13] "Autoplay policy in Chrome" — Chrome Developers — https://developer.chrome.com/blog/autoplay/

[14] "Handling Autoplay in Safari" — WebKit / Apple Developer — https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/

[15] "Web Audio API — AudioContext" — MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/API/AudioContext

[16] "Autoplay guide for media and Web Audio APIs" — MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide

[17] "Media Session API" — MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
