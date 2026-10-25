# RC-ENG-15.1 — Primary grouping and phone Screens access

Base: `e3d90eee3` (task branch `dispatch/dndtools/9aa4705d496e0ffcc063`).
Spec: `docs/planning/IA_REVIEW.md` IA-1 and its route table; ADR-013 amendment text.

## Plan

- `nav.ts`: `PRIMARY` (Screens, Characters, Maps, Story, Notes, Tools), `ROUTE_OWNERS` + `routeOwner`
  (one owner per shelled route, `settings` as the secondary utility), `LOCAL_ENTRIES` (player sheet
  under Characters, Graph under Notes), `TOOLS`. Run/Library/Platform kept for palette + home widgets.
- Shell: desktop Primary (6) + section-local nav + `Screen shortcuts` (Command Center, GM screen,
  Session) + `Pinned screens` as separate labelled landmarks; footer Settings utility only (Plans &
  cloud reached from Settings › Subscription). Rail: four DS NavRails, same grouping. Phone tabs
  Screens / Characters / Maps / More; Screens opens a chooser sheet (live screen first, shortcuts,
  All screens, pins); More lists pins, Story, Notes, Tools, local pages, vaults, Settings.
- `/tools` landing (`screens/Tools.tsx`), additive; `/audio`, `/extensions`, `/community` unchanged.
- `App.tsx` (companion path): the `/tools` route only.

## Log

- 2026-10-24: implemented nav/shell/Tools; `tsc --noEmit` clean, `vitest src/app/nav.test.ts
  src/app/shell` 15 passed, `pnpm lint` 0 errors (after tokenising three zero spacings in Tools).
