# TopBar Responsibility Charter

This charter defines the allowed responsibility surface for `TopBar` after Epic 13.2.

## Purpose

`TopBar` exists to support navigation context and compact utility status, not content
actions.

## Included Responsibilities

`TopBar` includes exactly these responsibilities:

1. Local navigation panel toggle (`Toggle local navigation`)
2. Back / forward history controls
3. Current route title context
4. Command palette trigger (`Open command palette`)
5. Compact utility cluster:
   - vault health badge
   - MCP pending changes badge

## Explicit Exclusions

The following are excluded from `TopBar` and must not be reintroduced:

- DM/Player persona toggle
- Dice tray shortcut button
- Manual vault refresh button
- Duplicate settings destination icon
- Create menu (`New note`, `From template`, `Create handout`)
- Theme toggle controls
- Sidebar/global navigation destinations

## Guardrails

1. Utility cluster is right-aligned and icon-sized.
2. TopBar does not host content-local actions.
3. Any new TopBar control must justify cross-route utility relevance.
4. TopBar changes must preserve the global/local/contextual separation from
   `docs/architecture/NAVIGATION_CONTRACT.md`.

## Source Of Truth

- Component: `src/lib/ui/layout/TopBar.svelte`
