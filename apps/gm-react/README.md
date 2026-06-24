# @dndtools/gm-react — React prototype port

A parallel **React** frontend that reproduces the polished online design prototype and wires it to the
real `@dndtools/core` Processing Core. It is a complete, functional prototype of the GM app (a
candidate to later port back to Svelte). It is **fully isolated** from the production Svelte app
(`apps/gm`).

> **Design & visual-match reference:** [PROTOTYPE.md](./PROTOTYPE.md) — where the online prototype
> lives (Claude Design project + `DesignSync` MCP), the design principles (token theming, the
> launcher-first IA, player-safe visibility, complexity tiers), and exactly which sections are
> matched vs deferred. Read it before reskinning a section. This README is the **core-wiring**
> reference.

## Run it

From the repo root:

```bash
pnpm dev:react        # vite dev server on http://localhost:5273
pnpm build:react      # production build
pnpm preview:react    # preview the build on http://localhost:4273
pnpm typecheck:react  # tsc --noEmit
```

Verify the core round-trip end-to-end in a headless browser (needs `pnpm dev:react` running):

```bash
node apps/gm-react/scripts/verify-roundtrip.mjs   # foundation: load → dispatch → persist → reload
node apps/gm-react/scripts/verify-canvas.mjs      # canvas surfaces: /board + /scene/:id + content round-trip
```

## Architecture

- **`src/ds/`** — the design-package React components (`.jsx`), imported through the barrel
  **`import { Card, Button, Icon, ... } from '../ds'`**. A typed facade `src/ds/index.d.ts` types
  every export loosely so `tsc` doesn't treat the untyped-jsx props as required. `Icon` is backed by
  `lucide-react` (semantic name → registry). **Always import DS components from the `../ds` barrel.**
- **`src/runtime/SceneRuntime.ts`** — observable class owning the `CoreStateSlice`. The **single
  write choke point**: `runtime.dispatch(command)` runs the pure `dispatchCommand` reducer then
  `persistFullState` (Dexie/IndexedDB). Read `runtime.state` (actor-filtered) and
  `runtime.defaultActorId`. While previewing, every command is rejected read-only.
- **`src/runtime/RuntimeContext.tsx`** — `useRuntime()` subscribes via `useSyncExternalStore`; any
  state change re-renders. Get the runtime in a screen with `const runtime = useRuntime();`.
- **`src/app/AppShell.tsx`, `src/app/nav.ts`** — shared chrome + the section IA. **Shared — do not
  edit when porting a screen.**
- **`src/App.tsx`** — `RuntimeProvider` + `BrowserRouter` + routes. **Shared — the parent wires new
  routes here, not the screen author.**
- **`src/app/board-helpers.ts` + `src/app/SceneBoardCanvas.tsx`** — the shared widget-canvas
  substrate both canvas screens render: a flat `BoardWidget` view-model (raw layout merged with the
  actor-scoped binding kind) and the dot-grid canvas engine (select / drag-move / resize, two
  overflow policies). Layout edits commit through the parent's dispatch on pointer-UP only.
- **`src/screens/`** — one file per screen. Core-wired canvas/data surfaces: `CommandCenter.tsx`
  (`/` launcher hub), `Board.tsx` (`/board`, the Command Center spatial widget board),
  `ScenesCreator.tsx` (`/scenes`), `SceneEditor.tsx` (`/scene/:id`, the scene canvas editor).
  Section surfaces (ported from the online prototype, populated from `mockCampaign`): `Session.tsx`,
  `Characters.tsx` (+ MaraSheet), `Atlas.tsx`, `Campaign.tsx`, `Knowledge.tsx`, `Graph.tsx`,
  `Audio.tsx`, `Extensions.tsx`, `Community.tsx`, `Player.tsx`, `Settings.tsx` (11 subpages). See
  [PROTOTYPE.md](./PROTOTYPE.md) §4 for the per-section match status.

## Porting a screen (subagent contract)

1. **Pick the source** — the authoritative source is the online Claude Design project's
   `views/<group>.jsx` (fetch via the `claude_design` MCP `DesignSync` tool; see
   [PROTOTYPE.md](./PROTOTYPE.md) §2 for the project id, file map, and the port translation rules).
   The older local `docs/design-package/ui_kits/command-center/<screen>.jsx` export is a fallback,
   not current. Copy the **visual structure** faithfully using the `../ds` barrel components and
   inline token styles (`var(--color-…)`, `var(--space-…)`, `var(--text-…)`, `var(--font-…)`).
2. **Wire data through the core, not the mock.** The package screens read `window.DNDData`/`DNDHub`
   mock globals — DON'T. Read real state via `useRuntime()` + the actor-filtered core queries
   (`listScenesForActor`, `listCharactersForActor`, `listMapsForActor`, `resolveCommandCenterHome`,
   …) exactly as the matching production file **`apps/gm/src/routes/**/+page.svelte`** does — that
   Svelte route is your wiring reference for which queries/commands a screen uses. Mutations go
   through `runtime.dispatch({ type, actorId: runtime.defaultActorId, payload })`. Be null-safe for
   empty fresh state; **drop mock fields with no core backing** (mirror the +page.svelte keep/drop).
3. **Write ONLY your screen file** in `src/screens/`. Do **not** touch `App.tsx`, `AppShell.tsx`,
   `nav.ts`, or other screens — the parent wires the route. Export a named component.
4. **Gate:** `pnpm --filter @dndtools/gm-react typecheck` must pass. Report your file path, the
   exported component name, and the route it should mount at.

## Isolation

`apps/gm-react/` is excluded from the repo's `eslint`/`prettier` and is not referenced by the
`--filter`ed root `build`/`test`/`typecheck` or the boundary lint. Committing the app requires
committing the updated `pnpm-lock.yaml` (CI runs `pnpm install --frozen-lockfile`).
