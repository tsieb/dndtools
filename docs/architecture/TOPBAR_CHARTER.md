# TopBar Responsibility Charter

This charter defines the allowed responsibility surface for `TopBar` after Epic 14.2.

## Purpose

`TopBar` exists to support navigation context and compact utility status, not content
actions.

## Included Responsibilities

`TopBar` includes tier-specific responsibilities:

1. Expanded/Medium responsibilities:
   - local navigation panel toggle (`Toggle local navigation`)
   - back / forward history controls
   - current route title context
   - command palette trigger (`Open command palette`)
   - compact utility cluster:
     - vault health badge
     - MCP pending changes badge
2. Compact responsibilities:
   - current route title context
   - command palette trigger icon
   - overflow menu (`...`) for less-frequent actions:
     - theme selection
     - settings shortcut
     - DM/Player mode switch
   - compact note editor mode: topbar back/done affordance

## Explicit Exclusions

The following are excluded from `TopBar` and must not be reintroduced:

- Dice tray shortcut button
- Manual vault refresh button
- Duplicate settings destination icon
- Create menu (`New note`, `From template`, `Create handout`)
- Sidebar/global navigation destinations

## Guardrails

1. Utility cluster is right-aligned and icon-sized.
2. Compact TopBar controls must remain minimal and thumb-reachable.
3. TopBar does not host content-local actions.
4. Any new TopBar control must justify cross-route utility relevance.
5. TopBar changes must preserve the global/local/contextual separation from
   `docs/architecture/NAVIGATION_CONTRACT.md`.

## Source Of Truth

- Component: `src/lib/ui/layout/TopBar.svelte`
