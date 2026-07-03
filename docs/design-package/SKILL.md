---
name: dndtools-design
description: Use this skill to generate well-branded interfaces and assets for DND Tools — a canvas-first, **system-agnostic** command platform for running tabletop RPG sessions live, for the Game Master. The rules of the game (stats, resources, conditions, dice) come from a swappable **System Package** — D&D 5e ships as the default/reference package, plus generic and community packages, or a GM builds their own. Either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create
static HTML files for the user to view. If working on production code, you can copy assets and read
the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_
production code, depending on the need.

## Orientation
- **System-agnostic.** The platform runs **any** TTRPG via a swappable **System Package** that
  declares the game's vocabulary: attributes/stats, resources, conditions, dice, action economy,
  creature schema, roles. **D&D 5e is the default reference package, not a hardwired assumption** —
  the `creature`/`condition`/`spell`/`domain` components are 5e's *implementation* of that contract.
  Premade packages ship built-in (D&D 5e · Generic / narrative · community Pathfinder 2e); a GM can
  fork one or build their own. Components are containers; packages are content — feed a non-5e
  package's vocabulary into the same containers; don't assume STR/DEX, a d20, or spell slots exist.
- **Brand:** DND Tools — a warm, candle-lit, dark-first GM workspace (name kept for now; product is
  any-system). Hero theme **tavern** (espresso neutrals + warm-gold accent); light variant
  **parchment**; a11y floor **high-contrast**. The candle-lit warmth is the house style across
  every package.
- **The one rule:** color encodes state, never decorates. Gold = the single primary action per
  region. Status colors always pair with a redundant icon shape. The purple DM-only vs
  player-visible signal is safety-critical and must read at a glance and in grayscale.
- **Type:** Inter (UI) + Cinzel (display headings ≥24px only) + JetBrains Mono (numbers/dice/IDs).
- **Icons:** Lucide only, 2px stroke, via CDN. No emoji.

## Key files
- `styles.css` — the only stylesheet to link; pulls in all tokens + fonts. Set `data-theme` on
  `<html>` (`tavern` | `parchment` | `high-contrast`).
- `tokens/` — color / type / spacing / fonts / base CSS.
- `components/<group>/` — React primitives (core, forms, feedback, domain). Read each `.prompt.md`.
- `SOURCES.md` — how this system relates to the separate **prototype** project (which holds the full
  click-through app, consuming this system's bundle) and to the product repo.
- `templates/system-package-picker/` — the system-agnostic front door (premade gallery + build-your-own).
- `guidelines/*.card.html` — foundation specimens.
- `readme.md` — the full design guide (content voice, visual foundations, iconography).

## Using components in an artifact
Link `styles.css`, load Lucide UMD + React + Babel + `_ds_bundle.js`, then
`const { Button, Card, HPBar, VisibilityChip } = window.DNDToolsDesignSystem_8ae046;`. See any
`components/*/*.card.html` for the exact loader boilerplate. If `_ds_bundle.js` is unavailable in a
standalone export, copy the component `.jsx` source and inline it.
