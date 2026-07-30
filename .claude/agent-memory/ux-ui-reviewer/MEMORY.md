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
- [DS-layer audit (2026-07-29, re-verified same day post-fix)](project_ds_layer_audit.md) — radiogroups FIXED; Tabs tabpanel wiring + Checkbox/SpellSlots sub-24px targets CONFIRMED STILL OPEN w/ exact fix shape. screen-kit is in src/app/ not src/screens/.
- [Character/encounter cluster (2026-07-29, re-audited post-fix)](project_char_encounter_cluster.md) — after commit 5274a5f9: 4 residual un-guarded grids (CharBuilder class/kit steps, Characters attack-editor/advancement), sibling Number()||fallback fields (EncounterBuilder qHp/qAc/party*), wizard step-change never moves focus, Campaign NpcCard hover-state gap. Roster-picker aria-pressed was a false positive — corrected.
- [Map/atlas cluster (2026-07-29)](reference_map_editor_cluster.md) — Atlas→MapBuilder-wrapper→MapEditor map; Popover has NO z-index without `anchor`; clamp-per-keystroke number inputs; shared ToolOptions keys; single-flight `run()` traps.
- [Shell + board/scene cluster (2026-07-29)](project_shell_board_scene_cluster.md) — bounded-canvas sizing traps (grid overlay overflow, 0.4 scale floor), /board+/scene bypass Page gutters, aria-modal hotkey guard kills ⌘K toggle, panels' Escape-without-focus.
- [Settings/Extensions/Community/Upgrade/ConnectedSources cluster (2026-07-29)](project_settings_extensions_cluster.md) — confirms Tabs aria-controls/tabpanel gap + 2 no-confirm deletes still live; new 3rd hand-rolled radiogroup w/o roving tabindex (Settings tool-preference); ConnectedSources status text has no role=status. Cluster is otherwise a confirm/undo exemplar — verified NON-defects listed.
- [Knowledge/WikiReader/Graph/Atlas cluster (2026-07-29)](project_knowledge_wiki_graph_atlas_cluster.md) — inert `[[wikilinks]]` in both markdown renderers (core resolver exists, unused), Knowledge push-to-players has no confirm/undo, orphan `<li>` outside `<ul>`, notice/error banners missing role=status. Graph.tsx is clean.
- [Player/Char-sheet/Scene-display cluster (2026-07-29)](project_player_char_scene_display_cluster.md) — Player.tsx's whole write-error surface has no role/aria-live (3rd file with this pattern); 13px resource pips; qty→0 silent coercion; ViewAsControl is the app's only role=menu, no arrow keys; SceneDisplayOverlay is the exemplary modal to cite; Join.tsx already fixed, don't re-flag.

## Tooling gotchas
- [DesignSync availability](reference_designsync_availability.md) — DesignSync can be runtime-disabled in ux-ui-reviewer *subagent* context despite being on the toolset; report up + run from main thread.
