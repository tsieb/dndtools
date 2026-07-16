# @dndtools/gm-react — the GM command platform

The primary DND Tools application: a **React** frontend for the canvas-first GM Command Center,
wired to the real `@dndtools/core` Processing Core, plus Electron desktop and Capacitor Android
shells and LAN/cloud remote play. It realizes the shared design system (see `docs/design/`) and is the
only maintained GM surface (the original SvelteKit app is retired to `archive/gm-svelte`; see
[ADR-018](../../docs/adr/018-promote-react-app-to-primary.md)).

> **Design & visual reference:** [PROTOTYPE.md](./PROTOTYPE.md) — where the design system lives
> (Claude Design project + `DesignSync` MCP), the design principles (token theming, launcher-first
> IA, player-safe visibility, complexity tiers), and which sections map to which design views. Read
> it before reskinning a section. This README is the **core-wiring** reference.

## Run it

From the repo root:

```bash
pnpm dev              # vite dev server on http://localhost:5273 (exposes the DEV window.__rt seam)
pnpm build            # production build (core, then this app)
pnpm preview          # preview the build on http://localhost:4273
pnpm typecheck        # tsc --noEmit
pnpm e2e              # Playwright (desktop + mobile Chromium) — tests/e2e
pnpm desktop:dev      # run the Electron desktop shell against the dev server
pnpm --filter @dndtools/gm-react android:sync # build dist and synchronize Capacitor Android
pnpm --filter @dndtools/gm-react android:open # open the tracked project in Android Studio
```

Verify the core round-trip end-to-end in a headless browser (needs `pnpm dev` running):

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
  `persistFullState` (Dexie/IndexedDB via `src/platform/storage/coreStore.ts`). Read `runtime.state`
  (actor-filtered) and `runtime.defaultActorId`. While previewing, every command is rejected read-only.
- **`src/runtime/RuntimeContext.tsx`** — `useRuntime()` subscribes via `useSyncExternalStore`; any
  state change re-renders. In DEV it also exposes `window.__rt` (used by the verify scripts + e2e).
- **`src/net/`, `src/cloud/`** — LAN/serverless WebRTC remote play and the AWS encrypted-backup +
  Cognito auth client. The backup path uploads a recovery copy and restores only on explicit request;
  it does not merge changes between devices. `electron/` is the desktop shell (CommonJS main/preload +
  LAN discovery).
- **`src/platform/capabilities.ts`** — the centralized `RuntimeKind` / `PlatformCapabilities`
  boundary for web, Electron, and Android. Lifecycle/Back, secure secrets, async export/share,
  notifications, discovery, and native window behavior route through platform adapters rather than
  component-level global checks.
- **`android/`, `capacitor.config.ts`** — the tracked Capacitor 8 Android project and configuration.
  It packages the same `dist` renderer as `com.dndtools.gm`; custom plugins provide Keystore-backed
  secrets and native share/save export. See the
  [Android alpha runbook](../../docs/runbooks/android-alpha.md).
- **`src/app/AppShell.tsx`, `src/app/nav.ts`** — shared chrome + the section IA. **Shared — do not
  edit when porting a screen.**
- **`src/App.tsx`** — `RuntimeProvider` + `HashRouter` + routes. **Shared — the parent wires new
  routes here, not the screen author.**
- **`src/app/board-helpers.ts` + `src/app/SceneBoardCanvas.tsx`** — the shared widget-canvas
  substrate both canvas screens render: a flat `BoardWidget` view-model and the dot-grid canvas
  engine (select / drag-move / resize). Layout edits commit through dispatch on pointer-UP only.
- **`src/screens/`** — one file per screen. Core-wired canvas/data surfaces: `CommandCenter.tsx`
  (`/` launcher hub), `Board.tsx` (`/board`), `ScenesCreator.tsx` (`/scenes`), `SceneEditor.tsx`
  (`/scene/:id`). Section surfaces: `Session.tsx`, `Characters.tsx`, `Atlas.tsx`, `Campaign.tsx`,
  `Knowledge.tsx`, `Graph.tsx`, `Audio.tsx`, `Extensions.tsx`, `Community.tsx`, `Player.tsx`,
  `Settings.tsx`. See [PROTOTYPE.md](./PROTOTYPE.md) §4 for the per-section design-view mapping.

## Adding or reskinning a screen

1. **Pick the design source** — the authoritative source is the Claude Design project's
   `views/<group>.jsx` (fetch via the `claude_design` MCP `DesignSync` tool; see
   [PROTOTYPE.md](./PROTOTYPE.md) §2 for the project id, file map, and translation rules). Copy the
   **visual structure** using the `../ds` barrel components and inline token styles
   (`var(--color-…)`, `var(--space-…)`, `var(--text-…)`, `var(--font-…)`).
2. **Wire data through the core.** Read real state via `useRuntime()` + the actor-filtered core
   queries (`listScenesForActor`, `listCharactersForActor`, `listMapsForActor`,
   `resolveCommandCenterHome`, …). Mutations go through
   `runtime.dispatch({ type, actorId: runtime.defaultActorId, payload })`. Be null-safe for empty
   fresh state; drop view-model fields with no core backing.
3. **Write ONLY your screen file** in `src/screens/`. Do **not** touch `App.tsx`, `AppShell.tsx`, or
   `nav.ts` — the parent wires the route. Export a named component.
4. **Gate:** `pnpm typecheck`, `pnpm --filter @dndtools/gm-react e2e`, and `pnpm a11y:axe` must pass.

## Boundaries

This app owns rendering, platform services (Dexie/IndexedDB), remote-play transport, and command
dispatch; it depends on `@dndtools/core` via `workspace:*` and never mutates durable state directly.
GUI code (`src/screens/`, `src/app/`, `src/ds/`) must route platform access through the runtime /
storage adapter or declare a scoped exception in `platform-access-exceptions.json` (enforced by
`scripts/boundary-lint.ts`).
