# RC-DSN-3.2 run journal

## Scope

Icon vocabulary completion: die faces d4–d100, `cond-*` glyphs for the Generic and PF2e sample
conditions, board tile families, system-package concepts, and a check that no two concepts share a
glyph. Owned: `ds/components/core/Icon.jsx` (registry), `docs/reference/ICON_VOCABULARY.md`; the
acceptance test is the adjacent `Icon.test.ts`. No agents, dispatcher mutations, push or promotion.

## Progress

- Read the registry, its test and the doc; the Generic (`systems/generic.ts`) and PF2e
  (`systems/samples/pf2e.json`) condition lists; `TILE_TYPES` / `TILE_TYPE_METADATA`; the
  system-package schema enums; and every `ICON_REGISTRY` consumer (widget-builder vocabulary,
  system-builder condition picker, which takes every `cond-*` key automatically).
- Before the change, 32 glyphs were drawn by more than one key. About half were one concept under
  two names (`atlas-map`/`map`, `trash`/`delete`, `layer-poi`/`poi`); the rest were real cross-concept
  collisions (`session-bolt` and `cond-paralyzed` both Zap; `dm-only` and `cond-invisible` both the
  mask; `hidden` and `cond-blinded` both EyeOff; four keys on Sparkles).
- The PF2e sample points 22 of its 32 conditions at another condition's glyph (`clumsy`,
  `immobilized` and `restrained` all `cond-restrained`), so a PF2e combatant cannot show distinct
  shapes today.
- Only the WidgetFrame snapshot and `combat.spec.ts` (`lucide-volume-x`, `lucide-x`) pin glyphs; no
  PNG baselines.

## Implementation

- `ICON_ALIASES` (new export): alias key → concept key, 43 entries, for keys that really are the same
  concept. Every other key is a concept and owns its glyph.
- Moved 15 keys off a glyph another concept owned: `visibility-shared` Share2, `visibility-mixed`
  Contrast, `motion` Wind, `theme` SunMoon, `tool-shape` Shapes, `layer-political` Landmark,
  `waypoint` CircleDot, `validate` ClipboardCheck, `spell-sparkle` WandSparkles; 5e `blinded`
  EyeClosed, `invisible` CircleDashed, `paralyzed` ZapOff, `petrified` BrickWall, `restrained` Lasso,
  `blessed` Clover.
- `preview` briefly moved to ScanEye; that changed the core Player Views tile (`icon: 'preview'`) in
  the WidgetFrame snapshot, which is not an owned path. Reverted to Eye as an alias of
  `visibility-players` (the tile is "what the table sees").
- Added `die-d4…d100`, 22 PF2e + 3 Generic `cond-*` keys (grabbed/afraid/fatigued are aliases of
  grappled/frightened/exhaustion), 12 `tile-*` keys (encounter Target, timer Timer, calendar
  CalendarDays, the rest aliases), and `sys-*` / `rest-*` / `level-up` keys named after the schema
  values (`sys-resource-${kind}`, `sys-turn-${kind}`, `sys-advancement-${model}`, `rest-${recovery}`).
- `Icon.test.ts`: four new checks — no two concepts share a glyph; every alias points at a concept
  (not an alias) and draws its glyph; every standard die has a face; every condition of 5e, Generic
  and the PF2e sample has a `cond-<key>` glyph, distinct within the package.
- Doc: the one-concept rule, dice/conditions/tiles/system tables, the moved-glyph list, and a
  "Not yet adopted" list for callers outside the owned paths (pf2e.json/generic.ts icons, tileMeta,
  systemVocab chips, rest dialogs).

## Validation results

- First run of the new test failed on the package check. The test had wrongly assumed bare package
  ids (they are `builtin:dnd5e`, `custom:pathfinder-2e`), not a registry gap. Fixed; 6/6 pass.
- `pnpm test:app`: 123 files, 1,306 tests passed (WidgetFrame snapshots unchanged).
- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- `pnpm lint`: 0 errors, the same 15 existing warnings, none in changed files (`Icon.jsx` is not in
  the ESLint file set); boundary lint and the non-text contrast gate passed.
- `pnpm --filter @dndtools/gm-react build`: passed. `pnpm check:bundle-budget`: core 537.7 KiB
  gzipped, pass (64 new static glyph imports).
- Prettier clean on all changed files.
- Not run: Playwright. The moved glyphs change what users see on those surfaces, but no e2e spec
  pins them; the central browser gate is the evidence for that.
