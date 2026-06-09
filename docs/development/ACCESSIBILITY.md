# Accessibility Compliance Register (WCAG 2.2 AA)

Last updated: 2026-06-09  
Epic: 6.4 Accessibility Compliance Program  
Owner: UI Platform (A11y)  
Scope: Desktop routes, primary DM workflows, and WCAG 2.2 new interaction criteria

## 1) Audit Method

- Automated route scan: `@axe-core/playwright` on all primary routes.
- Automated policy scan in Playwright route tests (`tests/e2e/*.spec.ts`) with severity handling:
  - `critical`: blocking
  - `serious`: warning + tracked in `tests/accessibility/known-violations.json`
  - `moderate`/`minor`: logged for follow-up
  - known-violation target resolution dates are enforced in CI
- Automated workflow checks: keyboard-only, live announcements, heading hierarchy, and touch targets.
- Manual workflow audit: top 10 highest-impact flows reviewed against keyboard and semantic behavior.
- Manual screen-reader release checklist: `docs/development/ACCESSIBILITY_QA.md`

Automated evidence source:

- `tests/e2e-desktop/accessibility.spec.ts`

## 2) Primary Route Coverage (Automated)

Routes scanned with axe (`critical` + `serious` must be zero):

- `/`
- `/notes`
- `/notes/:id`
- `/notes/:id/edit`
- `/search`
- `/graph`
- `/timeline`
- `/session-board`
- `/encounter/new`
- `/combat`
- `/settings`
- `/player`

Status: `PASS` (all routes zero critical/serious violations in CI gate).

## 3) Top Workflow Audit (Manual + Automated)

Highest-impact workflows reviewed:

1. Create note (keyboard only) - PASS
2. Save note and return to read view - PASS
3. Follow wikilink navigation - PASS
4. Global search and open note result - PASS
5. Search and open entity result - PASS
6. Quick switcher navigation to Session Board - PASS
7. Enter Session Board edit mode - PASS
8. Read route changes via live announcement region - PASS
9. Receive async announcements (search results, save confirmation) - PASS
10. Traverse dialogs/overlays with trapped focus - PASS

## 4) Gap Register

Severity scale: `blocker`, `major`, `minor`  
Status scale: `open`, `fixed`

| ID       | WCAG Criterion                     | Severity | Story         | Gap                                                                                             | Owner       | Status | Evidence                                                                                                                                                                         |
| -------- | ---------------------------------- | -------- | ------------- | ----------------------------------------------------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A11Y-001 | 4.1.2 Name, Role, Value            | major    | S6.4.2/S6.4.3 | Unnamed `<select>` controls on Notes filters.                                                   | UI Platform | fixed  | `src/routes/notes/+page.svelte` (`aria-label` on sort/folder selects), `tests/e2e-desktop/accessibility.spec.ts` axe pass                                                        |
| A11Y-002 | 4.1.2 Name, Role, Value            | major    | S6.4.2/S6.4.3 | Unnamed filter controls on Graph and board selector in Session Board view mode.                 | UI Platform | fixed  | `src/routes/graph/+page.svelte`, `src/routes/session-board/+page.svelte`, axe pass                                                                                               |
| A11Y-003 | 4.1.2 Name, Role, Value            | major    | S6.4.4        | CodeMirror textbox lacked accessible name.                                                      | UI Platform | fixed  | `src/lib/ui/editor/CodeMirrorEditor.svelte` (`EditorView.contentAttributes` with `aria-label`), axe pass                                                                         |
| A11Y-004 | 2.1.1 Keyboard / 2.4.3 Focus Order | major    | S6.4.3        | Quick switcher could execute stale selection when query changed (Enter launched wrong command). | UI Platform | fixed  | `src/lib/ui/search/QuickSwitcher.svelte` (`open` transition guard + query selection reset), keyboard workflow test pass                                                          |
| A11Y-005 | 2.4.3 Focus Order                  | major    | S6.4.3        | Dialog/overlay focus could escape to background content.                                        | UI Platform | fixed  | `src/lib/ui/a11y/focus-trap.ts` + integration across modal/overlay components                                                                                                    |
| A11Y-006 | 1.3.1 Info and Relationships       | major    | S6.4.4        | Missing route-level heading semantics on key routes.                                            | UI Platform | fixed  | `src/routes/notes/[id]/edit/+page.svelte`, `src/routes/session-board/+page.svelte`, heading hierarchy test pass                                                                  |
| A11Y-007 | 4.1.3 Status Messages              | major    | S6.4.4        | No consistent live region for route and async status announcements.                             | UI Platform | fixed  | `src/lib/ui/a11y/LiveAnnouncer.svelte`, `src/lib/state/a11y-announcer.svelte.ts`, `src/routes/+layout.svelte`, `src/routes/search/+page.svelte`, `src/lib/state/toast.svelte.ts` |
| A11Y-008 | 2.5.5 Target Size                  | major    | S6.4.5        | Interactive controls below 44x44 touch target baseline.                                         | UI Platform | fixed  | `src/lib/ui/common/Button.svelte`, `src/app.css`, touch-target CI check in `tests/e2e-desktop/accessibility.spec.ts`                                                             |
| A11Y-009 | 2.3.3 Animation from Interactions  | minor    | S6.4.5        | Motion behavior not consistently reduced when user prefers reduced motion.                      | UI Platform | fixed  | `src/app.css` (`@media (prefers-reduced-motion: reduce)` coverage), route checks + manual review                                                                                 |
| A11Y-010 | 4.1.2 Name, Role, Value            | major    | S6.4.3        | Timeline event link `<select>` in note editor lacked explicit accessible name.                  | UI Platform | fixed  | `src/routes/notes/[id]/edit/+page.svelte` (`aria-label`)                                                                                                                         |
| A11Y-011 | 2.3.3 / 1.4.3 / 1.4.11             | major    | S18.3.x       | Motion override, high-contrast mode, and token contrast coverage were incomplete.               | UI Platform | fixed  | `src/lib/ui/settings/AppearanceSettingsTab.svelte`, `src/routes/+layout.svelte`, `src/app.css`, `src/lib/domain/appearance.test.ts`                                              |

Open gaps: none.

## 5) CI Enforcement

- Accessibility CI jobs:
  - `preview-e2e-accessibility` (Playwright against preview build with axe policy report artifact and PR comment)
  - `desktop-e2e-accessibility` (desktop workflow validation)
- Merge gate blocks on failures of:
  - axe policy blocking violations (`critical`, known-violation expiry)
  - keyboard workflow regression
  - heading hierarchy regression
  - touch-target minimum regression

Workflow files:

- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`

## 6) Evidence Map by Story

- S6.4.1 (audit + register):
  - This file (`docs/development/ACCESSIBILITY.md`) with criteria/severity/owner register.
- S6.4.2 (automated CI tests):
  - `tests/e2e-desktop/accessibility.spec.ts`
  - `package.json` script `test:e2e:desktop:a11y`
  - CI workflow wiring in `.github/workflows/ci.yml` and `.github/workflows/e2e.yml`
- S6.4.3 (keyboard reachability):
  - `focus-trap` integration in modal/overlay components
  - `QuickSwitcher` selection behavior fix
  - keyboard workflow test in `tests/e2e-desktop/accessibility.spec.ts`
- S6.4.4 (screen reader QA fixes):
  - route/live announcements and toast announcements
  - heading structure fixes
  - announcement and heading tests in `tests/e2e-desktop/accessibility.spec.ts`
- S6.4.5 (touch target + motion):
  - 44x44 baseline via component + global CSS
  - reduced-motion CSS handling
  - automated touch-target scan test

## 7) Release Update Procedure

Update this register for every release:

1. Re-run `pnpm test:e2e` and `pnpm test:e2e:desktop:a11y`.
2. Execute `docs/development/ACCESSIBILITY_QA.md` in all required screen-reader environments.
3. Add new gaps with WCAG criterion, severity, owner, and remediation plan.
4. Close fixed gaps with commit/test evidence.
5. Record update date at top of this file.

## 8) Heading Hierarchy Contract

- Every route renders exactly one `<h1>`.
- `src/routes/+layout.svelte` sets `<svelte:head><title>...</title></svelte:head>` to match the
  active route `<h1>` (`<h1 text> | DND Tools`).
- Use `<h2>` for major sections and `<h3>` for subsections within an `<h2>`. Do not skip heading
  levels.
- Do not use headings for visual emphasis only. Use `<strong>`, `<em>`, or styled `<p>/<span>`
  elements when content is not a true section heading.
- CI enforcement: `tests/e2e-desktop/accessibility.spec.ts` runs an axe `heading-order` check on
  all primary routes.

## 9) WCAG 2.2 Additions Evidence

WCAG 2.2 (October 2023) added success criteria beyond 2.1 AA. This register covers all 2.2 AA
additions applicable to this application. Conformance baseline: **WCAG 2.1 AA** (§1–8) + the 2.2
additions listed here.

| SC | Name | How covered | Test evidence |
| --- | --- | --- | --- |
| 2.4.11 | Focus Not Obscured (Minimum, AA) | Explicit test verifies layout toolbar buttons are not entirely obscured by sticky chrome when focused; covers the canvas layout toolbar — the primary new interaction pattern in v2. | `apps/v2/app/tests/e2e/scene-accessibility.spec.ts` — "WCAG 2.4.11: layout toolbar buttons are not entirely obscured" |
| 2.4.13 | Focus Appearance (AA) | Focus ring uses `--focus-ring-width: 2px; --focus-ring-offset: 2px` token (≥ 3:1 contrast). Verified by axe `color-contrast` rule and manual token audit. | axe scan in `tests/e2e-desktop/accessibility.spec.ts` (route scan); visual design system doc §7.2. |
| 2.5.7 | Dragging Movements (AA) | All drag operations in the canvas have keyboard-only alternatives (directional move/resize/dock/pin buttons). Explicit test verifies keyboard dispatch produces same result as drag. | `apps/v2/app/tests/e2e/scene-accessibility.spec.ts` — CANVAS-012 keyboard-only tests |
| 2.5.8 | Target Size Minimum (AA) | Touch-target CI test checks ≥ 44 × 44 CSS px (stricter than the 24 px 2.5.8 floor) on all primary routes. | `tests/e2e-desktop/accessibility.spec.ts` — "all control targets satisfy 44×44 minimum touch target policy" |
| 3.2.6 | Consistent Help (AA) | Help/documentation triggers render at the same relative position on all routes (Command Center `?` button, fixed in shell). Manual review confirmed; no automated rule maps to this criterion. | Manual: documented in `ACCESSIBILITY_QA.md` checklist under Settings form labels. |
| 3.3.7 | Redundant Entry (AA) | Campaign/session context (campaign name, DM identity) is persisted in vault state and not re-requested within a session. Tested implicitly by session-start workflow tests. | `tests/e2e-desktop/accessibility.spec.ts` — major workflows test (no re-entry of identity). |
| 3.3.8 | Accessible Authentication (AA) | No CAPTCHA or cognitive test is used for authentication; session join uses a numeric code with a copy-paste alternative. No specific test; not applicable beyond the join-session flow. | Not applicable (no login screen in core app; session join is code-based). |

Open WCAG 2.2 gaps: none.

WCAG 2.2 criteria not applicable to this application:

- **2.4.12 Focus Not Obscured Enhanced (AAA):** AAA — aspirational target; no gap.
- **3.3.9 Accessible Authentication (Enhanced) (AAA):** AAA — out of scope.
