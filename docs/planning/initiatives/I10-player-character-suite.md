# Initiative 10 — Player Character Suite

**Outcome:** Players have a complete, first-class character management experience.
Every mechanical element of a D&D 5e character is tracked, managed, and accessible
from any device. The player character suite works offline, syncs seamlessly when
connected, and is beautiful enough that players prefer it over paper.

**Why this matters:** The current app is DM-centric. For DND Tools to be the
definitive TTRPG companion — for running _and_ playing — players need a complete
toolkit, not just a read-only view of the DM's content.

---

## Epic 10.1 — Complete D&D 5e Character Sheet

**Goal:** Every field in the official D&D 5e character sheet is represented in a
clean, fast-to-navigate digital form. Stats, saves, skills, equipment, features,
personality, and backstory are all first-class.

**Stories:**

- **S10.1.1 — Core stats, saves, and skills form**
  Expand the `character` object schema to include all ability scores, their modifiers
  (auto-computed), saving throw proficiency checkboxes, skill proficiency/expertise
  checkboxes, and passive perception/investigation/insight. Proficiency bonus
  auto-computes from level. All modifier values display the computed total next to
  the override input. The structured editor for characters renders this as a
  two-column layout matching familiar character sheet mental models.

- **S10.1.2 — HP, AC, speed, initiative, and combat stats**
  Add to the character object: max HP (manual), current HP (tracked per session),
  temp HP, AC (manual or auto from equipped armor), speed, initiative (modifier +
  custom bonus), hit dice type, proficiency bonus, and inspiration flag. HP changes
  during combat are tracked in session-state, not the vault object, so the object
  always stores the character's "at full rest" state and current HP is a session
  overlay.

- **S10.1.3 — Equipment, currency, and encumbrance**
  Add an equipment list with: item name, quantity, weight, equipped toggle, and
  linked vault object if the item is a known vault item. Currency tracks CP, SP,
  EP, GP, PP. Total carried weight auto-computes with encumbrance threshold
  indicators (based on Strength × 15). Equipment can be added from the vault item
  compendium or created inline. Items marked equipped contribute to AC calculation
  if armor type is defined.

- **S10.1.4 — Features, traits, background, and personality**
  Add character sections: racial traits (linked to race reference), class features
  by level (with "gained at level" metadata), background feature, personality traits,
  ideal, bond, flaw, and appearance. Each section is collapsible. Features can be
  linked to rule reference notes in the vault (e.g., a "Second Wind" feature links
  to the fighter feature note). The character sheet is printable via CSS print media
  query with a clean single-page layout.

---

## Epic 10.2 — Spell Slot, Resource & Ability Tracking

**Goal:** Every expendable resource — spell slots, ki points, sorcery points, bardic
inspiration, channel divinity, rages — is tracked per session with one-tap spend
and automatic recovery on rest.

**Stories:**

- **S10.2.1 — Spell slot grid with use tracking**
  Add a spell slot tracker to the character session overlay: grid of slots by level
  (1–9) showing filled/empty pips. Tap/click a pip to expend a slot (confirm on
  mobile). Long rest restores all slots; short rest offers warlock slot recovery.
  The tracker state is session-scoped (not persisted to vault) unless the DM marks
  session end, at which point full rest recovery is offered.

- **S10.2.2 — Prepared spells list with description lookup**
  Characters have a prepared spell list: spells are added from the vault compendium
  (Open5e integration from I8.4.1). Each spell shows level, casting time, range,
  duration, and a collapsible full description. Spells can be sorted by level,
  school, or alphabetically. Concentration spells show a concentration indicator.
  Casting a spell from the list decrements the appropriate slot level.

- **S10.2.3 — Class resource trackers**
  Define class resource types in the D&D 5e campaign system module: ki (Monk), rage
  (Barbarian), bardic inspiration (Bard), channel divinity (Cleric/Paladin),
  sorcery points (Sorcerer), superiority dice (Fighter), sneak attack (Rogue —
  tracks per-turn use), wild shape (Druid). Each resource shows current/max with
  spend/recover buttons. Max values auto-update on level-up. Custom resources can
  be added for homebrew classes.

- **S10.2.4 — Rest recovery workflow**
  Short rest: DM or player triggers short rest in the session panel. Each player's
  character is offered hit dice to spend (roll or accept average). Class resources
  that recover on short rest are restored. Long rest: all HP, spell slots, and long-
  rest resources restore fully. Exhaustion reduces by one level. The rest workflow
  appears as a quick-action in the session board and logs the event in the session
  timeline.

- **S10.2.5 — Concentration and death save tracking**
  Concentration tracker: when a concentration spell is cast, a persistent banner
  shows the spell name with a dismiss button. When the character takes damage, a
  prompt asks for the concentration save result (pass/fail). Fail dismisses the spell.
  Death saves: three checkboxes for successes and failures. Third success marks
  character as stable; third failure marks as dead. Both states broadcast to the
  DM's party overview panel.

---

## Epic 10.3 — Character Advancement & Downtime

**Goal:** Leveling up and downtime activities are guided workflows, not blank forms.
The app walks players through every choice at level-up and tracks downtime activity
between sessions.

**Stories:**

- **S10.3.1 — Guided level-up workflow**
  When a player marks their character as ready to level up, a step-by-step wizard
  walks through: new HP (roll or take average, show both options with proficiency
  bonus added), new class features unlocked at this level (displayed with
  descriptions), ASI or feat selection (if applicable at this level), new spell
  slots (for spellcasters), and any resource max increases. Each choice is logged
  to the character's advancement history. The wizard can be exited and resumed.

- **S10.3.2 — XP and milestone advancement modes**
  Settings → Character → Advancement Mode: XP or Milestone. In XP mode, the DM
  awards XP from the encounter log (auto-populated from encounter builder). The
  character sheet shows current XP, XP to next level, and a progress bar. When
  XP threshold is reached, a "Level up available" badge appears. In milestone mode,
  the DM manually triggers level-up for all characters simultaneously.

- **S10.3.3 — Downtime activity tracker**
  Add a downtime tracker to the character sheet: list of activities with type
  (Crafting, Research, Training, Relaxation, Work, etc.), days spent, gold cost,
  and outcome notes. The DM can award downtime days at session end. Downtime
  activities can reference vault notes (e.g., a Training activity linked to a
  trainer NPC note). The downtime log is part of the character's campaign history.

- **S10.3.4 — Character history and session log**
  Every level-up, rest, significant combat, and downtime activity is logged to the
  character's personal history timeline. The history view shows a chronological
  feed of entries with in-world dates (if calendar is configured). History is
  searchable and can be exported as a markdown character journal. The most recent
  history entries are surfaced in the between-session player inbox.

---

## Epic 10.4 — Party Coordination Panel

**Goal:** The DM and all connected players share a live party overview showing
health, resources, conditions, and coordination state. Information flows both
directions without requiring verbal communication during the session.

**Stories:**

- **S10.4.1 — Live party HP and status overview**
  The party panel (accessible as a session board tile, board overlay, and bottom
  sheet on mobile) shows all connected players' characters: portrait, name, class,
  current/max HP as a color-gradient bar, active conditions as icon chips, and
  concentration spell if active. The DM sees all characters. Players see all
  characters. HP changes propagate via the real-time session channel within 500ms.

- **S10.4.2 — Shared party inventory and encumbrance**
  A "party stash" inventory is accessible to all connected participants: shared loot
  not yet divided, quest items, and communal supplies. Items are added from the
  encounter loot log or manually. Any player can move items from the party stash to
  their personal equipment. Encumbrance for the stash is computed using the
  strongest character's carry limit as a baseline.

- **S10.4.3 — Spell slot and resource summary for spellcasters**
  The party panel includes a collapsed "Spellcaster Resources" section showing each
  spellcaster's slot availability (filled/empty pips by level, abbreviated). This
  allows tactical decision-making at a glance: "does the Cleric still have 3rd-level
  slots?". Non-spellcasters see their primary resource (ki, rages). The section is
  collapsible and hidden by default on mobile.

- **S10.4.4 — Marching order and travel formation**
  Add a marching order editor to the party panel: drag player avatars into a 2-column
  travel formation (front, middle, back). The order persists for the session and is
  broadcast to all players. The DM can reference marching order for ambush/surprise
  rules. The formation layout is included in the encounter builder context when
  initiating an ambush encounter.

---

## Epic 10.5 — Player Session Journal & Private Notes

**Goal:** Every player has a private, DM-invisible note space for their own session
observations, NPC impressions, theory-crafting, and personal quest tracking. Player
notes are first-class vault content with the same rich markdown and linking features.

**Stories:**

- **S10.5.1 — Player private vault**
  When the app is used in player mode (or when a character is owned by a non-DM
  user in a collaborative vault), notes created in the player's private space are
  stored locally only — never synced to the DM's vault and never visible via MCP.
  The private vault is a separate IndexedDB database (or separate folder in
  filesystem mode) keyed by character ID. It uses the full `StorageAdapter` interface.

- **S10.5.2 — Session bookmarks and NPC impressions log**
  Players can bookmark any revealed note during a session with a personal annotation.
  A dedicated "NPC Impressions" section lets players record their character's
  opinion of each NPC they've met — separate from the DM's NPC notes. The impressions
  list is sorted by most recently interacted. Each impression links to the shared
  NPC note. Impressions are private by default; players can share individual
  impressions with the DM.

- **S10.5.3 — Personal quest and goal tracker**
  Each player character can maintain a personal quest list (separate from the DM's
  quest objects): personal goals, secrets, character arc objectives. Each item has
  status (active / completed / failed / abandoned) and optional linked notes. Goals
  can reference shared vault notes via wikilinks. The MCP `get_open_threads` tool
  can optionally include the player's personal quest items if the player grants
  access.

- **S10.5.4 — Session highlight and quote capture**
  During a session, players can quickly capture highlights: "great RP moment",
  "memorable quote", "tactical success", "funny mishap". Each highlight has a
  timestamp and optional in-world date. At session end, all players' highlights
  are compiled into a shared "Session Highlights" note (visible to all) that
  supplements the DM's recap. The DM can pin a highlight to the session timeline.

---

---
