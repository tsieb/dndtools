# Design — DND Tools

_Central index for the product's visual design: where the design lives, and how it is realized in
the app._

The design is the **warm "candle-lit" redesign** — an espresso brown-black neutral ramp under a
single warm-gold accent, behind one `data-theme` swap. Three themes ship today (`tavern` default
dark, `parchment` warm light, `high-contrast` accessibility floor, all in
`apps/gm-react/src/styles/tokens/colors.css`); five is the target. It is **defined once** in the
design package and **realized** in the primary React app (`apps/gm-react`).

## Where the design lives

| Source                                     | What it is                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`DESIGN-SOURCES.md`](./DESIGN-SOURCES.md) | The source map — the external claude.ai/design **design system** (A), the online **prototype** (B), and this repo (R), plus the dependency direction. Read this first when touching design.                                                |
| [`../design-package/`](../design-package/) | The **vendored design package** — the shared design source both apps were reskinned toward. Contains `tokens/`, `components/`, `templates/`, `SKILL.md`, and the `handoff/APPLY.md` runbook.                                               |
| `apps/gm-react/src/styles/tokens/*.css`    | The **live token files** in the primary app: `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `base.css`. Token names match the design package 1:1.                                                                             |
| `apps/gm-react/src/ds/`                    | The **React design-system component library** — the design package's component groups (core, forms, feedback, overlay, navigation, command, domain, creature, condition, spell, campaign, map, data, system) realized as React components. |

## How the design is realized

- **Tokens** are authored in the design package (`docs/design-package/tokens/` and the redesign
  override `handoff/redesign.tokens.css`) and realized as the React token files under
  `apps/gm-react/src/styles/tokens/`. Same token names, so the treatment transfers by matching
  values, never contracts. The handoff runbook is [`../design-package/handoff/APPLY.md`](../design-package/handoff/APPLY.md).
- **Components** are specified in `docs/design-package/components/<group>/` (React reference
  primitives) and realized 1:1 under `apps/gm-react/src/ds/components/<group>/`.
- **Icons** are one family: **Lucide** (`lucide-react` in the React app), 2px stroke,
  `currentColor`. The semantic-name → glyph vocabulary is documented in
  [`../reference/ICON_VOCABULARY.md`](../reference/ICON_VOCABULARY.md) (and
  `../architecture/NAVIGATION_ICONOGRAPHY.md` for the nav set). No emoji, no sprite/PNG icons.

## Related

- Token architecture reference: [`../architecture/DESIGN_TOKENS.md`](../architecture/DESIGN_TOKENS.md)
- Requirements home: [`../requirements/`](../requirements/)
