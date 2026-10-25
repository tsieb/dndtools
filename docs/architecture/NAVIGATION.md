# Navigation, Layout, and the App Shell

The [pre-release navigation review](../planning/IA_REVIEW.md) records decision IA-1 (accepted
2026-10-24, ADR-013 amended). RC-ENG-15.1 implements its grouping and phone Screens access, RC-ENG-15.2 its
vocabulary and table controls (§4); this page is the implemented contract.

The single source of navigation truth is `apps/gm-react/src/app/nav.ts`. `apps/gm-react/src/app/AppShell.tsx`
is the only renderer of primary destinations: a sidebar on desktop, `NavRail` on tablet, and
`BottomTabBar` plus a More sheet on phones. No other module may define a primary destination.

## 1. Information architecture

Routes are `react-router-dom` v6 HashRouter paths. Every screen lives under
`apps/gm-react/src/screens/`.

Six primary sections, in this order (`PRIMARY` in `nav.ts`). Every shelled route has exactly one
owner (`ROUTE_OWNERS`, resolved by `routeOwner(pathname)`); `src/app/nav.test.ts` holds that table
equal to App.tsx's `<Route path>` list, so a new route cannot ship without an owner.

| Section    | Landing       | Also owns                                                                         |
| ---------- | ------------- | --------------------------------------------------------------------------------- |
| Screens    | `/screens`    | `/`, `/board`, `/session`, `/screen/:id`, `/scenes`, `/scene/:id`, `/scene-cards` |
| Characters | `/characters` | `/characters/:id`, `/player` (local page: the player sheet)                       |
| Maps       | `/atlas`      | Maps, fog, layers, points of interest, the map editor                             |
| Story      | `/campaign`   | `/campaign/calendar`, `/campaign/relationships`                                   |
| Notes      | `/knowledge`  | `/knowledge/:id`, `/graph`, `/graph/repair` (local page: Graph & search)          |
| Tools      | `/tools`      | `/audio`, `/extensions`, `/community`                                             |

`/tools` is an additive landing (`screens/Tools.tsx`) that links to Audio, Extensions and Community;
those keep their own routes and bookmarks, and the experience tier still hides a gated link
(RC-UX-6.4) while its route stays open. Settings is the secondary utility and owns `/settings` and
`/upgrade` (Plans & cloud, reached from Settings › Subscription); neither is a primary section.

The default run screens (Command Center, the GM screen, Session) are **Screen shortcuts** and the
user's pins are **Pinned screens**: workspace shortcuts in their own labelled regions, not sections.
A section's local pages (`LOCAL_ENTRIES`: the player sheet under Characters, Graph under Notes)
appear in a landmark named for the section while that section is current. Legacy routes are kept.

Chrome-less routes sit outside the shell: `/play` (player companion), `/join` (invite redeem),
`/wiki` (published wiki reader), `/display` (second-screen scene display), and `/legal/*`. The
scene editor (`/scene/:id`) renders inside the shell as a `scenes` pseudo-section, and the Screens
library (`/screens`) and every screen (`/screen/:id`) as a `screens` pseudo-section:
`activeSectionId` identifies their sections, but they are not `nav.ts` destinations. A listed
screen uses its stored name in the shell heading, toolbar and document title (RC-CAN-8.4).

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
   component. Every route has exactly one owning section in `ROUTE_OWNERS`; the primary list stays
   at six.
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
the history entry, so a switch from the library, the switcher or the palette is one push.

As of RC-CAN-8.7 the library has no heading of its own (the top bar titles it) and lists the GM's
screens first, under "<GM> screens", and the screens shared with players after them, under "Player
scenes". Visibility draws that line, nothing else. The atmosphere scene cards left the library for
their own page, `/scene-cards`, a `sceneCards` pseudo-section titled by `activeSectionId` like the
screens. Three places link to it, all for the GM only: the library's player section, which a filter
matching no screen does not hide; the Session screen's Now playing panel; and the atmosphere
(`audio`) widget in view mode (`SceneCardsShortcut` in `app/widgets/builtin/AudioBody.tsx`; the path
is `SCENE_CARDS_PATH` in `app/nav.ts`).

As of RC-CAN-7.9 no Run route renders a surface of its own. `/` reads the default `command-center`
screen and `/session` the default `session` screen, each provisioned on first visit
(`command-center.ensure-home`) and drawn in reading mode from the flow policy's own placement and
view-mode tiles (`FlowViewTile`), so either reads the same at its `/screen/:id`. `/board` has no
page behind it: a GM is provisioned and redirected (`BoardAlias`), a player gets the GM-only
notice, and a failed provisioning write gets a Retry, never a board outside a screen. The board
engine (`screens/Board.tsx`) only renders a screen `/screen/:id` hands it; handed none, it draws
those two states (`GmScreenUnavailable`). The Screen shortcuts (Run the table) in
the sidebar, rail and phone Screens chooser open the Command Center and Session screens' `/screen/:id` once
they exist (`sectionPath`, CAN-7.4); the GM Screen entry opens `/board`, which resolves as above.

RC-CAN-8.4 consolidates screen editing at `/screen/:id?edit=1`. The board keeps one toolbar and
its bounded canvas/flow layout engine; edit mode exposes the layout policy, details (including
background), player preview, and the selected tile's inspector (including bindings). There is no
"Open in scene editor" action. A bookmark to `/scene/<screenId>` replaces its history entry with
`/screen/<screenId>?edit=1`, retaining other query parameters and navigation state. A template
scene, which is excluded from the screens library, retains its template editor at `/scene/:id`.
Done removes `edit=1` in place; switching screens resets selection and open drawers.

The durable scene name is the display name in the library, switcher, shell `<h1>`, screen toolbar
and browser title (`useScreenRouteName` → `useDocumentTitle`, RC-ENG-9.1). Renaming a screen updates
all of these. Existing names are preserved rather than substituted at render time. The core
home-board builder seeds "DM screen" from every entry point, including a fresh visit to `/`,
`/screens` or `/board`; the separate default Command Center flow screen retains its own name.
Player preview suspends writes and makes the underlying canvas and drawers inert; exiting preview returns to the same edit mode and unsaved details. A selected tile opens its
inspector. On a phone, where the inspector covers the board, a tile the Add gallery just placed is
selected with the inspector shut until the GM taps it or presses Enter on it. While a bounded screen's
layout is edited, its tile bodies clip rather than scroll (the frame owns the keys); Done restores
scrolling.

## 2. Navigation layers

Navigation elements are exactly one of:

- **Global**: the six sections above. Stable across routes, no content actions, rendered only by
  `AppShell`. Landmark `<nav aria-label="Primary">`; the current section is `aria-current="page"`.
- **Workspace shortcuts**: `<nav aria-label="Screen shortcuts">` (the default run screens) and
  `<nav aria-label="Pinned screens">` (the pins, actor-filtered, in the GM's order, Alt+Arrow to
  reorder). New screen is a content action beside the pins, outside both and outside Primary. Being
  on a pinned screen marks the pin and the Screens section, each in its own landmark.
- **Local**: browse within the active section (scene list, recent scenes). Must not duplicate
  global switching and swaps out when the section changes. Landmark labelled by section.
- **Contextual**: links between related content (backlinks, breadcrumbs). The `BackBar` in
  `screen-kit.tsx` renders `<nav aria-label="Breadcrumb">`.

Any `<nav>` without an `aria-label` is a defect. `activeSectionId(pathname)` resolves the active
section, longest matching path wins. One user action produces exactly one history push.

## 3. Viewport tiers

`useViewport()` (`apps/gm-react/src/app/useViewport.ts`) computes one `Viewport` value from
`window.matchMedia`; the breakpoints are literal in `computeViewport`, not tokens.

| Tier      | Width      | Shell                                                                 |
| --------- | ---------- | --------------------------------------------------------------------- |
| `phone`   | ≤ 640px    | `BottomTabBar` (Screens, Characters, Maps, More) + two sheets         |
| `rail`    | 641–1024px | Icon-only `NavRail`s (64px); labels move to the accessible name       |
| `desktop` | > 1024px   | Full `Sidebar` (264px): Primary, local pages, shortcuts, pins, recent |

Phone: the Screens tab opens its chooser (`ScreensSheet`, "Open a screen"): the live screen first
while a session is live, then Command Center, the GM screen, Session and All screens, then the pins.
So every run screen and pin is one tap after Screens, with no pins or a long list alike, and
starting a session never navigates. More ("All sections") lists the pins first (ADR-041), then
Story, Notes and Tools, the current section's local pages, the vault switcher and Settings. The rail
stacks one `NavRail` per region (Primary, local pages, Screen shortcuts, Pinned screens) in a scroll
between the vault launcher and the Settings utility; Settings is its own landmark below the scroll,
current on `/settings` and `/upgrade`, and the vault launcher and Search sit outside every landmark.

While `session.workflow` is `active`, the desktop tier opens a right `SessionRail` (272px, collapsible)
and marks Screens and the Session shortcut LIVE; the rail tier shows a dot on both; the phone tier
shows a dot on the Screens tab and a 16px accent status strip above the tab bar. `useSessionPosture()` (`app/shell/session-posture.ts`) is the only source of "live", so
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
   `HelpLauncher`, `AccountButton` — inline from 1440px, otherwise in the Table controls sheet.
5. Help (`HelpLauncher` from `app/help/HelpMenu.tsx`) on the desktop and rail tiers only. WCAG 3.2.6
   wants Help in the same place on every screen, and above 640px the top bar is the only chrome that
   follows the DM onto every route — the phone's own trigger sits in `Footer.tsx`, which those tiers
   never mount. It is 44px tall and keeps its visible word "Help" at
   both tiers (RC-UX-6.6, ONB-10): an "i" alone reads as About, and the guides tell a lost GM to
   "open Help". The phone's footer row carries the same word. The menu opens on the guide for the
   current route (screens, session, characters, maps, notes, settings; `guideForRoute` in
   `app/help/helpTopics.ts`) with the full list one level up: Getting started, the twelve user
   guides indexed in [`../README.md`](../README.md#user-guides), What's new (with a "New" chip while
   the latest release is unseen) and the shortcut overlay.

It must not host content actions (create, delete, roll, push), a duplicate settings or navigation
destination, or any control that is not relevant across routes.

The action budget depends on the tier, and it is the same on every route. RC-ENG-15.2 (IA_REVIEW,
"Four unlabeled icons") retired the unlabelled 44px icon row: a table control is either labelled in
the bar or a named row in the **Table controls** sheet.

| Tier                        | Top bar actions                                                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone (≤ 640px)             | Search and one overflow, **Table controls** (an icon button named Table controls, `aria-haspopup="dialog"`, `aria-expanded`). Its bottom sheet lists the utilities as named rows. Nothing in the bar is filled.      |
| Rail and desktop under 1440 | Search, a **Table controls** button with its visible word (opening the same rows in a right-hand sheet) and Help.                                                                                                    |
| Desktop from 1440px         | **Host table**, **Preview as player**, the session state with **Start session** / **End session**, Help and **Account**, each with its label. Under 1440px the four labels squeezed the page title to a few letters. |

The labels are catalog copy: "Preview as {playerLower}" follows the system vocabulary, and Host table
keeps one visible label in every state, its accessible name spelling out hosting counts and waiting
approvals. The glyphs differ as reinforcement only: players (Host table), the player-visibility eye
(Preview), play / close (Start / End session), a person (Account), the session bolt (Table
controls). Account opens a menu (Account settings → `/settings?tab=account`, Sign out) rather than
signing out on its first press; signed out, it opens sign-in. A companion preview opened from Preview
as player returns focus, on exit or Back, to the control it started from — the inline trigger, or
Table controls when the controls live in the sheet.

On every tier the only primary-weight (filled) control the top bar owns is Start session / End session.
Below 1440px it is the one filled action inside the Table controls sheet.

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
   trigger. This applies to the Table controls sheet, the All sections sheet and the Screens chooser.
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
aliases `/screens`, which is the Screens section on desktop and rail and the chooser's All screens
row on phone (RC-ENG-15.1); `pinned-screens.spec.ts` and `primary-sections.spec.ts` check them. Phone More now supplies `aria-haspopup="dialog"`
and its live `aria-expanded` state through BottomTabBar's optional per-entry disclosure
attributes. `shell-polish.spec.ts` checks keyboard opening, closing and focus restoration.
