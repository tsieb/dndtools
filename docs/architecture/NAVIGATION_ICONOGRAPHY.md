# Navigation Iconography Specification

This document defines the icon and identity system for the five primary sections in
Epic 13.2 (`PrimaryNav`).

## Primary Section Icons

| Section   | Icon token | Semantic category       | Rationale                                                                 |
| --------- | ---------- | ----------------------- | ------------------------------------------------------------------------- |
| Knowledge | `book`     | documentation / archive | Distinctly communicates note-centric worldbuilding and knowledge browsing |
| Atlas     | `map`      | spatial / geography     | Explicit map metaphor for location and spatial exploration                |
| Session   | `hex`      | live mode / gameplay    | Strong gameplay-state identity without overlap with map or campaign icons |
| Campaign  | `banner`   | planning / progression  | Signals long-running narrative and entity management                      |
| Settings  | `gear`     | system utility          | Conventional utility icon, reserved only for configuration                |

## Rendering Contract

1. `PrimaryNav` is the canonical renderer for these icons.
2. Icon size is layout-dependent:
   - expanded rail: `28px`
   - collapsed rail / medium rail / compact nav: `20px`
3. Active section indicator must include:
   - filled accent icon background
   - structural indicator (`border-left` in vertical rails, `border-top` in compact nav)
4. Inactive state uses muted text/icon tokens.
5. Icon semantics are mutually exclusive; no two section icons share the same concept domain.

## Source Of Truth

- Component: `src/lib/ui/layout/PrimaryNav.svelte`
- Icon glyphs: `src/lib/ui/layout/PrimaryNavIcon.svelte`
