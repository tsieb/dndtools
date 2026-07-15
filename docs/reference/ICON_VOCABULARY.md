# Icon Vocabulary

This is the **canonical** icon reference for the app. It supersedes the old Svelte icon docs. All
icons are drawn through one component so the UI is one family at one weight — no "icon soup".

## Source of truth

- Component + registry: `apps/gm-react/src/ds/components/core/Icon.jsx`
- Icon family: **Lucide**, resolved through an explicit tree-shakeable `lucide-react` allowlist.

The `ICON_REGISTRY` in `Icon.jsx` maps every **semantic name** used across the app (e.g. `session-bolt`,
`dm-only`, `cond-poisoned`) to a Lucide **PascalCase** glyph (e.g. `Zap`, `Eye`, `FlaskConical`). The
registry is the authoritative list; this document explains the conventions, and `Icon.jsx` holds the
exact mapping. Unknown names fall back to `Square`; add new glyphs to the registry and the explicit
import allowlist together.

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
   glyphs in components.
2. **Semantic names.** Reference icons by their semantic registry key, not by raw Lucide names, so a
   glyph swap is a one-line registry change.
3. **Distinct shapes for status.** Status and 5e condition keys each map to a **distinct** shape so
   meaning survives grayscale (accessibility rule A11Y-011) — e.g. `success: CircleCheck`,
   `warning: TriangleAlert`, `error: CircleX`.
4. **Accessibility.** An icon is either meaningful (`label` → `role="img"` + `aria-label`) or
   decorative (no label → `aria-hidden`). Icon-only buttons must always pass a `label`.

## Registry groups (see `Icon.jsx` for the full list)

- **Global navigation sections** — `home`, `session-bolt`, `characters-person`, `atlas-map`,
  `campaign-scroll`, `knowledge-book`, `settings-gear` (mirrors `src/app/nav.ts`).
- **Status / visibility** — `success`, `warning`, `error`, `info`; `dm-only`, `hidden`,
  `visibility-shared|players|hidden|mixed` (actor-safety cues).
- **Common actions** — `close`, `check`, `add`, `search`, `more`, chevrons, `retry`, `loading`,
  `move`, `pin`, `edit`, `delete`, `duplicate`.
- **Live play** — `dice`, `heart`, `shield`, `sword`, `audio`/`audio-off`, `play`/`pause`/`skip`.
- **Command Center / authoring** — `scene`, `widget`, `new-character`, `new-map`, `note-edit`,
  `players`, `permissions`, `vault`, `connection`, `lock`/`unlock`.
- **Maps** — view controls (`zoom-in/out/fit`, `minimap`), the drawing/fog tool palette
  (`tool-*`, `reveal`, `conceal`), and layer-type glyphs (`layer-*`).
- **5e conditions** — `cond-*` (each a distinct shape), plus spellcasting glyphs (`spell-slot`,
  `flame`, `ritual`, `concentration`).

## Adding an icon

1. Confirm the Lucide glyph at [lucide.dev/icons](https://lucide.dev/icons) (PascalCase component name).
2. Add a `semantic-name: 'PascalName'` entry to `ICON_REGISTRY` in `Icon.jsx`.
3. If it introduces a new domain concept, add it to the appropriate group above.
4. Keep status/condition keys mapped to visually distinct shapes.
