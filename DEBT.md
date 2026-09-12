# Technical Debt Register

Long-lived refactors and deferred architectural work. Each entry carries an ID, severity, impact,
owner, resolution window, targets, and status. Reference IDs in PR descriptions when deferring work;
a `TODO(APP)` that survives a quarter gets an entry here before merge.

## Open

### DEBT-2026-004 — Design-system P2 polish

- Severity: low · Owner: platform · Resolution window: 2026 Q4
- Impact: small inconsistencies, not broken UX. (a) `screen-kit`'s `T` map omits spacing and radius
  tokens, so screens carry one-off px paddings (worst in `screens/audio/`); (b) the map builder and
  Atlas hand-roll layer panels and an import wizard that exist as design-package specs
  (`LayerPanel`, `LayerRow`, `ImportWizard`); (c) a few hand-rolled toggle groups that could be the DS
  `SegmentedControl`; (d) residual raw rgba/hex in widget map placeholder tiles.
- Targets: `apps/gm-react/src/app/screen-kit.tsx`, `app/map/`, `screens/atlas/`,
  `app/widgets/builtin/`.
- Status: partial — (a) and (d) resolved by RC-DSN-1.1 (the `T` map carries spacing, radius, shadow,
  z and duration; the raw-style lint ratchet is live). (b) and (c) remain and are picked up by the
  polish stories for Atlas (RC-POL-1.9) and Extensions (RC-POL-1.14).

## Resolved

- DEBT-2026-001 — typed platform-preferences layer: resolved by RC-UX-4.1
  (`apps/gm-react/src/platform/preferences.ts`; the exception manifest went from 21 entries to 3).
- DEBT-2026-002 — `any` in runtime and view-model seams: resolved by RC-ENG-4.1 (72 → 11 sites, all
  in `app/compendium/*`; `ds/index.d.ts` publishes `DSChangeEvent`, `DSKeyboardEvent`, `DSBadgeStatus`).
- DEBT-2026-003 — port the Svelte e2e corpus: resolved; the React suite is now 70+ specs on both
  profiles.
- DEBT-2026-005 — preview ("view as") edges: resolved by RC-CHR-4.3.
