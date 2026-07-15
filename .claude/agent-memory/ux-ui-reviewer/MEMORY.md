# UX/UI Reviewer Memory Index

No durable cross-session notes yet. Record reusable UX-review findings here — recurring
component anti-patterns, surface ownership maps, spec-to-component mappings — as they emerge.

Governing UX/design references live under `docs/development/` (UX_GUIDELINES, ACCESSIBILITY)
and `docs/architecture/` (DESIGN_TOKENS, INFORMATION_ARCHITECTURE, NAVIGATION_CONTRACT).

## gm-react design system
- [gm-react DS map + contracts](reference_gm_react_ds.md) — where ds components live (apps/gm-react/src/ds), Dialog/Toaster/EmptyState/VisibilityChip contracts, screen-kit T.* token map.
- [Completion-pass UX anti-patterns](project_completion_pass_ux_patterns.md) — recurring gm-react issues: destructive ops w/o confirm/undo, async false-negatives, VisibilityChip gaps, hand-rolled controls; which surfaces are exemplary.
- [Beta-readiness audit (2026-07-14)](project_beta_readiness_audit.md) — structural gotchas: HashRouter vs location.assign, divergent list filters across screens, player-safe copy leaking into DM empty states, focus-on-open lands on Skip, /play excluded from responsive gate.

## Tooling gotchas
- [DesignSync availability](reference_designsync_availability.md) — DesignSync can be runtime-disabled in ux-ui-reviewer *subagent* context despite being on the toolset; report up + run from main thread.
