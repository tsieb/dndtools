# NAV-route-aliases-and-deep-links - Completion Evidence

Epic packet: `docs/planning/v2/epics/NAV-route-aliases-and-deep-links.yaml`
Workpack status: `complete` after
`pnpm v2:workpack:complete -- --epic NAV-route-aliases-and-deep-links`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **NAV-002**, **NAV-004**, **NAV-005**.

## Summary

This epic delivers the NAV "route aliases and deep links" capability branch: legacy alias
redirection, post-navigation focus restoration, and entity deep links. All three decisions are
made in the Processing Core (pure, actor-filtered, fail-closed); the GUI route shell only applies
the returned model (Contract 1).

Key pieces:

- `apps/v2/packages/core/src/queries/route-aliases.ts` (NAV-002) — derives the legacy alias table
  from the canonical Navigation Section registry (`aliases` is already NAV-009 data, so the registry
  stays the single source of truth) and resolves a requested path to its canonical redirect.
  - `resolveRouteAlias({ path, search, hash })` preserves the **search string and hash by default**
    (NAV-002 AC1): a legacy `/maps?poi=abc&x=1&y=2#layers` resolves to
    `/atlas/?poi=abc&x=1&y=2#layers`, every parameter intact. It tolerates search/hash with or
    without the leading `?`/`#` so the GUI can pass `location.search`/`location.hash` directly.
  - `buildRouteAliasTable` / `listAliasRoutes` expose the alias→canonical map. `listAliasRoutes`
    returns only **released-destination** aliases by default (a redirect to an unbuilt section would
    land on a missing page); `{ includePlanned: true }` lists all declared aliases.
  - `auditRouteAliasStubs(...)` is the NAV-002 AC2 gate: given which scaffolded alias routes are thin
    redirect stubs vs. duplicate implementations, it fails closed on `duplicate-implementation`
    ("a full duplicate legacy implementation exists instead of a redirect stub → the gate fails"),
    `unknown-alias-route`, and `missing-alias-stub` (only for released-destination aliases).
- `apps/v2/packages/core/src/queries/route-focus.ts` (NAV-004) — `resolveRouteFocus({ hash })`
  returns a discriminated focus target: a URL with a heading hash yields a `heading-anchor` target
  (and suppresses the route announcement) so the **heading scroll target stays active instead of
  unconditional landmark focus** (NAV-004 AC1, the `CODEX-PR7-HASH-FOCUS` defect); a hash-less
  transition yields a `route-landmark` target that announces the route (NAV-004 AC2). It decodes a
  percent-encoded hash and treats `#`, `#top`, and empty as "no anchor".
- `apps/v2/packages/core/src/queries/deep-links.ts` (NAV-005) — `resolveDeepLink(state, actor,
target)` for `map | scene | note | object | character | search-result` links. It evaluates
  visibility in the core before exposing any selection and returns either `restore` (entity name,
  restored region/tab/section, and the route to land on — NAV-005 AC1) or `unavailable`. The
  unavailable result buckets the reason (`hidden` / `not-cached` / `not-found`) for diagnostics but
  uses **one generic, non-leaking message** for every case, so a player cannot distinguish "hidden
  from you" from "does not exist" (NAV-005 AC2); it preserves the non-sensitive `sectionId` and link
  kind so the shell renders a coherent unavailable page (NAV-005 AC3). Map and Scene targets resolve
  against real prototype state; note/object/character/search-result targets resolve to
  `unavailable:not-cached` (their domains are not yet in v2 durable state) — fail-closed, never
  leaking, with each domain plugging its visibility-filtered lookup into its branch when it lands.
- `apps/v2/packages/core/src/queries/navigation-sections.ts` / `navigation.ts` — the **Atlas**
  section is flipped from `planned` to `released` so it is the map deep-link landing surface
  (`/atlas`). Atlas is available to all roles; its authoring/local-nav UI remains owned by the MAP
  feature epics.
- GUI route shell:
  - `apps/v2/app/src/lib/state/alias-redirect.ts` — one shared `redirectLegacyAlias(url)` helper
    that calls `resolveRouteAlias` and issues a 301. Each alias route (`home`, `canvas`, `maps`,
    `map`, `preferences`) is a one-line `+page.ts` stub delegating to it — a redirect stub, not a
    duplicate implementation (NAV-002 AC2). Only released-destination aliases are scaffolded; the
    planned-section aliases (`/notes`, `/sessions`, …) are deferred to their feature epics.
  - `apps/v2/app/src/routes/atlas/+page.svelte` — the map deep-link surface: parses
    `?map=&poi=` into a `DeepLinkTarget`, renders the restored map viewport/POI on `restore`, and a
    single generic unavailable panel on `unavailable` (never naming the target). It also lists the
    actor-visible maps as deep-link entry points, filtered the same way the resolver filters them.
  - `apps/v2/app/src/routes/+layout.svelte` — wires `resolveRouteFocus` after each navigation: a
    heading hash focuses + scrolls the named heading and suppresses the announcement (NAV-004 AC1);
    a normal transition focuses the `<main>` route landmark (now `tabindex="-1"`), scrolls to top,
    and announces (NAV-004 AC2). A focus key keyed on path+hash+announcement prevents an unrelated
    re-render (e.g. a "view as" switch) from re-stealing focus.
  - `apps/v2/app/src/lib/state/navigation-location.ts` — maps `/atlas` to the Atlas section.

## Demo Path

Run `pnpm v2:dev` from the repo root and open the app (dev port 5183; preview/e2e port 4183).

1. **Legacy alias redirect preserving params/hash (NAV-002 AC1).** Visit
   `/maps/?poi=region-coast&x=1&y=2`. The app 301-redirects to `/atlas/?poi=region-coast&x=1&y=2`
   with every search parameter intact; the Atlas map deep-link surface loads and focuses Storm
   Coast. Try `/map/?poi=region-north-road#layers` (hash preserved), `/home/` → `/`, `/canvas/` →
   `/scenes/`, `/preferences/` → `/settings/`.
2. **Heading-hash deep link keeps the heading active (NAV-004 AC1).** Visit `/atlas/#maps`. The
   "Maps" heading — not the route landmark — receives focus and scroll, and the route announcer
   stays silent for the within-page jump. Navigate by primary nav with no hash (e.g. click
   **Atlas**) and the `<main>` route landmark is focused and the announcer names the route
   (NAV-004 AC2). Browser back/forward keeps these semantics coherent.
3. **Map POI deep link restores the viewport (NAV-005 AC1).** Visit
   `/atlas/?map=map-western-reaches&poi=region-coast`. The viewport opens "Western Reaches" focused
   on "Storm Coast". The Atlas map list links (`Open at …`) are themselves POI deep links.
4. **Hidden target → generic unavailable, no leak (NAV-005 AC2).** Open
   `/atlas/?map=map-ruined-keep&poi=region-secret-cellar` as the DM (it opens), then switch **View
   as → Demo Player**: the viewport is replaced by one generic "Content unavailable" panel that
   names neither "Ruined Keep" nor "Secret Cellar".
5. **Uncached target → unavailable, route state preserved (NAV-005 AC3).** Visit
   `/atlas/?map=map-never-synced`. The Atlas section still renders around a generic unavailable
   notice; no content is exposed.

Playwright specs `route-aliases.spec.ts`, `route-focus.spec.ts`, and `deep-links.spec.ts` drive all
of the above on desktop and mobile Chromium.

## Requirement Traceability

| Requirement                                                                                                                      | Implementation                                                                                                                                                                                                          | Test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NAV-002** — generate/validate legacy route aliases from a route alias table, preserving search params and hashes by default    | `route-aliases.ts` (`resolveRouteAlias`, `buildRouteAliasTable`, `listAliasRoutes`, `auditRouteAliasStubs`); GUI `alias-redirect.ts` + alias `+page.ts` redirect stubs (`home`, `canvas`, `maps`, `map`, `preferences`) | Core `route-aliases.test.ts` (table derivation incl. released flag; param+hash preservation; sigil tolerance; home normalization; null for non-alias; AC2 audit: pass, duplicate-implementation, missing-stub, unknown-alias). App gate `route-alias-audit.test.ts` (reads real route dirs, every stub is a thin redirect, fails when a stub gains its own page). E2e `route-aliases.spec.ts` (`/maps`,`/map`,`/home`,`/canvas`,`/preferences` redirect; params+hash preserved). |
| **NAV-004** — focus restoration preserves back/forward, hash anchors, scroll, route landmarks, deep-link semantics               | `route-focus.ts` (`resolveRouteFocus`); `+layout.svelte` applies heading-anchor vs. route-landmark focus, scroll, and conditional announcement; `<main tabindex="-1">` landmark; `styles.css` focus/scroll-margin       | Core `route-focus.test.ts` (heading-anchor target + suppressed announce for AC1; percent-decoded anchor; `#`/`#top`/empty → landmark; landmark target + announce for AC2; bare-call default). E2e `route-focus.spec.ts` (heading hash focuses heading not landmark + silent announcer; hash-less transition focuses landmark + announces; back/forward coherent).                                                                                                                |
| **NAV-005** — map/Scene/note/object/character/search deep links restore the selected entity/viewport/tab/section when authorized | `deep-links.ts` (`resolveDeepLink`, `DEEP_LINK_UNAVAILABLE_MESSAGE`); Atlas `+page.svelte` map deep-link surface; Atlas released in the registry                                                                        | Core `deep-links.test.ts` (AC1 map POI focus for DM + player, default-region fallback, Scene restore; AC2 hidden map/scene → generic message identical to missing, unknown actor fail-closed; AC3 uncached map + not-yet-implemented domains preserve section). E2e `deep-links.spec.ts` (AC1 POI viewport focus desktop+mobile; AC2 hidden map → generic unavailable, no map, no leaked names; AC3 unknown map → unavailable with Atlas section preserved).                     |

### Acceptance criteria

- **NAV-002 AC1** — "a legacy map URL `?poi=abc&x=1&y=2` → all search parameters preserved."
  `resolveRouteAlias` carries search and hash verbatim; covered in core unit + e2e (the exact
  `?poi=abc&x=1&y=2` case and a hash case).
- **NAV-002 AC2** — "a full duplicate legacy implementation instead of a redirect stub → the route
  audit gate fails." `auditRouteAliasStubs` returns `duplicate-implementation`; the app gate
  `route-alias-audit.test.ts` reads the real stubs and fails closed if any gains its own page.
- **NAV-004 AC1** — "a URL with a heading hash → the heading scroll target remains active instead of
  unconditional landmark focus." `resolveRouteFocus` returns a `heading-anchor` target; the shell
  focuses/scrolls the heading and suppresses the announcement; e2e asserts the heading (not the
  landmark) is focused and the announcer is silent.
- **NAV-004 AC2** — "a normal route transition without hash → the route landmark receives focus and a
  live announcement." `route-landmark` target; the shell focuses `<main>` and announces; e2e asserts
  both.
- **NAV-005 AC1** — "a deep link targets a visible POI → the map viewport focuses the POI."
  `resolveDeepLink` returns `restore` with the region; the Atlas surface renders the focused
  viewport; covered for DM and player at unit + e2e level.
- **NAV-005 AC2** — "the target is hidden from a player → a generic unavailable state without
  revealing the hidden target." One generic message identical for hidden/missing; the viewport is
  never rendered and no target name appears; covered at unit + e2e level.
- **NAV-005 AC3** — "the target is not cached locally → unavailable while preserving non-sensitive
  route state." `unavailable:not-cached` keeps the `sectionId`/kind; the Atlas section renders
  around the notice; covered at unit + e2e level.

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** alias resolution, focus policy, and deep-link
  resolution (including all visibility decisions) are pure Processing-Core functions. The GUI owns
  route-shape facts (the URL, search, hash, query params, which heading id to focus) and applies the
  returned model; it makes no aliasing, focus, or visibility policy decision. The alias and deep-link
  audits keep route-tree knowledge in app tests and the rules in the core.
- **Contract 3 (Role, Visibility & Permission Grant Model):** `resolveDeepLink` evaluates map and
  Scene visibility in the core before any selection is exposed; a hidden target yields a generic
  `unavailable` indistinguishable from a missing one (fail-closed, no leak), and a Scene section
  outside a player's assigned set is dropped rather than revealed. The Atlas map list is filtered the
  same way so the list never surfaces a map a deep link would refuse.
- **Contract 4 (Scene and Widget Contract):** Scene deep links restore an open Scene and an
  optional player-view-allowed section without mutating durable Scene/widget state — links navigate;
  they do not write.
- **ADR-014 boundary:** new core modules import only core types (no Svelte/DOM/platform/Node/v1
  imports); the app imports core only through its public API and reads `src/routes` only inside
  tests. The alias redirect uses SvelteKit's `redirect`, kept in the app layer. Boundary lint passes.
  No durable state, sync units, or persistence were added — aliasing/focus/deep-link results are
  derived, and Atlas being released is static IA data.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic NAV-route-aliases-and-deep-links --status active
pnpm v2:workpack:validate                              # passed
pnpm v2:lint                                           # v2 boundary lint passed
pnpm v2:typecheck                                      # core tsc + app svelte-check: 0 errors
pnpm --filter @dndtools/v2-core test                   # 25 files, 243 tests passed (28 new across 3 files)
pnpm --filter @dndtools/v2-app test                    # 7 files, 25 tests passed (3 new alias-audit)
pnpm exec prettier --check <changed files>             # all matched files use Prettier style
pnpm --filter @dndtools/v2-app exec playwright test route-aliases route-focus deep-links route-accessibility canonical-sections contextual-navigation
# 43 passed, 1 profile-skipped across desktop + mobile (new NAV-002/004/005 specs + existing NAV, no regressions)
pnpm --filter @dndtools/v2-app exec playwright test
# 92 passed, 8 profile-skipped (full v2 e2e suite, no failures)
pnpm v2:workpack:complete -- --epic NAV-route-aliases-and-deep-links
pnpm v2:workpack:validate                              # passed
```

## Quality Review Summary

- **Correctness:** NAV-002/004/005 and all seven acceptance criteria are implemented and covered at
  unit, app-gate, and e2e level, including param/hash preservation, the duplicate-implementation
  gate, heading-hash vs. landmark focus, map POI restore, the fail-closed generic-unavailable state,
  and the uncached/route-preserving case.
- **Architecture:** aliasing, focus, and deep-link resolution are core-owned pure functions derived
  from the existing registry/state; no parallel source of truth was added (the alias table is derived
  from the registry's `aliases`; Atlas being released is one registry field flip).
- **Tests:** 28 new core unit tests (`route-aliases`, `route-focus`, `deep-links`), 3 new app-gate
  tests (`route-alias-audit`), 11 new e2e cases across 3 specs (desktop + mobile). All prior core
  (215), app-unit (22), and NAV/CANVAS/CMD e2e suites pass unchanged.
- **Accessibility:** focus restoration is the heart of NAV-004 — a heading hash lands focus on the
  heading (made programmatically focusable) instead of the landmark stealing it; a normal transition
  focuses the route landmark and announces it; the landmark focus outline is suppressed and headings
  get `scroll-margin-top`. The deep-link unavailable panel uses `role="status"`.
- **Performance:** all three resolvers are in-memory transforms over a handful of sections/maps; no
  network, render loop, or background work. Alias redirects are a single 301 in a `load`. The focus
  effect re-runs only when path+hash+announcement change.
- **Security / Permissions:** `resolveDeepLink` is fail-closed — a hidden map/scene, an unknown
  actor, or a non-DM-visible section yields a single generic message that names no entity and is
  identical to the missing-target message, so a player cannot probe for hidden content via deep
  links. The Atlas list and the deep-link resolver apply the same visibility filter.
- **Persistence / Sync/offline:** no durable state, operation-log entries, or sync units added.
  Aliasing/focus/deep-link results are derived from already-local state and are fully offline; the
  uncached case (a target absent from local state) is exactly the offline-AC3 behavior — unavailable
  with route state preserved, no content exposed.
- **UX:** legacy URLs no longer dead-end; map deep links land focused on the requested POI; a stale
  POI degrades to the map's default region; a hidden/missing/uncached target shows one clear,
  non-alarming unavailable panel rather than an error or a leak.
- **Maintainability:** three small pure core modules with one public function each (plus audits), one
  shared 1-line GUI redirect helper reused by five thin stubs, one new route page, and a localized
  layout focus effect. The alias table and deep-link branches are data-driven so future
  sections/domains extend them without new abstractions.
- **Docs:** this evidence file records traceability, demo path, verification, quality review, and
  gaps; the registry/module doc comments were updated for Atlas's release and the alias/redirect
  ownership split.

## Known Gaps / Deferred

- **Planned-section aliases are deferred:** only released-destination aliases (`/home`, `/canvas`,
  `/maps`, `/map`, `/preferences`) have scaffolded redirect stubs. Aliases for still-planned sections
  (`/notes`,`/wiki`,`/vault`,`/sessions`,`/play`,`/world`,`/party`,`/pcs`,`/sound`,`/music`,`/ai`,
  `/agents`) are in the alias table but intentionally have no stub yet — a redirect to an unbuilt
  section would 404. `auditRouteAliasStubs` only requires released-destination stubs; each section's
  feature epic adds its alias stub when it flips to `released`.
- **note/object/character/search-result deep links resolve to `unavailable:not-cached`:** those
  domains are not yet in v2 durable state (ADR-014 first-slice scope), so their deep links fail
  closed today. The resolver, result contract, and tests already cover them; each domain plugs its
  visibility-filtered lookup into its `resolveDeepLink` branch when it lands.
- **Atlas is a deep-link landing surface, not the full Maps section:** it renders the deep-linked map
  viewport/POI and an actor-visible map list, but map authoring, layers, fog, and the full local-nav
  contract remain owned by the MAP feature epics. Atlas is released only to host the NAV-005 map
  deep-link behavior this epic requires.
- **Map "viewport focus" is a logical restore, not a rendered canvas:** consistent with ADR-014 (no
  map/canvas rendering engine in the first slice), the restored POI is shown as the focused
  region/POI selection, not a pan/zoom on a rendered map. The selection contract is in place for the
  MAP rendering epic to drive a real viewport.
- **No axe-core scan added:** NAV-004 focus behavior is covered by targeted structural e2e
  assertions (which element is focused, announcer text). A broader automated axe pass over v2 routes
  remains a future cross-cutting accessibility task, consistent with ADR-014.

## Git Evidence

Branch: `epic/NAV-route-aliases-and-deep-links` (based on the completed v2 epic chain at
`622c582`, the `NAV-ia-validation-and-accessibility-semantics` HEAD).

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic NAV-route-aliases-and-deep-links --status active
pnpm v2:workpack:complete -- --epic NAV-route-aliases-and-deep-links
```

Changed files (epic scope):

```text
apps/v2/app/src/lib/state/alias-redirect.ts
apps/v2/app/src/lib/state/navigation-location.ts
apps/v2/app/src/routes/+layout.svelte
apps/v2/app/src/routes/atlas/+page.svelte
apps/v2/app/src/routes/atlas/+page.ts
apps/v2/app/src/routes/canvas/+page.ts
apps/v2/app/src/routes/home/+page.ts
apps/v2/app/src/routes/map/+page.ts
apps/v2/app/src/routes/maps/+page.ts
apps/v2/app/src/routes/preferences/+page.ts
apps/v2/app/src/routes/styles.css
apps/v2/app/tests/e2e/deep-links.spec.ts
apps/v2/app/tests/e2e/route-aliases.spec.ts
apps/v2/app/tests/e2e/route-focus.spec.ts
apps/v2/app/tests/unit/route-alias-audit.test.ts
apps/v2/app/tests/unit/route-audit.test.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/deep-links.ts
apps/v2/packages/core/src/queries/navigation-sections.ts
apps/v2/packages/core/src/queries/navigation.ts
apps/v2/packages/core/src/queries/route-aliases.ts
apps/v2/packages/core/src/queries/route-focus.ts
apps/v2/packages/core/tests/command-availability.test.ts
apps/v2/packages/core/tests/deep-links.test.ts
apps/v2/packages/core/tests/navigation-ia-validation.test.ts
apps/v2/packages/core/tests/navigation-sections.test.ts
apps/v2/packages/core/tests/route-aliases.test.ts
apps/v2/packages/core/tests/route-focus.test.ts
docs/planning/v2/epics/NAV-route-aliases-and-deep-links.yaml
docs/planning/v2/epics/NAV-route-aliases-and-deep-links.completion.md
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after `pnpm v2:workpack:complete` and before the final commit:

```text
 M apps/v2/app/src/lib/state/navigation-location.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/unit/route-audit.test.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/navigation-sections.ts
 M apps/v2/packages/core/src/queries/navigation.ts
 M apps/v2/packages/core/tests/command-availability.test.ts
 M apps/v2/packages/core/tests/navigation-ia-validation.test.ts
 M apps/v2/packages/core/tests/navigation-sections.test.ts
 M docs/planning/v2/epics/NAV-route-aliases-and-deep-links.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/src/lib/state/alias-redirect.ts
?? apps/v2/app/src/routes/atlas/
?? apps/v2/app/src/routes/canvas/
?? apps/v2/app/src/routes/home/
?? apps/v2/app/src/routes/map/
?? apps/v2/app/src/routes/maps/
?? apps/v2/app/src/routes/preferences/
?? apps/v2/app/tests/e2e/deep-links.spec.ts
?? apps/v2/app/tests/e2e/route-aliases.spec.ts
?? apps/v2/app/tests/e2e/route-focus.spec.ts
?? apps/v2/app/tests/unit/route-alias-audit.test.ts
?? apps/v2/packages/core/src/queries/deep-links.ts
?? apps/v2/packages/core/src/queries/route-aliases.ts
?? apps/v2/packages/core/src/queries/route-focus.ts
?? apps/v2/packages/core/tests/deep-links.test.ts
?? apps/v2/packages/core/tests/route-aliases.test.ts
?? apps/v2/packages/core/tests/route-focus.test.ts
?? docs/planning/v2/epics/NAV-route-aliases-and-deep-links.completion.md
```

After the final commit, `git status --short` is clean (no untracked or unstaged files).
