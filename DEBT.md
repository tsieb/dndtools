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

### DEBT-2026-006 — a guided PC cannot be built from rolled ability scores

- Severity: medium · Owner: core · Resolution window: 2026 Q4
- Impact: rolling for stats is one of the two ways 5e tables make a PC, and the app can only offer it
  to NPCs/monsters/sidekicks. `validateDraftStep('abilities', …)` enforces the CHAR-002 prototype
  point-buy rule — each score 8–15, 27 points — for EVERY PC draft, and `finalize-draft` rejects on
  the same report, so an ordinary 4d6-drop-lowest spread (a 16, or a 7) can never be finalized. There
  is no way out after the fact either: `character.edit-field` only reaches `name`, `combat.*` and
  `data.*`, and `character.quick-create`'s `kind` enum excludes `pc` (CHAR-001). RC-CHR-5.2 therefore
  offers Roll for the kinds whose scores the core takes as given and says why on the PC path, rather
  than offering a method finalize would refuse.
- Suggested shape: let the DM fix the draft's score SOURCE when they create it — an optional
  `abilityScorePool` on `character.create-draft` (DM-only, so the owning player can only rearrange the
  dice the DM witnessed, never invent scores), recorded on `CharacterDraft`, with the abilities step
  valid when its scores are a permutation of that pool and the point-buy budget not applied. The
  standard array is the same mechanism with a fixed pool. Prototyped and green locally (core suite
  4785 passed, plus a PC-rolled-creation e2e case) but reverted: the three core files it needs sit
  outside RC-CHR-5.2's claim, so the change needs its own core story.
- Targets: `packages/core/src/state/character-draft-flow.ts`,
  `packages/core/src/state/character-state.ts`, `packages/core/src/commands/character.ts`,
  `packages/core/src/schemas/commands.ts`, `apps/gm-react/src/app/charBuilder/`.
- Status: open — the builder side is shipped and honest; the core rule is untouched.

## Resolved

- DEBT-2026-001 — typed platform-preferences layer: resolved by RC-UX-4.1
  (`apps/gm-react/src/platform/preferences.ts`; the exception manifest went from 21 entries to 3).
- DEBT-2026-002 — `any` in runtime and view-model seams: resolved by RC-ENG-4.1 (72 → 11 sites, all
  in `app/compendium/*`; `ds/index.d.ts` publishes `DSChangeEvent`, `DSKeyboardEvent`, `DSBadgeStatus`).
- DEBT-2026-003 — port the Svelte e2e corpus: resolved; the React suite is now 70+ specs on both
  profiles.
- DEBT-2026-005 — preview ("view as") edges: resolved by RC-CHR-4.3.
