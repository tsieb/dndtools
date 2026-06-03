## CONTENT - Notes, Editor, Templates, Snippets

Capability tree:

- Notes and editor: `CONTENT-001`, `CONTENT-002`
- Templates and snippets: `CONTENT-003`, `CONTENT-004`
- Structured objects and wikilinks: `CONTENT-005`, `CONTENT-006`, `CONTENT-013`
- Import/export: `CONTENT-007`, `CONTENT-008`
- Visibility and embeds: `CONTENT-009`, `CONTENT-010`
- Calendar/custom time content: `CONTENT-011`
- Source-specific constraints: `CONTENT-012`

### CONTENT-001
**Statement:** A DM or authorized editor shall be able to create, read, update, delete, restore, and search markdown notes as the primary content unit of the vault.
**Source:** Glossary "Note"; Project Overview scope.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the user creates a note offline, when saved, then the note is durable locally and queued for sync if a remote source is configured.
- Given an authorized editor reads, updates, deletes, restores, and searches the same note, when each command completes, then the visible note revision, tombstone/restore state, and search index reflect the accepted command.
- Given a player lacks visibility to a note, when they search or request it, then no note content is returned.
- Given an authorized editor deletes and restores a note, when graph/search indexes refresh, then links and search results reflect the restored revision without exposing hidden prior content.
- Given two authorized editors update the same note section concurrently, when sync reconciles, then a section-aware merge or durable conflict record is produced.

### CONTENT-002
**Statement:** An authorized editor shall be able to edit markdown with visible save status, validation feedback, preview, wikilink assistance, and recoverable failure states.
**Source:** UX Guidelines Editing; Feature Inventory I3.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an editor is open, when save succeeds, then save status reports success and the note revision updates.
- Given auto-save fails, when the error occurs, then the editor keeps unsaved content and shows actionable retry guidance.

### CONTENT-003
**Statement:** An authorized editor shall be able to create content from templates with variables, starter presets, and validation before writing generated content.
**Source:** Feature Inventory I3 templates; UX Guidelines.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a template with required variables, when the user omits one, then creation is blocked with a validation message.
- Given a template writes a note in player-visible space, when created, then visibility metadata is explicitly set or defaults to `dm-only`.

### CONTENT-004
**Statement:** An authorized editor shall be able to insert, manage, and reuse snippets without snippets bypassing note validation, visibility metadata, or markdown sanitization.
**Source:** Feature Inventory I3 snippets; Security markdown rendering.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a snippet contains markdown, when inserted, then it is saved as note content and rendered through the unified markdown pipeline.
- Given a snippet contains disallowed raw HTML or script-like content, when rendered, then sanitization removes unsafe output.

### CONTENT-005
**Statement:** The DM shall be able to create and edit structured Vault Objects as note-backed records with schema-validated frontmatter and markdown body synchronization.
**Source:** Glossary "Vault Object"; Feature Inventory I3.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a stat block object is edited, when saved, then frontmatter and object projection validate against the object schema.
- Given object validation fails, when save is attempted, then no invalid object revision is committed.

### CONTENT-006
**Statement:** An authorized editor shall be able to create, resolve, rename, and repair wikilinks across local, Obsidian, and Google Docs sourced notes while preserving source conventions.
**Source:** Glossary "Wikilink"; Obsidian internal links; Feature Inventory I3.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a note contains `[[Location#Section]]`, when indexed, then the graph resolves the target note and section where available.
- Given a Google Docs source cannot preserve a wikilink exactly, when syncing, then the adapter records the mapping limitation and avoids destructive rewrite.
- Given the linked source is unavailable and not cached, when repair is requested offline, then the editor sees a source-unavailable diagnostic rather than a destructive rewrite.

### CONTENT-007
**Statement:** The DM shall be able to import local markdown archives and Obsidian vault content with preview, conflict policy selection, resumable progress, and preservation of properties, aliases, tags, and links.
**Source:** Feature Inventory I3 import; Obsidian properties/internal links.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an Obsidian vault import, when preview runs, then conflicts and unsupported metadata are listed before any write.
- Given import is interrupted, when resumed, then already completed safe writes are not duplicated.

### CONTENT-008
**Statement:** The DM shall be able to export a vault or selected content as portable markdown plus validation report without including device-local secrets, absolute paths, or hidden player-inaccessible data unless explicitly exporting as DM backup.
**Source:** Feature Inventory I3 export; Architecture Contract 2 cloud/device-local model.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given export runs for sharing with players, when the package is generated, then DM-only fields and device-local secrets are absent.
- Given export runs for DM backup, when the package is generated, then it includes all selected content plus a validation report.

### CONTENT-009
**Statement:** The DM shall be able to author visibility at entity, section, and field granularity for notes and structured objects, with defaults set to `dm-only`.
**Source:** Architecture Contract 3 Visibility; Vision Visibility vs Permission.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a note with a `player-visible` entity default and one `dm-only` section, when a player reads it, then the section is omitted.
- Given no visibility metadata exists, when a non-DM queries the note, then it is treated as `dm-only`.
- Given a note section is `shared` with Player A through a viewer-capable grant, when Player A and Player B query the note, then only Player A receives that section.
- Given a player has a write grant on a hidden section, when consistency checks run, then the DM sees a visibility/permission consistency error and the player still cannot read or write that section.

### CONTENT-010
**Statement:** An authorized editor shall be able to embed object cards, note sections, and entity render blocks in note content, and add entity-backed widgets to Scenes, without cloning target entity data into the embedding source.
**Source:** Glossary "Embed"; Architecture Contract 4 Embed Rules.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a note embeds a character card, when the character changes, then the rendered embed reflects the current visible character data.
- Given the target entity is hidden from the actor, when the embed renders, then it shows a non-leaking hidden or unavailable placeholder.
- Given a note references a Scene widget instance, when validation runs, then the note stores only a link or embed reference and does not persist a widget instance outside a Scene.

### CONTENT-011
**Statement:** An authorized editor shall be able to create calendar-aware notes and structured objects with custom-date fields, timeline references, and stable display formatting.
**Source:** Feature Inventory I3 custom world calendar; Glossary "Calendar / Custom Time".
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a note has a custom calendar date in frontmatter, when rendered in note, graph, search, and session recap surfaces, then the formatted date is consistent.
- Given a player cannot see a dated note, when calendar or timeline views load, then that event is omitted or generalized according to visibility policy.

### CONTENT-012
**Statement:** Source-specific note constraints for local markdown, Obsidian, and Google Docs shall be visible before writes that could lose formatting, properties, links, or unsupported embedded structures.
**Source:** Architecture Contract 2 Sync Source Contract; Obsidian and Google Docs rules.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an editor writes content that Google Docs cannot round-trip exactly, when save is requested, then the adapter reports formatting-loss risk before destructive write-back.
- Given an Obsidian note has user-authored frontmatter, when DND Tools metadata is updated, then user properties remain intact and DND Tools metadata remains namespaced.
- Given source-local capabilities are unavailable on the current platform, when a write is requested, then the source adapter reports unsupported status without losing local draft content.

### CONTENT-013
**Statement:** The core Vault Object schema set shall cover initial v2 subtypes for note, character, map, handout, calendar event, timeline event, dice table, encounter, audio preset, and widget package references while keeping Scene state in `SceneState`.
**Source:** Glossary "Vault Object"; Feature Inventory I3/I4/I9/I10/I11/I16; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a core object subtype is created or imported, when validation runs, then subtype schema, required fields, visibility defaults, source metadata, and revision metadata are enforced.
- Given an unknown object subtype is encountered, when parsing source content, then it is preserved as unsupported/opaque content or rejected with a structured diagnostic rather than partially interpreted.
- Given object cards or widgets render a subtype for a player, when actor-filtered projection runs, then hidden fields, hidden relationships, and revealing schema metadata are omitted.
- Given a Scene is saved, when object schema validation runs, then the Scene is validated through `SceneState` rules rather than treated as a note-backed Vault Object subtype.
