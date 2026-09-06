# TopBar Responsibility Charter

This charter defines the allowed responsibility surface for the app shell's top bar.

## Purpose

The top bar exists to give the current section context and a small set of cross-route
utilities. It does **not** host content actions.

## Source Of Truth

- Renderer: the `TopBar` component in `apps/gm-react/src/app/AppShell.tsx`.
- Renderer: `apps/gm-react/src/app/shell/TopBar.tsx`.
- Title/subtitle data: `SECTION_TITLES` in `apps/gm-react/src/app/nav.ts`, resolved via
  `sectionLabelKey(id)` / `sectionSubtitleKey(id)` keyed off `activeSectionId(pathname)`.
  Both return a **message key**, never English text: the top bar renders it with `t`, so the
  title follows the locale and — where the message carries a `{gm}` placeholder — the active
  System Package's vocabulary (RC-SYS-2.6, ADR-032 §4). The board section is the "DM screen"
  under 5e and the "GM screen" under Generic without this file naming either.

## Included Responsibilities

1. **Section context** — the current section title (`<h1>`) and its subtitle line, both
   sourced from `SECTION_TITLES`.
2. **Command palette trigger** — the "Search everything… ⌘K" button that opens
   `CommandPalette` (⌘K / Ctrl+K is also bound globally in `AppShell`).
3. **Session / cross-route utilities**, right-aligned:
   - `HostSessionButton` (remote play)
   - `ViewAsControl` (actor "view as" switch)
   - `ProjectionControl` (player-view projection)
   - `AccountButton` (cloud account)

## Explicit Exclusions

The top bar must not host:

- Content actions (create note/scene, delete, dice roll, handout delivery)
- A duplicate settings or navigation destination (those belong to the sidebar/nav)
- Any control that is not relevant across routes

## Guardrails

1. The utility cluster stays right-aligned and compact.
2. Section title/subtitle come only from `SECTION_TITLES`; add a section's copy there as a
   message key in `i18n/messages/en.ts` (and `es.ts`), not as inline text in the component.
3. Any new top-bar control must justify cross-route utility relevance and preserve the
   global/local/contextual separation defined in `NAVIGATION_CONTRACT.md`.
