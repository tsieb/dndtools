# V2 UX Architecture Decisions — Product Architecture and IA Reconciliation

> Decision record produced by the `UX-ARCH-product-architecture-and-ia-reconciliation` epic
> (phase "00 Architecture Decisions", priority P0). It resolves the cross-document architecture
> questions that gate broad UI route work, so every later UX remake epic consumes one settled IA,
> route map, and page/overlay contract.
>
> **Status:** Accepted (v1)
> **Owner:** UX architecture (this epic), handed to the phase-02 shell epics for runtime presentation.
> **Source UX docs:** `docs/remake-review/ux-requirements/00-overview-and-principles.md`,
> `docs/remake-review/ux-requirements/02-navigation-and-platform-profiles.md`,
> `docs/remake-review/ux-requirements/16-ideal-gui-architecture.md`,
> `docs/remake-review/ux-requirements/README.md`
> **Functional grounding:** `docs/remake-review/03-architecture.md` (Global nav = 5-7 destinations),
> `docs/adr/014-v2-stack-and-subproject-boundary.md` (deferred renderer, transport, crypto/KMS).
> **Machine-readable contract:** `docs/planning/v2/ux/navigation-registry.yaml`
> **Enforced by:** `scripts/ux-navigation-registry-lint.ts` (run via `pnpm lint:nav-registry`).

---

## 1. Why this record exists

The UX requirements package raised a set of architecture decisions that "gate UX" and must be
resolved before route scaffolding (`docs/remake-review/ux-requirements/README.md`, section A;
`docs/remake-review/ux-requirements/16-ideal-gui-architecture.md`, sections 10.1 and 11). This record
makes each decision explicitly, records owner / risk / implementation constraint, and reconciles the
three navigation models that currently disagree:

- **UX-NAV-002** (the UX requirement) listed **nine** global Navigation Sections.
- **The functional v2 registry** (`apps/v2/packages/core/src/queries/navigation-sections.ts`,
  `CANONICAL_NAVIGATION_SECTIONS`) declares **ten** canonical sections (it adds a `scenes` authoring
  surface plus planned `audio` and `mcp` sections).
- **The ideal GUI architecture** (doc 16, section 4.1) recommends **seven** global destinations, with
  Audio and MCP as capabilities rather than global sections.

The functional architecture contract caps global navigation at **5-7 destinations**
(`docs/remake-review/03-architecture.md`). The nine/ten-section models exceed the intent of that cap
for the primary nav surface. This record adopts the seven-section reconciliation and records how the
existing functional sections map onto it.

---

## 2. Decision 1 — Global navigation model (IA reconciliation)

**Decision: ACCEPTED — seven global navigation destinations, in fixed canonical order:**

1. Command Center (home, always first)
2. Session
3. Characters
4. Atlas
5. Campaign
6. Knowledge
7. Settings (always last)

**Audio, MCP, and Scenes are first-class capabilities/authoring surfaces, but not global
navigation sections:**

- **Audio** → Command Center widget, Session-local tool, scene/map-linked presets, Settings asset and
  configuration surface.
- **MCP/AI** → inline editor assistance, staged-write review panel, provenance details, Settings AI
  configuration.
- **Scenes** → authored from the Command Center; reachable through the widget-library drawer, the
  saved-Scene list (local navigation), and deep-linkable `/scene/:id` pages — not a competing global
  destination.

The canonical order, route roots, per-actor availability, keyboard shortcuts, icons, and announcement
strings are encoded in `docs/planning/v2/ux/navigation-registry.yaml`, and the capability homes are
recorded there too.

- **Owner:** UX architecture (this epic); runtime presentation handed to
  `UX-SHELL-route-layout-and-platform-profiles` (phase 02).
- **Risk:** Reclassifying Audio/MCP/Scenes out of primary nav must not orphan them. Mitigated by
  recording explicit durable homes for each in the registry and re-checking them in the phase-02 shell
  work. Secondary risk: the functional registry still tags those three with `category: 'navigation'`;
  see section 8 (reconciliation) for why that is a non-destabilizing presentation follow-up, not a code
  change in this epic.
- **Implementation constraint:** The seven-section order is invariant across Desktop, Tablet, and
  Mobile; only the presentation surface changes (sidebar ↔ rail ↔ bottom tab bar + "More" sheet). DM-only
  capabilities (Scenes, Audio, MCP) are `player:false`/`observer:false` and must be **absent from the
  player/observer navigation DOM**, never merely hidden (UX-NAV-002 AC2, UX-NAV-013). All seven global
  sections are player-reachable (a player sees the player-safe/slim variant), so no DM-only **global**
  section exists to leak.

This satisfies the binding registry requirement **UX-NAV-002** and the `UX-ARCH-S01` acceptance
criterion that "the accepted global navigation model is recorded and affected docs, route registry
contracts, and navigation lint fixtures agree."

---

## 3. Decision 2 — Scene naming

**Decision: ACCEPTED — keep "Scene" as the v2 label for the canvas primitive.**

- **Owner:** UX architecture; consumed by the canvas epics (`UX-CANVAS-*`) and Command Center epics
  (`UX-CMD-*`).
- **Risk:** Low. If product later renames it, it is a global label swap across docs, the registry, and
  GUI strings. The risk is carrying the name into many surfaces before a rename; mitigated by treating
  "Scene" as a token, not hard-coded copy.
- **Implementation constraint:** Use "Scene" consistently for the spatial canvas primitive and the
  `scenes`/`/scene` route space. Do not introduce synonyms ("board", "canvas page") in user-facing copy.

---

## 4. Decision 3 — Canvas rendering engine

**Decision: DEFERRED (final engine) with an accepted interim default.** Per
`docs/adr/014-v2-stack-and-subproject-boundary.md`, the first Scene prototype uses normal
HTML/Svelte/CSS layout and **must not** introduce a dedicated WebGL/Canvas/Pixi/Konva/Fabric/Three.js
engine without a later ADR or approved spike. The final engine (DOM-positioned vs. GPU-backed vs. staged
hybrid) is decided after a focused prototype (doc 16, section 11).

- **Owner:** `UX-CANVAS-viewport-rendering-and-performance` (phase 03) plus a renderer spike; final
  engine change requires an ADR-014 follow-up.
- **Risk:** Engine choice materially affects 60fps targets, virtualization, nested-map zoom, the
  Scene Outline, and the Command Center player-view preview. Choosing late avoids premature lock-in but
  leaves a performance unknown.
- **Implementation constraint:** Widgets and Scene contracts must not assume a specific renderer; keep a
  renderer-abstraction boundary so a GPU backend can replace the DOM baseline without changing widget,
  binding, or Scene Outline contracts. Every drag/gesture/zoom must keep a keyboard, menu, and numeric
  alternative and a Scene Outline regardless of engine (accessibility floor, doc 16 section 7.4).

---

## 5. Decision 4 — Player-view preview mechanism (UX-CMD-005)

**Decision: DEFERRED (final mechanism) with an accepted interim safety constraint.** The choice between a
second live render context and a server-side snapshot is spiked early and decided before the Command
Center final layout (doc 16, section 11). The interim constraint fixes the safe default now.

- **Owner:** `UX-CMD-player-view-handouts-map-and-session-controls` (phase 04, Trust and Safety) plus an
  early spike.
- **Risk:** The player-view controller's trust depends on the preview being accurate **and** non-leaking.
  A snapshot/clone of the DM DOM risks leaking hidden content; a second render context costs a second
  pass. ADR-014 also defers live transport, so cross-device preview is single-device until a transport
  ADR lands.
- **Implementation constraint:** The preview **must be produced from player-actor-filtered query data**
  (a re-render under the player actor), never by hiding or cloning DM-only DOM. Hidden content must be
  absent from the preview's data, not visually masked (safety principle 8; UX-NAV-013; doc 16 section
  7.1).

---

## 6. Decision 5 — Layout-preset storage format

**Decision: ACCEPTED — store proportional (normalized) coordinates, not absolute pixels.** Command Center
and Scene layout presets persist normalized positions/sizes plus anchor and minimum-size constraints so a
single preset adapts across Desktop / Tablet / Mobile profiles (doc 16, section 10.1).

- **Owner:** `UX-CMD-home-scene-and-role-differentiated-dashboard` (phase 03, layout-preset store).
- **Risk:** Normalized coordinates can round imprecisely on very small viewports and need min-size
  constraints to stay usable; absolute pixels would be simpler but cannot move a preset across profiles.
- **Implementation constraint:** Persist normalized coordinates (e.g. 0..1 of the Scene viewport) plus
  per-widget minimum sizes and anchors. Never persist absolute pixels as the source of truth. Presets must
  round-trip across all three platform profiles.

---

## 7. Decision 6 — Interim sync / collaboration states (ADR-014 deferrals)

**Decision: DEFERRED (cloud sync, live transport, CRDT, crypto/KMS) per
`docs/adr/014-v2-stack-and-subproject-boundary.md`, with an accepted interim behavior.** The v2 build is
single-device and local-first; sync/collaboration surfaces show honest "not enabled in this build" states
rather than broken or error states.

- **Owner:** `UX-SYNC-global-indicators-local-first-and-entity-badges` and
  `UX-SYNC-queues-conflicts-recovery-consent-and-authorization` (phase 09); transport/crypto choices
  require later ADRs.
- **Risk:** Gated surfaces (the `UX-SYNC-010` sync-enablement gate, cloud consent, AI provenance survival
  across merges) can look broken if the interim copy is not deliberate. Provenance survival across CRDT
  merges (`docs/remake-review/ux-requirements/README.md` section C.9) remains an open decision deferred
  to the sync/MCP epics.
- **Implementation constraint:** Local-first writes acknowledge immediately and never block on sync.
  Deferred cloud/transport features render explicit "Local only / Sync not enabled in this build"
  affordances with no dead controls (ADR-014: "Prototype UI may show these capabilities as unavailable or
  degraded only when an approved slice requires visible status"). Operation-shaped local records are
  preserved so future transport can attach without a UI re-architecture.

---

## 8. Reconciliation with the functional v2 registry

The functional registry `CANONICAL_NAVIGATION_SECTIONS`
(`apps/v2/packages/core/src/queries/navigation-sections.ts`) is the implementation source of truth for the
functional NAV requirements and already separates "every approved section as data" from "what the runtime
renders". This epic does **not** modify that functional code (it is outside this epic's file ownership and
is depended on by the completed functional v2 workpack). Instead, the UX model classifies each functional
section and the classification is enforced by `scripts/ux-navigation-registry-lint.ts`:

| Functional section id | UX classification | Global nav order |
|---|---|---|
| `command-center` | Global nav (home) | 1 |
| `session` | Global nav | 2 |
| `characters` | Global nav | 3 |
| `atlas` | Global nav | 4 |
| `campaign` | Global nav | 5 |
| `knowledge` | Global nav | 6 |
| `settings` | Global nav (last) | 7 |
| `scenes` | Capability (authoring) | — |
| `audio` | Capability | — |
| `mcp` | Capability | — |

The lint asserts: every global-nav id resolves to a functional section with the same route root and the
same dm/player/observer availability; every capability id resolves to a functional section; the union of
global-nav and capability ids equals the full functional section set (no unclassified or invented
section); and the single functional home is `command-center`. If a future functional section is added, the
lint fails until the UX model classifies it.

**Follow-up (phase 02, not this epic):** the functional registry tags `scenes`/`audio`/`mcp` with
`category: 'navigation'`. The shell epic `UX-SHELL-route-layout-and-platform-profiles` implements the
seven-destination primary nav and renders those three as non-global per this contract. That is a GUI
presentation refinement; it does not require deleting them from the functional registry.

---

## 9. Route map and page / overlay contract (gate for later epics)

Later UI epics consume the route map and the page/panel/modal contract; both are documented before broad
implementation, satisfying `UX-ARCH-S01` AC3.

### 9.1 Durable workspaces (pages)

The authoritative route map is `docs/remake-review/ux-requirements/16-ideal-gui-architecture.md`,
section 4.2. Each route maps to one durable workspace with a stable title, a single `h1`, a route
announcement, focus restoration, and deep-link behavior. The durable workspaces are: Command Center
(`/`), Session (`/session`, `/session/:sessionId`, focused combat), Characters (`/characters`,
`/characters/:characterId`, `/characters/new`), Atlas (`/atlas`, `/atlas/maps/:mapId`, map edit), saved
Scene (`/scene/:sceneId`), Campaign (`/campaign`, `/campaign/:objectType/:objectId`), Knowledge
(`/knowledge`, note, graph), Settings (`/settings`, `/settings/sync`, `/settings/ai`), and the player
join flow (`/join/:inviteId`). Route names are conceptual; SvelteKit file paths may differ but must keep
one durable workspace per route.

### 9.2 Overlay-type contract

The page-vs-overlay contract is `docs/remake-review/ux-requirements/16-ideal-gui-architecture.md`,
section 5. Summary of when each overlay type is used:

- **Page / route** — durable workspace that survives reload, deep-link, back/forward, or device handoff.
- **Panel / drawer / sheet** — substantial controls while keeping the current object visible (widget
  library, Scene Outline, Map Summary, layer panel, participant roster, player-view controller, track
  library, Quick Reference, properties, conflict resolution, mobile browse sheets). Desktop prefers side
  panels; Mobile prefers bottom/full-screen sheets.
- **Modal dialog** — bounded, interruptive decisions requiring completion/cancel/review (destructive
  confirm, handout push, visibility restriction, import/export commit, level-up review, permission grant,
  first-run wizard). Must trap focus, restore focus to the trigger, close with Escape where safe, and never
  leak DM-only content through labels or hidden text.
- **Popover / menu** — localized choices (condition typeahead, slash-command insert, wikilink
  autocomplete, source/provenance details, visibility chip details, row actions, filter chips, small date
  picker, icon-rail tooltip). Must not hide full workflows.
- **Toast / banner** — short action feedback (saved, queued, roll sent, handout pushed, widget added,
  undo available) and persistent state (offline, sync degraded, preview-as-player, level-up pending,
  conflict requires resolution, AI disabled). Errors needing action must use a durable route/panel/banner
  with retry, never an auto-dismissing toast alone.

### 9.3 Non-global capability homes

Surfaces that must not become global nav items (doc 16, section 4.3) have their homes recorded in
`docs/planning/v2/ux/navigation-registry.yaml` under `capabilities` and `nonGlobalSurfaces`: Scenes,
Audio, MCP, search, graph, dice, sync status, player-view, and timeline/calendar.

---

## 10. Open questions resolved or re-scoped by this record

- **README section A.1 / doc 16 section 4.1 (nine vs seven global nav):** resolved — seven (section 2).
- **README section D.10 / doc 16 section 11 (Scene name):** resolved — keep "Scene" (section 3).
- **README section A.1 / doc 16 section 11 (canvas renderer):** deferred with interim DOM baseline
  (section 4).
- **README section A.2 / doc 16 section 11 (player-view preview):** deferred with interim actor-filtered
  re-render constraint (section 5).
- **README section A.4 / doc 16 section 10.1 (layout-preset storage):** resolved — proportional (section 6).
- **README section A.3 / doc 16 section 11 (ADR-014 deferrals, interim sync/collab):** deferred per
  ADR-014 with interim "not enabled in this build" behavior (section 7).
- **doc 02 OQ-4 (MCP section actor availability):** re-scoped — MCP is no longer a global section; its
  player-visible surface (if any) is owned by `docs/remake-review/ux-requirements/14-ai-mcp.md`.
- **README section C.9 (provenance survival across merges):** still open; deferred to the sync/MCP epics.

---

## 11. Traceability

| Requirement / AC | Where satisfied |
|---|---|
| `UX-NAV-002` (registry + canonical order) | Section 2 + `docs/planning/v2/ux/navigation-registry.yaml` + `docs/remake-review/ux-requirements/02-navigation-and-platform-profiles.md` (UX-NAV-002 updated to seven). |
| `UX-ARCH-S01` AC1 (accepted nav model; docs/contracts/lint agree) | Sections 2 and 8; the registry YAML; `scripts/ux-navigation-registry-lint.ts`; doc 02 and doc 16 updated. |
| `UX-ARCH-S01` AC2 (each open decision accepted/deferred with owner, risk, constraint) | Sections 3-7. |
| `UX-ARCH-S01` AC3 (route map + page/panel/modal contract documented) | Section 9 (+ doc 16 sections 4.2 and 5). |
| `UX-NAV-002-S01` AC2 (no DM-only global section leaks) | Section 2 constraint; registry availability; all seven globals are player-reachable. |
| `UX-NAV-002-S01` AC3 (Alt+2 → Session announce) | Registry `session` (order 2, `Alt+2`, announce "Session"); enforced by the nav-registry lint. Runtime keyboard/live-region wiring is delivered by phase-02 `UX-SHELL-route-layout-and-platform-profiles`. |
