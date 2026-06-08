# UX Requirements — Characters / PC Suite

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `CHAR-001..016`
> **Owner surface(s):** Character Quick-Create panel · Character Draft/Creation Wizard ·
> Character Sheet (read + edit modes) · Collaborative Character Editor · Character Combat & Resource
> Widgets · Data-Exposure Widget Bindings · Party/Roster Overview · Character Journal

---

## 1. Scope

- **Covers:** Every UI surface where character data is created, edited, read, or exposed: the DM's
  quick-create form (NPC/monster/sidekick); the player's multi-step PC creation wizard and its
  resume/draft flow; the character sheet in full read and edit modes; the in-play combat resource
  surface (HP, conditions, spell slots, death saves, class resources); the collaborative editing
  mode with DM attribution and conflict resolution; the structured data-exposure bindings that
  canvas widgets consume; the party/roster overview; and the character journal.

- **Does NOT cover:** Capability-set assignment UI lives in `11-collaboration-permissions.md`
  (which this doc references). The combat tracker initiative strip lives in
  `08-sessions-live-play.md`; this doc specifies the character HP/resource *widgets* that the
  tracker embeds by binding to `CHAR-006`. Map-layer visibility and canvas widget placement live in
  `04-canvas-scene-widgets.md` and `06-maps.md`. Global navigation chrome (sidebar, bottom tabs)
  is specified in `02-navigation-and-platform-profiles.md`.

- **Related functional requirements** (`../requirements/04-characters.md`):
  - `CHAR-001` — DM quick-create (NPC/monster/sidekick) with simplified stat block
  - `CHAR-002` — Player guided creation flow with validation and resumable progress
  - `CHAR-003` — Owner capability-set assignment (exactly one owner)
  - `CHAR-004` — Concurrent DM + player co-edit, conflict surfacing, DM resolution
  - `CHAR-005` — DM field edits attributed without a hidden override layer
  - `CHAR-006` — Widget data-exposure API binding (HP, conditions, slots, abilities, notes)
  - `CHAR-007` — In-session combat resource updates (HP, temp HP, conditions, death saves, concentration)
  - `CHAR-008` — Spell and class resource management, rest recovery
  - `CHAR-009` — Level-up / advancement (XP or milestone) with staged validation
  - `CHAR-010` — Backstory / narrative editing gated by `backstory-editor` or `owner`
  - `CHAR-011` — Party overview (HP/status/resources, marching order, party inventory)
  - `CHAR-012` — Character journal (bookmarks, NPC impressions, personal quests, highlights)
  - `CHAR-013` — DM draft ownership: create, assign, transfer, revoke before finalization
  - `CHAR-014` — Collaborative views distinguish DM-authored vs. player-authored fields
  - `CHAR-015` — Observer character access denied by default
  - `CHAR-016` — Journal visibility enforced per-entry, cross-surface invalidation

- **Related UX docs:**
  - `01-visual-design-system.md` — tokens, typography, color, motion (consumed; not redefined here)
  - `02-navigation-and-platform-profiles.md` — profile breakpoints, sidebar/tab-bar chrome
  - `03-accessibility.md` — global a11y baseline; this doc adds surface-specific details
  - `04-canvas-scene-widgets.md` — widget placement; characters are a data source for canvas widgets
  - `08-sessions-live-play.md` — combat tracker embeds HP/condition widgets from this surface
  - `11-collaboration-permissions.md` — capability-set assignment UI; referenced, not duplicated here

---

## 2. UX goals for this surface

The character suite is *the* highest-stakes surface in terms of role variety: a DM creating an NPC
in 30 seconds; a new player navigating a 7-step wizard over two evenings; an experienced player
making a 1-tap HP edit mid-combat; two users simultaneously editing the same sheet. The design
must make all these tasks feel effortless while enforcing the data-layer permission model without
exposing it as bureaucracy.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | Dense sheets must read as premium reference material, not spreadsheets. The wizard must feel guided and calm. Attribution badges (DM/player/conflict) use reserved, character-appropriate color tokens — never garish. |
| **Information scent** | Every section of the sheet has a legible label and the most critical combat stats (HP, AC, conditions) are always visible at the top regardless of scroll position or active tab. Creation steps are titled in player-vocabulary ("Your identity", "Your class"), not system-vocabulary ("step.identity"). |
| **Navigability** | From any character in the roster: sheet in ≤2 taps; combat resources in ≤1 tap (during active session a combat widget is always surface-level). Back from any wizard step without data loss. Deep-link by character ID to any section. |
| **Intuition / learnability** | The quick-create form has zero ambiguous fields and submits in under 30 seconds. The creation wizard teaches rules contextually per step ("Your Wisdom modifier affects Perception and Insight"). First-run sheet has a scannable empty state that explains each section. |
| **Accessibility** | WCAG 2.2 AA throughout. HP stepper keyboard-navigable with +/− keys. All form fields have visible, persistent labels. Wizard progress bar announced via live region. DM attribution badges have text content, not color alone. ≥44 CSS px touch targets everywhere. |
| **Adaptability (platform profiles)** | Desktop: full multi-column sheet with persistent side panel. Tablet: tabbed section navigation, comfortable targets. Mobile: focused single-section combat view as default; full sheet accessible via tab/sheet navigation. Same commands, role-filtered data, across all profiles. |
| **Effective emphasis (visual hierarchy)** | HP is the most visually prominent number on the sheet — always. Current HP uses the largest font on the combat section. DM-override badges are visually distinct but do not shout; the content is primary. One primary CTA per wizard step. |
| **Feedback & responsiveness** | HP/resource changes acknowledge in ≤100 ms with inline optimistic update, then reconcile. Autosave indicator on wizard draft. Collaborative edits stream in with a subtle pulse animation (respects `prefers-reduced-motion`). |
| **Error prevention & recovery** | Wizard blocks step advancement until required fields are valid, with inline guidance — never a wall of errors at finalize. HP stepper refuses non-numeric and out-of-bounds input. Destructive actions (remove character, delete journal entry) confirm and are undoable within session. |
| **Consistency** | HP stepper pattern is identical on the sheet, the combat widget, and the party overview. DM-attribution badge is the same visual treatment everywhere. Step completion indicators match the visual design system's state colors. |

---

## 3. Researched best practices

### 3.1 Multi-step wizards and progressive disclosure

GOV.UK's "one thing per page" principle [1] demonstrates that presenting a single focused question
per step dramatically reduces error rates and cognitive load, especially in complex forms. A D&D
character creation wizard has 7–10 meaningful decision points (identity, race/species, class,
background, ability scores, equipment, spells, backstory) — each warrants its own step, not a
scrollable mega-page. **Implication:** the player creation wizard uses one-question-per-step
architecture with a persistent linear stepper for orientation.

NN/g's research on form design [2] finds that multi-column form layouts increase error rates versus
single-column layouts; however, tightly related fields (STR/DEX/CON/INT/WIS/CHA) are a studied
exception where aligned tabular display aids comparison. **Implication:** the six ability scores
are displayed in a 3×2 grid on their dedicated step, all other fields stack single-column.

Stripe Checkout's pattern of auto-advancing focus to the next field on input completion [3]
significantly reduces form friction for short data-entry sequences. **Implication:** the quick-
create form advances focus through the field sequence automatically on Tab and auto-submits when
Enter is pressed from the last field.

### 3.2 Number steppers for live combat

Nielsen Norman Group's study on numeric inputs [4] finds that plain `<input type="number">` fields
are error-prone in high-stress contexts because users mis-click the browser's tiny native spinners
and arrow-key increments are invisible. D&D Beyond's HP tracker [5] uses large +/− stepper buttons
with an explicit "damage / heal" framing that matches the game model (you deal damage or heal, you
don't "set" HP directly). **Implication:** the HP interaction uses a delta stepper (Deal damage /
Heal, positive integer) rather than a raw number input, with confirmation of the resulting HP shown
in the button label before commit. Direct HP set remains available as a secondary "override" action.

The minimum touch target for a stepper button in mobile combat is 44×44 CSS px per WCAG 2.2 §2.5.5
[6] and Apple HIG [7] — larger (56×56) for the primary Deal/Heal actions given their hot-path
frequency. **Implication:** HP stepper primary buttons are 56px tall on all touch profiles.

### 3.3 Data density and scannability on character sheets

Foundry VTT's sheet design [8] and Roll20's [9] both suffer from the same failure mode: every field
is identical in size and weight, producing sheets where nothing reads first. D&D Beyond's sheet [10]
solves this with a clear hierarchy: monster-sized HP numerals, grouped sections with bold headers,
and muted secondary data (ability modifiers shown smaller than score). Edward Tufte's principle of
"small multiples" [11] — identical scale, same data type, scannable at a glance — motivates the
ability score display (score + modifier in a unified pill). **Implication:** the character sheet
enforces a deliberate typographic hierarchy: HP ≥ 32px, section headers 14px bold, secondary
labels 11px muted.

### 3.4 Collaborative editing and attribution

Material Design 3's guidelines on state layers [12] specify that overlay states (hover, focus,
selected) use opacity variations of the primary color rather than distinct hues, to keep the surface
legible under simultaneous states. The DM attribution badge pattern must similarly use reserved
token colors (not ad-hoc overrides) and must include text content ("DM-edited") for colorblind
users. **Implication:** DM-authored field badges use `--token-badge-dm-bg` / `--token-badge-dm-fg`
(defined in `01-visual-design-system.md`) with role text always present.

Research on conflict UI in collaborative editors (Google Docs, Notion) [13] shows users tolerate
conflicts if they are surfaced at the earliest opportunity and resolution is a single choice with
clear option labels. Hiding conflicts until finalization is the most common failure mode.
**Implication:** conflicts appear inline on the affected field, not in an aggregated list, and the
DM resolution UI presents "Keep [value] (player)" vs "Use [value] (DM)" as button labels.

### 3.5 Wizard resume and autosave

Typeform's research on form abandonment [14] finds that mandatory account creation before starting
a long form causes 27% abandonment. Draft auto-save with resume is the counter-pattern: the form
state is persisted after every step save so the user can return with no loss. **Implication:** the
creation wizard autosaves step data on every "Save step" action with a visible indicator; on return,
the wizard opens directly at the first incomplete or invalid step.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| D&D Beyond character sheet | HP tracker with large numerals, dedicated +/− stepper row, "damage / heal" framing, one-tap conditions panel; section tabs (Actions, Spells, etc.) that persist combat vitals at top | Game-model vocabulary in UI; combat vitals always visible regardless of active tab | Borrow: delta-stepper pattern, persistent vitals bar, section tab model; Avoid: their long-form character builder (too many fields per step, overwhelming for new players) | https://www.dndbeyond.com/characters |
| D&D Beyond character builder | Step-by-step class/species/background picker with contextual rules inline; shows "what you get" preview before committing a choice | Progressive disclosure of rules; removes memorization requirement | Borrow: contextual rules preview per choice, visual "what you get" summary alongside the form | https://www.dndbeyond.com/characters/builder |
| Demiplane Nexus character builder | Single-column one-question-per-step with a step rail on the left that shows completion state; clean empty states that explain what the step does | GOV.UK "one thing per page" applied to TTRPG; rail reduces disorientation in long flows | Borrow: step-rail with completion badges, single-column step forms; Avoid: their lack of a "rules preview" panel — they send users to a separate learn page | https://app.demiplane.com/nexus |
| Foundry VTT character sheet | Compact multi-section sheet; inline edit on click; spell slot pips (filled / empty circles) that can be clicked to expend; ability score display with score + modifier unified | Pips are more spatial and scannable than a number pair; inline edit reduces mode switching | Borrow: pip pattern for spell slots / class resources; inline edit on click; Avoid: their uniform field sizing that leaves no hierarchy | https://foundryvtt.com |
| Roll20 character sheets | Drag-and-drop widget embedding; per-sheet data binding to combat tracker | Data-exposure contract for widgets | Borrow: the concept of a published binding contract; Avoid: their non-standard, per-system sheet code that creates inconsistent UX | https://roll20.net |
| GOV.UK Design System forms | "One thing per page", error summary linked to fields, clear Continue button, always-visible hint text | Proven to reduce error rates in high-stakes multi-step flows | Borrow: single-field steps, error pattern, Continue as sole CTA per step | https://design-system.service.gov.uk/patterns/question-pages/ |

### North-star exemplars

**D&D Beyond's HP tracker** is the single most important reference for the in-play character
surface. Their delta-stepper row with "Heal" and "Damage" buttons framed in game vocabulary, the
oversized current HP numeral, and the conditions panel directly below it are proven to work at the
table. This product should match that interaction model, not the raw `<input type="number">` pattern
the v2 components currently implement.

**Demiplane Nexus's step rail** is the best available reference for a TTRPG character builder's
orientation model. A vertical left-rail showing all steps with completion state (empty circle /
partial / checkmark / warning) gives users a persistent map of the flow without cluttering the step
content area. This product should adopt that rail pattern on desktop/tablet and a horizontal
scrollable stepper on mobile.

**GOV.UK's "one thing per page"** is the design principle that the entire creation wizard must be
audited against. Every step must have exactly one question or decision, a focused CTA ("Continue"
or "Save"), and inline hint text so users never need to leave the flow to understand a rule. The
current `CharacterDraftFlow.svelte` renders multiple fields per step and a horizontal tab strip that
compounds disorientation on mobile — the redesign must address both.

---

## 5. UX/UI requirements

### UX-CHAR-001 — Quick-create form: minimal, submit-in-30-seconds

- **Requirement:** The DM quick-create surface shall present exactly the fields needed for a
  functional NPC/monster/sidekick stat block — Kind, Name, HP, AC, Visibility, and one optional
  Attack row — in a single-column form with no more than seven field rows, submitting via keyboard
  or button with inline success feedback.
- **Rationale:** CHAR-001 requires create-in-seconds workflows. NN/g form research [2] shows each
  additional field adds ~20% completion time; the quick-create path must trade completeness for
  speed — additional fields belong on the full sheet post-creation.
- **Spec:**
  - Form width: 480px max on desktop, full-width on mobile with 16px horizontal insets.
  - Field order: Kind select → Name text → HP number → AC number → Visibility select → Attack Name
    (optional, collapsible row under "Add attack") → Attack Detail (optional, same row).
  - "Add attack" is a ghost button that reveals the attack fields inline; it is not a separate step.
  - Default values: Kind = NPC, HP = 10, AC = 12, Visibility = DM only (fail-closed per CHAR-001
    acceptance criterion).
  - HP and AC: integer inputs with `inputmode="numeric"` and `min="0"` and `max="9999"` (for HP) /
    `max="30"` (for AC). The stepper arrows are hidden via CSS on all profiles; instead, ↑ / ↓
    arrows increment by 1 on keyboard. These fields are not the high-speed delta-stepper pattern
    (that is for in-play use); simple number inputs are appropriate for initial creation.
  - Submit button text: "Create [Kind]" — dynamically reflects the selected kind ("Create NPC").
  - On success: form fields reset; a status toast appears: "[Name] created as [Kind] — Open sheet";
    "Open sheet" is a link/button that navigates to the new character.
  - On error: inline error text below the offending field; no full-form error summary for a 7-field
    form.
- **States:**
  - Default: form ready, Kind = NPC, HP = 10, AC = 12, Visibility = DM only.
  - Submitting: submit button shows spinner text "Creating…", fields disabled.
  - Success: toast with character name + "Open sheet" link. Form resets.
  - Error: rejected command → inline message below field(s); submit re-enabled.
- **Platform profiles:**
  - Desktop: form in a panel (480px wide), next to the roster. Attack row is always visible.
  - Tablet: same single-column layout, full-width panel; Attack row behind "Add attack" ghost
    button to save vertical space.
  - Mobile (slim): full-screen sheet; Attack row hidden behind "Add attack" to reduce scroll.
- **Input:** pointer · touch · keyboard — Tab advances fields; Enter from last field submits; Escape
  clears error state.
- **Accessibility:** All labels are `<label for>` or wrapping labels, never placeholder-only.
  Kind and Visibility selects announce option on change via `aria-live="polite"`. Submit button
  `aria-busy="true"` during submit. Error messages linked via `aria-describedby`.
  Touch targets: all inputs and the submit button ≥44×44 CSS px.
- **Acceptance criteria:**
  - Given the DM opens quick-create, when the form loads, then Name is focused and Kind = NPC, HP = 10, AC = 12, Visibility = "DM only".
  - Given the DM fills Name and tabs through HP/AC with defaults, when they press Enter, then the character is created and a success toast appears within 500 ms.
  - Given Name is empty, when the DM presses the submit button, then an inline error appears and focus moves to Name.
  - Given the DM chooses Kind = "Monster", when they read the submit button, then it reads "Create Monster".
- **Priority:** Must-have

---

### UX-CHAR-002 — Creation wizard: step rail, one decision per step

- **Requirement:** The player's PC creation wizard shall be a resumable multi-step flow with a
  persistent step rail (desktop/tablet) or a horizontal step stepper (mobile), one primary decision
  per step, contextual rules inline, and autosave after every step save.
- **Rationale:** CHAR-002 requires a guided, rules-aware, resumable flow. Demiplane's step-rail
  pattern [exemplar 2] and GOV.UK's one-thing-per-page principle [1] [exemplar 3] are the
  evidence base. Typeform abandonment research [14] motivates immediate autosave.
- **Spec:**
  - Step definitions (7 standard steps, extensible):
    1. **Your identity** — name, pronouns (optional), player name.
    2. **Your species** — choice control with a preview card showing traits.
    3. **Your class** — choice control with feature summary preview.
    4. **Your background** — choice with proficiency/language/equipment preview.
    5. **Your ability scores** — the six scores in a 3×2 grid; method selector (standard array /
       point buy / roll); modifier computed live.
    6. **Your equipment** — starting equipment from background + class; optional swap items.
    7. **Your story** — backstory textarea, personality traits, bonds, flaws, ideals (collapsible
       sub-sections within this single step).
  - Step rail (desktop/tablet ≥600px): fixed left column, 200px wide, listing each step with:
    - Icon/number + title.
    - Status indicator: empty circle (not started) / half-filled (saved, invalid) / checkmark
      (saved, valid) / warning icon (saved, has issues).
    - The active step is highlighted with the primary accent token.
    - Clicking any step navigates to it (with unsaved-changes warning if applicable).
  - Step stepper (mobile <600px): horizontal scrollable stepper at top of screen, abbreviated
    step titles (≤12 chars), same status icons. Tapping a step navigates to it.
  - Step content area: single-column, 600px max-width, centered on desktop. Contains:
    - Step title (H2).
    - Step description / rules summary (one short paragraph, ≤60 words; collapses to "Show rules"
      on mobile to reduce scroll).
    - Primary input(s) — one main choice/field group per step.
    - "What you get" preview panel: on desktop, a 240px right column showing the effects of the
      current selection (e.g., class features, proficiency list). On mobile/tablet, a
      collapsible "See benefits" disclosure beneath the input.
    - Primary CTA: "Continue" (advances to next step) or "Save changes" (if on a step the user
      already completed and is revising).
    - Secondary: "Back" link (no data loss; goes to previous step).
    - Step N of 7 counter, ARIA-announced on step change.
  - Autosave: each "Continue" / "Save changes" dispatches `character.update-draft-step`; a
    "Saved" indicator (green dot + "Saved just now") appears in the rail for 3 seconds then
    transitions to the step status icon.
  - Resume: on opening a draft, the flow opens directly at `completeness.nextStepId` — the first
    step that is incomplete or invalid. The step rail reflects all saved state immediately.
  - Finalize button: appears only on the last step and only when `readyToFinalize` is true. Text:
    "Create character". While disabled, it is visible with a tooltip/hint explaining remaining
    issues ("2 steps still have issues — check the orange indicators above").
- **States:**
  - Step: default / saving (CTA spinner) / saved / invalid (shows validation issues inline).
  - Draft overall: in-progress / ready-to-finalize / finalized (read-only, redirects to sheet).
  - Resume: draft loaded, step rail pre-populated from saved state.
  - Unavailable (not owner): "This draft is not available to you" empty state.
- **Platform profiles:**
  - Desktop: step rail (200px left) + content area (600px max) + rules preview panel (240px right) — 3-column layout within the wizard container.
  - Tablet (landscape): step rail (160px) + content area (full remaining width); rules preview is a collapsible bottom drawer activated by "See benefits".
  - Tablet (portrait): horizontal stepper at top; no persistent rail; rules preview is a disclosure.
  - Mobile: horizontal stepper at top; content area full-width; all secondary content (description, rules preview) behind disclosures to minimize scroll.
- **Input:** pointer · touch · keyboard — Tab/Shift-Tab through step rail items (`role="tab"`,
  `aria-selected`); Enter/Space to navigate; within the step form, standard field tab order; Enter
  submits the step CTA.
- **Accessibility:** Step rail is `role="tablist"` with `aria-orientation="vertical"` (desktop) or
  `"horizontal"` (mobile). Active step: `aria-selected="true"`, `aria-current="step"`. Step count
  announced on navigation: "Step 3 of 7 — Your ability scores". Validation issues below each field,
  linked via `aria-describedby`. Finalize button `aria-disabled` (not `disabled`) when incomplete,
  to allow focus and the tooltip to read. All touch targets ≥44×44 CSS px.
- **Acceptance criteria:**
  - Given a player opens their draft, when the wizard loads, then focus lands on the first incomplete step's primary input, and the step rail shows correct completion state for all prior steps.
  - Given the player completes step 2 (species) and clicks "Continue", then step 2 shows a checkmark in the rail, step 3 becomes active, and "Saved just now" appears for 3 seconds.
  - Given the player closes the browser mid-wizard, when they reopen, then the same step is active with saved values pre-populated.
  - Given the Finalize button is disabled, when the player focuses it, then a tooltip reads the list of remaining issues.
  - Given all steps are valid, when the player clicks "Create character", then the draft is finalized and the player is redirected to the character sheet.
- **Priority:** Must-have

---

### UX-CHAR-003 — Character sheet: layout, hierarchy, and reading mode

- **Requirement:** The character sheet in reading mode shall display all character data in a
  scannable, hierarchical layout where HP is the dominant numeral, sections are tabbed or paneled,
  and the combat vitals bar (HP / temp HP / AC / conditions / death saves) persists at the top
  across section navigation.
- **Rationale:** CHAR-007, CHAR-008, CHAR-010. D&D Beyond sheet reference [5] and Foundry VTT
  pip pattern [exemplar 4]. Data density research [11] motivates typographic hierarchy.
- **Spec:**

  #### Desktop layout (≥1024px) — ASCII wireframe

  ```
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [Avatar] Thorin Ironforge · Dwarf Fighter 5 · Neutral Good          │
  │          HP: 52/52  (Temp: 0)  AC: 18  Speed: 25ft                  │
  │          Conditions: —   Death saves: — — —  / — — —               │
  ├──────────────────────────────────┬──────────────────────────────────┤
  │ [Abilities]  Saves   Skills      │ [Section tabs]                   │
  │                                  │ Actions | Spells | Equipment |   │
  │  STR  DEX  CON  INT  WIS  CHA    │ Features | Backstory | Notes    │
  │  18   14   16   10   12   08     │                                  │
  │  +4   +2   +3   +0   +1  -1     │  [Tab content scrolls here]     │
  │                                  │                                  │
  │ [Saving throws: ticked profs]    │                                  │
  │ [Skills: ticked profs + mods]    │                                  │
  └──────────────────────────────────┴──────────────────────────────────┘
  ```

  - **Vitals bar** (always visible, never scrolls off): HP `32px bold`, current/max smaller `18px`,
    temp HP `14px muted`, AC `24px bold`, Speed `14px`. Conditions displayed as pill badges.
    Death saves: 3 circles per row (success/failure), tappable in play mode.
  - **Ability scores**: 3×2 grid, each cell is a pill — score in `20px bold`, modifier in `14px`.
    Saving throw proficiency shown as a filled dot next to the modifier.
  - **Skills**: single-column list, proficiency dot + modifier + name + passive score. Grouped into
    STR/DEX/CON/INT/WIS/CHA sub-headers on desktop only.
  - **Section tabs**: Actions, Spells, Equipment, Features, Backstory, Notes. Active tab underlined
    with primary accent. Tab strip is `role="tablist"`.

  #### Tablet layout (600–1023px) — ASCII wireframe

  ```
  ┌──────────────────────────────────────────────┐
  │ [Avatar] Thorin · Dwarf Fighter 5            │
  │ HP: 52/52  AC: 18  Speed: 25ft              │
  │ Conditions: —   Death saves: ○○○ / ○○○      │
  ├──────────────────────────────────────────────┤
  │ [Abilities 3×2 grid]                         │
  ├──────────────────────────────────────────────┤
  │ Actions | Spells | Equipment | More ▾        │
  │ [Tab content]                                │
  └──────────────────────────────────────────────┘
  ```

  - Vitals bar is abbreviated: HP (large) / AC / Conditions only. Speed and temp HP are in a
    "More stats" disclosure pill.
  - Section tabs collapse "Features / Backstory / Notes" into a "More" overflow menu after the
    first four fit.

  #### Mobile layout (<600px) — ASCII wireframe

  ```
  ┌───────────────────────────┐
  │ Thorin · Fighter 5        │
  │ HP: 52 / 52     AC: 18   │
  │ [Conditions badge]        │
  ├───────────────────────────┤
  │ [Bottom tab bar]          │
  │ Combat | Spells | Sheet   │
  │ Party  | Journal | More   │
  └───────────────────────────┘
  ```

  - Default landing tab on mobile is **Combat** — shows HP stepper, conditions, death saves,
    concentration, active spell slots, and class resources. This is the highest-frequency in-play
    view.
  - **Sheet** tab shows ability scores + skills.
  - **Spells** tab shows spell list + slot pips.
  - **More** opens a bottom sheet with Equipment, Features, Backstory, Notes.
  - The vitals (HP/AC) are sticky at the top of every tab as a slim 48px bar.

- **States:**
  - Reading mode: all values displayed, no inputs visible. Click/tap on an editable field transitions
    to inline edit (see UX-CHAR-004).
  - Loading: skeleton shimmer matching the section layout.
  - Error (character unavailable): "Character unavailable. You may not have permission to view it."
  - Empty (no data in a section): empty state with instructional copy and a "Add [thing]" CTA.
- **Platform profiles:** See ASCII wireframes above.
- **Input:** pointer · touch · keyboard — tab index through vitals bar values, ability scores, and
  section tabs. Arrow keys within `tablist`. All interactive controls ≥44×44 CSS px.
- **Accessibility:** Vitals bar values exposed as `role="status"` so screen readers announce HP on
  change. Section tabs: `role="tablist"`, each `role="tab"` with `aria-selected`, `aria-controls`.
  Condition badges: `role="listitem"` in a `role="list"`, each with readable text. Death save
  circles: `role="checkbox"` with `aria-label="Death save success 1"`.
- **Acceptance criteria:**
  - Given the character sheet opens, when the vitals bar renders, then HP is the numerically largest value displayed in the header area.
  - Given the user scrolls the sheet to the Spells section, when they look at the top of the screen, then the vitals bar (HP / AC) is still visible.
  - Given the user opens the sheet on mobile, then the Combat tab is the default active tab.
  - Given a keyboard user navigates the sheet, when they Tab through the vitals bar, then each value (HP, AC, Speed) receives focus in order.
- **Priority:** Must-have

---

### UX-CHAR-004 — Character sheet: inline edit and mode transitions

- **Requirement:** The character sheet shall support in-place editing via click/tap on any editable
  field, transitioning the field to an edit control without navigating away, and auto-saving the
  field on blur or explicit save action.
- **Rationale:** CHAR-005, CHAR-007, CHAR-010. Foundry VTT's inline edit pattern [exemplar 4]
  reduces mode switching. NN/g's research on form friction [2] confirms that modal edit overlays
  increase task time significantly for frequent edits.
- **Spec:**
  - Edit trigger: single click (pointer) or tap on a field value transitions it to its edit control.
  - Edit controls by field type:
    - Text (name, backstory paragraphs): text input or textarea with character count for long
      fields. 
    - Integer (HP, AC, ability scores): number input with `inputmode="numeric"`, `min` / `max`
      bounds; NOT a delta stepper — direct set is appropriate for sheet editing outside combat.
    - Choice (conditions, concentration): the conditions panel opens as an inline popover or bottom
      sheet (mobile) listing current conditions with a remove button + an "Add condition" type-ahead.
    - Proficiencies: checkboxes in the skills / saving throws list.
  - Auto-save: on blur from a field, if the value changed, dispatch `character.edit-field`. A "Saved"
    indicator (subtle checkmark icon + "Saved" text, 2 seconds) appears adjacent to the field.
  - Keyboard: Escape cancels the edit and restores the previous value. Enter saves the field and
    returns focus to the field's read display.
  - Capability gating: fields the current user cannot edit (per capability set) are displayed as
    read-only text with no edit affordance. No edit cursor on hover. DM-only fields are invisible
    to players entirely — not grayed out, not shown as locked.
- **States:**
  - Read: text value, hover shows subtle underline or background shift indicating clickability.
  - Editing: input control; value editable; focus ring visible.
  - Saving: spinner adjacent to field; value shown.
  - Saved: checkmark icon + "Saved" text fades out after 2 s.
  - Error: field border turns error-token color; error message inline below field.
  - Locked (read-only): no interactive affordance; `aria-readonly="true"`.
- **Platform profiles:**
  - Desktop: hover state reveals "click to edit" underline. Inline input opens in-place.
  - Tablet: tap to edit; no hover. Inline input opens in-place.
  - Mobile: tap to edit; for long text fields, opens a bottom sheet editor with a "Done" button
    to avoid the virtual keyboard obscuring the full sheet.
- **Input:** pointer · touch · keyboard — Tab moves focus to next editable field; Enter activates
  edit; Escape cancels.
- **Accessibility:** Editable fields have `aria-label` including the field name. On edit activation,
  focus moves to the input. On save/cancel, focus returns to the display element. Error messages
  linked via `aria-describedby`. `aria-invalid="true"` on errored inputs.
- **Acceptance criteria:**
  - Given the player clicks on their character's name, then the name transitions to a text input with the current value selected.
  - Given the player edits the name and presses Enter, then the field saves and shows "Saved" briefly.
  - Given the player presses Escape while editing, then the field reverts to the previous value.
  - Given the player lacks edit permission on a field, then that field has no click-to-edit affordance and no edit cursor.
- **Priority:** Must-have

---

### UX-CHAR-005 — HP delta stepper: in-play combat resource control

- **Requirement:** The primary HP interaction during active play shall be a delta stepper (Damage /
  Heal) with large touch targets, optimistic update showing the resulting HP before confirmation,
  and keyboard +/− shortcuts, rather than a raw number input.
- **Rationale:** CHAR-007. D&D Beyond HP tracker reference [5]. NN/g numeric input research [4].
  High-frequency in-play action; error cost is high; the game model is "apply delta" not "set HP."
- **Spec:**
  - **Stepper anatomy:**
    ```
    ┌──────────────────────────────────────────┐
    │  HP   52 / 52   (Temp: 0)               │
    │                                          │
    │  [-] [Amount: ___] [+]                  │
    │  [  Deal Damage  ] [     Heal     ]      │
    └──────────────────────────────────────────┘
    ```
  - Amount field: `type="number"`, `inputmode="numeric"`, `min="1"`, `max="9999"`, no spinner
    arrows (hidden via CSS), 64px wide. Defaults to 1. Accepts only positive integers.
  - The `-` and `+` buttons on either side decrement/increment the Amount field by 1 (min 1).
    Size: 44×44 CSS px (meets WCAG 2.2 §2.5.5 [6]).
  - **Deal Damage** button: subtracts Amount from current HP (to minimum 0), applies temp HP
    absorption first. Size: 56px tall, full-width on mobile, 50% on desktop.
  - **Heal** button: adds Amount to current HP (to maximum maxHp). Size: same as Deal Damage.
  - **Optimistic update:** as the user types in Amount, the resulting HP is shown in the HP
    display above: `HP 52/52` → shows `→ 45/52` in muted text alongside while Amount = 7.
  - **Temp HP** is a separate interaction: "Set temp HP" number input (full-width) + button.
    Temp HP is always replaced (not added), matching 5e rules.
  - **Direct HP set:** accessible as a secondary disclosure ("Set exact HP…") that opens an
    override input for DM use or edge-case corrections. Not the primary path.
  - Buttons are disabled while `sessionActive` is false; a hint text reads "Combat updates
    available during active sessions."
  - On commit: HP display updates optimistically; the command is dispatched; on rejection, the
    display reverts and an inline error appears.
- **States:**
  - Session inactive: all buttons disabled, hint text visible.
  - Amount empty: Deal/Heal buttons disabled; Amount shows placeholder "0".
  - Active: buttons enabled; optimistic preview showing.
  - Submitting: clicked button shows loading indicator; the other button is disabled.
  - Success: HP updates; buttons reset to default.
  - Error: HP reverts; error text inline; stepper re-enabled.
- **Platform profiles:**
  - Desktop: stepper in a right-panel widget or the combat section of the sheet. Compact horizontal layout.
  - Tablet: same horizontal layout, ≥44px targets.
  - Mobile: stepper is the primary element in the Combat tab, stacked vertically; Deal and Heal buttons full-width, 56px tall.
- **Input:** pointer · touch · keyboard — `+` key increments Amount; `-` key decrements; `D` triggers Deal Damage; `H` triggers Heal (keyboard shortcuts active only when the stepper widget has focus). Enter in Amount field defaults to Heal if HP < max, otherwise does nothing.
- **Accessibility:** Stepper container `role="group"`, `aria-label="HP controls for [name]"`. Amount input `aria-label="Amount"`. Deal Damage and Heal buttons clearly labeled. Optimistic preview announced by `aria-live="polite"` region adjacent to the HP display. Result after commit announced: "HP updated: 45 of 52."
- **Acceptance criteria:**
  - Given the player types 7 in Amount, then the HP display shows "→ 45 / 52" in muted text.
  - Given the player clicks Deal Damage with Amount = 7 and HP = 52, then HP becomes 45 and the display updates within 100 ms.
  - Given the player presses + on the keyboard with the stepper focused and Amount = 3, then Amount becomes 4.
  - Given the session is inactive, then Deal Damage and Heal buttons are disabled and a hint reads "Combat updates available during active sessions."
  - Given temp HP is 5 and the player deals 3 damage, then temp HP becomes 2 and current HP is unchanged.
- **Priority:** Must-have

---

### UX-CHAR-006 — Death saves, conditions, and concentration panel

- **Requirement:** Death saves (3 successes, 3 failures), active conditions (list with remove),
  and concentration shall be directly manipulable from the combat view as large-target tappable
  controls, not text inputs.
- **Rationale:** CHAR-007. In-play hot path. Conditions and death saves are binary state changes
  that benefit from direct tap-to-toggle rather than a text entry flow.
- **Spec:**
  - **Death saves:** 6 circles in 2 rows (3 successes, 3 failures). Success circles fill green on
    tap, left to right. Failure circles fill red on tap. Third failure triggers a "Stabilize /
    Dead?" prompt for the DM to resolve. All 6 circles are `role="checkbox"` with `aria-label`.
    A "Reset death saves" button clears all. Each circle: 36×36 CSS px (within a 44×44 touch
    zone with 4px gap).
  - **Conditions:** Current conditions shown as removable pill badges. "Add condition" opens a
    type-ahead popover seeded with the 14 standard 5e conditions (Blinded, Charmed, Deafened,
    Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone,
    Restrained, Stunned, Unconscious) plus free-text entry. Each condition pill has an × remove
    button (44×44 touch zone for the whole pill). All `role="listitem"` in `role="list"`.
  - **Concentration:** A single toggle row: "Concentrating on: [spell name or —]". Tap "Concentrate"
    opens an input for the spell name; tap "Drop" clears concentration immediately.
- **States:**
  - No conditions: "No conditions" placeholder pill (muted, non-interactive).
  - No concentration: "Not concentrating" row.
  - All three death-save failures: a "danger" visual treatment on the character card (red border).
  - Stable: death save row shows "Stable" badge and circles are locked.
- **Platform profiles:**
  - Desktop/Tablet: conditions panel is a section within the combat area, full-width.
  - Mobile: rendered as the bottom segment of the Combat tab, full-width, with 56px-tall buttons.
- **Input:** pointer · touch · keyboard — death save circles keyboard-toggleable with Space;
  conditions list keyboard-navigable; Add condition trigger is a button with keyboard activation.
- **Accessibility:** Death save circles: `role="checkbox"`, `aria-label="Death save success 1"`.
  Condition list: `role="list"`, each pill has an accessible name including the condition name.
  "Add condition" button triggers a `role="dialog"` popover. `aria-live="polite"` announces
  condition additions and removals.
- **Acceptance criteria:**
  - Given the player taps a death save success circle, then it fills visually and the state updates.
  - Given all 3 failure circles are filled, then a "Stabilize / Dead?" prompt appears for the DM.
  - Given the player taps "Add condition", then a type-ahead popover opens with the 14 standard conditions listed.
  - Given the player taps "Poisoned" in the popover, then "Poisoned" appears as a pill badge on the conditions list.
  - Given the player taps × on the Poisoned badge, then Poisoned is removed.
- **Priority:** Must-have

---

### UX-CHAR-007 — Spell slots and class resources: pip display

- **Requirement:** Spell slots and class resources (Rage, Ki, Lay on Hands, etc.) shall be
  displayed as a pip row (filled / empty circles or squares) that can be tapped/clicked to
  expend one use, with the remaining count shown numerically, for at-a-glance scannability.
- **Rationale:** CHAR-007, CHAR-008. Foundry VTT pip pattern [exemplar 4]. Pips are more
  spatially scannable than "3/4" text pairs; they show depletion visually across the table.
- **Spec:**
  - Each spell slot level displayed as a label row: "Level 2 slots · 3 remaining"
    followed by a pip row of N circles (max = max slots for level).
  - Filled pip: full-color circle (`--token-pip-used`). Empty pip: outline circle
    (`--token-pip-available`). Tapping an empty pip → prompts Cast; tapping a filled pip → no
    action (slots are not returned by tapping in play — use Short/Long Rest for recovery).
  - Each pip: 20×20 CSS px with a 44×44 touch target zone achieved by padding.
  - Max pips per row: 10. For classes with >10 of a resource (Lay on Hands points = numeric
    display, not pips).
  - **Cast action:** tapping the "Cast (L2)" button below the pip row (not the pip itself) is the
    primary affordance. Tapping pips is a secondary shortcut (pointer only — touch targets ≥44px
    would make dense pip rows unwieldy on mobile; on mobile the Cast button is the sole target).
  - Class resources follow the same pip pattern; their recharge tag (Short Rest / Long Rest) is
    shown as a small badge on the row label.
  - **Short Rest / Long Rest** buttons: owner-only, appear in a "Recovery" section below the
    resources list. Each prompts a confirm action ("Take short rest? Resources marked 'short rest'
    will recover.") to avoid accidental triggers.
- **States:**
  - All slots available: all pips outline / empty. Cast button active.
  - Some used: mix of filled/empty pips; count reflects actual.
  - All used: all pips filled; Cast button disabled.
  - Session inactive: Cast button disabled.
  - Non-owner: Cast button visible, enabled only if `combat-participant` grant applies.
- **Platform profiles:**
  - Desktop/Tablet: pips shown inline in the Spells tab section. Cast button right-aligned on each row.
  - Mobile: Spells tab shows pip rows with the Cast button below each row, full-width.
- **Input:** pointer — click pip for shortcut; touch — use Cast button only; keyboard — Tab to Cast button, Enter to cast.
- **Accessibility:** Pip row: `role="group"`, `aria-label="Level 2 spell slots, 3 of 4 available"`. Each pip `role="img"` with `aria-label="Slot 1: used"` or "available". Cast button `aria-label="Cast a level 2 spell slot"`.
- **Acceptance criteria:**
  - Given a sorcerer has 4 level 2 slots, 1 used, when the Spells tab renders, then 3 empty pips and 1 filled pip appear in the level 2 row.
  - Given the player clicks "Cast" on level 2, then 1 empty pip becomes filled and the count reads "2 remaining".
  - Given all 4 level 2 slots are used, then the Cast button for level 2 is disabled.
  - Given the player clicks Short Rest, then a confirmation prompt appears before resources recover.
- **Priority:** Must-have

---

### UX-CHAR-008 — Level-up / advancement wizard

- **Requirement:** The level-up flow shall be a staged advancement modal/drawer — opening with a
  level-up summary, collecting class choices step by step, showing validation inline, and
  presenting a disabled "Finalize level-up" button until all choices are valid.
- **Rationale:** CHAR-009. Staged-commit pattern prevents partial character state. D&D Beyond
  level-up flow reference [5] shows a choice-by-choice flow with feature previews.
- **Spec:**
  - Trigger: "Level up" button on the sheet header (visible when `xpEligible` or DM grants
    milestone). Also accessible from the Advancement section of the Features tab.
  - Advancement mode selector: "XP-based" (only shows if eligible) / "Milestone" (always
    available to DM, available to owner if DM has configured milestone mode).
  - Staged choices (order may vary by class):
    1. **Class confirmation** — confirm the class gaining the level (multi-class: choose which).
    2. **Hit points** — choose: average HP, or roll (dice roller inline), or manual entry.
    3. **Subclass** (if applicable at this level) — choice card with feature preview.
    4. **Ability Score Improvement or Feat** (if applicable) — choice between ASI (+2 to one
       stat, or +1/+1) or Feat (type-ahead from feat list with description).
    5. **New features** — read-only summary of features gained; confirm acknowledgment.
  - Each choice uses the same one-thing-per-step pattern as the creation wizard.
  - The level-up wizard is presented in a modal dialog (desktop/tablet) or a full-screen drawer
    (mobile), so the sheet is visually preserved behind it.
  - Validation: inline per choice. "Finalize level-up" button (`aria-disabled` not `disabled` when
    invalid) with a tooltip listing remaining issues.
  - DM review: after the owner finalizes, the DM receives a notification "Thorin leveled up to
    Fighter 6 — review". DM can view and confirm; their confirmation is attributed per CHAR-009.
  - Canceling the advancement: "Cancel level-up" clears the staged draft; no change to the
    character. Confirmation dialog required.
- **States:**
  - No advancement in progress: "Level up (XP)" / "Level up (Milestone)" buttons visible (eligibility-gated).
  - Advancement draft open: wizard modal/drawer active; sheet behind it; progress persisted.
  - Finalized (pending DM review): banner on sheet "Level-up pending DM confirmation."
  - Confirmed by DM: character updates; banner removed.
- **Platform profiles:**
  - Desktop/Tablet: modal dialog (max 640px wide, centered), sheet dimmed behind.
  - Mobile: full-screen drawer sliding up from bottom, step stepper at top.
- **Input:** pointer · touch · keyboard — modal receives focus trap (WCAG 2.2 §2.1.2); Tab within modal only; Escape closes (with confirm).
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to "Level up to Fighter 6" heading. Focus moves to dialog on open; returns to trigger button on close.
- **Acceptance criteria:**
  - Given the character has sufficient XP, when the player clicks "Level up (XP)", then the advancement modal opens with class confirmation as step 1.
  - Given the player chooses HP roll, then an inline dice roller is available and the rolled value is auto-populated.
  - Given incomplete choices, when the player attempts to click "Finalize level-up", then the button is aria-disabled and a tooltip lists incomplete choices.
  - Given the player finalizes the advancement, then the character sheet shows the new level and a "Pending DM review" banner.
  - Given the player clicks Escape in the modal, then a "Cancel level-up?" confirm dialog appears.
- **Priority:** Should-have

---

### UX-CHAR-009 — Collaborative editing: DM attribution badges

- **Requirement:** In collaborative mode, every character field that was last edited by the DM
  shall display a visually distinct "DM-edited" badge adjacent to the field label; every conflict
  shall surface inline on the affected field with "Keep [value] (yours)" and "Use [value] (DM)"
  options; DM-only fields shall be invisible to players — not shown as locked or redacted.
- **Rationale:** CHAR-004, CHAR-005, CHAR-014. DM authority model from `00-vision-brief.md`.
  Attribution must be visible (CHAR-014 AC) and must not leak DM-only content (CHAR-014 AC2).
  Material Design state layer guidance [12].
- **Spec:**
  - **DM badge:** A pill reading "DM-edited" using `--token-badge-dm-bg` (deep purple, ~`#4B2E83`)
    and `--token-badge-dm-fg` (white). 11px font, 4px padding horizontal, 2px vertical, 4px
    border-radius. Placed inline to the right of the field label. Never uses color alone — text
    "DM-edited" is always present.
  - **Player badge:** A pill reading "Your edit" in green (`--token-badge-player-bg`). Same
    sizing. Only shown when the field has a pending uncommitted edit by the current user.
  - **Conflict badge:** A pill reading "Conflict" in amber/red (`--token-badge-conflict-bg`).
    Shown when `field.conflicted` is true. The field's edit input is disabled until the DM resolves.
  - **Conflict resolution UI (DM only):** Below the conflicted field, two side-by-side buttons:
    - "Keep '[player value]' (player edit)" — `role="button"`, primary style.
    - "Use '[DM value]' (your edit)" — `role="button"`, secondary style.
    Values truncated at 40 characters with ellipsis if longer.
  - **Non-DM conflict state:** Below the conflicted field, read-only text "Awaiting DM
    resolution" with the current canonical value displayed.
  - **DM-only fields:** invisible to players — no field row, no placeholder, no badge. The DM
    sees them with a `(DM only)` label suffix in muted text; they are not badged as "DM-edited"
    unless they were most recently edited by the DM (which is trivially always true for a dm-only
    field, so the DM-edited badge is suppressed on dm-only fields to avoid visual noise — these
    fields are already labeled "(DM only)").
  - **Edit history:** A disclosure "Edit history (N)" at the bottom of each character section shows
    a chronological list of field changes with actor role badge. Non-DM actors see only visible
    fields in the history; dm-only field edits are absent from the player-facing history.
- **States:**
  - Field unedited: no badge.
  - Field DM-edited: purple "DM-edited" badge.
  - Field player-edited (pending): green "Your edit" badge.
  - Field conflicted: amber "Conflict" badge + resolution UI (DM) or waiting text (player).
  - DM-only field (DM view): "(DM only)" label suffix; no "DM-edited" badge.
  - DM-only field (player view): field row absent entirely.
- **Platform profiles:**
  - Desktop: badges visible inline on field labels; conflict resolution buttons full-width of field row.
  - Tablet: same; badges wrap if label is long.
  - Mobile: badges appear as a small icon + text below the field label (below, not inline, to avoid truncation); conflict resolution expands to full-width stacked buttons.
- **Input:** pointer · touch · keyboard — conflict resolution buttons are standard buttons, Tab/Enter navigable.
- **Accessibility:** DM badge `role="img"` or `role="status"` is NOT appropriate — it is decorative attribution. It should be inline text in the label's `<span>` so screen readers read "Character name [DM-edited]". Conflict resolution: each button has `aria-label` including the value ("Keep 'Thorin' (player edit)"). `aria-live="polite"` announces when a conflict is resolved.
- **Acceptance criteria:**
  - Given the DM edits a player-visible field, when the player views the sheet, then "DM-edited" badge appears adjacent to the field label.
  - Given the DM edits a dm-only field, when the player views the character, then no label, field row, badge, or history entry reveals the field exists.
  - Given concurrent edits produce a conflict, when the DM views the field, then "Keep [value] (player edit)" and "Use [value] (your edit)" buttons appear.
  - Given the DM resolves the conflict, when the player receives the update, then the conflict badge is removed and the canonical value reflects the chosen value.
  - Given a color is removed (grayscale test), then "DM-edited" badge is still distinguishable from "Conflict" badge by its text content alone.
- **Priority:** Must-have

---

### UX-CHAR-010 — Data-exposure widget: binding path browser

- **Requirement:** A canvas widget that binds to a character's data-exposure API shall present a
  character picker and a binding path browser organized by field group (HP, Resources, Conditions,
  Spell slots, Abilities, Skills, Equipment, Notes), with the resolved value shown in a preview
  panel, and fail-closed visual states for hidden, conflicted, or missing paths.
- **Rationale:** CHAR-006. Canvas widgets in `04-canvas-scene-widgets.md` consume this surface.
  The widget binding UI must be usable by non-technical users (no raw selector strings visible
  unless the user expands "Advanced").
- **Spec:**
  - Character picker: a dropdown of actor-visible characters. Selecting a character loads the
    binding path browser.
  - Binding path browser: a two-level list: group headers (Identity / HP / Resources / etc.)
    with indented path rows. Each path has a human-readable label ("Current hit points") and the
    selector string shown in `code` style beneath ("combat.hp").
  - Clicking a path selects it; the preview panel shows the resolved value for the active actor.
  - Preview panel states:
    - `available`: resolved value shown (e.g., "52" for HP).
    - `hidden`: "This data is not visible to you." (no value, no hint).
    - `conflicted`: "Value is in conflict — DM must resolve before binding reads correctly."
    - `missing`: "This path is not part of the published data contract."
  - Advanced mode (disclosure "Show raw selector"): reveals the `selector` string in a read-only
    input for copy-paste. Hidden by default.
  - Widget configuration panel (for DM placing a widget on a canvas): character picker + path
    browser + optional label override for the widget display name.
- **States:**
  - No character selected: path browser shows placeholder "Select a character above."
  - Path selected, available: preview shows value + last-updated timestamp.
  - Path selected, hidden: "Not visible" preview state.
  - Path selected, conflicted: "Conflict" preview state with instruction.
  - Path selected, missing: "Unknown path" preview state.
- **Platform profiles:**
  - Desktop/Tablet: character picker + path browser in a side-panel; preview inline.
  - Mobile: character picker full-width; path browser full-width (accordion groups); preview in a sticky bar at bottom.
- **Input:** pointer · touch · keyboard — path browser items navigable by arrow keys, Enter to select.
- **Accessibility:** Path browser: `role="tree"` with `role="treeitem"` per path. Selected path: `aria-selected="true"`. Preview panel: `role="status"` with `aria-live="polite"` for value updates.
- **Acceptance criteria:**
  - Given the user selects a character and clicks "Current hit points (combat.hp)", then the preview shows the character's current HP value.
  - Given the user selects a path for a DM-only field as a non-DM, then the preview shows "This data is not visible to you" with no value.
  - Given the user selects a path that does not exist in the contract, then the preview shows "Unknown path."
- **Priority:** Must-have

---

### UX-CHAR-011 — Party / roster overview

- **Requirement:** The party overview shall display a scannable list of visible party members with
  HP/AC/conditions summary, an ordered marching order (DM-editable), and a party inventory list
  (DM-managed, visibility-tagged), all actor-filtered (hidden characters are absent, not redacted).
- **Rationale:** CHAR-011, CHAR-015. The party overview is the DM's at-a-glance combat health
  dashboard — it must be glanceable, not just readable.
- **Spec:**
  - Each party member card (compact, 64px tall on desktop):
    - Left: character name (bold) · Class/Level (muted) · Kind badge.
    - Center: HP progress bar (visual) + "52 / 52" numerals + temp HP if nonzero.
    - Right: AC badge · conditions pills (up to 2 visible, "+N more" badge if more).
    - Death saves: only if any saves are active (nonzero); shown as 3+3 dot row.
  - HP progress bar: filled green (>50% HP), amber (25–50%), red (<25%). The thresholds are
    visible at a glance. The fill color uses token values from `01-visual-design-system.md`
    (`--token-hp-high`, `--token-hp-mid`, `--token-hp-low`).
  - Marching order: numbered list; DM can drag-to-reorder (with Up/Down button alternative for
    keyboard and touch-only). Non-DM sees the order as read-only.
  - Party inventory: card list with item name, detail, and visibility badge (DM only / Shared /
    Player visible). DM can add (inline form at bottom: name + detail + visibility) and remove
    (trash icon with confirm). Count of hidden items shown to DM only ("3 items hidden from players").
  - Observer view: empty state "No party information available." (CHAR-015).
- **States:**
  - Empty (no visible members): "No party members are visible to you."
  - Observer: same empty state.
  - Active with conditions: conditions pills shown on member cards.
  - Low HP member: card has red accent border.
- **Platform profiles:**
  - Desktop: overview as a panel in the Command Center or a sidebar; member cards in a compact list.
  - Tablet: full-width panel; member cards at comfortable density.
  - Mobile: slim view showing character name + HP bar + AC only; tap a member to expand their card.
- **Input:** pointer · touch · keyboard — drag-to-reorder has Up/Down button alternatives; inventory form tab-navigable.
- **Accessibility:** List of members: `role="list"`. Each member card: `role="listitem"`. HP progress bar: `role="meter"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax`. Conditions: `role="list"` within the card. Drag reorder: Up/Down buttons are always present (not supplemental) for accessibility.
- **Acceptance criteria:**
  - Given the party has 3 visible members, when the overview renders, then 3 member cards appear with HP bars.
  - Given a member is at 20% HP, then their HP bar is red and their card has a red accent border.
  - Given a DM clicks "Move up" on member 2, then member 2 swaps position with member 1.
  - Given an observer views the party overview, then they see "No party information available."
  - Given the DM has 3 hidden characters, then the DM sees "3 characters hidden from players" and no one else sees this.
- **Priority:** Should-have

---

### UX-CHAR-012 — Character journal

- **Requirement:** The character journal surface shall allow the character owner (and DM) to add,
  view, and remove journal entries with explicit per-entry visibility selection, rendered in an
  actor-filtered list that omits non-visible entries entirely (not redacted).
- **Rationale:** CHAR-012, CHAR-016. Journal is a private player space; visibility enforcement
  must be absolute and the UX must make the visibility choice explicit and hard to get wrong.
- **Spec:**
  - Entry kinds shown as a tab/filter row: All · Notes · Bookmarks · NPC Impressions ·
    Personal Quests · Session Highlights.
  - Each entry card: title (bold) · kind badge · visibility badge · body (if present,
    first 2 lines with "Read more" expand) · date/time.
  - Visibility badge treatments:
    - "Private (you + DM)" — lock icon + text, `--token-badge-private` (muted amber).
    - "Player visible" — eye icon + text, `--token-badge-visible` (muted blue).
    - "Shared with party" — group icon + text, `--token-badge-shared` (muted green).
  - Add entry form (owner / DM only): title text + body textarea + kind select + visibility select.
    The visibility select defaults to "Private (you + DM)" — fail-closed per CHAR-016.
    The form includes a visibility helper tooltip: "Who can see this entry?" with a short
    explanation of each option.
  - Removing an entry: trash icon → confirm "Remove this entry? This cannot be undone." with
    Undo available for 5 seconds after confirm (optimistic remove + undo toast).
  - Non-owner, non-DM, observer: sees only entries explicitly shared with them; others are absent
    with no count, no title snippets, no relationship edges visible.
- **States:**
  - Empty (no visible entries): "No journal entries yet. Add your first entry below." (shown only
    to owner/DM); "No journal entries to show." (shown to others).
  - Adding: form visible below the entry list.
  - Removing: entry removed optimistically; undo toast "Entry removed — Undo" for 5 seconds.
  - Visibility changed: entry card updates immediately.
- **Platform profiles:**
  - Desktop/Tablet: journal as a tab on the character sheet (right-side tab strip). Entry list + add form in a single-column layout.
  - Mobile: Journal accessible via "More" bottom sheet → Journal. Entry list full-width; add form stacked below.
- **Input:** pointer · touch · keyboard — entry cards focusable; remove button keyboard-accessible; undo toast has a keyboard-accessible "Undo" button.
- **Accessibility:** Entry list: `role="list"`. Each card: `role="article"`. Visibility badge: text always present, never color alone. Remove button: `aria-label="Remove journal entry: [title]"`. Undo toast: `role="status"` with `aria-live="assertive"`.
- **Acceptance criteria:**
  - Given the player adds an entry with visibility "Private", when another player views the character journal, then that entry is absent with no title, count, or snippet visible.
  - Given the player removes an entry, then an undo toast appears for 5 seconds.
  - Given the player clicks Undo, then the entry is restored.
  - Given the journal is empty and the player is the owner, then the empty state includes an "Add your first entry" prompt.
  - Given the visibility defaults, when an entry is created without selecting visibility, then it defaults to "Private (you + DM)".
- **Priority:** Should-have (CHAR-016 enforcement is Must-have; journal UI itself is Should-have)

---

### UX-CHAR-013 — Draft ownership management (DM surface)

- **Requirement:** The DM shall have a draft management surface listing all unfinalized PC drafts
  with their assigned owner (or "Unassigned"), offering assign / transfer / revoke actions as
  inline controls with confirmation for transfers and revocations.
- **Rationale:** CHAR-003, CHAR-013. The DM creates and manages draft ownership before players
  start creation. This is a low-frequency but safety-critical action (a wrong transfer loses a
  player's progress access).
- **Spec:**
  - Draft list: each draft card shows character name (or "Unnamed draft"), assigned owner name
    (or "Unassigned"), step completion status ("4 of 7 steps"), finalization status.
  - Assign (unassigned draft): a player picker dropdown + "Assign" button.
  - Transfer (assigned draft): "Transfer to…" — player picker + "Transfer" button + confirmation
    dialog: "Transfer this draft to [Player B]? [Player A] will lose access immediately."
  - Revoke (assigned draft): "Revoke ownership" — confirmation dialog: "Revoke [Player A]'s
    access to this draft?"
  - All actions dispatch through the `permission.grant-capability-set` / revoke commands.
  - This surface references `11-collaboration-permissions.md` for the capability-set assignment
    UI patterns — this surface is a character-specific specialization of those patterns.
- **States:**
  - Unassigned draft: assign UI visible.
  - Assigned, in progress: transfer / revoke UI visible; step summary shown.
  - Finalized draft (character created): shown as read-only "Finalized" badge; no management actions.
- **Platform profiles:** Available on all profiles; on mobile, each card's management actions are in a bottom sheet triggered by a "Manage" button.
- **Acceptance criteria:**
  - Given an unfinalized draft has Player A as owner, when the DM transfers it to Player B and confirms, then Player B can open the draft and Player A sees "Draft unavailable."
  - Given the DM clicks Transfer, then a confirmation dialog appears before the action is dispatched.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 HP stepper component

| State | Visual | ARIA |
|---|---|---|
| Session inactive | Buttons disabled, muted color, hint text below | `aria-disabled="true"` on buttons; hint in `aria-describedby` |
| Ready | Amount = 1 default; Deal / Heal enabled | `aria-label="Amount"` on input; buttons labeled |
| Amount entered | Preview "→ [new HP] / [max]" in muted text below HP display | Preview in `aria-live="polite"` region |
| Submitting | Clicked button shows spinner, other disabled | `aria-busy="true"` on button |
| Success | HP number updates, preview clears | `aria-live="polite"` "HP updated: N of M" |
| Error | HP reverts, error text inline, stepper re-enabled | `role="alert"` on error message |
| Temp HP absorb | Preview shows temp HP consumed first | Preview text includes temp HP change |

### 6.2 Creation wizard step rail component

| State | Visual | ARIA |
|---|---|---|
| Not started | Empty circle, muted text | `aria-label="[Step N]: [title], not started"` |
| In progress (saved, invalid) | Half-filled circle, amber | `aria-label="[Step]: [title], issues present"` |
| Complete (saved, valid) | Filled checkmark, green | `aria-label="[Step]: [title], complete"` |
| Active | Accent underline/highlight | `aria-selected="true"`, `aria-current="step"` |
| Navigating (with unsaved changes) | Prompt: "Save changes before leaving?" | Focus moves to dialog |

### 6.3 DM attribution badge

| State | Token | Text content | When shown |
|---|---|---|---|
| DM-edited | `--token-badge-dm-bg` (purple) / `--token-badge-dm-fg` (white) | "DM-edited" | Field last edited by DM actor |
| Player-edited (pending) | `--token-badge-player-bg` (green) / `--token-badge-player-fg` (white) | "Your edit" | Active user has pending uncommitted change |
| Conflict | `--token-badge-conflict-bg` (amber-red) / `--token-badge-conflict-fg` (white) | "Conflict" | `field.conflicted = true` |
| DM-only (DM view) | No badge — label suffix "(DM only)" in muted text | "(DM only)" | Field has `dm-only` access classification |
| DM-only (player view) | Field row absent entirely | — | Field has `dm-only` access; player is not DM |

### 6.4 Condition pill component

| State | Visual | Interaction |
|---|---|---|
| Active condition | Pill with condition name + × button; amber background | × removes condition (44px touch zone) |
| "No conditions" | Muted placeholder pill, non-interactive | None |
| Add condition open | Type-ahead popover with 14 standard conditions + free text | Dismiss: Escape / click outside |

### 6.5 Spell slot pip row

| State | Visual | Interaction |
|---|---|---|
| Available | Outline circle, `--token-pip-available` | Pointer: click to initiate cast; Touch: no action |
| Used | Filled circle, `--token-pip-used` | No interaction |
| All used | All filled, Cast button disabled | — |
| Cast button | Secondary button, `aria-label="Cast a level N spell slot"` | Click/tap/Enter to cast |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥1024px)

The character sheet occupies the main content area (full-height minus top bar). Two-column layout:
- Left column (280–320px, fixed): identity header + vitals bar + ability score grid + saving throws
  + skills list. This column does not scroll independently — it scrolls with the page.
- Right column (remaining width): tabbed section browser (Actions / Spells / Equipment / Features
  / Backstory / Notes / Journal). Active tab content scrolls independently.

The vitals bar (HP, AC, conditions) is sticky within the left column so it remains visible during
right-column scroll on very tall sheets.

The quick-create panel is accessible from the DM's Command Center or from a "Create NPC" button in
the roster. It opens as a panel adjacent to the roster, not a modal.

The creation wizard opens as a full-panel view within the main content area (not a modal), with the
step rail on the left (200px), content center (600px max), and rules preview on the right (240px).

### 7.2 Tablet (600–1023px)

The character sheet is single-column with a horizontal tab bar at the top. The vitals bar is a
sticky 64px bar at the top of the page (above the tab bar). The tab bar collapses lower-frequency
tabs into a "More" overflow menu.

The creation wizard collapses the rules preview panel into a collapsible "See benefits" disclosure
below the step content. The step rail becomes a horizontal scrollable stepper at the top.

### 7.3 Mobile (<600px)

The character sheet defaults to the **Combat** tab — HP stepper, conditions, death saves,
concentration, spell slots. A slim vitals bar (48px, sticky) persists at the very top showing
HP / AC / one condition summary. The bottom navigation bar provides access to: Combat, Spells,
Sheet (ability scores), Party, Journal, More.

The creation wizard uses the full-screen focused step pattern: one question visible, horizontal
stepper at top (abbreviated step titles), all secondary content (rules, descriptions) behind
disclosures. Mobile keyboard considerations: number fields open numeric keyboard (`inputmode`);
text fields open full keyboard; the step content area scrolls above the keyboard.

The HP stepper on mobile has Deal Damage and Heal buttons that are each 56×full-width, tall enough
to tap in a dark room at the table.

---

## 8. Motion & feedback

| Interaction | Animation | Duration | Easing | `prefers-reduced-motion` fallback |
|---|---|---|---|---|
| HP value change (number update) | Count-up / count-down numeral animation | 300 ms | `ease-out` | Instant value swap, no animation |
| Collaborative field update (remote) | Subtle pulse on the field row (opacity 0.6 → 1.0) | 400 ms | `ease-in-out` | Instant; the DM badge appears without animation |
| Step navigation (wizard) | Slide-in of next step content (horizontal slide, 240px) | 200 ms | `ease-in-out` | Instant swap, no slide |
| Condition added | Pill slides in from right | 150 ms | `ease-out` | Instant appear |
| Condition removed | Pill fades and collapses | 150 ms | `ease-in` | Instant remove |
| Spell slot pip expended | Fill animation (outline → filled) | 200 ms | `ease-out` | Instant fill |
| Toast / save indicator appear | Fade in | 120 ms | `ease-out` | Instant appear |
| Toast / save indicator disappear | Fade out | 200 ms | `ease-in` | Instant disappear |
| HP stepper preview text | Fade in when Amount > 0 | 100 ms | `ease` | Instant appear |
| Modal/drawer open (level-up) | Slide up (mobile) / scale-in (desktop) | 250 ms | `ease-out` | Instant show |

All animations must be suppressed (`animation: none`, `transition: none`) when
`prefers-reduced-motion: reduce` is active. The fallback must still include all state changes
(badge appearance, value update, completion indicator) — only motion is suppressed.

---

## 9. Accessibility requirements (surface-specific)

Beyond `03-accessibility.md` global requirements, this surface has additional obligations:

### 9.1 Live combat announcements
HP changes must be announced via a dedicated `aria-live="polite"` region outside the HP display
element (announcing the element itself can cause double-reads in some screen readers). The
announcement text: "[Character name] HP: [new HP] of [max]." Condition additions: "[Condition]
added to [Character name]." Condition removals: "[Condition] removed from [Character name]."
Death save: "Death save [success/failure] recorded. [N] [successes/failures] total."

### 9.2 Wizard focus management
On step navigation, focus must move to the step's H2 heading (via `tabIndex="-1"` + programmatic
focus) — not to the first input, to avoid surprise for screen reader users. The step count is read
as part of the heading: "Step 3 of 7 — Your ability scores". After saving a step, focus returns to
the step heading (not the CTA), so the user hears the step summary before continuing.

### 9.3 Modal focus trap
The level-up modal and the condition type-ahead popover must implement a focus trap (Tab cycles
within the modal; Shift-Tab reverses). On close, focus returns to the element that triggered the
modal/popover. This applies to the character picker popover, the condition popover, and the
advancement dialog.

### 9.4 Keyboard navigation within the pip grid
Spell slot pip rows are not individually focusable — the Cast button for each level is the keyboard
target. The pip row is announced via the parent `role="group"` `aria-label` which includes the
current availability count. Arrow keys within the pip row do nothing — this is correct; pips are
display-only on keyboard paths.

### 9.5 DM-only field absence (non-leaking)
When a player views a character, dm-only fields must produce zero DOM output — no `display:none`
elements, no `aria-hidden` elements, no empty `<li>` items. The field is not just hidden; it does
not exist in the rendered output. Screen reader users must not be able to discover the field count
via `Ctrl+F` or AT element enumeration.

### 9.6 Color-independent distinction
The three attribution badge types (DM-edited, player-edited, conflict) must be distinguishable in
grayscale and to colorblind users. In addition to distinct background colors, each badge uses
distinct text ("DM-edited" / "Your edit" / "Conflict") and may optionally use distinct icons
(shield / pencil / exclamation) as a third distinguishing dimension — icon required only if a
design audit reveals any two badges are too similar at small sizes.

---

## 10. Anti-patterns & explicit limitations

### Do not dump all creation fields on a single scrollable page
D&D Beyond's initial character builder used a single long form per class section. Their own
published conversion to a step-based flow [5] reduced completion rates for new players (2022
builder redesign documented in official blog). A creation wizard with 30+ fields on one scroll is
a known abandonment trigger [14]. **Rule:** no creation wizard step may have more than 6 fields.
Ability scores are a single step with a bounded 6-field grid.

### Do not use a raw `<input type="number">` for HP in combat
Browser-native number inputs have tiny +/− spinner buttons (typically 16×16px) that fail WCAG
touch target requirements [6] and cause frequent mis-taps in live-play conditions. The current
`CharacterCombatResources.svelte` uses `<input type="number">` for HP delta — this is the explicit
pattern to replace. The delta-stepper with large Deal Damage / Heal buttons is the correct
replacement.

### Do not show DM-only fields as "locked" or "grayed out" to players
Showing a grayed-out field with a lock icon communicates the field's existence to the player.
This leaks that the DM has recorded hidden information about their character, violating CHAR-014
and CHAR-005. The v2 components correctly omit these fields entirely — the UX must preserve this.
Any design that shows "hidden field" placeholders or "N fields restricted" counts is wrong.

### Do not surface conflicts only at finalization
In collaborative editing, deferring conflict presentation to a save/commit step (a pattern seen in
Git-style merge UIs) fails for live-play workflows where time pressure is extreme. Conflicts must
surface inline on the affected field as soon as they are detected by sync, per CHAR-004.

### Do not auto-advance the wizard step without an explicit user action
GOV.UK pattern library [1] and NN/g form research [2] both document that auto-advance (the step
advances automatically when the user finishes typing or selects an option) causes confusion,
especially when the user wants to review their choice before advancing. A deliberate "Continue"
CTA is required on every step.

### Do not make the "Finalize character" or "Finalize level-up" button invisible when disabled
A common pattern is to hide the primary CTA until all conditions are met. This leaves users
confused about how to complete the flow. Both finalize buttons should be visible but `aria-disabled`
(not removed from DOM and not `disabled`) with a tooltip explaining what is incomplete [1] [2].

### Do not use gesture-only drag for marching order reordering
Drag-to-reorder without a keyboard/button alternative violates WCAG 2.2 §2.5.7 (Dragging
Movements). The marching order must always have Up/Down buttons alongside any drag affordance.

### Do not use free-text condition entry as the primary condition input
While free-text conditions are valid as a fallback (for homebrew conditions), presenting a blank
text input as the primary condition entry interface forces users to remember the exact spelling of
standard conditions mid-combat. The type-ahead with the 14 standard 5e conditions pre-seeded is
the required primary experience.

---

## 11. Success metrics

| Metric | Target | Measurement |
|---|---|---|
| Quick-create task time (DM creates NPC with name + HP + AC) | ≤ 30 seconds from form open to success toast | Moderated usability session |
| Creation wizard step completion rate (new user completes all 7 steps) | ≥ 75% of users who start finish without abandoning | Analytics / funnel |
| HP update task time (player applies damage in combat) | ≤ 5 seconds tap-to-updated-display, including table-pressure conditions | Simulated live-play test |
| HP stepper error rate (user enters wrong HP due to UI friction) | < 5% of HP updates require immediate correction | Analytics |
| Sheet findability (user finds character's passive Perception in ≤ 3 taps from sheet landing) | ≥ 85% task success | Tree-test / first-click test |
| Attribution badge recognition (user identifies which fields are DM-edited) | ≥ 90% correct on first attempt, zero colorblind failures | A/B + accessibility audit |
| Conflict resolution time (DM resolves a conflict) | ≤ 10 seconds from noticing conflict to resolution | Moderated test |
| WCAG 2.2 AA axe-core violations | 0 critical | CI axe-core run per build |
| Touch target compliance | 100% of interactive elements ≥44×44 CSS px | Automated + manual audit |
| Wizard resume success (user reopens draft and reaches correct step) | ≥ 95% | Automated test (CHAR-002 AC) |

---

## 12. Open questions & risks

1. **Ability score generation UI complexity:** Point-buy, standard array, and dice roll are three
   distinct interactions for a single step. The dice roll variant requires an inline dice roller.
   Does the dice roller belong in `01-visual-design-system.md` as a shared component, or is it
   character-creation specific? Risk: if it's ad-hoc, the dice roller visual style may drift from
   the dice roller in the Command Center and session tools.

2. **Level-up DM approval flow detail:** CHAR-009 requires DM review and attribution of level-ups,
   but the exact notification mechanism (push notification, banner on the character sheet, an item
   in the DM's review queue) is underspecified. This interacts with `08-sessions-live-play.md`'s
   session notification patterns — needs alignment.

3. **Backstory editor vs. rich text:** The backstory step in the creation wizard and the Backstory
   tab on the sheet currently use plain textareas. If the content authoring surface (`09-content-
   authoring-and-sources.md`) introduces a rich-text editor component, backstory sections should
   use it. This is a dependency risk — the character sheet design should not block on the content
   editor design, but the component must be compatible.

4. **"What you get" rules preview content source:** The creation wizard's rules preview panel
   (class features, species traits, background proficiencies) requires structured rules data. The
   current `DRAFT_STEPS` in the v2 core are extensible but the feature/trait data is not yet in
   the specification. If rules data is not available at build time, the preview panel degrades to
   a "No preview available" placeholder — which is acceptable for v2.0 but reduces the wizard's
   key differentiation.

5. **Marching order drag-and-drop implementation:** The Up/Down button fallback is required and
   must be primary on all touch profiles, but drag-and-drop on desktop is expected by users
   familiar with other TTRPG tools. The drag library choice (if any) must integrate with the
   v2 processing-core dispatch model (drag end → dispatch `character.set-marching-order` command)
   without the GUI writing state directly.

6. **Character sheet data volume and performance:** A level 20 spellcaster has ~150 fields across
   all sections. Rendering all sections at once on mobile may exceed the 100ms interaction budget.
   Section tabs should lazy-load their content. This is an architecture concern to surface to the
   implementer.

---

## Sources

[1] "Question pages" — GOV.UK Design System — https://design-system.service.gov.uk/patterns/question-pages/

[2] "Web Form Design" (forms research) — Nielsen Norman Group — https://www.nngroup.com/articles/web-form-design/

[3] "Optimizing Credit Card Payment Forms" — Baymard Institute — https://baymard.com/blog/credit-card-field-auto-format-space

[4] "Slider Design: Rules of Thumb" / Numeric Inputs — Nielsen Norman Group — https://www.nngroup.com/articles/gui-slider-controls/

[5] D&D Beyond character sheet and builder — Wizards of the Coast / Fandom — https://www.dndbeyond.com/characters

[6] "Success Criterion 2.5.5 Target Size" — WCAG 2.2 — https://www.w3.org/TR/WCAG22/#target-size-enhanced

[7] "Buttons" (target sizes) — Apple Human Interface Guidelines — https://developer.apple.com/design/human-interface-guidelines/buttons

[8] Foundry Virtual Tabletop — character sheet design — https://foundryvtt.com

[9] Roll20 virtual tabletop — character sheets — https://roll20.net

[10] D&D Beyond character sheet HP tracker — https://www.dndbeyond.com/characters

[11] "Envisioning Information" (small multiples, data hierarchy) — Edward Tufte, 1990 — https://www.edwardtufte.com/book/envisioning-information/

[12] "State layers" — Material Design 3 — https://m3.material.io/foundations/interaction/states/overview

[13] "Conflict resolution in collaborative editing" — Google Workspace Help — https://support.google.com/docs/answer/190843

[14] "Form Abandonment: Why Users Leave Forms" — Typeform research — https://www.typeform.com/blog/form-abandonment/
