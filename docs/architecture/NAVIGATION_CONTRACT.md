# Navigation Contract

The React app has a single navigation source of truth:
`apps/gm-react/src/app/nav.ts`. It defines the grouped information architecture and the
per-section top-bar titles; `apps/gm-react/src/app/AppShell.tsx` is the sole renderer
(sidebar on desktop, `NavRail` on tablet, `BottomTabBar` + More sheet on phone). No other
module may define primary destinations.

## 1. Information architecture (from `nav.ts`)

Routes are HashRouter (`react-router-dom` v6) paths. The IA is grouped:

- **RUN** — Command Center `/`, Command board `/board`, Session `/session`
- **LIBRARY** — Characters `/characters`, Atlas `/atlas`, Campaign `/campaign`,
  Knowledge `/knowledge`
- **PLATFORM** — Graph & Search `/graph`, Audio `/audio`, Extensions `/extensions`,
  Community `/community`, Plans & cloud `/upgrade`
- **Player view** `/player` and **Settings** `/settings` (rendered in the shell footer)

`activeSectionId(pathname)` resolves the active section (longest matching path wins; `/`
is Command Center). `sectionLabel` / `sectionSubtitle` read `SECTION_TITLES` for the top
bar (see `TOPBAR_CHARTER.md`).

## 2. Layer model

Navigation elements are classified as exactly one of `global`, `local`, or `contextual`.

- **Global** — the grouped section destinations above. Stable across routes; maps to
  section roots; carries no content actions (create/delete/dice). Rendered by `AppShell`
  and defined only in `nav.ts`.
- **Local** — section-scoped browse within the active section (e.g. the sidebar Scenes
  list, Recent scenes). Must not duplicate global section switching and must swap out when
  the section changes.
- **Contextual** — inline links between related content (backlinks, cross-links,
  breadcrumbs). Rendered adjacent to content, e.g. the `BackBar` breadcrumb in
  `screen-kit.tsx`. Never a substitute for global section switching.

## 3. Accessibility and labeling

Navigation landmarks use stable, concise `aria-label`s (as rendered in `AppShell`):

- Primary section navigation: `<nav role="navigation" aria-label="Primary">`
- Section-scoped navigation: a concise section label (e.g. `aria-label="Shortcuts"`,
  `aria-label="Settings"` on the footer nav)
- Breadcrumb / back navigation: `<nav aria-label="Breadcrumb">` (`BackBar`)

Any `<nav>` or `role="navigation"` without an `aria-label` is a defect.

## 4. Rules

1. Primary destinations are defined once, in `nav.ts`; the same IA renders in every
   viewport tier — a tier change is a presentation change, never an IA change.
2. A single user action triggers exactly one history push per route transition.
3. The same global destination must not be duplicated as an independently-defined entry
   in another surface; the phone `BottomTabBar` and tablet `NavRail` derive from the same
   `nav.ts` arrays, not hand-copied lists.
4. Global navigation carries navigation only — no create/delete/roll content actions.
