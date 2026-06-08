# DND Tools 0.2.0 — UX/UI Requirements Package

This package is the **authoritative UX/UI requirements set** for the DND Tools 0.2.0 remake. It
complements the functional requirements in `../requirements/` (what the system does) with a
product-specific, researched, testable specification of **how every major UI surface must look,
feel, and behave** — to maximize visual appeal, information scent, navigability, intuition,
accessibility, adaptability, and effective emphasis.

> **Start with [`00-overview-and-principles.md`](00-overview-and-principles.md).** It defines the
> north-star principles, the parameter rubric every surface is graded against, the binding platform
> profiles (Desktop / Tablet / Mobile), the `UX-*` requirement-ID scheme, and the shared design
> foundations. Read it before any surface document.

This package is **documentation only**. It prescribes design; it does not modify application code.

---

## How it was produced

Each surface document is grounded in (a) the canonical [`../00-vision-brief.md`](../00-vision-brief.md),
(b) its corresponding functional requirements file in [`../requirements/`](../requirements/), and
(c) researched best practices from primary design systems (Apple HIG, Material Design 3, Microsoft
Fluent, WCAG 2.2 / WAI-ARIA APG, Nielsen Norman Group) plus named, domain-leading reference products.
Every document follows [`_TEMPLATE.md`](_TEMPLATE.md): goals → researched best practices → reference
exemplars → numbered requirements with acceptance criteria → component/state specs → responsive
layout → motion → accessibility → **anti-patterns & explicit limitations** → metrics → open
questions → sources.

---

## Package map & count audit

| # | Document | Code(s) | Reqs | Complements functional |
|---|---|---|---:|---|
| 00 | [`00-overview-and-principles.md`](00-overview-and-principles.md) | — | — | (foundation) |
| 01 | [`01-visual-design-system.md`](01-visual-design-system.md) | `UX-VIS` | 13 | cross-cutting; A11Y, PLAT |
| 02 | [`02-navigation-and-platform-profiles.md`](02-navigation-and-platform-profiles.md) | `UX-NAV` | 20 | NAV, PLAT |
| 03 | [`03-accessibility.md`](03-accessibility.md) | `UX-A11Y` | 18 | A11Y |
| 04 | [`04-canvas-scene-widgets.md`](04-canvas-scene-widgets.md) | `UX-CANVAS` | 16 | CANVAS |
| 05 | [`05-command-center.md`](05-command-center.md) | `UX-CMD` | 12 | CMD |
| 06 | [`06-maps.md`](06-maps.md) | `UX-MAP` | 18 | MAP |
| 07 | [`07-characters.md`](07-characters.md) | `UX-CHAR` | 13 | CHAR |
| 08 | [`08-sessions-live-play.md`](08-sessions-live-play.md) | `UX-SES` | 17 | SES |
| 09 | [`09-content-authoring-and-sources.md`](09-content-authoring-and-sources.md) | `UX-CONTENT` | 19 | CONTENT |
| 10 | [`10-graph-search-discovery.md`](10-graph-search-discovery.md) | `UX-GRAPH`, `UX-SRCH` | 21 | GRAPH, SRCH |
| 11 | [`11-collaboration-permissions.md`](11-collaboration-permissions.md) | `UX-COLLAB`, `UX-PERM` | 17 | COLLAB, PERM |
| 12 | [`12-sync-offline-reliability.md`](12-sync-offline-reliability.md) | `UX-SYNC` | 13 | SYNC |
| 13 | [`13-audio-atmosphere.md`](13-audio-atmosphere.md) | `UX-AUDIO` | 14 | AUDIO |
| 14 | [`14-ai-mcp.md`](14-ai-mcp.md) | `UX-MCP` | 12 | MCP |
| 15 | [`15-onboarding-learnability.md`](15-onboarding-learnability.md) | `UX-ONB` | 21 | cross-cutting; NAV, CONTENT |
| | **Total** | | **244** | |

Not given a dedicated UX doc (UX facets distributed across the docs above): **SEC** (security/privacy
UX → covered in 11, 12, 14), **PERF** (perceived-performance → covered in 01, 04, 12 and each
surface's Motion/Metrics sections), **CON** (constraints → architectural, non-UI).

---

## Reading paths

- **Designer kicking off a surface:** that surface's doc §3 (best practices) + §4 (exemplars to
  study) → then §5 requirements as the brief.
- **Implementer (incl. agent):** the surface doc's numbered `UX-*` requirements + §6 component/state
  tables are the build contract; §10 anti-patterns is the hard do-not-do list.
- **Reviewer / QA:** the `00` parameter rubric (§2) + each requirement's acceptance criteria + each
  doc's §11 success metrics.
- **Whole-product foundations:** read 01 (visual system), 02 (navigation/profiles), 03
  (accessibility) first — every other doc consumes them.

---

## Cross-document dependency map

Foundations are consumed everywhere; primary surfaces compose shared mechanics; supporting surfaces
cross-reference. Arrows mean "consumes / must stay consistent with."

- **01 Visual system** → consumed by **all**.
- **02 Navigation/profiles** → consumed by all; owns the command-palette shell (search/results live in **10**).
- **03 Accessibility** → sets the floor for all; canvas keyboard model shared with **04**, live-combat announcements with **08**, map non-visual access with **06**.
- **04 Canvas/widgets** → generic mechanics consumed by **05** (Command Center), **06** (map-as-widget embed), **07/08/13** (data/combat/audio widgets), graph widget in **10**.
- **05 Command Center** → composes **04**; surfaces **08** (combat), **11** (player-view/visibility), **13** (audio).
- **07 Characters** → its widgets are used by **08**; capability-set assignment UI lives in **11**.
- **09 Content** → owns editor + import/source-of-truth; live merge-conflict surface is **12**; co-editing presence is **11**; search over content is **10**.
- **11 Collaboration/Permissions** → visibility/permission model referenced by **05, 06, 07, 09, 14**; live sync status is **12**.
- **12 Sync/offline** → status/conflict referenced by **09, 11, 14**.
- **14 AI/MCP** → uses **09** (editor), **02** (settings/nav), **11** (visibility), **12** (provenance survival).
- **15 Onboarding** → empty states co-owned with every surface; needs illustration palette from **01**.

---

## Consolidated open questions & cross-doc decisions

Synthesized from every surface document's §12. These are the decisions a human owner/designer should
resolve; most are **product/architecture choices**, not UX gaps. Grouped by theme and roughly
prioritized.

### A. Architecture decisions that gate UX (resolve first)

1. **Canvas rendering engine (WebGL vs DOM-positioned).** Materially affects the 60fps, virtualization
   (04), nested-map zoom (06), and the Command Center player-view preview (05). — *docs 04, 05, 06*
2. **Player-view preview mechanism (`UX-CMD-005`).** Second live render context vs server-side
   screenshot. High-risk; the player-view controller's trust depends on it. — *docs 05, 11*
3. **ADR-014 deferrals (pixel renderer, live transport, crypto/KMS).** Map rendering specs (06),
   the sync-enablement gate (`UX-SYNC-010`), and AI provenance persistence (14) currently target a
   *future* state. Decide the v2.0 interim copy/behavior so gated surfaces don't look broken. — *docs 06, 12, 14*
4. **Layout-preset storage format (absolute px vs proportional).** Blocks Command Center saved
   layouts across profiles. — *docs 04, 05*

### B. Research to run before building (cheap, high-leverage)

5. **Card-sort + tree-test the Navigation Section labels** ("Atlas", "Knowledge", "Session",
   "Campaign", etc.) before route scaffolding — `NAV-006` already mandates IA validation. — *doc 02*
6. **Usability-validate proposed numeric defaults**: fog opacity (DM 20% / player 95%), graph
   clustering threshold (~300 nodes), combat-row glanceability heights, compact-density target sizes. — *docs 06, 10, 08, 01*

### C. Safety / leak-proofing (must not ship without)

7. **DM↔player visibility boundary needs new automated test coverage** beyond v1's
   `accessibility.spec.ts` — specifically ARIA-label/alt-text/live-region/diff leakage
   (`UX-A11Y-008`, AP-1/AP-9). The single most safety-critical cross-cutting requirement. — *docs 03, 06, 10, 11, 12*
8. **Handout "persistent access" vs a formal capability-set grant** — avoid two grant surfaces
   that can disagree. — *docs 05, 11*
9. **Provenance metadata survival across CRDT sync merges** — decide whether AI/authorship
   provenance survives a merge. — *docs 12, 14*

### D. Scoped surface decisions

10. **The "Scene" name is not final** (canvas primitive) — a global label swap if it changes. — *doc 04*
11. **Command palette on touch-only devices** (no `Ctrl/Cmd+K` hardware) — reserve a mobile entry
    point rather than burying it. — *docs 02, 10*
12. **MCP's player-visible surface** — own nav entry vs nested under Session; affects whether players
    even know MCP exists. — *docs 02, 14*
13. **Mass/secret combatant initiative behavior** (grouped vs individual) and **Delay/Ready
    turn-order mechanics** need Processing Core clarification before the combat-state UX finalizes. — *doc 08*
14. **Anonymous (no-account) player join** — if allowed, the Player onboarding auth step drops and
    time-to-first-value target tightens to <30s. — *doc 15*
15. **Font loading strategy** (Inter variable subsetting; Cinzel offline fallback) and the
    **token-contrast CI gate** (specified but not yet implemented; it backs A11Y acceptance). — *docs 01, 03*
16. **Deferred for later**: positional/spatial map-placed audio (13); full-page search results view (10);
    snippet/template CRUD management UI (09).

---

## Relationship to existing docs

- **Supersedes** `../../development/UX_GUIDELINES.md` (thin, v1 document-editor era) for v2.
- **Extends** `../../development/ACCESSIBILITY.md` / `ACCESSIBILITY_QA.md` into v2 surface-level a11y.
- **Operationalizes** the generic `../../../deep-research-report.md` into product-specific requirements.
- **Obeys** `../00-vision-brief.md`; **complements** `../requirements/` (raise, never silently
  resolve, any conflict).

---

## Status

Draft v1 — complete first pass across all 15 surfaces (244 `UX-*` requirements). Ready for human
design review. Recommended next steps: resolve §A architecture decisions, run §B research, and wire
§C safety tests into the gate set before implementation begins.
