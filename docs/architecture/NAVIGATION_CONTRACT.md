# Navigation Contract

The React app has a single navigation source of truth:
`apps/gm-react/src/app/nav.ts`. It defines the grouped information architecture and the
per-section top-bar titles; `apps/gm-react/src/app/AppShell.tsx` is the sole renderer
(sidebar on desktop, `NavRail` on tablet, `BottomTabBar` + More sheet on phone). No other
module may define primary destinations.

## 1. Information architecture (from `nav.ts`)

Routes are HashRouter (`react-router-dom` v6) paths. The IA is grouped:

- **RUN** — Command Center `/`, GM Screen `/board`, Session `/session`
- **LIBRARY** — Characters `/characters`, Maps `/atlas`, Story `/campaign`,
  Notes `/knowledge`
- **PLATFORM** — Graph & Search `/graph`, Audio `/audio`, Extensions `/extensions`,
  Community `/community`, Plans & cloud `/upgrade`
- **Player view** `/player` and **Settings** `/settings` (rendered in the shell footer)

`activeSectionId(pathname)` resolves the active section (longest matching path wins; `/`
is Command Center). `sectionLabelKey` / `sectionSubtitleKey` read `SECTION_TITLES` for the
top bar (see `TOPBAR_CHARTER.md`).

Every user-visible word in `nav.ts` is a message key — `NavSection.labelKey` / `subKey` and
both halves of `SECTION_TITLES` — and each renderer (sidebar, rail, phone tab bar, More
sheet, top bar, command palette, Command Center's library cards) calls `t` on it. A literal
here would leak untranslated into all seven at once. Keys whose message carries a `{gm}` or
`{player}` placeholder also follow the active System Package's vocabulary (RC-SYS-2.6).

### Live posture (RC-SES-1.1)

`NavSection.liveBadge` marks the ONE destination that carries the session-live posture (the
Session entry). While the Core's `session.workflow` is `active`, every navigation renderer
marks that entry from this single flag — the sidebar row gains a text badge plus the
`.session-live-ring` box-shadow ring, the tablet rail and the phone tab bar gain a dot. The
"live" answer itself comes from `useSessionPosture()`
(`apps/gm-react/src/app/shell/session-posture.ts`), never from a renderer's own reading of
session state, so the three navigations cannot disagree about whether the table is running.
The ring's resting frame IS its reduced-motion appearance, and the state is never carried by
motion or colour alone.

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
