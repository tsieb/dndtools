# DND Tools — Design Prototype & Visual-Match Reference

This document is the source-of-truth map for the **visual design** of `@dndtools/gm-react`: where
the prototype lives, the design principles the UI follows, how the local app mirrors it, and exactly
what is and isn't matched. For the **core-wiring / runtime architecture**, see [README.md](./README.md).

---

## 1. Purpose

`apps/gm-react` is the primary GM app: a **React** frontend that reproduces a polished, cohesive
online design prototype ("DND Tools") pixel-faithfully, while wiring the live surfaces to the real
`@dndtools/core` Processing Core. It is the only maintained GM surface (the original SvelteKit app is
retired to `archive/gm-svelte`; see [ADR-018](../../docs/adr/018-promote-react-app-to-primary.md)).

Two intents run in parallel and must both hold:

- **Visual fidelity** — every section matches the online prototype's layout, composition, theme,
  and component vocabulary. This is the design contract.
- **Real core wiring** — the canvas/data surfaces (`/board`, `/scene/:id`, scene/knowledge
  mutations) dispatch through `@dndtools/core` and round-trip through IndexedDB, not mock writes.

**Scope guidance (from the project owner):** build the **general framework** faithfully and
**populate it with representative test data** — do *not* treat the example campaign content as
something to recreate as exact, bespoke components. Structural/visual fidelity of the framework is
the bar; the mock campaign is stand-in test data for review.

---

## 2. Where the prototype lives

### Online source of truth (authoritative)

- **Claude Design project:** `20316ed7-4fd5-4edd-8294-48f899b74252` — *"Dndtools design system prototype"*.
- **Entry file:** `DND Tools.dc.html` (a second prototype, `Scene & Widget System.dc.html`, covers
  the standalone scene/widget builder surfaces).
- **Access:** via the `claude_design` MCP connector (`DesignSync` tool). If it needs authorization,
  run `/design-login` (grants `user:design:read/write`). Read files with `DesignSync get_file`
  (256 KiB cap per file, no range param).

**Refactored, fetchable structure** (the project was split so every file fits under the cap):

| File | Role |
|------|------|
| `app.jsx` | App shell only — Sidebar, Topbar, CommandPalette, generic Modal + host, and the shared `Page` / `Panel` / `Seg` / `BackBar` primitives; mounts the active section + overlays. |
| `app-shared.js` | Classic script (no JSX). Publishes everything on `window.DNDApp`: design tokens (`T`), helpers, the `useReducer` store (`initState` + `reducer`), context, static nav config, and the `SECTION_VIEWS` / `MODALS` / `WIDGETS` / `SETTINGS_PAGES` registries. Loaded **before** the JSX views. |
| `views/*.jsx` | One module per section group. Each destructures from `window.DNDApp`, registers its views/widgets/modals back into the registries, calls `A.notify()`, and renders nothing itself (exports a no-op `ViewModule`). Files: `workspace` (home + session + widgets + scene-creator), `characters`, `atlas`, `map-builder`, `campaign-knowledge`, `settings`, `onboarding` (overlay + 8 settings subpages), `platform` (graph/audio/extensibility/community), `player`. |
| `campaign-data.js` | The mock campaign globals (`DNDData`, `DNDHub`, `DNDEdit`, `DNDPages`, `DNDGaps`, `DNDGaps2`, `DNDExt`, `DNDPlayer`, `DNDCommunity`, `DNDAccount`). The fictional campaign is **"The Sunken Outpost"** (Brine Hand cult; the PC persona is **Mara Quill**, Cleric 5). |
| `_ds/.../_ds_bundle.part1..5.js` | The full design-system component bundle, split into fetchable parts (~56 components: Button, Card, Icon, Badge, HPBar, InitiativeRow, DiceResult, AbilityScore, StatBlock, ConditionTracker, DataTable, SpellSlots, NpcCard, QuestCard, SessionTimeline, …). |
| `_ds/.../tokens/*.css` + `styles.css` | The token layer — see Design Principles below. |

> History note: this structure replaced an earlier **monolithic `app.jsx`** that exceeded the
> 256 KiB `get_file` cap (truncated ~line 3982). While capped, Player, Community Wiki/Publish, and a
> handful of leaf components had to be reconstructed/stubbed. The "oversize file corrected" split
> lifted the cap, and those surfaces were **re-ported from authentic source**.

### Local design package (secondary, older)

`docs/design-package/` holds an earlier local export of the design system (`_ds_bundle.js` with the
original ~40 components + token CSS). It is **not** the current source of truth — prefer the online
project. The byte-identical token CSS lives here and was copied into the app.

### The local app

- **`apps/gm-react/`** (`@dndtools/gm-react`). Run from repo root: `pnpm dev:react` (Vite, port 5273),
  `build:react`, `preview:react` (4273), `typecheck:react`.
- **`src/ds/`** — the design-system React components + barrel (`import { … } from '../ds'`).
- **`src/app/screen-kit.tsx`** — the local mirror of the prototype's shared primitives: the `T` token
  shorthand object, `eb`/`mono` style consts, and `Page` / `Panel` / `Seg` / `SetRow` (1:1 with the
  online `app.jsx` versions, so section ports translate line-for-line).
- **`src/app/AppShell.tsx` + `src/app/nav.ts`** — the shared chrome (sidebar + topbar) and section IA.
- **`src/runtime/mockCampaign.ts`** — the test data: a copy of `campaign-data.js` (`@ts-nocheck`),
  exporting all 11 `DND*` globals. This is what populates every section for review.
- **`src/screens/*.tsx`** — one file per section, each a faithful port of the matching `views/*.jsx`.

---

## 3. Design principles

The design is a **candle-lit command center for live tabletop play** — warm, parchment-and-ink,
spatial, and player-safe by default. Concretely:

- **Token-driven theming, one attribute each.** Theme / density / motion are each a single attribute
  on `<html>` — `data-theme`, `data-density`, `data-motion` — and the token CSS resolves the whole
  surface live. The app sets these from `localStorage` on boot and from the Settings → Appearance
  controls.
  - **Themes:** `tavern` (the **default** — candle-lit dark), `parchment` (warm vellum light),
    `high-contrast` (the accessibility floor).
  - **Density:** `standard` / `comfortable` (locks ≥44px touch targets for play at the table) /
    `compact`.
  - **Motion:** `full` / `reduced` (collapses transitions to 0ms).
- **Never hardcode color/space/type.** Always use the token CSS vars — `var(--color-…)`,
  `var(--space-…)`, `var(--text-…)`, `var(--font-…)` — via the `T` shorthand in `screen-kit`. Fonts:
  `--font-display` (Cinzel-style headings), `--font-sans`, `--font-mono`.
- **Player-safe by design.** Visibility is first-class: `dm-only` / `shared` / `players` run through
  `VisibilityChip` and the `--color-visibility-*` tokens. DM-only content is visually distinct and is
  stripped from anything player-facing (e.g. the published wiki preview, export defaults).
- **Spatial, launcher-first IA.** The Command Center is a **navigation hub / launcher**, not a
  live-play surface — combat, dice, initiative and the widget board live *inside a scene* (the
  Session), never on the home. The sidebar groups, in order:
  **Run the table** (Command Center, Session) · **Scenes** (a live scene library with status dots:
  live / ready / draft, 5 + overflow) · **Library** (Characters, Atlas, Campaign, Knowledge with
  counts) · **More** (Platform: Graph, Audio, Extensions, Community — *collapsed by default*) ·
  **Pinned** · **Recent** · footer (Player view, Settings, DM account). The topbar carries the
  Cinzel title/subtitle, a `⌘K` search affordance, and the projection pill + Project/Stop.
- **Progressive disclosure via complexity tiers.** A separate `complexity` axis
  (beginner / standard / expert) hides or reveals advanced panels, code modes and automation across
  every section — distinct from density. The scene creator and several panels adapt to it.
- **Component vocabulary.** Sections are composed from the design-system primitives, never bespoke
  one-offs: `Panel` (titled card with optional action/accent), `Card`, `Badge`, `Chip`,
  `StatusDot`, `Avatar`, `Tabs`, `Button`/`IconButton`, `Stat`/`StatPill`, `HPBar`,
  `InitiativeRow`, `DiceResult`, `ConditionBadge`/`ConditionTracker`, `AbilityScore`, `SpellSlots`,
  `DataTable`, `DefinitionList`, `ProgressMeter`, `EmptyState`, `VisibilityChip`.

### Port translation rules (online `views/*.jsx` → local `src/screens/*.tsx`)

1. Copy the JSX/inline-styles **verbatim**.
2. `window.DNDToolsDesignSystem_8ae046.X` → `import { X } from '../ds'`.
3. `A.Page` / `A.Panel` / `A.Seg` / `T` / `eb` / `mono` → `'../app/screen-kit'`.
4. Data globals (`DNDPlayer`, `DNDCommunity`, …) → `'../runtime/mockCampaign'`.
5. Store reads/dispatch (`useApp()`, `dispatch`) → local component state; `toast` → no-op (there is
   no global Toaster in this visual port).
6. `go(id)` / `nav/detail` → `react-router` `navigate(path)` or local detail state.
7. Be null-safe for empty/fresh state.

---

## 4. What is matched, and the gaps

### Matched (re-ported from authentic source; typecheck-clean, rendered, 0 console errors)

- **Shared chrome** — sidebar IA (Run / Scenes / Library / More-collapsed / Pinned / Recent /
  footer) + topbar, `tavern` default theme.
- **Command Center** (`/`) and **Session** (`/session`) — confirmed already faithful to the
  refactored `workspace.jsx` (setup card, resume card, scene tiles, create/manage/library; session
  lifecycle + scene bar + widget board).
- **Player** (`/player`) — full: sticky vitals bar + Sheet / Resources / Party / Level-up / Journal.
- **Community** (`/community`) — Discover / Export / Publish / Wiki (Publish readiness donut +
  checklist and the parchment Wiki reading preview were previously reconstructions; now real).
- **Settings** (`/settings`) — **all 11 subpages**: Appearance, Account, Subscription, Players,
  Permissions, Vault, Sync, AI, Plugins, Systems, Accessibility.
- **Characters** (`/characters`) — roster + generic NPC reference detail + the full **MaraSheet**
  (ability scores, skills/saves, attacks table, combat panel, spellcasting).
- **Graph / Audio / Extensions** — structurally diff-verified against the authentic `platform.jsx`
  (panel titles + tabs match panel-for-panel).

### Render-verified but not line-diffed

- **Atlas / Campaign / Knowledge** — render clean and populated, ported from the pre-refactor
  monolith. Consistent with the now-confirmed mechanical-refactor pattern, but not individually
  diffed against their refactored view files (`atlas.jsx`, `campaign-knowledge.jsx`). Framework
  faithful; exact-pixel unverified.

### Deferred (interaction-gated overlays — not in the default render of any section)

- The **`⌘K` command palette**, **onboarding** flow, the full-screen **scene creator**, the seven
  **modals** (newScene, addWidget, condPick, changePlan, importWizard, migration, buildSystem), and
  the **Atlas map-builder** overlay. Their authentic source has been fetched and is documented; they
  are wired as no-op launchers in the visual port.

### Known fidelity caveats

- The visual port has **no global Toaster**; action buttons that toast in the prototype are no-ops.
- Store-backed values (theme/density/motion drive live doc attrs + `localStorage`; everything else is
  local component state). Sidebar **Scenes** rows open the mock Session board, not the real
  `/scene/:id` core canvas — a known seam between the visual mock and the core-wired routes.
- Exact-pixel reconciliation of the design-system **leaf components** against the real
  `_ds_bundle.part1..5.js` was de-prioritized per the framework-scope guidance; the local `src/ds`
  components are faithful ports, not guaranteed byte-identical to the latest online bundle.

---

## 5. Gates

- `pnpm --filter @dndtools/gm-react typecheck` — PASS.
- `node scripts/verify-roundtrip.mjs` — foundation core round-trip (load → dispatch → persist →
  reload), **11/11**.
- `node scripts/verify-canvas.mjs` — `/board` + `/scene/:id` + content round-trip, **13/13**.
- Console-error sweep across all routes — **0 errors**.

The visual reskin left the core wiring intact (both round-trip gates stay green).
