# Initiative 17 — Learnability, Progressive Disclosure & Help Systems

## Status: SVELTE-ERA PLAN — React status tracked in RC_ROADMAP §16

> **React evidence (2026-09-04):** This initiative's stories describe the retired Svelte app and
> are preserved as planning history, not a completion claim. The maintained onboarding flow is
> `apps/gm-react/src/app/Onboarding.tsx` plus `apps/gm-react/src/app/onboarding/`; the shared
> empty-state component is `apps/gm-react/src/ds/components/system/EmptyState.jsx`. Help-system
> and progressive-disclosure depth (contextual help, power-user discovery) remain open work,
> tracked as RC-UX-3.x in `docs/planning/RC_ROADMAP.md` §16.

**Outcome:** A new user opens DND Tools for the first time and reaches genuine utility
— a vault with meaningful content connected by working links — within their first 30
minutes. An experienced user discovers keyboard shortcuts, advanced MCP features, and
power-user workflows through the application itself, not through documentation hunting.
Neither user is interrupted by tutorials, overwhelmed by an empty interface, or blocked
from advanced features they want to use.

**Depends on:** I13 (navigation structure), I14 (adaptive shell), I15 (design system
component library — EmptyState, Dialog, Tooltip components)

**Root-cause diagnosis:**

The current application's first-run experience is a floating checklist ("Onboarding")
accessible from the sidebar footer. The checklist is passive — it describes what to do
but does not guide the user to do it. The application's empty states (no notes, no maps,
no session board) display minimal placeholder text with no actionable guidance. New
features (world calendar, object notes, stat blocks, MCP workflows) are presented at
the same visual weight as core features, offering no hint of which things to learn first.
Advanced features like the MCP staged review workflow are surfaced in the same sidebar
header as the "New Note" button. There is no keyboard shortcut discovery surface —
shortcuts exist (`Ctrl+P`, `Ctrl+B`, `Ctrl+D`) but are only discoverable by accident
or by reading source code. Progressive disclosure, the primary evidence-based tool for
managing application complexity, is entirely absent.

The research is explicit: onboarding tutorials are forgotten quickly and interrupt the
user's primary task; contextual help at the moment of need outperforms up-front training;
and empty states are the highest-leverage learnability surface in a tool application
because they appear exactly when the user is ready to learn — when they have just
committed to using the tool and the canvas is blank.

---

## Epic 17.1 — Empty States as Teaching Moments

**Goal:** Every empty state in the application communicates what the area is for, shows
what it will look like when populated, and provides at minimum one primary action that
guides the user toward their first useful action in that area.

**Stories:**

- **S17.1.1 — EmptyState component**
  Build `src/lib/ui/common/EmptyState.svelte`. Props: `illustration` (optional SVG
  slot or named illustration key), `headline` (required, concise statement of state),
  `body` (optional, 1–2 sentences explaining purpose), `primaryAction` (Button props:
  label + onclick), `secondaryAction` (optional, ghost variant). The component is
  centered vertically in its container, uses comfortable spacing, and has `role="status"`
  with an `aria-label` on the container so screen readers can announce the state.
  Illustrations are simple, consistent SVG line drawings in the accent color —
  not photorealistic, not clip art. One illustration per empty state type.

- **S17.1.2 — Knowledge section empty states**
  Three distinct empty states for the Knowledge section:
  - **Empty vault** (zero notes): headline "Your world begins here", body "Notes are
    where your campaign lives — locations, NPCs, lore, and history all start as notes.",
    primary "Create your first note", secondary "Explore templates".
  - **Empty folder** (a folder exists but has no notes): headline "This folder is empty",
    body shows the folder path, primary "Create a note here", secondary "Move notes
    here".
  - **Empty search** (query returns no results): headline "No notes match '{query}'",
    primary "Create a note about this", secondary "Clear search". Below the primary
    actions, suggest related tags if any exist in the vault.

- **S17.1.3 — Session section empty states**
  - **No active session, no boards**: headline "Your sessions start here", body "Session
    boards are your live-play command center — scenes, NPCs, initiative, and handouts
    in one view.", primary "Start a session", secondary "Learn about session boards".
  - **No session boards** (configured but none created): same as above with lighter body.
  - **Session active, no combat**: headline "No combat active", body "Add combatants to
    start tracking initiative.", primary "Add combatants".
  - **Tables tab, no rollable tables**: headline "No rollable tables yet", body "Tag
    any markdown table with `rollable: true` in its frontmatter to add it here.",
    primary "Open example note".

- **S17.1.4 — Atlas, Campaign, and Graph empty states**
  - **Atlas — no maps**: headline "No maps yet", body "Maps let you place notes on
    visual geography — pin NPCs to locations, reveal regions to players.", primary
    "Add your first map", secondary "Learn about the Atlas system".
  - **Campaign — no object notes**: headline "No campaign entities yet", body "Object
    notes give structure to NPCs, factions, and quests — they connect across your vault
    and power the AI context bundles.", primary "Create an NPC", secondary "What are
    object notes?".
  - **Graph — no links**: headline "Your knowledge web is empty", body "The graph
    appears once your notes link to each other using [[wikilinks]].", primary "Open the
    writing guide", no secondary (the primary is discovery).
  - **Timeline — no events**: headline "No timeline events detected", body "Timeline
    events are auto-extracted from notes with date frontmatter. Tag a note with a
    `date:` field to get started.", primary "Add a date to a note".

---

## Epic 17.2 — Progressive Disclosure System

**Goal:** New users see a focused, learnable interface. Advanced capabilities reveal
themselves naturally as the vault matures and the user demonstrates readiness. No feature
is permanently hidden, but no advanced feature competes with core features for attention.

**Stories:**

- **S17.2.1 — Feature tier classification registry**
  Document all features in `docs/reference/FEATURE_TIERS.md` classified as:
  - **Core** (always visible from first use): create note, browse notes, search, basic
    templates, dark/light mode, read notes, edit notes, follow wikilinks.
  - **Intermediate** (revealed after vault maturity signals or first feature encounter):
    tags, folder organisation, pinning, saved searches, maps, session boards, dice,
    basic combat tracking, world calendar.
  - **Advanced** (opt-in via Settings or keyboard shortcut): MCP staged review, object
    notes / stat blocks, encounter builder, knowledge graph, timeline, handout delivery,
    custom templates, theme presets, random tables, inline dice rolls.
    The tier assignment governs where each feature is placed in the navigation, how
    prominently its entry points are displayed, and whether it needs a feature spotlight
    on first encounter.

- **S17.2.2 — Vault maturity signals and disclosure triggers**
  Implement a maturity signal system in `src/lib/state/vault-maturity.svelte.ts` that
  tracks: `noteCount`, `linkCount`, `tagCount`, `sessionCount`, `mapCount`,
  `objectNoteCount`. These signals are derived from existing state stores — no new
  data collection is required. Disclosure triggers:
  - `noteCount >= 5`: reveal Tags section in Knowledge panel.
  - `linkCount >= 3`: reveal Graph link in navigation.
  - `noteCount >= 10`: reveal Collections / Saved Searches.
  - `sessionCount >= 1`: surface Session section more prominently (badge on nav item).
  - `objectNoteCount >= 1`: reveal Campaign section entity list.
    Thresholds are configurable in `src/lib/domain/maturity-thresholds.ts` for tuning.

- **S17.2.3 — Advanced features behind explicit enable**
  Features classified as Advanced are initially hidden from primary navigation. They
  appear via two paths: (1) the user enables them in Settings → Features, where each
  Advanced feature has an on/off toggle with a one-sentence description; (2) the user
  encounters a contextual prompt that offers to enable the feature ("You have 5+ NPCs —
  would you like to try Object Notes for structured entity management?"). Once enabled,
  the feature's navigation entry appears and persists. MCP features specifically require
  explicit opt-in acknowledgement of what MCP access means.

- **S17.2.4 — Settings page progressive disclosure**
  The Settings page currently shows 8 tabs simultaneously. Restructure to:
  - **Always visible**: General, Appearance, Vault.
  - **Under "Features" group**: World Calendar, Maps (if not yet enabled), MCP.
  - **Under "Advanced" group** (collapsed by default): System Health, Sync, Handouts.
  - **Under "About"**: always visible at bottom.
    This prevents new users from being confronted with MCP, Sync, and System Health
    settings before they have any context for what those systems do.

---

## Epic 17.3 — Contextual Help Architecture

**Goal:** Help is available exactly when and where it is needed, never intrusive, and
always consistent in location. Users who want to understand a feature can access an
explanation without leaving their current task. Users who do not want help are never
interrupted.

**Stories:**

- **S17.3.1 — HelpTip component**
  Build `src/lib/ui/common/HelpTip.svelte`. The component renders as a small `?` icon
  button (`aria-label="Help"`, size 16px). On click (or keyboard focus + Enter), it
  opens a Popover adjacent to the button containing: a headline (feature name), a body
  (2–4 sentences explaining what it is and why it is useful), and an optional "Learn
  more" link. The popover is `role="dialog"` (modal for keyboard access), has a close
  button, and the trigger icon is `aria-expanded` linked to the popover state. HelpTips
  are placed immediately adjacent to the control or section they describe — not
  clustered in a separate help area. Initial HelpTip placements: MCP staged review
  counter in TopBar, World Calendar toggle, Object Notes concept in Campaign section,
  advanced search operators in command palette.

- **S17.3.2 — Feature spotlight for first encounters**
  Build a spotlight system for Advanced features when they are first enabled or first
  encountered. The spotlight is a `FeatureSpotlight.svelte` component that renders as
  a highlighted overlay (a semi-transparent backdrop with the feature's UI element
  cut out and highlighted) with a callout card showing: feature name, two-sentence
  explanation, and a "Got it" dismiss button. Spotlight is shown once per feature per
  vault (stored in vault preferences under `seenSpotlights: string[]`). It never
  appears again after dismissal. Spotlights do not interrupt an in-progress action —
  they are queued and shown on the next "idle" moment (route transition to a top-level
  page).

- **S17.3.3 — Keyboard shortcut overlay**
  Add a keyboard shortcut reference overlay accessible via:
  - `?` key press when no text input is focused.
  - "Keyboard shortcuts" entry in the Help menu.
    The overlay is a Dialog showing all keyboard shortcuts organized by section:
    Navigation, Notes, Session, Dice, Editor, System. Each entry shows the action label
    and the keyboard shortcut with proper `<kbd>` elements. The overlay is searchable
    (a text input at the top filters the list). The shortcut list is generated from a
    central shortcut registry in `src/lib/domain/keyboard-shortcuts.ts` — the registry
    is the single source of truth for all shortcuts, used both to register the actual
    handlers and to render the overlay. Adding a new shortcut requires only one edit.

- **S17.3.4 — Help menu with consistent location**
  Add a Help section to the sidebar footer (below Settings, above the persona switcher).
  The Help section contains: "Keyboard shortcuts" (opens the overlay), "Getting started"
  (opens the first-run guide as a panel), "Report a bug" (opens the GitHub issues URL),
  "About DND Tools" (opens the About tab in Settings). Per WCAG 3.2.6 (Consistent
  Help), the help entry point is in the same location on every page. This replaces the
  current "Onboarding" link in the sidebar footer, which is re-labelled "Getting
  started" to better communicate its purpose.

---

## Epic 17.4 — First-Run Onboarding Reimagined

**Goal:** A new user's first experience guides them from an empty vault to a vault with
at least one note, one link, and a basic understanding of the three core capabilities
(write, link, find) in under 10 minutes, without requiring them to read documentation
or watch a tutorial.

**Stories:**

- **S17.4.1 — Vault setup wizard**
  On first launch with an empty vault (no notes, `onboardingComplete` not set in vault
  preferences), show a setup wizard Dialog instead of the application shell. The wizard
  has three steps:
  1. "Name your vault" — a single text input, placeholder "My Campaign". Pre-filled if
     the vault directory name is a sensible name.
  2. "Choose a starting point" — three options as large tap-target cards: "Empty vault"
     (blank), "Campaign starter" (3–5 template notes: campaign overview, session 1 log,
     first NPC), "Worldbuilding starter" (5–7 template notes: world overview, major
     factions, creation myth stub, geography overview, timeline stub).
  3. "You're ready" — a single "Open DND Tools" button.
     The wizard is skippable. Template vaults are bundled assets, not network requests.
     After the wizard, `onboardingComplete: false` and `onboardingPhase: 'started'` are
     set in vault preferences, and the progressive disclosure system begins.

- **S17.4.2 — Guided first-action prompts**
  After the wizard, the empty states guide the user's next actions contextually. When
  a user opens a note for the first time, a non-blocking callout appears below the note
  title area: "Try linking to another note with [[double brackets]]". The callout
  dismisses on any edit. When a user creates their second note, a callout on the first
  note suggests linking to the second. These prompts trigger exactly once, triggered by
  vault maturity signals (S17.2.2), and never repeat after dismissal.

- **S17.4.3 — Onboarding state machine with completion tracking**
  Implement a proper onboarding state machine with milestones that map to the vault
  maturity signals plus explicit user actions:
  - `vault_created`: wizard complete or vault opened.
  - `first_note`: first note created.
  - `first_link`: first wikilink used.
  - `first_tag`: first tag added to a note.
  - `first_template`: first template applied.
  - `first_search`: first search performed.
  - `first_session`: first session started.
    State is stored in vault preferences. The "Getting started" panel (from the Help
    menu) shows these milestones as a progress list — not a blocking checklist, but a
    "here's what you've discovered" summary. Completed milestones are shown with a
    checkmark; upcoming ones suggest a first action. The panel is entirely optional.

- **S17.4.4 — Contextual "What's new" for existing users**
  After app updates that deliver significant new features, show a "What's new" entry
  in the Help menu with a version-keyed list of changes (pulled from `CHANGELOG.md`).
  A subtle badge appears on the Help menu entry until the user opens the What's new
  panel. The panel is not a modal or interrupt — it is a read-at-will resource. Features
  introduced in the update link directly to the Settings → Features toggle or the
  relevant section to try them. This is the pattern Apple HIG recommends: contextual
  introduction at the right moment, not a splash screen.
