# Navigation Contract

This document defines the required three-layer navigation model for DND Tools.

## 1. Layer Definitions

### 1.1 Global Navigation

Global navigation is stable across routes and switches between primary sections.

Requirements:

1. Must expose between `5` and `7` destinations.
2. Destinations must map to primary section roots.
3. Must be visible in all main-shell routes except explicit immersive/fullscreen modes.
4. Must not include content actions (create, delete, dice roll).

### 1.2 Local Navigation

Local navigation is section-scoped browse/filter/navigation within the active primary section.

Requirements:

1. Must only show structures relevant to the active section.
2. Can include browse affordances (trees, tabs, saved filters, recent lists).
3. Must not duplicate global section switching.
4. Local controls must disappear or swap when section changes.

### 1.3 Contextual Navigation

Contextual navigation connects related objects and hierarchy from the currently viewed content.

Requirements:

1. Appears inline or adjacent to current content.
2. Includes breadcrumbs, backlinks, related links, and object cross-links.
3. Must not be used as a substitute for global section switching.

## 2. Classification Requirement

Every new navigation element must be classified as exactly one of:

- `global`
- `local`
- `contextual`

No unclassified navigation element is allowed.

## 3. Accessibility And Labeling Contract

All navigation landmarks must use stable, concise labels:

- Primary section navigation: `<nav role="navigation" aria-label="Primary">`
- Section-local navigation: `<nav aria-label="<Section> navigation">`
- Breadcrumb navigation: `<nav aria-label="Breadcrumb">`

Acceptance criteria:

1. Any `<nav>` without `aria-label` fails lint.
2. Any `role="navigation"` without `aria-label` fails lint.
3. Primary section navigation must use `aria-label="Primary"`.
4. Breadcrumb navigation must use `aria-label="Breadcrumb"`.

## 4. Testable Rules

1. Global nav destination count remains 5-7.
2. A single user action must trigger one history push for route transitions.
3. Duplicate global destinations in multiple shell surfaces are disallowed unless platform-specific and explicitly documented.
4. Route pages must publish breadcrumb metadata consumed by shell breadcrumb UI.

## 5. Enforcement

CI enforces this contract with navigation-layer linting on Svelte source files.
