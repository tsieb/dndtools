# Requirements — DND Tools

_Central index for what the product must do. This is a **map** to the requirement sources, not a
re-derivation of every requirement._

The primary GM app is **`apps/gm-react`** (`@dndtools/gm-react`, Vite + React 18). The retired
SvelteKit app now lives at `archive/gm-svelte`. Requirements below describe the product the React
app ships.

## Canonical information architecture — 7 sections

The app and the design package are organized into **seven durable sections** (this is the canonical
IA; `docs/architecture/INFORMATION_ARCHITECTURE.md` still describes an older 5-section split — the 7
below win):

1. **Command Center** — the spatial home; a board of live-play widgets (icon `house`)
2. **Session** — run the live game: combat, dice, encounters (icon `zap`)
3. **Characters** — PCs, NPCs, monsters, sheets & builders (icon `users`)
4. **Atlas** — maps, fog, layers, points of interest (icon `map`)
5. **Campaign** — prep: NPCs, quests, session arc (icon `scroll`)
6. **Knowledge** — notes, wiki, backlinks graph (icon `book-open`)
7. **Settings** — themes, packages, players, accessibility (icon `settings`)

One IA runs on desktop, tablet and mobile; only the presentation changes (sidebar ↔ rail ↔ bottom
tab bar). The system is **system-agnostic**: game rules come from a swappable **System Package**
(D&D 5e ships as the reference default).

## Requirement sources that still exist

| Source | What it carries |
|---|---|
| [`FEATURE-GAPS.md`](./FEATURE-GAPS.md) | **The current feature inventory** for `apps/gm-react` — a severity-rated, evidence-based catalog of every surface, what it does today, and remaining gaps. Start here for "what the app does." |
| [`../architecture/NAVIGATION_CONTRACT.md`](../architecture/NAVIGATION_CONTRACT.md) | The nav/routing contract — sections, routes, redundancy rules. |
| [`../architecture/LAYOUT_TIERS.md`](../architecture/LAYOUT_TIERS.md) | Responsive layout tiers (sidebar / rail / bottom-tab) and density behavior. |
| [`../architecture/TOPBAR_CHARTER.md`](../architecture/TOPBAR_CHARTER.md) | What the top bar owns and what it must never hold. |
| [`../reference/FEATURE_TIERS.md`](../reference/FEATURE_TIERS.md) | Progressive-disclosure feature tiers (which features reveal at which experience level). |
| [`../planning/initiatives/`](../planning/initiatives/) | Initiative epics (I10–I19). These carry the **functional-requirement detail** — player suite, audio, community content, IA/nav, adaptive shell, design system, session UX, learnability, accessibility, map-tool UX. |

Design requirements (tokens, components, visual language) live under [`../design/`](../design/) —
see its `README.md`.

## Historical note

The original canonical requirements corpus at `docs/remake-review/` (the UX-requirements package and
remake diagnosis/brief) was **pruned from the tree** (commit `17d8524`) and now lives only in git
history. Recover with `git show <commit>:docs/remake-review/...` if a specific historical spec is
needed. The living requirement detail has moved to the initiative epics and the contracts indexed
above.
