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

### DEBT-2026-007 — a system package's vocabulary has no translation

- Severity: medium · Owner: platform · Resolution window: 2026 Q4
- Impact: `SystemVocabulary` is ten plain string fields, so a package speaks exactly one language.
  Both built-in packages were authored in English — 5e says `Spell`, `Spells`, `Hit points`,
  `Level up`; Generic says `Ability`, `Advance`, `Milestone`, `Story`. Nothing translates them:
  `SystemContext.tsx` passes `activePackage.vocabulary` through untouched and `vocabularyValues()`
  uses its `locale` argument only to lowercase. So every vocabulary placeholder a Spanish string
  carries renders an English word mid-sentence: `Espacios de Spell`, `Sin spells registrados`,
  `Añadir spell`, `Level up (PX)`. Fourteen Spanish strings render that way today across the player
  vitals panel, the level-up flow and the character sheet.
- Consequence for the copy pass: RC-UX-4.4 could not extend `{hitPoints}` and `{spell*}` to the
  hit-points and spell-slot labels it swept, because in Spanish that trades a correct translation
  for an English word. Those keys kept their nouns in both catalogs. The same limit applies to
  `{gm}`, which the pass did extend — a Spanish reader now sees the abbreviation `DM` (or `GM` under
  Generic) where the catalog used to spell out `DJ`. An abbreviation survives the language boundary
  where a full noun does not, so that one shipped; it is still the owner's call to keep.
- Suggested shape: a locale-keyed translation for the words the SHIPPED packages use, applied in
  `vocabularyValues()` per field, with a DM-authored package passed through untouched — guessing a
  translation for `Keeper` would invent vocabulary its author never chose. Localizing
  `SystemVocabulary` in the core instead would push UI locales into a storable, syncable, DM-editable
  data shape, which is the worse of the two.
- Targets: `apps/gm-react/src/i18n/vocabulary.tsx`, `apps/gm-react/src/i18n/messages/es.ts`,
  `packages/core/src/systems/`.
- Status: open — neither file is inside RC-UX-4.4's claim, so this needs its own story.

## Resolved

- DEBT-2026-001 — typed platform-preferences layer: resolved by RC-UX-4.1
  (`apps/gm-react/src/platform/preferences.ts`; the exception manifest went from 21 entries to 3).
- DEBT-2026-002 — `any` in runtime and view-model seams: resolved by RC-ENG-4.1 (72 → 11 sites, all
  in `app/compendium/*`; `ds/index.d.ts` publishes `DSChangeEvent`, `DSKeyboardEvent`, `DSBadgeStatus`).
- DEBT-2026-003 — port the Svelte e2e corpus: resolved; the React suite is now 70+ specs on both
  profiles.
- DEBT-2026-005 — preview ("view as") edges: resolved by RC-CHR-4.3.
