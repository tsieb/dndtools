# Initiative 15 — Design System & Visual Language

## Status: COMPLETED

**Outcome:** Every UI element in the application is built from a coherent, documented
design system. Visual consistency is enforced by component reuse, not by convention.
The TTRPG visual character of the application — the parchment, the ink, the drama of a
roll — is expressed through intentional design decisions, not accidental theme tokens.
A new contributor can build a compliant UI surface by reading the component documentation
and using existing components, without inspecting source files for class name patterns.

**Depends on:** I13 (IA and navigation structure must be stable before components that
render navigation can be finalised), I14 (layout tokens must be defined before density
and spacing systems are built)

**Root-cause diagnosis:**

The current styling approach places every Tailwind class inline in each component.
`dark:bg-tavern-surface`, `hover:bg-parchment`, `text-ink-muted`, `text-[10px]`,
`text-[11px]`, `px-2.5 py-1.5` — these strings are repeated verbatim across dozens
of files. The result: changing a hover color requires grep-and-replace across 30+
files. Typography is not a scale — it is individual size decisions made per component
(`text-[10px]`, `text-[11px]`, `text-xs`, `text-sm` all appear in the sidebar alone).
The "tavern" dark theme exists as a parallel color namespace (`--color-tavern-*`) but
is not a proper design token override system — it is a second set of colors that every
component references individually using `dark:` prefixes. SVG icons are inlined as
markup in 40+ locations. The Button component exists (`src/lib/ui/common/Button.svelte`)
but most button instances in the codebase are raw `<button>` elements with long
class strings. There is no storybook, no component documentation, and no automated
visual regression testing.

---

## Epic 15.1 — Design Token Architecture

**Goal:** All visual decisions in the application — color, spacing, typography, motion,
elevation — are expressed as CSS custom properties following a semantic token hierarchy.
No hardcoded hex values, raw pixel sizes, or Tailwind color names appear in components.

**Stories:**

- **S15.1.1 — Semantic color token layer**
  Redesign `app.css` to define a semantic color token layer separate from the raw
  palette. The palette (the raw hex values for parchment, tavern-surface, etc.) is the
  foundation; the semantic layer maps roles to palette values:
  - `--color-bg`: the page background
  - `--color-surface`: card/panel background
  - `--color-surface-elevated`: floating elements (dropdowns, tooltips)
  - `--color-border`: standard dividers
  - `--color-border-strong`: emphasis dividers
  - `--color-text`: primary body text
  - `--color-text-subtle`: secondary text
  - `--color-text-faint`: disabled / decorative text
  - `--color-primary`: accent/brand (saddle brown in light; warm gold in dark)
  - `--color-primary-hover`: darkened accent for hover states
  - `--color-primary-subtle`: low-saturation accent fill for active nav items
  - `--color-success`, `--color-warning`, `--color-error`: status colors
  - `--color-focus-ring`: keyboard focus ring color
    Light theme maps these to parchment palette values. Dark theme overrides them with
    tavern palette values using `html.dark { --color-bg: var(--color-tavern-bg); ... }`.
    Components reference semantic tokens exclusively; the `dark:` Tailwind prefix is
    abolished from structural and component styling (only kept for content-specific
    markdown rendering).

- **S15.1.2 — Typography scale tokens**
  Define a strict typography scale as CSS custom properties:
  - `--text-2xs`: 10px / 1.4 (badge counts, micro labels)
  - `--text-xs`: 12px / 1.5 (helper text, timestamps)
  - `--text-sm`: 13px / 1.5 (secondary body, nav items)
  - `--text-base`: 15px / 1.6 (primary body)
  - `--text-md`: 17px / 1.5 (emphasized body, subheadings)
  - `--text-lg`: 20px / 1.4 (section headings)
  - `--text-xl`: 24px / 1.3 (page titles)
  - `--text-2xl`: 30px / 1.2 (display use)
    Replace all `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm` instances with
    Tailwind utilities mapped to these tokens via `@theme` extension. Letter-spacing
    tokens: `--tracking-tight` (-0.01em for headings), `--tracking-normal` (0 default),
    `--tracking-wide` (0.05em for uppercase labels). Font-weight tokens:
    `--weight-normal` (400), `--weight-medium` (500), `--weight-semibold` (600),
    `--weight-bold` (700).

- **S15.1.3 — Spacing scale tokens**
  Define a spacing scale as multiples of a 4px base unit:
  `--space-0.5` (2px), `--space-1` (4px), `--space-1.5` (6px), `--space-2` (8px),
  `--space-3` (12px), `--space-4` (16px), `--space-5` (20px), `--space-6` (24px),
  `--space-8` (32px), `--space-10` (40px), `--space-12` (48px), `--space-16` (64px).
  Component token layer builds on this: `--component-nav-item-px` (12px = space-3),
  `--component-nav-item-py` (6px = space-1.5), `--component-card-padding` (16px).
  Components must not use arbitrary Tailwind spacing values for structural sizing.

- **S15.1.4 — Motion and elevation tokens**
  Motion tokens:
  - `--duration-instant`: 0ms (used when reduced-motion is active)
  - `--duration-fast`: 100ms (micro-interactions: button press, toggle)
  - `--duration-medium`: 200ms (panel transitions, dropdown open)
  - `--duration-slow`: 350ms (sheet slide-in, page transition)
  - `--easing-standard`: cubic-bezier(0.4, 0, 0.2, 1) (Material-style standard)
  - `--easing-decelerate`: cubic-bezier(0, 0, 0.2, 1) (elements entering screen)
  - `--easing-accelerate`: cubic-bezier(0.4, 0, 1, 1) (elements leaving screen)
    Add `@media (prefers-reduced-motion: reduce) { :root { --duration-fast: 0ms;
--duration-medium: 0ms; --duration-slow: 0ms; } }` to globally collapse all
    CSS transitions. Elevation tokens:
  - `--shadow-sm`: subtle card shadow (0 1px 3px rgba(0,0,0,0.08))
  - `--shadow-md`: panels, dropdowns (0 4px 12px rgba(0,0,0,0.12))
  - `--shadow-lg`: modals, overlays (0 8px 24px rgba(0,0,0,0.18))

---

## Epic 15.2 — Icon System

**Goal:** All icons in the application come from a single, tree-shakeable library,
accessed through an `Icon` component. The icon vocabulary for domain concepts is
documented and enforced. No inline SVG markup remains in component files.

**Stories:**

- **S15.2.1 — Icon library selection and integration**
  Evaluate Lucide Icons and Phosphor Icons for compatibility with the TTRPG visual
  context. Selection criteria: (a) contains relevant concepts (map, dice, sword/weapon
  for combat, scroll for notes, calendar, users/person, clock); (b) available as a
  Svelte-compatible tree-shakeable import; (c) consistent stroke weight and style across
  all icons; (d) permissive licence. Integrate the chosen library as a dev dependency.
  Total icon bundle contribution must not exceed 8KB gzipped for the subset used.

- **S15.2.2 — Icon component with size and color tokens**
  Build `src/lib/ui/common/Icon.svelte` with props: `name` (string, required),
  `size` ('xs' | 'sm' | 'md' | 'lg' = 'md'), `color` (CSS custom property name,
  optional). The component maps size to px: xs=12, sm=16, md=20, lg=24. It renders
  the correct SVG from the library, sets `aria-hidden="true"` by default (icons are
  decorative unless a sibling label is absent). When used without a sibling text label,
  the parent must supply `aria-label`. All 40+ inline SVG blocks throughout the
  codebase are replaced with `<Icon name="..." />` calls.

- **S15.2.3 — Domain icon vocabulary specification**
  Define and document the canonical icon for every domain concept in
  `docs/reference/ICON_VOCABULARY.md`:
  - note → scroll (or document)
  - folder → folder
  - tag → tag / hashtag
  - wikilink → link-2 (chain link)
  - map → map
  - location → map-pin
  - session → play-circle (active session) / layout-dashboard (board)
  - combat → swords (crossed swords if available, else sword)
  - dice → dice-5 (or D20 icon from domain library)
  - character → user (player) / user-crown (DM) / skull (NPC)
  - faction → users
  - timeline → git-commit (linear) / activity (time-based)
  - calendar → calendar
  - search → search
  - settings → settings
  - create / add → plus-circle
  - pin → pin
  - archive → archive
  - delete → trash-2
  - health → heart-pulse / activity
    No two domain concepts share an icon. Every use of an icon in the application for a
    domain concept uses the canonical vocabulary icon.

---

## Epic 15.3 — Core Component Library Rebuild

**Goal:** Every repeated UI pattern in the application is a component. A new page can
be built entirely from components without inventing new class combinations. The component
library is the authoritative implementation of the design system.

**Stories:**

- **S15.3.1 — Button component system**
  Expand `src/lib/ui/common/Button.svelte` from its current minimal state to a complete
  system. Props: `variant` ('primary' | 'secondary' | 'ghost' | 'danger' | 'link'),
  `size` ('sm' | 'md' | 'lg'), `disabled`, `loading` (shows spinner, disables),
  `icon` (leading Icon name), `trailingIcon` (trailing Icon name). Variants:
  - primary: accent background, white text, accent-hover on hover
  - secondary: border + surface, text color, surface-alt on hover
  - ghost: no border, no background, text on hover (nav-style)
  - danger: error-color border and text, error-subtle background on hover
  - link: underline on hover, inline-able
    All instances of raw `<button class="...">` that constitute primary/secondary actions
    are replaced with the Button component. Count of raw button elements in UI components
    (excluding role=menuitem and role=tab which are structural) must reach zero.

- **S15.3.2 — Input and form component system**
  Build: `Input.svelte` (text, password, number; props: label, placeholder, error,
  helper, disabled, leadingIcon, trailingIcon), `Textarea.svelte` (auto-expanding
  option), `Select.svelte`, `Checkbox.svelte`, `Toggle.svelte` (replaces the DM/Player
  mode switch button), `TagInput.svelte` (for note tag editing). Each component uses
  semantic tokens for all visual properties. Error state shows a red border, an error
  icon, and error text below — error is never communicated by color alone. Labels are
  always visible — no placeholder-as-label pattern.

- **S15.3.3 — Navigation components (NavItem, NavSection, NavRail, NavBar)**
  Build the navigation component suite:
  - `NavItem.svelte`: a navigation link or button with icon, label, badge (number or
    dot), active state, and sub-level indentation prop. Used for all nav entries.
  - `NavSection.svelte`: a collapsible section wrapper with header (label + caret +
    optional action icon). Used for sidebar panel sections.
  - `NavRail.svelte`: the vertical icon rail for Medium/Expanded layouts. Renders a
    column of NavItem entries in icon-only mode.
  - `NavBar.svelte`: the horizontal bottom navigation bar for Compact layout. Renders
    five NavItem entries in icon+label mode.
    All current sidebar navigation link patterns (`<a class="flex items-center gap-2.5
px-2.5 py-1.5...">`) are replaced with NavItem.

- **S15.3.4 — Card and list components**
  Build: `Card.svelte` (with slots: header, body, footer; props: interactive bool,
  padding, elevation), `ListItem.svelte` (leading icon, title, subtitle, trailing
  element, action slot; keyboard-activatable). Refactor `NoteCard.svelte` to use Card.
  Refactor all entity list rows in Campaign section to use ListItem. The stat block
  renderer uses Card as its outer container. These components enforce consistent padding,
  typography, and spacing without per-instance class lists.

- **S15.3.5 — Dialog, Sheet, and Popover components**
  Build:
  - `Dialog.svelte`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus
    trap on open (moves focus to first interactive element), focus restore on close
    (to the trigger element), Escape-to-close. Used for: confirm dialogs, template
    picker, any modal-pattern overlay.
  - `Sheet.svelte`: bottom-anchored variant of Dialog for mobile. Slides in from below
    with a drag-handle. Inherits focus trap behaviour.
  - `Popover.svelte`: non-modal, positioned relative to anchor element, closes on
    outside click and Escape. Used for: folder context menu (replaces current custom
    div), create menu in TopBar, command palette suggestions.
  - `Tooltip.svelte`: appears on hover + focus, `role="tooltip"`, linked to trigger via
    `aria-describedby`. Replaces all `title` attribute usage in the application.

- **S15.3.6 — Toast and notification components**
  Refactor `src/lib/ui/common/Toast.svelte` and `src/lib/state/toast.svelte.ts` to
  use the semantic token system. Add toast variants: 'info', 'success', 'warning',
  'error' — each with a distinct icon and color from the semantic token layer. Toasts
  are `role="status"` (info/success) or `role="alert"` (warning/error) for screen
  reader announcement. Toasts auto-dismiss and can be manually dismissed with a close
  button. The dismiss button has `aria-label="Dismiss notification"`.

---

## Epic 15.4 — TTRPG Visual Language

**Goal:** The application looks and feels like a premium TTRPG tool. The visual language
expresses craft, mystery, and utility simultaneously. D&D-specific UI elements (stat
blocks, character sheets, session boards) have canonical visual treatments that feel
intentional and cohesive.

**Stories:**

- **S15.4.1 — Theme architecture: four presets**
  Replace the binary light/dark toggle with a theme preset system. Four presets:
  - **Parchment** (light default): warm off-white backgrounds, saddle-brown accents,
    ink-dark text. The current light theme.
  - **Tavern** (dark default): deep brown-black surfaces, warm gold accents, cream text.
    The current dark theme.
  - **Scholar** (light, higher contrast): cooler white surfaces, navy accents, near-black
    text. Appropriate for note-heavy worldbuilding work.
  - **Dungeon** (dark, high contrast): near-black surfaces, bright cyan accents, white
    text. Maximum contrast for dimly lit table environments.
    Presets are stored as CSS variable override sets, toggled by adding a class to
    `<html>`. System light/dark preference maps to Parchment/Tavern by default. User
    can override in Settings. The theme toggle in the TopBar is removed (moved to
    Settings → Appearance and the overflow menu on mobile).

- **S15.4.2 — Note content rendering visual upgrade**
  Upgrade the rendered note content (markdown output) visual treatment:
  - `<h1>`–`<h3>` in note content use serif font (`--font-serif: Palatino...`), larger
    sizes with generous top margin and an optional decorative underline rule.
  - Callout blocks via blockquote with a `[!TYPE]` convention: `[!Lore]`, `[!Warning]`,
    `[!Tip]`, `[!Secret]` each render as a visually distinct callout with an icon,
    colored left border, and subtle background tint. `[!Secret]` renders with a blurred
    content that unblurs on hover (DM-only content indicator).
  - Tables in notes get proper styling: alternating row backgrounds, sticky header,
    scrollable container on narrow viewports.
  - Images in notes are wrapped in a figure with a caption rendered from alt text.
  - Wikilinks in rendered content are visually distinct from external links: no underline
    decoration, accent color, with a small document icon prefix.

- **S15.4.3 — Stat block visual component**
  The stat block renderer (currently displays inside a note) gets a canonical visual
  design: the classic D&D stat block layout — cream/parchment background, bold orange-
  brown top and bottom dividers, creature name as serif display heading, ability score
  grid, HP/AC/Speed as structured fields, features as compact paragraphs with bold
  titles. The component maps precisely to the `StatBlock` object type. On mobile it
  scrolls; on desktop it can appear in the right detail panel without leaving the note.

- **S15.4.4 — Character sheet visual component**
  The character sheet object type gets a two-column layout view: left column shows the
  character portrait (if available), basic stats, and ability scores; right column shows
  features, spells, and inventory. The layout is read-only in viewer mode, editable in
  editor mode. The character sheet is designed for use during a session — large enough
  to read at a glance, scrollable for full detail.

- **S15.4.5 — Dice result visual drama**
  Dice roll results — whether from the dice tray, an inline roll button, or a table
  roll — are presented with appropriate visual weight. A natural 20 triggers a brief
  gold shimmer animation (respecting prefers-reduced-motion: a bold gold border static
  alternative). A natural 1 triggers a brief red pulse. All other results appear as a
  clean number in a styled result chip. The visual treatment reinforces the emotional
  experience of the game without requiring constant animation.

---

## Epic 15.5 — Density, Readability, and Content Width

**Goal:** Information is dense enough to be useful but spacious enough to be readable.
Note content has a comfortable reading width. List views show enough context to choose
the right item without opening it.

**Stories:**

- **S15.5.1 — Density system with user preference**
  Define two density modes: Standard (the default) and Compact (for users who want more
  content visible at once). Density affects: NavItem height (Standard: 36px, Compact:
  28px), Card padding (Standard: 16px, Compact: 12px), list item spacing (Standard:
  4px gap, Compact: 2px gap). Density is a user preference in Settings → Appearance,
  applied via a `data-density` attribute on `<html>`. CSS uses attribute selectors:
  `[data-density="compact"] .nav-item { height: var(--nav-item-height-compact); }`.

- **S15.5.2 — Reading width for note content**
  Note content in viewer and editor mode is constrained to a comfortable reading width.
  Three presets: Comfortable (68ch ≈ 680px), Wide (90ch ≈ 900px), Full (fills
  available content area). Default is Comfortable. User preference stored in vault
  settings. The constraint applies to prose note content only — maps, session boards,
  stat blocks, and the graph view always fill their available width.

- **S15.5.3 — Enhanced note list information scent**
  The note list view (grid or list, in the Knowledge section) shows, per note:
  (1) note type icon (doc icon for plain note, user icon for character, etc.),
  (2) title in `--text-base` weight-semibold, (3) folder path as micro-breadcrumb in
  `--text-xs text-subtle`, (4) up to two tags as pills, (5) modified-at in relative
  format ("2d ago"), (6) 2-line excerpt from content (below title). This gives five
  distinct signals to help identify the right note without opening it. The card
  layout is optimised to show this data without feeling cluttered, using appropriate
  visual hierarchy.

- **S15.5.4 — Sidebar information density optimisation**
  Audit every item in the sidebar local nav panels for appropriate density. Primary
  section navigation items (NavItem in the rail): 48px minimum height (generous for
  primary actions). Folder tree items: 32px (comfortable browse). Tag pills: 24px. Open
  Threads items: 32px. The current `py-1.5` (6px top + 6px bottom + content = ~28px
  total height) for primary nav items is too tight and does not meet touch target
  recommendations. Adjust all to match the density system definitions.
