# Navigation, Layout, and the App Shell

The single source of navigation truth is `apps/gm-react/src/app/nav.ts`. `apps/gm-react/src/app/AppShell.tsx`
is the only renderer of primary destinations: a sidebar on desktop, `NavRail` on tablet, and
`BottomTabBar` plus a More sheet on phones. No other module may define a primary destination.

## 1. Information architecture

Routes are `react-router-dom` v6 HashRouter paths. Every screen lives under
`apps/gm-react/src/screens/`.

| Group    | Destination    | Route         | Owns                                                    |
| -------- | -------------- | ------------- | ------------------------------------------------------- |
| Run      | Command Center | `/`           | Campaign hub: resume the live scene, jump anywhere      |
| Run      | GM Screen      | `/board`      | The table dashboard of widget tiles                     |
| Run      | Session        | `/session`    | Live play: combat, dice, handouts, projection           |
| Library  | Characters     | `/characters` | PCs, NPCs, bestiary, sheets and builders                |
| Library  | Maps           | `/atlas`      | Maps, fog, layers, points of interest, the map editor   |
| Library  | Story          | `/campaign`   | Quests, factions, NPCs, calendar, timeline              |
| Library  | Notes          | `/knowledge`  | Notes, handouts, wiki, backlinks                        |
| Platform | Graph & Search | `/graph`      | Relationship graph and faceted search (actor-filtered)  |
| Platform | Audio          | `/audio`      | Soundboard, ambience, scene packages                    |
| Platform | Extensions     | `/extensions` | Widget packages, system packages, custom types, themes  |
| Platform | Community      | `/community`  | Module publish and import, wiki publishing              |
| Platform | Plans & cloud  | `/upgrade`    | Plan comparison and billing                             |
| Footer   | Player view    | `/player`     | The second persona: own sheet, resources, journal       |
| Footer   | Settings       | `/settings`   | Vault, sync and privacy, players, AI, appearance, about |

Chrome-less routes sit outside the shell: `/play` (player companion), `/join` (invite redeem),
`/wiki` (published wiki reader), `/display` (second-screen scene display), `/scene/:id` and
`/scenes` (scene editor and library), and `/legal/*`.

Rules:

1. A destination is added in `nav.ts` with an `icon` semantic name and a route, never ad hoc in a
   component. Every destination has exactly one home in exactly one group.
2. Cross-group references are contextual links, not duplicate destinations.
3. Every user-visible word in `nav.ts` is a message key rendered with `t()`. Keys carrying a `{gm}`
   placeholder follow the active System Package's vocabulary.
4. The same IA renders in every viewport tier. A tier change is a presentation change, never an IA
   change.

## 2. Navigation layers

Navigation elements are exactly one of:

- **Global**: the grouped destinations above. Stable across routes, no content actions, rendered
  only by `AppShell`. Landmark `<nav aria-label="Primary">`.
- **Local**: browse within the active section (scene list, recent scenes). Must not duplicate
  global switching and swaps out when the section changes. Landmark labelled by section.
- **Contextual**: links between related content (backlinks, breadcrumbs). The `BackBar` in
  `screen-kit.tsx` renders `<nav aria-label="Breadcrumb">`.

Any `<nav>` without an `aria-label` is a defect. `activeSectionId(pathname)` resolves the active
section, longest matching path wins. One user action produces exactly one history push.

## 3. Viewport tiers

`useViewport()` (`apps/gm-react/src/app/useViewport.ts`) computes one `Viewport` value from
`window.matchMedia`; the breakpoints are literal in `computeViewport`, not tokens.

| Tier      | Width      | Shell                                                                   |
| --------- | ---------- | ----------------------------------------------------------------------- |
| `phone`   | ≤ 640px    | `BottomTabBar` (Command Center, Session, Characters, Maps) + More sheet |
| `rail`    | 641–1024px | Icon-only `NavRail` (64px); labels move to the accessible name          |
| `desktop` | > 1024px   | Full `Sidebar` (264px) with grouped nav, recent scenes, and the footer  |

While `session.workflow` is `active`, the desktop tier opens a right `SessionRail` (272px, collapsible);
the rail tier shows a dot on the Session entry and the phone tier a 16px accent status strip above
the tab bar. `useSessionPosture()` (`app/shell/session-posture.ts`) is the only source of "live", so
the three navigations cannot disagree.

Structural layout branches on the tier from `AppShell`, never on ad hoc `window.innerWidth` reads.
Density is orthogonal: `data-density` on the document root selects the `--density-*` token sets in
`styles/tokens/spacing.css`; touch profiles lock to comfortable and Android raises every hit target
to 48dp. Android paints behind the system bars and uses the four `env(safe-area-inset-*)` values;
`useViewportHeight` tracks the software keyboard so focused fields and sticky actions stay reachable.

Page primitives in `screen-kit.tsx`: `Page` (centered column, max 1180px), `Panel`, `Seg`, `SetRow`,
`BackBar`, and `T`, the token shorthand map. Components reference `T.*` or `var(--…)`, never raw hex.

## 4. Top bar charter

`app/shell/TopBar.tsx` gives section context and a small set of cross-route utilities. It owns:

1. The section title (`<h1>`) and subtitle from `SECTION_TITLES` in `nav.ts`, as message keys.
2. The command palette trigger (⌘K / Ctrl+K is also bound globally).
3. A status-only "Session live · 01:12" label while a session is active. No button, no link, not an
   `aria-live` region. Omitted on the phone tier, which carries the status strip instead.
4. Right-aligned utilities: `HostSessionButton`, `ViewAsControl`, `ProjectionControl`,
   `AccountButton`.

It must not host content actions (create, delete, roll, push), a duplicate settings or navigation
destination, or any control that is not relevant across routes.

## 5. Icons

One family, one weight: Lucide through `apps/gm-react/src/ds/components/core/Icon.jsx`. Section
icons (`home`, `session-bolt`, `characters-person`, `atlas-map`, `campaign-scroll`,
`knowledge-book`, `settings-gear`) are mutually exclusive. The full vocabulary and conventions are in
[`../reference/ICON_VOCABULARY.md`](../reference/ICON_VOCABULARY.md).

## 6. Feature tiers

A fresh vault starts at the `core` tier and reveals authoring and admin surfaces as it matures. The
tiers, gates, and resolver are declared data in `packages/core/src/state/onboarding.ts`
(`FeatureTier`, `FEATURE_GATES`, `visibleFeatures`, `isFeatureVisible`); the app reads them in
`apps/gm-react/src/app/Onboarding.tsx` and Settings. Core capabilities are never hidden; a gate for
an unknown feature fails closed. Decision record: [ADR-012](../adr/012-progressive-disclosure-vault-maturity.md).

## 7. Interaction rules engineers enforce

- Every screen has a route back to a list or home surface; browser back/forward stay intact.
- Android Back closes the topmost menu, dialog, or sheet, then leaves a fullscreen editor, then uses
  router history, then minimizes from the root.
- Destructive actions are undoable or confirmed, and a confirm names the thing.
- Auto-persisted surfaces show save status; failures say what to do next.
- Compact screens expose one primary top-bar action; the rest moves into a labelled overflow or a
  bounded sheet whose confirmation stays above the keyboard and safe area.
- No hover-only or gesture-only discovery. Touch targets are at least 44px (48dp on Android).
- Accessibility requirements and gates: [`../development/ACCESSIBILITY.md`](../development/ACCESSIBILITY.md).
