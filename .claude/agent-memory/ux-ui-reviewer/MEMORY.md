# UX/UI Reviewer Memory Index

No durable cross-session notes yet. Record reusable UX-review findings here — recurring
component anti-patterns, surface ownership maps, spec-to-component mappings — as they emerge.

Governing UX/design references live under `docs/development/` (UX_GUIDELINES, ACCESSIBILITY)
and `docs/architecture/` (DESIGN_TOKENS, INFORMATION_ARCHITECTURE, NAVIGATION_CONTRACT).

## gm-react design system
- [gm-react DS map + contracts](reference_gm_react_ds.md) — where ds components live (apps/gm-react/src/ds), Dialog/Toaster/EmptyState/VisibilityChip contracts, screen-kit T.* token map.
- [Completion-pass UX anti-patterns](project_completion_pass_ux_patterns.md) — recurring gm-react issues: destructive ops w/o confirm/undo, async false-negatives, VisibilityChip gaps, hand-rolled controls; which surfaces are exemplary.
- [Player-surface audit (/play, /join)](project_player_surface_audit.md) — player cluster map + recurring classes: join flow spans SessionPanel too, chrome-less routes lose DS contracts, live regions mounted with content, two DM-only visual languages, phone nav DOM order. Includes verified NON-defects.
- [Beta-readiness audit (2026-07-14)](project_beta_readiness_audit.md) — structural gotchas: HashRouter vs location.assign, divergent list filters across screens, player-safe copy leaking into DM empty states, focus-on-open lands on Skip, /play excluded from responsive gate.
- [DS-layer audit (2026-07-29)](project_ds_layer_audit.md) — structural ds/ defects: two incomplete radiogroups (Seg + SegmentedControl), Tabs has no tabpanel wiring, sub-24px targets, unguarded enum maps. screen-kit is in src/app/ not src/screens/.
- [Character/encounter cluster (2026-07-29)](project_char_encounter_cluster.md) — partly-applied isPhone inline grids, `Number(x)||fallback` keystroke coercion, guards that became dead buttons; /characters/:id + CharBuilder untested by responsive gate.
- [Map/atlas cluster (2026-07-29)](reference_map_editor_cluster.md) — Atlas→MapBuilder-wrapper→MapEditor map; Popover has NO z-index without `anchor`; clamp-per-keystroke number inputs; shared ToolOptions keys; single-flight `run()` traps.
- [Shell + board/scene cluster (2026-07-29)](project_shell_board_scene_cluster.md) — bounded-canvas sizing traps (grid overlay overflow, 0.4 scale floor), /board+/scene bypass Page gutters, aria-modal hotkey guard kills ⌘K toggle, panels' Escape-without-focus.

## Tooling gotchas
- [DesignSync availability](reference_designsync_availability.md) — DesignSync can be runtime-disabled in ux-ui-reviewer *subagent* context despite being on the toolset; report up + run from main thread.
