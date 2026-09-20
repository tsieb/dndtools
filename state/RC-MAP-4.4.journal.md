# RC-MAP-4.4 — Map library gallery

## Scope and implementation

- Implemented on the current task branch. No unrelated working-tree changes were present. No agents, dispatcher state edits, pushes, or promotion. No AGENTS.md or callable Headroom tools were found; validation uses original command logs.
- Atlas now shows a responsive card grid and a right-hand preview on desktop (stacked on phones; existing ListDetail pane at rail widths). The existing create/editor controls, hierarchy, deep links, projection feedback and inspectors remain connected.
- Cards show 16:9 vector thumbnails, default region names, actor-filtered POI/layer counts, the durable party-location badge and delivered-map status. Name/region filtering and true empty states use `map-library`; copy is in EN/ES catalogs.
- Arrow keys move focus by actual rendered columns, Home/End reach the edges, and native button Space/Enter activation selects the preview. One roving tab stop survives filtering.
- One worker per mounted gallery serializes vector features, props, routes, POIs and ordered fog masks into escaped standalone SVG data URIs. Input comes from core actor-filtered map/layer queries. Geometry/theme changes invalidate the bounded 128-entry cache; in-flight requests are deduplicated and disposal rejects pending work.
- Browser tests and localization catalogs are companion changes; thumbnail unit tests stay within the owned atlas directory. The existing atlas projection assertion now reads the card's name instead of treating all card metadata as its name.

## Findings and corrections

- Importing React editor renderers into the worker loaded Vite's window-dependent refresh runtime. Replaced that import graph with worker-only SVG serialization; browser tests confirm the worker runs in desktop and mobile Chromium, and the production worker bundles successfully.
- The original projection regression assertion compared `innerText` line breaks from the whole new card with normalized `textContent`. Narrowed it to `.map-library-name`; both existing projection tests then passed.
- The added permission test initially used a nonexistent `map.set-visibility` command. Corrected its fixture to create a private map and delete seeded maps through supported core commands before entering player preview.

## Validation

- Thumbnail unit suite: 3 passed (escaping/disabled geometry, fog sequence, geometry/theme invalidation).
- Existing atlas e2e: all 21 applicable desktop/mobile cases passed in the combined run; one existing phone-only breadcrumb skip. The two failures in that run were the new permission test fixture described above.
- Initial thumbnail perf test: 24 uncached 500-feature renders, 0.5–1.8 ms each, all below 100 ms. The measurement includes SVG serialization and data-URI encoding inside the worker; it excludes cold worker startup and messaging. Cache reuse is asserted separately.
- App typecheck, focused ESLint, `pnpm gates` (6 gates), and production build passed. Build also passed the production dev-seam exclusion check. Existing file/chunk-size warnings remain.
- Final gallery e2e: 6 passed across desktop/mobile Chromium (`/tmp/map44-gallery-verified.log`), including Space/Enter changing the actual preview, preview positioned to the right on desktop, vertical/horizontal grid arrows, Home/End, 16:9 data URI images, region filtering, illustrated empty results, party badge and private-map omission during player preview.
- Final performance samples: 24 uncached 500-feature thumbnails, 0.5–1.4 ms each. Every sample satisfied the 100 ms assertion.
- Reviewed the generated desktop screenshot: two-column card grid beside the map preview, metadata chips and visible keyboard focus. Phone coverage passes with the stacked layout.
- Formatting and `git diff --check` passed. Final focused ESLint passed; final app typecheck log: `/tmp/map44-verified-typecheck.log`.
- Production build and quality gates preceded only the final layout/copy/test refinements; the central operator still owns independent review and candidate-wide validation.
