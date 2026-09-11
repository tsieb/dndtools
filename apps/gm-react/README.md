# @dndtools/gm-react

The Lamplight GM app: a React front end over the framework-free `@dndtools/core`, plus the Electron
desktop and Capacitor Android shells, LAN and cloud remote play, the cloud client, and the AI
transport. It is the only maintained GM surface ([ADR-018](../../docs/adr/018-promote-react-app-to-primary.md)).
Architecture: [`docs/architecture/`](../../docs/architecture/); design: [`docs/design/README.md`](../../docs/design/README.md).

## Run

From the repo root:

```bash
pnpm dev              # http://localhost:5273 (DEV exposes window.__rt for the verify scripts and e2e)
pnpm build            # core, cloud-fns, then this app
pnpm preview          # http://localhost:4273
pnpm typecheck
pnpm e2e              # Playwright, desktop + mobile Chromium (tests/e2e)
pnpm desktop:dev      # Electron shell against the dev server
pnpm --filter @dndtools/gm-react android:sync   # build dist and sync the Android project
pnpm --filter @dndtools/gm-react desktop:smoke  # packaged Electron smoke, including the updater
```

`node apps/gm-react/scripts/verify-{routes,roundtrip,canvas,ui}.mjs` run headless core round-trip
checks against a running dev server (`pnpm verify` manages the server itself).

## Layout

| Path                                | Role                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`, `src/app/`           | Router, shell (`AppShell.tsx`, `shell/`), `nav.ts` (the only navigation source), canvases, editors, help, i18n-aware chrome |
| `src/screens/<section>/`            | One directory or file per route surface                                                                                     |
| `src/ds/`                           | The design-system components; import through the `../ds` barrel (typed by `index.d.ts`)                                     |
| `src/styles/tokens/`                | The token layers; `src/app/screen-kit.tsx` exposes them as `T`                                                              |
| `src/runtime/`                      | `SceneRuntime.ts` (the single durable write path), `RuntimeContext.tsx`, demo seed, audio engine                            |
| `src/platform/`                     | Capabilities, lifecycle, preferences, export, secure store, `storage/coreStore.ts` and `privateStore.ts`, service worker    |
| `src/net/`, `src/cloud/`, `src/ai/` | Remote play, the cloud and billing client, the AI transport and MCP bridge                                                  |
| `src/i18n/`                         | Keyed catalogs and `t()`                                                                                                    |
| `electron/`, `android/`             | The shells ([`docs/architecture/PLATFORMS.md`](../../docs/architecture/PLATFORMS.md))                                       |
| `tests/e2e/`                        | Playwright specs; `tests/a11y/known-violations.json` is the axe register                                                    |

## Rules

- Read state with `useRuntime()` and the actor-filtered core queries; write only through
  `runtime.dispatch({ type, actorId, payload })`. Never mutate durable state or re-derive visibility.
- GUI code routes platform access through `src/platform/`; the remaining direct accesses are
  allow-listed in `platform-access-exceptions.json` and checked by `scripts/boundary-lint.ts`.
- Compose from `../ds` and tokens; every string goes through `t()` with an `en.ts` and `es.ts` entry.
- A new route is registered in `nav.ts` and `App.tsx`, gets a row in
  `docs/requirements/FEATURE-GAPS.md`, an e2e spec on both profiles, and a place in the axe gate.
