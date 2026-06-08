# UX Requirements — AI & MCP Tools

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `MCP-001..013`
> **Owner surface(s):** MCP tool-config panel (Settings → AI & Tools), inline AI suggestion overlay
> in the editor, AI output attribution markers, staged-write review panel, AI provider attachment
> dialog, cost/latency feedback strip, and all AI-presence affordances across every route.

---

## 1. Scope

- **Covers:** Every surface where AI or MCP tools are visible to the user: the inline writing
  assistant in the content editor (suggestions, diff-style edits, regeneration); named-entity
  extraction suggestions surfaced as sidebar chips; the MCP tool-configuration panel (enable/disable
  baseline and added tools, per-agent policy modes, tool allowlist, audit log access); AI provider
  attachment and trust configuration; the staged-write review panel (AI-proposed changes queued for
  human approval); AI output formatting and attribution markers (provenance badges on AI-generated
  or AI-assisted content); streaming feedback (progress, stop control, token/cost awareness); and
  the "AI off" state — the appearance and behavior of every surface when AI is fully disabled, with
  complete UI parity confirmed.

- **Does NOT cover:** The content editor's core editing mechanics (owned by
  `09-content-authoring-and-sources.md`). The global settings navigation shell (owned by
  `02-navigation-and-platform-profiles.md`). The visibility/permission data model enforced beneath
  the UI (owned by `11-collaboration-permissions.md`). Visual token definitions (color, typography,
  spacing, motion easing) defined in `01-visual-design-system.md` and consumed here. Graph
  relationship scoring, sync conflict resolution, and permission decisions — which algorithms own
  and AI must never usurp.

- **Related functional requirements:** `../requirements/13-mcp-ai.md`
  - `MCP-001` — MCP can be fully disabled; all core workflows remain functional
  - `MCP-002` — Baseline read tools ship by default; visibility-filtered for player-scoped contexts
  - `MCP-003` — Write tools default to `strict_review` staged mode; `trusted_direct` is explicit opt-in
  - `MCP-004` — All tool reads/writes route through Processing Core for visibility and permission enforcement
  - `MCP-005` — Dedicated tests for every write-capable and baseline read/report tool
  - `MCP-006` — Semantic bundle tools produce bounded, source-cited context packages
  - `MCP-007` — AI is bounded to creative text, narrative suggestions, and named-entity extraction; algorithms own graph intelligence
  - `MCP-008` — Local AI integrations are optional, capability-detected; non-AI fallbacks exist for every Must-have workflow
  - `MCP-009` — Per-agent policy modes: `disabled`, `strict_review`, `balanced`, `trusted_direct`
  - `MCP-010` — Structured, consistent MCP/AI response envelopes with ids, status, summary, data, warnings, citations
  - `MCP-011` — Each agent connection maps to an authenticated vault actor before any tool can run
  - `MCP-012` — Filesystem and platform-service exceptions explicitly allowlisted and linted
  - `MCP-013` — Bundle tools include calendar/custom-time context when visible source data contains dates

- **Related UX docs:**
  - `01-visual-design-system.md` — design tokens, provenance badge color, attribution chip styling
  - `02-navigation-and-platform-profiles.md` — Settings navigation shell, platform profiles
  - `03-accessibility.md` — global a11y baseline; keyboard model; live-region announcements
  - `09-content-authoring-and-sources.md` — editor surface that hosts inline AI suggestions
  - `11-collaboration-permissions.md` — visibility and permission model that AI must not circumvent

---

## 2. UX goals for this surface

AI and MCP tools are **additive and optional**, not core infrastructure. The principal UX promise is
that the product works completely and well without them, and that when they are present, they feel
like a skilled assistant at the user's elbow — not an autonomous agent, not a black box. Human
authorship is always preserved; AI generates candidates, humans decide.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | AI affordances are minimal and unobtrusive by default: a small inline sparkle trigger in the editor, a compact provenance chip on attributed content, a clean tool-config panel. They must feel like purposeful additions to the product's design language, not foreign UI imported from another app. When AI is off, no visual trace of it remains except the toggle in Settings. |
| **Information scent** | The AI tool-config panel groups baseline and added tools clearly. Mode badges (`strict_review`, `balanced`, `trusted_direct`, `disabled`) are labeled in human language, not code. Every surface clearly signals whether AI is on or off. Inline suggestion triggers are labelled — "AI writing help" — not hidden behind cryptic icons. |
| **Navigability** | MCP tool config lives at Settings → AI & Tools, reachable in ≤ 3 steps from anywhere. Inline AI is triggered from within the editor via a clearly labeled affordance; dismissing it returns focus to the editor caret in one keystroke (Escape). The staged-write review panel is always accessible from a persistent notification when staged changes are pending. |
| **Intuition / learnability** | First-run empty state for AI tools explains the bounded role of AI in one sentence ("AI helps with writing and extraction; your content and its relationships are always managed by the app"). Tool-config panel is scannable at a glance: a checkbox list of tools, a mode selector per agent, an audit-log link. No jargon that requires reading documentation. |
| **Accessibility** | WCAG 2.2 AA throughout. All AI suggestion affordances are keyboard-operable with labeled actions (Accept, Reject, Regenerate, Edit, Undo). Streaming AI output uses a live region with appropriate `aria-live` politeness. Stop controls are keyboard-reachable at all times during streaming. Provenance badges provide text equivalents — not color alone — to communicate AI origin. |
| **Adaptability (platform profiles)** | Desktop: full inline suggestion panel, side-by-side diff view, and MCP tool-config panel as a settings page. Tablet: inline suggestions appear as a bottom sheet; tool config is a full-screen sheet. Mobile: AI suggestions surface as a focused action sheet; tool config is a slim settings section; all same Processing Core commands execute identically. |
| **Effective emphasis (visual hierarchy)** | AI suggestion panels never compete with editor content for primary attention — they are secondary overlays, not full-page modals. The "Accept" action is always the primary button; "Reject" is secondary; "Edit" is tertiary. Provenance badges are small and muted. Cost/latency feedback is peripheral, not alarming unless a threshold is crossed. |
| **Feedback & responsiveness** | AI generation acknowledges within 100 ms (spinner or streaming start). Streaming text appears word-by-word. Stop is effective within one rendering frame. Staged-write submission shows a progress indicator. AI tool config changes take effect immediately with a silent confirmation toast. |
| **Error prevention & recovery** | AI never auto-applies edits without human acceptance. Write tools default to staged mode. Every staged change is reviewable, amendable, and rejectable before any durable mutation. Undo is available for accepted AI edits alongside manual edits (same undo stack). Error output from failed AI calls is actionable ("Retry", "Report") and never exposes hidden data. |
| **Consistency** | The inline suggestion accept/reject/regenerate pattern is identical across all surfaces that host it (note editor, character backstory, session prep). Provenance badges use a single shared component. AI output response envelope structure (`MCP-010`) maps to a single presentation layer. Tool-config panel anatomy is the same for baseline and added tools. |

---

## 3. Researched best practices

### 3.1 Human-AI interaction — Microsoft HAX guidelines

Microsoft's Human-AI Interaction (HAX) guidelines define 18 design principles for human-AI
products, organized across four phases: Initially, During Interaction, When Wrong, and Over Time
[1]. The principles most applicable to DND Tools are:

**G1 — Make clear what the system can and cannot do.** Users over-trust AI when its scope is
opaque. Surfacing AI's explicit boundary ("creative writing and extraction only") in onboarding and
in the tool-config panel prevents misplaced trust in graph scoring or permission decisions.
**Implication:** The MCP tool-config panel must display a one-sentence AI scope statement in the
header.

**G4 — Show contextual information.** AI suggestions become trustworthy when the user can see
what data informed them, not just the suggestion itself. GitHub Copilot's citation of which file
context it used, and Notion AI's source-document attribution, both apply this. **Implication:**
Every AI suggestion must include a disclosure of which vault content or character data was used as
context.

**G7 — Support efficient correction.** When AI is wrong, correction must be faster than starting
over. The editing-in-place pattern (Cursor, Raycast AI) where the user can directly edit the
suggestion before accepting it is more efficient than reject-retype. **Implication:** The
suggestion panel must include an inline editable field, not just Accept/Reject.

**G14 — Notify users about changes.** Staged writes are the mechanism; the review panel is the
notification surface. **Implication:** A persistent status badge or notification must appear when
staged changes are pending, and must remain until the user explicitly reviews and accepts or rejects.

**G17 — Explain AI failures.** When an AI tool fails, the error must explain why in user-facing
language and offer a recovery path. **Implication:** AI error states use the product's standard
error component with "Retry" as the primary action.

### 3.2 Apple HIG — Machine Learning and Generative AI

Apple's Human Interface Guidelines for machine learning features (2024 update covering Apple
Intelligence) establish that AI features must be [2]:

- **Helpful before impressive.** The feature should solve a real user problem, not demonstrate
  capability. Apple Intelligence writing tools (proofread, rewrite, summarize) are narrow, fast, and
  contextually triggered — not a general chatbot interface embedded in the document. **Implication:**
  DND Tools' AI writing help must be narrow: creative text, narrative suggestions, entity extraction.
  No open-ended chat interface in the editor.

- **Transparent about confidence.** Apple Intelligence shows a "Review" step when suggestions
  involve any ambiguity, and uses a consistent purple gradient as its visual identity system.
  **Implication:** Use a single, consistently applied design token (a subtle AI provenance indicator
  color, defined in `01-visual-design-system.md`) across all AI-generated content.

- **Minimally invasive.** Suggestions appear in a non-blocking overlay that dismisses naturally.
  They do not interrupt typing. **Implication:** The inline AI trigger must appear after a pause or
  on explicit invocation, never interrupting the user's typing flow.

### 3.3 Google PAIR — People + AI Guidebook

Google's PAIR (People + AI Research) Guidebook [3] identifies five critical patterns for AI
products in collaborative tools:

**Anchor expectations early.** First-run users who see AI produce one bad result will distrust it
permanently if they were led to expect perfection. The guidebook recommends framing AI output as
"a first draft" or "a starting point" rather than "the answer." **Implication:** All AI suggestion
panels must include microcopy framing suggestions as drafts (e.g., "AI draft — review and edit").

**Expose provenance.** Users who can trace a suggestion back to a source are 2–3× more likely to
trust and use it productively. **Implication:** Source citations in MCP semantic bundles (MCP-006)
must surface in the UI, not be buried in raw output.

**Make feedback low-cost.** A "thumbs up / thumbs down" on AI output is noise if it is never
acted on. PAIR recommends instead that in-product feedback mechanisms be tied to concrete
corrections: if the user edits an AI suggestion, that edit is the implicit feedback signal.
**Implication:** DND Tools collects feedback through edits, not explicit ratings, which also
reduces UI clutter.

**Support graceful degradation.** Every AI-assisted workflow must have a non-AI path that is at
least as good as the v1 baseline. **Implication:** When AI is off, no workflow is downgraded;
manual alternatives are always present and clearly labeled.

### 3.4 Inline writing assistance — GitHub Copilot and Cursor

GitHub Copilot's inline suggestion model [4] uses a distinct visual treatment (greyed "ghost text")
that renders at the cursor position and can be accepted with Tab, partially accepted word-by-word
with Ctrl+Right, or dismissed with Escape. The key insight is that the suggestion is *in-situ*
and never takes the user to a new surface. **Implication:** DND Tools' inline narrative suggestion
appears in-situ in the editor using a visually distinct (non-black) style, with Tab to accept, Esc
to dismiss, and Alt+] / Alt+[ to cycle alternatives.

Cursor's diff-style AI edit presentation [5] shows proposed edits as a side-by-side diff (red
deletions, green additions) for multi-line changes, and as inline ghost text for single-line
additions. The user can accept all, reject all, or place the cursor inside the diff to accept
individual hunks. **Implication:** Multi-line AI suggestions in the note editor use a diff-style
presentation (inline, not in a new panel) for changes to existing text.

### 3.5 Notion AI, Linear AI, and Raycast AI — suggestion UX patterns

Notion AI [6] surfaces a floating toolbar above selected text that triggers suggestions. The
output appears in a floating card below the selection with "Replace", "Insert below", "Copy",
"Discard", and "Try again" actions. The card never expands to fill the screen. **Implication:**
For block-level suggestions (rewrite a paragraph), use a floating action card anchored to the
selection, not a full-panel modal.

Linear AI's "Write with AI" in issue descriptions [7] shows a small sparkle button in the editor
toolbar, triggers a focused text-input prompt, and streams the result directly into the field —
replacing the placeholder — with an "Undo" affordance for 10 seconds after completion. The "undo"
period is critical: it gives the user time to assess the result before committing. **Implication:**
For field-level suggestions (character backstory), stream the result into a preview area adjacent
to the field, not directly into the field itself, and make the accept/reject decision explicit.

Raycast AI [8] achieves zero-friction AI invocation via a single globally available shortcut and
shows results in a compact popover with action buttons at the bottom. The popover closes on any
outside click. **Implication:** AI tools in the command palette follow the same compact popover
pattern, consistent with the product's command center paradigm.

### 3.6 Provenance and content credentials

Adobe's Content Authenticity Initiative (CAI) and the C2PA specification [9] establish a
content-credentials model: AI-generated or AI-modified content carries a signed manifest that
records its origin, what model was used, and what source data was used. Browsers and social
platforms are beginning to surface this at the system level. The UX pattern is a small badge
(typically a "CR" icon or shield icon) attached to the content, which opens a provenance overlay
on click/tap. **Implication:** AI-generated or AI-assisted content in DND Tools carries a
persistent provenance badge that opens a provenance detail popover showing the tool used, the
context data referenced, and the agent identity — using a system-level pattern rather than a
custom invention.

### 3.7 Streaming and stop control — cost/latency feedback

OpenAI's API streaming UX (as implemented in ChatGPT) [10] uses a blinking cursor during
generation, a visible "Stop generating" button at the bottom of the output, and a token/cost
indicator in the developer console (not in the main UI, to avoid anxiety). For a professional
tool aimed at DMs managing sessions, cost awareness is a relevant signal but must not be alarming.
**Implication:** A peripheral streaming status bar shows "Generating…" during active AI generation
with a Stop button. Token and cost information is available in the AI tool-config audit log but
is not shown in the primary editor surface.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **GitHub Copilot** | In-situ ghost text; Tab to accept, Esc to dismiss, word-by-word partial acceptance; cycle alternatives | Minimal friction, zero context switch; user stays in flow | Borrow: the accept/cycle/dismiss keyboard model and ghost-text visual treatment. Avoid: the lack of multi-line diff view for larger suggestions. | https://docs.github.com/en/copilot/using-github-copilot/getting-code-suggestions-in-your-ide-with-github-copilot |
| **Cursor** | Diff-style multi-line suggestion (inline red/green), hunk-level accept, Apply → Review → Accept flow | Makes AI's proposed change legible as a concrete edit, not a black-box replacement | Borrow: diff presentation for multi-line edits; hunk-level accept. Avoid: the full-IDE context that makes this feel complex in a simpler content editor. | https://docs.cursor.com/tab/overview |
| **Notion AI** | Floating card anchored to selection; action buttons (Replace, Insert below, Discard, Try again); compact card never full-screen | Non-interrupting; keeps user anchored to their original content | Borrow: floating action card, action hierarchy (primary = Replace, secondary = Insert, tertiary = Discard). Avoid: no provenance attribution, no AI-off state. | https://www.notion.so/product/ai |
| **Apple Intelligence writing tools** | "Review" step before applying; narrow feature scope (proofread, rewrite, summarize); consistent purple visual identity | Transparency, bounded scope, and visual consistency build trust | Borrow: the explicit review step; single AI visual-identity token. Avoid: tying AI to a cloud account in a way that blocks usage for offline/local-only users. | https://developer.apple.com/design/human-interface-guidelines/writing-tools |
| **Raycast AI** | Global shortcut, compact popover, action buttons at popover bottom, closes on outside click | Zero-friction invocation; result is always provisional until user acts | Borrow: compact popover pattern; action buttons at bottom of output. Avoid: the lack of provenance — Raycast AI output is unattributed. | https://www.raycast.com/features/ai |
| **Adobe CAI / C2PA** | Provenance badge on AI-generated content; badge opens detail overlay with origin, model, source | Transparent AI origin; builds trust through traceable authorship | Borrow: the badge-opens-detail-overlay provenance pattern. Avoid: the complexity of the full C2PA manifest UI — keep the overlay concise (tool, context, agent). | https://contentauthenticity.org/how-it-works |

**North-star exemplars:**

1. **GitHub Copilot** — the in-situ ghost-text accept/cycle/dismiss model is the definitive
   standard for inline AI suggestion UX. Its primary insight is that the suggestion must live in the
   user's working context, not in a separate panel, and that the accept action must be a single
   keystroke with no context switch. DND Tools must match this standard for inline narrative
   suggestion.

2. **Cursor** — the diff-style presentation of multi-line AI edits makes the AI's proposed change
   legible and correctable before it is committed. This is the correct solution for AI writes to
   existing content (rewriting a paragraph, expanding an NPC's backstory) because it preserves the
   user's ability to accept individual changes. DND Tools' staged-write review panel adopts this
   pattern.

3. **Adobe Content Authenticity Initiative** — the provenance-badge-to-detail-overlay pattern is the
   correct architecture for attribution in a content-creation tool. In DND Tools, where world-building
   content may be authored by both humans and AI over extended campaigns, clear provenance is a
   long-term trust requirement, not an ornament.

---

## 5. UX/UI requirements

### UX-MCP-001 — Global AI enable/disable toggle with complete UI parity when off

- **Requirement:** The DM must be able to disable AI and MCP tools globally from Settings → AI &
  Tools. When disabled, every surface that previously showed AI affordances must function completely
  without them, with no degraded workflows, no placeholder states communicating lack of features,
  and no visual artifacts of the disabled system.
- **Rationale:** `MCP-001` is a Must-have contract; the vision brief states "MCP can be completely
  disabled with no loss of core functionality." The HAX guideline G1 (make capabilities and
  limitations clear) [1] requires that disabled state be legible and complete, not a broken partial
  UI. PAIR [3] requires graceful degradation.
- **Spec:**
  - Toggle: Settings → AI & Tools → "Enable AI & MCP tools" — a labeled toggle switch (default
    position: on, respecting installed/configured state; default for new installs with no provider
    configured: off).
  - When toggled off: all inline AI triggers disappear from the editor toolbar; AI suggestion chips
    are absent from entity sidebars; the agent connection list in the panel shows a "Tools disabled"
    banner; the MCP section in the command palette is absent; staged-write notification badges are
    absent.
  - When toggled off: a one-line confirmation toast: "AI & MCP tools disabled. All core features
    remain available." (auto-dismisses at 4 s).
  - Re-enabling: shows the same Settings panel; toggle reverts immediately; AI affordances
    reappear on next render of any relevant surface.
  - The disabled state does NOT show "AI unavailable" placeholders or grayed-out ghosts of AI
    affordances inside the editor. Absence is the correct state, not a disabled badge.
- **States:**
  - Enabled: all AI affordances visible and active
  - Disabled: all AI affordances absent; settings panel shows toggle off with label "AI & MCP tools
    are disabled"
  - Partially configured (no provider attached): toggle enabled but provider status chip shows "No
    provider — add one to use AI features"; baseline MCP read tools still available
- **Platform profiles:**
  - Desktop: toggle in Settings sidebar page at Settings → AI & Tools
  - Tablet: Settings opens as a full-screen sheet; same toggle in the AI & Tools section
  - Mobile: Settings → AI & Tools is a drill-down screen; same toggle at the top
- **Input:** pointer (click toggle), touch (tap toggle), keyboard (Tab to focus toggle, Space to
  toggle)
- **Accessibility:** `role="switch"`, `aria-checked="true|false"`, label "Enable AI & MCP tools";
  state change announced via `aria-live="polite"` region adjacent to the toggle
- **Acceptance criteria:**
  - Given AI is disabled, when the DM edits a note, then no AI trigger icon appears in the editor
    toolbar and Tab-order contains no AI elements.
  - Given AI is disabled, when the DM opens the command palette, then no MCP or AI commands appear
    in the results list.
  - Given AI is disabled, when core workflows (notes, maps, sessions, characters, sync, graph,
    search) are used, then they complete successfully with identical output to their pre-AI state.
  - Given AI is re-enabled, when the DM opens the editor, then AI affordances reappear within one
    render cycle (< 200 ms).
- **Priority:** Must-have

---

### UX-MCP-002 — Inline AI writing suggestion panel in the content editor

- **Requirement:** The content editor must provide an opt-in inline AI writing suggestion
  affordance for creative text assistance and narrative suggestions. Suggestions are always
  provisional — they never auto-apply. The user must explicitly accept, reject, or edit before any
  content changes.
- **Rationale:** `MCP-007` bounds AI to creative text and narrative; the suggestion must be
  in-situ and non-interrupting [1][2][4]. HAX G7 (efficient correction) and PAIR (anchor as draft)
  require editable, non-auto-applied output [1][3].
- **Spec:**
  - **Trigger (manual invocation):** A sparkle icon button (16×16 px, `aria-label="AI writing
    help"`) in the editor toolbar, always present when AI is enabled but visually muted (secondary
    icon weight). Keyboard shortcut: `Ctrl+Shift+A` (Desktop), exposed in toolbar tooltip and
    command palette.
  - **Trigger (selection-based):** When the user selects text (≥1 word) and pauses ≥600 ms, a
    floating mini-toolbar appears above/below the selection (viewport-side that has more space)
    containing a sparkle button with label "AI help". This floating toolbar dismisses on any outside
    click/tap or Escape.
  - **Suggestion prompt input:** A compact text field (max-width 480 px on Desktop, full-width on
    Mobile) labelled "Describe what you want (optional)" with microcopy placeholder "e.g. 'Make
    this more ominous'" appears below the trigger, inline in the editor. Submitting with Enter or
    clicking "Generate" initiates the request.
  - **Single-line / short suggestion output:** Ghost text at cursor position using the AI
    suggestion text style token (italicized, `color: var(--color-ai-suggestion)` — a muted blue
    defined in `01-visual-design-system.md`). Action bar directly below: [Accept — Tab] [Cycle alt
    — Alt+]] [Edit inline] [Reject — Esc].
  - **Multi-line / replacement suggestion output:** A diff-style card anchored below the selection.
    Red-background lines show removed text; green-background lines show added text. Actions:
    [Accept all] [Reject] [Edit in card] [Accept hunk…]. Hunk-level accept collapses accepted hunks
    green. See §6 Component Spec for full anatomy.
  - **Microcopy on suggestion card header:** "AI draft — review and edit before accepting" (14 px,
    muted color).
  - **Context source disclosure:** Below the action bar: "Based on: [list of context sources used,
    e.g. 'Session 7 notes, Aldric's backstory']" — clickable, opens provenance detail popover (see
    UX-MCP-006).
- **States:**
  - Idle: sparkle icon in toolbar, muted weight
  - Prompt open: compact prompt field focused, suggestion card absent
  - Generating: streaming ghost text with blinking cursor; Stop button visible (see UX-MCP-009)
  - Suggestion ready: ghost text or diff card visible; action bar active
  - Accepted: content committed; suggestion chrome disappears; editor focus restored to end of
    accepted text; undo available
  - Rejected: ghost text/diff card dismissed; editor focus restored to original caret; no change
  - Error: error chip below prompt field with "Retry" primary action and "Dismiss" secondary
- **Platform profiles:**
  - Desktop: inline ghost text + diff card; full action bar with keyboard shortcuts labeled
  - Tablet: same inline ghost text; diff card displayed as bottom sheet anchored to selection;
    action bar in sheet footer
  - Mobile: suggestion surfaced as a bottom action sheet with preview text and Accept/Reject/Edit
    actions; diff view is a before/after tab pair, not side-by-side
- **Input:**
  - Pointer: click sparkle icon, click action buttons
  - Touch: tap sparkle icon, tap action buttons (≥44×44 CSS px targets)
  - Keyboard: `Ctrl+Shift+A` to open; Tab to accept; Alt+] / Alt+[ to cycle; Escape to reject and
    close; Enter to submit prompt
- **Accessibility:** Suggestion card is `role="dialog"`, `aria-label="AI writing suggestion"`,
  `aria-modal="false"` (does not trap focus). Ghost text has `aria-hidden="true"` on the DOM node;
  the content of the suggestion is announced via `aria-live="polite"` when generation completes.
  Action buttons are keyboard-operable with visible focus ring. Streaming text announced once on
  completion, not word-by-word (to avoid live-region spam).
- **Acceptance criteria:**
  - Given the user opens the inline AI panel and generates a suggestion, when the suggestion
    arrives, then no change to the editor content has occurred until the user presses Accept.
  - Given the user presses Escape, when the suggestion is visible, then the card dismisses and
    editor focus returns to the caret position, with no change to content.
  - Given the user accepts a multi-line suggestion, when Accept all is clicked, then the undo stack
    contains an entry titled "Accept AI suggestion" that fully reverts the change.
  - Given the suggestion card is open, when the user presses Tab, then the ghost text or full
    suggestion is accepted and inserted, matching the keyboard model from reference [4].
  - Given AI is disabled, when the editor is open, then no sparkle icon, selection mini-toolbar, or
    keyboard shortcut triggers any AI action.
- **Priority:** Must-have

---

### UX-MCP-003 — Named-entity extraction suggestion chips

- **Requirement:** When the AI detects named entities in newly authored content (character names,
  place names, organization names, item names), it must surface them as dismissible suggestion
  chips in a sidebar panel, never auto-creating graph links or entity records.
- **Rationale:** `MCP-007` limits AI to named-entity extraction; creating the entity is a human
  decision. HAX G14 (notify users about changes) requires a notification mechanism; auto-application
  would violate HAX G2 (do not surprise) [1].
- **Spec:**
  - Extraction runs in the background after the user pauses typing for ≥ 2 s (debounced, never
    during active typing).
  - Results appear in a collapsible "Entities detected" chip rail in the editor's right sidebar
    (Desktop/Tablet) or in a "Review suggestions" sheet (Mobile), labelled with the AI provenance
    indicator.
  - Each chip shows: entity name (truncated to 32 chars), detected type icon (character, place,
    item, organization), and actions: [Link to existing] [Create new] [Dismiss].
  - [Link to existing] opens an inline entity search typeahead; selecting a result creates the
    graph link immediately.
  - [Create new] opens the entity quick-create panel for the detected type, pre-populated with the
    name; the user completes and submits.
  - [Dismiss] removes the chip; dismissed entities are not re-suggested for the current session.
  - The chip rail is collapsed by default if the user has dismissed chips in the previous 3 sessions
    without acting on them (learning behavior, implemented by core, not AI).
  - Maximum 10 chips displayed at once; a "Show N more…" expansion control handles overflow.
  - Chips carry a provenance badge (see UX-MCP-006) indicating AI detection.
- **States:**
  - No entities detected: chip rail absent or shows "No entities detected" placeholder (collapsed)
  - Chips present: chip rail visible, chips interactive
  - Dismissed (per entity): chip removed from rail
  - All dismissed: rail collapses
- **Platform profiles:**
  - Desktop: chip rail in right sidebar, always visible when entities present
  - Tablet: chip rail in right sidebar on landscape; sheet trigger button in editor toolbar on
    portrait
  - Mobile: "N entities detected" badge in editor toolbar; tapping opens a bottom sheet with chips
- **Input:** pointer (click chips and actions), touch (≥44×44 px targets), keyboard (Tab through
  chips; Enter to expand actions; D to dismiss focused chip — labeled in tooltip)
- **Accessibility:** Chip rail is a `role="region"` with `aria-label="Detected entities"`. Each
  chip is a `role="group"`. New chips announced via `aria-live="polite"`. Dismiss action is
  `aria-label="Dismiss suggestion for [entity name]"`.
- **Acceptance criteria:**
  - Given the user types a new character name in the editor and pauses for 2 s, when entity
    extraction runs, then a chip for that name appears in the sidebar without any graph link or
    entity record being created.
  - Given the user clicks Dismiss on a chip, when the editor session continues, then the chip
    disappears and the same entity name does not re-appear as a chip in the same editor session.
  - Given AI is disabled, when the user authors content with named entities, then no extraction
    chips appear and the sidebar section is absent.
  - Given the user clicks [Create new] on a chip, when the quick-create panel is submitted, then an
    entity record is created and a graph link is established; the chip is then removed.
- **Priority:** Should-have

---

### UX-MCP-004 — MCP tool-configuration panel anatomy

- **Requirement:** The Settings → AI & Tools panel must provide a scannable, grouped list of all
  MCP tools (baseline and added), with individual enable/disable controls, per-agent policy mode
  selectors, and an audit log access point.
- **Rationale:** `MCP-009` requires per-agent policy mode configuration; `MCP-002` requires
  baseline tools to be individually controllable. HAX G1 (make capabilities clear) [1] and the
  principle of progressive disclosure (overview first, details on demand) drive the panel structure.
- **Spec:**

  **Panel header:**
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ AI & Tools                               [? Help] [× Close]│
  │ AI supplements your workflow. It does not own graph        │
  │ intelligence or relationship scoring — algorithms do.      │
  │ MCP tools can be fully disabled with no loss of core       │
  │ functionality.                                             │
  │ ─────────────────────────────────────────────────────────  │
  │ Enable AI & MCP tools  ●──────○  [ON]                      │
  └────────────────────────────────────────────────────────────┘
  ```

  **Baseline tools section** (always first, labeled "Baseline tools — ship by default"):
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ BASELINE TOOLS                                             │
  │ ─────────────────────────────────────────────────────────  │
  │ ☑  Vault summary read         [read-only]  [i Details]     │
  │ ☑  Note read / list / search  [read-only]  [i Details]     │
  │ ☑  Graph context read         [read-only]  [i Details]     │
  │ ☑  Character query            [read-only]  [i Details]     │
  │ ☑  Dice roll                  [read-only]  [i Details]     │
  │ ☑  Session prep bundle        [read-only]  [i Details]     │
  └────────────────────────────────────────────────────────────┘
  ```
  Each tool row: checkbox (enable/disable), tool name (human-readable), capability badge
  ([read-only] or [staged-write] or [direct-write]), and [i Details] that expands an inline
  description row.

  **Connected agents section** (below baseline, labeled "AI agents"):
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ AI AGENTS                              [+ Attach agent]    │
  │ ─────────────────────────────────────────────────────────  │
  │ ● Claude (web)  [strict_review ▾]  [Tool allowlist]  [···] │
  │ ○ Local model   [disabled ▾]       [Tool allowlist]  [···] │
  │ ─────────────────────────────────────────────────────────  │
  │ [View audit log →]                                         │
  └────────────────────────────────────────────────────────────┘
  ```
  - Agent status dot: green (connected), grey (disconnected/disabled)
  - Policy mode selector: dropdown with options `disabled`, `strict_review`, `balanced`,
    `trusted_direct` — each option labeled with a one-line description (see §6)
  - [Tool allowlist]: opens a secondary panel listing all tools this agent is allowed to invoke;
    checkboxes per tool
  - [···]: context menu with "Rename", "Remove agent", "View agent audit log"
  - Default policy for any newly connected agent: `strict_review`

  **Pending staged changes** (shown if any exist, as a banner above the agent list):
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ ⏳ 3 staged changes pending review  [Review now →]         │
  └────────────────────────────────────────────────────────────┘
  ```

- **States:** (see §6 Component Spec for full state matrix)
- **Platform profiles:**
  - Desktop: panel is a full settings page in the sidebar layout (min-width 480 px content area)
  - Tablet: panel is a full-screen sheet
  - Mobile: panel is a drill-down screen; agent rows are full-width tappable rows; policy mode
    selector is a full-screen action sheet on tap
- **Input:** pointer (click checkboxes, dropdowns, buttons), touch (≥44×44 px targets), keyboard
  (Tab through all controls; Space to toggle checkboxes; Enter to open dropdowns)
- **Accessibility:** Panel is a `role="region"` with `aria-label="AI & Tools settings"`. Checkboxes
  are `role="checkbox"` with `aria-describedby` pointing to tool description. Policy mode selector
  is a `<select>` or custom listbox with full keyboard support. Status changes announced via
  `aria-live="polite"`.
- **Acceptance criteria:**
  - Given the DM opens Settings → AI & Tools, when the panel renders, then all baseline tools are
    listed as checkboxes with capability badges, and connected agents are listed with their current
    policy mode.
  - Given the DM changes an agent's policy mode, when the agent invokes a tool next, then the new
    policy is enforced (verified in the audit log, not just the UI display).
  - Given a new agent connects with no existing policy, when it appears in the agent list, then its
    policy mode is shown as `strict_review`.
  - Given staged changes are pending, when the DM opens Settings → AI & Tools, then the pending
    banner is visible above the agent list.
- **Priority:** Must-have

---

### UX-MCP-005 — AI agent attachment flow

- **Requirement:** The [+ Attach agent] flow must guide the DM through connecting a new AI
  provider (web or local) in ≤ 4 steps, with clear trust-scope disclosure before any tool access
  is granted.
- **Rationale:** `MCP-011` requires authenticated actor mapping before any tool access; `MCP-009`
  requires per-agent policy configuration at setup. PAIR recommends anchoring expectations early [3].
- **Spec:**
  - Step 1 — Provider type: "Web AI (Claude, GPT, Gemini, custom endpoint)" | "Local model
    (detected: [list] | none detected)". Each option shows a description and capability note.
  - Step 2 — Connection details: API key field (for web) or model selection dropdown (for local).
    Label: "Your key is stored locally on this device and never sent to DND Tools servers." A [Test
    connection] button verifies the key/connection and shows a ✓ or error inline.
  - Step 3 — Trust & policy: "What can this agent do?" Policy mode selector (default:
    `strict_review`), labeled with the human-readable description of each mode. Tool allowlist
    checkbox group (default: all baseline read tools checked; write tools unchecked). A
    summary sentence auto-updates: "This agent can read vault data and suggest changes for your
    review. It cannot write directly."
  - Step 4 — Name and confirm: Agent name field (pre-filled with provider name). [Connect agent]
    primary button. Summary of settings. On success: toast "Claude connected (strict review mode)".
  - The flow is a focused multi-step sheet/modal, not inline in the settings panel. Step progress
    is shown as a 4-step indicator at the top. Each step has a [Back] and [Next] or [Connect] button.
  - Cancelling at any step does not create a partial agent record.
- **States:** Step 1 → 2 → 3 → 4 → Connected | Error (inline per-step)
- **Platform profiles:**
  - Desktop: flow is a 480-px-wide dialog centered on screen
  - Tablet: flow is a full-screen sheet
  - Mobile: flow is a multi-step drill-down within Settings; each step is a full screen
- **Input:** pointer, touch (≥44×44 px targets), keyboard (Tab through fields; Enter to advance;
  Escape to cancel)
- **Accessibility:** Dialog `role="dialog"`, `aria-labelledby` pointing to the step heading.
  Progress indicator has `aria-label="Step N of 4"`. Error states use `role="alert"`.
- **Acceptance criteria:**
  - Given the DM completes all 4 steps and clicks Connect, when the agent appears in the list, then
    its policy mode matches the selection made in step 3.
  - Given the DM cancels at step 3, when Settings renders, then no new agent record exists.
  - Given a web API key is invalid, when [Test connection] is clicked, then an inline error appears
    within 5 s identifying the problem (invalid key, network unreachable, etc.) and the DM cannot
    advance to step 3 until a valid connection is established.
- **Priority:** Should-have

---

### UX-MCP-006 — AI content provenance badge and detail popover

- **Requirement:** Every piece of content that was generated or materially modified by AI must
  carry a persistent, visually distinct provenance badge that opens a detail popover on
  click/tap, showing the tool used, the context data referenced, and the agent identity.
- **Rationale:** HAX G4 (show contextual information) [1]; Apple HIG transparency principle [2];
  PAIR provenance recommendation [3]; Adobe C2PA pattern [9]. Hiding AI origin is an anti-pattern
  (see §10).
- **Spec:**
  - **Badge anatomy:** A 20×20 CSS px spark/wand icon in `color: var(--color-ai-badge)` (muted,
    low-contrast against editor background; does not compete with text). Positioned at the top-right
    corner of the generated block (paragraph, list, heading) or inline immediately after generated
    inline text. Badge never overlaps text — it is placed in the margin or in a 4 px gap after the
    last character.
  - **Badge label (screen-reader only):** `aria-label="AI-generated content — tap for details"`.
  - **Detail popover** (on click/tap of badge):
    ```
    ┌────────────────────────────────────┐
    │ ✦ AI-assisted content              │
    │ ───────────────────────────────── │
    │ Tool:    Inline writing assistant  │
    │ Agent:   Claude (web)              │
    │ Context: Session 7 notes,          │
    │          Aldric's backstory        │
    │ Date:    2026-06-07 14:32          │
    │ ───────────────────────────────── │
    │ [Edit content]  [Remove badge]     │
    └────────────────────────────────────┘
    ```
  - [Remove badge]: removes the provenance marker (the content remains); requires confirmation
    "Remove AI provenance marker? The content will not change." This is an escape hatch for users
    who have fully reworked AI content; not a way to hide AI origin while keeping the content.
  - The badge persists on content that is subsequently edited by a human, but if the user edits
    more than 50% of the content block (by character count), the badge auto-upgrades to
    "AI-assisted" (was "AI-generated"), with the edit date recorded.
  - "AI-generated" vs "AI-assisted" distinction: generated = AI authored from scratch; assisted =
    AI suggested and human edited.
- **States:** Default (badge visible), Popover open, Removed (badge absent; content intact)
- **Platform profiles:**
  - Desktop/Tablet: badge in paragraph margin; popover anchored to badge
  - Mobile: badge inline after content; tapping badge opens a bottom sheet with the same detail
    content
- **Input:** pointer (click badge), touch (tap badge, ≥44×44 px tap zone centered on badge),
  keyboard (badge focusable with Tab; Enter to open popover; Escape to close)
- **Accessibility:** Badge is `role="button"`, focusable. Popover is `role="tooltip"` or
  `role="dialog"` depending on whether it contains interactive elements (it does: Edit, Remove).
  Use `role="dialog"`, `aria-label="AI content provenance"`. Focus moves into popover on open;
  Escape returns focus to badge.
- **Acceptance criteria:**
  - Given the user accepts an AI-generated paragraph, when the editor renders, then a provenance
    badge is visible in the paragraph margin and is focusable via keyboard.
  - Given the user opens the provenance popover, when the popover renders, then it shows the tool
    name, agent identity, context sources, and date — with no hidden content exposed.
  - Given the user clicks [Remove badge] and confirms, when the editor renders, then the badge is
    absent and the content is unchanged.
  - Given AI is disabled, when the editor renders, then existing provenance badges on prior
    AI-generated content remain visible (provenance is historical record, not AI-dependent).
- **Priority:** Must-have

---

### UX-MCP-007 — Staged-write review panel

- **Requirement:** When AI write tools operate in `strict_review` or `balanced` mode, proposed
  changes must be queued as staged entries in a review panel. The DM must be able to review,
  edit, approve, or reject each entry before any durable write occurs.
- **Rationale:** `MCP-003` is a Must-have contract. HAX G14 (notify users about changes) and
  Cursor's diff-style presentation [1][5] define the correct interaction model. Staged writes are
  the primary safety mechanism against AI-caused data corruption.
- **Spec:**
  - **Notification:** A persistent badge on the Settings icon in the global nav (and on the
    Settings → AI & Tools entry) showing "N pending" when staged changes exist. The badge uses the
    `--color-status-warning` token and is always visible until all entries are resolved.
  - **Panel access:** Settings → AI & Tools → "Review staged changes" — or from the notification
    badge directly ("Review now →"). Opens a full-width panel (Desktop: as a settings sub-page;
    Tablet/Mobile: as a full-screen sheet).
  - **Entry anatomy** (one entry per staged operation):
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │ [staged-write]  Create note: "The Withered Oak"             │
    │ Agent: Claude · Policy: strict_review · 2026-06-07 14:41   │
    │ ─────────────────────────────────────────────────────────── │
    │ + Title: The Withered Oak                                   │
    │ + Tags: #location #cursed                                   │
    │ + Content: (7 lines — Show diff ▾)                         │
    │ ─────────────────────────────────────────────────────────── │
    │ [Approve]    [Edit then approve]    [Reject]                │
    └─────────────────────────────────────────────────────────────┘
    ```
  - For multi-entity batch entries (`balanced` mode): a batch header shows "Batch: N changes" with
    [Approve all] [Reject all] and an expand control to review individual entries.
  - [Edit then approve]: opens the staged data in the relevant editor (note editor, character sheet,
    etc.) with a banner "Editing staged write — approve to commit". The staged entry updates to
    reflect the edits; the user then approves from within the editor or from the panel.
  - "Show diff" expansion shows a diff view (red/green) of the exact vault state change, not just
    the proposed content.
  - Approving: the staged entry is committed via the Processing Core (validation still runs);
    success removes the entry from the panel; failure shows an inline error with "Retry" or
    "Reject".
  - Rejecting: the staged entry is discarded; no vault state change; entry removed from panel.
  - The panel shows an empty state "No pending changes — your vault is up to date" when all entries
    are resolved.
- **States:** Panel empty / Panel with N entries / Entry: pending / approved / editing / rejected /
  error
- **Platform profiles:**
  - Desktop: panel as settings sub-page, full diff view
  - Tablet: full-screen sheet, full diff view
  - Mobile: full-screen drill-down; diff view as before/after tabs (not side-by-side)
- **Input:** pointer, touch (≥44×44 px), keyboard (Tab through entries; Enter to approve focused
  entry; R to reject focused entry; E to edit; full keyboard in diff review)
- **Accessibility:** Panel is a `role="region"` with `aria-label="Staged changes for review"`.
  Each entry is an `article`. Approval/rejection announced via `aria-live="assertive"` ("Change
  approved." / "Change rejected."). Badge on nav icon uses `aria-label="AI & Tools, N pending
  changes"`.
- **Acceptance criteria:**
  - Given an AI write tool proposes a new note in `strict_review` mode, when the proposal is made,
    then a staged entry appears in the panel and the notification badge shows "1 pending" — with no
    note created in the vault.
  - Given the DM clicks Reject on a staged entry, when the panel re-renders, then the entry is
    absent and no vault state change has occurred.
  - Given the DM approves a staged entry, when the Processing Core validates it, and validation
    fails, then the entry remains in the panel with an inline error and the vault is unchanged.
  - Given no staged entries exist, when the panel is open, then the empty state is displayed with
    no "N pending" badge in the nav.
- **Priority:** Must-have

---

### UX-MCP-008 — AI output formatting and response envelope presentation

- **Requirement:** AI and MCP tool outputs displayed to the user must follow a consistent
  presentation layer that maps to the structured response envelope defined in `MCP-010`. Warnings,
  source citations, and error remediation must be visually separated and consistently styled.
- **Rationale:** `MCP-010` (structured envelopes); `MCP-006` (source-cited context packages).
  Consistent output formatting is a baseline for trust and learnability [1][3].
- **Spec:**
  - **Standard output card** (for semantic bundle results, session prep, recap, etc.):
    ```
    ┌──────────────────────────────────────────────────────┐
    │ ✦ Session Prep Bundle        [Copy] [Export] [Close] │
    │ ─────────────────────────────────────────────────── │
    │ [Summary text — formatted prose, max 600 chars]      │
    │ ─────────────────────────────────────────────────── │
    │ Sources (3)                                    [▾]  │
    │  • Session 7 notes (§ "The bridge ambush")           │
    │  • Aldric's backstory (§ "Early life")               │
    │  • Campaign timeline (2026-05-15)                    │
    │ ─────────────────────────────────────────────────── │
    │ ⚠ Warning: 2 hidden items omitted (DM-only)         │
    └──────────────────────────────────────────────────────┘
    ```
  - Summary section: prose, never raw JSON or markdown code blocks; max visible 600 chars with
    "Show more" expand.
  - Sources section: collapsed by default; each source is a link that navigates to the source
    content when clicked.
  - Warnings section: only shown if warnings exist; uses `--color-status-warning` background chip;
    never exposes the content of hidden items — only count and type.
  - Error envelope display:
    ```
    ┌──────────────────────────────────────────────────────┐
    │ ✕ Tool failed: vault-summary-read                    │
    │ ─────────────────────────────────────────────────── │
    │ The vault index is rebuilding. Try again in 30 s.    │
    │ ─────────────────────────────────────────────────── │
    │ [Retry]  [Report issue]                              │
    └──────────────────────────────────────────────────────┘
    ```
  - No raw stack traces, internal IDs, or hidden-content references in any user-facing error.
  - The output card component is the same across all tool output surfaces (inline editor, command
    palette results, the staged-write review panel).
- **States:** Loading (skeleton with shimmer) / Streaming (progressive content reveal) / Complete /
  Warning (with warning chip) / Error (with retry)
- **Platform profiles:**
  - Desktop/Tablet: output card max-width 640 px, centered or right-rail anchored depending on
    surface
  - Mobile: output card full-width; sources section collapsed; actions in a bottom bar
- **Input:** pointer, touch, keyboard (Tab through interactive elements in the card; Enter to
  activate; Escape to close)
- **Accessibility:** Output card is `role="region"` or `role="dialog"` (when modal). Streaming
  content announced once on completion via `aria-live="polite"`. Warning chip has `role="alert"`.
  Error card has `role="alert"` and `aria-live="assertive"`. All source links have descriptive
  `aria-label` values.
- **Acceptance criteria:**
  - Given an MCP tool returns a successful response with warnings, when the output card renders,
    then warnings appear in the warning section, not mixed into the summary text.
  - Given an MCP tool returns an error, when the error card renders, then it contains no hidden
    vault content, no raw stack traces, and at least one actionable button (Retry or Dismiss).
  - Given an MCP tool returns source citations, when the Sources section is expanded, then each
    source is a navigable link to the source content.
- **Priority:** Should-have

---

### UX-MCP-009 — Streaming feedback and stop control

- **Requirement:** During any AI generation or MCP tool execution, the user must receive
  real-time streaming feedback and a reachable Stop control that halts generation within one
  rendering frame.
- **Rationale:** OpenAI/ChatGPT streaming UX establishes the blinking-cursor + stop-button standard
  [10]. HAX G7 (efficient correction) requires that the user can abort a clearly wrong generation
  immediately [1]. Long-running tool calls with no feedback violate the 100 ms acknowledgment
  principle (§ Overview §2).
- **Spec:**
  - **Streaming indicator:** A blinking cursor appended to the end of streaming text (same visual
    as the editor caret, distinguished by the AI suggestion color token). For non-text tool
    execution (bundle generation, entity extraction), a compact progress chip:
    `[⟳ Generating session prep…]` with a cancel × button, appearing in the surface where the
    result will land.
  - **Stop button:** A [■ Stop] button (32×32 CSS px minimum; label "Stop generating") appears:
    - Inline, below the ghost text or streaming card, in the editor surface
    - In the progress chip, as the × cancel action
    - In the command palette output area, below the streaming result
    - It is never hidden, scrolled out of view, or obscured by other UI. If the surface scrolls
      during generation, the Stop button is sticky to the bottom of the visible generation area.
  - On Stop: generation halts; partial result remains visible with a "Generation stopped" notice
    and [Accept partial] [Discard] actions.
  - **Latency/cost awareness (peripheral):** A status line below the Stop button during streaming:
    `"Generating… 142 tokens"` — token count only, no cost estimate in the primary surface. Cost
    details are in the AI & Tools audit log. Token count is never shown after generation completes
    (it is a transient signal, not persistent metadata).
  - Timeout: if a tool call receives no response within 30 s, auto-display an error card with Retry.
- **States:** Idle / Streaming (blinking cursor, stop visible, token count) / Stopped (partial
  result, Accept/Discard) / Complete / Error (timeout or failure)
- **Platform profiles:**
  - Desktop: Stop button inline below generation area; token count in small muted text
  - Tablet: Stop button in sheet footer; token count in same
  - Mobile: Stop button in floating action bar at bottom; token count adjacent
- **Input:** pointer (click Stop), touch (tap Stop, ≥44×44 px), keyboard (Tab reaches Stop during
  streaming; Space/Enter activates it)
- **Accessibility:** Stop button is always in the Tab order during streaming (not just when visually
  focused). `aria-label="Stop AI generation"`. Partial-result state announced: "Generation stopped.
  Partial result available. Accept or discard."
- **Acceptance criteria:**
  - Given AI generation is streaming, when the user clicks Stop, then streaming halts within one
    rendering frame and the Stop button is replaced by [Accept partial] [Discard].
  - Given AI generation is streaming, when the user navigates by keyboard only, then pressing Tab
    reaches the Stop button without requiring a mouse hover.
  - Given a tool call has not responded in 30 s, when the timeout elapses, then an error card
    appears with a Retry action and no partial content is committed.
- **Priority:** Must-have

---

### UX-MCP-010 — Policy mode labels and human-readable mode descriptions

- **Requirement:** All four MCP policy modes (`disabled`, `strict_review`, `balanced`,
  `trusted_direct`) must be presented to the DM using human-readable labels and one-line
  descriptions wherever the mode appears (tool-config panel, agent attachment flow, audit log).
- **Rationale:** Code-level mode names are opaque to DMs who are not developers. HAX G1 (make
  capabilities clear) requires surface-level clarity [1]. PAIR recommends anchoring expectations
  early [3].
- **Spec:**
  Human-readable mode labels and descriptions (canonical, used everywhere):

  | Mode key | Display label | One-line description |
  |---|---|---|
  | `disabled` | **Off** | This agent cannot access any tools or vault data. |
  | `strict_review` | **Review all** | Every change is staged for your approval before saving. (Default) |
  | `balanced` | **Batch review** | Low-risk reads happen automatically; changes are batched for your review. |
  | `trusted_direct` | **Direct write** | Allowed changes save immediately. Requires your explicit trust. Use with caution. |

  - The `trusted_direct` option is visually distinguished with a warning chip: `⚠ Use with caution`
    adjacent to the option label, using `--color-status-warning` background.
  - The mode selector (dropdown or segmented control) always shows the display label; the one-line
    description appears as `help-text` below the selector (not only in a tooltip).
  - In the audit log, mode is recorded using the mode key but displayed as the display label.
- **States:** N/A (labels are static)
- **Platform profiles:** Identical labels and descriptions on all profiles; only the control type
  varies (dropdown on Desktop/Tablet, full-screen action sheet on Mobile).
- **Input:** pointer (dropdown), touch (action sheet), keyboard (select element or custom listbox
  with arrow-key navigation)
- **Accessibility:** Mode selector is a `<select>` or equivalent ARIA listbox. Help text is
  associated via `aria-describedby`. Warning chip for `trusted_direct` has `role="img"` with
  `aria-label="Caution: trusted_direct mode writes without review"`.
- **Acceptance criteria:**
  - Given the DM opens the agent policy mode selector, when all options are rendered, then each
    option shows its display label and one-line description is visible below the selected option
    without requiring a tooltip hover.
  - Given `trusted_direct` is available as an option, when it is highlighted or selected, then the
    warning chip is visible adjacent to the label.
- **Priority:** Must-have

---

### UX-MCP-011 — AI actor and visibility boundary enforcement in UI

- **Requirement:** AI surfaces must enforce the actor/role visibility boundary at the UI layer:
  no AI-generated or AI-displayed content may reveal DM-hidden content to a player, and no
  AI affordance available to a player may access DM-only data.
- **Rationale:** `MCP-004` and `MCP-011` enforce this at the data layer; UX-MCP-011 ensures the
  UI layer does not create gaps. Principle 8 ("Safe by default") in `00-overview-and-principles.md`
  states the visibility boundary must never leak via navigation, search, errors, or animation.
- **Spec:**
  - AI affordances in player-facing surfaces (character sheet editor, player canvas): inline AI
    trigger is available only for the player's own character content and DM-exposed content.
  - Named-entity extraction (UX-MCP-003) in a player-facing surface: entity chips are drawn only
    from the player's visible content graph; no hidden entity names are suggested.
  - AI error messages in player surfaces: error text is generic ("Something went wrong") and never
    includes entity names, path fragments, or content counts that could reveal hidden information.
  - Provenance badges in player-facing surfaces: context sources listed in the provenance popover
    are filtered to player-visible sources only.
  - The DM's AI tool-config panel (UX-MCP-004) is inaccessible to Player and Observer roles; the
    Settings → AI & Tools route either redirects or shows only the "AI is enabled/disabled"
    read-only status for non-DM actors.
  - Semantic bundle outputs (MCP-006, MCP-013): the UI must display any "N items omitted
    (DM-only)" warning from the response envelope (UX-MCP-008) without disclosing what was omitted.
- **States:** DM view (full AI access) / Player view (scoped AI access) / Observer view (no AI
  affordances — read-only surfaces with no AI trigger)
- **Platform profiles:** Identical enforcement on all profiles; the slim Mobile surface must not
  relax the boundary.
- **Input:** N/A — this requirement governs what is rendered, not how it is interacted with.
- **Accessibility:** Visibility-enforced content produces no audible or visible signal about the
  existence of hidden content (no "N hidden items" counts that reveal hidden structure).
- **Acceptance criteria:**
  - Given a Player opens the editor for their character, when they invoke the inline AI suggestion,
    then the context sources available to the AI are limited to their character data and DM-exposed
    content, as enforced by the Processing Core (MCP-004).
  - Given a Player receives an AI error, when the error message is rendered, then the message
    contains no entity names, path fragments, or content counts from DM-hidden data.
  - Given an Observer is using the app, when they navigate to any route, then no AI trigger or AI
    suggestion affordance is visible.
  - Given a DM-only semantic bundle is generated, when the output card renders in a DM context,
    then the warning section shows only "N items omitted" for hidden content — no hidden entity
    names or details.
- **Priority:** Must-have

---

### UX-MCP-012 — Local AI capability detection and fallback

- **Requirement:** When no local AI model is installed, or when AI is otherwise unavailable,
  every AI-assisted workflow must surface a non-AI fallback that is equally discoverable and
  labeled without implying the non-AI path is inferior.
- **Rationale:** `MCP-008` defines the Must-have non-AI fallback contract. PAIR (graceful
  degradation) [3] and Apple HIG (helpful before impressive) [2] require that fallbacks are not
  "downgraded" states. HAX G8 (anchor in the familiar) — the user's mental model for the workflow
  should not depend on AI being present [1].
- **Spec:**
  - When no AI is configured, the inline AI trigger is absent (not greyed out). The editor toolbar
    shows no placeholder for the sparkle button.
  - When AI is configured but a specific tool is unavailable (e.g., local model not loaded), the
    trigger appears but on invocation shows a compact notice: "AI unavailable right now — use
    [manual option]" with a direct link to the non-AI alternative.
  - Session recap: non-AI recap produces a structured template with headers drawn from session
    metadata (attendees, date, locations visited, combats logged) and blank fill-in sections. The
    template is labeled "Session recap template" — not "AI unavailable". It is always accessible
    from the Session menu regardless of AI state.
  - Named-entity extraction: when AI is off, the entity chip rail is absent. The manual entity
    link affordance (select text → right-click → "Link to entity") remains always available.
  - Session prep bundle: non-AI bundle is a deterministic assembly of pinned notes, open threads
    (from the graph), and character statuses. It is labeled "Session prep summary" — not "Basic
    mode".
  - The "AI not configured" state in the AI & Tools panel shows the [+ Attach agent] button
    prominently, but the panel is fully usable and does not degrade baseline MCP read tool controls.
- **States:** AI enabled + available / AI enabled + unavailable (specific tool) / AI disabled /
  AI not configured
- **Platform profiles:** Identical fallback behavior on all profiles.
- **Input:** N/A (governs rendered state, not interaction)
- **Accessibility:** No "disabled" or "unavailable" ghost buttons for AI triggers; absence is the
  correct state. Manual alternatives are labeled as affirmative options, not fallbacks.
- **Acceptance criteria:**
  - Given no AI model is configured, when the user opens the note editor, then no AI trigger icon
    is visible in the toolbar and no tooltip or placeholder references "AI unavailable."
  - Given AI is configured but the session recap AI tool fails, when the user opens Session →
    Recap, then a deterministic template is shown and the template label does not reference AI.
  - Given no AI is configured, when the user right-clicks selected text in the editor, then
    "Link to entity" appears in the context menu and produces the same result as the AI-assisted
    entity linking flow.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Inline suggestion card

| Aspect | Specification |
|---|---|
| Width | Anchored to selection width (Desktop); full-width (Mobile) |
| Min height | 64 px |
| Background | `--color-surface-overlay` with `--elevation-3` shadow |
| Border radius | `--radius-m` (from `01-visual-design-system.md`) |
| Header | "AI draft — review and edit" — 12 px, `--color-text-tertiary`, `font-weight: 400` |
| Ghost text color | `var(--color-ai-suggestion)` — muted, non-black, non-red |
| Diff: removed text | `background: var(--color-diff-removed)`, strikethrough text decoration |
| Diff: added text | `background: var(--color-diff-added)`, no decoration |
| Action bar height | 40 px, 8 px padding |
| Action button size | 28 px height, `--radius-s` |
| Context disclosure | 12 px, `--color-text-tertiary`, italic |
| Z-index | `--z-overlay` (above editor content, below dialogs) |

**State matrix:**

| State | Visual | Interactive |
|---|---|---|
| Generating | Blinking cursor; Stop button below | Stop: halts streaming |
| Ready (single-line) | Ghost text in editor | Tab: accept; Alt+]: cycle; Esc: reject |
| Ready (multi-line) | Diff card; hunk highlights | Accept all / Reject / Edit / Hunk accept |
| Accepted | Card closes; caret at end of content | Undo available in editor undo stack |
| Rejected | Card closes; caret at original position | No content change |
| Error | Error chip with message | Retry / Dismiss |

### 6.2 Provenance badge

| Aspect | Specification |
|---|---|
| Icon | Sparkle/wand — 16×16 px, SVG, from product icon set |
| Color | `var(--color-ai-badge)` — defined in `01-visual-design-system.md`; must pass 3:1 contrast against editor background (WCAG 1.4.11 non-text contrast) |
| Position | Margin of parent block (4 px from text) — never overlapping text |
| Touch target | 44×44 px centered on badge |
| Popover max-width | 320 px |
| Popover padding | 16 px |
| Popover shadow | `--elevation-4` |

### 6.3 MCP policy mode selector

| Mode | Display label | Warning indicator | Default |
|---|---|---|---|
| `disabled` | Off | None | — |
| `strict_review` | Review all | None | Yes (new agents) |
| `balanced` | Batch review | None | — |
| `trusted_direct` | Direct write | ⚠ warning chip | — |

Selector anatomy:
- Control: `<select>` or custom listbox (`role="listbox"`)
- Help text: one-line description below control, always visible (not tooltip-only)
- For `trusted_direct`: warning chip is `role="img"` `aria-label="Caution"` in gold/amber color
  (`--color-status-warning`)

### 6.4 Staged-write entry

| Aspect | Specification |
|---|---|
| Entry border | Left 4 px solid `--color-ai-staged` (muted amber) |
| Header font | 14 px, `font-weight: 600`, `--color-text-primary` |
| Metadata line | 12 px, `--color-text-tertiary` |
| Diff lines height | Minimum 24 px per line |
| Action bar | 3 buttons: [Approve] primary, [Edit then approve] secondary, [Reject] destructive secondary |
| Reject confirmation | Inline confirmation below entry: "Reject this change? [Confirm reject] [Cancel]" |
| Batch header | Full-width, `--color-surface-secondary` background |

---

## 7. Layout & responsive behavior

### Desktop (≥1024 px)

```
┌───────────────┬────────────────────────────────────┬──────────────┐
│  Global nav   │   Content editor / Canvas          │  Entity rail │
│  sidebar      │                                    │  (AI chips,  │
│               │  [sparkle] toolbar icon            │   sources)   │
│               │                                    │              │
│               │  ...editing content...             │  ✦ Entities  │
│               │                                    │  [Aldric]    │
│               │  [AI draft - review and edit]      │  [Thornwall] │
│               │  +added text green                 │              │
│               │  -removed text red                 │              │
│               │  [Accept all][Reject][Edit hunk]   │              │
│               │  Based on: Session 7, Aldric bg    │              │
│               │  [■ Stop] 142 tokens               │              │
│               │                                    │              │
└───────────────┴────────────────────────────────────┴──────────────┘
```

- Settings → AI & Tools occupies the full settings page area (min-width 480 px content column).
- Staged-write review panel occupies the settings sub-page at full content-column width.
- Provenance popover anchors to the badge position in the editor margin.

### Tablet (600–1024 px, landscape)

- Editor occupies the main pane; entity chip rail collapses to a slide-in drawer triggered by a
  toolbar icon (≥44 px target).
- AI suggestion card appears as a bottom sheet (slides up from bottom, 50% screen height).
- MCP tool-config panel is a full-screen sheet.
- Portrait: editor is full-width; AI chips in a collapsible bottom panel.

### Mobile (<600 px)

- Editor is full-screen; toolbar has sparkle icon; tapping it opens an action sheet with the prompt
  input and, after generation, the suggestion (before/after view, not side-by-side diff).
- Entity chips: "N entities detected" badge in toolbar opens a bottom sheet.
- AI & Tools settings is a drill-down screen with per-agent rows that open detail screens.
- All Processing Core commands are identical across profiles; only the presentation changes.

---

## 8. Motion & feedback

| Interaction | Animation | Duration | Easing | `prefers-reduced-motion` fallback |
|---|---|---|---|---|
| AI suggestion card appear | Slide up 8 px + opacity 0→1 | 200 ms | `ease-out` | Instant appear, no slide |
| AI suggestion card dismiss | Slide down 8 px + opacity 1→0 | 150 ms | `ease-in` | Instant disappear |
| Streaming text appear | Character-by-character reveal, no animation | Streaming rate | N/A | Same — no animation |
| Provenance popover open | Opacity 0→1 | 150 ms | `ease-out` | Instant appear |
| Staged-write entry approve | Slide left + opacity 1→0 | 250 ms | `ease-in-out` | Instant remove |
| Staged-write entry reject | Same as approve | 250 ms | `ease-in-out` | Instant remove |
| Progress chip (tool running) | Spinner rotation | Continuous | `linear` | Static "Generating…" text only |
| Entity chip appear | Opacity 0→1 | 150 ms | `ease-out` | Instant appear |
| Entity chip dismiss | Opacity 1→0 | 100 ms | `ease-in` | Instant disappear |

All animations respect the `prefers-reduced-motion: reduce` media query as defined in
`01-visual-design-system.md`. The motion system's standard durations and easing curves are consumed
here; DND Tools' AI surfaces do not invent custom easing.

---

## 9. Accessibility requirements (surface-specific)

Beyond the global `03-accessibility.md` requirements, the AI & MCP surface has the following
specific obligations:

**9.1 AI suggestion focus management.** When the inline suggestion card appears, focus does not
move to it automatically — the user is mid-typing and focus must remain in the editor. The card is
reachable via `Tab` (not forced). When the card is dismissed (Escape or Reject), focus returns to
the editor caret position — not to the top of the editor or the toolbar.

**9.2 Live-region discipline.** AI surfaces must avoid live-region spam. The streaming text
itself must not be a live region (it produces thousands of updates). Only the completion event
("Suggestion ready") and error events are announced via `aria-live="polite"`. The stop-action
partial result state is announced via `aria-live="assertive"` ("Generation stopped. Accept or
discard partial result."). Staged-write approval/rejection is announced assertively.

**9.3 Non-text contrast for AI indicators.** The provenance badge icon, AI suggestion ghost-text
color, and streaming cursor must all meet WCAG 2.2 Success Criterion 1.4.11 (Non-text Contrast)
at a minimum 3:1 ratio against the editor background. The AI suggestion ghost-text color
additionally must not be confused with standard editor text by color-blind users — it is
distinguished by italics, not color alone.

**9.4 Keyboard completeness.** Every AI interaction available by pointer or touch must be
keyboard-operable with explicit, labeled shortcuts:
- Open inline AI: `Ctrl+Shift+A`
- Accept suggestion: `Tab`
- Cycle alternatives: `Alt+]` / `Alt+[`
- Reject / close: `Escape`
- Stop generation: `Tab` reaches Stop button during streaming; `Space` / `Enter` activates
- Dismiss entity chip: `D` key when chip has focus (labeled in chip tooltip)
All shortcuts are discoverable in the keyboard shortcuts help (Settings → Keyboard shortcuts,
cross-referenced with `02-navigation-and-platform-profiles.md`).

**9.5 No motion-only state communication.** The streaming blinking cursor must not be the only
signal that generation is in progress. A text label "Generating…" accompanies it (even if visually
small) so screen readers and reduced-motion users receive the same signal.

**9.6 Player/Observer a11y boundary.** Screen readers must not expose the existence of DM-only
content through `aria-hidden` side effects, tooltip text, or assistive-technology-specific
announcements. All ARIA trees in player-facing surfaces are audited the same way as visual
surfaces.

---

## 10. Anti-patterns & explicit limitations

These are hard limits. Each is researched and reasoned; violating them is a design error, not a
stylistic choice.

**10.1 Auto-applying AI edits without human review.**
AI-generated content must never be committed to the vault without explicit user acceptance. Auto-
apply may seem efficient but transfers editorial control to the system, violating HAX G2 (don't
surprise users) and G14 (notify users about changes) [1]. Cursor's failed "auto-accept" mode
(community-reported) and early Copilot ghost-text that was accidentally committed by novice users
are concrete examples of this failure. In DND Tools, world-building content is irreplaceable and
user-authored; silent AI writes are a data-integrity risk. MCP-003 enforces this at the data
layer; the UI must reinforce it by never providing an "always auto-accept" preference.

**10.2 Hiding provenance (unmarked AI content).**
Content with AI origin must always carry a provenance badge. Hiding the origin — even if the
content is excellent — degrades the user's ability to evaluate and trust it. The C2PA / Adobe CAI
research [9] and HAX G4 show that provenance transparency increases productive use of AI output.
In a collaborative campaign context, other DMs or players encountering the content need to know
its origin. There is no "clean content" mode that removes provenance markers without the user's
explicit, per-block action.

**10.3 AI as a required path (AI blocking).**
No workflow that was achievable without AI in v1 may require AI in v2. The "AI off" state is not
a degraded mode — it is a first-class product state. Graying out or hiding non-AI alternatives
while AI features are foregrounded is a dark pattern. PAIR's graceful degradation principle [3]
and MCP-001/MCP-008 define this contractually. The UI must never render an AI-gated affordance
without an equally visible non-AI alternative.

**10.4 AI owning graph intelligence or relationship scoring.**
Algorithms own graph relationship scoring, link scoring, content recommendations, and sync
conflict resolution. AI may present or explain deterministic findings but must not replace the
deterministic system. The vision brief is explicit: "Algorithmic approaches (not AI) should be
the primary engine for suggestions, graph intelligence, relationship scoring, and content
recommendations. AI supplements algorithms; algorithms are not replaced by AI." Implementing
AI-based graph scoring — even experimentally — conflicts with this contract and with MCP-007.

**10.5 Leaking hidden content via AI output.**
If a DM marks a location or NPC as player-hidden, the AI must never mention, allude to, or include
aggregate counts of that content in any player-facing output. The error from an AI tool call that
involves hidden content must also not reveal the hidden content. This is enforced at the data layer
(MCP-004, MCP-011) but the UI must not create gaps: provenance popovers, entity chips, and error
messages in player surfaces are all audited for information leakage. Principle 8 in the overview
document is absolute: "The DM/player visibility boundary is enforced and must never leak hidden
content through navigation, search, errors, or animation."

**10.6 Over-promising AI capabilities (AI confidence theater).**
Presenting AI output as authoritative (e.g., "This is the most likely next session hook") rather
than provisional ("AI draft — review and edit") erodes trust when the AI is wrong. Apple HIG [2]
and PAIR [3] both identify overconfidence framing as the most damaging trust failure mode. All AI
output microcopy in DND Tools frames suggestions as drafts and proposals, never as facts or
recommendations with implied authority.

**10.7 `trusted_direct` as the default or promotional mode.**
The `trusted_direct` policy mode allows AI writes without staged review. It must never be the
default, must never be promoted in onboarding, and must carry a visible caution indicator wherever
it appears. Defaulting to direct write on a new agent connection is a data-safety anti-pattern:
even well-intentioned AI can produce incorrect content at scale, and batch recovery from direct
writes without an undo chain is difficult. The default is `strict_review` (MCP-009).

**10.8 Dark patterns in AI upsell.**
The AI & Tools panel must not use urgency, scarcity, or social proof patterns to encourage agent
connection or `trusted_direct` mode. There are no "AI insights available — upgrade to unlock"
banners, no "97% of DMs use AI writing help" claims, and no countdown timers on AI feature trials.
The panel is a configuration surface, not a marketing surface.

**10.9 Open-ended chatbot interface in the editor.**
The inline AI tool is bounded to creative text assistance, narrative suggestions, and named-entity
extraction — not an open-ended chatbot. An unrestricted chat interface in the editor would
encourage users to ask AI for graph intelligence, permission decisions, or sync conflict resolution,
all of which AI must not own (MCP-007). Keeping the trigger narrow (selection-contextual, prompt-
constrained) enforces the boundary at the UX layer before it needs to be enforced at the API layer.

**10.10 Token count or cost as primary UX signal.**
Showing token cost prominently in the editor surface creates anxiety and changes the user's
behavior in counterproductive ways (users shorten their content, avoid good prompts). OpenAI's own
design separates cost visibility from the generation surface [10]. In DND Tools, token count is a
transient streaming signal (peripheral, small, muted) and cost details live in the audit log.
Cost-aware design is an operator (admin) concern, not a per-session DM concern.

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| AI disable → no broken workflows | 100% of core workflows complete without AI | Automated: run core-workflow test suite with `FEATURE_AI=false`; zero failures |
| AI suggestion accept rate | ≥ 40% of generated suggestions accepted or edited (not rejected outright) | Product analytics on accept/edit/reject events |
| Inline suggestion acknowledgment | < 100 ms from trigger to generation start indicator | Performance trace; blinking cursor or spinner appears within 100 ms |
| Stop control discoverability | ≥ 90% of users who want to stop can stop without instruction | Usability test task: "stop an in-progress AI generation" — success rate |
| Staged-write review completion | ≥ 95% of staged entries resolved (approved or rejected) within the session | Analytics: ratio of resolved to abandoned staged entries |
| Provenance badge interaction | ≥ 60% of users who click a provenance badge do so intentionally (not accidental) | Usability test: click-intent ratio on provenance badges vs. surrounding content |
| AI tool-config panel discoverability | ≥ 80% tree-test success finding "disable a specific MCP tool" | Tree-test via unmoderated remote test |
| Visibility boundary integrity | 0 incidents of hidden content surfaced in player AI output | Security/QA: automated test with DM-hidden entities in AI context |
| AI error recovery | ≥ 85% of AI errors resolved by Retry or Dismiss without user abandoning the workflow | Analytics: error-to-resolution ratio |
| Accessibility (AI surfaces) | 0 axe critical violations; 100% keyboard task completion for AI interaction tasks | Automated axe scan + keyboard-only user test covering all UX-MCP requirements |

---

## 12. Open questions & risks

**12.1 Provenance badge on sync-merged content.** If two collaborators both accept AI
suggestions on the same note and sync merges them, the provenance badge must survive the merge.
The sync conflict model (`12-sync-offline-reliability.md`) needs to specify whether provenance
metadata is preserved in the merge CRDT or treated as user-authored annotation. If it is lost in
merge, the badge cannot be reliable as a historical record — an important trust gap.

**12.2 Observer role and AI affordances.** This document specifies that Observers have no AI
affordances. However, an Observer may need AI-generated session summaries (e.g., a player who
joined late). Whether a read-only AI summary surface is appropriate for Observers, and how it
interacts with the visibility boundary, is unresolved. A future requirement should define a
"summary view" role scoped to player-visible content.

**12.3 Local model capability variance.** The capability detection requirement (UX-MCP-012)
assumes the app can query a local model for its context window and capability set. If a locally
installed model does not expose a standard capability API, the detection layer cannot reliably
determine which AI features are available. This needs a defined protocol between the local model
adapter and the Processing Core before the attachment flow (UX-MCP-005) can be fully specified.

**12.4 Entity chip debounce and extraction cost.** The 2 s debounce on named-entity extraction
(UX-MCP-003) is a UX estimate; the actual debounce should be informed by the latency of the
extraction tool call. If a local model is used for extraction and its latency is 5–10 s, the 2 s
debounce triggers calls that cannot complete before the next debounce fires. This needs to be
coordinated with the core extraction architecture.

**12.5 Undo and AI edits across collaborative sessions.** If a DM accepts an AI suggestion in a
live session and another player has already built on that content (in their own canvas widget),
the DM's undo of the AI edit may create a conflict. The undo model for AI-accepted content in
multi-user sessions is not yet specified and may require special handling in the CRDT layer.

**12.6 `trusted_direct` audit log UX.** The audit log for `trusted_direct` writes is referenced
in UX-MCP-004 and MCP-011 but not specified in detail. A follow-on document or appendix to this
one should define the audit log surface: columns, filtering, export, retention, and whether the
DM can surface the audit log as a canvas widget.

---

## Sources

[1] Microsoft HAX Toolkit — Guidelines for Human-AI Interaction (18 guidelines across four
phases: Initially, During Interaction, When Wrong, Over Time) — Microsoft Research —
https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/

[2] Apple Human Interface Guidelines — Machine Learning / Writing Tools (Generative AI) —
Apple Developer Documentation —
https://developer.apple.com/design/human-interface-guidelines/writing-tools

[3] Google PAIR People+AI Guidebook — Chapters: "Setting user expectations", "Feedback &
correction", "Errors + graceful degradation", "Explainability & trust" — Google —
https://pair.withgoogle.com/guidebook

[4] GitHub Copilot — Inline suggestions: accepting, cycling, partial word acceptance — GitHub
Docs —
https://docs.github.com/en/copilot/using-github-copilot/getting-code-suggestions-in-your-ide-with-github-copilot

[5] Cursor Tab — Diff-style multi-line suggestion, hunk-level accept — Cursor Docs —
https://docs.cursor.com/tab/overview

[6] Notion AI — Floating toolbar, Replace / Insert below / Discard / Try again — Notion —
https://www.notion.so/product/ai

[7] Linear — "Write with AI" in issue descriptions; streaming into field; undo affordance —
Linear Changelog 2023 —
https://linear.app/changelog/2023-06-ai-powered-issue-writing

[8] Raycast AI — Global shortcut, compact popover, action buttons — Raycast —
https://www.raycast.com/features/ai

[9] Adobe Content Authenticity Initiative / C2PA — Provenance badge, content credentials
manifest, origin disclosure overlay — Content Authenticity Initiative —
https://contentauthenticity.org/how-it-works

[10] OpenAI ChatGPT streaming UX — Blinking cursor during generation, "Stop generating" button,
developer-console token count — OpenAI —
https://openai.com/chatgpt
