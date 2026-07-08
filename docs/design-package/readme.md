# DND Tools — Design System

A canvas-first **command platform for running tabletop RPG sessions live**, for the Game Master.
The platform is **system-agnostic**: the rules of the game you're running come from a **System
Package** (D&D 5e, a generic narrative ruleset, a community Pathfinder package, or one you build
yourself), and the chrome renders whatever that package declares. D&D 5e ships as the default,
reference package — but it is *one option*, not a baked-in assumption. The brand name stays
"DND Tools" for now; the product underneath is any-system.

The GM's home is a spatial **Command Center** — a board of live-play widgets (session status,
combat, dice, maps, party vitals, audio, player-view controls), not a document list. Around it sit
seven durable sections: **Command Center · Session · Characters · Atlas · Campaign · Knowledge ·
Settings**. One information architecture runs on desktop, tablet and mobile; only the presentation
changes (sidebar ↔ rail ↔ bottom tab bar) — and one System Package runs on all of them.

**Primary user & moment:** a GM at the table, under time pressure. The hot paths — see session
state, advance combat, adjust a resource, reveal a map, push a handout — are optimized for **speed
and glanceability**. Prep/authoring can be richer and slower. ("DM" and "GM" are used
interchangeably here; the 5e package speaks "DM", a generic package speaks "GM" — the active
package supplies the word.)

> **"GM" not "Dungeon Master."** Address the table-runner as **you**; in package-neutral chrome use
> **Game Master / GM**. The *D&D 5e package* is free to localize that to "Dungeon Master / DM" and
> a horror package to "Keeper" — the term is package vocabulary, not a constant.

This design system delivers the **warm "candle-lit" redesign** described in the brief below: the
underlying token architecture (color, type, spacing, radius, elevation, motion, density, five
themes behind one `data-theme` swap) is excellent and preserved; what was added is the *design* the
original build never received — emphasis hierarchy, intentional color, crafted components, and a
warm, atmospheric mood.

> **Theme decision.** The original "tavern" dark theme read cool/navy. Per the brief we shifted the
> **entire neutral ramp warm** (espresso brown-black) and gave the gold accent more presence.
> Tavern is the hero; parchment is a non-washed light variant; high-contrast is the a11y floor.

---

## SYSTEM PACKAGES — the system-agnostic core

DND Tools runs **any** tabletop game. What changes between games — the stats on a sheet, the
conditions a creature can suffer, the dice you roll, how many actions a turn grants, what
"leveling up" means — is **not** hardwired into the chrome. It is supplied by a **System Package**:
the rules vocabulary the interface reads at runtime. Swap the package and the same widgets,
sheets, and trackers re-render against a different game.

**The contract (what a package declares).** A package is the boundary between *our containers and
treatments* and *the game's vocabulary*. The design system owns the second; the package owns the
first. A package declares:

- **Attributes / stats** — the scored cells on a sheet (5e: STR/DEX/CON/INT/WIS/CHA, mod + save;
  a narrative system: none, or a handful of approaches). Rendered by `AbilityScore`.
- **Resources** — the depletable/restorable pools a turn or rest touches (5e: HP, spell slots,
  hit dice; a horror system: HP + sanity; a powered system: stress + clocks). Rendered by `HPBar`,
  `SpellSlots`, `ProgressMeter`, `Stat`.
- **Conditions** — the status registry, each with a **distinct icon shape** so severity survives
  grayscale (5e: the 15 conditions; another system: its own set). Rendered by `ConditionBadge` /
  `ConditionTracker` against the package's `CONDITIONS` registry.
- **Dice & rolls** — the roll model and result vocabulary (5e: d20 + mods, advantage; another
  system: dice pools, successes). Rendered by `DiceResult`.
- **Action economy & turn order** — how a turn is structured and combatants are ordered (5e:
  initiative; PF2e: three actions; narrative: no turns). Rendered by `InitiativeRow`, `StatPill`.
- **Creature / entity schema** — the fields of a stat-block or sheet (5e: full monster block;
  generic: a freeform sheet with no CR). Rendered by `StatBlock`, `StatPill`, the `data/` group.
- **Vocabulary & roles** — the words on the chrome ("Dungeon Master" vs "Keeper" vs "GM",
  "spell" vs "power"), and the advancement model (XP / milestones / none).

**Premade packages ship built-in.** Three reference packages cover the spread, mirroring the
swappable `campaignSystem` module already in the app:

- **D&D 5e** — *Built-in, the reference implementation.* Full stat blocks, the 15 conditions, the
  CR→XP table, class names, spell slots. **This is the package every D&D-named component below
  implements.** It is the default, not the floor.
- **Generic / narrative** — *Built-in.* No stat blocks, no CR; freeform character sheets for
  system-agnostic or fiction-first play. Proves the chrome holds with most of the 5e vocabulary
  *absent*.
- **Pathfinder 2e** *(and others)* — *Community package / plugin.* Three-action economy, PF2e
  conditions and creature schema. Shows packages arriving from outside the built-in set.

**Build or customize your own.** A GM is never locked to the premade set. They can **fork a premade
package and tweak it** (rename conditions, drop spell slots, add a "stress" resource) or **define
one from scratch** (declare stats, resources, conditions, dice from no starting point). The entry
point lives in **Settings › Extensions & systems** ("Campaign system"), and switching the active
package runs a **non-destructive migration dry-run** first — it previews what maps, what's dropped,
and what carries over before anything changes. The package picker itself
(`templates/system-package-picker/`) is the front door: a gallery of premade packages plus the
"build your own" entry.

**The design principle.** *Components are containers; packages are content.* The D&D-flavoured
component groups below (`creature`, `condition`, `spell`, `domain`) are the **5e reference package's
implementation** of the contract above — not assumptions every game must satisfy. When you build for
a non-5e package, reach for the same containers (`AbilityScore`, `HPBar`, `StatBlock`,
`ConditionBadge`, `DiceResult`) and feed them that package's vocabulary; don't assume STR/DEX, a d20,
or spell slots exist. Color still encodes state, never the game; gold is still the one primary action;
the candle-lit tavern aesthetic is the **house style across every package** (a package may bring its
own accent via the theme tokens, but the warmth is ours).

---

## Sources

This system was built by reading the product's real code and design materials. If you have access,
explore them to build higher-fidelity work:

- **`apps/gm-react/`** — the production app (Vite + React 18 + semantic-token CSS). Source of truth
  for the token system (`apps/gm-react/src/styles/tokens/*.css`), the seven-section IA, the widget
  set, and the Lucide icon registry (`lucide-react`, documented in
  `docs/reference/ICON_VOCABULARY.md`). *(The retired SvelteKit app is archived at
  `archive/gm-svelte`.)*
- **`redesign/`** — the redesign package: `00-diagnosis.md` (evidence-backed UI/UX diagnosis of the
  current build) and `01-design-brief.md` (the warm, single-focus redesign brief this system
  implements). Plus `evidence/` screenshots of the "before" state.
- **GitHub — [`tsieb/dndtools`](https://github.com/tsieb/dndtools)** — the monorepo (`apps/`,
  `packages/`, `docs/`). Browse `docs/architecture/` (IA, navigation, layout contracts) and
  `apps/gm-react/` for the full UX spec, the navigation registry, and component code. **Explore this
  repo to build better DND Tools designs.**

Fonts (Inter, Cinzel, JetBrains Mono) are referenced by name in the app and loaded as webfonts; no
binaries ship in the repo. See **Caveats**.

---

## CONTENT FUNDAMENTALS — how DND Tools writes

The voice is a **calm, competent stage manager**: it hands the DM control and gets out of the way.
It is genre-aware (fantasy domain words: scene, handout, initiative, party, vault) but never
cute — no purple prose, no in-character narration in the chrome.

- **Person.** Address the DM as **you**; refer to the table as **players** / **party**. "Run the
  live session…", "what players currently see", "Push handout to players…".
- **Casing.** Sentence case for everything — buttons, labels, headings, menu items ("Set active
  map", "Push handout", "New note"). **Section/page titles** use the display serif but stay sentence
  case ("Command Center", "Build encounter"). Eyebrows and stat labels are **UPPERCASE, tracked**
  ("CURRENT TURN", "PLAYERS", "HP", "ROUND").
- **Verbs first, terse.** Actions are imperative and short: *Next turn · Deliver · Queue · Revoke ·
  Preview · Reveal area · Project to players*. Prefer one strong verb over a phrase.
- **State is spoken plainly.** "Projecting to 3 players", "Projection queued", "Not projecting",
  "Session live", "Saved". Status is a fact, not a flourish.
- **Safety language is explicit.** The DM-only vs player-visible distinction is always named:
  **DM only · Players · Hidden · Mixed**. Never imply visibility by color alone.
- **No engine jargon to users.** Never print raw IDs, profile names, or internal taxonomy
  ("profile: compact", `region-outpost-yard`). One name per destination (nav label = page title).
- **Emoji:** **none.** Meaning is carried by Lucide icons + text. Unicode glyphs appear only as
  functional marks (e.g. `⌘K` on desktop; never on touch).
- **Numbers** (HP, initiative, AC, dice, XP) are set in the **mono** face for tabular alignment.

*Examples (verbatim from the app):* "Run the live session: build encounters, run combat, and roll
dice or draw tables." · "Push handout…" · "Players are seeing: <scene>" · "No combat running."

---

## VISUAL FOUNDATIONS

**Mood.** Premium, warm, dark-first, genre-appropriate — a candle-lit tool for a fantasy hobby, not
a navy admin panel and not washed-out parchment. The hero is **tavern**: an espresso brown-black
neutral ramp under a single warm-gold accent.

**Color.** Sparing and meaningful. Gold (`--color-accent #e0b06f`) marks the **one** primary action
and active nav per region — never decoration. Status colors (success green, warning amber, error
red, info blue) encode **state/severity only** and *always* pair with a redundant icon shape so
meaning survives grayscale. A distinct **purple** carries the safety-critical DM-only signal. Build
new colors from the token ramps; don't invent fresh hues.

**Typography.** Inter carries ~95% of the UI; **Cinzel** (display serif) is reserved for large
headings (≥24px) and atmospheric accents only; **JetBrains Mono** for all numerals/IDs/dice. A
clear 3–4 step size hierarchy per surface — don't flatten every title to one size.

**Spacing & density.** 4px grid (2px micro half-step). Calm rhythm, not cramped. Three density
modes (`data-density`): standard (desktop), comfortable (≥44px touch — the mobile/tablet lock),
compact. Touch targets ≥44px on touch profiles.

**Backgrounds.** No textures on contrast-bearing components. The **only** decorative surface is a
single subtle warm radial glow on the page root (candlelight from above). Map widgets use a dark
gradient + faint grid as a tactical-map affordance. No photographic imagery in chrome.

**Elevation.** Shadow + surface tone separate primary from secondary — this is how the squint test
is won. Supporting tiles are flat/sunken; the one primary panel is `raised` + an accent border with
`--shadow-md`. Dark shadows are deep warm-black; parchment shadows are soft brown.

**Corners.** `sm` 3px (inputs), `md` 6px (cards, buttons, menus), `lg` 12px (dialogs), `xl` 20px
(sheets), `full` (pills — badges, chips, avatars). Cards: 6px radius, 1px warm border, subtle
shadow; the primary card adds a gold border.

**Borders.** Warm brown hairlines (`--color-border`), stronger for emphasis/controls
(`--color-border-strong`), gold for focus.

**Motion.** Functional, quick, no bounce in standard UI. Durations 80–500ms on a standard easing
`cubic-bezier(.4,0,.2,1)`; `--easing-spring` is reserved for dice-result / celebration surfaces
only. A single resolved motion preference (`data-motion`) collapses every duration to 0ms under
reduce — no per-component media queries. Transitions are fades + small position/size changes.

**Interaction states.** Hover: a faint gold wash (`--color-interactive-hover`) on ghost controls,
a lighter surface on solid ones, gold-brighten on the primary. Selected: a stronger gold tint +
gold left rail. Focus: a 2px gold ring at 2px offset, everywhere. Press: color shift (no shrink).
Disabled: ~50% opacity, no pointer.

**Transparency & blur.** Used sparingly — scrims/backdrops behind modals and sheets; the DM-only
content stripe is a low-alpha purple wash. No glassmorphism on content.

**Imagery vibe.** Warm, dim, candle-lit; tactical maps render as dark gradients with a faint gold
grid. Cool/navy and bluish-purple gradients are explicitly off-brand.

---

## ICONOGRAPHY

**One family: [Lucide](https://lucide.dev).** Clean 2px stroke, `currentColor`, MIT-licensed. The
production app imports Lucide as the *only* icon source (`lucide-react`) through a single documented
vocabulary (`docs/reference/ICON_VOCABULARY.md`) so there is one family at one weight — never "icon
soup". This system
mirrors that registry in `components/core/Icon.jsx` (semantic name → Lucide glyph).

- **Delivery.** Lucide is **CDN-linked** (`https://unpkg.com/lucide@latest/dist/umd/lucide.js`) in
  cards and kits; the `Icon` component reads glyph geometry from `window.lucide.icons[Name]`.
  (Substitution note: the app bundles Lucide via `@lucide/svelte`; we use the CDN UMD build for
  zero-install parity — same glyphs, same stroke.)
- **Sizes** are tokenized: `micro 16 · sm 20 · md 24 · lg 32 · xl 48`; stroke is always 2px.
- **Status icons each have a DISTINCT shape** (check-circle / triangle-alert / x-circle / info) so
  severity reads without color. The DM-only signal uses the eye family.
- **No emoji. No PNG/sprite icons.** Unicode glyphs appear only as functional marks (`⌘K`).
- Meaningful icons carry an accessible name (`role=img` + `aria-label`); decorative icons are
  `aria-hidden` and paired with visible text. Icon-only buttons must always pass a label.

Section icons: home `house` · session `zap` · characters `users` · atlas `map` · campaign `scroll`
· knowledge `book-open` · settings `settings`.

---

## INDEX — what's in this folder

**Foundations**
- `styles.css` — the single entry point consumers link (an `@import` manifest only).
- `tokens/colors.css` · `typography.css` · `spacing.css` · `fonts.css` · `base.css` — the token
  layers and webfont declaration.
- `guidelines/*.card.html` — foundation specimen cards (Colors, Type, Spacing, Brand groups).

**Components** (`components/<group>/` — React primitives + `.d.ts` + `.prompt.md` + a `@dsCard`).
*The `creature`, `condition`, `spell` and `domain` groups are the **D&D 5e reference package's**
implementation of the System Package contract — reusable containers fed 5e vocabulary, not 5e-only
fixtures. Feed them another package's vocabulary for another game.*
- `core/` — **Icon, Button, IconButton, Card / CardHeader, Avatar, Tabs, Breadcrumb, Popover, Stepper**
- `command/` — **CommandPalette** — the ⌘K hot path. One top-anchored overlay to jump to any of the
  seven sections or fire any action by typing: substring match over label + keywords, a Recent
  section on empty query, full keyboard navigation (↑/↓/Home/End/Enter/Esc), and the system's
  selected treatment (gold tint + gold rail) on the active row. Renders at the reserved `--z-command`.
- `navigation/` — **NavSidebar, NavRail, NavItem, BottomTabBar** — the one IA in three presentations:
  full sidebar (desktop), collapsed icon rail (tablet), and bottom tab bar (mobile). `NavItem` is the
  shared row: section icon, label, optional count badge, the gold active rail, ≥44px touch targets.
- `forms/` — **Field, Input, Textarea, Select, Checkbox, Switch, SegmentedControl, Slider**
- `feedback/` — **Badge, Chip, VisibilityChip, StatusDot**
- `overlay/` — **Dialog, Sheet, Toast (+ ToastViewport / Toaster), Tooltip** — the modal chrome the
  form bodies delegate to ("drop it inside a Dialog (desktop) or sheet (mobile)"), transient
  plain-state confirmations, and the hover/focus hint for icon-only controls. Scrim + focus-trap +
  scroll-lock + focus-restore on Dialog/Sheet; status→distinct-shape on Toast.
- `data/` — **DataTable, DefinitionList, Stat** — the prep/authoring tabular vocabulary: a sortable,
  selectable table for vault/monster/spell lists; a label→value definition list for stat-blocks and
  detail panes; and a single labelled `Stat` readout (mono value + eyebrow) for dashboards.
- `system/` — **EmptyState, Skeleton, ProgressMeter** — the pre-content, loading, and determinate-
  progress affordances (no-combat empties, list skeletons, XP-budget / sync / prep meters).
- `domain/` — **HPBar, StatPill, InitiativeRow, DiceResult** (the live-play vocabulary — *package-fed
  containers: a resource bar, a labelled stat, a turn-order row, a roll result; the 5e package supplies
  HP / initiative / d20, another package supplies its own*)
- `creature/` — **AbilityScore, StatBlock** — the **5e reference package's** creature/NPC schema
  (the contract's *attributes* + *creature schema*; another package declares different fields).
  `StatBlock` is
  the full card a DM pulls up to build an encounter or look up a monster mid-fight (Cinzel name,
  defenses band, ability cells, properties, traits/actions/reactions/legendary actions, optional
  live HP track + DM-only cue); `AbilityScore` is the shared six-stat cell reused on character sheets.
- `condition/` — **ConditionBadge, ConditionTracker** (+ the `CONDITIONS` registry) — the **5e
  reference package's** status registry (the contract's *conditions*; swap the registry for another
  package's set): each condition has a DISTINCT Lucide shape so it reads in grayscale, with optional
  duration/round countdown; the tracker is the stacked set on a combatant.
- `spell/` — **SpellCard, SpellSlots** — the **5e reference package's** spellcasting + slot resource
  (the contract's *resources*; a package without spells simply doesn't mount these): a full spell card (level/school
  band, casting time / range / components, ritual + concentration cues, description) and the per-level
  slot pip track a DM expends and restores on a rest.
- `campaign/` — **NpcCard, QuestCard, SessionTimeline** — the Campaign prep surfaces: an NPC quick-
  reference, a quest/objective card with status, and the session-by-session arc timeline.
- `map/` — the **Atlas map authoring suite** (actively expanding): the layer system (LayerPanel,
  LayerRow, LayerTypeBadge — render-ordered rows, 13 warm-harmonised type badges, three independent
  display/visibility/opacity controls), the tool rail (ToolPalette), fog-of-war (FogControls),
  procedural generation (GenerationPanel), create/import flows (MapCreationForm, ImportWizard),
  the minimap (Minimap), and points of interest (POIMarker, POIPopover)

Mount in `@dsCard` HTML via `const { Button } = window.DNDToolsDesignSystem_8ae046` after loading
`_ds_bundle.js` (compiler-generated — never hand-edited).

**Templates** (`templates/<slug>/` — copy-to-start Design Components consuming projects can fork):
- `system-package-picker/` — **System Package Picker**, the system-agnostic front door: a gallery of
  premade packages (D&D 5e · Generic / narrative · community Pathfinder 2e) each showing what it
  declares (stats, resources, conditions, dice), the active-package context, and the **build your
  own** entry — with a Gallery ↔ Detail layout option (`SystemPackagePicker.dc.html`).
- `dm-session-screen/` — **DM Session Screen**, a full live-play layout assembled from the
  primitives (`DmSessionScreen.dc.html`, loaded via its `ds-base.js`).
- `character-sheet/` — **Character Sheet**, the 5e player-character sheet (identity, ability scores,
  saves & skills, a live combat panel with HP + conditions, and spellcasting) composed from
  `AbilityScore`, `HPBar`, `SpellSlots`, `ConditionTracker`, `DefinitionList`.
- `encounter-builder/` — **Encounter Builder**, a Session-section planner: a live creature roster
  with count steppers, an XP-budget difficulty meter (`ProgressMeter` + `Badge`), and the selected
  creature's full `StatBlock`.
- `settings/` — **Settings**, drives the system's own token architecture live — theme · density ·
  motion swap the whole surface via one data-attribute each — over the form primitives
  (`SegmentedControl`, `Switch`, `Select`, `Slider`).
- `map-editor/` — **Map Editor**, the Atlas authoring workspace wiring the whole `map/` suite
  (layer panel, tool rail, fog, generation, minimap, POIs) into one screen.

**Assembled app — the prototype** (separate project)
- The full click-through application is **not** in this design system; it lives in the separate
  **Dndtools design system prototype** (claude.ai/design, id `20316ed7-4fd5-4edd-8294-48f899b74252`),
  which consumes this system's bundle via `window.DNDToolsDesignSystem_8ae046`. Compose surfaces and
  see the whole app there, not here — including the system-agnostic package-picker flow. See
  `SOURCES.md` for the dependency map. *(An earlier in-system `ui_kits/command-center/` mock was
  retired 2026-06-23 once the prototype superseded it; its source is archived in the product repo at
  `docs/design/_archive/command-center-kit/`.)*

**Developer handoff** (`handoff/`)
- `redesign.tokens.css` — the warm redesign as a drop-in token override for the production app
  (`apps/gm-react`); same token names, new values. `APPLY.md` — the runbook mapping the design
  system onto the React app (tokens at `apps/gm-react/src/styles/tokens/`, components at
  `apps/gm-react/src/ds/`). `before-after.html` — a one-page demo of the same markup under the old
  vs new token set.

**Other**
- `SKILL.md` — Agent-Skills-compatible entry point.

---

## Caveats

- **Fonts are CDN webfonts, not vendored.** Inter / Cinzel / JetBrains Mono load from Google Fonts
  (`tokens/fonts.css`). The compiler therefore reports 0 bundled `@font-face` binaries — rendering
  is unaffected. *If you want them self-hosted/offline, drop the `.woff2` files in `assets/fonts/`
  and swap the `@import` for local `@font-face` rules.*
- **The "before" evidence screenshots** (`redesign/evidence/`) show the *current* build, which the
  brief deliberately moves away from — use them for IA only, not visual reference.
- This system implements the brief's highest-leverage surfaces in depth (Command Center, Session,
  Knowledge, Atlas) and now carries the Characters/Campaign vocabulary (creature, condition, spell,
  campaign groups + the Character Sheet template). The full assembled, click-through application
  lives in the separate **prototype** project — see `SOURCES.md`.
