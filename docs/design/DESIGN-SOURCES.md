# Design sources — where the DND Tools design lives

_Last updated: 2026-06-23._

This is the map of the **three** places the DND Tools design lives, what each one owns, and which
direction the dependencies run. Read this first if you're touching design, prototyping a surface, or
porting a treatment into the production app.

## The three sources

| # | Source | Type | Owns | Edited by |
|---|--------|------|------|-----------|
| **A** | **DND Tools Design System** (claude.ai/design, id `8ae04609-d2e8-47b6-8989-7bac8fce7edf`) | Design system (`PROJECT_TYPE_DESIGN_SYSTEM`) | The **language + the parts**: tokens, guidelines, atomic/molecular components, lean composed templates, the published `_ds_bundle.js`, and the `handoff/` runbook into this repo. | Claude Code via the **DesignSync MCP** / `/design-sync` (read **and** write), or anyone in the claude.ai/design UI. |
| **B** | **Dndtools design system prototype** (claude.ai/design, id `20316ed7-4fd5-4edd-8294-48f899b74252`) | Regular project (`PROJECT_TYPE_PROJECT`) | The **one interactive prototype**: store/reducer (`app-shared.js`), the `views/*.jsx` surfaces, three entry apps (DND Tools · Player View · Scene & Widget System), and mock data (`campaign-data.js`). Consumes A. | The claude.ai/design UI only. Claude Code can **read** it via DesignSync but **cannot write** it (see "Access", below). |
| **R** | **This repo** (`apps/gm-react`, `packages/core`) | Production code | The shipping product. `apps/gm-react` is the **primary GM app** (Vite + React 18 + semantic-token CSS); the retired SvelteKit app is archived at `archive/gm-svelte`. Reskinned _toward_ A/B. | Claude Code directly. |

## Dependency direction

```
A  (design system: tokens · components · bundle)
│
├── vendored into ──►  B  (prototype: pins a frozen copy of A's compiled bundle in
│                          _ds/dnd-tools-design-system-8ae04609…/ and consumes it via
│                          window.DNDToolsDesignSystem_8ae046)
│
└── handoff/ runbook ──►  R  (apps/gm-react: redesign.tokens.css + APPLY.md
                              carry A's treatment into the real app; token names match 1:1)
```

**B depends on A. The repo depends on A.** A depends on nothing. Never invert this.

### How B consumes A (the only link)

B vendors a **frozen, pinned snapshot** of A's compiled bundle into
`_ds/dnd-tools-design-system-8ae04609-d2e8-47b6-8989-7bac8fce7edf/` (`_ds_bundle.js` + parts, tokens,
styles). B's `app.jsx` and every `views/*.jsx` mount A's atomic components from
`window.DNDToolsDesignSystem_8ae046` — `Button`, `Card`, `HPBar`, `StatBlock`, `ConditionTracker`,
etc. are **A's**, consumed, not re-implemented.

Because the snapshot is a pin, **A can drift ahead of B**: edit a component in A and B keeps
rendering the old one until the bundle is re-imported into B. The **component bundle is currently in
sync** — B's snapshot carries the same 67 components A publishes, so B needs no re-sync. (A live
example of the pin: when `ui_kits/` was trimmed from A, A's `_ds_manifest.json` *card index* dropped
the 31 kit cards, but B's vendored copy of that manifest still lists them — inert, because B consumes
the **component bundle**, not the pane's card index.) When you change components in A, re-import the
bundle into B and note the version here.

## What to reference where

| Question | Go to |
|----------|-------|
| Token / color / type value, or a single component's spec | **A** — `tokens/`, `components/<group>/`, `guidelines/*.card.html` |
| "What does the assembled app look like / behave like" | **B** — the interactive prototype (the living design surface) |
| "How do I land this treatment in the real app" | **A** — `handoff/APPLY.md` + `handoff/redesign.tokens.css` → this repo |
| The retired pre-prototype screen mocks | removed from the tree; recoverable from git history (see below) |

## The 2026-06-23 trim of A's `ui_kits/command-center/`

A used to carry a **second, full prototype** inside `ui_kits/command-center/` — ~50 click-through
screen mocks with their own shell, nav, and mock data. It was the early scaffold used **before** the
interactive prototype B was built. B re-covers those surfaces as a better-organized **superset**, so
the kit was redundant ("altitude confusion" — both projects doing the screen-composition job).

On 2026-06-23 the kit was **trimmed from A** so that A owns parts and B owns the assembled app. It
was first vendored into the repo under `docs/design/_archive/command-center-kit/` as a safety copy,
then removed from the tree during the React-primary cleanup — it remains recoverable from git
history. A's `readme.md`, `SKILL.md`, and `handoff/APPLY.md` were repointed from the kit to B + the
design-system templates.

### Where each retired surface now lives

| Retired kit surface(s) | Now in B |
|---|---|
| `command-center` · `index` · `screens` · `shell` (home/session/board) | `views/workspace.jsx` + the `DND Tools` app shell (`app.jsx`) |
| `edit-mode` · `widgets` · `inspector` · `scene-*` (canvas + tiered inspector) | `scene-widget-system.jsx` (the `Scene & Widget System` entry) |
| `characters` · `character-sheet(-mobile)` | `views/characters.jsx` |
| `character-creator` | `views/character-builder.jsx` |
| `campaign` · `note-editor` · `graph`/backlinks | `views/campaign-knowledge.jsx` |
| `collab-presence` (live co-editing) · `content-import` | `views/campaign-knowledge.jsx` (collab panel + import modal) |
| `settings` · `manage-players/permissions/vault` · `ai-tools` · `sync-conflict` · `accessibility` (tab) | `views/settings.jsx` (folds all of these in as categories) |
| `audio` · `extensibility` · `system-packages` · `community` | `views/platform.jsx` (+ `views/upgrade.jsx`) |
| `map-builder` | `views/map-builder.jsx` |
| `atlas` | `views/atlas.jsx` |
| `onboarding` | `views/onboarding.jsx` |
| `player` · `session-live` | `views/player.jsx` + `player-view-app.jsx` |
| **`graph-search` · `accessibility` (full spec) · `nav-profiles`** | **Not reproduced in B — these are spec/showcase surfaces, not app screens. Preserved only in the repo archive.** |

## Access (for Claude Code)

- **A is read+write** through DesignSync — drive it with `/design-sync` and the DesignSync MCP.
- **B is read-only** to DesignSync's write path, because it is a `PROJECT_TYPE_PROJECT`, not a design
  system, and that type is **immutable at creation**. There is no toggle to grant write access; the
  write path is gated to design-system projects by design. To change B, either edit it in the
  claude.ai/design UI, or iterate on its natural code counterpart — **`apps/gm-react`** in this repo,
  which Claude Code can edit directly and which is the React surface B's design maps onto.
- **The repo is fully editable** by Claude Code.

## Maintenance rituals

1. **A→B re-sync.** After changing components in A, re-import its bundle into B and update the
   in-sync note above.
2. **A→repo handoff.** Keep `handoff/APPLY.md` + `handoff/redesign.tokens.css` current as A evolves;
   they are the bridge into `apps/gm-react`.
3. **Cross-links.** A's root `SOURCES.md` mirrors this map online and states the same dependency
   direction. Keep the two in agreement.
