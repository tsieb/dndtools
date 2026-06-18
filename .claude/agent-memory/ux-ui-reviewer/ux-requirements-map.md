---
name: ux-requirements-map
description: Location of the binding UX-* spec package and which surface doc covers what
metadata:
  type: reference
---

Binding UX spec: `docs/remake-review/ux-requirements/` (15 surface docs, 244 UX-* reqs). Supersedes the older
`docs/development/UX_GUIDELINES.md`. Read `00-overview-and-principles.md` first (10 principles + §2 parameter
rubric + §3 platform profiles Desktop/Tablet/Mobile).

Surface doc → domain code:
- 01 visual design system → UX-VIS (tokens: color/type/spacing/radius/elevation/z/icon/motion/density/contrast)
- 02 navigation/platform profiles → UX-NAV
- 03 accessibility → UX-A11Y (WCAG 2.2 AA floor; focus, live regions, color-independence, no-leak ARIA)
- 04 canvas/scene widgets → UX-CANVAS · 05 command center → UX-CMD · 06 maps → UX-MAP
- 07 characters → UX-CHAR · 08 sessions/live-play → UX-SES · 09 content → UX-CONTENT
- 10 graph/search → UX-GRAPH/UX-SRCH · 11 collab/perms → UX-COLLAB/UX-PERM · 12 sync → UX-SYNC
- 13 audio → UX-AUDIO · 14 ai/mcp → UX-MCP · 15 onboarding → UX-ONB

Key token facts (verified in `apps/gm/src/routes/styles.css`, imported globally via `+layout.svelte`):
`--color-accent`=#d4a76a (gold), `--color-accent-foreground`=#111418, `--touch-target-min`=2.75rem/44px,
`--text-xs`=12px, `--text-sm`=13px (body floor), `--text-2xs`=10px (badge counts only, needs ≥7:1 + semibold).
`.visually-hidden` is defined globally in styles.css (templates rely on it without a local copy).
