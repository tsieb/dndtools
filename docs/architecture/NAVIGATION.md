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
| Run      | GM Screen      | `/board`      | The GM screen; resolves to its `/screen/:id`            |
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
| Footer   | Player view    | `/player`     | The DM shell's entry to a PC's sheet, with picker/party |
| Footer   | Settings       | `/settings`   | Vault, sync and privacy, players, AI, appearance, about |

Chrome-less routes sit outside the shell: `/play` (player companion), `/join` (invite redeem),
`/wiki` (published wiki reader), `/display` (second-screen scene display), and `/legal/*`. The
scene editor (`/scene/:id`) renders inside the shell as a `scenes` pseudo-section, and the Screens
library (`/screens`) and every screen (`/screen/:id`) as a `screens` pseudo-section:
`activeSectionId` titles them, but they are not `nav.ts` destinations.

One character sheet body (RC-CHR-6.2). `/characters/:id`, `/player` and the companion's Sheet
section render the same composition, `screens/characters/sheet/SheetBody.tsx`, with its own
sections (Sheet, Resources, Level up, Journal, History). Each route only frames it: `/characters/:id`
adds the roster's back bar and rename, `/player` keeps its route, PC picker, vitals bar and its own
Party tab, and `/play` keeps its strip. Which panels and controls appear comes from the core's
authority for the viewer on that character (`sheetCapabilitiesFor`, or the host's `sheetWrites` on
a joined companion), never from the route. A read-only preview holds no writes, so it draws no
write control.

Rules:

1. A destination is added in `nav.ts` with an `icon` semantic name and a route, never ad hoc in a
   component. Every destination has exactly one home in exactly one group.
2. Cross-group references are contextual links, not duplicate destinations.
3. Every user-visible word in `nav.ts` is a message key rendered with `t()`. Keys carrying a `{gm}`
   placeholder follow the active System Package's vocabulary.
4. The same IA renders in every viewport tier. A tier change is a presentation change, never an IA
   change.

The accepted target for the Run group is [ADR-041](../adr/041-screens-as-the-run-surface.md):
Command Center, the GM Screen and Session become **screens** — scenes carrying screen metadata —
with `/screens` as the library and `/screen/:id` for one screen, while `/`, `/board`, `/session`,
`/scenes` and `/scene/:id` resolve to a screen in a single history entry. Sidebar pins become a
user-defined Screens group under [ADR-013](../adr/013-three-layer-navigation-contract.md) rather than
new hard-coded destinations, and `nav.ts` stays the source of global IA. The tables above describe
the destinations and routes that ship today; the conversion lands in CAN-7.2 onward.

As of RC-CAN-7.3 the library and the screen route ship: `/screens` lists screens (search, sort,
tags, thumbnails, visibility, the live marker; new from template, pin, rename, duplicate, delete
with undo), and `/screen/:id` renders any screen by its layout policy with a header switcher.
`/board` resolves to the GM screen's `/screen/:id` and `/scenes` to `/screens`, each by replacing
the history entry, so a switch from the library, the switcher or the palette is one push. `/`,
`/session` and `/scene/:id` still render their own screens until CAN-7.6 and CAN-7.8.

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
   `HelpLauncher`, `AccountButton`.
5. Help (`HelpLauncher` from `app/help/HelpMenu.tsx`) on the desktop and rail tiers only. WCAG 3.2.6
   wants Help in the same place on every screen, and above 640px the top bar is the only chrome that
   follows the DM onto every route — the phone's own trigger sits in `Footer.tsx`, which those tiers
   never mount. It is 44px tall and, unlike the other utilities, keeps its visible word "Help" at
   both tiers (RC-UX-6.6, ONB-10): an "i" alone reads as About, and the guides tell a lost GM to
   "open Help". The phone's footer row carries the same word. The menu opens on the guide for the
   current route (screens, session, characters, maps, notes, settings; `guideForRoute` in
   `app/help/helpTopics.ts`) with the full list one level up: Getting started, the twelve user
   guides indexed in [`../README.md`](../README.md#user-guides), What's new (with a "New" chip while
   the latest release is unseen) and the shortcut overlay.

It must not host content actions (create, delete, roll, push), a duplicate settings or navigation
destination, or any control that is not relevant across routes.

The action budget depends on the tier, and it is the same on every route:

| Tier                          | Top bar actions                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phone (≤ 640px)               | One inline action, Search (the palette reaches every destination and command), and one overflow, **Table controls** (`aria-haspopup="dialog"`, `aria-expanded`). Its bottom sheet holds the four utilities. Nothing in the bar is filled and no status chip shows. |
| Rail and desktop under 1280px | Search and the utilities inline as 44px icon buttons (Help keeps its word), with no overflow.                                                                                                                                                                      |
| Desktop from 1280px           | The same controls with their labels.                                                                                                                                                                                                                               |

On every tier the only primary-weight (filled) control the top bar owns is Start session / End session.
On a phone it is the one filled action inside the Table controls sheet.

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
  bounded sheet whose confirmation stays above the keyboard and safe area. §8 spells this out.
- No hover-only or gesture-only discovery. Touch targets are at least 44px (48dp on Android).
- Accessibility requirements and gates: [`../development/ACCESSIBILITY.md`](../development/ACCESSIBILITY.md).

## 8. Compact primary actions (UX-002)

A compact screen is any route at the phone tier (≤ 640px wide, portrait or landscape). RC-UX-4.2
audits every screen the shell renders against these rules in
`apps/gm-react/tests/e2e/responsive.spec.ts` — one test per screen, sub-routes included
(`/scene/:id`, `/campaign/calendar`, `/campaign/relationships`, `/graph/repair`), because a screen
reached only by a card or a link is where a second primary action tends to hide:

1. **Top bar.** The phone budget in §4: the title, Search and the Table controls overflow, both at
   least 44px, with the title keeping at least half the bar's width.
2. **One primary action per screen.** The first phone screenful of the main pane (scroll position 0)
   shows at most one filled action, meaning a `Button` in the `primary` or `danger` variant. A
   selected segment, tab or toggle shows state rather than an action and does not count. Repeated
   per-item actions further down, such as the plan cards on `/upgrade`, are not the screen's
   primary action.
3. **Overflow sheets.** The trigger names what it opens (`aria-haspopup="dialog"` plus
   `aria-expanded`) and works from the keyboard. The sheet is a bounded `Sheet` whose body is the one
   scroll owner, and every control in it can be reached. Its rows are at least 44px, the current
   screen's row carries `aria-current="page"`, and Escape closes the sheet and returns focus to the
   trigger. This applies to the Table controls sheet and the All sections sheet.
4. **Keyboard-safe confirmations.** Both answers of a confirmation stay fully on screen with 360px of
   available viewport height (a reduced-height keyboard/landscape fixture) and above the Android
   bottom inset. Both answers can be activated with the keyboard; cancelling preserves the live
   session and returns focus to the opener inside the sheet.
   Escape gives the safe answer and closes only the topmost layer, so a confirmation raised from a
   sheet leaves the sheet open. `Dialog` carries this for every caller: its header and body both
   yield height and scroll what does not fit, and the footer that holds the answers keeps its own.
   Before RC-UX-4.2 the header could not shrink at all, so a long `description` pushed the answers
   out of the panel and the End session confirmation asked a destructive question with nothing to
   answer it with.

A screen that breaks a rule gets fixed by the POL story that owns it. Until then its ceiling is
recorded in the spec and may only come down.

| Where      | Gap (found 2026-09-12)                                                             | Owner      |
| ---------- | ---------------------------------------------------------------------------------- | ---------- |
| `/session` | Start session and Build encounter both fill the first phone screenful (ceiling 2). | RC-POL-1.4 |

RC-POL-1.23 closes the two shell entries from the September 12 audit: `/scenes` now
aliases `/screens`, whose All screens entry is available in sidebar, rail and phone More;
`pinned-screens.spec.ts` checks all three. Phone More now supplies `aria-haspopup="dialog"`
and its live `aria-expanded` state through BottomTabBar's optional per-entry disclosure
attributes. `shell-polish.spec.ts` checks keyboard opening, closing and focus restoration.
