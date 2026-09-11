# ADR-011: Theme Preset Architecture

- Status: Retired (Svelte presets)
- Date: 2026-03-13 (retired 2026-09-11)
- Deciders: Engineering

## Decision, as it was

The Svelte app shipped four named theme presets (`parchment`, `tavern`, `scholar`, `dungeon`) as
CSS custom-property blocks selected on `<html>`, with components using semantic token classes and a
token-compliance lint blocking raw values and structural `dark:` prefixes.

## What replaced it

The React app realizes the design package's token architecture: raw palette values only in
`apps/gm-react/src/styles/tokens/colors.css`, a single `data-theme` swap, three themes today
(`tavern`, `parchment`, `high-contrast`) with two more planned (RC-DSN-1.2), and the contrast lints
`pnpm tokens:contrast` and `pnpm a11y:contrast`. See `docs/design/README.md`. The principle this ADR
established, semantic tokens everywhere and no per-component dark-mode logic, still holds.
