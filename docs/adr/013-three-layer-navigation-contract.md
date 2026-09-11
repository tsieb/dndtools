# ADR-013: Three-Layer Navigation Contract

- Status: Accepted
- Date: 2026-03-13 (evidence updated 2026-09-11)
- Deciders: Engineering
- Consulted: UX, Accessibility
- Supersedes: N/A

## Context

As the application grew from a simple note editor to a multi-section campaign tool, navigation became inconsistent. Global section switching, local browse/filter panels, and contextual links (breadcrumbs, backlinks) were intermixed without clear ownership rules, causing screen reader confusion and redundant navigation elements.

## Decision

Adopt a three-layer navigation contract with lint enforcement:

- **Global navigation**: Stable across routes, switches between 5–7 primary sections. Uses `aria-label="Primary"`. Must not include content actions.
- **Local navigation**: Section-scoped browse/filter within the active section. Uses `aria-label="<Section> navigation"`. Must not duplicate global switching. Swaps when section changes.
- **Contextual navigation**: Content-adjacent links (breadcrumbs, backlinks, cross-links). Uses `aria-label="Breadcrumb"` or content-specific labels. Must not substitute for section switching.

Enforcement: every navigation landmark carries an `aria-label`; the axe gate (`a11y-axe-gate.spec.ts`, rule `landmark-unique`) and the responsive specs check it on every route, and `docs/architecture/NAVIGATION.md` records the layer rules.

## Consequences

### Positive

- Screen readers can distinguish navigation regions by label.
- Clear ownership prevents navigation duplication and UI clutter.
- Lint enforcement prevents regression as new surfaces are added.

### Negative

- New navigation elements require classification before implementation.
- Refactoring existing navigation requires multi-file coordination.
- Label conventions must be documented and maintained.

## Rejected Alternatives

| Alternative                            | Why Rejected                                                       |
| -------------------------------------- | ------------------------------------------------------------------ |
| Single monolithic navigation component | Does not scale to section-specific browse affordances.             |
| No label enforcement                   | Screen readers cannot distinguish multiple `<nav>` landmarks.      |
| Per-component ad-hoc navigation        | Creates inconsistent patterns and duplicate switching affordances. |

## Migration Impact

- All `<nav>` elements must have an `aria-label` matching the contract.
- New sections must define their local navigation label format.
- The navigation contract lives in `docs/architecture/NAVIGATION.md`.

## Rollback Plan

- Trigger: lint rules block legitimate navigation patterns.
- Rollback action: add permitted label patterns to the lint script without removing existing rules.
- Data safety: navigation is UI-only; no data impact.
- Risk: temporarily weaker accessibility auditing if rules are relaxed.

## Verification and Evidence

- `docs/architecture/NAVIGATION.md`
- `apps/gm-react/src/app/nav.ts`, `app/AppShell.tsx`, `app/shell/{Sidebar,RailNav,TopBar,Footer,MoreSheet}.tsx`, `app/screen-kit.tsx` (`BackBar`)
- `apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts`, `responsive.spec.ts`
