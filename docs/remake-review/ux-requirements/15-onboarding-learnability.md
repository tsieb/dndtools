# UX Requirements — Onboarding & Learnability

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md` first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `PLAT-013`, `NAV-001`, `NAV-003`, `NAV-008` (cross-cutting; see §1 for full surface coverage)
> **Owner surface(s):** First-run wizard (`/onboarding`), Command Center empty state, all major surface empty states, persistent "?" help entry, keyboard cheat sheet, coach-mark layer, changelog surface

---

## 1. Scope

- **Covers:** The complete first-run and learnability system that every major surface in DND Tools 0.2.0 inherits. This includes: (a) the first-run setup wizard (vault naming, content-source selection, starter presets, role declaration); (b) the DM path to first value and the Player path to first value as distinct, role-appropriate journeys; (c) empty-state specifications for each major surface — Command Center, Canvas/Scene, Maps, Characters, Knowledge (notes/content), Knowledge Graph, and Sessions — as the primary in-product teaching surface; (d) contextual coach marks triggered by first-reach or failure, never by timer; (e) the persistent "?" help entry, keyboard shortcut cheat sheet triggered by "?", in-app help center surface, and "What's New" / changelog surface; (f) progressive onboarding for the genuinely complex surfaces (Canvas, Maps, Characters) layered over time; (g) the Player join/invite onboarding flow vs. the DM deep-setup path; (h) demo/sample content offer at each zero-data surface.
- **Does NOT cover:** The visual token definitions (colors, typography, spacing, radius, motion easing) — owned by `01-visual-design-system.md`, consumed here. Global navigation layout (sidebar, rail, bottom bar) — owned by `02-navigation-and-platform-profiles.md`, referenced here. Per-surface interaction mechanics for Canvas drag/resize/group — owned by `04-canvas-scene-widgets.md`. Command Center widget presets and session-state management — owned by `05-command-center.md`. Map-layer and fog-of-war mechanics — owned by `06-maps.md`. Character-sheet internals — owned by `07-characters.md`. WCAG conformance machinery and full keyboard model — owned by `03-accessibility.md`; this document states onboarding-specific a11y requirements only. The content-source sync protocol — owned by the functional `SYNC` domain.
- **Related functional requirements:**
  - `../requirements/15-platform.md` — `PLAT-013` (first-run onboarding surface; fixture-gated acceptance); `PLAT-001`–`PLAT-003` (platform profile separation used by slim-flow Player join)
  - `../requirements/14-navigation.md` — `NAV-001` (Command Center as home), `NAV-003` (command palette / global navigation), `NAV-008` (command palette actor filtering)
  - `../requirements/08-content-and-knowledge.md` — `CONTENT-*` (vault setup, note creation, source adapters)
  - `../requirements/05-sync.md` — `SYNC-*` (local-first, offline behavior during first-run)
- **Related UX docs:**
  - `01-visual-design-system.md` — design tokens, motion system, density modes, component anatomy
  - `02-navigation-and-platform-profiles.md` — platform profiles (Desktop/Tablet/Mobile), global nav placement, "return home" pattern, help entry placement
  - `03-accessibility.md` — global a11y baseline; WCAG 2.2 AA contract
  - `04-canvas-scene-widgets.md` — Canvas empty state cross-linked from §5.3
  - `05-command-center.md` — Command Center empty state cross-linked from §5.1
  - `06-maps.md` — Maps empty state cross-linked from §5.4
  - `07-characters.md` — Characters empty state cross-linked from §5.5

---

## 2. UX goals for this surface

Onboarding is not a gatekeeping ceremony. It is the product's first impression and its ongoing self-teaching infrastructure. DND Tools 0.2.0 is a complex tool with a genuine learning curve — vault setup, content sources, canvas composition, map layers, character data exposure, session management. The onboarding system's job is to bring a first-time DM and a first-time Player each to their own "aha moment" as fast as possible, then stay available without intruding as they grow into the product's depth.

Two distinct journeys define success:
- **DM first value:** Open the app → name a vault → choose a source → see a functioning Command Center with sample content → start building. Target: ≤5 minutes to a first note or map widget on screen.
- **Player first value:** Receive an invite link → create an account (or log in) → join the session → see their character on their canvas. Target: ≤90 seconds from clicking the invite link to having their character visible.

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | First-run screens feel like a deliberate, premium product introduction — not a generic SaaS setup flow. Atmospheric but legible: dark canvas background, one large focused illustration or iconographic callout per step, generous whitespace. The cheat sheet and help center inherit the application's genre aesthetic without sacrificing readability. |
| Information scent | Every first-run step label names a concrete outcome, not a system action. "Name your vault" not "Configure storage." Every empty state names the surface and the one next action at a glance with no additional reading required. The "?" button is labeled and consistently placed so users know help is available before they need it. |
| Navigability | First-run wizard is always resumable from Command Center (persistent "Finish setup" banner until complete). No step requires navigating away from the wizard to complete; external documentation links open in a new tab. The cheat sheet opens and closes in ≤1 action from any surface. |
| Intuition / learnability | First value requires zero reading of external documentation. Empty states teach by doing, not by explaining. Coach marks describe the specific affordance they point to, in ≤2 sentences. The player join flow requires no prior knowledge of the product whatsoever. |
| Accessibility | First-run wizard is fully keyboard-navigable. Coach marks have focus-managed dismiss and are announced via `aria-live`. Empty-state CTAs meet ≥44×44 CSS px touch targets. The cheat sheet is operable by keyboard and dismissable by `Escape`. All first-run illustrations have descriptive `alt` text. |
| Adaptability (platform profiles) | Desktop: wizard in centered dialog over dark overlay, full keyboard shortcuts immediately; full cheat sheet panel. Tablet: wizard as a centered sheet; cheat sheet in a bottom drawer. Mobile: wizard as a fullscreen sheet; cheat sheet as a scrollable bottom sheet; all coach marks re-anchored to the mobile layout; player join optimized for one-thumb operation. |
| Effective emphasis (visual hierarchy) | Each wizard step has exactly one primary CTA button. Each empty state has exactly one primary action and at most one secondary (e.g., "Load demo content"). Coach marks have exactly one action or dismiss affordance. The "?" button is never the most prominent element, but is always findable. |
| Feedback & responsiveness | Vault creation acknowledges within 100 ms (optimistic). Source connection shows determinate progress or a spinner with a status label. Each completed wizard step animates a checkmark (≤200 ms; `prefers-reduced-motion` suppresses). Demo content loads with skeleton placeholders that match final layout. |
| Error prevention & recovery | No wizard step is destructive. The vault name field validates inline before commit (no bad characters, length limits). Source connection errors show inline, actionable copy (retry vs. check credentials vs. skip). Skipping first-run is always available; the setup can be resumed from Settings. |
| Consistency | Wizard steps use the shared dialog/sheet component from `01-visual-design-system.md`. Empty states use a consistent three-part anatomy (illustration + headline + CTA) with tokens from the design system. Coach marks use one shared component with standard placement rules. The "?" button is the identical component at the identical position on every surface. |

---

## 3. Researched best practices

**3.1 Empty states as the primary teaching surface**

Nielsen Norman Group's article "Empty States for User-Created Content" establishes that zero-data states are among the most valuable real estate in a product because they appear exactly when users most need guidance [1]. NN/g identifies three types of empty state: (a) first-use (user has never added content), (b) user-cleared (user deleted everything), and (c) no results (filter/search returned nothing). Each requires a distinct response. First-use empty states should include a clear heading naming the space, a concise sentence explaining the space's purpose, a primary CTA to create the first item, and optionally a secondary CTA to load sample content. *Implication: Every empty state in DND Tools must follow the three-part anatomy (illustration + headline + one primary CTA) and distinguish first-use from cleared states. "No results" states require a search-specific sub-spec.*

**3.2 Onboarding as contextual, not tutorial**

NN/g's "UX Onboarding Methods" study distinguishes four approaches: (1) product tours / instructional overlays shown upfront, (2) contextual help triggered by first reach or failure, (3) sample data / demo mode, and (4) progressive disclosure of features [2]. Their research shows upfront product tours score lowest on both completion and retention because they appear before users have context for what they are learning. Contextual help and sample data score highest on task completion for complex tools. *Implication: DND Tools must default to contextual coach marks (triggered by first reach of a surface) and demo content offers, not upfront tutorial videos or modal tours. Upfront tours are an explicit anti-pattern (§10).*

**3.3 Coach marks — timing and frequency caps**

NN/g's "Instructional Overlays, Slideshow Tours, and Coach Marks" study finds that coach marks placed at first reach (not at session start) are 2.4× more likely to be read and acted on, and that users who encounter more than three coach marks in a single session begin dismissing without reading [3]. Frequency caps and "seen" state persistence are required. Apple HIG's onboarding guidelines state that hints and coach marks must never block interaction and must be immediately dismissible [4]. *Implication: Coach marks must fire at first-reach of a surface or first failure — not at login. No more than two coach marks per session (across all surfaces). Each mark is individually dismissible without dismissing others. "Seen" state persists across sessions.*

**3.4 First-run setup — skippable and resumable**

Superhuman's onboarding is a high-effort concierge call — appropriate for a power-email tool with a $30/month barrier but not for a free/freemium product [5]. Linear's first-run is the counter-model: it presents three progressive steps (workspace name → invite team → create first issue), each completable in ≤30 seconds, with a clear "skip" at every step [6]. Slack's setup similarly allows skipping each step and surfaces a "Finish setting up your workspace" banner in the sidebar until the checklist is complete [7]. Notion's first-run (2024) added a "Set up later" link on the very first screen, reducing abandonment [8]. *Implication: Every wizard step must have a "Skip" affordance. The wizard must be resumable from a persistent banner in Command Center (not only from Settings). No step may require more than 30 seconds of effort.*

**3.5 Figma as the gold standard for complex-tool first value**

Figma's first-run experience is cited across industry as the benchmark for a genuinely complex tool reaching first value fast [9]. Key patterns: (a) the "Starter file" pre-created in the user's workspace removes the blank-page paralysis; (b) the file opens with a brief embedded annotation layer (coach marks on real content, not on empty space); (c) the onboarding annotation layer is dismissible in one click; (d) it is never shown again on subsequent sessions. For new collaborators joining an existing workspace, Figma shows the workspace directly — no setup wizard at all. *Implication: DND Tools must offer a starter preset (DM) or skip directly to the joined session (Player). The onboarding annotation layer must appear on real content, not in an empty state.*

**3.6 Height and Arc — progressive feature reveal**

Height's onboarding introduces its "Sprints," "Automations," and "Pipelines" features only after the user has completed their first task [10]. Arc's "Spaces" concept is introduced via a coach mark that appears after the user has opened at least three tabs — the timing is behavioral, not time-based [11]. Both products use a "features you haven't tried yet" persistent section in their settings/profile area. *Implication: DND Tools must gate progressive feature reveals on behavioral triggers (first session started, first map created, first character linked), not on time elapsed since signup.*

**3.7 "?" keyboard shortcut cheat sheet — Gmail / Linear pattern**

Gmail pioneered the "?" key as the universal keyboard shortcut cheat sheet trigger; pressing "?" opens a modal overlay listing every keyboard shortcut, organized by category [12]. Linear adopted the same pattern and extended it with a search field and a "recently used" section [13]. GitHub, Figma, and Notion all follow this pattern. The cheat sheet closes on `Escape` or a second "?" press. It is a stateless affordance — it shows the current shortcuts regardless of app state. *Implication: DND Tools must implement "?" as the cheat sheet trigger on Desktop (and Surface keyboard on Tablet), with the full shortcut list organized by surface/category, searchable, and closable by Escape.*

**3.8 Player join flow — Duolingo and Superhuman as anti-examples, Figma share as exemplar**

Duolingo's first-run is 12 screens before a single lesson [14]; Superhuman requires a call. Both are too heavy for a player who simply received a link from their DM. Figma's viewer invite flow is the right reference: click link → authenticate (or sign up in ≤30 seconds) → land directly in the shared file [15]. The player should never see vault setup, source selection, or DM-specific configuration. *Implication: The Player join path must be a dedicated slim flow that bypasses all DM setup steps: authenticate → join session → see character. Any additional setup (profile name, character preferences) is deferred to after first value.*

**3.9 Material Design and Apple HIG empty states**

Material Design 3's "Empty states" guidelines prescribe: one centered illustration (preferably animated for delight, but `prefers-reduced-motion`-aware), a heading (≤5 words), a body sentence (≤2 sentences), and a primary action button [16]. Apple HIG's onboarding guidelines add that first-run experiences should "reflect the app's style," be completable without reading documentation, and never prevent access to the main interface [4]. Both sources agree on deferring optional features until after the user has experienced the core value. *Implication: DND Tools empty states must follow the Material anatomy precisely, with illustrations that match the application's genre aesthetic.*

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Figma** | Starter file pre-created; coach marks on real content; collaborator join skips setup entirely | Removes blank-page paralysis; makes onboarding annotations meaningful because content exists | Borrow: starter preset pattern, collaborator-skip pattern, coach marks on real content | https://www.figma.com |
| **Linear** | 3-step wizard, each ≤30 s, explicit "skip" on every step; persistent "Finish setup" in sidebar | Setup respects user time; completion feeling without forcing completion | Borrow: step-by-step structure, skip + resume pattern, persistent banner | https://linear.app |
| **Slack** | "Finish setting up your workspace" sidebar checklist with progress indicator; steps resume from where the user left off | Resumable setup matches real workflows (interrupted sessions, team onboarding) | Borrow: resumable checklist banner, progress indicator | https://slack.com |
| **Gmail / Linear** | "?" key opens full shortcut modal; organized by category; searchable; closes on Escape | Universal discoverability pattern; no hunting for "keyboard shortcuts" in settings | Borrow: "?" trigger, categorized layout, Escape to close | https://gmail.com |
| **Height** | Feature reveals gated on behavioral triggers (after first task) not time | Users learn features when they have context for them | Borrow: behavioral unlock triggers for advanced features | https://height.app |
| **Notion** | "Set up later" at every step; first workspace lands on a pre-built template | Zero-friction abandonment of setup; first view is useful, not empty | Borrow: "Set up later" affordance; avoid: Notion's document-first home (not the paradigm for DND Tools) | https://notion.so |
| **Duolingo** | Gamified progress, explicit streak/reward for completing onboarding | Extrinsic motivation works for habit-forming, low-stakes flows | Avoid: 12-screen pre-value flow; never appropriate for a tool with a real-work context | https://duolingo.com |
| **Superhuman** | Concierge onboarding call; white-glove but high-friction | Only viable with a high price point and homogenous user type | Avoid: any flow requiring human intervention before first use | https://superhuman.com |

**North-star narrative 1 — Figma (complex tool, collaborative join).**
The single most important lesson from Figma is that a first-run user should never face a blank canvas without orientation. Figma pre-creates a starter file and places coach marks on its real content. The player-invite flow lands directly in the shared workspace — no setup. DND Tools must give the DM a functioning starter Command Center with sample widgets the moment the vault is created, and must deliver the invited Player directly to the active session canvas with zero setup friction.

**North-star narrative 2 — Linear (setup as a respectful checklist).**
Linear's setup wizard is a model of respect for user time: three steps, each independently skippable, each completable in under 30 seconds, with a persistent sidebar reminder that survives interruption. The tone is "we'd like to show you around, but we won't hold you hostage." DND Tools must adopt this exact posture: a wizard that progresses quickly, never requires a step before showing the product, and surfaces a "Finish setup" reminder for as long as the DM needs it.

**North-star narrative 3 — Gmail / Linear "?" cheat sheet.**
The "?" shortcut is the most elegant solution to shortcut discoverability in complex tools because it is self-documenting, stateless, and universal. DND Tools is a keyboard-shortcut-heavy tool (canvas pan/zoom, initiative advance, command palette) and must make its full shortcut vocabulary findable with one key. The cheat sheet must be organized by surface (Canvas, Session, Global), searchable, and permanently available — not tucked into "Help > Keyboard shortcuts" three menus deep.

---

## 5. UX/UI requirements

### UX-ONB-001 — First-run wizard: minimal, skippable, resumable
- **Requirement:** On vault creation (fresh install or new vault), the system must present a first-run wizard of ≤5 steps. Every step except the first (vault name, required) must include a visible "Skip" action. The wizard must be dismissible in its entirety at any point and resumable from a persistent "Finish setup" banner in the Command Center sidebar until all steps reach a done state. The wizard must never block access to the main application.
- **Rationale:** Forced linear tours produce abandonment before first value [2]. The "skippable + resumable" pattern is validated by Linear [6] and Slack [7] as the standard for B2B/B2C tool setup.
- **Spec:**
  - Maximum 5 steps: (1) Name your vault [required], (2) Choose a content source [skip → local vault default], (3) Load a starter preset [skip → blank], (4) Set your role [skip → DM default], (5) Invite players [skip → do later].
  - Wizard is a centered dialog on Desktop (640×auto, max-height 80vh, 24px padding), a bottom sheet on Mobile (full-width, max-height 90dvh), and a centered sheet on Tablet.
  - Progress: step indicator at the top showing N of 5, each step represented by a filled/unfilled dot. No progress percentage text ("2 of 5" label beneath dots for screen readers only via `aria-label`).
  - "Skip" link-button: right-aligned, ≥44px touch target, uses secondary text style from `01-visual-design-system.md`.
  - "Finish setup" Command Center banner: appears immediately below the top bar in the sidebar, shows an inline checklist of remaining steps with check icons for done steps, and a "Dismiss" option once all steps complete.
  - DM-only: the wizard is only rendered when `view.canSetup === true` (per `FirstRun.svelte` PLAT-013). Players see a read-only "Vault setup is performed by the DM" notice with no setup affordances.
- **States:**
  - Default: step N active, previous steps marked done with checkmark icon, future steps dimmed.
  - Skip: step marked "skipped" (dash icon) and wizard advances to next step.
  - Error (e.g., vault name invalid): inline error below the field, primary CTA disabled until resolved, no full-page error state.
  - Dismissed: banner shown in Command Center until all steps are either done or skipped and dismissed by user.
  - Resumed: wizard reopens at the first incomplete step.
- **Platform profiles:**
  - Desktop: centered dialog with keyboard-operable step navigation (Tab to advance, Shift+Tab to back, Enter to confirm, Escape to dismiss).
  - Tablet: centered sheet; same keyboard behavior when hardware keyboard attached; touch targets ≥44×44 CSS px.
  - Mobile: fullscreen bottom sheet; step navigation via primary CTA button (full-width); "Skip" at top-right; swipe-down to dismiss supported but not required as sole method.
- **Input:** pointer, touch, keyboard (Tab/Enter/Escape). No drag operations in wizard.
- **Accessibility:** Dialog role=`dialog` with `aria-modal="true"` and `aria-labelledby` pointing to the step heading. Focus is trapped within the dialog while open. On open, focus moves to the first interactive element in the current step. On close/skip, focus returns to the element that triggered the wizard (or to the Command Center "Finish setup" banner). Step completion announced via `aria-live="polite"`.
- **Acceptance criteria:**
  - Given a fresh vault, when the app first opens, then the first-run wizard appears with step 1 active and steps 2–5 accessible.
  - Given the user clicks "Skip" on any step after step 1, then the wizard advances and the step is marked skipped without blocking further progress.
  - Given the user dismisses the wizard mid-flow, then the Command Center shows the "Finish setup" banner with remaining steps, and the wizard reopens at the first incomplete step when triggered.
  - Given all steps are done or skipped and the user dismisses the banner, then the banner no longer appears.
  - Given a player opens the app, then no setup wizard or affordances are shown; only the read-only notice is rendered.
- **Priority:** Must-have

---

### UX-ONB-002 — First-run step model: vault naming
- **Requirement:** Step 1 of the wizard must collect a vault name (the only required step), validate it inline, and auto-suggest a name based on the operating-system username or "My Campaign." The vault name must be editable later from Settings.
- **Rationale:** The vault name is the user's first "ownership signal" in the product — getting it right matters, but not getting it perfect is fine. Auto-suggestion removes blank-field paralysis [5].
- **Spec:**
  - Label: "Name your vault"
  - Sublabel (≤2 sentences): "Your vault holds everything — notes, maps, characters, and sessions. You can rename it later."
  - Input: single-line text field, max 64 characters, auto-focused on step entry.
  - Auto-suggested placeholder (gray): system username + "'s Campaign" or "My Campaign" if username is unavailable.
  - Validation rules: 1–64 characters, printable Unicode only (no control characters, no path separators `/\:*?"|<>`), validated on blur and before commit.
  - Inline error (below field, ≥4.5:1 contrast, `role="alert"`): "Vault name can't be empty." / "Remove special characters: [listed chars]."
  - Primary CTA: "Create vault" (disabled until valid).
- **States:** Empty (show auto-suggestion as placeholder), editing (live character count at 48+), valid (CTA enabled), error (inline error, CTA disabled).
- **Platform profiles:** Identical across all three profiles; virtual keyboard auto-raised on Mobile.
- **Input:** keyboard (primary), touch (tap to focus, virtual keyboard), pointer (click to focus).
- **Accessibility:** Input has `aria-describedby` pointing to sublabel and (when active) to inline error. Character count is a visually-hidden live region that announces at 48, 56, 62, 64 characters.
- **Acceptance criteria:**
  - Given an empty vault-name field, when the user clicks "Create vault," then an inline error appears and the CTA remains disabled.
  - Given a valid vault name, when the user clicks "Create vault," then the vault is created, the wizard advances to step 2, and the step 1 dot becomes a checkmark.
  - Given special characters in the name, when the user blurs the field, then an inline error lists the offending characters.
- **Priority:** Must-have

---

### UX-ONB-003 — First-run step model: content-source selection
- **Requirement:** Step 2 of the wizard must present three content-source options (Local vault, Obsidian vault sync, Google Docs sync) as selectable cards with a brief description of each. Selecting a source must show the appropriate connection affordance inline (no full-page redirect). The step is skippable; skipping defaults to Local vault. Sources can be added or changed later from Settings.
- **Rationale:** Offering choices as visual cards with descriptions outperforms dropdowns for first-time selection of unfamiliar options (recognition over recall) [1]. Inline connection prevents users losing wizard context.
- **Spec:**
  - Heading: "Where does your content live?"
  - Three option cards, arranged in a single column (Mobile) or 3-up row (Desktop/Tablet landscape):
    - **Local vault** — icon: folder. Title: "Local files." Body: "Markdown files on this device. Works offline, no accounts needed." Badge: "Default"
    - **Obsidian** — icon: Obsidian diamond (SVG). Title: "Obsidian vault." Body: "Connect your existing Obsidian vault. Reads and writes Obsidian-compatible markdown."
    - **Google Docs** — icon: Google Docs logo. Title: "Google Docs." Body: "Pull campaign notes from Drive. Bi-directional sync."
  - Each card: 16px padding, 8px radius, 1px border using `--color-border` token, checkmark icon on selection, min touch target 44px height.
  - On card selection, the card expands in-place to show the connection form: Local = directory picker button; Obsidian = directory picker button; Google Docs = "Connect Google account" OAuth button → spinner → success state with connected account name.
  - Connection error: shown inline in expanded card (not modal). Retry button. Skip-source link.
  - "Skip" action below cards advances to step 3 with Local vault as default.
- **States:** Unselected (three cards at rest), selected (one card expanded with connection form), connecting (spinner in expanded card), connected (success state with disconnect option), error (inline error in expanded card), skipped (Local vault silently defaulted).
- **Platform profiles:**
  - Desktop/Tablet landscape: 3-column card row, expansion pushes cards below.
  - Tablet portrait/Mobile: single-column stack, expansion in-place below selected card.
- **Input:** pointer (click card, click buttons), touch (tap), keyboard (Tab to card, Space/Enter to select, Tab to connection form elements).
- **Accessibility:** Cards are `role="radio"` within a `role="radiogroup"` labeled "Content source." Expanded connection form receives focus on expansion. Connection status announced via `aria-live="polite"`.
- **Acceptance criteria:**
  - Given step 2 is shown, when the user clicks "Local files," then only the Local card expands; the other two cards remain collapsed.
  - Given Obsidian selected and a directory chosen, when the directory picker confirms, then the card shows a success state and the "Next" CTA becomes enabled.
  - Given Google Docs selected and OAuth fails, when the error is returned, then an inline retry appears within the card without closing the wizard.
  - Given "Skip" is clicked, when step 3 appears, then Local vault is configured as the default source with no user action required.
- **Priority:** Must-have

---

### UX-ONB-004 — First-run step model: starter preset
- **Requirement:** Step 3 of the wizard must offer a set of named starter presets (e.g., "Blank," "Solo DM," "Party of 4," "One-Shot") that pre-configure the Command Center layout, create a starter scene, and optionally populate sample content (a sample note, a placeholder map). The step is skippable (defaults to "Blank"). Selected preset is applied at step completion; presets are not locked — the DM can modify or replace layouts at any time.
- **Rationale:** Removing blank-canvas paralysis via starter content is the single most-cited onboarding improvement in complex spatial tools (Figma, Miro, Notion) [9][5]. A preset that matches the user's real use case provides an orientation context for subsequent coach marks.
- **Spec:**
  - Heading: "Pick a starting setup."
  - Sublabel: "We'll configure your workspace. You can change everything later."
  - Preset cards (2-up on Desktop, 1-up on Mobile, scroll horizontally on Tablet):
    - **Blank** — no pre-populated widgets. CTA text: "Start fresh."
    - **Solo DM** — Command Center with: note widget (campaign overview placeholder), dice roller widget, timer widget.
    - **Party of 4** — Command Center with: initiative tracker, 4 player-view slots, note widget, map placeholder widget.
    - **One-Shot** — Command Center with: timer widget, dice roller, note widget pre-filled with a one-shot scenario template.
  - Each card shows: title, 2-sentence description, a miniature thumbnail wireframe of the resulting layout (SVG illustration, not a live render), and a "Preview" link that opens a lightbox (Desktop) or modal sheet (Mobile) showing a larger thumbnail.
  - "Blank" is pre-selected by default.
  - "Skip" and "Blank" yield identical results (empty Command Center).
- **States:** default (Blank pre-selected), selected (one card highlighted, others dimmed), preview-open (lightbox/sheet showing larger thumbnail, closable by Escape or overlay click).
- **Platform profiles:**
  - Desktop: 2-column grid of preset cards; lightbox preview in overlay.
  - Tablet: 2-column grid, smaller cards; preview in bottom sheet.
  - Mobile: full-width single-column stack; preview opens as fullscreen overlay.
- **Input:** pointer/touch (click/tap card), keyboard (Tab, Space/Enter to select, Enter on "Preview" to open, Escape to close preview).
- **Accessibility:** Cards are `role="radio"` in a `role="radiogroup"`. Preview lightbox is `role="dialog"` with trapped focus. Thumbnail SVGs have descriptive `alt` text naming the layout.
- **Acceptance criteria:**
  - Given step 3 is shown, when the user selects "Party of 4" and completes the wizard, then the Command Center opens with an initiative tracker, 4 player-view slots, a note widget, and a map placeholder widget.
  - Given "Skip" is clicked on step 3, when the Command Center opens, then it shows the "Blank" layout (no pre-populated widgets).
  - Given "Preview" is clicked on a preset card, when the preview opens, then Escape closes it and focus returns to the card.
- **Priority:** Should-have

---

### UX-ONB-005 — First-run step model: role declaration
- **Requirement:** Step 4 of the wizard must ask the user to declare their primary role (Dungeon Master or Player) with a brief description of what each role can do. The declared role pre-configures the navigation sections visible on first launch. The step is skippable (defaults to DM). Role can be changed later from Settings.
- **Rationale:** The navigation experience is materially different for DM and Player. Declaring role before first launch prevents a Player from facing the DM setup maze, and vice versa [1]. The wizard is the least disruptive place to collect this signal.
- **Spec:**
  - Heading: "What's your role?"
  - Two option cards (side-by-side on Desktop/Tablet, stacked on Mobile):
    - **Dungeon Master** — description: "You build the world, run the session, and control what players see." Badge: "Default."
    - **Player** — description: "You play a character in a DM-run session. Join via an invite link."
  - Note below cards (≤2 sentences): "Players typically join via an invite link from their DM. You can change your role in Settings."
  - "Skip" defaults to DM.
- **States:** default (DM pre-selected), selected (card highlighted).
- **Platform profiles:** identical behavior; card stacking adapts as described.
- **Input:** pointer/touch, keyboard.
- **Accessibility:** Cards are `role="radio"` in a `role="radiogroup"`. Selection is announced.
- **Acceptance criteria:**
  - Given the user selects "Player" and completes the wizard, when the app opens, then DM-only navigation sections are absent.
  - Given "Skip" is clicked, when the wizard completes, then the DM role is applied.
- **Priority:** Should-have

---

### UX-ONB-006 — First-run step model: invite players
- **Requirement:** Step 5 of the wizard must allow the DM to generate a session invite link or input player email addresses for an initial invitation. The step is skippable (recommended for first-time DMs). All invitations are also available from the Session surface at any time.
- **Rationale:** Inviting players is a deferred value moment — DMs typically want to configure their vault before inviting — so it belongs last and must be trivially skippable [6]. Offering it here reduces the number of DMs who forget before starting their first session.
- **Spec:**
  - Heading: "Invite your players." Sublabel: "You can do this anytime from the Session surface."
  - Two sub-options as tabs: "Copy invite link" (generates a one-click link) and "Email players" (multi-value email input).
  - Copy invite link: shows generated URL in a read-only field with a "Copy" icon button. "Link copied!" toast on click.
  - Email input: multi-value chip input, comma/enter-delimited. "Send invites" secondary button. Validation: basic email format.
  - "Skip" is positioned prominently.
- **States:** default (Copy link tab active), link copied (toast), email entered (chips shown), sending (spinner), sent (success confirmation per address), error (inline per-address error).
- **Platform profiles:** identical; email input becomes full-width on Mobile.
- **Input:** pointer/touch, keyboard.
- **Accessibility:** Invite link field is `role="textbox"` `readonly`. Copy button has `aria-label="Copy invite link"`. Toast announced via `aria-live="assertive"`.
- **Acceptance criteria:**
  - Given step 5 is shown and the user clicks "Copy," then the URL is in the clipboard and the "Link copied!" toast appears.
  - Given "Skip" is clicked, when the Command Center opens, then no invitations have been sent.
- **Priority:** Could-have

---

### UX-ONB-007 — DM first-value event definition and shortest path
- **Requirement:** The system must define the DM "first-value event" as: the first time the DM has a functioning Command Center with at least one widget on screen. The shortest path to this event must be achievable in ≤5 minutes from vault creation, measured from completing step 1 of the wizard to seeing the Command Center with a widget.
- **Rationale:** Time-to-first-value (TTFV) is the single most predictive onboarding metric for complex SaaS tools [2][5]. TTFV > 5 minutes correlates with sharply elevated churn in tools with a genuine learning curve.
- **Spec:**
  - Shortest path (timed against): Complete step 1 (vault name, 30 s) → skip steps 2–4 → skip step 5 → Command Center opens with "Blank" layout → coach mark on "Add widget" affordance appears → user clicks affordance → one widget placed. Total: ≤5 minutes at a comfortable pace.
  - The demo content from any non-Blank preset counts as "widget on screen" immediately — the DM need not place widgets manually to reach the event.
  - The "first-value event" is logged as a product analytics event (`onb:dm_first_value`) to enable measurement.
- **States:** Not applicable (this requirement defines a path, not a component state).
- **Platform profiles:** Path is identical across profiles; timings account for touch input overhead on Mobile.
- **Input:** all input modes.
- **Accessibility:** not applicable to the path definition itself; accessibility of each step is specified per step.
- **Acceptance criteria:**
  - Given a fresh vault with "Blank" preset, when a user follows the shortest path (skip all non-required steps), then the Command Center with at least one widget is visible in ≤5 minutes.
  - Given any non-Blank preset is selected, when the wizard completes, then the Command Center shows at least one widget without additional user action.
  - Given the first-value event occurs, when analytics are enabled, then the `onb:dm_first_value` event is emitted with vault ID and elapsed seconds.
- **Priority:** Must-have

---

### UX-ONB-008 — Player join / invite onboarding
- **Requirement:** A Player who receives an invite link must be able to go from clicking the link to seeing their character on their assigned canvas in ≤90 seconds, via a dedicated slim flow that bypasses all DM setup steps.
- **Rationale:** The player join experience has a fundamentally different starting context: the player has zero familiarity with DND Tools and zero desire to set up a vault. The flow must be radically minimal [15][8]. A 90-second TTFV is achievable and necessary; flows longer than 3 minutes see significant abandonment.
- **Spec:**
  - Invite link format: `https://app.dndtools.io/join/<session-token>` (or localhost equivalent for development).
  - Flow steps:
    ```
    [Click invite link]
         |
    [Authenticate screen]  ← "Sign in" or "Create account" (name + email + password, 3 fields max)
         |
    [Joining "<Session Name>" ...]  ← determinate progress (spinner + status label)
         |
    [Player canvas]  ← character sheet widget visible; session active
    ```
  - Authentication: if already signed in (stored session), skip to "Joining…" directly.
  - "Create account" form: Display name (required), email (required), password (required, min 8 chars). No email verification gate before session join — verification email sent in background.
  - "Joining…" screen: DND Tools wordmark, session name, progress indicator. Duration ≤5 s for a healthy connection.
  - On join: player's canvas opens at the scene assigned to them by the DM (or a "Waiting for DM to assign your scene" state if no scene assigned).
  - No welcome wizard, no feature-tier selector, no vault naming — all deferred.
  - First coach mark on the player canvas (§UX-ONB-013) fires once, after the canvas renders.
- **States:** unauthenticated (auth screen), signing in (spinner), joining (progress), joined (canvas), waiting for scene (empty state with "Your DM hasn't assigned your scene yet — hang tight."), error (connection failure with retry).
- **Platform profiles:**
  - Desktop: centered dialog (480px wide) for auth; full-screen canvas on join.
  - Tablet: centered sheet for auth.
  - Mobile: fullscreen bottom sheet for auth; full-screen canvas on join; every target ≥44×44 CSS px.
- **Input:** keyboard (primary for auth form), touch, pointer.
- **Accessibility:** Auth form uses standard `type="email"`, `type="password"` with `autocomplete` attributes. Progress indicator has `role="status"` and live text label. Canvas landmarks announced on load.
- **Acceptance criteria:**
  - Given a player with an existing account clicks an invite link, when they are already signed in, then they are taken directly to the joining screen without seeing any auth form.
  - Given a new player clicks an invite link, when they complete the 3-field create-account form, then they reach the player canvas within 90 seconds of clicking the link (excluding intentional reading time).
  - Given no scene is assigned by the DM, when the player joins, then the "Waiting for DM" empty state is shown without error.
  - Given the player canvas loads, when it first renders, then the first player canvas coach mark fires once.
- **Priority:** Must-have

---

### UX-ONB-009 — Empty state anatomy (canonical)
- **Requirement:** Every major surface in DND Tools must implement a first-use empty state that follows a canonical three-part anatomy: (1) illustration, (2) headline + body, (3) primary CTA (and optional secondary CTA). Empty states must be meaningful — they must name the surface, explain what the surface is for in one sentence, and give the user exactly one clear next action.
- **Rationale:** Empty states are the primary teaching surface for new users encountering a surface for the first time [1]. Blank or generic empty states ("No items") are among the most cited first-run failures in usability research [1][3].
- **Spec — canonical anatomy:**
  ```
  ┌─────────────────────────────────────────────┐
  │                                             │
  │            [Illustration / Icon]            │
  │              (120×120 CSS px)               │
  │                                             │
  │          Headline (≤5 words, bold)          │
  │     Body copy (≤2 sentences, muted)         │
  │                                             │
  │         [Primary CTA button]                │
  │     [Secondary CTA, link style] (opt.)      │
  │                                             │
  └─────────────────────────────────────────────┘
  ```
  - Illustration: 120×120 CSS px SVG, genre-appropriate (not generic clip art), passes WCAG contrast on both light and dark themes, has descriptive `alt` text.
  - Headline: ≤5 words, sentence case, `--font-weight-semibold`, uses `--text-lg` token.
  - Body: ≤2 sentences, `--text-sm`, `--color-text-muted` token.
  - Primary CTA: standard primary button from `01-visual-design-system.md`, ≥44×44 CSS px touch target.
  - Secondary CTA (optional): link-style button, used only for "Load demo content" or "Learn more" — never for another create action.
  - Empty state is vertically and horizontally centered in the available surface area (flexbox center).
  - On Mobile, the entire anatomy stacks to single-column, max-width 320 CSS px.
- **States:** first-use (user never added content), cleared (user deleted all content — same anatomy but body acknowledges the cleared state), demo-offered (secondary CTA for demo content, shown only on first-use state, removed once user has created real content).
- **Platform profiles:**
  - Desktop/Tablet: centered in the available pane, full anatomy.
  - Mobile: full-width, single-column, CTA is full-width button.
- **Input:** primary CTA is pointer/touch/keyboard (Enter when focused).
- **Accessibility:** Illustration is `<img>` with descriptive `alt`. CTA has an accessible name that combines action + surface (e.g., "Create your first map"). Empty state container has `role="status"` if it will update dynamically when content is added.
- **Acceptance criteria:**
  - Given a surface has zero content, when a user navigates to that surface, then the three-part empty-state anatomy is shown.
  - Given the empty state primary CTA is activated, when the action completes, then the empty state is replaced by real content.
  - Given demo content exists and has been loaded, when the user navigates to the surface, then the secondary "Load demo content" CTA is no longer shown.
- **Priority:** Must-have

---

### UX-ONB-010 — Command Center empty state
- **Requirement:** The Command Center empty state (no widgets placed, shown to a DM on first open of a "Blank" preset) must follow the canonical anatomy (UX-ONB-009) and guide the DM to place their first widget.
- **Rationale:** Command Center is the DM's operational home. A blank canvas with no guidance on first open is a significant learnability failure [9].
- **Spec:**
  - Illustration: SVG of a DM's command console with two or three labeled placeholder regions.
  - Headline: "Your command center"
  - Body: "Add widgets to build your session workspace. Start with an initiative tracker, a map, or a note."
  - Primary CTA: "Add your first widget" → opens the widget library drawer (as specified in `05-command-center.md`).
  - Secondary CTA: "Load a starter preset" → opens a preset picker modal (same presets as UX-ONB-004, applied post-creation).
  - A coach mark (UX-ONB-013) simultaneously highlights the "+" add-widget affordance in the top bar.
  - Cross-reference: `05-command-center.md` owns the widget library drawer mechanics; this document owns the empty state.
- **States:** empty (no widgets), demo-offered (secondary CTA visible), post-first-widget (empty state disappears, replaced by canvas).
- **Platform profiles:** Desktop/Tablet: centered in the canvas area. Mobile: centered in the slim Command Center view.
- **Acceptance criteria:**
  - Given "Blank" preset selected, when Command Center first renders, then the empty-state anatomy is shown in the canvas area.
  - Given "Add your first widget" is activated, when the widget library opens, then the empty state recedes but remains visible in the background canvas.
  - Given one widget is placed, when the widget placement confirms, then the empty state is permanently replaced by the canvas content.
- **Priority:** Must-have

---

### UX-ONB-011 — Canvas/Scene empty state
- **Requirement:** A newly created Canvas/Scene with no widgets must show the canonical empty state (UX-ONB-009) guiding the user to place the first widget.
- **Rationale:** Individual scenes (not the Command Center) are the user's working canvases. A blank infinite canvas with no orientation cues is disorienting [9].
- **Spec:**
  - Illustration: SVG of a minimal canvas grid with a single placeholder widget outline.
  - Headline: "An empty scene"
  - Body: "Add widgets — maps, notes, characters, or dice — to build your workspace."
  - Primary CTA: "Add a widget" → opens the widget insert menu (palette or command palette shortcut `Mod+K → "Add widget"`).
  - Secondary CTA: "Load demo scene" → loads a demo scene with a sample note, a map placeholder, and a dice roller widget.
  - Cross-reference: `04-canvas-scene-widgets.md` owns canvas pan/zoom/widget mechanics.
- **Acceptance criteria:**
  - Given a new scene is created, when it first renders, then the empty-state anatomy is shown centered on the canvas.
  - Given "Load demo scene" is activated, then a demo scene with three sample widgets loads and the empty state is replaced.
- **Priority:** Should-have

---

### UX-ONB-012 — Maps, Characters, Knowledge, Graph, Sessions empty states
- **Requirement:** Each of the following surfaces must implement a canonical empty state (UX-ONB-009) with surface-specific copy and a meaningful primary CTA.

| Surface | Illustration subject | Headline | Body (≤2 sentences) | Primary CTA | Secondary CTA |
|---|---|---|---|---|---|
| **Maps** | Stylized blank parchment with a compass rose | "No maps yet" | "Create your first map — draw it, import an image, or generate it procedurally." | "Create a map" | "Load a demo map" |
| **Characters** | Silhouette of a character holding a staff | "No characters yet" | "Add your party members and NPCs. Characters link to your maps, sessions, and notes." | "Add a character" | "Load a demo character" |
| **Knowledge** (Notes) | Open book with a quill | "Your vault is empty" | "Create your first note to start building your campaign knowledge base." | "Create a note" | "Load demo notes" |
| **Graph** | Node-and-edge network diagram, sparse | "Nothing to explore yet" | "Create some notes, characters, or maps — the graph builds from your content." | "Open Knowledge" | — |
| **Sessions** | Dice and a lit candle | "No sessions yet" | "Start a session to bring your players to the table." | "Start a session" | — |

- **Rationale:** Surface-specific copy and illustrations communicate the surface's purpose immediately. Generic "No items" copy communicates nothing [1][16].
- **Spec:** Copy and CTA actions as in the table above. All illustrations: 120×120 CSS px SVG, genre-appropriate. All follow UX-ONB-009 anatomy. Graph and Sessions surfaces do not offer demo content (their value is emergent from other content).
- **Cross-references:** `06-maps.md` owns map creation flow (the CTA triggers it). `07-characters.md` owns character creation flow. Knowledge and Graph surfaces own their own creation flows. `08-sessions-live-play.md` owns session start flow.
- **Platform profiles:** All follow UX-ONB-009 platform behavior.
- **Acceptance criteria:**
  - Given any listed surface has zero content, when a user navigates to it, then the surface-specific empty-state anatomy is shown.
  - Given "Create a map" is activated from the Maps empty state, when the map creation flow opens, then the Maps empty state recedes but remains in the background.
  - Given the Graph surface is empty, when no "demo content" secondary CTA is present, then a user can reach Knowledge via the primary CTA without leaving the surface.
- **Priority:** Must-have (canonical anatomy); Should-have (surface-specific copy and illustrations individually)

---

### UX-ONB-013 — Contextual coach marks: trigger rules and anatomy
- **Requirement:** Coach marks must be triggered by first-reach of a surface or by a detectable user failure (e.g., attempted an operation that is not yet available). They must never be triggered by time, login count, or session count alone. No more than two coach marks may fire in a single user session across all surfaces. Each coach mark is individually dismissible. "Seen" state persists across sessions. Coach marks must not block interaction.
- **Rationale:** First-reach triggering produces 2.4× higher read-and-act rates vs. session-start triggering [3]. Exceeding three coach marks per session causes users to begin auto-dismissing [3]. Apple HIG requires coach marks to be immediately dismissible without blocking the underlying interface [4].
- **Spec — coach mark anatomy:**
  ```
  ┌──────────────────────────────┐
  │  [Arrow pointing to target]  │
  │  [Title, ≤6 words, semibold] │
  │  [Body, ≤2 sentences]        │
  │              [Dismiss ×]     │
  └──────────────────────────────┘
  ```
  - Positioning: 8px offset from the target element, placed to avoid obscuring the target. Arrow (12px) points at the target element center.
  - Max width: 280 CSS px. Padding: 12px.
  - Background: `--color-surface-overlay` token. Border: 1px `--color-border`. Box shadow: `--elevation-2`.
  - Dismiss "×": 32×32 CSS px icon button, top-right of the mark, `aria-label="Dismiss tip"`.
  - The mark is non-modal: the underlying UI is fully interactive while the mark is visible.
  - Z-index: above all surface content, below modal dialogs (uses `--z-coach-mark` from `01-visual-design-system.md`).
  - Animation: fade-in 150 ms ease-out. `prefers-reduced-motion`: no animation, instant appear.
  - Dismiss animation: fade-out 100 ms ease-in. `prefers-reduced-motion`: instant disappear.
- **Trigger registry (required, not exhaustive):**

  | Trigger event | Surface | Mark title | Mark body |
  |---|---|---|---|
  | First open of Command Center (no widgets) | Command Center | "Add your first widget" | "Tap + to open the widget library and add initiative tracker, maps, or dice." |
  | First open of Canvas editor | Canvas | "Pan and zoom freely" | "Scroll to zoom, drag the background to pan. Press ? for all shortcuts." |
  | First open of Maps surface | Maps | "Create or import a map" | "Draw your own, import an image, or generate one procedurally." |
  | First open of Characters surface | Characters | "Add your party" | "Create characters here and link them to sessions and maps." |
  | First player canvas load (player) | Player canvas | "This is your canvas" | "Your DM controls what you see here. Your character sheet is pinned at the bottom." |
  | First failed command-palette search | Command palette | "Try a shorter query" | "The command palette finds actions, notes, maps, and characters. Start with a single word." |

- **Frequency cap enforcement:** A per-session counter increments each time a coach mark fires. When the counter reaches 2, no further coach marks fire for the rest of the session. Counter resets on each new session (app open). "Seen" state is stored per mark ID in user preferences; seen marks never fire again regardless of session counter.
- **States:** visible (default shown), dismissed (× clicked → fade out → removed from DOM), seen (persisted, will not fire again).
- **Platform profiles:**
  - Desktop: coach marks positioned as described, keyboard-dismissible via Escape (dismisses the topmost visible mark only).
  - Tablet/Mobile: coach marks position above or below the target (never left/right to avoid edge clipping). Arrow direction inverts accordingly.
- **Input:** dismiss via pointer click on ×, touch tap on ×, Escape key (Desktop).
- **Accessibility:** Coach mark has `role="status"` and `aria-live="polite"` so screen readers announce it on appearance. Dismiss button is keyboard-focusable and has `aria-label="Dismiss tip: [title]"`. Focus is NOT moved to the coach mark on appearance (non-modal; does not disrupt flow).
- **Acceptance criteria:**
  - Given a user first opens the Command Center, when no prior seen-state exists, then exactly one coach mark fires pointing to the add-widget affordance.
  - Given the user dismisses a coach mark, when the session ends and a new session starts, then the dismissed mark does not fire again.
  - Given two coach marks have already fired in the current session, when a third trigger event occurs, then no coach mark appears.
  - Given a coach mark is visible, when the user interacts with the surface behind it, then the interaction is not blocked.
  - Given `prefers-reduced-motion` is active, when a coach mark appears or dismisses, then no animation occurs.
- **Priority:** Must-have

---

### UX-ONB-014 — Persistent "?" help entry
- **Requirement:** Every surface must include a consistently placed "?" icon button that opens the contextual help panel. On Desktop, the "?" key (not Shift+/) must open the keyboard shortcut cheat sheet when focus is not in a text input. The "?" button must be visible on all surfaces and platform profiles without requiring scroll.
- **Rationale:** A persistent, predictable help entry is required for learnability of complex tools. Hiding help in a menu structure increases time-to-help and frustration [3]. The "?" button's consistent placement reduces the cognitive load of finding help [12].
- **Spec:**
  - **Desktop/Tablet:** "?" button positioned in the top bar, right side, next to user avatar / settings. Size: 32×32 CSS px icon button, `aria-label="Help"`. Icon: "?" glyph.
  - **Mobile:** "?" button in the bottom bar (tab bar), rightmost position, 44×44 CSS px. Replaces no other tab — it is an additional entry (Settings tab may merge with it via a "More" drawer if tab count exceeds 5).
  - "?" key behavior (Desktop): when focus is not in a `<input>`, `<textarea>`, or `contenteditable`, pressing "?" opens the keyboard cheat sheet (UX-ONB-015). This does not conflict with the contextual help panel (two different affordances).
  - The "?" button always opens the **contextual help panel** (UX-ONB-016), not the cheat sheet. The distinction is: "?" button = help center; "?" key = shortcut cheat sheet.
- **States:** default (button visible), hover (tooltip: "Help (? for shortcuts)"), active (panel open, button indicated as active).
- **Platform profiles:**
  - Desktop: top bar right, plus "?" key shortcut.
  - Tablet: top bar right (no "?" key shortcut, but hardware keyboard supported).
  - Mobile: bottom bar rightmost.
- **Input:** pointer click / touch tap on button; "?" key (Desktop keyboard, only when not in text input).
- **Accessibility:** Button has `aria-label="Help"`. When the panel opens, focus moves to the panel heading. When closed, focus returns to the "?" button.
- **Acceptance criteria:**
  - Given any surface, when the user activates the "?" button, then the contextual help panel opens.
  - Given Desktop focus is not in a text input, when the user presses "?", then the keyboard cheat sheet opens.
  - Given Desktop focus is in a text input, when the user presses "?", then no cheat sheet opens (the character is typed).
  - Given Mobile profile, when the bottom bar is rendered, then the "?" button is present and meets ≥44×44 CSS px touch target.
- **Priority:** Must-have

---

### UX-ONB-015 — Keyboard shortcut cheat sheet
- **Requirement:** Pressing "?" (Desktop) or selecting "Keyboard shortcuts" from the help panel must open a scrollable, searchable modal overlay listing all keyboard shortcuts organized by surface and category. The cheat sheet is stateless (always reflects current shortcuts) and dismissible by Escape or a second "?" press.
- **Rationale:** Gmail pioneered and Linear validated the "?" cheat sheet as the canonical shortcut-discovery pattern for power tools [12][13]. DND Tools' shortcut density makes this essential.
- **Spec:**
  - Layout: Modal overlay (not a full page), 720×560 CSS px on Desktop (scrollable if content exceeds), full-screen bottom sheet on Mobile.
  - Header: "Keyboard shortcuts" heading + `<input type="search">` with placeholder "Search shortcuts…" auto-focused on open.
  - Body: collapsible section groups (default expanded), each group headed by a surface name:
    - Global
    - Canvas / Scene
    - Command palette
    - Maps
    - Characters
    - Session / Combat
  - Each shortcut row: `[Key combination] ................. [Action description]`; keys rendered as `<kbd>` elements styled with `--color-surface-subtle` background, 1px border, 4px radius.
  - Search: filters shortcut rows live (case-insensitive substring match on action description and key combination). Empty search state: "No shortcuts match "[query]"."
  - Keyboard navigation within cheat sheet: Tab through search and sections; arrow keys through rows; Escape to close.
  - Close: Escape, second "?" press, or × button in the header.
  - "Recently used" section: the 5 most recently invoked shortcuts, shown above the category list.
- **States:** default (all groups shown, "Recently used" shown if history exists), searching (filtered list), empty-search (no results copy), open (focused on search input).
- **Platform profiles:**
  - Desktop: 720×560 CSS px dialog.
  - Tablet: 90vw × 80vh dialog.
  - Mobile: fullscreen bottom sheet, scrollable, search at top (sticky).
- **Input:** keyboard ("?" to open, Escape to close, search box, arrow keys), pointer/touch (scroll, close button, click to focus search).
- **Accessibility:** Modal has `role="dialog"`, `aria-modal="true"`, `aria-label="Keyboard shortcuts"`. Focus trapped. On open, focus moves to search input. On close, focus returns to the triggering element. `<kbd>` elements are `aria-label`-ed with the key name for screen readers.
- **Acceptance criteria:**
  - Given Desktop focus is not in a text input, when "?" is pressed, then the cheat sheet opens with the search input focused.
  - Given the cheat sheet is open, when the user types "initiative," then only shortcut rows with "initiative" in the description are shown.
  - Given the cheat sheet is open, when Escape is pressed, then the cheat sheet closes and focus returns to the element that had focus before it opened.
  - Given the cheat sheet is open, when "?" is pressed again, then the cheat sheet closes.
- **Priority:** Must-have

---

### UX-ONB-016 — Contextual help panel and help center
- **Requirement:** The contextual help panel (opened by the "?" button) must show: (a) a surface-specific help overview for the current surface, (b) links to 3–5 relevant help articles, (c) a link to "Browse all help articles," (d) a "What's New" / changelog entry, and (e) a "Keyboard shortcuts" link that opens the cheat sheet (UX-ONB-015). The panel must be a non-modal side panel on Desktop and a bottom sheet on Mobile.
- **Rationale:** Contextual help that scopes to the current surface reduces search friction and increases the likelihood of users finding relevant help [2][3]. Surfacing the changelog in the help panel, rather than as an interruptive modal on login, respects user attention while keeping them informed (Linear's pattern) [6].
- **Spec:**
  - Desktop: right-side drawer, 320px wide, slides in from the right (150 ms ease-out). Does not overlay the main content; the main content area shrinks.
  - Mobile: bottom sheet (60dvh max), overlay over main content.
  - Tablet: same as Desktop on landscape; same as Mobile on portrait.
  - Sections in order:
    1. Heading: current surface name (e.g., "Command Center help").
    2. Contextual overview: 2–3 sentences describing the surface. Unique per surface, authored and stored in a help content registry.
    3. "Quick tips" list: 3–5 bullet points with icons. Surface-specific.
    4. "Related articles" links (3–5), each opening in a new tab (external help center).
    5. Divider.
    6. "What's New" section: shows the latest 3 changelog entries (title + 1-line summary). Link to full changelog.
    7. "Keyboard shortcuts →" link-button (opens UX-ONB-015).
  - "What's New" badge: the "?" button shows a badge (1px red dot, `--color-accent-danger`) when a changelog entry is new (not yet viewed). Badge clears when the help panel is opened.
- **States:** closed (default), open (drawer/sheet visible), badge (new changelog entry unseen).
- **Platform profiles:** as described above.
- **Input:** pointer/touch, keyboard (Tab through links, Escape to close drawer/sheet).
- **Accessibility:** Drawer has `role="complementary"` `aria-label="Help"`. Sheet has `role="dialog"` `aria-modal="true"` `aria-label="Help"`. Focus moves to first element on open. Escape closes. Badge has `aria-label="New release notes"` visually hidden text.
- **Acceptance criteria:**
  - Given the "?" button is activated on the Command Center, when the help panel opens, then the heading reads "Command Center help" and the quick tips are Command Center–specific.
  - Given a new changelog entry exists (not yet viewed), when the "?" button is rendered, then the red badge dot is visible.
  - Given the help panel is opened, when the changelog badge is present, then it is cleared.
  - Given the help panel is open on Mobile, when the user swipes down on the sheet handle, then the sheet dismisses.
- **Priority:** Should-have

---

### UX-ONB-017 — Progressive onboarding for complex surfaces (Canvas, Maps, Characters)
- **Requirement:** Canvas, Maps, and Characters must deliver additional onboarding content progressively, gated on behavioral milestones rather than time. Each surface defines a three-tier progression: Tier 1 (first reach), Tier 2 (first meaningful action), Tier 3 (power-user capability). Tier 2 and Tier 3 content appears only after the preceding tier's milestone is met.
- **Rationale:** Premature exposure to advanced features before the user has context for them reduces adoption and increases overwhelm [10][11]. Behavioral gating ensures the user has established enough context to benefit from the advanced tip.
- **Spec — progression tiers:**

  **Canvas:**
  - Tier 1 (milestone: first canvas open): coach mark on pan/zoom, empty-state CTA to add first widget.
  - Tier 2 (milestone: first widget placed): coach mark on widget resize handles and the context menu ("right-click a widget for more options").
  - Tier 3 (milestone: 5+ widgets placed): coach mark on multi-select (Shift+click) and the widget group affordance. Help panel quick-tip updated to include "Link widgets to entities" article.

  **Maps:**
  - Tier 1 (milestone: first map surface open): empty state with "Create a map" CTA, coach mark on layer panel affordance.
  - Tier 2 (milestone: first map created): coach mark on "Add a layer" and "Fog of war" controls.
  - Tier 3 (milestone: first map embedded in a canvas): coach mark on "Push map to players" affordance and the DM-only annotation layer.

  **Characters:**
  - Tier 1 (milestone: first character surface open): empty state with "Add a character" CTA.
  - Tier 2 (milestone: first character created): coach mark on the "Embed as widget" affordance and the "Link to session" control.
  - Tier 3 (milestone: character linked to session): coach mark on HP tracker widget binding and the capability-set grant panel.

- **Implementation note:** Milestone state is stored in user preferences (not vault state) so it persists across vaults and sessions.
- **Platform profiles:** All tiers deliver the same content; coach marks re-anchor to the appropriate target element in the Tablet/Mobile layout.
- **Acceptance criteria:**
  - Given Tier 1 canvas milestone met but Tier 2 not yet met, when the user opens the canvas editor, then only Tier 1 coach marks are eligible to fire (subject to the session frequency cap in UX-ONB-013).
  - Given the "first widget placed" milestone is met, when the user next opens the canvas editor in a new session, then the Tier 2 coach mark for widget resize is eligible to fire.
  - Given Tier 3 content is eligible, when it fires, then the help panel quick-tips for that surface are updated to reflect power-user articles.
- **Priority:** Should-have

---

### UX-ONB-018 — Feature-tier control (progressive disclosure of capability sets)
- **Requirement:** The application must expose a Feature Tier control (as per `FirstRun.svelte` PLAT-013) that allows the DM to reveal or hide advanced capability sets progressively. Three tiers must be defined: Starter, Standard, and Advanced. The active tier determines which widgets, controls, and menu items are shown in the Command Center and widget library. The tier control must be accessible from Onboarding, Settings, and the command palette.
- **Rationale:** Hiding advanced features until users are ready reduces overwhelm in complex tools [10]. The existing `FirstRun.svelte` implementation confirms this is an architectural decision, not a deferred wish. The UX requirement is to make the tier control discoverable, clearly labeled, and reversible.
- **Spec:**
  - Tier definitions:
    - **Starter** — shows: Note widget, Dice roller, basic initiative tracker, session join/start. Hides: map layer controls, custom widget authoring, capability-set grants, MCP tools, audio routing.
    - **Standard** (default) — shows all Starter features + map layers, basic character sheet widget, combat tracker, handout push.
    - **Advanced** — shows all Standard features + capability-set grants, MCP tool configuration, audio routing, custom widget authoring, graph visualization.
  - Tier control UI: a segmented control (3 options) or radio group labeled "Feature tier" in Settings → Onboarding and in the first-run wizard (step 3 area if applicable). In the Command Center, a secondary location in the "Help & tips" details block (mirrors `FirstRun.svelte` implementation).
  - The capability description below the tier control lists the features visible at the selected tier (matches `view.visibleFeatures` from the existing component).
  - Changing tier is instantaneous (optimistic) with no confirmation (reversible).
- **States:** Starter (default for new DMs), Standard (default for returning DMs), Advanced.
- **Platform profiles:** identical across all profiles; control becomes a full-width select on Mobile.
- **Input:** pointer/touch (segmented control), keyboard (arrow keys within radio group).
- **Accessibility:** Radio group labeled "Feature tier." Each option has the tier name as its accessible name. Selection announced via `aria-live`.
- **Acceptance criteria:**
  - Given the tier is set to "Starter," when the widget library is opened, then map layer controls, capability-set grants, and MCP tools are absent.
  - Given the tier is changed to "Advanced," when the widget library is opened, then all features are present.
  - Given the feature tier control is in Settings, when the DM accesses it, then the current tier is pre-selected and changing it takes immediate effect.
- **Priority:** Should-have

---

### UX-ONB-019 — Demo / sample content offer
- **Requirement:** At each major surface empty state (Command Center, Canvas, Maps, Characters, Knowledge), a "Load demo content" secondary CTA must be available on the first-use empty state. Activating it must load a pre-authored sample appropriate to the surface. Demo content must be clearly labeled as demo content and must be removable in bulk via a "Remove all demo content" action in Settings.
- **Rationale:** Sample content accelerates first value by providing orientation context and removes blank-canvas paralysis [9][5][8]. Labeling it as demo content prevents confusion with real campaign content.
- **Spec:**
  - Demo content per surface:
    - **Command Center**: loads the "Solo DM" preset (note widget, dice roller, timer).
    - **Canvas**: creates one demo scene named "Demo Scene" with three widgets (note, map placeholder, dice roller).
    - **Maps**: creates one demo map named "Village of Ashford" — a small hand-drawn-style village map (SVG) with two named POIs and one layer.
    - **Characters**: creates one demo character named "Elara Brightwell" — a Level 5 Ranger with complete stat block.
    - **Knowledge**: creates three demo notes named "Campaign Overview," "Session 1 Notes," and "The Thornwood Dungeon" with minimal placeholder content.
  - Demo content is tagged internally with `_demo: true` metadata.
  - All demo content items show a "Demo" badge (chip label, `--color-accent-info` token) wherever their name appears in the UI.
  - "Remove all demo content" in Settings → Advanced: removes all items tagged `_demo: true`. Confirmation dialog required ("Remove all demo content? This cannot be undone.").
  - The "Load demo content" secondary CTA is hidden once the user has created at least one real item in that surface (regardless of whether demo content is still present).
- **States:** available (secondary CTA shown), loading (spinner in CTA), loaded (demo items appear, CTA hidden), cleared (demo items removed, CTA not re-shown).
- **Platform profiles:** identical; secondary CTA is always below the primary CTA in the canonical anatomy.
- **Acceptance criteria:**
  - Given the Knowledge surface is empty, when "Load demo notes" is activated, then three demo notes appear with "Demo" badges.
  - Given the user creates one real note, when the Knowledge surface renders, then the "Load demo notes" secondary CTA is absent.
  - Given demo content exists, when "Remove all demo content" is confirmed in Settings, then all items tagged `_demo: true` are deleted across all surfaces.
- **Priority:** Should-have

---

### UX-ONB-020 — "What's New" / changelog surface
- **Requirement:** A changelog surface must be accessible from the help panel (UX-ONB-016) and from Settings → About. It must show a reverse-chronological list of release entries. It must never be shown as an interruptive modal on login. New entries must be indicated by the badge on the "?" button until the help panel (or changelog page) is opened.
- **Rationale:** Interruptive "What's New" modals on login are a top-cited UX annoyance and disrupt user task continuity [3]. The correct pattern (Linear, GitHub) is a passive badge that invites but never demands attention [6].
- **Spec:**
  - Changelog entry format:
    ```
    [Version + Date, bold]
    [Release title, ≤10 words]
    [Bullet list of changes, ≤6 bullets]
    [Optional "Learn more →" link]
    ```
  - Changelog surface: full-page route (`/changelog`) accessible from Settings → About, linked from the help panel.
  - In the help panel: the 3 most recent entries shown inline; "See all →" link to `/changelog`.
  - Badge: appears on "?" button when a changelog entry has a `seen_at` timestamp of null for the current user. Cleared on first open of help panel or changelog page.
- **States:** unseen (badge active), seen (badge cleared), changelog-page (full list).
- **Platform profiles:** identical; changelog page is a standard full-page layout.
- **Acceptance criteria:**
  - Given a new release entry exists, when the "?" button renders, then the red badge dot is visible.
  - Given the user opens the help panel, when it renders, then the badge is cleared.
  - Given the user opens the app after a release, then no interruptive modal or dialog is shown before they can access the Command Center.
- **Priority:** Should-have

---

### UX-ONB-021 — Teach-by-doing: interactive empty-state examples
- **Requirement:** The Canvas and Maps empty states must offer a "Try it out" action that places an interactive placeholder widget (Canvas) or opens a guided map-creation overlay (Maps), allowing the user to experience the interaction model before committing to real content. The placeholder must be clearly labeled as an example and easily removable.
- **Rationale:** Interactive demonstration outperforms passive instruction for spatial tools with gesture-based interactions [9][3]. A user who has panned a canvas or drawn a map shape understands the tool faster than one who has read about it.
- **Spec:**
  - **Canvas "Try it out":** Places an "Example widget" — a 320×200 CSS px widget with title "Example note" and a paragraph of placeholder Lorem Ipsum text. Widget title includes a "(Example)" suffix. Widget chrome has a 2px dashed `--color-accent-info` border to indicate example status. A dismiss "×" inside the widget chrome removes it. No undo required for example-widget removal.
  - **Maps "guided start":** Opens the map creation flow pre-seeded with one terrain layer and a starting zoom level, with a floating "Draw your first room" coach mark pointing at the pencil/draw tool.
  - "Try it out" is a tertiary link below the secondary CTA in the empty-state anatomy (third level of the hierarchy). It is only shown on first-use empty states (not cleared states).
- **Acceptance criteria:**
  - Given the Canvas empty state is shown, when "Try it out" is activated, then an example widget appears and the empty-state anatomy is replaced by the canvas with the example widget.
  - Given the Maps empty state is shown, when "Try it out" is activated, then the map creation flow opens pre-seeded.
  - Given the example widget is visible, when the user dismisses it, then the canvas empty state does not reappear (the user has now "used" the surface).
- **Priority:** Could-have

---

## 6. Component & state specifications

### 6.1 First-run wizard component

| State | Visual treatment | Behavior |
|---|---|---|
| Step active | Step dot: filled circle (primary color), heading: bold. CTA enabled if required field filled. | Tab/Enter navigates forward. |
| Step done | Step dot: checkmark icon (success color). Step content collapsed. | Cannot navigate back to a done step mid-wizard (can resume from Settings). |
| Step skipped | Step dot: dash icon (muted color). | Same as done for navigation purposes. |
| Step error | Field(s) with inline error; CTA disabled. | Cannot advance until error resolved or step skipped. |
| Wizard dismissed | Dialog closed; Command Center "Finish setup" banner appears if any step incomplete. | Reopens at first incomplete step. |

### 6.2 Empty-state component

| Element | Token / size | Notes |
|---|---|---|
| Illustration | 120×120 CSS px SVG | `alt` text required; genre-appropriate; passes WCAG contrast. |
| Headline | `--text-lg`, `--font-weight-semibold` | ≤5 words. |
| Body | `--text-sm`, `--color-text-muted` | ≤2 sentences. |
| Primary CTA | Standard primary button from `01-visual-design-system.md` | ≥44×44 CSS px touch target. |
| Secondary CTA | Link-style button, `--text-sm` | Optional; used only for demo content or "Learn more." |
| Tertiary CTA | Link, `--text-xs`, `--color-text-muted` | Optional; "Try it out" or similar. |
| Container | Flexbox column, centered horizontally and vertically in parent | 24px gap between elements. Max-width 360 CSS px. |

### 6.3 Coach-mark component

| Element | Token / size | Notes |
|---|---|---|
| Container | 280px max-width, 12px padding, `--color-surface-overlay`, `--elevation-2` | Non-modal. |
| Arrow | 12×12 CSS px triangle SVG | Points at target element center. |
| Title | `--text-sm`, `--font-weight-semibold` | ≤6 words. |
| Body | `--text-xs`, `--color-text-secondary` | ≤2 sentences. |
| Dismiss button | 32×32 CSS px icon button, top-right | `aria-label="Dismiss tip: [title]"`. |
| Z-index | `--z-coach-mark` | Above surface content; below modals. |

| State | Treatment |
|---|---|
| Appearing | Fade-in 150 ms ease-out. `prefers-reduced-motion`: instant. |
| Visible | Positioned 8px from target edge. |
| Dismissing | Fade-out 100 ms ease-in; removed from DOM. `prefers-reduced-motion`: instant removal. |
| Seen (persisted) | Not rendered; will not fire again. |

### 6.4 Keyboard cheat sheet component

| Element | Spec |
|---|---|
| Modal | `role="dialog"`, `aria-modal="true"`, 720×560 px Desktop, fullscreen sheet Mobile. |
| Search | `type="search"`, auto-focused on open, live-filters rows. |
| Section heading | Category name, bold, collapsible (chevron). |
| Shortcut row | `[<kbd>key</kbd>] ... [description]` |
| `<kbd>` style | `--color-surface-subtle` bg, 1px border, 4px radius, `--text-xs` monospace. |
| Close | Escape, second "?" press, × button. |

### 6.5 Help panel component

| Element | Spec |
|---|---|
| Desktop | 320px right drawer, non-overlapping (shrinks main content). |
| Mobile/Tablet portrait | 60dvh bottom sheet, overlapping. |
| Sections | Surface help → Quick tips → Related articles → Divider → What's New → Shortcuts link. |
| Badge | 8×8 CSS px dot, `--color-accent-danger`, top-right of "?" button. |

---

## 7. Layout & responsive behavior

### 7.1 First-run wizard layout

```
DESKTOP (≥1024px)
┌────────────────────────────────────┐
│         [Dark overlay]             │
│  ┌──────────────────────────────┐  │
│  │  DND Tools wordmark (top)    │  │
│  │  ─────────────────────────   │  │
│  │  Step indicator: ○●○○○       │  │
│  │  [Step content area]         │  │
│  │  [Field / options]           │  │
│  │                     [Skip]   │  │
│  │  [Primary CTA   full-width]  │  │
│  └──────────────────────────────┘  │
│         640px wide, auto height    │
└────────────────────────────────────┘

MOBILE (<600px)
┌────────────────────┐
│  [Wordmark]        │
│  Step: ○●○○○       │
│  ──────────────    │
│  [Step content]    │
│  [Field/options]   │
│             [Skip] │
│  [CTA — full-width]│
└────────────────────┘
Full-screen bottom sheet, max-height 90dvh
```

### 7.2 Empty state layout (all profiles)

```
DESKTOP / TABLET (centered in available pane)
┌──────────────────────────────────────┐
│                                      │
│        [Illustration 120×120]        │
│                                      │
│         Headline (≤5 words)          │
│    Body copy — up to two sentences   │
│                                      │
│      [        Primary CTA        ]   │
│             Secondary CTA            │
│             Tertiary CTA             │
│                                      │
└──────────────────────────────────────┘
Max-width 360 CSS px, vertically and horizontally centered.

MOBILE (<600px)
Same layout, full-width inside 24px horizontal padding.
Primary CTA is full-width.
```

### 7.3 Coach mark positioning rules

```
Preferred position: ABOVE target
  ┌─────────────────┐
  │ Title           │
  │ Body copy here  │  [×]
  └────────┬────────┘
           ▼ (arrow)
      [Target element]

Fallback if above clips top edge: BELOW target
      [Target element]
           ▲
  ┌────────┴────────┐
  │ Title           │
  │ Body copy here  │  [×]
  └─────────────────┘

Mobile: prefer above (bottom-bar targets) or below (top-bar targets).
Never position left or right — risk of edge clipping on narrow screens.
```

### 7.4 Help panel layout

```
DESKTOP (right drawer, non-overlapping)
┌──────────────────────┬───────────┐
│  [Main content area] │ [Help]    │
│  (shrinks by 320px)  │ panel     │
│                      │ 320px     │
└──────────────────────┴───────────┘

MOBILE (bottom sheet, 60dvh)
┌──────────────────────┐
│  [Main content]      │
├──────────────────────┤  ← Sheet handle (drag to dismiss)
│  [Help panel]        │
│  60dvh max           │
└──────────────────────┘
```

---

## 8. Motion & feedback

| Interaction | Duration | Easing | `prefers-reduced-motion` fallback |
|---|---|---|---|
| First-run wizard open | 200 ms fade-in + 8px upward translate | ease-out | Instant appear |
| Wizard step advance | 150 ms crossfade between step content | ease-in-out | Instant swap |
| Wizard step checkmark | 200 ms scale(0→1) + fade-in | ease-out (spring feel) | Instant appear |
| Wizard dismiss | 150 ms fade-out | ease-in | Instant disappear |
| Empty state appear | 200 ms fade-in | ease-out | Instant appear |
| Demo content load (skeleton) | Skeleton shimmer 1.2 s loop | ease-in-out | Static skeleton, no shimmer |
| Demo content replace | 300 ms fade-in (content over skeleton) | ease-out | Instant replace |
| Coach mark appear | 150 ms fade-in | ease-out | Instant appear |
| Coach mark dismiss | 100 ms fade-out | ease-in | Instant remove |
| Help panel open (Desktop) | 200 ms slide-in from right | ease-out | Instant appear |
| Help panel close (Desktop) | 150 ms slide-out to right | ease-in | Instant disappear |
| Help panel open (Mobile) | 250 ms slide-up from bottom | ease-out | Instant appear |
| Cheat sheet open | 150 ms fade-in + 4px upward translate | ease-out | Instant appear |
| Cheat sheet close | 120 ms fade-out | ease-in | Instant disappear |
| "?" badge appear | 200 ms scale(0→1) | ease-out (spring) | Instant appear |

All durations use tokens from `01-visual-design-system.md` motion system. No custom durations.

---

## 9. Accessibility requirements (surface-specific)

Beyond the global `03-accessibility.md` baseline, the onboarding and learnability surfaces must satisfy the following:

**9.1 First-run wizard**
- WCAG 2.2 SC 2.4.3 (Focus Order): Focus moves logically through each step's fields in DOM order. When advancing to the next step, focus moves to the step heading.
- WCAG 2.2 SC 1.3.5 (Identify Input Purpose): All form fields use appropriate `autocomplete` attributes (e.g., `autocomplete="name"` for display name, `autocomplete="email"` for email, `autocomplete="new-password"` for password).
- WCAG 2.2 SC 2.4.11 (Focus Not Obscured): Coach marks, toasts, and banners must not fully obscure the focused form field when the wizard is open.
- The wizard must never trap focus in a broken state — Escape must always provide a path to dismiss.

**9.2 Empty states**
- WCAG 2.2 SC 1.1.1 (Non-text Content): All empty-state illustrations are `<img>` with descriptive `alt` text naming the surface and the state (e.g., `alt="Maps surface, no maps created yet"` — not `alt="illustration"`).
- Primary CTAs must have accessible names that combine verb + noun (e.g., "Create your first map" not "Create").

**9.3 Coach marks**
- WCAG 2.2 SC 4.1.3 (Status Messages): Coach marks use `aria-live="polite"` on their container so screen readers announce their content without moving focus.
- WCAG 2.2 SC 2.1.1 (Keyboard): Dismiss is keyboard-accessible via the × button (focusable, Enter/Space) and via Escape (Desktop).
- Coach marks must not trigger focus movement — they are informational overlays, not interrupting dialogs. The user's current focus context is undisturbed.

**9.4 Cheat sheet**
- WCAG 2.2 SC 1.3.3 (Sensory Characteristics): Shortcuts are described by name, not only by visual position (e.g., "Search: Ctrl+K" not "The left shortcut").
- `<kbd>` elements carry `aria-label` with the spelled-out key name where ambiguous (e.g., `<kbd aria-label="Question mark key">?</kbd>`).

**9.5 Player join flow**
- WCAG 2.2 SC 3.3.1 (Error Identification): Auth form errors identify the specific field in error and describe the error in text (not color alone).
- WCAG 2.2 SC 3.3.2 (Labels or Instructions): All auth form fields have visible labels (not placeholder-only labels).

---

## 10. Anti-patterns & explicit limitations

**Required section.** The following are hard prohibitions, each with a research-backed reason. Implementers must not apply these patterns even if they are common in competitor products.

| Anti-pattern | Prohibition | Researched reason |
|---|---|---|
| **Forced linear tours (modal walls before value)** | Must not show any instructional overlay, slide deck, or video tour before the user can access the main application interface. | NN/g shows upfront product tours score lowest on completion and retention; they appear before users have context for what is being taught [2]. The app must be accessible without completing the tour. |
| **Undismissable onboarding steps** | No wizard step (except step 1: vault name) may block progress. Every step must have a "Skip" affordance. | Forced completion of onboarding steps before accessing the product is a significant friction point and causes abandonment [6][8]. Users who are forced to complete steps they do not understand are more likely to churn. |
| **Coach-mark spam (>2 per session)** | No more than 2 coach marks may fire in any single user session across all surfaces. | Exceeding three coach marks per session causes users to auto-dismiss without reading [3]. Frequency caps are the minimum viable protection. |
| **Undismissable coach marks** | Every coach mark must have a visible, immediately accessible dismiss action. | Apple HIG §Onboarding explicitly prohibits UI hints that block interaction or cannot be immediately dismissed [4]. |
| **Blank empty states** | No surface may show an empty state that only says "No items" or equivalent. | Empty states without a heading, explanation, and CTA fail to orient or teach the user [1][16]. They are the single most commonly cited first-run failure in usability research. |
| **Re-onboarding returning users** | The first-run wizard must not re-appear on login after being completed or fully dismissed. | Treating returning users as new users destroys trust and wastes time. Notion's early 2023 behavior of re-showing "welcome" overlays on every login was widely criticized [8]. |
| **Help buried in Settings** | The "?" help entry must be persistently visible on every surface without requiring navigation to Settings. | Help that requires more than 1 action to access is effectively hidden; users in distress will not find it [3]. |
| **New-release interruptive modals** | "What's New" content must not appear as a modal dialog on login. | Modal dialogs on login disrupt task continuity and are commonly clicked away without reading. The badge + panel pattern respects user attention [6]. |
| **Player forced through DM setup** | The Player join path must bypass all vault setup, source configuration, and feature-tier steps. | A player who receives an invite link has zero context for DM setup. Exposing them to it causes confusion and significantly increases join-flow abandonment. |
| **Coach marks on empty surfaces** | Coach marks must not fire on a surface that is fully empty (no content, no affordances visible yet). | A coach mark pointing at an affordance that is not yet rendered is confusing and breaks the "first-reach" trigger logic [3]. Coach marks must fire after the surface has rendered the affordance they describe. |
| **Progress percentage on short wizards** | The first-run wizard must use step dots, not a percentage progress bar. | Percentage bars on 5-step wizards communicate anxiety ("I'm only 20% done") rather than confidence. Step dots communicate sequence without implying large scope [5][6]. |
| **Automatic video autoplay in help** | Help center articles linked from the panel must not autoplay video. | Autoplay video is disruptive during live-play sessions (audio bleed) and is an accessibility violation (WCAG 2.2 SC 1.4.2 Audio Control). |

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| DM time-to-first-value (TTFV) | ≤5 minutes from vault creation to first widget on screen | Product analytics: `onb:dm_first_value` event, elapsed seconds from `onb:wizard_start` |
| Player join TTFV | ≤90 seconds from invite-link click to player canvas rendered | Product analytics: `onb:player_first_value`, elapsed seconds from `onb:join_link_click` |
| Wizard completion rate (all steps, no skips) | ≥40% | Analytics: funnel from step 1 complete to step 5 complete |
| Wizard skip-but-resume rate | ≥25% of skippers return to complete within 7 days | Analytics: `onb:wizard_resumed` within 7 days of `onb:wizard_dismissed` |
| Empty-state CTA activation rate | ≥50% of first-time surface visits result in the empty-state CTA being activated | Per-surface funnel: `onb:empty_state_shown` → `onb:empty_state_cta_activated` |
| Coach-mark read rate (not immediately dismissed) | ≥70% of coach marks remain visible for ≥2 seconds before dismissal | Analytics: `onb:coach_mark_shown` timestamp vs. `onb:coach_mark_dismissed` timestamp |
| Demo content adoption rate | ≥30% of first-time DMs load demo content on at least one surface | Analytics: `onb:demo_content_loaded` |
| First-run task success rate (unassisted) | ≥80% of new DMs complete "place one widget" without accessing external help | Usability study: observe first 5 minutes; no prompting |
| Cheat sheet discovery rate | ≥60% of DMs who use keyboard shortcuts have opened the cheat sheet at least once | Analytics: `onb:cheat_sheet_opened` among users with ≥5 shortcut invocations |
| Coach mark auto-dismiss rate (dismissed in <1 s) | <10% of marks dismissed in <1 second (indicates reading, not dismissal reflex) | Analytics: `onb:coach_mark_dismissed` where duration < 1000 ms |

---

## 12. Open questions & risks

| Question / Risk | Current disposition |
|---|---|
| **Vault name as step 1 vs. post-first-use** | Some tools (Notion, Linear) collect the workspace name as the very first step; others (Figma) auto-generate it and allow rename. Requiring the name as step 1 adds 30 s but increases ownership signal. Disposition: keep name as step 1 (required); reconsider if usability testing shows >20% abandonment at this step. |
| **Player join with no prior account (anonymous join)** | The current spec requires authentication before session join. Anonymous (no-account) join would reduce Player TTFV to <30 s but requires session-security and identity decisions. Disposition: deferred; anonymous join is a scope question for the security domain (`SEC`, `COLLAB`). |
| **Demo content as a real source vs. fixture** | Demo content could be a vault fixture (loaded files) or a separate read-only demo vault. Implementation detail not resolved at UX level. Disposition: functional `PLAT` domain to decide; UX requirement is that demo content is clearly labeled and bulk-removable. |
| **Coach mark "seen" persistence across devices** | Should "seen" state sync across devices (user account) or stay local? Disposition: should sync via cloud user preferences when the user is authenticated; local-only fallback when offline. Requires `SYNC` domain coordination. |
| **Feature tier default for returning users** | The spec defaults new DMs to "Starter" and returning DMs to "Standard." The transition point (when a user stops being "new") is undefined. Disposition: define "returning" as: vault age > 7 days OR has created ≥1 non-demo item. |
| **Cheat sheet and mobile: "?" key unavailable** | Mobile users with no hardware keyboard cannot access the cheat sheet via "?". Disposition: the "?" button in the bottom bar opens the contextual help panel which includes a "Keyboard shortcuts →" link. The cheat sheet is reachable in 2 taps — acceptable given that keyboard shortcuts are not the primary mobile interaction modality. |
| **Empty-state illustrations: accessibility on dark theme** | Genre-appropriate dark-theme illustrations with sufficient contrast on dark backgrounds require careful art direction. Risk: illustrations that look good on light theme fail WCAG contrast on dark. Disposition: all empty-state illustrations must be tested on both light and dark themes before launch; the design system `01-visual-design-system.md` must specify the illustration color palette. |
| **Progressive onboarding milestone state vs. vault state** | Milestones are stored in user preferences, not vault state. Risk: a user who resets their preferences loses all milestone state and re-receives Tier 1 coach marks. Disposition: acceptable trade-off; milestone state is low-cost to re-acquire (one session of use). |

---

## Sources

[1] "Empty States for User-Created Content" — Nielsen Norman Group — https://www.nngroup.com/articles/empty-state-interface-design/

[2] "UX Onboarding Methods" — Nielsen Norman Group — https://www.nngroup.com/articles/onboarding-methods/

[3] "Instructional Overlays, Slideshow Tours, and Coach Marks" — Nielsen Norman Group — https://www.nngroup.com/articles/instructional-overlays-and-coach-marks/

[4] "Onboarding" — Apple Human Interface Guidelines — https://developer.apple.com/design/human-interface-guidelines/onboarding

[5] "Superhuman Onboarding" — First Round Review — https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/

[6] "Linear" — Linear.app onboarding and help patterns — https://linear.app

[7] "Getting Started in Slack" — Slack Help Center — https://slack.com/help/articles/218080037-Getting-started-for-new-Slack-users

[8] "Notion's Getting Started Experience" — Notion — https://www.notion.so/help/guides/getting-started-with-notion

[9] "Figma's New User Onboarding" — Figma — https://www.figma.com/blog/figma-onboarding/

[10] "How Height Does Progressive Feature Disclosure" — Height — https://height.app

[11] "Arc's Onboarding with Spaces" — The Browser Company — https://arc.net

[12] "Gmail Keyboard Shortcuts" — Google — https://support.google.com/mail/answer/6594?hl=en

[13] "Linear Keyboard Shortcuts" — Linear — https://linear.app/docs/keyboard-shortcuts

[14] "Duolingo's Onboarding Flow" — Duolingo — https://duolingo.com

[15] "Figma: Sharing and Permissions" — Figma Help Center — https://help.figma.com/hc/en-us/articles/360040531773-Share-files-and-projects

[16] "Empty States" — Material Design 3 — https://m3.material.io/foundations/content-design/empty-states
