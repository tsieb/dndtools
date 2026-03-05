# Initiative 4 — Session-Time Command Center

## Status: COMPLETED

**Outcome:** DND Tools is the best possible tool to have open at the table during a live
game session. Information is instant, action is one keystroke away, and the DM never
loses the thread.

---

## Epic 4.1 — Live Session Dashboard (Boards 2.0)

**Goal:** Session boards are a true DM command center: configurable, content-rich, and
responsive to the shape of the current scene.

**Stories:**

- **S4.1.1 — Board template system for common session layouts**
  Define 3–5 built-in board templates: "Combat Scene", "NPC Encounter", "Exploration",
  "Town Visit". Each pre-configures tile types and sizes for that scenario. Users can
  save custom layouts as personal templates. Templates are stored in `settings.json`
  under `boardTemplates`.

- **S4.1.2 — Live note content preview in tiles**
  Tiles can render the first N lines of a linked note in real time, not just the title.
  The render is the same pipeline as the note reading view (markdown + object embeds).
  Tiles with live preview have a configurable "depth" (title-only → summary → full).

- **S4.1.3 — Pinnable quick-access overlay**
  A global `Ctrl+Shift+B` shortcut opens a floating "session quick panel" showing the
  current active board tiles as a compact overlay over any route. Useful when reading
  a note and needing quick access to the initiative tracker or NPC list without
  navigating away.

- **S4.1.4 — Session timer and countdown widget tile**
  Add a timer tile type with: elapsed session time, optional countdown (to end of
  combat round, session end), lap markers, and a minimal "just the clock" display mode.
  Timer state persists across tab focus changes and navigation.

---

## Epic 4.2 — Combat Tracker & Initiative Management

**Goal:** Initiative order is tracked with zero friction, HP and conditions are live, and
encounter results flow directly into vault notes.

**Stories:**

- **S4.2.1 — Initiative tracker with drag-reorder and tie-breaking**
  Add a combat tracker panel (available as a board tile or standalone route). Supports:
  add combatant by name or linked stat block, set initiative, drag to reorder ties,
  advance turn, and mark ready/delay. Keyboard-first: `n` for next turn, `a` for add.

- **S4.2.2 — HP and condition tracking per combatant**
  Each combatant row shows current/max HP with fast +/- controls, a condition tag list
  (Poisoned, Frightened, etc.), concentration indicator, and death save tracking for
  player characters. Conditions are drawn from a campaign-system-aware list (5e first).

- **S4.2.3 — Linked stat block embed per combatant**
  Each combatant entry can be linked to a vault object (stat_block or character). The
  row shows a collapsed stat block preview. One click expands full stats inline. Max AC
  and initiative modifier are auto-populated from the linked object.

- **S4.2.4 — Encounter result capture → note creation**
  At encounter end, offer a one-click "Save Encounter Log" that creates a new note
  from a template: combatants, round count, outcome summary (who fell, who fled, total
  damage dealt), and loot rolled. Links the note to participating PC and NPC objects.

---

## Epic 4.3 — Quick Reference System

**Goal:** Any NPC, location, item, or rule can be found and previewed within two
keystrokes from anywhere in the app.

**Stories:**

- **S4.3.1 — Command palette entity lookup with inline preview**
  Extend the command palette (`Ctrl+P`) with an "entity" search mode triggered by
  typing `@`. Results show object type icon, name, key stats (AC/HP for monsters,
  type for locations), and a thumbnail of the note content. `Enter` navigates;
  `Ctrl+Enter` opens in a split view without leaving current context.

- **S4.3.2 — Hover cards for wikilinks in reading view**
  Hovering a `[[wikilink]]` in reading view shows a popover with: note title, first 3
  lines of content, and object-type-specific key stats if the note is object-backed.
  The popover is keyboard-triggerable (`Tab` + `Space` on focused links). Debounced to
  avoid flickering during fast cursor movement.

- **S4.3.3 — Session context panel (pinned active entities)**
  A collapsible panel in the sidebar (or as a board tile) showing pinned "session
  context" items: active NPCs, current location, active quest, party roster. These are
  manually pinned by the DM at session start. Context panel is persisted in the active
  session board and restored on next open.

- **S4.3.4 — Global hotkey for quick reference overlay**
  `Ctrl+Shift+Space` opens a floating, dismissible quick reference overlay — like a
  HUD. It shows the session context panel and search in a compact format. Designed for
  use when sharing screen or when the main window is in focus reading mode.

---

## Epic 4.4 — Dice Engine & Roll History

**Goal:** Dice rolling is native to the app, expression-complete, and integrated into
the note-writing workflow so roll results are capturable in session notes.

**Stories:**

- **S4.4.1 — Dice expression parser and roller**
  Implement a dice expression evaluator supporting: `1d20+5`, `2d6`, `4d6kh3`
  (keep highest), `adv` and `dis` (advantage/disadvantage shorthand), and inline
  arithmetic. The parser is pure TypeScript, fully tested, and usable in both UI and
  MCP tools.

- **S4.4.2 — Dice tray panel with roll history**
  Add a dice tray panel (accessible as a board tile, sidebar panel, or `Ctrl+D`
  shortcut) with: expression input, roll button, result with individual dice values
  shown, and a session roll history log. History is session-scoped and can be cleared.

- **S4.4.3 — Dice roll insert into editor**
  In the editor, typing `/roll 1d20+5` or using the insert menu evaluates the expression
  and inserts the result as a formatted markdown line: `> 🎲 1d20+5 = **17** (12 + 5)`.
  The insert is undoable.

- **S4.4.4 — Roll macros for frequent expressions**
  Users define named macros (e.g., "Sneak Attack", "Fireball Save") with a label and
  expression. Macros appear in the dice tray quick-access row and the command palette.
  Macros are stored per-vault in `settings.json` and accessible via MCP.

---

## Epic 4.5 — Campaign Timeline & Progress Tracking

**Goal:** The campaign arc is visible as a structured timeline. DMs can track what has
happened, what is in motion, and what is at risk of being forgotten.

**Stories:**

- **S4.5.1 — Timeline object type and chronological view**
  Add `timeline_event` as a fully realized object type with fields: date (in-world
  calendar), title, description, participants (linked objects), and arc tag. A
  `/timeline` route renders events in chronological order with filter by arc/participant.

- **S4.5.2 — Session log entries with timeline linkage**
  Each session note can be linked to a timeline event (or auto-creates one on save).
  The timeline view shows session log entries inline with world events, giving a dual
  track: what happened in the world vs. what the players discovered in each session.

- **S4.5.3 — "Open threads" tracking**
  A derived view that lists all active quests, NPCs with unresolved status, and
  timeline events marked "pending resolution". Updated from object and note state
  automatically. Available as an MCP tool (`get_open_threads`) and in the sidebar.

---

## Epic 4.6 — Player-Facing View Mode

**Goal:** Players have a first-class view of the content the DM has shared with them,
including their character sheet and session notes, without seeing DM-private content.

**Stories:**

- **S4.6.1 — Content visibility tagging**
  Add a `visibility` field to notes and objects with values `dm_only`, `shared`,
  `public`. DM-only notes are filtered from player view entirely. This is the
  permission primitive for both local player view and future collaborative sharing.

- **S4.6.2 — Player reading mode**
  A `/player` route shows only `shared` and `public` content. Navigation, search, and
  backlinks all operate within the visible content boundary. The mode is toggled from
  the command palette or toolbar and persists across route changes.

- **S4.6.3 — Player character sheet view**
  When a note is backed by a `character` object and visibility is `shared`, the player
  can view a formatted character sheet. DM notes within the object (`dmNotes` field)
  are hidden in player view. The character sheet is printable via CSS print media query.

---

## Epic 4.7 — Random Generation Suite

**Goal:** Every random-generation need a DM faces during prep or live play — names,
encounters, loot, weather, rumors, NPC personalities, dungeon rooms — is built into
the app, vault-context-aware, and immediately actionable.

**Stories:**

- **S4.7.1 — Custom random table authoring and vault storage**
  Define a `RandomTable` format: a markdown note with a special code fence containing
  weighted rows. Tables can reference other tables by name for nested rolls (e.g.,
  a `loot` table that rolls on `weapons` or `valuables`). Tables are stored as vault
  notes, tagged `random-table`, and indexed for instant lookup. The `roll_table(name)`
  MCP tool rolls any table in the vault.

- **S4.7.2 — Built-in D&D 5e table library**
  Ship a bundled library of SRD-compliant random tables: encounter tables by CR and
  terrain (dungeon, wilderness, urban), NPC personality trait / bond / flaw / ideal
  matrices, treasure hoards by CR tier, weather by climate, dungeon room contents,
  and tavern name generators. These tables live in a read-only system folder and can
  be copied into the vault for customization.

- **S4.7.3 — Vault-context-aware generation**
  When rolling on faction affiliation, NPC names, or location names, the generator
  first checks the vault for existing entries and weights them higher. New NPC names
  are checked against the existing NPC roster to prevent duplicates. Location generators
  use the active map region's cultural setting if defined. Context injection is
  computed algorithmically from the link graph, not AI.

- **S4.7.4 — Roll-table insert block in editor**
  In the editor, typing `/table [tableName]` or using the insert menu inserts a roll
  block: `{{roll: TableName}}`. In reading view, the block renders as a clickable die
  icon that rolls the table and displays the result inline. Multiple rolls show a
  history of results below the block. Results can be "accepted" to replace the block
  with the rolled text.

- **S4.7.5 — Dice macro quick-bar and NPC generator panel**
  Add a "Generator" panel accessible as a session board tile or `Ctrl+G` shortcut.
  Shows a tabbed interface: Dice Macros (quick-roll saved expressions), Tables (browse
  and roll any vault table), NPC Quick (generate name + trait + motivation in one
  click with campaign context). Generated NPCs are offered as draft character objects
  for immediate vault creation.

---

## Epic 4.8 — Handout & Digital Prop System

**Goal:** DMs can create, store, and deliver digital handouts to connected players
during a session — written letters, decoded ciphers, map fragments, rumors, and
images. Handouts are vault objects with their own lifecycle and delivery tracking.

**Stories:**

- **S4.8.1 — Handout object type and library**
  Add `handout` as a structured object type with fields: title, content (markdown),
  type (letter, map_fragment, image, cipher, rumor, document), source NPC or location
  reference, and `delivered` flag. Handouts are stored in `.vault/objects.json` and
  displayed in a Settings → Handouts library with filter by type, status, and campaign
  session. The handout list is accessible as a session board tile.

- **S4.8.2 — Handout creator with visual aging effects**
  Add a handout creation workflow in the command palette and toolbar. For text
  handouts, offer visual presentation options: parchment texture, torn-edge border,
  blood stain, burned edge, and ink blot overlays applied via CSS filters. The visual
  style is previewed in the creator before saving. Handout HTML is exportable as a
  self-contained printable document.

- **S4.8.3 — Session delivery and reveal**
  DM right-clicks any handout in the library and selects "Deliver to players". In a
  connected session, the handout appears on all player devices with an animated reveal
  (roll-out scroll, letter unfold). In disconnected mode, the handout is marked
  `delivered` and the DM is prompted to physically hand it to the player. Delivered
  handouts are visible in the player's handout inbox permanently.

- **S4.8.4 — Cipher and decoded handout workflow**
  For cipher handouts, store both encrypted (what players see first) and decoded (what
  the DM reveals when players crack it) text. The DM can reveal the decoded version
  at any time. Cipher handouts show a lock icon in the player inbox until decoded.
  Add a simple substitution cipher generator with key stored in the handout metadata.

---

## Epic 4.9 — Advanced Encounter Builder

**Goal:** The DM can construct, balance, and document encounters directly in the app
using vault stat blocks, party composition, and CR math — without leaving the session
context.

**Stories:**

- **S4.9.1 — Encounter composition UI with CR budget**
  Add an encounter builder panel (route `/encounter/new` and board tile). The DM adds
  combatants by searching vault stat blocks, specifying count per type. The panel
  computes XP budget using D&D 5e encounter difficulty math (easy/medium/hard/deadly
  thresholds for the current party), updates in real time as combatants are added,
  and shows a visual difficulty meter. Party composition is read from linked character
  objects.

- **S4.9.2 — Environment and terrain integration**
  Each encounter has an optional environment field linked to a map or location note.
  Environment type (forest, dungeon, urban, water, aerial) adjusts encounter
  modifiers (difficult terrain, visibility, lair action availability). The builder
  surfaces relevant tactical considerations as checklist items based on environment.
  Linking to a map note auto-populates the environment type from the map's metadata.

- **S4.9.3 — Legendary action and lair action tracking**
  Encounters using legendary creatures display the legendary action tracker below the
  initiative order: charges remaining (reset on the creature's turn start), each action
  as a named button with cost. Lair actions are listed with their initiative count (20)
  and fire on that count automatically. Both are linked to the stat block object and
  editable inline during play.

- **S4.9.4 — Encounter log and vault note creation**
  At encounter end, capture: combatants with HP delta, rounds elapsed, conditions
  applied, notable rolls (crits, death saves), outcome. Create a vault note from a
  template: encounter summary with linked stat block and character objects, loot
  from the CR-appropriate treasure table, and XP awards per participant. The note
  is linked to the active session timeline event.

---

---
