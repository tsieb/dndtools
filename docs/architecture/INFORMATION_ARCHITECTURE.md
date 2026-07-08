# Information Architecture

This document is the source of truth for DND Tools information architecture. It reflects the React
app's IA, which is **canonical** and supersedes the earlier five-section
(Knowledge/Atlas/Session/Campaign/Settings) SvelteKit model.

The implementation source of truth is `apps/gm-react/src/app/nav.ts` (navigation sections +
`SECTION_TITLES`), rendered by `src/app/AppShell.tsx`. Routes are `react-router-dom` v6 HashRouter
paths.

## 1. Navigation Groups

Navigation is grouped rather than a flat section list. The seven primary destinations are the **Run**
and **Library** groups; **Platform**, **Player**, and **Settings** round out the shell.

### Run the table (live play)

| Destination | Route | Purpose |
| --- | --- | --- |
| Command Center | `/` | Campaign hub — resume the live scene or jump anywhere |
| Command board | `/board` | Spatial widget board — glanceable trackers at the table |
| Session | `/session` | The live scene: combat, dice, maps, and what players see |

### Library (browse-able content)

| Destination | Route | Owns |
| --- | --- | --- |
| Characters | `/characters` | PCs, NPCs, and the bestiary |
| Atlas | `/atlas` | Maps, layers, fog, and projection |
| Campaign | `/campaign` | Arcs, quests, factions, and the session log |
| Knowledge | `/knowledge` | Notes, handouts, and read-aloud text |

### Platform, Player, Settings

| Destination | Route | Purpose |
| --- | --- | --- |
| Graph & Search | `/graph` | Every entity and how it connects — actor-filtered |
| Audio | `/audio` | Soundboard cues, layered ambience, scene bindings |
| Extensions | `/extensions` | Plugins, compendium, custom objects, rules module |
| Community | `/community` | Browse modules, export work, publish the campaign wiki |
| Plans & cloud | `/upgrade` | Local-first is free; cloud features are paid |
| Player view | `/player` | The second persona: own sheet, resources, journal |
| Settings | `/settings` | Appearance, players, permissions, systems |

Each screen is implemented in `apps/gm-react/src/screens/*.tsx`.

## 2. IA Rules (Non-Negotiable)

1. `apps/gm-react/src/app/nav.ts` is the single navigation source of truth. New destinations are added
   there (with an `icon` semantic name and route), not invented ad hoc in components.
2. Every destination has exactly one home in exactly one group; a feature is not a first-class
   destination in two places.
3. Cross-group references are contextual links, not duplicate global destinations.
4. Per-destination top-bar title/subtitle come from `SECTION_TITLES` in `nav.ts` — see
   [TOPBAR_CHARTER.md](TOPBAR_CHARTER.md).
5. Section icons are mutually exclusive and drawn from the one icon vocabulary — see
   [NAVIGATION_ICONOGRAPHY.md](NAVIGATION_ICONOGRAPHY.md).

## 3. Related Contracts

- Navigation model + active-section resolution: [NAVIGATION_CONTRACT.md](NAVIGATION_CONTRACT.md)
- Layout responsiveness: [LAYOUT_TIERS.md](LAYOUT_TIERS.md)
- Product requirements (surface specs): [`../requirements/`](../requirements/)
