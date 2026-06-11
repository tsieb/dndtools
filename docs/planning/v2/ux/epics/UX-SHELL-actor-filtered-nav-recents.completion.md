# UX-SHELL — Actor-Filtered Navigation, Pinned Items, and Recents — Completion

UX workpack status: `complete`

Epic: `UX-SHELL-actor-filtered-nav-recents` (phase 02 Shell and Navigation, P0).
Branch: `ux/UX-SHELL-actor-filtered-nav-recents` (off chain tip
`ux/UX-SHELL-contextual-navigation-history-and-deep-links`, commit `aeb7c76`).
Requirements: **UX-NAV-013** (Must-have), **UX-NAV-015** (Should-have).

## Summary

Proved that player navigation, pinned items, and recents never reveal DM-only destinations or
metadata, and moved the pinned/recent strip to its UX-required position — while reusing the existing
shell, profiles, and actor-filtering foundations rather than reinventing them.

- **UX-NAV-013 — actor-filtered navigation (DM-only route hiding).** Added a Processing-Core query
  `resolveSectionRouteAccess(permission, actorId, pathname)` (the "actor-filtered nav query"): the
  seven global destinations are always available, but the genuinely DM-only *capability* routes
  (Scenes / Audio / MCP — no player and no observer access) resolve to a single generic
  `DEEP_LINK_UNAVAILABLE_MESSAGE` for any non-DM session. The shell renders the shared, non-leaking
  `DeepLinkUnavailable` page instead of the capability surface when blocked, and collapses the `h1`,
  `document.title`, landmark label, and live announcement to "Not available" so the hidden section's
  name never leaks. This is the route-level counterpart to the already-actor-filtered primary nav
  (`listNavigationRegistryForActor`) and command palette (`listPaletteCommands`), so a hidden
  capability cannot be reached through the nav DOM, the palette, OR a direct URL. Fail-closed: an
  unknown actor is treated as non-DM. Player-visible-but-observer-hidden sections
  (Characters/Campaign/Knowledge) are intentionally NOT route-gated — they render their own
  actor-filtered (possibly empty) content, the existing no-leak behavior.

- **UX-NAV-015 — pinned and recent items strip.** New `PinnedRecentStrip.svelte` renders the
  pinned + recent lists between the Command Center item and the section list in the sidebar/rail
  (split `GlobalNav` into a fixed home list, the strip, then the growing section list so Settings
  still pins to the bottom), and at the top of the Mobile "More" sheet. A pure
  `selectStripLists(pinned, recent, reachable)` helper filters BOTH lists through the
  actor-reachable set (the same `listReachableDestinations` the nav uses), drops already-pinned and
  home routes from recents, refreshes titles from the reachable set (no stale label on rename), and
  caps display to 8 pinned / 5 recent ("up to 5 recent items"). The per-page pin/unpin toggle stays
  in the subheader (`QuickAccess`, now toggle-only); per-item unpin lives in the strip (hover/focus
  on Desktop, always-visible under touch and in the sheet — never gesture-only, WCAG 2.5.7).

Foundations reused, not reimplemented: the actor-filtered navigation registry + reachable-destination
queries, the device-local `NavigationHistoryStore`, the shared `DeepLinkUnavailable` surface, the
`Dialog`/focus-trap "More" sheet, the icon registry (added `pin`/`recent` Lucide glyphs through the
single registry), platform profiles, input-modality, and design tokens.

## Demo path (Desktop / Tablet / Mobile)

- **UX-NAV-013 AC2 (all profiles).** Open `/scenes/` as the DM → the Scene authoring surface renders.
  Switch "View as" to a player (or observer) → the same route resolves to the generic "Not available"
  page: no scene form, no section name, `h1` = "Not available", title = "Not available — DND Tools
  v2". Switch back to the DM → the authoring surface returns. (The gate is purely actor-driven, so it
  is identical whether the route is reached by URL, a stale link, or an in-session actor switch.)
- **UX-NAV-013 AC1 (all profiles).** As a player, the primary nav DOM contains no `nav-scenes`,
  `nav-audio`, or `nav-mcp` element and no "Scenes" label.
- **UX-NAV-013 AC3 (all profiles).** Covered by the existing `command-palette-nav.spec.ts`: a player
  searching the palette gets no DM-only commands and no hidden-scene deep links.
- **UX-NAV-015 AC1 (Desktop/Tablet sidebar; Mobile "More" sheet).** Pin Session and Atlas via the
  subheader toggle → the strip shows both, positioned below Command Center and above the section
  list (verified by DOM order + bounding-box top on Desktop). On Mobile they appear at the top of the
  "More" sheet.
- **UX-NAV-015 AC2.** Visiting an unpinned section (Characters) surfaces it in the "Recent" group
  below the pinned group; recents are capped to 5.
- **UX-NAV-015 AC3 (player no-leak).** The DM authors a dm-only Scene ("Secret Lair") and a
  player-visible Scene ("Tavern") and visits both; the DM strip shows both. Switching to a player
  drops "Secret Lair" from the strip entirely (absent, not hidden) while "Tavern" remains.

## Actor roles tested (DM / player / observer no-leak)

- **DM** (`local-dm`): reaches every section route incl. Scenes/Audio/MCP; sees both Scenes in the
  strip.
- **Player** (`actor-player`): blocked from `/scenes` (generic unavailable page); no Scenes/Audio/MCP
  in nav; dm-only Scene absent from pinned/recent; only player-visible destinations in the strip.
- **Observer** (`actor-observer`): blocked from `/scenes` identically; unit-covered for the
  capability-route gate. Existing specs already cover observer-hidden section absence in the nav.

## Requirement → implementation → test traceability

| Requirement | Implementation | Tests |
|---|---|---|
| UX-NAV-013 AC1 (DM-only items absent from player nav DOM) | `buildGlobalNav` over `listNavigationRegistryForActor` (pre-existing); strip data actor-filtered | `actor-filtered-nav-recents.spec.ts` "AC1 … absent from the player nav DOM"; `command-palette-nav.spec.ts` |
| UX-NAV-013 AC2 (direct DM-only route → generic "Not available") | `resolveSectionRouteAccess` (core `queries/navigation.ts`); shell guard + `effectiveRouteA11y` + `DeepLinkUnavailable` in `+layout.svelte` | core `navigation-sections.test.ts` "UX-NAV-013 AC2 resolveSectionRouteAccess …" (8 cases); e2e "AC2 … generic Not available page" |
| UX-NAV-013 AC3 (palette hides DM-only commands) | `listPaletteCommands` actor filter (pre-existing) | `command-palette-nav.spec.ts` (pre-existing, re-run green) |
| UX-NAV-015 AC1 (3 pinned below Command Center, above sections) | `PinnedRecentStrip.svelte` + `GlobalNav` list split + `selectStripLists` | unit `navigation-history.test.ts` "AC1 …"; e2e "AC1/AC2 … below Command Center and above the sections" |
| UX-NAV-015 AC2 (up to 5 recents below pinned) | `selectStripLists` (`STRIP_RECENT_LIMIT = 5`, excludes pinned + home) | unit "AC2 … up to 5 recent items"; e2e recent-group assertion |
| UX-NAV-015 AC3 (player sees only accessible entities) | `selectStripLists` → `filterReachable` against `listReachableDestinations` | unit "AC3 / UX-NAV-013 … player no-leak"; e2e "AC3 … player no-leak" |

## Tests run

- Core unit (`@dndtools/v2-core`): **2845 passed** (incl. new `resolveSectionRouteAccess` suite).
- App unit (`@dndtools/v2-app`): **288 passed** (incl. extended `navigation-history.test.ts`).
- Playwright, **both** projects (`desktop-chromium` + `mobile-chromium`), full suite: **602 passed,
  24 skipped, 0 failed**.
- New spec `actor-filtered-nav-recents.spec.ts`: 4 passed × 2 projects.
- `pnpm a11y:axe` (both projects, empty `known-violations.json`): **16 passed**.
- Gates: `pnpm v2:ux-workpack:validate` ✓, `pnpm docs:validate` ✓, `pnpm lint` ✓ (eslint + nav +
  tokens + a11y:contrast + repo audit), `pnpm --filter @dndtools/v2-app typecheck` ✓ (0 errors).

## Changed files (repo-relative)

- `apps/v2/packages/core/src/queries/navigation.ts` — new `resolveSectionRouteAccess` + helpers.
- `apps/v2/packages/core/src/index.ts` — export `resolveSectionRouteAccess` / `SectionRouteAccess`.
- `apps/v2/packages/core/tests/navigation-sections.test.ts` — new UX-NAV-013 AC2 suite.
- `apps/v2/app/src/lib/gui/ux-shell/PinnedRecentStrip.svelte` — new strip component (UX-NAV-015).
- `apps/v2/app/src/lib/gui/GlobalNav.svelte` — host the strip; split home/section lists; sheet strip.
- `apps/v2/app/src/lib/gui/QuickAccess.svelte` — reduced to the per-page pin/unpin toggle.
- `apps/v2/app/src/lib/gui/icons.ts` — `pin` (Lucide `Pin`) + `recent` (Lucide `Clock`) glyphs.
- `apps/v2/app/src/lib/platform/navigation-history.ts` — `selectStripLists` + display-cap constants.
- `apps/v2/app/src/routes/+layout.svelte` — section-route guard, "Not available" a11y override,
  strip wiring, subheader pin-toggle wiring.
- `apps/v2/app/src/routes/styles.css` — strip styles + sidebar list-split flex rules.
- `apps/v2/app/tests/unit/navigation-history.test.ts` — `selectStripLists` cases.
- `apps/v2/app/tests/e2e/actor-filtered-nav-recents.spec.ts` — new e2e (UX-NAV-013/015).
- `docs/planning/v2/ux/epics/UX-SHELL-actor-filtered-nav-recents.completion.md` — this file.
- Generated UX workpack state: `docs/planning/v2/ux/workpack-state.yaml`,
  `docs/planning/v2/ux/status.yaml`, `docs/planning/v2/ux/epics/*.yaml` (status automation only).

## Known gaps / deferrals

- Drag-to-reorder of pinned items (UX-NAV-015 pointer affordance) and a dedicated "Manage pinned"
  settings screen with keyboard Move-up/Move-down are not implemented; pin order follows pin time and
  unpin is the keyboard/touch-safe management path here. No Must-have action is gesture-only.
- Strip item icons use uniform pin/recency (clock) glyphs rather than per-entity-type icons, since
  pinned/recent entries are routes; this is an honest simplification for the prototype strip.
- "Empty pinned/recent" placeholder copy is omitted: the strip renders only when it has reachable
  content, keeping the sidebar quiet for new vaults (the spec's empty-state hint is non-blocking).
- The `/scenes` authoring page itself still reads `defaultActorId` (DM) for content; the shell-level
  section gate is what enforces actor safety for non-DM sessions, so no DM data renders for them.

## Git

Branch `ux/UX-SHELL-actor-filtered-nav-recents`; committed as the single epic commit at the branch
HEAD (see `git log -1`). Final working tree is clean after commit.

Final `git status --short` (this epic's changes, pre-commit):

```
 M apps/v2/app/src/lib/gui/GlobalNav.svelte
 M apps/v2/app/src/lib/gui/QuickAccess.svelte
 M apps/v2/app/src/lib/gui/icons.ts
 M apps/v2/app/src/lib/platform/navigation-history.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/unit/navigation-history.test.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/navigation.ts
 M apps/v2/packages/core/tests/navigation-sections.test.ts
 M docs/planning/v2/ux/epics/UX-SHELL-actor-filtered-nav-recents.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/ux-shell/PinnedRecentStrip.svelte
?? apps/v2/app/tests/e2e/actor-filtered-nav-recents.spec.ts
?? docs/planning/v2/ux/epics/UX-SHELL-actor-filtered-nav-recents.completion.md
```
