# The installable web app (PWA)

RC-PLT-2.1. Lamplight installs from a browser and keeps working with the network down. This is the
whole of that mechanism: three files and one rule about which runtimes get it.

## What ships

| File                                          | Role                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/gm-react/public/manifest.webmanifest`   | Name, icons, colours, `display: standalone` — what the installer reads. |
| `apps/gm-react/src/sw/service-worker.js`      | The worker itself. Source of truth; never imported by the app bundle.   |
| `apps/gm-react/vite.config.ts`                | `lamplightServiceWorker()` — emits the worker with a precache list.     |
| `apps/gm-react/src/platform/serviceWorker.ts` | Registration rule and the update toast.                                 |

Icons live in `apps/gm-react/public/` and are downscaled from the locked brand tile in
`build-resources/icon.png`. The maskable variant is the same mark flattened onto the tile ground so
it fills a full-bleed square; the mark sits inside the 80% safe circle, so a round or squircle mask
never clips it.

## Caching

The worker keeps ONE cache, named `lamplight-<version>`, where the version is a hash of the whole
build output. Activation deletes every other `lamplight-*` cache, so a new build cannot serve an old
build's chunks.

Two strategies:

- **Precached** — the offline shell: `index.html`, the entry chunk and its static imports, the
  stylesheet, the woff2 brand faces, and the public boot script/icons/manifest. Cache-first and
  never revalidated, which is safe because the file names are content hashes.
- **Everything else, and every navigation** — network-first, falling back to the cache, writing
  successful same-origin GETs back as it goes. A lazy route chunk is therefore held only after the
  DM has actually opened that route, which is what keeps the first install from pulling ~5 MB.
  A navigation that finds nothing at all returns a plain-text 503, never a blank success.

Cross-origin traffic (cloud sync, signalling, AI providers) passes straight through: it is never
cached and never replayed.

`cache.match` is called with `ignoreVary: true`. Static hosts answer with `Vary: Origin` and Vite
marks its module scripts `crossorigin`, so the browser's request carries an `Origin` header the
precache's own request did not. Honouring Vary would miss every hashed asset and the shell would
load into a blank page — this was a real failure, caught by the production check below.

## Which runtimes register it

`shouldRegisterServiceWorker` (asserted in `src/platform/serviceWorker.test.ts`):

- Browser runtime kinds only, `web` and `ios`. The Electron shell (`dndtools://app`) and the Android
  WebView ship their assets inside the package; a fetch-intercepting worker in front of them buys
  nothing and risks serving a stale copy of the shell.
- A secure context over `http:`/`https:`. Localhost counts.
- Under the Vite dev server, only when the URL carries `?sw=dev`. Without that opt-in a worker would
  attach itself to every e2e spec in the suite; only `tests/e2e/pwa-offline.spec.ts` asks for one.

A registration that fails is logged and swallowed. The app is online-only then, not broken.

## Updates

The worker never calls `skipWaiting()` on its own. A new version installs, waits, and the DM sees
one toast offering a reload — a session is not swapped out mid-encounter. Accepting it posts
`LAMPLIGHT_SKIP_WAITING` to the waiting worker and reloads on `controllerchange`. A worker that is
waiting with nothing controlling the page yet is a first install, not an update, and says nothing.

## Verifying

- `pnpm test:app` — manifest installability (the criteria Lighthouse checks: name, start URL,
  standalone display, real 192/512 icons, a maskable icon, theme colour, a linked manifest) and the
  registration rule.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/pwa-offline.spec.ts` — registers
  the worker against the dev server, warms it with one online reload, then reloads offline and
  requires the app to boot.
- Production build: `pnpm build`, then serve `apps/gm-react/dist` with `vite preview` and reload
  offline in a browser with DevTools' network throttling set to Offline. The precache path only
  exists in a real build, and the dev-server test cannot exercise it.
