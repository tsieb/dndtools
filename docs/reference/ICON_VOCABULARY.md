# Icon Vocabulary

This is the **canonical** icon reference for the app. It supersedes the old Svelte icon docs. All
icons are drawn through one component so the UI is one family at one weight — no "icon soup".

## Source of truth

- Component + registry: `apps/gm-react/src/ds/components/core/Icon.jsx`
- Icon family: **Lucide**, resolved through an explicit tree-shakeable `lucide-react` allowlist.

The `ICON_REGISTRY` in `Icon.jsx` maps every **semantic name** used across the app (e.g. `session-bolt`,
`dm-only`, `cond-poisoned`) to a Lucide **PascalCase** glyph (e.g. `Zap`, `VenetianMask`,
`FlaskConical`). The registry is the authoritative list; this document explains the conventions, and
`Icon.jsx` holds the exact mapping. Unknown names fall back to `Square`; add new glyphs to the registry
and the explicit import allowlist together.

## Usage

```tsx
import { Icon } from '../ds';

// Meaningful (icon-only control): pass a label → role="img" + aria-label
<Icon name="search" label="Search" />

// Decorative (paired with adjacent visible text): omit label → aria-hidden
<Icon name="dice" />
```

Props: `name` (semantic name or Lucide PascalName), `size` (`micro|sm|md|lg|xl` token, or a number),
`label`, `color` (defaults to `currentColor`), `strokeWidth` (defaults to `2`), `className`, `style`.
Sizes resolve to `--icon-size-*` CSS variables.

## Conventions

1. **Single family, single weight.** Lucide only, 2px stroke, via the `Icon` component. No inline SVG
   glyphs in components — with one carved exception: **map content is not iconography**. The prop
   catalogue (`packages/core/src/generation/props.ts`, RC-MAP-3.1) ships a vector glyph per stamp so a
   placed chest draws as a chest on the canvas, and the Assets panel previews the same path. Those are
   pictures of the DM's own map objects, drawn by `PropGlyph`, and they are always `aria-hidden` behind
   a text label. Every CONTROL on those surfaces still uses `Icon`.
2. **Semantic names.** Reference icons by their semantic registry key, not by raw Lucide names, so a
   glyph swap is a one-line registry change.
3. **One concept, one glyph.** A glyph means exactly one thing app-wide. Two keys may share a glyph
   only when `ICON_ALIASES` in `Icon.jsx` declares one an alias of the other: they are the same concept
   under two names (`atlas-map` → `map`, `layer-combat` → `sword`, `tile-reference` → `book`,
   `cond-grabbed` → `cond-grappled`). An alias points at a concept, never at another alias.
   `Icon.test.ts` fails on any other shared glyph.
4. **Distinct shapes for status.** Status and condition keys each map to a **distinct** shape so
   meaning survives grayscale (accessibility rule A11Y-011) — e.g. `success: CircleCheck`,
   `warning: TriangleAlert`, `error: CircleX`. `Icon.test.ts` also checks that every condition a
   shipped system package declares (5e, Generic, PF2e sample) has a `cond-<key>` glyph, and that no two
   conditions in one package share a glyph.
5. **Accessibility.** An icon is either meaningful (`label` → `role="img"` + `aria-label`) or
   decorative (no label → `aria-hidden`). Icon-only buttons must always pass a `label`.

## Registry groups (see `Icon.jsx` for the full list)

- **Global navigation sections** — `home`, `session-bolt`, `characters-person`, `atlas-map`,
  `campaign-scroll`, `knowledge-book`, `settings-gear` (mirrors `src/app/nav.ts`).
- **Status / visibility** — `success`, `warning`, `error`, `info`; `dm-only`, `hidden`,
  `visibility-shared|players|hidden|mixed` (actor-safety cues).
- **Common actions** — `close`, `check`, `add`, `search`, `more`, chevrons, `retry`, `loading`,
  `move`, `pin`, `edit`, `delete`, `duplicate`, `preview`.
- **Live play** — `dice`, `heart`, `shield`, `sword`, `audio`/`audio-off`, `play`/`pause`/`skip`.
- **Command Center / authoring** — `scene`, `widget`, `new-character`, `new-map`, `note-edit`,
  `players`, `permissions`, `vault`, `connection`, `lock`/`unlock`.
- **Maps** — view controls (`zoom-in/out/fit`, `minimap`), the drawing/fog tool palette
  (`tool-*`, `reveal`, `conceal`), and layer-type glyphs (`layer-*`).
- **Conditions** — `cond-*` (below), plus spellcasting glyphs (`spell-slot`, `flame`, `ritual`,
  `concentration`, `spell-sparkle`).
- **Dice faces** — `die-d4` … `die-d100` (below).
- **Board tile families** — `tile-*` (below).
- **System-package concepts** — `sys-*`, `rest-*`, `level-up` (below).

### Dice faces

Lucide draws no polyhedral dice, so each face is the die's outline as it lies on the table. Pair the
glyph with the `d8`-style text; the silhouette is the redundant cue, not the only one.

| Key       | Glyph          | Key        | Glyph                     |
| --------- | -------------- | ---------- | ------------------------- |
| `die-d4`  | `Triangle`     | `die-d12`  | `Pentagon`                |
| `die-d6`  | `Dice6`        | `die-d20`  | `Hexagon`                 |
| `die-d8`  | `DiamondMinus` | `die-d100` | `DiamondPercent`          |
| `die-d10` | `Gem`          | `dice`     | `Dices` (dice in general) |

### Conditions

Every package condition draws `cond-<key>`. A key two systems share (`blinded`, `frightened`, `prone`,
`hidden`) is one registry entry.

- **5e** — `blinded` EyeClosed, `charmed` HeartHandshake, `deafened` EarOff, `frightened` Ghost,
  `grappled` Grab, `incapacitated` Ban, `invisible` CircleDashed, `paralyzed` ZapOff, `petrified`
  BrickWall, `poisoned` FlaskConical, `prone` ArrowDownToLine, `restrained` Lasso, `stunned` Stars,
  `unconscious` Moon, `exhaustion` BatteryLow; app extras `concentration` Brain, `blessed` Clover,
  `cursed` Skull.
- **PF2e sample** (the 5e keys it shares, plus) — `clumsy` Banana, `concealed` SunDim, `confused`
  Tornado, `dazzled` Haze, `doomed` CloudLightning, `drained` Droplet, `dying` HeartCrack, `enfeebled`
  Dumbbell, `fascinated` Focus, `fatigued` → `exhaustion`, `fleeing` LogOut, `grabbed` → `grappled`,
  `hidden` Shrub, `immobilized` Anchor, `off-guard` ShieldOff, `persistent-damage` FlameKindling,
  `quickened` Rabbit, `sickened` Thermometer, `slowed` Snail, `stupefied` Meh, `undetected` LocateOff,
  `wounded` Bandage.
- **Generic** — `hindered` Weight, `afraid` → `frightened`, `hidden` Shrub, `inspired` Sunrise.

### Board tile families

One key per RC-CAN-2.1 tile family (`--color-tile-<family>`). Most are aliases of their content's
concept; `tile-encounter` (Target), `tile-timer` (Timer) and `tile-calendar` (CalendarDays) have their
own glyph so they no longer borrow `sword` and `recent`.

### System-package concepts

Keyed so a caller can build the name from the package value:

- `sys-package` Library, `sys-vocabulary` Languages, `sys-attribute` ChartNoAxesColumn, `sys-skill`
  GraduationCap, `sys-derived` Sigma, `sys-condition` Activity, `sys-dice` → `dice`, `sys-creature` →
  `monster-claw`.
- Resources, `sys-resource-${kind}`: `pool` Coins, `slots` → `spell-slot`, `dice` → `dice`, `clock`
  ChartPie, `track` Columns3.
- Recovery, `rest-${recovery}`: `short` Coffee, `long` Bed, `scene` Clapperboard (`never` has none).
- Turns, `sys-turn-${turnModel.kind}`: `initiative` ListOrdered, `actions-per-turn` Tally3, `popcorn`
  Popcorn, `none` Flashlight (the spotlight marker).
- Advancement, `sys-advancement-${model}`: `xp-table` TrendingUp, `milestone` Milestone; `level-up`
  ArrowBigUpDash.

### Glyphs moved by RC-DSN-3.2

Enforcing one concept per glyph moved these keys off a glyph another concept already owned:
`visibility-shared` Users → Share2, `visibility-mixed` Layers → Contrast, `motion` Sparkles → Wind,
`theme` Sun → SunMoon, `tool-shape` Pentagon → Shapes (Pentagon is the d12), `layer-political` Flag →
Landmark, `waypoint` Circle → CircleDot, `validate` ShieldCheck →
ClipboardCheck, `spell-sparkle` Sparkles → WandSparkles, and the 5e conditions `blinded` EyeOff →
EyeClosed, `invisible` VenetianMask → CircleDashed, `paralyzed` Zap → ZapOff, `petrified` Gem →
BrickWall (Gem is the d10), `restrained` Lock → Lasso, `blessed` Sparkles → Clover.

### Not yet adopted

The vocabulary is ahead of some callers, which live outside the registry's owned paths:

- `packages/core/src/systems/samples/pf2e.json` and `systems/generic.ts` still point most conditions
  at a borrowed 5e glyph (`clumsy` → `cond-restrained`). They should carry `cond-<own key>`.
- `app/widgets/tileMeta.ts` still resolves encounter to `sword` and timer/calendar to `recent`.
- `screens/extensions/systemVocab.ts` chips use `sliders`/`heart`/`warning`/`hourglass` for
  attributes/resources/conditions/turns; the `sys-*` keys are the intended names.
- `RestDialog.tsx` and `session/Lifecycle.tsx` draw a long rest with `theme` and a short rest with
  `recent`; `rest-long` and `rest-short` are the intended names.

## Adding an icon

1. Confirm the Lucide glyph at [lucide.dev/icons](https://lucide.dev/icons) (PascalCase component name).
2. Add a `semantic-name: 'PascalName'` entry to `ICON_REGISTRY` in `Icon.jsx`, and the glyph to the
   import allowlist and `GLYPHS`.
3. If the glyph is already taken, either pick another or — only if it is truly the same concept — add
   the key to `ICON_ALIASES`.
4. If it introduces a new domain concept, add it to the appropriate group above.
5. Keep status/condition keys mapped to visually distinct shapes.
