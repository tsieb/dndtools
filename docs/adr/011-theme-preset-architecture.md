# ADR-011: Theme Preset Architecture

- Status: Accepted
- Date: 2026-03-13
- Deciders: Engineering
- Consulted: Design, UX
- Supersedes: N/A

## Context

The application needed a theming system that supports multiple TTRPG-flavored visual identities while maintaining dark-mode/light-mode parity and semantic token consistency. Ad-hoc color overrides and structural `dark:` prefixes would create maintenance burden and accessibility risk across growing UI surfaces.

## Decision

Adopt a four-preset theme system with semantic CSS custom properties:

- Four named presets: `parchment` (light, warm), `tavern` (dark, warm), `scholar` (light, cool), `dungeon` (dark, cool).
- Theme selection stored as `ThemeSetting` which includes presets plus `system`, `light`, `dark` for OS-preference delegation.
- All visual tokens are defined as CSS custom properties in `src/app.css` under `html.parchment`, `html.tavern`, etc. selectors.
- Components use semantic token classes (`bg-surface`, `text-ink`, `border-border`) rather than raw color values or structural `dark:` prefixes.
- Token compliance is enforced by `scripts/token-compliance-lint.ts` which blocks arbitrary pixel font sizes and structural `dark:` prefixes.
- Status colors (emerald, amber, red, etc.) are permitted to use `dark:` variants for legibility tuning.

## Consequences

### Positive

- Consistent visual identity across all UI surfaces with zero per-component dark-mode logic.
- New themes can be added by defining a CSS custom property set without touching component code.
- Token lint prevents regression to raw color values or ad-hoc dark-mode overrides.

### Negative

- All new UI work must understand and use the semantic token vocabulary.
- Theme-specific visual tuning requires understanding the CSS custom property cascade.
- High Contrast mode is a separate accessibility concern layered on top of presets.

## Rejected Alternatives

| Alternative                           | Why Rejected                                                              |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Tailwind `dark:` prefix per component | Creates O(N) maintenance for dark mode across all components.             |
| CSS-in-JS theme provider              | Adds runtime overhead and conflicts with Tailwind utility-first approach. |
| Single light/dark toggle only         | Insufficient for TTRPG brand identity and user personalization goals.     |

## Migration Impact

- New components must use semantic token classes exclusively.
- Token compliance lint (`pnpm lint:tokens`) runs in CI and pre-commit.
- Theme additions require updating `ThemePreset` type, `src/app.css` token block, and `resolveThemePreset()`.

## Rollback Plan

- Trigger: theme system causes widespread visual regressions.
- Rollback action: revert to single light/dark mode by mapping all presets to `parchment`/`tavern`.
- Data safety: theme preference is a settings value; rollback does not affect vault data.
- Risk: temporary loss of visual customization.

## Verification and Evidence

- `src/lib/types/theme.ts`
- `src/lib/domain/theme.ts`
- `src/app.css`
- `scripts/token-compliance-lint.ts`
- `src/lib/types/settings.ts`
