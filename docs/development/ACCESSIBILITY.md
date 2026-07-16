# Accessibility (WCAG 2.2 AA)

Scope: the primary React GM app (`apps/gm-react`, `@dndtools/gm-react`). WCAG 2.2 Level AA is the
binding conformance floor; no success criterion may be knowingly left unmet without an owner-assigned
entry in the known-violation register (below) carrying a remediation date.

This is the single accessibility doc. It covers the automated gates, the known-violation register,
and the manual screen-reader QA checklist.

## 1) Automated gates

Run everything with `pnpm a11y:gate` (contrast lints + axe on both profiles + merged report).
Sub-steps: `pnpm a11y:contrast`, `pnpm a11y:axe`, `pnpm a11y:report`, `pnpm tokens:contrast`.

### 1.1 axe route gate

- Spec: `apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts` runs `@axe-core/playwright` against every
  primary durable workspace on **both** the `desktop-chromium` and `mobile-chromium` Playwright
  projects. All e2e specs live in `apps/gm-react/tests/e2e/`.
- Routes scanned: `/` (Command Center), `/scenes`, `/atlas`, `/characters`, `/knowledge`,
  `/campaign`, `/session`, `/settings`.
- axe tag set: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`.
- Severity policy:
  - `critical` — always blocks; can never be approved in the register.
  - `serious` — blocks unless an approved register entry with a future remediation date exists.
  - `moderate` / `minor` — reported, do not block.
- Determinism: each test writes a worker-scoped artifact under
  `apps/gm-react/test-results/a11y/`. `scripts/a11y-axe-report.ts` (`pnpm a11y:report`) merges them,
  normalizes volatile ids into a stable fingerprint, de-duplicates across workers, and emits the
  consolidated JSON/markdown report. It also fails when a register remediation date has passed.

### 1.2 Contrast lints

- Non-text contrast: `scripts/a11y-nontext-contrast-lint.ts` (`pnpm a11y:contrast`, also wired into
  `pnpm lint`). Enforces WCAG 1.4.11 / 2.4.13 non-text contrast (>= 3:1) for focus indicators,
  selected-state boundaries, and status graphical objects across the named themes, and verifies the
  `@media (forced-colors: active)` fallback remaps boundary/focus tokens to system colour keywords.
- Token contrast: `scripts/token-contrast-lint.ts` (`pnpm tokens:contrast`) checks text/background
  token pairs against the WCAG AA text ratio.

Design tokens are the single source of truth for colour/contrast: `apps/gm-react/src/styles/index.css`
imports the token layers in `apps/gm-react/src/styles/tokens/` (`colors.css`, `typography.css`,
`spacing.css`, `base.css`, `fonts.css`). `base.css` carries the `prefers-reduced-motion`,
`forced-colors`, and `:focus-visible` baselines.

## 2) Known-violation register

Machine-readable source of truth: `apps/gm-react/tests/a11y/known-violations.json`. Each entry carries
`id` (axe rule), `route`, `impact`, and `targetResolutionDate`. When a remediation date passes, both
the axe gate and the report fail until the issue is resolved or the date is extended.

The register is currently **empty** — the axe gate passes on all 8 routes x both profiles with zero
critical and zero serious findings.

## 3) Component & design-system contract

Surfaces render from the design system in `apps/gm-react/src/ds/components/**`; screens live in
`apps/gm-react/src/screens/*.tsx` and shell/composition in `apps/gm-react/src/app/*.tsx`. Reuse the
DS primitives instead of re-implementing ARIA/keyboard wiring:

- `ds/components/overlay/Dialog.jsx` — `role="dialog"` + `aria-modal`, labelled by title and
  described by description; focus is trapped (Tab wraps), Escape/backdrop dismiss, body scroll locks,
  and focus restores to the trigger on close. Used for modals including the command palette.
- Icons go through `apps/gm-react/src/ds/components/core/Icon.jsx`, which maps semantic names to
  `lucide-react` PascalCase components via an `ICON_REGISTRY`. Never import raw icon components ad hoc.

Heading contract: every route renders exactly one `<h1>`; use `<h2>`/`<h3>` for sections without
skipping levels; do not use headings for visual emphasis (use `<strong>`/`<em>`/styled text). The axe
gate's `heading-order` rule enforces this on every scanned route.

## 4) Manual QA checklist

axe cannot verify screen-reader semantics, focus-ring design, motion behaviour, or the DM/Player
visibility boundary. Run this checklist before every minor and major release, in addition to
`pnpm a11y:gate`. Record results in the release notes (date, tester, build, pass/fail per section,
findings with WCAG criterion + workaround + target fix).

Environments:

- VoiceOver + Safari (macOS) — desktop, keyboard
- NVDA + Chrome (Windows) — desktop, keyboard
- TalkBack + DND Tools GM on API 36 (Android) — mobile, touch

Preconditions: recent production-candidate build; start from a non-empty vault.

Checks (each environment):

1. **Primary navigation & route announcements** — traverse the global destinations by
   landmark/heading shortcuts; confirm each route exposes exactly one `h1`, the route landmark
   receives focus, and the live region announces the new route.
2. **Scene canvas keyboard model** — Tab from the toolbar into the canvas (visible focus ring on the
   first widget); move/resize/layer/dock a widget by keyboard or touch handles (no drag-only step)
   and confirm position/size announcements.
3. **Command palette** (`Cmd`/`Ctrl`+`K`) — open, search for a target, activate; confirm dialog
   semantics (labelled title, trapped focus) and that focus lands on the destination.
4. **Combat live announcements** (run as DM AND as Player, separately) — turn advance and HP/status
   changes announce politely; incapacitation/death announces assertively; debounced under rapid
   events.
5. **Drag alternatives (WCAG 2.5.7)** — for every drag (widget move/resize, map pin, initiative
   reorder), confirm a keyboard/menu/numeric single-pointer alternative reaches the same state.
6. **Visibility-boundary no-leak check (Player role)** — REQUIRED. In a Player-role session with a
   DM-only widget, DM-only map POI, and a hidden combatant, confirm via screen reader AND DOM/ARIA
   inspection that NONE of the DM-only names/labels/descriptions/alt text/announcements are present
   or reachable in the player context. Record an explicit pass/fail line; a leak is a release
   blocker, never a known issue.
7. **Form labels** — traverse all Settings controls; confirm every input/select/checkbox/radio has an
   announced label, role, and state.
8. **Android responsive and inset behavior** — at 360px portrait, short landscape, tablet/foldable,
   split screen, 200% text, and with the keyboard open, confirm the focused control and sticky action
   remain visible; system bars/cutouts do not cover interactive content; every touch target is at least
   48dp; and native Back dismisses the topmost transient surface in order.
9. **Quick Map parity** — with TalkBack and touch, confirm every armed map tool is named and visibly
   selected, multi-touch navigates instead of drawing, and token/POI/fog/zoom actions have non-drag
   alternatives. Precision tools hidden on Android must not remove their geometry from the document.

Release-notes block:

```md
### Accessibility QA

- Executed on: YYYY-MM-DD
- Build: <production candidate>
- Automated gate: `pnpm a11y:gate` — PASS | FAIL (link merged report)
- Environments:
  - VoiceOver/Safari (macOS): PASS | PASS WITH KNOWN ISSUES | FAIL
  - NVDA/Chrome (Windows): PASS | PASS WITH KNOWN ISSUES | FAIL
  - TalkBack/DND Tools GM (Android API 36): PASS | PASS WITH KNOWN ISSUES | FAIL
- Player-role visibility-boundary no-leak check: PASS | FAIL
- Findings:
  - [ID] Summary (WCAG X.X.X) - Severity - Status - Workaround - Target fix release
```

## 5) Release update procedure

1. Run `pnpm a11y:gate` and execute the §4 manual checklist in all three environments.
2. Add any new gaps to the register (`apps/gm-react/tests/a11y/known-violations.json`) with axe rule,
   route, impact, and remediation date.
3. Close fixed gaps with commit/test evidence.

## 6) WCAG 2.2 additions

The `wcag22aa` axe tag covers the automatable 2.2 additions. The remaining 2.2 criteria are handled as
follows:

| SC     | Name                      | Coverage                                                                                                               |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2.4.11 | Focus Not Obscured (Min)  | Focus-ring baseline in `styles/tokens/base.css`; manual spot-check of sticky chrome over focused canvas controls (§4). |
| 2.4.13 | Focus Appearance          | Focus-ring tokens (>= 3:1); enforced by `pnpm a11y:contrast`.                                                          |
| 2.5.7  | Dragging Movements        | Every canvas drag has a keyboard/menu alternative; verified manually (§4.5).                                           |
| 2.5.8  | Target Size (Min)         | 48dp Android touch-target floor in the token/DS layer; axe + mobile-profile scan and manual API 36 check.              |
| 3.2.6  | Consistent Help           | Help trigger renders at the same relative position on every route; manual review.                                      |
| 3.3.7  | Redundant Entry           | Campaign/session context persists in vault state, not re-requested within a session.                                   |
| 3.3.8  | Accessible Authentication | Session join uses a code with copy-paste; no CAPTCHA or cognitive test.                                                |
