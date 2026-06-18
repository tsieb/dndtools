# DND Tools — Redesign Brief (for claude.ai/design)

> **How to use this.** This is a self-contained brief for an external design tool (claude.ai/design).
> Paste the relevant section into the design agent; it will build React prototypes you then port back
> to the Svelte app. It does **not** assume the tool can read the repo. It is built from the evidence
> in `00-diagnosis.md`. Scope = **information architecture + visual design/theming**; the canvas-first
> paradigm stays. Decisions here are intentionally **portable** (mood, palette, hierarchy, density,
> layout, IA) rather than React-component specifics.

---

## 1. What you are designing

**DND Tools** is a **canvas-first command platform for running tabletop RPG (D&D) sessions live**, for
the Dungeon Master (DM). The DM's home is a spatial **Command Center** — a board of live-play
*widgets* (session status, combat, dice, maps, party vitals, audio, player-view controls), not a
document list. Around it sit durable section pages: **Session**, **Characters**, **Atlas** (maps),
**Campaign**, **Knowledge** (notes), **Settings**. It runs on desktop, tablet, and mobile from one
information architecture; only the presentation changes (sidebar ↔ tab bar ↔ sheet).

**Primary user & moment:** a DM at the table, under time pressure. Optimize the hot paths — see
session state, advance combat, adjust HP, reveal a map, push a handout — for **speed and
glanceability**. Prep/authoring can be richer and slower.

**Keep (not up for redesign):** the canvas-first command-center paradigm; the seven-section IA
backbone; accessibility (WCAG 2.2 AA) as a floor.

---

## 2. The problem to fix (the delta)

The current app was built faithfully to a detailed spec but was **never visually designed**. It
renders as a **cramped, monochrome admin dashboard**: a flat grid of equal-weight cards with no
single focus, almost no color, near-native unstyled form controls on content pages, an
everything-at-once home, and chrome that crowds out content (worst on mobile). Re-stating the spec
will reproduce this — so this brief asks specifically for the things the spec left to design
judgment. **Six targets:**

1. **Establish emphasis hierarchy** — one primary focus per surface; the design must pass a *squint
   test* (blur it → the right thing still wins).
2. **Use color with intent** — a warm, atmospheric palette where color encodes **state/severity**
   (turn, combat, visibility, sync), not decoration.
3. **Design real components** — replace native selects/buttons/fieldsets with a crafted, consistent
   field/button/list/card vocabulary.
4. **Land the mood** — "premium, warm, dark-first, genre-appropriate fantasy tool," not navy admin
   panel and not washed-out parchment.
5. **Focus the home** — the Command Center leads with live session state; everything else is
   secondary/progressive.
6. **Recede the chrome** — one command entry (not three), a calm top bar, a single-focus mobile
   surface.

---

## 3. Visual language to establish (reskin within the existing token system)

The app already has a solid semantic-token CSS system (color, spacing, type, radius, elevation,
motion) with theme swapping. **Design within it** — produce a token palette and component styling,
not a from-scratch framework. Concrete starting points from the current tokens, with the fix:

**Mood — warm, candle-lit dark as the hero theme.** The current dark theme fails "warm" because its
neutrals are **cool navy** (`bg #111418`, `surface #1c2128`, `border #2d3748`) while only text/accent
are warm (`text #e8ddd0`, `accent #d4a76a` gold). **Shift the entire neutral ramp warm** — toward a
deep warm brown-black / espresso, so panels feel candle-lit, not blue. Keep the gold accent but give
it more presence. Provide an equally-designed **light "parchment"** variant that is *not* washed out
(raise contrast, warm ink-on-vellum), since light-OS users get it by default.

**Color roles (semantic, sparing):**
- *Accent / primary:* warm gold — for the single primary action per region and active nav.
- *State colors:* success/active (combat live, turn) green; warning amber; danger red; info/sync
  blue — used **only** for state, with a redundant icon/shape (never color alone).
- *Visibility:* a distinct, consistent treatment for DM-only vs player-visible (the safety-critical
  signal) — must read at a glance and in grayscale.

**Typography:** keep the pairing — `Inter` (UI, carries almost everything) + a display serif
(`Cinzel`) reserved for large headings/atmospheric accents only. Tighten the scale into a clear 3–4
step hierarchy per surface (don't make every card title the same size).

**Density & elevation:** loosen the cramped spacing into a calm rhythm on the 4px grid; use
**elevation/shadow and surface tone to separate primary from secondary** panels (the current cards
are all the same flat tone — that's why nothing wins the squint test). Touch targets ≥44px on
mobile/tablet.

---

## 4. Surface 1 — Command Center (home) — *design for the populated, live state*

This is the hero and the weakest today. Design it as a DM's **live-play cockpit**, mid-session.

- **The one primary (must win the squint test):** **active session + current-turn state.** A DM
  glancing for one second should read: whose turn it is, the active combatant's HP, what players
  currently see. Give this a large, high-emphasis, top/left "command" region with warm accent and
  state color.
- **Emphasis order (descending):** (1) session/turn/combat status; (2) player-view controller ("what
  players see" + push handout); (3) the active map; (4) supporting widgets (dice, party vitals,
  audio, quick reference) as calm, smaller, clearly-secondary tiles.
- **Cut from the home:** the redundant "Data Hub" with its own Scenes/Parties/Campaign tabs (those
  are global destinations — don't duplicate nav inside home); demote "Getting started" to a
  dismissible single strip, not a competing card.
- **Layout:** keep it spatial/canvas, but make it a *designed arrangement* with real hierarchy —
  not a uniform grid of identical boxes. Widgets are designed cards with a clear header, one accent
  action, and elevation that matches their importance.
- **Populated content to show in the mockup:** combat running (initiative list, current turn
  highlighted, an HP value mid-edit), 4 party members with HP bars, a map projecting to players, a
  "Players are seeing: <scene>" indicator.

## 5. Surface 2 — Knowledge (notes) — *design for a real notes list + editor*

Today this is plain forms (the spec explicitly bans recreating a "notes list as home," and wants the
**writing area to dominate**).

- **The one primary:** the **writing/reading area**. When a note is open, the editor dominates; when
  browsing, a designed **note list** (cards/rows with title, snippet, source badge, visibility chip)
  dominates — not the create-form.
- **Designed component vocabulary (this surface defines it for the app):** styled text fields, a
  primary "New note" action (not a gray native button), a real `<select>`-replacement for visibility,
  list rows with hover/selected states, an autosave/"saved" chip, a source-of-truth badge, a
  visibility chip. All consuming the token system.
- **Populated content to show:** a left list of ~6 notes (one selected), a markdown editor with a
  save chip and visibility chip, backlinks, calm source/provenance metadata.

## 6. Surface 3 — Session / Combat — *design for combat running (the hot path)*

Today this leads with a raw `<fieldset>` encounter-builder form. Redesign for **live combat
glanceability** under table pressure.

- **The one primary:** the **initiative tracker with the current turn emphasized** — current
  combatant, HP (with a fast +/- stepper), conditions, "next turn" as the obvious primary action.
- **Speed & glance:** big touch-friendly turn controls, HP deltas in one tap, conditions as
  chips, hidden/DM combatants visually distinct from player-visible. Encounter *building* is a
  secondary/prep mode, not the landing view.
- **Populated content to show:** 5 combatants in initiative order, turn 2 active and highlighted, one
  combatant at low HP (state color), a condition chip, a player-visible vs DM-only marker.

---

## 7. Shell & IA fixes (apply across all surfaces)

- **One command entry, not three.** Collapse `⌘F Search` + `⌘O Go to` + `⌘K Actions` into a single
  **command palette** (search + navigate + actions in one), one trigger in the top bar.
- **Calm top bar.** Remove the dev tagline ("Scene-first command platform — local prototype"). Top
  bar holds only: brand/home, the single command trigger, view-as/preview (DM tools), sync state,
  help. Section routing stays in the side nav.
- **Mobile = single focused pane.** The first mobile screen must show **content**, not a stack of
  chrome. Move command/view-as/preview behind a compact menu; **never show keyboard glyphs (`⌘F`) on
  touch**; bottom tab bar for the sections.
- **Label cleanup (information scent).** Use **one** name per destination — align nav label and page
  title (pick "Characters" vs "Party", "Knowledge" vs "Notes", "Command Center" vs "Home" — don't show
  both). Never print engine jargon or raw IDs to users ("profile: compact", `Open at
  region-outpost-yard`).
- **Drop always-on shortcut chips.** Move `Alt+1…7` hints into help / on-focus, not permanent
  sidebar chrome.
- **Atlas (and other libraries):** give the map library a **visual** treatment (map preview affordance
  per row/card), not underlined text links.

---

## 8. Constraints (hold these while designing)

- **Keep** the canvas-first command-center paradigm and the seven-section IA.
- **One IA across profiles** — change presentation (sidebar ↔ tab bar ↔ sheet), never re-architect
  per device.
- **Accessibility is the floor:** WCAG 2.2 AA contrast, visible focus, ≥44px touch targets, never
  color-only state encoding, full keyboard operation.
- **Reskin within the token system** — deliver a palette + component styling that maps to semantic
  tokens, so it ports to the Svelte app as token/CSS changes, not a rewrite.
- **Portable over framework-specific:** the design tool's React output is a *target to match*, not
  code to ship; engineers re-implement in Svelte 5 + the existing CSS tokens.

---

## 9. Driving claude.ai/design (suggested sequence)

Iterate one surface at a time; tight prompts produce better output.

1. **Set the system first.** Paste §1–3. Ask it to propose the **visual language**: a warm dark-first
   theme + a non-washed light parchment, a type scale, and a core component kit
   (button/field/select/card/chip/list-row/badge) — rendered on a sample panel. Iterate until the
   *mood and component craft* are right before laying out screens.
2. **Command Center.** Paste §3 + §4 + §7 + §8. Ask for the populated live cockpit. Squint-test the
   result: does session/turn state win? Iterate.
3. **Knowledge**, then **Session/Combat.** Paste §3 + the surface section + §7 + §8 each. Reuse the
   component kit from step 1 for consistency.
4. **Mobile pass.** For each surface, ask for the compact (single-pane + bottom tab) variant under §7.

### Porting back to Svelte
The output is React; the app is Svelte 5 + semantic-token CSS. Port by: (a) extracting the
**palette/type/spacing decisions into the existing token set** (`apps/gm/src/routes/styles.css`),
(b) re-implementing the **component kit** as Svelte components consuming those tokens, (c) applying
the **layout/emphasis/IA decisions** per surface. Treat the React as a visual spec, not a source.
