# DND Tools 0.2.0 — UX/UI Requirements Package

> **Read this first.** It defines the design intent, the quality bar, the parameter rubric every
> surface is measured against, the platform profiles, the requirement-ID scheme, and how this
> package relates to the functional requirements. Each sibling document then specifies one major
> UI surface in depth.

---

## 0. Why this package exists

The 0.1 product proved the *feature set* but its UX was, by the product owner's own assessment, the
wrong paradigm and poorly executed. 0.2.0 is a **canvas-first command platform for tabletop RPG
play** (see `../00-vision-brief.md`). The functional requirements in `../requirements/` define
*what the system must do*. **This package defines how it must look, feel, and behave** — so that the
delivered product is visually excellent, learnable without a manual, fast under table pressure, fully
accessible, and adaptive across desktop, tablet, and mobile.

These documents are **requirements, not suggestions.** They are written to be testable and to be
handed to an implementer (human or agent) who is not a UX expert and must still ship something
correct. Where a sibling functional requirement and a UX requirement appear to conflict, the
conflict must be raised and resolved explicitly — never silently.

### Relationship to existing documents

| Document | Role | This package… |
|---|---|---|
| `../00-vision-brief.md` | Canonical product intent | …obeys it. |
| `../requirements/*` (19 domains, ~245 reqs) | Functional contract (what) | …adds the UX/UI contract (how) per domain. |
| `../../development/UX_GUIDELINES.md` | Thin, v1 (document-editor) era | …**supersedes** it for v2. |
| `../../../deep-research-report.md` | Generic cross-platform UX research | …is the *generic* input; this package is the *product-specific* output. |
| `../../development/ACCESSIBILITY.md` | v1 a11y baseline + QA harness | …extends it into v2 surface-level a11y. |

---

## 1. North-star design principles (non-negotiable)

These ten principles bind every surface. A design that violates one is wrong, regardless of how it
looks.

1. **Canvas-first, not document-first.** The spatial workspace (Scene) and the Command Center are
   home. Everything composes into it as widgets. Do not recreate the v1 "notes list as home."
2. **The table is the context.** The primary use is *live play under time pressure*. Optimize the
   hot paths (find a stat, advance initiative, reveal a map, push a handout) for speed, glanceability,
   and zero-surprise. Authoring/prep paths can be richer and slower.
3. **Information scent over memory.** Users choose paths from label and cue quality. Prefer
   recognition over recall; never hide primary navigation on large screens; label by user mental
   model, not internal taxonomy.
4. **Progressive disclosure.** Default surfaces are simple; power lives one layer down (menus,
   advanced panels, "More"). Complexity is opt-in, never the first impression.
5. **One IA, many surfaces.** Keep concepts and information architecture identical across platform
   profiles; change only the *presentation* (sidebar ↔ tab bar ↔ sheet). Never re-architect the IA
   per device.
6. **Effective emphasis.** Exactly one primary action/object per screen region. Establish hierarchy
   with scale, weight, contrast, spacing, and position — not with color alone, and never by shouting
   everywhere.
7. **Feedback within 100 ms; never a dead click.** Every action acknowledges immediately. Long work
   shows determinate progress or skeletons that match the eventual layout. State (saved/syncing/
   offline/error) is always visible, never inferred.
8. **Safe by default.** Destructive actions confirm and are reversible (undo / trash) unless the user
   explicitly chooses permanent. The DM/player visibility boundary is enforced and **must never leak**
   hidden content through navigation, search, errors, or animation.
9. **Accessible is the baseline, not a mode.** WCAG 2.2 AA is the floor for every surface. Full
   keyboard operation, visible focus, reduced-motion support, and adequate target sizes are
   acceptance criteria, not nice-to-haves.
10. **Calm, legible, genre-appropriate.** The aesthetic should feel like a premium tool for a fantasy
    hobby — atmospheric and characterful, but never at the expense of legibility, contrast, or speed.
    Theme is chrome; content is king.

---

## 2. The parameter rubric

The product owner named the qualities this redesign must maximize. Every surface document addresses
**all** of them in its "UX goals" table. They are defined here with a measurable lens so they can be
reviewed, not just asserted.

| Parameter | Definition | How we measure it |
|---|---|---|
| **Visual appeal** | First-impression quality, polish, aesthetic coherence, genre fit. | Consistent token use; spacing rhythm; no orphaned styles; "looks designed, not assembled" review. |
| **Information scent** | Strength of cues that tell users where a path leads. | Tree-test findability ≥ 80% on core tasks; label clarity; predictable placement. |
| **Navigability** | Ease of moving between and within areas and getting "back". | ≤ 3 steps to any primary destination; back/forward + deep links intact; command palette parity. |
| **Intuition / learnability** | First-run users succeed without instruction. | Time-to-first-value; first-task success without help; empty states teach. |
| **Accessibility** | Usable by keyboard, AT, low-vision, motor- and motion-sensitive users. | WCAG 2.2 AA pass; axe 0 criticals; keyboard-only task completion. |
| **Adaptability** | Quality across desktop/tablet/mobile and input modalities. | Same command + result on all profiles; no horizontal scroll; touch targets met. |
| **Effective emphasis** | The right thing stands out at the right time. | One primary per region; hierarchy survives squint test & grayscale test. |
| **Feedback & responsiveness** | The system always tells you what's happening. | ≤ 100 ms acknowledgment; visible save/sync/offline/error states. |
| **Error prevention & recovery** | Hard to make mistakes; easy to undo them. | Confirms on destructive; undo available; inline, actionable errors. |
| **Consistency** | Same thing looks/behaves the same everywhere. | Shared tokens/components; one pattern per problem. |

---

## 3. Platform profiles (binding definitions)

Per the vision, this is **not "responsive design"** — it is **distinct GUI surfaces driven by one
processing core** (`PLAT` requirements). Layout breakpoints are a coarse signal; the *profile* is the
real contract. All surface docs use these names.

| Profile | Trigger (guidance) | Primary input | Global nav surface | Density |
|---|---|---|---|---|
| **Desktop** | ≥ 1024px width, pointer + keyboard | Mouse/trackpad + keyboard (first-class shortcuts) | Persistent sidebar / rail + top bar | Comfortable→dense, user-adjustable |
| **Tablet** | ~600–1024px, touch + optional keyboard | Touch first, pointer/keyboard optional | Collapsible rail or tab bar; split-view on landscape | Comfortable, ≥44px targets |
| **Mobile** | < 600px, touch | Touch + virtual keyboard | Bottom tab bar + sheets/drawers | Focused, single primary pane, ≥44px targets |

Cross-profile rules (binding):
- **Same command, same result.** A Must-have capability available on desktop must be reachable on
  mobile via the *same processing-core command*, even if the surface is a focused/`slim` variant.
- **Never gesture-only or drag-only.** Every gesture/drag has a discrete (tap/click/keyboard)
  alternative (WCAG 2.2 §2.5.7).
- **Single primary pane on small screens;** reveal secondary panes (filters, details, layers,
  related) progressively on larger ones.
- **Honor the input, not the OS.** Assume users switch input modes on the same device (touch +
  keyboard on tablets, touch + mouse on 2-in-1s).

---

## 4. Requirement-ID scheme

UX requirements use the prefix **`UX-`** plus the domain code, mirroring the functional codes so
traceability is trivial. Example: `UX-CANVAS-004` is a UX requirement that complements functional
`CANVAS-004`. Foundation domains add new codes (`VIS`, `ONB`).

Every requirement carries a **Priority**: `Must-have` (required for the v2 promise / a contract /
the a11y or safety floor), `Should-have`, or `Could-have` — same semantics as the functional set.

Acceptance criteria are **binary Given/When/Then** checks, so a reviewer or test can pass/fail them.

---

## 5. Package map

| # | Document | Domain code | Complements functional |
|---|---|---|---|
| 00 | `00-overview-and-principles.md` | — | (this file) |
| 01 | `01-visual-design-system.md` | `UX-VIS` | cross-cutting; `A11Y`, `PLAT` |
| 02 | `02-navigation-and-platform-profiles.md` | `UX-NAV` | `NAV`, `PLAT` |
| 03 | `03-accessibility.md` | `UX-A11Y` | `A11Y` |
| 04 | `04-canvas-scene-widgets.md` | `UX-CANVAS` | `CANVAS` |
| 05 | `05-command-center.md` | `UX-CMD` | `CMD` |
| 06 | `06-maps.md` | `UX-MAP` | `MAP` |
| 07 | `07-characters.md` | `UX-CHAR` | `CHAR` |
| 08 | `08-sessions-live-play.md` | `UX-SES` | `SES` |
| 09 | `09-content-authoring-and-sources.md` | `UX-CONTENT` | `CONTENT` |
| 10 | `10-graph-search-discovery.md` | `UX-GRAPH`, `UX-SRCH` | `GRAPH`, `SRCH` |
| 11 | `11-collaboration-permissions.md` | `UX-COLLAB`, `UX-PERM` | `COLLAB`, `PERM` |
| 12 | `12-sync-offline-reliability.md` | `UX-SYNC` | `SYNC` |
| 13 | `13-audio-atmosphere.md` | `UX-AUDIO` | `AUDIO` |
| 14 | `14-ai-mcp.md` | `UX-MCP` | `MCP` |
| 15 | `15-onboarding-learnability.md` | `UX-ONB` | cross-cutting; `NAV`, `CONTENT` |

> `_TEMPLATE.md` is the authoring template every surface document follows.

---

## 6. Shared design foundations (owned by `01-visual-design-system.md`)

To prevent drift, the following are defined **once** in the Visual Design System document and
referenced everywhere else. Surface docs must not redefine them — they consume them:

- **Design tokens:** color (semantic, light/dark/system), typography scale, spacing scale,
  radius, elevation/shadow, border, z-index layering.
- **Iconography** set, sizing, and usage rules.
- **Motion system:** standard durations and easing, plus the `prefers-reduced-motion` contract.
- **Core components:** button/menu/dialog/field/toast/tooltip/tab/card anatomy and state matrices.
- **Density modes** and how they map to profiles.
- **Theming** (light/dark/system + any genre themes) and the contrast guarantees per theme.

The current v1 token source is `src/app.css`; the Visual Design System doc proposes the v2 token set
and migration intent (it does not edit code — this is a requirements package).

---

## 7. How to use this package

- **Designers:** treat each surface doc as the brief; the "Reference implementations" tables point to
  proven solutions to study before drawing.
- **Implementers (incl. agents):** the numbered `UX-*` requirements with acceptance criteria are the
  build contract; the component/state tables are the spec; the anti-patterns section is a hard
  do-not-do list.
- **Reviewers/QA:** acceptance criteria are pass/fail; the parameter rubric (§2) and success metrics
  in each doc are the review checklist.

This package is **documentation only**. It prescribes design; it does not modify application code.

---

## 8. UX glossary (package-local)

Terms used across surface docs; product nouns (Scene, widget, Command Center, capability set,
Navigation Section, actor) are defined in `../08-glossary.md`.

- **Surface** — a distinct UI region/screen a user works in (e.g., Command Center, map editor).
- **Hot path** — a frequently used, time-pressured action during live play.
- **Glanceability** — how quickly key state is read at a distance / in peripheral vision.
- **Information scent** — predictive cues (labels, icons, context) about where a path leads.
- **Progressive disclosure** — revealing complexity only as needed.
- **Profile** — Desktop / Tablet / Mobile GUI variant driven by the same core (§3).
- **Slim surface** — a focused, density-reduced GUI for a capability on a smaller profile that still
  runs the same core command and yields the same result.
- **Empty state** — the first-run/zero-data view of a surface, used as a teaching surface.
- **Squint / grayscale test** — verifying visual hierarchy survives blur and removal of color.
