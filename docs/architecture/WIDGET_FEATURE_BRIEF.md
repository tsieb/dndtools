# Widget Feature — Design & Goal Brief

> **Status:** Reference brief synthesizing the shipped widget system (initiatives I4, I16, I20)
> and its planned extensibility trajectory (I8, I12, ADR-014).
> **Audience:** Engineers, designers, and PMs who need a single, accurate picture of what
> widgets are, why they exist, and how they are built.

---

## 1. The Goal

### 1.1 The problem

A DM running a live session is juggling initiative, HP, conditions, notes, maps, handouts,
timers, and improvised lookups — usually across a stack of books, tabs, and apps. The cost
isn't any single tool; it's the *context-switching* between them. Every navigation away from
the current moment is a chance to lose the thread of play.

### 1.2 The user-facing goal

> *"DND Tools is the best possible tool to have open at the table during a live game session.
> Information is instant, action is one keystroke away, and the DM never loses the thread."*
> — `docs/planning/initiatives/I4-session-command-center.md`

Widgets are the mechanism that delivers this. They turn the **session board** into a
*configurable mission-control surface*:

> *"Session boards are a true DM command center: configurable, content-rich, and responsive
> to the shape of the current scene."* — I4

The design target is scannability under pressure:

> *"Every tile type is visually recognizable at a glance by its header accent, icon, and
> structural silhouette. A DM scanning the board identifies tile types in under one second
> per tile without reading labels."* — `docs/planning/initiatives/I20-board-tool-ux.md`

### 1.3 Why "widgets" and not "panels"

Widgets are deliberately a **platform primitive**, not a fixed set of screens. The same
declarative widget model powers first-party tools today and is the seam through which
community-authored, sandboxed extensions arrive tomorrow (see §6). This is why so much of the
design weight sits in *binding*, *permissions*, and *sandboxing* rather than in any one widget.

---

## 2. What a Widget Is (Conceptual Model)

A **widget** is a typed, configurable, optionally data-bound tile placed on an editing
surface. Three layers define it:

| Layer | What it is | Lives in |
|-------|------------|----------|
| **Definition** | What a widget *can* do — its type, bindings, commands, config fields, render entrypoint, capabilities. A blueprint. | `packages/core` (system) or an installed package |
| **Package** | A distributable bundle of one or more definitions, plus assets, migrations, and a trust review. | `WidgetPackageRecord` |
| **Instance** | A concrete widget *placed on a scene* — carries layout (x/y/w/h/z), configuration, local state, and a binding. | `scene.widgets[]` |

**Definition vs. instance** is the key mental model: a definition describes capability; an
instance is the placed, configured, bound thing the DM actually interacts with.

### 2.1 Surfaces

A widget declares which **surfaces** it may appear on:

- `scene` — the spatial canvas a DM composes (the primary, user-addable surface)
- `command-center` — the DM dashboard board (system widgets only; never in the add-picker)
- `player-view` — projected, visibility-filtered output for players

### 2.2 How widgets relate to neighbouring concepts

```
SESSION BOARD / SCENE CANVAS (the mission-control surface)
├── Active scene context (description, image, linked entities)
├── Widgets (typed tiles on a spatial grid)
│   ├── bound to entities (character HP, map region, note content…)
│   ├── visibility-tagged (dm-only | shared | player-visible)
│   └── manipulable (move/resize/rotate/align/z-order/group)
├── Player view  ← projection of player-visible widgets only
└── Command center ← system widgets (combat, notes, atlas, tools, …)
```

Scenes provide **narrative context**; widgets provide **mechanical and reference context**.
Switching scenes re-shapes which widgets are surfaced — *"information prevalence changes to
surface what matters right now, not what matters during prep"* (I16).

---

## 3. The Data & Binding Model

### 3.1 Definition shape (selected fields)

`WidgetDefinition` (`packages/core/src/state/widget-package-state.ts`) declares, among others:

- **Identity** — `type`, `version`, `displayName`, `author`, `category`, `icon`
- **Placement** — `placement.surfaces`, `placement.libraryListed`, `supportedProfiles`
- **Geometry** — `defaultSize`, `minSize`, `resizePolicy` (`fixed | axis-locked | free`)
- **Data** — `requiredBindings`, `optionalBindings`, `dataQueries`, `computedFields`
- **Render** — `renderEntrypoint` (`template | builtin | custom-html-js`), `style`
- **Config/state** — `configFields`, plus `configuration`/`runtimeState`/`localState` schemas
- **Behaviour** — `commands` (descriptors), `outputWrites`, `events`
- **Security** — `capabilitySets` (`manager | operator | viewer`), `hostPermissions`

An **instance** (`WidgetInstance` in `scene-state.ts`) carries `layout`, `configuration`,
`localState`, `binding`, and a `disabled` state (set, but *not destroyed*, when its package
is removed or a migration fails).

### 3.2 Binding — the heart of the system

A widget binds to an entity for **read** access via a declarative path:

```ts
interface WidgetBinding {
  source: { entityType: string; entityId: string; selector?: string }; // e.g. character / id / 'combat.hp'
  mode: 'read' | 'operate' | 'manage' | 'observe';
  requiredCapability: 'manager' | 'operator' | 'viewer';
}
```

Bindings are resolved against an **actor-scoped projection** of state
(`WidgetDataEnvironment`), so the *same* binding resolves differently per viewer.
`resolveWidgetBinding()` (`packages/core/src/queries/binding.ts`) returns one of:

`available` · `unbound` · `missing` · `hidden` · `conflicted` · `degraded`

**Fail-closed visibility is the critical invariant:** a player binding to a DM-only NPC gets
`hidden` — and never learns whether that entity is *also* missing or conflicted. Information
leaks are prevented at the resolver, not at the renderer.

---

## 4. Security & Permissions

The widget model assumes that *some* widgets will eventually be untrusted, so the boundaries
are strict by default.

### 4.1 Package trust lifecycle

```
install → [unreviewed, disabled, all host-permissions denied]
   └─ DM review → enable → [trusted, enabled]
                  ├─ upgrade → migrate instances (or mark failed)
                  ├─ disable → instances disabled (preserved, not deleted)
                  └─ remove  → soft-delete (removedAt), instances disabled
```

System packages (`createSystemWidgetPackages()`) ship pre-trusted; *installed* packages start
`unreviewed` with every host permission denied until a DM approves them.

### 4.2 Custom widget runtime (sandboxing)

`template`/`builtin` widgets are first-party and host-scoped. `custom-html-js` widgets run in
an **iframe/worker sandbox** with:

- **No raw access** to app state, storage, IPC, cloud client, auth tokens, or vault files.
- **Permission-gated capabilities** (clipboard, network, filesystem…) — all default-denied.
- **Forbidden capabilities** that are *never* grantable (`storage-adapter`, `ipc`,
  `raw-vault-file`, `hidden-actor-data`, …).
- **Exfiltration gate** (`evaluateWidgetOutboundRequest`, SEC-011): outbound requests are
  checked against approved destination classes and scanned for sensitive content
  (auth tokens, absolute paths, diagnostics) — blocked or redacted per policy.
- **Non-destructive failure isolation:** a crashing or policy-violating widget is isolated as
  a placeholder; sibling widgets and core state survive (`coreStateAvailable: true`).

### 4.3 Operator authority — operate vs. configure

Two command classes are separated by **verb**, not just by declared capability
(`packages/core/src/permissions/widget-operator-authority.ts`):

- **operate** — runtime control with no permanent change: `start`, `pause`, `roll`, `advance`,
  `tick`, … → requires an `operator` grant.
- **configure** — permanent definition/settings change: `set-duration`, `rename`, `bind`,
  `unbind`, … → requires a `manager` grant.

Rules: the **DM** is always authorized; an **observer** never is; an actor with only
`operator` can run a timer but **can never** reconfigure it (`operator-cannot-configure`).
Grants are checked against `now`, so expired grants are inert.

---

## 5. Front-End / UX

### 5.1 The canvas

The scene canvas is a spatial, grid-based editing surface built on a `ViewportController`
(pan/zoom/camera) under a `CanvasManipulationController` that owns selection, snap/grid,
undo/redo, and live announcements. Every operation — pointer **or** keyboard — serializes to
the *same* processing-core command (`scene.move-widget`, `scene.resize-widget`,
`scene.configure-widget`, …). Geometry math (transform, alignment, z-order, selection) lives
in pure, unit-tested modules.

### 5.2 Rendering

`WidgetView.svelte` is the **single render path** for every widget on every surface. It
resolves a renderer via `resolveWidgetRenderer()` → `template` | `builtin` | `custom` |
`placeholder` (never crashes), merges config defaults, and applies `--widget-*` style tokens.

**Built-in templates** (data-driven, reusable):

| Template | Used for |
|----------|----------|
| `TemplateStatBlock` | Character widget — name/HP/AC/abilities from a binding |
| `TemplateTracker` | Timer — live `M:SS` countdown + progress, operate commands |
| `TemplateStatusList` | Initiative tracker / checklists — highlights the active row |
| `TemplateDataTable` | Reference panels — filterable/sortable rows (notes, characters, maps) |
| `TemplateChart` | Horizontal bar chart from a data query |
| `TemplateFormPanel` | Note widget — heading + multiline body |
| `TemplateSceneMessage` | Handout/message card to players |

Bespoke `builtin` renderers (Map, Audio, and the command-center suite: Combat, Notes, Atlas,
Search, Session, Tools, Player Views, …) bypass templates when they need custom logic.

### 5.3 Manipulation & chrome

Drag-or-keyboard parity for move, resize, rotate, z-order, align/distribute, and group;
off-canvas snap-back; numeric `TransformPanel`; multi-select with a Figma-style
"fully enclosed" marquee. Widget chrome shows a title (with a *safe* entity name that never
leaks hidden bindings), collapse toggle, a visibility badge (icon **and** label — never colour
alone), and a binding-state chain-link indicator.

### 5.4 Discovery & configuration

- **Widget Library** (`WidgetLibrary.svelte`) — categorized, searchable, profile-aware
  add-picker; unsupported-on-profile entries are dimmed with a reason. Only `scene` +
  `libraryListed` widgets appear, and only for actors who can author scenes.
- **Binding Inspector** (`BindingInspector.svelte`) — discrete, keyboard-operable surface to
  search DM-scoped entities and pick a binding type (the WCAG 2.5.7 alternative to drag).
- **Customize Panel** (`WidgetCustomizePanel.svelte`) — renders declarative `configFields`
  grouped into Content / Display / Style.

### 5.5 Accessibility (first-class, not bolted on)

- **WCAG 2.5.7 drag alternatives** — every pointer operation has a keyboard equivalent that
  dispatches the identical core command (single `DragController` adapter).
- **Two keyboard modes** — *spatial* (nearest-neighbour arrow navigation, nudge, select) and
  *action* (Enter to resize/rotate the focused widget).
- **Roving tabindex** for all composite controls; no positive `tabindex` anywhere.
- **Live-region announcements** for selection, move, resize, align, and binding changes.
- **Document order follows focus metadata** (z-order/group/dock/pin), not insertion order.

### 5.6 Player-view projection & responsive layout

A single no-leak boundary, `isVisibleToViewer()`, filters DM-only widgets for the canvas,
the scene outline, search, and the **player-view preview** (a non-destructive DM overlay that
shows exactly what a chosen player would see, with editing suspended). On compact/mobile
profiles the dense grid collapses to a focused one-widget-at-a-time view with prev/next — same
state and commands, presentation only.

---

## 6. Extensibility Trajectory (Planned)

Widgets are built to become an **ecosystem**, not just a feature set:

- **Plugin architecture (I8)** — sandboxed, capability-declaring plugins that register new
  widget/object types via a restricted host API (`vault.read`, `objects.register`, …).
- **Campaign system modules (I8)** — hardcoded 5e assumptions factored into swappable system
  modules so widgets adapt to the active ruleset.
- **Community content (I12)** — publishing and importing widget/board packages and templates.
- **v2 core contracts (ADR-014)** — `@dndtools/v2-core` formalizes *"widget binding contracts
  and command descriptors,"* making third-party widgets first-class and deterministically
  permission-gated.

These remain **deferred**; the shipped system already encodes the security and binding
primitives (trust review, host-permission gating, sandbox runtime, actor-scoped bindings)
that make safe extensibility possible.

---

## 7. Design Principles (Summary)

1. **Information prevalence** — surface what matters *now*; scenes reshape the board.
2. **Sub-second scannability** — type identity via accent, icon, and silhouette.
3. **One render path, one data path, one visibility boundary** — no second code path to drift.
4. **Pointer is convenience over the same command** — keyboard/SR paths are primary.
5. **Fail-closed by default** — permissions, visibility, and host capabilities all deny first.
6. **Non-destructive failure** — disabled/crashed widgets are preserved, never silently lost.
7. **Platform, not feature** — the model is the seam for a future widget ecosystem.

---

## 8. Where to Look in Code

| Concern | Location |
|---------|----------|
| Definitions, packages, system widgets | `packages/core/src/state/widget-package-state.ts` |
| Instances, scene visibility | `packages/core/src/state/scene-state.ts` |
| Binding resolution (actor-scoped, fail-closed) | `packages/core/src/queries/binding.ts` |
| Library discovery | `packages/core/src/queries/widget-library.ts` |
| Operator authority (operate vs configure) | `packages/core/src/permissions/widget-operator-authority.ts` |
| Sandbox runtime, host API, exfiltration | `packages/core/src/security/{custom-widget-runtime,widget-host-api,widget-exfiltration}.ts` |
| Canvas controller & geometry | `apps/gm/src/lib/gui/ux-canvas/` |
| Unified renderer, templates, data resolver | `apps/gm/src/lib/gui/ux-canvas/widgets/` |
| Scene route (focus order, responsive, preview) | `apps/gm/src/routes/scene/[id]/+page.svelte` |
| Product intent | `docs/planning/initiatives/{I4,I16,I20}.md`; extensibility `{I8,I12}.md`; `docs/adr/014-*.md` |
