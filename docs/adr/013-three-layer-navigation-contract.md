# ADR-013: Three-Layer Navigation Contract

- Status: Accepted
- Date: 2026-03-13
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

Enforcement:

- `scripts/nav-layer-lint.ts` scans all Svelte files for `<nav>` and `role="navigation"` elements.
- Every navigation landmark must have an `aria-label` matching one of the permitted patterns.
- Lint runs via `pnpm lint:navigation` in CI.

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
- Navigation contract documentation lives at `docs/architecture/NAVIGATION_CONTRACT.md`.

## Rollback Plan

- Trigger: lint rules block legitimate navigation patterns.
- Rollback action: add permitted label patterns to the lint script without removing existing rules.
- Data safety: navigation is UI-only; no data impact.
- Risk: temporarily weaker accessibility auditing if rules are relaxed.

## Verification and Evidence

- `docs/architecture/NAVIGATION_CONTRACT.md`
- `scripts/nav-layer-lint.ts`
- `src/lib/ui/layout/AppShell.svelte`
- `src/lib/ui/layout/TopBar.svelte`
- `src/lib/ui/sections/local-nav/KnowledgeLocalNavPanel.svelte`
