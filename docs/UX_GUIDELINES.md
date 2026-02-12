# UX Guidelines

This document defines user experience principles, interaction patterns, and accessibility requirements for DND Tools.

---

## Target Users

### Primary Persona: The DM (Dungeon Master)

- Manages campaign notes: NPCs, locations, lore, session recaps, quests
- Frequently cross-references notes during sessions (often under time pressure)
- Uses a variety of devices — laptop at home, tablet at the table, phone for quick lookups
- May not be highly technical — the app should feel intuitive, not like a code editor
- Cares deeply about their content — notes represent hours of creative work

### Secondary Persona: The Player

- Maintains character notes, session logs, and reference material
- Lighter usage than a DM — fewer notes, simpler linking
- More likely to be on mobile during sessions

### Key Insight

Users interact with this app during **active D&D sessions** where attention is split between the game and the tool. The UI must be:
- **Scannable**: Find the right note in seconds, not minutes
- **Non-disruptive**: Quiet, unobtrusive interface that doesn't pull focus from the game
- **Reliable**: Never lose data. Auto-save everything. No "did I save?" anxiety

---

## Core UX Principles

### 1. Content First

The user's notes are the product. The UI should be nearly invisible — a frame around their content, not a distraction.

- Maximize content area; minimize chrome
- Default to a clean reading view, not an editing view
- Navigation should be accessible but not always visible (collapsible sidebar)
- No ads, upsells, or non-essential banners

### 2. Instant Response

Every interaction should feel immediate. On weak devices, perceived performance matters even more than actual performance.

| Interaction              | Target Response Time | Approach                                |
| ------------------------ | -------------------- | --------------------------------------- |
| Navigation / page switch | < 100ms              | Client-side routing, prefetched data    |
| Search results appear    | < 200ms              | Client-side index, debounced input      |
| Note save                | < 50ms               | Optimistic UI, background persistence   |
| Editor load              | < 500ms              | Lazy load, show skeleton immediately    |
| App cold start           | < 2s                 | Minimal initial bundle, streaming load  |

Techniques:
- **Skeleton screens** while loading (not spinners)
- **Optimistic updates** — show the result immediately, persist in background
- **Prefetching** — anticipate next navigation (e.g., preload linked notes on hover)

### 3. Zero Data Loss

Users' creative work is irreplaceable. The app must protect it aggressively.

- **Auto-save** every change with a 500ms debounce. No manual save button needed.
- **Unsaved indicator**: If auto-save fails, show a clear visual indicator and retry
- **Version history** (future): Allow viewing and restoring previous versions of a note
- **Export always available**: Users can export their entire vault to markdown files at any time
- **Confirmation for destructive actions**: Delete a note? Confirm with undo option (soft delete with 30-day recovery)

### 4. Progressive Disclosure

Show simple things first; reveal complexity when needed.

- Default view is a clean note reader
- Edit mode is one click/tap away
- Advanced features (graph view, bulk operations, metadata editing) are in secondary locations
- Settings are organized from most common to least common
- First-time users see a gentle onboarding: a welcome note that teaches the basics

### 5. Keyboard-Driven (with Mouse Parity)

Power users will navigate primarily with the keyboard. But every keyboard shortcut must also have a mouse/touch equivalent.

**Core keyboard shortcuts**:

| Shortcut          | Action                           |
| ----------------- | -------------------------------- |
| `Ctrl/Cmd + N`    | Create new note                  |
| `Ctrl/Cmd + P`    | Quick note switcher (command palette) |
| `Ctrl/Cmd + E`    | Toggle edit / view mode          |
| `Ctrl/Cmd + K`    | Insert link (in editor)          |
| `Ctrl/Cmd + F`    | Search within current note       |
| `Ctrl/Cmd + Shift + F` | Global search across vault  |
| `Ctrl/Cmd + B`    | Toggle sidebar                   |
| `Ctrl/Cmd + [`    | Navigate back                    |
| `Ctrl/Cmd + ]`    | Navigate forward                 |
| `Escape`          | Close modal / exit edit mode     |

**Quick switcher** (Ctrl+P) is the most important power-user feature:
- Fuzzy search across all note titles
- Shows recent notes first
- Keyboard navigable (arrow keys + Enter)
- Opens in < 100ms

---

## Visual Design

### Theme: D&D Aesthetic, Modern Interface

The visual design strikes a balance between a D&D-thematic atmosphere and modern usability. It should evoke the feel of a well-organized adventure journal without sacrificing clarity.

### Color Palette

**Light Mode** (Parchment):
```
Background:     #FAF6F0  (warm parchment)
Surface:        #FFFFFF  (cards, modals)
Border:         #E5DDD3  (subtle warm gray)
Text Primary:   #2C1810  (dark ink brown)
Text Secondary: #6B5B4F  (muted brown)
Accent:         #8B4513  (saddle brown — links, active states)
Accent Hover:   #A0522D  (sienna)
Success:        #2E7D32  (forest green)
Warning:        #E65100  (flame orange)
Error:          #B71C1C  (deep red)
```

**Dark Mode** (Tavern):
```
Background:     #1A1410  (dark wood)
Surface:        #2C2420  (lighter wood)
Border:         #3D3530  (wood grain)
Text Primary:   #E8DDD0  (warm cream)
Text Secondary: #A89888  (muted tan)
Accent:         #D4A76A  (gold/amber)
Accent Hover:   #E0BE85  (brighter gold)
Success:        #66BB6A  (leaf green)
Warning:        #FFA726  (torch orange)
Error:          #EF5350  (bright red)
```

### Typography

System font stack — no web font downloads:

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-serif: Georgia, 'Times New Roman', serif;  /* Optional: for note content */
--font-mono: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
```

**Type scale**:

| Element         | Size   | Weight | Line Height |
| --------------- | ------ | ------ | ----------- |
| H1              | 1.75rem| 700    | 1.2         |
| H2              | 1.5rem | 600    | 1.25        |
| H3              | 1.25rem| 600    | 1.3         |
| Body            | 1rem   | 400    | 1.6         |
| Small / Caption | 0.875rem| 400   | 1.4         |
| Code            | 0.9rem | 400    | 1.5         |

Note content uses a generous line height (1.6-1.8) for readability during long reading sessions.

### Spacing & Layout

- Base spacing unit: 4px (Tailwind default)
- Content max-width: 720px for note reading (optimal line length ~65-75 characters)
- Sidebar width: 260px (collapsible on mobile)
- Consistent padding: 16px on mobile, 24px on tablet, 32px on desktop

### Icons

Use a lightweight, outline-style icon set. Recommendations:
- [Lucide Icons](https://lucide.dev/) — fork of Feather with more icons, tree-shakeable, ~1KB per icon
- Import only the icons used (never the full set)
- Icon size: 16px inline, 20px buttons, 24px navigation

---

## Layout Patterns

### Main Layout

```
┌──────────────────────────────────────────────┐
│ ┌──────┐                                     │
│ │ ≡    │  DND Tools           [🔍] [+] [⚙]  │  ← Top bar (compact)
│ └──────┘                                     │
├──────────┬───────────────────────────────────┤
│          │                                   │
│ Sidebar  │          Main Content             │
│          │                                   │
│ - Vault  │   ┌─────────────────────────┐     │
│   tree   │   │                         │     │
│ - Recent │   │     Note Content        │     │
│ - Tags   │   │                         │     │
│ - Search │   │                         │     │
│          │   │                         │     │
│          │   └─────────────────────────┘     │
│          │                                   │
│          │   ┌─────────────────────────┐     │
│          │   │ Backlinks (collapsed)   │     │
│          │   └─────────────────────────┘     │
│          │                                   │
└──────────┴───────────────────────────────────┘
```

**Mobile layout** (< 768px):
- Sidebar becomes a slide-out drawer (triggered by hamburger icon)
- Full-width content area
- Bottom navigation bar for core actions (home, search, new note)
- Swipe gestures: left for back, right for sidebar

### Note View

```
┌─────────────────────────────────────┐
│ Note Title                    [Edit]│
│ folder / tags / modified date       │
├─────────────────────────────────────┤
│                                     │
│ Rendered markdown content           │
│                                     │
│ [[Linked Note]] appears as a        │
│ clickable link styled distinctly    │
│                                     │
│ > Callout blocks are styled with    │
│ > D&D-thematic borders              │
│                                     │
├─────────────────────────────────────┤
│ ▶ Backlinks (3)                     │
│   - Campaign Overview               │
│   - Session 12 Notes                │
│   - NPC: Barthen                    │
└─────────────────────────────────────┘
```

### Note Editor

```
┌─────────────────────────────────────┐
│ [Back] Note Title (editable)  [Done]│
├─────────────────────────────────────┤
│ Toolbar: B I ~ Link Image List Code │
├─────────────────────────────────────┤
│                                     │
│ CodeMirror editor area              │
│                                     │
│ - Syntax highlighted markdown       │
│ - [[wikilink]] autocomplete         │
│ - Live preview decorations          │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ Auto-saved ✓           1,234 words  │
└─────────────────────────────────────┘
```

---

## Interaction Patterns

### Note Linking (Wikilinks)

The core feature that distinguishes this from plain note-taking:

**Creating links**:
1. Type `[[` in the editor
2. Autocomplete dropdown appears with matching note titles
3. Continue typing to filter; arrow keys to navigate
4. Press Enter or Tab to insert the link
5. If no match: option to "Create new note: [title]"

**Clicking links**:
1. In view mode: click `[[Note Name]]` to navigate directly
2. In edit mode: Ctrl/Cmd + click to navigate (regular click places cursor)
3. If the target note doesn't exist: navigate to a creation page pre-filled with the title

**Backlinks panel**:
- Collapsed by default at the bottom of a note
- Shows all notes that link TO the current note
- Each backlink shows a snippet of surrounding context
- Clicking a backlink navigates to that note

### Search

**Global search** (Ctrl+Shift+F):
- Full-text search across all notes
- Results show: note title, folder path, matching snippet with highlighted terms
- Results ranked by relevance (title matches > body matches)
- Filters: by folder, by tag, by date range

**Quick switcher** (Ctrl+P):
- Fuzzy search on note titles only
- Optimized for speed — results appear as you type
- Recent notes shown by default before typing

### Create Note

Multiple entry points:
1. `+` button in the top bar
2. Ctrl/Cmd + N keyboard shortcut
3. Clicking a wikilink to a non-existent note
4. Right-click in sidebar → "New Note"

New note flow:
1. Opens editor with cursor in title field
2. Auto-generates a slug-based ID from the title
3. Defaults to the currently active folder
4. Content area is immediately focusable

### Delete Note

Safety-first deletion:
1. User triggers delete (button or shortcut)
2. Confirmation dialog: "Delete [Note Title]? This note has 3 backlinks."
3. Shows which notes link to it (breaking links warning)
4. Soft delete: note moves to a "Trash" folder
5. 30-day retention before permanent deletion
6. Undo available immediately after deletion

---

## Accessibility Requirements

### WCAG 2.1 AA Compliance

This is not optional. The app must meet WCAG 2.1 AA standards:

**Perceivable**:
- Color contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text
- Never convey information by color alone (add icons, text, or patterns)
- All images have alt text; decorative images have `alt=""`
- Content is readable at 200% zoom without horizontal scrolling

**Operable**:
- All functionality is accessible via keyboard
- Focus indicators are clearly visible (not just default browser outline)
- No keyboard traps — Tab/Shift+Tab always progresses
- Skip navigation link at the top for screen readers
- No time-based interactions without user control

**Understandable**:
- Language attribute set on `<html>`
- Error messages are descriptive and suggest corrections
- Consistent navigation across all pages
- Labels are associated with their form controls

**Robust**:
- Valid semantic HTML
- ARIA attributes used correctly (not overused — prefer native semantics)
- Tested with screen readers (VoiceOver, NVDA)

### Focus Management

- Modal dialogs trap focus inside them
- When a modal closes, focus returns to the triggering element
- Route changes move focus to the main content heading
- Dynamic content updates use `aria-live` regions

### Motion & Animation

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- All animations respect `prefers-reduced-motion`
- No autoplaying animations
- Transition durations: 150ms for micro-interactions, 300ms for page transitions

---

## Loading States

### Skeleton Screens (preferred over spinners)

```
┌─────────────────────────────────────┐
│ ████████████████                    │  ← Title placeholder
│ ████ ██ ████████                    │  ← Metadata placeholder
├─────────────────────────────────────┤
│ ████████████████████████████████    │
│ ██████████████████████████          │  ← Content placeholder
│ ████████████████████████████████    │
│ ██████████████████                  │
│                                     │
│ ████████████████████████████████    │
│ ██████████████                      │
└─────────────────────────────────────┘
```

- Use subtle pulse animation (respecting reduced motion preference)
- Match the layout of the actual content for a smooth transition
- Show skeletons for < 2 seconds; if loading takes longer, add a text hint

### Empty States

When there are no notes/results, show helpful guidance:

```
┌─────────────────────────────────────┐
│                                     │
│         📜 No notes yet             │
│                                     │
│   Start building your campaign by   │
│   creating your first note.         │
│                                     │
│        [ Create a Note ]            │
│                                     │
│   Tip: Use [[double brackets]] to   │
│   link notes together.              │
│                                     │
└─────────────────────────────────────┘
```

---

## Mobile-Specific Considerations

### Touch Targets

- Minimum touch target: 44x44px (WCAG guideline)
- Spacing between tap targets: ≥ 8px
- Swipe gestures have visible affordances (edge peeking for sidebar)

### Mobile Navigation

- Bottom navigation bar with 3-4 core actions
- Sidebar accessed via hamburger menu or edge swipe
- Back button behavior matches native app expectations
- URL bar hidden when possible (standalone PWA mode)

### Mobile Editor

- Toolbar sticks above the virtual keyboard
- Auto-scroll to cursor position when keyboard appears
- Larger tap targets for toolbar buttons
- Consider a simplified toolbar on very small screens

### Offline Indicators

- When offline: subtle indicator in the status area (not blocking)
- When sync fails (future): toast notification with retry option
- Never block the user from reading or editing due to network state

---

## Onboarding

### First Launch

1. Welcome screen: Brief intro to DND Tools with a "Get Started" button
2. Auto-create a "Welcome" note that demonstrates:
   - Basic markdown formatting
   - How to create `[[wikilinks]]`
   - How to use tags and frontmatter
   - Links to help documentation
3. Sidebar is open by default on first launch (closed on subsequent visits per user preference)
4. Subtle tooltip hints on first interactions (dismiss permanently after shown once)

### Feature Discovery

- Use progressive disclosure — don't show everything at once
- Keyboard shortcuts shown in tooltip on hover (e.g., button tooltip: "New Note (Ctrl+N)")
- Command palette (Ctrl+P) shows available shortcuts as a reminder
- Help page accessible from settings with full feature reference
