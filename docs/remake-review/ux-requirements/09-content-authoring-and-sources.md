# UX Requirements — Content Authoring & Sources

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `CONTENT-001..013`
> **Owner surface(s):** Note / Markdown Editor · Frontmatter & Object Form Panel · Wikilink
> Workflow (create, rename, repair, backlinks) · Template & Snippet Library · Source-of-Truth
> Indicator & Import/Export Wizard · Content Visibility Authoring · Embed Authoring

---

## 1. Scope

- **Covers:** Every surface where DMs and authorized editors author, structure, import, and
  organize content within the vault: the full-featured markdown/rich-text note editor (toolbar,
  insert menu, split-pane preview, autosave, focus/distraction-free mode, keyboard shortcuts);
  structured frontmatter and Vault Object forms (metadata editing, schema validation feedback,
  history/revert); wikilink authoring (autocomplete, batch create, rename propagation,
  disambiguation, backlinks panel); the template and snippet library (create from preset,
  insert snippet, session recap scaffold); the source-of-truth experience for each note
  (local markdown vault, Obsidian vault sync, Google Docs sync) including source indicators,
  source-status badges, pre-write constraint diagnostics, and the import/export wizard
  (conflict preview table, policy selection, resumable progress); content visibility authoring
  (marking entities/sections/fields as `dm-only` / `player-visible` / `shared`) and embed
  authoring (placing object-card, note-section, and render-block embeds into note bodies and
  canvas widgets).

- **Does NOT cover:**
  - Live multi-user co-editing presence cursors and awareness indicators → `11-collaboration-permissions.md`
  - Sync-engine status panel, merge-conflict resolution UI, offline queue, and CRDTs → `12-sync-offline-reliability.md`
  - Graph visualization, search result surfaces, and backlink explorer in the graph view → `10-graph-search-discovery.md`
  - Permission-grant assignment UI (who gets `section-editor` or `contributor`) → `11-collaboration-permissions.md`
  - Canvas Scene layout and widget placement → `04-canvas-scene-widgets.md`
  - Map authoring → `06-maps.md`

- **Related functional requirements** (`../requirements/06-content.md`):
  - `CONTENT-001` — CRUD + restore + search of markdown notes as primary vault unit
  - `CONTENT-002` — Markdown editing with save status, validation, preview, wikilink assist
  - `CONTENT-003` — Create content from templates with variables, presets, validation
  - `CONTENT-004` — Insert/manage/reuse snippets without bypassing validation or visibility
  - `CONTENT-005` — Create/edit structured Vault Objects with schema-validated frontmatter
  - `CONTENT-006` — Create, resolve, rename, and repair wikilinks across all three sources
  - `CONTENT-007` — Import markdown archives and Obsidian vault content with preview + conflict policy
  - `CONTENT-008` — Export vault/selected content as portable markdown with validation report
  - `CONTENT-009` — Author visibility at entity/section/field granularity; default `dm-only`
  - `CONTENT-010` — Embed object cards, note sections, entity render blocks without data cloning
  - `CONTENT-011` — Calendar-aware notes and objects with custom-date fields
  - `CONTENT-012` — Source-specific constraints visible before any lossy write-back
  - `CONTENT-013` — Core Vault Object schema set covering 10 initial subtypes

- **Related UX docs:**
  - `01-visual-design-system.md` — design tokens, typography, color, motion, density (consumed here; not redefined)
  - `02-navigation-and-platform-profiles.md` — profile breakpoints, sidebar/bottom-tab chrome
  - `03-accessibility.md` — global a11y baseline; this doc adds surface-specific editor requirements
  - `04-canvas-scene-widgets.md` — embed targets on canvas; widget placement of content embeds
  - `10-graph-search-discovery.md` — search over note content; backlink graph visualization
  - `11-collaboration-permissions.md` — permission-grant assignment; live co-editing presence
  - `12-sync-offline-reliability.md` — sync engine status; merge-conflict resolution

---

## 2. UX goals for this surface

Content authoring in DND Tools serves a wide range of task tempos: a DM writing lore at leisure
before a session, a DM making a quick note mid-combat, an editor importing a 200-note Obsidian
vault before the first session, and a player adding to a shared session recap. The editor must be
excellent for long-form focused writing yet stay nimble for quick in-session edits. The source-of-
truth and visibility machinery must be surfaced without becoming bureaucratic overhead on every
keystroke.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | The editor feels like a premium writing environment — calm typographic hierarchy, sufficient line length (60–80 ch), generous paragraph spacing. The frontmatter panel and source indicator read as structured tools, not form noise. The conflict-preview table is scannable at a glance without visual clutter. |
| **Information scent** | Save status, source badge, and visibility marker are always visible in the editor chrome — never inferred. Wikilinks to unresolved notes show an amber underline cue; broken links show red. The import wizard's conflict preview table uses row-level action labels (Skip / Overwrite / Merge) that describe the outcome, not the policy code. |
| **Navigability** | From note list to an open editor in ≤2 taps. From the editor, backlinks panel is ≤1 click. Import wizard is a modal overlay reachable from the DM vault toolbar in ≤2 steps. Deep-link by note ID to any section. |
| **Intuition / learnability** | Toolbar icons are labeled on hover; the slash-command insert menu uses natural-language descriptions. First-run editor empty state teaches the three source options. Frontmatter schema errors explain in plain language what is missing or invalid, not just an error code. |
| **Accessibility** | WCAG 2.2 AA throughout. Editor is fully keyboard-navigable; toolbar accessible by keyboard with focus loop. Live regions announce autosave status, import progress, and source constraint warnings. Visibility markers use text + icon, never color alone. ≥44 CSS px touch targets on all toolbar and form controls. |
| **Adaptability (platform profiles)** | Desktop: full three-pane layout (outline / editor / preview). Tablet: editor + contextual panel (properties or preview) in landscape, single pane in portrait. Mobile: focused single-pane "slim" editor; toolbar condensed to an icon bar + floating insert button. Same commands and same result across all profiles. |
| **Effective emphasis (visual hierarchy)** | The writing area is visually dominant; chrome (toolbar, save status, source badge) is calm and secondary. In the conflict-preview table, rows with action "Overwrite" or lossy writes are visually weighted (amber/warning token) so the DM notices them first. One primary CTA per wizard step. |
| **Feedback & responsiveness** | Every keypress acknowledges via the editor; autosave is visible within ≤2 s with a status chip (Saving… → Saved / Failed). Source constraint check result arrives before the write button is enabled. Import progress shows a determinate bar with file-count fraction. |
| **Error prevention & recovery** | Lossy write-back to Google Docs or Obsidian is blocked behind an explicit acknowledgment checkbox. Import without conflict preview is impossible — the wizard always shows the preview table before the commit button appears. Destructive imports confirm; the local draft is never lost on autosave failure. |
| **Consistency** | The save-status chip pattern is identical across the note editor, the Vault Object form, and the template creation panel. The source badge component is the same shape/treatment on the note list row and in the open editor header. Visibility markers use the same three-state chip everywhere. |

---

## 3. Researched best practices

### 3.1 Editor measure and typography

iA Writer's research [1] establishes 60–80 characters as the optimal prose line length for
sustained reading; their desktop editor defaults to 68 ch per line with 1.5–1.6× line height.
Bear [2] and Typora [3] both use a centered, content-width-constrained column (typically
640–720 px) surrounded by generous whitespace, creating a "paper" metaphor that reduces visual
fatigue. **Implication:** the DND Tools editor writing area is constrained to a `max-width` of
720 px (≈72 ch at the default body size), centered within the available pane, regardless of
desktop window width.

### 3.2 Toolbar and insert-menu design

Notion's slash-command insert menu [4] uses natural-language block-type descriptions ("Heading 1
— Large section heading") with keyboard-navigable filtering. This pattern outperforms a fixed
toolbar alone for discovering insertion options, especially for infrequent operations (tables,
embeds, callouts). GitHub's markdown toolbar [5] groups related controls (bold/italic/link
together; code/quote together) and exposes the most-used six items directly with the rest behind
an overflow menu. **Implication:** the editor exposes six primary toolbar items (Bold, Italic,
Link, Code, Heading, List) and a slash `/` trigger for the full block-type menu. Less-used items
(Table, Callout, Embed, Frontmatter, Snippet, Wikilink) appear in the slash menu, not the toolbar.

### 3.3 Split-pane live preview with synced scroll

Typora's live-preview inline rendering [3] — rendering markdown in place as the user types rather
than in a separate pane — reduces cognitive split-attention compared to a two-column split. When a
separate preview pane is offered (for checking render output), synced scroll is essential; GitHub's
split-pane editor [5] and HackMD [6] both keep editor and preview in sync to the nearest visible
heading. **Implication:** the editor defaults to live-inline rendering. A split-pane preview mode
is available via keyboard shortcut (⌘⇧P / Ctrl+Shift+P) with synced scroll tied to visible
heading proximity, not character offset.

### 3.4 Autosave cadence and save-state communication

Google Docs [7] saves continuously and shows "All changes saved in Drive" within 1–2 seconds of
the last keystroke; Linear's document editor [8] shows "Saving…" while the write is in flight
and reverts to a "Saved" chip on success. Both products make autosave status visible at all times,
not on a toast that dismisses. NN/g's visibility of system status principle [9] requires that
users always know what the system is doing. **Implication:** the DND Tools editor shows a
persistent save-status chip in the editor header. States: `Saved` (grey), `Saving…` (animated
pulse), `Autosave paused — offline` (amber), `Save failed — retry` (red, actionable).

### 3.5 Frontmatter and structured metadata forms

Obsidian's Properties panel (v1.4+) [10] renders YAML frontmatter as a structured key-value
editor above the body. Clicking a key reveals an inline editor for the value typed (text, number,
date, list, checkbox). This eliminates raw YAML syntax errors and surfaces schema issues inline.
Notion's database property editor [4] extends this with type-specific pickers. **Implication:**
the Vault Object form renders frontmatter fields as type-aware form controls (text, number,
select, checkbox, tag-list) with inline schema-validation feedback. A "Raw YAML" toggle is
available for power users; the form and raw views stay in sync.

### 3.6 Wikilinks: autocomplete, unresolved states, and rename propagation

Obsidian's internal link autocomplete [10] opens on `[[` with a fuzzy search over vault titles,
aliases, and headers, showing a preview of the target note. Unresolved links are visually
distinct (greyed/italic). Renaming a note in Obsidian propagates the rename to all
`[[OldTitle]]` references using a batch rewrite, previewed before commit. **Implication:** the
DND Tools `[[` autocomplete queries the unified graph (local + Obsidian + Google Docs). Unresolved
links render with an amber dotted underline and a "Create" ghost button. Rename propagation shows
a preview count ("Updates 14 links across 8 notes") before committing.

### 3.7 Import / conflict-preview UX

Git merge-tool UIs (e.g., VS Code's three-way merge editor [11]) demonstrate that showing a
side-by-side comparison of the incoming and existing content — with per-item action selection —
reduces accidental overwrites compared to a single blanket "overwrite all" policy. Notion's
import flow [4] shows a file count and estimated duration before starting. Linear's
migration-import tool [12] provides per-item action selection (skip / overwrite / merge) with a
summary count of how many items will be affected by each action. **Implication:** the DND Tools
import wizard shows a full conflict-preview table (one row per collision) with per-item action
override, a summary count for each global policy, a preserved-metadata column, and an
estimated-item-count before the commit button appears.

### 3.8 Source-of-truth and constraint communication

GitHub's fork/upstream status indicator [13] shows whether a branch is ahead/behind its source
with a compact chip. Notion's "synced block" indicator [4] shows the connected source and a
"last synced" timestamp inline in the block. When a write would lose formatting, a warning is
surfaced before the write, not after. **Implication:** every note in DND Tools carries a source
badge (`Local` / `Obsidian` / `Google Docs`) visible in the note list row and in the open editor
header. Before any write-back that would lose or downgrade features, a constraint panel opens
showing the specific features affected (not a generic "some features may be lost" warning), and
the write button is disabled until the user explicitly checks an acknowledgment checkbox.

### 3.9 Focus / distraction-free writing mode

iA Writer's focus mode [1] dims all prose except the sentence or paragraph at the cursor,
reducing visual noise during sustained writing. Bear's "Focus Mode" [2] hides the sidebar and
toolbar, leaving only the writing area. Both apps provide keyboard shortcuts (⌘⌥F / Ctrl+Shift+F)
to enter and exit focus mode instantly. **Implication:** the DND Tools editor offers a focus mode
that hides the sidebar, toolbar, frontmatter panel, and status bar, leaving only the centered
writing area and a minimal word/character count badge. Pressing Escape or the same shortcut exits
focus mode.

### 3.10 Visibility authoring and embed authoring UX

Craft's "Backlink" panel [14] shows every block that links to the current note in a collapsible
panel alongside the editor, making "who references this?" immediately visible during authoring.
Notion's synced-block embed [4] stores only a reference to the source block; the embed renders
the source's current content without copying it. When the source is inaccessible to the viewer,
Notion shows a neutral "This content is unavailable" placeholder — not a broken state or leak.
**Implication:** the DND Tools embed authoring inserts a reference token (`![[NoteTitle]]` or
`![[Entity:id]]`) into the note body; the renderer resolves it through the actor-filtered query.
When the target is `dm-only` and the viewer is a player, the placeholder reads "Content
unavailable" — never the hidden title or any field.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **iA Writer** | Focus mode; 68 ch line measure; typography-first layout | Reducing chrome and enforcing line length cuts cognitive fatigue during long writing sessions | Borrow: focus mode pattern, line-width constraint, minimal save-status chip | https://ia.net/writer |
| **Obsidian** | Properties panel (structured YAML as form); `[[` wikilink autocomplete with fuzzy search + preview; rename propagation with preview count | Making structured metadata approachable without hiding power; wikilink graph is first-class, not bolted on | Borrow: Properties panel UX, `[[` autocomplete, rename preview — Avoid: Obsidian's settings complexity leaking into the core flow | https://obsidian.md |
| **Notion** | Slash-command insert menu with natural-language block types; synced-block embed (reference-only, no data copy); import flow with file count + ETA | Discoverability of insertion types; embed-by-reference prevents stale data | Borrow: slash menu architecture, reference-embed model, constraint warning before write — Avoid: Notion's database/property model is overkill; DND Tools uses typed Vault Objects instead | https://notion.so |
| **Google Docs** | Continuous autosave with persistent "All changes saved" status chip; suggesting mode with attribution | Visible system status at all times; edit attribution without hiding the content | Borrow: persistent save-status chip pattern and copy; attribution model for DM edits — Avoid: Google Docs' single-source assumption clashes with our three-source model | https://docs.google.com |
| **VS Code (3-way merge editor)** | Per-conflict action selector; side-by-side incoming vs. current diff; conflict count badge | Showing every collision with a per-item choice prevents accidental mass overwrites | Borrow: per-item conflict action in import wizard; diff-style row highlighting — Avoid: three-pane merge is too complex for note import; our conflict table is simpler | https://code.visualstudio.com/docs/sourcecontrol/overview |
| **Bear** | Tag-based note organization; focus mode hiding all chrome; elegant typography with live markdown rendering | Calm, focused authoring environment without sacrificing structure | Borrow: tag-chip inline in the note header, focus-mode pattern — Avoid: Bear has no structured-object layer; DND Tools needs that on top | https://bear.app |
| **Linear** | "Saving…" chip; import migration with per-item skip/overwrite/merge; document editor with slash commands | Honest, specific system-status feedback; migration UX that doesn't mask risk | Borrow: save-status chip states and placement; per-item import action selector | https://linear.app |

### North-star narratives

**iA Writer:** The single most important lesson from iA Writer is that an excellent writing
experience is 80% typography and 20% feature. The writer's eye must land on prose, not chrome.
DND Tools must enforce a 720 px writing column, generous leading, and a minimal toolbar by
default — letting the DM's world-building prose be the visual primary.

**Obsidian:** Obsidian proves that a graph-linked vault with structured metadata can feel
natural when the link and property affordances are surfaced at authoring time (autocomplete,
Properties panel), not retrofitted as an export step. DND Tools must make `[[` autocomplete
instant, Properties visually approachable, and rename propagation transparent — even across three
sources.

**VS Code merge editor:** The most dangerous moment in content authoring is an import that
silently overwrites existing work. VS Code's per-conflict action selector is the right model
because it moves the destructive decision from "blanket policy at the start" to "informed choice
per collision." The DND Tools conflict-preview table must follow this pattern: preview first, per-
item override second, commit only after the user has seen every collision.

---

## 5. UX/UI requirements

### UX-CONTENT-001 — Note editor writing area layout

- **Requirement:** The editor writing area shall constrain prose to a `max-width` of 720 CSS px
  (≈72 ch at 16 px base), centered within the content pane, with top/bottom padding of at least
  32 px, and use a body font size of 16 px and line height of 1.6, regardless of window width.
- **Rationale:** 60–80 ch line length reduces reading fatigue [1]; centering in a wide pane
  prevents the reader's eye from spanning the full viewport, maintaining document focus.
- **Spec:** Writing area `max-width: 720px; margin: 0 auto; padding: 32px 24px;`. Body font: the
  design-system `--font-prose` stack (serifed or high-legibility sans per the design token, see
  `01-visual-design-system.md`). Heading scale: H1 2rem / H2 1.5rem / H3 1.25rem. Code inline
  font: `--font-mono`. Default tab stop: 4 spaces. Line height: 1.6 for body; 1.3 for headings.
  Horizontal scrollbar: never shown in the writing area.
- **States:** Default (body renders markdown live), Focus Mode (only writing area visible — see
  UX-CONTENT-007), Split Preview (editor + rendered pane side by side — see UX-CONTENT-005).
- **Platform profiles:**
  - Desktop: three-pane layout (outline/TOC at 240 px left · editor center · properties/preview
    at 320 px right). Both side panes collapse independently.
  - Tablet: single pane by default; landscape may show editor + one side pane if ≥768 px.
  - Mobile: single pane; writing area fills full width minus 16 px horizontal padding; heading
    hierarchy is preserved but font sizes step down by one scale level.
- **Input:** Pointer: click-to-place caret, selection with drag. Touch: tap-to-place, tap-drag
  to select, 44 px minimum tap handles on selection endpoints. Keyboard: standard caret nav;
  Tab inserts 4 spaces (not a focus trap — see Accessibility).
- **Accessibility:** `role="textbox" aria-multiline="true" aria-label="Note body"`. Tab inside
  the editor inserts spaces (not a focus-trap); Escape then Tab moves focus out (matches
  CodeMirror's established pattern [15]). No horizontal scroll. Font size is rem-based and
  respects browser zoom.
- **Acceptance criteria:**
  - Given a desktop window wider than 1400 px, when a note is open, then the prose column is no
    wider than 720 px and is horizontally centered.
  - Given the user changes browser base font to 20 px, when the editor renders, then the column
    remains in em/rem units and reflows without horizontal scroll.
  - Given Mobile profile (<600 px), when a note is open, then horizontal padding is ≥16 px and
    no content is clipped.
- **Priority:** Must-have

---

### UX-CONTENT-002 — Markdown toolbar (primary six + overflow)

- **Requirement:** The editor shall expose exactly six primary toolbar buttons (Bold, Italic,
  Link, Code, Heading toggle, List toggle) in a fixed horizontal bar above the writing area, with
  an overflow button (`…` or `More`) revealing the extended set. The toolbar must be keyboard-
  navigable as a single tab stop using arrow keys.
- **Rationale:** Grouping the most-used six formatting actions directly reduces motor distance for
  common operations [5]; excess toolbar items increase visual noise and choice paralysis.
- **Spec:**
  ```
  ┌────────────────────────────────────────────────────────┐
  │ [B] [I] [⌁] [<>] [H] [≡]  ···  [Source badge]  [Save] │
  └────────────────────────────────────────────────────────┘
  ```
  Each button: 36×36 CSS px on Desktop, 44×44 CSS px on Tablet/Mobile. Icon + visible tooltip on
  hover (Desktop); icon-only on Mobile (tooltips available on long-press). Overflow `…` opens a
  menu (see UX-CONTENT-003). Toolbar is sticky to the top of the editor pane, not scrolling with
  prose. Background: `--color-surface-raised`. Border-bottom: 1 px `--color-border-subtle`.
  Keyboard shortcuts displayed in tooltip: Bold ⌘B / Ctrl+B; Italic ⌘I / Ctrl+I; Link ⌘K /
  Ctrl+K; Code `` ⌘` `` / `` Ctrl+` ``; Heading ⌘⇧H / Ctrl+Shift+H; List ⌘⇧L / Ctrl+Shift+L.
- **States:** Each button: default / hover (background `--color-surface-hover`) / focus-visible
  (2 px `--color-focus-ring` outline, offset 2 px) / active (background `--color-surface-active`)
  / pressed/applied (background `--color-accent-subtle` when the current selection has this
  format applied).
- **Platform profiles:**
  - Desktop: full toolbar always visible.
  - Tablet: full toolbar visible in landscape; condensed to icon-only on portrait.
  - Mobile: condensed icon-only bar; appears above the virtual keyboard when the editor is
    focused; remains accessible while the keyboard is open.
- **Input:** Pointer: click. Touch: tap. Keyboard: Tab moves into toolbar; Left/Right arrows move
  between buttons; Enter/Space activates. Keyboard shortcuts listed above work from the editor
  body without entering the toolbar.
- **Accessibility:** `role="toolbar" aria-label="Formatting"`. Each button: `role="button"`,
  `aria-label` with shortcut noted (e.g., `aria-label="Bold (⌘B)"`), `aria-pressed` when format
  is active at selection. Focus indicator: 2 px `--color-focus-ring`, 2 px offset, passes 3:1
  against adjacent surface.
- **Acceptance criteria:**
  - Given the editor has a text selection, when the user presses Ctrl+B, then the selected text
    is bolded and the Bold button shows `aria-pressed="true"`.
  - Given the toolbar is focused, when the user presses Right arrow repeatedly, then focus moves
    through each button and wraps; pressing Enter on a focused button applies the format.
  - Given Mobile profile with the virtual keyboard open, when the editor is active, then the
    toolbar is visible above the keyboard without any button being clipped.
- **Priority:** Must-have

---

### UX-CONTENT-003 — Slash-command insert menu

- **Requirement:** Typing `/` on an empty line (or pressing the insert button on mobile) shall
  open a floating insert menu listing all block types, embeds, template inserts, and snippet
  inserts, searchable by keyword.
- **Rationale:** Natural-language block-type discovery via slash command significantly reduces
  need to remember toolbar locations, especially for infrequent operations [4].
- **Spec:** Menu appears within 80 ms of typing `/` with no additional characters. Width: 320 px
  (Desktop/Tablet), full-width minus 16 px margin (Mobile). Max height: 400 px with internal
  scroll. Items grouped: **Text** (Paragraph, Heading 1–3, Quote, Callout, Code block, Divider);
  **Insert** (Table, Image, Embed, Wikilink, Snippet, Template); **Object** (all Vault Object
  subtypes from schema registry). Each item: 44 px height, icon (24×24) + bold label + muted
  description (max 1 line). Typing after `/` filters by label and description fuzzy match;
  backspace clears filter. Pressing Escape closes and removes the `/` trigger character. Arrow
  Up/Down navigate; Enter inserts; Tab completes top result. Scrolls into view if near bottom of
  viewport.
- **States:** Open default (full list, first item highlighted) / filtering (results narrow in real
  time) / no results ("No matching block type") / closed.
- **Platform profiles:**
  - Desktop/Tablet: floating popover anchored to the `/` position, keyboard-navigable.
  - Mobile: bottom sheet (full-width, 60 vh max); triggered by the `+` floating insert button in
    addition to typing `/`.
- **Input:** Keyboard: `/` trigger; arrows to navigate; Enter to insert; Escape to close.
  Touch: tap item. Pointer: click item; hover highlights.
- **Accessibility:** `role="listbox" aria-label="Insert block type"`. Items: `role="option"
  aria-selected`. Live region announces result count when filter updates. Escape closes and
  returns focus to editor caret. Mobile sheet: focus trapped within the sheet while open; dismiss
  by swipe-down or close button.
- **Acceptance criteria:**
  - Given an empty line in the editor, when the user types `/`, then the insert menu opens within
    80 ms showing all block-type groups.
  - Given the insert menu is open and the user types "wikil", then only wikilink-related items
    remain and the first is highlighted.
  - Given Mobile profile, when the user taps the `+` floating button, then the insert menu opens
    as a bottom sheet with the same item set.
- **Priority:** Must-have

---

### UX-CONTENT-004 — Autosave status chip and failure recovery

- **Requirement:** The editor header shall display a persistent save-status chip at all times,
  updated within 2 seconds of each write attempt, with clear visual distinction for each state
  and an actionable retry path on failure.
- **Rationale:** Visible system status is a Nielsen heuristic [9]; autosave failure without
  feedback causes data loss anxiety and actual data loss. Google Docs and Linear both demonstrate
  that persistent chips (not dismissable toasts) are the right pattern for continuous autosave.
- **Spec:** Chip position: right side of the editor header bar, left of the source badge. Chip
  width: auto (text-based); height: 28 px; padding: 0 12 px; border-radius: `--radius-full`.
  Four states:
  - `Saved` — checkmark icon + "Saved" copy; `--color-text-muted` text; no background fill.
  - `Saving…` — spinner icon (CSS animation, 1 s rotation); "Saving…" copy; no fill.
    `prefers-reduced-motion`: spinner replaced by static dots icon.
  - `Autosave paused — offline` — warning icon; amber text `--color-warning-text`; amber
    background `--color-warning-subtle`. No action button; dismisses when back online.
  - `Save failed — tap to retry` — X icon; red text `--color-error-text`; red background
    `--color-error-subtle`; entire chip is interactive (`role="button"`). Clicking/tapping
    immediately retries the save.
  Autosave triggers: 2 s after the last keystroke (debounce), or immediately on blur if content
  has changed. Draft is always retained in local storage on failure until explicitly discarded.
- **States:** See four chip states above.
- **Platform profiles:** Same chip on all profiles. On Mobile, the chip is in the top-right of
  the mobile editor header; tap target for the retry chip is ≥44×44 CSS px.
- **Input:** Pointer: click retry chip. Touch: tap retry chip (44 px target). Keyboard: retry
  chip is focusable with Tab; Enter/Space activates retry.
- **Accessibility:** Save chip: `role="status" aria-live="polite"` when transitioning to `Saved`;
  `role="alert" aria-live="assertive"` when transitioning to `Save failed`. Retry chip additionally
  has `role="button" aria-label="Save failed — activate to retry"`.
- **Acceptance criteria:**
  - Given the user types content and stops for 2 s, when autosave runs, then the chip transitions
    from `Saved` to `Saving…` and back to `Saved` within the save round-trip.
  - Given the network is offline, when the user types content, then the chip shows "Autosave
    paused — offline" and the note body is preserved locally.
  - Given autosave fails with an error, when the chip shows `Save failed`, then clicking/tapping
    the chip triggers an immediate retry and announces the new state via `aria-live`.
- **Priority:** Must-have

---

### UX-CONTENT-005 — Split-pane preview with synced scroll

- **Requirement:** The editor shall offer a split-pane preview mode, toggleable by keyboard
  shortcut and toolbar button, that renders the markdown in a read-only right pane and keeps
  editor and preview scroll positions synchronized to the nearest visible heading.
- **Rationale:** Authors need to see rendered output while writing; synced scroll by heading
  prevents disorientation when editor and preview line counts diverge due to render expansion [3][6].
- **Spec:** Toggle: ⌘⇧P / Ctrl+Shift+P; also accessible via toolbar overflow menu ("Split
  preview") and via the `…` menu. On activation: right panel slides in at 50% of editor pane
  width (Desktop/Tablet); full-screen overlay with scrollable preview (Mobile). Sync logic: when
  either pane scrolls, the other jumps to keep the nearest visible H1/H2/H3 heading in the
  editor at the top of the preview (and vice versa). Sync happens on scroll end (debounced 80 ms),
  not on every scroll event. Preview pane: `aria-label="Rendered preview"`, `aria-readonly="true"`,
  content rendered through the sanitized markdown pipeline (same as player view). Preview does not
  show hidden-section markers visible in the editor (those are visible only to DM in the editor
  view — see UX-CONTENT-016).
- **States:** Off (single-pane editor) / On (split pane) / Mobile preview (full-screen overlay
  accessible via "Preview" button in editor header).
- **Platform profiles:**
  - Desktop: side-by-side split; divider draggable between 30 %–70 % of pane width.
  - Tablet (landscape): side-by-side at 50/50. Portrait: mobile behavior.
  - Mobile: dedicated "Preview" button opens a full-screen overlay; no persistent split.
- **Input:** Keyboard: ⌘⇧P / Ctrl+Shift+P toggle. Pointer: click toggle button. Touch: tap
  "Preview" button (≥44 px).
- **Accessibility:** Split-pane toggle: `aria-pressed` reflecting current state. Preview pane:
  `aria-label` and `tabindex="-1"` (not in the tab flow; keyboard navigation within preview uses
  cursor/page keys). Scroll sync does not move keyboard focus.
- **Acceptance criteria:**
  - Given split-pane mode is active, when the user scrolls the editor to an H2 heading, then the
    preview pane scrolls to the same heading within 80 ms of scroll end.
  - Given Mobile profile, when the user taps "Preview", then a full-screen rendered preview opens;
    pressing the back affordance returns to the editor.
  - Given the preview pane is visible, when a hidden section exists in the note, then the preview
    pane does not render that section's content.
- **Priority:** Should-have

---

### UX-CONTENT-006 — Wikilink autocomplete and unresolved-link states

- **Requirement:** Typing `[[` in the editor shall open a wikilink autocomplete popover with
  fuzzy search over the unified graph (local + Obsidian + Google Docs titles, aliases, and
  headings). Unresolved links shall be visually distinct from resolved links in both the editor
  and the rendered output.
- **Rationale:** Obsidian proves that in-editor link autocomplete is essential for a vault-centric
  tool [10]; showing unresolved state gives immediate feedback on broken graph edges without
  leaving the editor.
- **Spec:** Autocomplete triggers within 80 ms of the second `[`. Popover width: 320 px; max
  height: 300 px with internal scroll. Items: source-prefixed title (e.g., `Local · Highmoor`,
  `Obsidian · Dragon Queen`), one-line body excerpt. Fuzzy search across title, aliases (`aliases:`
  frontmatter), and headings (appended with `#Heading`). Arrow + Enter to insert; Escape to close
  and leave `[[` as typed. Selecting inserts `[[Title]]` or `[[Title#Heading]]`.
  When no match: "Create note named '{query}'" ghost item appears at bottom of list, allowing
  creation of a new note from the wikilink in one action.
  Unresolved link rendering:
  - Editor: amber dotted underline + amber text `--color-warning-text`. Hover shows tooltip
    "Unresolved link — click to create" with a "Create" ghost button.
  - Preview/render: same amber treatment + "(unresolved)" suffix in muted text.
  Broken links (target was deleted or renamed): red underline + red text `--color-error-text`.
  Hover shows tooltip "Broken link — target not found" with a "Repair" ghost button.
- **States:** Popover: open / filtering / empty / closed. Link: resolved / unresolved / broken.
- **Platform profiles:**
  - Desktop/Tablet: floating popover anchored to `[[` position.
  - Mobile: bottom sheet triggered by `[[` typing or by the Wikilink item in the insert menu.
- **Input:** Keyboard: `[[` trigger; arrows; Enter; Escape. Touch: tap insert-menu "Wikilink";
  tap item; tap "Create" ghost button on unresolved.
- **Accessibility:** Popover: `role="listbox" aria-label="Link to a note"`. Items: `role="option"`.
  Unresolved link inline: `aria-label="Unresolved link: {title}"`. Broken link: `aria-label="Broken
  link: {title} — target not found"`. Status announced via live region when popover opens.
- **Acceptance criteria:**
  - Given the user types `[[Drag` in the editor, then within 80 ms a popover appears with notes
    whose titles/aliases fuzzy-match "Drag" from all three sources.
  - Given a wikilink target does not exist in the graph, when the note renders in the editor,
    then the link shows an amber dotted underline and the "Create" ghost button.
  - Given a previously resolved wikilink target is renamed, when the editor re-renders, then the
    link shows the red broken-link treatment.
- **Priority:** Must-have

---

### UX-CONTENT-007 — Focus / distraction-free writing mode

- **Requirement:** The editor shall provide a focus mode that hides all chrome (sidebar, toolbar,
  frontmatter panel, source badge, status bar) except the centered writing area and a minimal
  word-count badge, accessible by keyboard shortcut and a toolbar overflow item.
- **Rationale:** iA Writer demonstrates that removing chrome during sustained writing measurably
  reduces distraction [1]; Bear's implementation shows this is achievable with one shortcut and
  instant reversibility [2].
- **Spec:** Toggle: ⌘⌥F / Ctrl+Shift+F; also accessible via toolbar overflow "Focus mode" and
  via Command Center command palette (⌘K → "Focus mode"). On activation: sidebar collapses with
  a 200 ms ease-out transition; toolbar fades to 0 opacity (remains accessible on hover at ≤40 %
  opacity, or on keyboard focus); frontmatter panel hides; the writing area expands to fill
  available pane; a minimal badge shows word count and character count in `--color-text-muted`
  in the bottom-right corner (non-interactive, 12 px font, `pointer-events: none`).
  `prefers-reduced-motion`: all transitions are instant (0 ms).
  Exit: Escape key, same keyboard shortcut, or clicking outside the writing area on Desktop.
  The save-status chip remains visible in focus mode (safety requirement — save state must never
  be hidden). The source badge collapses to a single colored dot.
- **States:** Off / On. Toolbar hover-reveal state while in focus mode.
- **Platform profiles:**
  - Desktop: full focus mode as described.
  - Tablet: focus mode hides the sidebar rail; the tab bar remains visible at the bottom.
  - Mobile: focus mode on Mobile is the default single-pane editor; no additional chrome to hide.
- **Input:** Keyboard: ⌘⌥F / Ctrl+Shift+F; Escape to exit. Touch: toolbar overflow tap.
- **Accessibility:** Focus mode toggle: `aria-pressed`. When entering focus mode, announce
  "Focus mode on" via `aria-live="polite"`. The toolbar in focus mode: even at low opacity, all
  buttons remain tab-stop accessible; focus ring is visible at 2 px even when toolbar is dim.
- **Acceptance criteria:**
  - Given focus mode is active, when the user presses Escape, then all chrome is restored within
    200 ms (or instantly with `prefers-reduced-motion`).
  - Given focus mode is active, then the save-status chip remains visible.
  - Given the toolbar is at reduced opacity in focus mode, when a toolbar button receives keyboard
    focus, then the toolbar fades to full opacity and the focus ring is visible.
- **Priority:** Should-have

---

### UX-CONTENT-008 — Frontmatter / Vault Object structured form

- **Requirement:** Notes backed by a Vault Object schema shall display a structured form panel
  rendering each frontmatter field as a type-aware control (text input, number input, select,
  multi-select tag picker, date picker, checkbox) with inline schema validation feedback and a
  toggle to the raw YAML view.
- **Rationale:** Raw YAML editing surfaces are error-prone; Obsidian's Properties panel and
  Notion's property editor demonstrate that type-aware controls dramatically reduce malformed
  frontmatter [4][10].
- **Spec:** Form panel occupies the right-side panel (320 px Desktop; collapsible to a tab on
  Tablet; accessible via "Properties" button on Mobile). Panel header: object subtype icon + badge
  (`Note`, `Handout`, `Encounter`, etc.), schema version chip, `Raw YAML` toggle button.
  Each field row: 48 px height; left-aligned label (max 160 px, ellipsis); right-aligned control
  (fills remaining width). Required fields: asterisk after label. Field types:
  - `text` → single-line input
  - `multiline` → 3-row textarea, resizable
  - `number` → numeric input with up/down arrows
  - `select` → dropdown with schema-defined options
  - `tags` → tag-chip input with autocomplete against existing vault tags
  - `date` → calendar date picker (custom calendar if one is defined; ISO date if not)
  - `boolean` → toggle/checkbox
  Inline validation: per-field, triggered on blur and on form submit attempt. Error state: red
  border `--color-error-border` + error text below field in `--color-error-text`, 12 px. Valid
  state: subtle green border `--color-success-border` on changed fields only (not on unchanged
  fields — avoids "green everywhere" noise). Save is blocked while any field has a validation
  error; the "Save" button shows tooltip "Resolve validation errors before saving".
  Raw YAML toggle: shows a monospace textarea with the full frontmatter YAML; edits sync back to
  the form on blur; YAML parse errors shown inline. DND Tools reserved keys (`dndtools.*`) shown
  in a separate "DND Tools metadata" section, read-only to prevent accidental overwrite.
- **States:** Default (form) / Raw YAML (textarea) / validation error per field / all-valid.
- **Platform profiles:**
  - Desktop: persistent right panel, always visible when a Vault Object is open.
  - Tablet: collapsible; tab "Properties" in the tab bar below the editor.
  - Mobile: accessed via a "Properties" button in the editor header; opens a full-screen sheet.
- **Input:** Pointer/touch: interact with type-appropriate controls. Keyboard: Tab through fields;
  Enter to confirm select options; Space to toggle checkboxes.
- **Accessibility:** `role="form" aria-label="Note properties"`. Each field: `<label>` associated
  to control via `for`/`id`. Error messages: `aria-describedby` on the field linking to the error
  `<p>`. Required fields: `aria-required="true"`. Validation errors announced via `aria-live="polite"`.
- **Acceptance criteria:**
  - Given a Vault Object with a required `title` field left empty, when the user attempts to save,
    then the `title` field shows an error border and message, and the save is blocked.
  - Given the Raw YAML toggle is active and the user edits a property, when the user switches back
    to the form view, then the form reflects the YAML change.
  - Given a DND Tools reserved key (`dndtools.visibility`) exists in frontmatter, when the Raw
    YAML view is open, then that key is displayed in the read-only "DND Tools metadata" section,
    not the editable area.
- **Priority:** Must-have

---

### UX-CONTENT-009 — Wikilink rename propagation workflow

- **Requirement:** When the user renames a note title that is referenced by wikilinks in other
  notes, the editor shall surface a pre-commit preview of affected links (count, note list),
  require explicit confirmation, and then atomically propagate the rename across all referring
  notes in the actor-filtered vault.
- **Rationale:** Obsidian's rename propagation [10] proves that graph-aware rename is essential
  for vault integrity; showing the scope before commit prevents surprise and builds trust.
- **Spec:** Rename trigger: renaming a note via the note header title field or the note list
  context menu. On rename attempt: if ≥1 wikilink in the vault references this title, a
  confirmation dialog opens before the write. Dialog contents:
  - Title: "Rename and update {N} links?"
  - Body: "Renaming '{OldTitle}' to '{NewTitle}' will update [[OldTitle]] in {N} link(s) across
    {K} note(s)." If the rename crosses a source boundary (e.g., an Obsidian note is referenced
    by a local note), a warning: "Some links are in {Source} notes — update will write to that
    source."
  - Two buttons: primary "Rename + update links" (blue), secondary "Rename only" (no propagation,
    grey).
  - Source-unavailable warning: if the Obsidian or Google Docs source is offline, a banner in the
    dialog: "Source '{Source}' is unavailable — links in that source cannot be updated now. A
    pending repair record will be created."
  Dialog dismisses on confirm or cancel; any dispatched rename command reports the count of
  rewritten links in a success toast (3 s duration): "Renamed to '{NewTitle}' — {N} link(s)
  updated across {K} notes."
- **States:** Dialog: open / source-warning / confirming. Post-confirm: success toast.
- **Platform profiles:** Dialog: modal sheet on all profiles; full-width on Mobile.
- **Input:** Pointer/touch: button tap. Keyboard: Tab between buttons; Enter confirms the focused
  button; Escape cancels (same as "Cancel").
- **Accessibility:** Dialog: `role="dialog" aria-modal="true" aria-labelledby` pointing to the
  dialog title. Focus trapped inside while open; focus returns to the note title field on close.
  Source warning: `role="alert"`.
- **Acceptance criteria:**
  - Given a note titled "Highmoor" is referenced by `[[Highmoor]]` in 5 other notes, when the DM
    renames the note to "Highmoor Keep", then a confirmation dialog appears showing "5 link(s)
    across N note(s)" before any write.
  - Given the user clicks "Rename only", then the title changes and wikilinks in other notes are
    not updated (they will show as broken).
  - Given the rename propagates successfully, then a success toast appears confirming the count.
- **Priority:** Must-have

---

### UX-CONTENT-010 — Wikilink disambiguation and backlinks panel

- **Requirement:** When `[[` autocomplete finds multiple notes with the same title, it shall
  present a disambiguation list with source and path context. A backlinks panel shall be
  accessible alongside the editor showing all notes that link to the current note.
- **Rationale:** Disambiguation prevents silent link resolution to the wrong target; backlinks
  authoring (Craft [14], Obsidian [10]) is essential for understanding content relationships
  during writing.
- **Spec:** Disambiguation: when multiple results share the same title in the autocomplete list,
  they appear as separate items, each showing: icon + source badge (`Local` / `Obsidian` /
  `Google Docs`) + full path (e.g., `locations/Highmoor.md`) in muted text. This lets the author
  distinguish `Local · lore/Highmoor.md` from `Obsidian · atlas/Highmoor.md`.
  Backlinks panel: accessible via the keyboard shortcut ⌘⇧B / Ctrl+Shift+B, or via the toolbar
  overflow "Backlinks", or via the right panel "Backlinks" tab (Desktop). Panel shows a flat list
  of notes that contain `[[CurrentTitle]]` or any alias, grouped by source. Each row: note title +
  source badge + excerpt showing the link in context (80 ch max, link bolded). Clicking a row
  opens that note. "No backlinks" empty state with "Create a link from another note" guidance.
  Backlinks are actor-filtered: a player sees only backlinks from notes they can read.
- **States:** Autocomplete with disambiguation: same states as UX-CONTENT-006. Backlinks panel:
  loaded / empty / loading (skeleton).
- **Platform profiles:**
  - Desktop: backlinks panel appears as a right-panel tab alongside Properties.
  - Tablet: backlinks panel accessible via a dedicated "Links" tab below the editor.
  - Mobile: backlinks accessible via "Backlinks" in the note's `…` contextual menu, opening a sheet.
- **Input:** Keyboard: ⌘⇧B / Ctrl+Shift+B to open/close. Pointer/touch: click/tap panel tab.
- **Accessibility:** Backlinks panel: `role="complementary" aria-label="Backlinks"`. Each row:
  `role="link"` (keyboard-activatable). Empty state: `aria-live="polite"` announcing "No backlinks".
- **Acceptance criteria:**
  - Given two notes from different sources both titled "Highmoor", when `[[Hig` is typed, then
    both appear in the autocomplete list with distinct source badges and paths.
  - Given a note is referenced by 3 other notes, when the backlinks panel opens, then all 3 appear
    with the source badge and the link-in-context excerpt.
  - Given the actor is a player who cannot see one of the 3 backlinking notes, when the backlinks
    panel opens, then only 2 backlinks are shown.
- **Priority:** Should-have

---

### UX-CONTENT-011 — Template library and create-from-template flow

- **Requirement:** The template library shall list all starter presets with a one-line description
  and preview, allow the DM to fill required variables with inline validation, preview the
  generated content before commit, and block creation if required variables are missing.
- **Rationale:** Template creation with mandatory preview prevents invisible rendering failures
  from reaching the vault; variable validation at the UI layer gives immediate feedback [4][8].
- **Spec:** Template library: accessible via the slash insert menu "Template" item, or via "New
  note → From template" in the note list toolbar. Opens as a two-panel modal (Desktop) or a
  full-screen sheet (Mobile): left panel lists presets grouped by category (NPC, Location, Session
  Recap, Encounter, Handout, Calendar Event); right panel shows the selected preset's details.
  Preset detail: name, description, default visibility badge, a list of variables (each labeled,
  with "(required)" suffix where applicable), and a live render preview pane showing the generated
  content with the current variable values populated (or placeholder text if empty).
  Validation: required variables that are empty show a red border and "Required" message;
  the "Create from template" primary button is disabled while any required variable is invalid.
  Session recap scaffold: a dedicated preset under "Session Recap" with variables: Session number,
  Session date (custom calendar picker), Notable events (multiline), NPCs met, Locations visited.
  Default visibility: `dm-only` for all presets unless explicitly set to `player-visible` in the
  preset definition. This default cannot be silently widened by the template.
- **States:** Library list / preset selected / all-valid (Create enabled) / missing required
  (Create disabled) / post-create (modal closes, success toast, note opens).
- **Platform profiles:**
  - Desktop: two-panel modal, 800×600 px.
  - Tablet: single-panel, full-screen; swipe left to go back to list.
  - Mobile: full-screen; step 1 = pick preset, step 2 = fill variables.
- **Input:** Keyboard: arrow keys to navigate preset list; Tab through variable fields; Enter to
  create when valid. Touch: tap to select; tap to fill.
- **Accessibility:** Modal: `role="dialog" aria-modal="true"`. Required fields: `aria-required`.
  Create button disabled state: `aria-disabled="true"` with `title` tooltip explaining why.
  Live preview pane: `aria-label="Template preview" aria-live="off"` (updates are visual only;
  not announced on every keystroke).
- **Acceptance criteria:**
  - Given a template preset has two required variables and one is left empty, when the form is
    displayed, then the "Create from template" button is disabled.
  - Given all required variables are filled, when the user clicks "Create from template", then
    the note is created with `dm-only` visibility (or the preset default) and the editor opens.
  - Given the Session Recap preset, when Session number and Date variables are filled, then the
    live preview shows the generated recap structure before commit.
- **Priority:** Should-have

---

### UX-CONTENT-012 — Snippet library and insert flow

- **Requirement:** The snippet library shall list all available snippets with a preview, allow
  the DM to select an insert position (before / after / at caret), and show a rendered preview of
  the result before inserting. Snippet insertion shall not bypass note validation, visibility, or
  markdown sanitization.
- **Rationale:** Snippets that bypass the validation pipeline are a security and consistency
  risk [CONTENT-004]; showing the post-insert preview prevents formatting surprises.
- **Spec:** Triggered via slash menu "Snippet" item or the toolbar overflow "Insert snippet".
  Opens as a bottom sheet (Mobile) or a popover (Desktop/Tablet, 320×400 px). List of snippets:
  name + one-line description + category tag. Selecting a snippet shows a preview of the snippet's
  rendered blocks (safe block-model render, no raw HTML). Position selector: segmented control
  `Before | After | At caret` (default: `At caret` when cursor is in the body; `After` when at
  the end of the document). Inherited visibility note: "Inserted content will inherit this note's
  visibility: {visibility-badge}" — non-configurable (a snippet cannot widen visibility).
  Insert button: primary, enabled immediately (no required fields for basic snippets). After
  insert: popover closes, caret positioned at end of inserted content, scroll to caret.
  Snippets containing raw HTML or script-like content: rejected by the sanitization pipeline with
  an error toast "This snippet contains disallowed content and was not inserted."
- **States:** List / snippet selected / post-insert (closed).
- **Platform profiles:** Desktop/Tablet: popover. Mobile: bottom sheet.
- **Input:** Keyboard: Tab/arrows; Enter to insert; Escape to close. Touch: tap snippet; tap Insert.
- **Accessibility:** `role="dialog" aria-label="Insert snippet"`. Inherited-visibility note:
  `role="note"` so it is not announced on every focus change. After insert, focus returns to
  editor body at end of inserted content, and a brief `aria-live="polite"` announcement:
  "Snippet '{name}' inserted."
- **Acceptance criteria:**
  - Given a snippet is inserted into a `player-visible` note, when the insert completes, then the
    snippet content is subject to the same visibility as the note and is not independently `dm-only`.
  - Given a snippet with a `<script>` tag in its body, when insertion is attempted, then an error
    toast appears and the note body is unchanged.
  - Given position "At caret" is selected, when the snippet is inserted, then the snippet content
    appears at the current caret position.
- **Priority:** Should-have

---

### UX-CONTENT-013 — Source-of-truth badge and indicator

- **Requirement:** Every note — in the note list and in the open editor header — shall display a
  persistent source badge indicating its source of truth (`Local` / `Obsidian` / `Google Docs`)
  with a status dot indicating the source's current health (`synced` / `pending` / `error` /
  `unavailable`).
- **Rationale:** Ambiguous source-of-truth is a primary cause of data loss in multi-source vaults;
  Notion's synced-block indicator [4] and GitHub's fork status chip [13] show that compact, always-
  visible indicators prevent confusion without cluttering the UI.
- **Spec:** Badge anatomy: 20×20 px source icon + short label (`Local`, `Obsidian`, `GDocs`) +
  8×8 px status dot. Badge height: 24 px; border-radius: `--radius-sm`; background:
  `--color-surface-raised`. Status dot colors:
  - `synced` — `--color-success` (green)
  - `pending` — `--color-warning` (amber), animated pulse (1 s, ease-in-out;
    `prefers-reduced-motion`: static amber)
  - `error` — `--color-error` (red), static
  - `unavailable` — `--color-text-muted` (grey), static
  Clicking/tapping the badge opens a source-info popover (280 px wide): source name, full sync
  status, "Last synced: {relative time}", "Change source" link (DM only), and a "View constraint
  diagnostics" link (opens UX-CONTENT-014 panel).
  In the note list: badge appears on the right of each row, truncated to icon + dot only if the
  row is narrower than 280 px.
  In the open editor header: full badge with label; always visible.
- **States:** Badge states: synced / pending / error / unavailable. Popover: open / closed.
- **Platform profiles:** Same badge on all profiles. On Mobile, badge in the note list is icon +
  dot only (no label text). Popover on Mobile is a bottom sheet.
- **Input:** Pointer: click badge. Touch: tap badge (44 px touch target — the badge's tap area
  is extended to 44 px via padding even though the visual is 24 px). Keyboard: Tab to badge;
  Enter/Space opens popover.
- **Accessibility:** Badge: `role="status" aria-label="Source: {source}, Status: {status}"`.
  Status dot: not separately labelled (meaning is conveyed via the `aria-label` of the badge).
  Popover: `role="dialog" aria-label="Source information"`. Focus managed on open/close.
- **Acceptance criteria:**
  - Given an Obsidian-sourced note is open in the editor, when the Obsidian vault directory is
    unreachable, then the badge shows an `unavailable` (grey) status dot within 5 s of the
    connection loss.
  - Given the user taps/clicks the badge, then a popover opens with the source name, sync status,
    and last-synced time.
  - Given Mobile profile, when the note list loads, then each row shows only the source icon +
    status dot (no label text).
- **Priority:** Must-have

---

### UX-CONTENT-014 — Pre-write source-constraint diagnostic panel

- **Requirement:** Before any write-back that would lose or downgrade source-specific features
  (frontmatter properties, aliases, tags, inline tags, wikilinks, DND Tools metadata), the editor
  shall surface a constraint diagnostic panel naming every affected feature and block the write
  behind an explicit acknowledgment checkbox. The write button shall remain disabled until checked.
- **Rationale:** Silent data loss on write-back is the most destructive anti-pattern in a multi-
  source vault [CONTENT-012]; explicit acknowledgment with a specific feature list (not a generic
  warning) makes the risk legible and places the choice with the author.
- **Spec:** Trigger: user saves a note whose source cannot faithfully round-trip its current
  content (computed by the Processing Core via `checkContentSourceConstraints`). Presentation:
  an inline warning panel appears below the editor toolbar (above the writing area) — not a modal,
  not a toast, so the author can see the content while reading the warning. Panel layout:
  - Amber header bar: warning icon + "Write to {SourceName} will lose features".
  - Feature loss table (one row per affected feature):
    ```
    ┌──────────────────────────────┬───────────────┬────────────────────────────────────────┐
    │ Feature                      │ Support level │ What happens                           │
    ├──────────────────────────────┼───────────────┼────────────────────────────────────────┤
    │ [[wikilinks]]                │ Unsupported   │ Will be dropped from the document      │
    │ Front matter properties      │ Lossy         │ Custom properties downgraded to strings│
    └──────────────────────────────┴───────────────┴────────────────────────────────────────┘
    ```
  - Acknowledgment checkbox: "I understand this write will lose or downgrade the features listed
    above." — unchecked by default.
  - "Write to {SourceName}" button: disabled until checkbox is checked. When checked and clicked,
    the write dispatches with the acknowledgment token.
  - "Keep local only" secondary link: dismisses the panel and sets the note's source back to
    `Local` without a write-back.
  If a "faithful write" is possible (no features lost), the panel is not shown; the save proceeds
  normally.
  Token invalidation: if the user edits the note after seeing the panel, the acknowledgment token
  is reset and the checkbox is unchecked (recomputed loss profile for the new content).
- **States:** Hidden (faithful write) / shown (lossy write, checkbox unchecked) / acknowledged
  (checkbox checked, button enabled) / error.
- **Platform profiles:** Same panel on all profiles. On Mobile, the panel appears as a persistent
  banner above the keyboard, collapsible to a single-line warning with an "Expand" chevron.
- **Input:** Pointer/touch: checkbox tap, button tap. Keyboard: Tab to checkbox; Space to check;
  Tab to button; Enter to submit.
- **Accessibility:** Panel: `role="alert"` when it first appears (announces the warning). Feature
  table: `role="table"`. Checkbox: `aria-required="true"` (for the write operation). Write button:
  `aria-disabled="true"` until acknowledged.
- **Acceptance criteria:**
  - Given a note with wikilinks is being written back to Google Docs, when the user triggers save,
    then the constraint panel appears listing "[[wikilinks]] — Unsupported — Will be dropped".
  - Given the constraint panel is shown and the user edits the note body, then the acknowledgment
    checkbox is unchecked and the write button is re-disabled.
  - Given the user checks the acknowledgment and clicks "Write to Google Docs", then the write
    proceeds and a success chip appears; if the write fails, an error state is shown in the chip.
- **Priority:** Must-have

---

### UX-CONTENT-015 — Import wizard (conflict preview, policy selection, progress)

- **Requirement:** The import wizard shall require a conflict-preview step (showing a table of
  every collision with its per-item action) before the commit step, support a global conflict
  policy selector with per-item overrides, display a determinate progress indicator during the
  import, and support resumable import after interruption.
- **Rationale:** A blanket "overwrite all" import without preview is one of the most destructive
  operations possible in a vault [11]; per-item action selection (as in Linear's migration
  importer [12]) ensures the DM inspects every collision.
- **Spec:** Import wizard is a multi-step modal:
  **Step 1 — Source and policy:** Source kind selector (`Obsidian vault` / `Markdown archive`);
  global conflict policy selector (`Skip` / `Overwrite` / `Merge` — each with a one-sentence
  description); file picker or paste area (current implementation: paste with `===== path.md =====`
  headers per `ContentImportExport.svelte`; future: native file-system picker). "Preview" button
  (primary, disabled until at least one file is recognized).
  **Step 2 — Conflict preview table:** Table with columns:
  ```
  ┌──────────────────────┬──────────┬────────────────┬──────────────────────────────────────┐
  │ Note title           │ Action   │ Preserved       │ Unsupported properties               │
  ├──────────────────────┼──────────┼────────────────┼──────────────────────────────────────┤
  │ Highmoor             │ Skip     │ tags: 3 aliases │ custom-property-x                    │
  │ Dragon Queen         │ Overwrite│ tags: 1         │ —                                    │
  │ Obsidian Plugin Docs │ New      │ wikilinks: 12   │ —                                    │
  └──────────────────────┴──────────┴────────────────┴──────────────────────────────────────┘
  ```
  Rows with action "Overwrite" are highlighted with `--color-warning-subtle` background.
  Per-item action can be overridden via a dropdown in the Action cell (replaces the global policy
  for that row). Summary bar above table: "Total: {N} files · {C} collisions · {O} will overwrite
  · {S} will skip · {M} will merge." "Commit import" button (primary) appears only after the
  preview table is loaded. "Back" secondary link returns to Step 1.
  **Step 3 — Progress:** Determinate progress bar (file-count fraction: "{N} of {T} files
  imported"). Cancelled / interrupted imports: a "Resume" link appears on next open if a
  checkpoint exists.
  Post-import: success message "Imported {C} new · {O} overwritten · {S} skipped." with a
  "View import report" link opening a read-only log.
- **States:** Step 1 / Step 2 (preview loaded) / Step 3 (progress) / complete / error / resumable.
- **Platform profiles:** Desktop: wide modal (900 px max) with the conflict table visible without
  horizontal scroll. Tablet: full-screen. Mobile: full-screen; table scrolls horizontally with
  sticky "Note title" column.
- **Input:** Keyboard: Tab through steps; arrow keys in table; Enter on action dropdowns; Enter to
  commit. Touch: tap through steps; tap per-item action dropdowns.
- **Accessibility:** Wizard: `role="dialog" aria-modal="true"`. Table: `role="grid"`. Progress
  bar: `role="progressbar" aria-valuenow aria-valuemin aria-valuemax`. Step transitions announced
  via `aria-live="polite"`. Focus moves to the first interactive element of each new step.
- **Acceptance criteria:**
  - Given the user reaches Step 2 with 3 collisions, then the conflict-preview table shows exactly
    3 rows, each with the resolved action.
  - Given a row's global action is "Skip", when the user overrides it to "Overwrite" via the
    per-item dropdown, then that row's action changes and the summary bar updates.
  - Given the import is interrupted at 40 %, when the wizard is reopened, then a "Resume previous
    import" banner appears with the checkpoint state.
- **Priority:** Should-have

---

### UX-CONTENT-016 — Content visibility authoring (entity / section / field)

- **Requirement:** The DM shall be able to author visibility (`dm-only` / `player-visible` /
  `shared`) at entity, section, and field granularity from the editor and note list, with visual
  markers that are always visible in DM context and never visible in player context. Default must
  be `dm-only`.
- **Rationale:** Visibility is a primary safety guarantee; DM-only content must never leak into
  player views [CONTENT-009]; authoring this per-section/field is essential for partial reveals
  (e.g., a location note where the overview is player-visible but the GM secrets section is not).
- **Spec:**
  **Entity-level visibility:** In the note list, a three-state visibility chip is the rightmost
  control on each row (left of the source badge): `DM only` (red `--color-error-subtle` bg +
  lock icon) / `Player visible` (green `--color-success-subtle` bg + eye icon) / `Shared` (blue
  `--color-accent-subtle` bg + share icon). Clicking/tapping the chip cycles to the next state
  with a confirmation on transition from a less-restrictive to a more-restrictive state ("Make
  this note DM only? Players who can currently see it will lose access. Confirm?").
  **Section-level visibility:** In the editor, each named section (`## Section Name`) has a
  floating visibility inline gutter marker (a 20×20 icon, left of the section heading). Clicking
  opens a section-visibility popover: same three-state picker + "Inherited from note" option.
  `dm-only` sections render in the editor with a red left border `4 px --color-error-border` and
  a `DM only` ghost badge at the start of the heading line — visible in DM mode, suppressed in
  player mode.
  **Field-level visibility:** In the frontmatter form panel, each field row has a visibility toggle
  control (the same icon, 20×20, on the right of the row) accessible via hover (Desktop) or
  always visible (Mobile/Tablet). Tapping opens a two-state picker (`dm-only` / inherit from
  section or entity).
  **Default:** All new notes, sections, and fields default to `dm-only`. The default is not
  configurable per note; it is a system-level constant enforced in the Processing Core.
  **Player-view preview:** A "Preview as player" toggle in the editor header lets the DM see the
  note as a specific player would see it (actor-filtered projection). Hidden sections and fields
  are replaced by the exact placeholder a player would see ("Content unavailable"). The preview
  is read-only; editing is suspended while in preview mode.
- **States:** Entity chip: dm-only / player-visible / shared. Section gutter: dm-only / player-
  visible / shared / inherited. Field row: dm-only / inherited. Preview mode: on / off.
- **Platform profiles:**
  - Desktop: section gutter markers always visible; field visibility toggles visible on hover.
  - Tablet: section gutter markers always visible; field visibility toggles always visible.
  - Mobile: section visibility accessible via long-press on the section heading → "Set visibility";
    field visibility via the Properties sheet.
- **Input:** Keyboard: Tab to visibility chip; arrow keys cycle states; Enter applies. Touch: tap
  chip; tap popover option. No drag-to-reorder visibility.
- **Accessibility:** Visibility chip: `role="button" aria-label="Visibility: {state}. Activate
  to change."`. Section marker: `aria-label="Section '{SectionName}' visibility: {state}"`.
  Color is never the sole differentiator — each state has a unique icon + text label. DM-only
  section red border: `aria-label` on the section element includes "DM only section".
- **Acceptance criteria:**
  - Given a new note is created, when no visibility metadata is set, then the note is `dm-only`
    and a player querying it receives no content.
  - Given a note with a `dm-only` section is previewed in "Preview as player" mode, then the
    section body is replaced by the player-facing placeholder and the DM-only border is absent.
  - Given a visibility chip is cycled from `player-visible` to `dm-only`, then a confirmation
    dialog appears before the change commits.
- **Priority:** Must-have

---

### UX-CONTENT-017 — Embed authoring in note body and canvas

- **Requirement:** The DM shall be able to insert three embed types (`object-card`, `note-section`,
  `render-block`) into a note body or canvas widget, with the embed stored as a reference token
  only (no data copy), rendered at read time through the actor-filtered query, and showing a
  neutral "unavailable" placeholder when the target is inaccessible to the viewer.
- **Rationale:** Reference-only embeds prevent data staleness and prevent accidental leakage of
  DM-only content into player views [CONTENT-010]; the "unavailable" placeholder is safer than
  any alternative that might reveal the hidden content's shape.
- **Spec:** Trigger: slash menu "Embed" item → sub-menu: `Object card` / `Note section` /
  `Render block`. Each sub-menu item opens a search popover (actor-filtered note/object list,
  fuzzy search). Selecting a target inserts a reference token into the body:
  - Object card: `![[object:EntityId]]` — rendered as a compact card showing visible fields.
  - Note section: `![[NoteTitle#SectionName]]` — rendered as the section's visible content.
  - Render block: `![[render:EntityId]]` — rendered as the entity's full render-block projection.
  Token rendering in the editor: a "pill" block showing the embed type icon + target title +
  source badge + `[Live]` badge. Clicking/tapping the pill opens the embed inspector (read-only
  field list or section excerpt). A `×` button on the pill removes the embed reference from the
  body without affecting the target.
  Placeholder rendering (target inaccessible to the viewer):
  - Visual: a grey card with a lock icon + "Content unavailable".
  - No title, no field names, no shape leak.
  - `aria-label="Embedded content unavailable"` (no identifying information in the label).
  Canvas embed: the same embed types are available as canvas widget variants; the widget stores
  only the reference token and dispatches an actor-filtered resolution at every render.
- **States:** Pill: resolved / unavailable. Inspector popover: open / closed. Embed target:
  live / updated / deleted (deleted target: pill shows "Target deleted" with repair option).
- **Platform profiles:**
  - Desktop: pill inline in the body; inspector popover on click.
  - Tablet: same.
  - Mobile: pill shows truncated title; inspector as full-screen sheet.
- **Input:** Keyboard: Tab to embed pill; Enter opens inspector; Delete removes embed. Touch:
  tap pill for inspector; tap `×` to remove.
- **Accessibility:** Embed pill: `role="img" aria-label="Embedded {type}: {title} from {source}"`.
  Unavailable placeholder: `role="img" aria-label="Embedded content unavailable"`. Inspector
  popover: `role="dialog"`. Focus managed on open/close.
- **Acceptance criteria:**
  - Given an object-card embed references a `dm-only` entity, when a player renders the note,
    then only the "Content unavailable" placeholder appears — no title, no field names.
  - Given a note-section embed targets a section that is subsequently made `dm-only`, when a
    player renders the note, then the section embed shows the unavailable placeholder.
  - Given a player inserts a note-section embed into their own note, when the embed resolves,
    then only sections visible to that player are accessible.
- **Priority:** Must-have

---

### UX-CONTENT-018 — Export wizard (portable vs. DM backup, validation report)

- **Requirement:** The export flow shall provide two modes (`portable` / `DM backup`), show what
  is included and omitted before generating the file, scrub device-local secrets and absolute
  paths in both modes, and produce a machine-readable validation report alongside the exported
  markdown.
- **Rationale:** Portable export that silently includes DM-only content would leak hidden
  information to players [CONTENT-008]; the validation report enables DMs to audit what left
  the vault.
- **Spec:** Export accessible from: DM vault toolbar "Export" button; also from the `…`
  contextual menu on a specific note (exports that note only).
  **Mode selector:**
  - `Portable` — "Share with players: omits DM-only content, scrubs secrets and paths. Players
    see only content you've marked player-visible or shared."
  - `DM backup` — "Full backup: includes all content. Scrubs device secrets and paths. Not for
    sharing with players."
  Each mode shows a live count chip: "Will include {N} notes, omit {M} DM-only notes."
  For portable mode, a "Preview as player" sub-selector lets the DM pick which player's permission
  set to simulate.
  **Validation report:** After export, a collapsible "Validation report" section shows:
  - Export mode, timestamp, total exported, omitted-for-visibility count, redacted-items count.
  - `Clean: yes / no` — if no: a list of items that triggered the leak detector.
  - Per-note warnings (e.g., "device path detected and scrubbed in note Highmoor").
  "Leak detected" in the report is shown with `--color-error-text` and a warning icon.
  The exported package format is ZIP containing `{path}.md` files + `validation-report.json`.
- **States:** Mode selector / preview counts loaded / export in progress (spinner) / complete /
  validation-report shown / error.
- **Platform profiles:** Desktop/Tablet: modal wizard. Mobile: full-screen sheet.
- **Input:** Pointer/touch: button and mode selector interactions. Keyboard: Tab through controls;
  Enter to export.
- **Accessibility:** Mode radio buttons: `role="radio"`. Report: `role="region"
  aria-label="Validation report"`. Leak-detected error: `role="alert"`.
- **Acceptance criteria:**
  - Given portable export is run, when the package is generated, then no note with `dm-only`
    visibility appears in the exported files.
  - Given DM backup export is run, when the package is generated, then all selected notes
    including `dm-only` appear, and the validation report is present and marked `clean: true`
    if no leaks are detected.
  - Given a note contains a device-local absolute path, when any export runs, then the path is
    scrubbed and the validation report logs the redaction.
- **Priority:** Should-have

---

### UX-CONTENT-019 — Calendar-date field picker in content authoring

- **Requirement:** When authoring a calendar-aware note or Vault Object, the DM shall see a
  custom campaign calendar date picker (not a Gregorian picker) that formats dates consistently
  across all surfaces and validates that the selected date exists in the campaign calendar.
- **Rationale:** Using the system Gregorian date picker for in-world dates creates confusion and
  data inconsistency [CONTENT-011]; a custom calendar picker reinforces the campaign's fictional
  chronology.
- **Spec:** Date field in the frontmatter form: clicking opens a campaign-calendar picker component
  (not `<input type="date">`). Picker layout:
  ```
  ┌─────────────────────────────────┐
  │  ◄  Hammer  1372 DR  ►          │
  │  F   S   T   F   F              │
  │  —   1   2   3   4              │
  │  5   6   7   8   9   10  11     │
  │  12  13  14  [15] 16  17  18   │
  │  ...                            │
  │  OK       Clear                 │
  └─────────────────────────────────┘
  ```
  Month/year navigation via `◄ ►` buttons. Days are numbered per the campaign calendar month
  definition (day count per month from the calendar schema). Selected day highlighted with
  `--color-accent` background. Display format in the field after selection:
  `{Day} {MonthName} {Year} {EraLabel}` (e.g., "15 Hammer 1372 DR"). If no campaign calendar
  is defined, the date field falls back to an ISO text input with a placeholder "No calendar
  defined — enter YYYY-MM-DD". Date field is never a Gregorian `<input type="date">`.
- **States:** Closed (displays formatted date or empty) / open (calendar grid) / selected /
  no-calendar fallback.
- **Platform profiles:** Desktop/Tablet: popover anchored below the date field. Mobile: bottom
  sheet.
- **Input:** Keyboard: Tab to field; Enter/Space opens picker; arrow keys navigate grid; Enter
  selects day; Escape closes. Touch: tap to open; tap day; tap OK.
- **Accessibility:** Picker: `role="dialog" aria-label="Campaign date picker"`. Grid: `role="grid"`.
  Each day: `role="gridcell" aria-label="{Day} {Month}" aria-selected`. Navigation buttons:
  `aria-label="Previous month" / "Next month"`. Selected date announced on select via `aria-live`.
- **Acceptance criteria:**
  - Given a campaign calendar with months Hammer (30 days) and Alturiak (28 days) is defined,
    when the DM opens the date picker on a new note, then the picker shows the campaign months
    and days (not Gregorian months).
  - Given no campaign calendar is defined, when the DM opens the date field, then an ISO text
    input appears with an explanatory placeholder.
  - Given a selected campaign date, when the note is rendered in multiple surfaces (editor,
    search result, timeline), then the formatted date string is identical across all.
- **Priority:** Should-have

---

## 6. Component & state specifications

### 6.1 Save-status chip

| State | Icon | Label copy | Color token | Interactive |
|---|---|---|---|---|
| `saved` | checkmark | "Saved" | `--color-text-muted` | No |
| `saving` | spinner (animated) | "Saving…" | `--color-text-muted` | No |
| `offline` | warning triangle | "Autosave paused — offline" | `--color-warning-text` | No |
| `failed` | X circle | "Save failed — tap to retry" | `--color-error-text` | Yes (`role="button"`) |

State transitions: `saved` ↔ `saving` on every write cycle. `saving` → `offline` if network lost.
`saving` → `failed` if error returned. `failed` → `saving` on retry. `offline` → `saving` when
network restored and debounce fires.

### 6.2 Source badge

| Source | Icon | Short label | Full label |
|---|---|---|---|
| `local` | folder icon | "Local" | "Local vault" |
| `obsidian` | Obsidian logo shape | "Obsidian" | "Obsidian vault sync" |
| `google-docs` | doc icon | "GDocs" | "Google Docs sync" |

Status dot: 8×8 px circle, right of label. Colors: green (`synced`), amber (`pending`), red
(`error`), grey (`unavailable`). Dot includes `aria-label` as part of the parent badge's
accessible name (not separate).

### 6.3 Visibility chip

| State | Icon | Label | Bg color token | Text color token |
|---|---|---|---|---|
| `dm-only` | lock | "DM only" | `--color-error-subtle` | `--color-error-text` |
| `player-visible` | eye | "Player visible" | `--color-success-subtle` | `--color-success-text` |
| `shared` | share-nodes | "Shared" | `--color-accent-subtle` | `--color-accent-text` |

Chip height: 24 px; border-radius: `--radius-full`. In the note list, chip always visible.
In the editor header, chip always visible. In the frontmatter panel field rows, icon-only (20×20)
with tooltip on hover.

### 6.4 Conflict-preview table row

| Column | Width | Notes |
|---|---|---|
| Note title | 40 % | Truncated with ellipsis; full title in tooltip |
| Action | 15 % | Dropdown on collision rows; static text on new rows |
| Preserved metadata | 25 % | "tags: N, aliases: N, wikilinks: N" |
| Unsupported properties | 20 % | Comma list; "—" if none |

Row background: `--color-warning-subtle` for any row with action `Overwrite`. `--color-surface`
for `New` and `Skip` rows. Row height: 48 px. Table has a sticky header row.

### 6.5 Embed pill

Anatomy: `[embed-type-icon] [target title — truncated to 30 ch] [source badge] [Live badge] [× button]`

Height: 36 px; border-radius: `--radius-md`; background: `--color-surface-raised`; border:
1 px `--color-border-subtle`. `×` button: 24×24 CSS px, aligned right, visible on hover
(Desktop) or always visible (Mobile/Tablet). "Live" badge: 8×8 green dot + "Live" text in
`--color-success-text`, 11 px. When target is deleted: "Target deleted" text in
`--color-error-text` + repair icon.

### 6.6 Wikilink autocomplete popover

- Opens within 80 ms of `[[`; closes within 80 ms of Escape or selection.
- Items: 48 px height; icon (16×16, source-specific) + title (bold) + path (muted, 12 px).
- Active item: `--color-surface-hover` background.
- Scroll: internal scroll at max-height 300 px; no outer page scroll on arrow-key navigation.
- "Create '{query}'" ghost item: always at the bottom if no exact match; background
  `--color-accent-subtle`.

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥1024 px) — three-pane layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  App sidebar (240 px)  │  Editor pane (flex)                │  Right panel (320px)│
│                        │ ┌──────────────────────────────────┐│  [Properties tab]   │
│  Notes list / Tree     │ │ Toolbar: B I ⌁ <> H ≡ ···       ││  [Backlinks tab]    │
│                        │ │ ─────────────────────────────────││                     │
│  [+ New note]          │ │  Source badge  •  Save chip       ││  [Schema fields…]   │
│                        │ │ ─────────────────────────────────││                     │
│                        │ │                                   ││  Visibility chip    │
│                        │ │   max-width: 720px writing area   ││                     │
│                        │ │                                   ││  [Backlinks list…]  │
│                        │ └──────────────────────────────────┘│                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- Left sidebar and right panel are individually collapsible (persist preference in local storage).
- Editor pane expands to fill when side panels are collapsed.
- In split-pane preview mode, the right panel is replaced by the preview pane (right panel hides).

### 7.2 Tablet (600–1024 px)

- Portrait: single-pane. Note list as a sheet/drawer. Editor fills the pane. A bottom tab bar
  gives access to `Properties`, `Backlinks`, `Preview`.
- Landscape (≥768 px): editor + one side panel (Properties or Backlinks, toggled by tab bar).
- Toolbar: full six-button bar in landscape; icon-only (no label) in portrait.
- Source badge and save chip remain in editor header; smaller text (14 px).

```
┌─────────────────────────────────────────────────────────────┐
│  ← Note list  │  Editor (full width)              │ Panel ▶│
│               │ Toolbar: [B][I][⌁][<>][H][≡][···] │        │
│               │ ─────────────────────────────────  │        │
│               │  Source •   •  Save chip            │        │
│               │                                     │        │
│               │   Writing area (max-w 720px)        │        │
│               │                                     │        │
│      [Write] [Properties] [Backlinks] [Preview]             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Mobile (<600 px) — slim single-pane

```
┌─────────────────────────────┐
│ ← Notes   Note Title   ···  │
│ ──────────────────────────  │
│ [Source dot] [Save chip]    │
│ ──────────────────────────  │
│                             │
│   Writing area (full width, │
│   16px horizontal padding)  │
│                             │
│   [word count badge]        │
│ ──────────────────────────  │
│ [B][I][⌁][<>][H][≡]  [+]   │
└─────────────────────────────┘
```

- Top bar: back chevron + note title (truncated) + `···` contextual menu.
- Source badge: icon + status dot only (no label text).
- Toolbar above virtual keyboard: six icon-only buttons + `+` floating insert button.
- Properties sheet: accessed via `···` → "Properties".
- Backlinks: accessed via `···` → "Backlinks".
- Focus mode has no further chrome to hide (mobile is already minimal).
- All commands available on Desktop are reachable on Mobile via the contextual menu or slash
  insert menu — same command, same Processing Core result.

---

## 8. Motion & feedback

| Interaction | Duration | Easing | `prefers-reduced-motion` |
|---|---|---|---|
| Toolbar popover/overflow open | 120 ms | ease-out | instant |
| Slash menu open | 100 ms | ease-out | instant |
| Split pane slide in | 200 ms | ease-in-out | instant |
| Focus mode sidebar collapse | 200 ms | ease-out | instant |
| Conflict-preview table row highlight | 150 ms | ease | instant |
| Save-status chip state transition | 150 ms | ease | instant |
| Autosave spinner rotation | 1000 ms loop | linear | static dots icon |
| Pending source badge dot pulse | 1000 ms loop | ease-in-out | static amber dot |
| Embed pill hover reveal (× button) | 100 ms | ease | visible immediately |
| Wikilink autocomplete popover open | 80 ms | ease-out | instant |
| Bottom sheet slide up (mobile) | 250 ms | ease-in-out | instant |
| Page/section navigation jump | 0 ms | — | same (no animation) |

All animations that loop (spinner, pulse) are fully stopped under `prefers-reduced-motion:
reduce`. Scroll sync between editor and preview is instant (no smooth-scroll animation, to avoid
disorientation). No parallax, no large hero transitions.

---

## 9. Accessibility requirements (surface-specific)

These extend the global requirements in `03-accessibility.md`. WCAG 2.2 SC references are noted.

### 9.1 Editor keyboard trap prevention

WCAG 2.2 §2.1.2 (No Keyboard Trap): pressing Tab inside the writing area must not trap focus.
Implementation: Tab key inserts 4 spaces (document editing); Escape then Tab moves focus out of
the editor to the next tabbable element in the page. This matches the pattern established by
CodeMirror [15] and is the most widely understood convention for web-based code/text editors.
The toolbar, source badge, save chip, and panel tabs must all be reachable by Tab in document
order without entering the writing area.

### 9.2 Focus mode and screen readers

Focus mode hides chrome visually but must not change the accessibility tree: the toolbar,
source badge, and right panel must remain in the a11y tree (with `aria-hidden="false"`) even
when visually dimmed. Screen-reader users must be able to reach the toolbar via Tab without
exiting focus mode.

### 9.3 Live region strategy

| Event | Region type | Copy |
|---|---|---|
| Autosave state change | `aria-live="polite"` | "Saved" / "Saving" / "Autosave paused" |
| Save failed | `aria-live="assertive"` | "Save failed — activate the save chip to retry" |
| Source constraint panel appears | `aria-live="assertive"` | "Warning: write to {Source} will lose features. Review the list and acknowledge before proceeding." |
| Import step advance | `aria-live="polite"` | "Step {N} of {total}: {step name}" |
| Import complete | `aria-live="polite"` | "Import complete: {C} new, {O} overwritten, {S} skipped" |
| Wikilink autocomplete open | `aria-live="polite"` | "{N} suggestions. Use arrow keys to navigate." |
| Rename propagation confirm | (dialog focus) | — (focus move to dialog is sufficient) |
| Visibility state changed | `aria-live="polite"` | "Note visibility changed to {state}" |
| Embed unavailable (render) | (static `aria-label`) | "Embedded content unavailable" |

### 9.4 Color and non-color differentiation

All status states (visibility chip, source badge, wikilink underlines, conflict-table rows) use
icon + text label in addition to color. The product must pass WCAG §1.4.1 (Use of Color): no
state is conveyed by color alone. Minimum contrast for all text against adjacent surface:
4.5:1 (normal text), 3:1 (large text ≥18 px or ≥14 px bold) per WCAG §1.4.3 and §1.4.6
(Enhanced AA targets for the high-legibility requirement of DM-facing content).

### 9.5 Touch targets

All interactive elements on Tablet and Mobile: ≥44×44 CSS px touch target per WCAG 2.2 §2.5.8.
Elements smaller than 44 px visually (e.g., the 20×20 visibility gutter marker) must have an
invisible touch target extension via padding or absolute pseudo-element to meet the 44 px minimum.
The 8×8 px source badge status dot is non-interactive; only the badge as a whole (≥44 px tap
area) is interactive.

### 9.6 Import wizard focus management

On each wizard step transition, focus must move to the first heading of the new step content.
After import completes, focus moves to the "View import report" link. On dialog close, focus
returns to the "Import" button that opened the wizard. All transitions announced via `aria-live`.

---

## 10. Anti-patterns & explicit limitations

The following are hard prohibitions. Each has a researched reason and must not be implemented
even if a competitor uses the pattern.

**1. Placeholder text as a substitute for visible labels.**
Using `placeholder` as the only label for a form field (frontmatter, import archive, template
variable) violates WCAG 2.2 §1.3.1 and §3.3.2. Placeholders disappear when the user types,
causing errors in long forms and failing users with cognitive disabilities [9][16]. Every field
must have a persistent visible `<label>` element. Placeholders are for example-format hints only.

**2. Silent autosave failure.**
An autosave that fails without surfacing a visible, persistent error state causes data loss. The
save-status chip must transition to the `failed` state with an explicit retry affordance. Showing
a toast that auto-dismisses in 3 s is insufficient — the user may not see it, and the failure
state is then invisible. Silent failure has been identified as a primary cause of user-reported
data loss in collaborative writing tools [7].

**3. Ambiguous source-of-truth.**
Opening a note without knowing whether it is synced from Local, Obsidian, or Google Docs, and
which version is "current," causes the DM to make edits that are silently overwritten on next
sync. The source badge must always be visible in the note list row and in the open editor header.
"Source ambiguity" was identified as a top complaint in Notion's synced-block implementation and
subsequently addressed with explicit source labels [4].

**4. Destructive import without conflict preview.**
Allowing a "commit" action on the import wizard without first loading and displaying the conflict-
preview table is prohibited. The preview step is not optional or skippable. Git merge-tool
research [11] shows that skipping the diff step leads to significantly higher rates of accidental
data overwrite. The commit button must not appear until the preview table is loaded.

**5. Blanket conflict policy without per-item override.**
A single global "overwrite all" or "skip all" policy with no per-item escape hatch forces the DM
to choose between two extremes — neither of which may be correct for a mixed import where some
collisions should be overwritten and some skipped. Per-item override in the conflict table is a
requirement, not an enhancement.

**6. Leaking hidden sections in preview, export, or embed.**
The split-pane preview in the editor must apply actor-filtered projection: `dm-only` sections and
fields must not appear in the rendered preview pane (which represents what a player sees). Portable
export must exclude `dm-only` content; the validation report's "clean" flag must be checked before
the export package is made available. Embeds of `dm-only` targets must show the "Content
unavailable" placeholder, never any field value or title. Leaking is a safety failure, not a UX
defect, and is treated as a blocking bug.

**7. Color-only visibility or status differentiation.**
Using only red/green/amber to convey `dm-only` / `player-visible` / `shared` fails WCAG §1.4.1
and fails users with color-vision deficiencies. Every state must have a unique icon and a text
label, with color as a reinforcing layer only.

**8. Toast-only feedback for long-running operations.**
Showing only a toast notification (which auto-dismisses) as the completion indicator for import
or export operations fails users who are not watching the screen continuously. Completions must
be indicated by a persistent result state in the wizard's own UI (success summary panel, import
report) in addition to any toast. Toasts are supplementary, not the primary completion signal.

**9. Synchronous write-back without constraint check.**
Writing a note back to Google Docs or an Obsidian vault without first running the constraint check
(even if the note has not changed since the last check) risks silent data loss. The constraint
check must run on every write-back dispatch, not just on first save. The acknowledgment token is
tied to the specific content and source state; a stale token is rejected by the Processing Core.

**10. Gregorian date picker for campaign dates.**
Showing the OS `<input type="date">` picker for in-world dates imposes a Gregorian calendar on a
custom fictional world and produces dates (2024-01-15) that are meaningless in the campaign
context. The campaign date picker must use the defined campaign calendar's month names and day
counts. If no calendar is defined, a text input with explicit guidance is the correct fallback.

**11. Tab-key focus trap in the writing area.**
Making Tab insert content without an escape path (Escape + Tab to exit) violates WCAG 2.2 §2.1.2
and makes the editor unusable by keyboard-only users. The Escape-then-Tab pattern is required.

**12. Wikilink autocomplete that queries hidden notes.**
The wikilink autocomplete must query only the actor-filtered graph. A player using the autocomplete
must not see `dm-only` note titles as suggestions — revealing titles is as harmful as revealing
content. The autocomplete query must pass through the same actor-filter as all other content reads.

---

## 11. Success metrics

| Metric | Target |
|---|---|
| Time to open and begin editing an existing note (Desktop) | ≤2 s from tap/click |
| Time to open and begin editing an existing note (Mobile) | ≤3 s from tap |
| Autosave round-trip latency (local vault) | ≤800 ms p95 |
| Save-status chip update after keystroke pause | ≤2 s |
| Wikilink autocomplete first results | ≤80 ms from `[[` |
| Import conflict-preview table load (100-file import) | ≤3 s |
| First-task success (create a note from a template, first-run) | ≥80 % without assistance |
| First-task success (import a 10-note archive with 2 collisions, first-run) | ≥75 % without assistance |
| Visibility marker recognition (user can identify note visibility state) | ≥90 % on tree-test |
| Source badge recognition (user can identify note source) | ≥85 % on tree-test |
| WCAG 2.2 AA automated scan | 0 critical violations (axe) |
| DM-only content leak detection rate | 0 leaks in any export or embed test |
| Keyboard-only task completion (editor open, write, save, close) | 100 % success |
| Touch target compliance (≥44×44 CSS px) | 100 % of interactive elements on Tablet/Mobile |
| Perceived performance: editor feels "fast" (user survey) | ≥85 % |

---

## 12. Open questions & risks

1. **File-system picker for import (ADR-014 deferral):** The current implementation uses a
   paste-with-headers archive format. When a native file-system picker is available (post-
   ADR-014), the Step 1 of the import wizard should offer both paths (paste and file-picker).
   The UX for the file-picker variant (folder browser for Obsidian vault, multi-file select for
   markdown archive) needs a separate design pass.

2. **Three-way merge editor for conflicts:** The import wizard currently offers Skip / Overwrite /
   Merge as policy options. The "Merge" action's implementation (what a merged note looks like,
   how conflicts within a single note are resolved) is owned by `12-sync-offline-reliability.md`.
   This document assumes "Merge" results in a conflict record visible to the DM; the specific
   merge-conflict UI within the note body is a dependency on doc 12.

3. **Google Docs bi-directional sync trigger:** The source-constraint diagnostic and write-back
   flow specified here (UX-CONTENT-014) assume the DM explicitly triggers a write-back. If Google
   Docs sync is continuous/automatic, the explicit "Write to source" button model needs revision —
   the constraint check must then become a pre-save gate, not a separate explicit dispatch. Sync
   transport decisions are owned by `12-sync-offline-reliability.md`; this UX doc must be updated
   when that decision is finalized.

4. **Snippet and template management UI:** This document specifies the insert and create-from-
   template flows, but does not specify the management surface (creating new snippets, editing
   existing templates, naming/categorizing). That surface is a DM-only admin panel that needs
   a separate design pass before implementation.

5. **Rich-text vs. pure-markdown editing model:** The requirements specify "rich-text + markdown
   editing" (Typora-style live rendering). If the editor implementation uses a ProseMirror or
   Tiptap base rather than CodeMirror, some keyboard shortcuts and focus-trap escape patterns
   may differ. The accessibility requirements (§9.1) must be re-validated against the actual
   editor library chosen.

6. **Wikilink autocomplete across source boundaries offline:** When the Obsidian vault or Google
   Docs is unavailable offline, the autocomplete must still work against the locally-cached graph.
   The UX for "this note exists in the graph but its source is offline" (shown in the autocomplete
   item) needs a clear visual treatment — the current spec shows the source badge on each autocomplete
   item, which should be sufficient, but the behavior when the selected link target is online-only
   needs to be confirmed with the sync-engine design.

---

## Sources

[1] iA Inc. — iA Writer — https://ia.net/writer

[2] Shiny Frog — Bear — https://bear.app

[3] Abner Lee — Typora — https://typora.io

[4] Notion Labs — Notion Help Center (slash commands, synced blocks, database properties) — https://www.notion.so/help

[5] GitHub, Inc. — GitHub Flavored Markdown editor — https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax

[6] HackMD Team — HackMD (split-pane markdown editor) — https://hackmd.io

[7] Google — Google Docs (autosave and version history) — https://support.google.com/docs/answer/190843

[8] Linear — Linear docs (document editor, saving status) — https://linear.app/docs

[9] Jakob Nielsen / NN Group — "10 Usability Heuristics for User Interface Design" — https://www.nngroup.com/articles/ten-usability-heuristics/

[10] Obsidian — Obsidian Help (Properties, internal links, rename propagation) — https://help.obsidian.md/Editing+and+formatting/Properties

[11] Microsoft — VS Code three-way merge editor documentation — https://code.visualstudio.com/docs/sourcecontrol/overview#_3way-merge-editor

[12] Linear — Linear migration / import documentation — https://linear.app/docs/import

[13] GitHub, Inc. — GitHub repository fork and upstream status — https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks

[14] Craft Docs — Craft backlink and note-linking features — https://support.craft.do/hc/en-us/articles/360019555480-Backlinks

[15] CodeMirror — Accessibility documentation (Tab key and escape) — https://codemirror.net/docs/guide/#accessibility

[16] Nielsen Norman Group — "Placeholders in Form Fields Are Harmful" — https://www.nngroup.com/articles/form-design-placeholders/
