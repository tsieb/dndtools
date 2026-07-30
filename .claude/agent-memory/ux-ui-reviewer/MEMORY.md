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
- [Character/encounter cluster (re-audited 3x, latest post-fc40e764)](project_char_encounter_cluster.md) — NumStepper +/- only (HP 250 = 249 clicks), wizard step-change invisible to AT, discard-dialog shares wizard trap, Tile→radiogroup would BREAK authoring-layout.spec, EncounterBuilder has no e2e.
- [Map/atlas cluster (re-audited post-fc40e764)](reference_map_editor_cluster.md) — setNotice is the unannounced/info-toned error channel; active layer is mouse-only (LayerRow `{...rest}` clobbers onKeyDown); dead drag-to-place; no global button:hover; Popover z-index gotcha; single-flight `run()` slider traps.
- [Shell + board/scene cluster (2026-07-29, run #4 re-audit)](project_shell_board_scene_cluster.md) — bounded auto-fit scale ≈0.47 on phone (extent is 792px; floor isn't the problem, overflowX:hidden is), undismissable Board "Layouts" panel, Board Delete still unconfirmed, Ctrl+ArrowRight hijack, magic-number heights push zoom cluster below fold. Spec map + verified non-defects inside.
- [Settings/Extensions/Community/Upgrade/ConnectedSources cluster (2026-07-29)](project_settings_extensions_cluster.md) — confirms Tabs aria-controls/tabpanel gap + 2 no-confirm deletes still live; new 3rd hand-rolled radiogroup w/o roving tabindex (Settings tool-preference); ConnectedSources status text has no role=status. Cluster is otherwise a confirm/undo exemplar — verified NON-defects listed.
- [Knowledge/WikiReader/Graph/Atlas cluster (re-audited post-fc40e764)](project_knowledge_wiki_graph_atlas_cluster.md) — wikilinks/`<ul>`/push-confirm now FIXED; still open: Atlas "Focus on map" is dead-by-equivalence with Edit, Knowledge has ZERO live regions + one unlabeled Textarea + success/failure styled identically, 16px Atlas reorder chevrons. Graph.tsx is NOT clean after all (Selected panel above Search reflows the list).
- [Campaign/Session/CommandCenter/Characters cluster (2026-07-29, post-fc40e764)](project_campaign_session_hub_cluster.md) — Campaign Tabs + Characters grids now FIXED; 13 open incl. unreachable handout guidance, Campaign create-button focus loss, ConditionBadge 14px remove. Lists which e2e specs pin role=button on QuestCard objectives.
- [Player/Char-sheet/Scene-display/SceneCards cluster (re-verified 2026-07-29 post-fc40e764)](project_player_char_scene_display_cluster.md) — 13 open items w/ measurements: locked /play nav rows at 2.48:1, /play has no skip link + DOM-first phone nav, class-resource pips can't just grow to 24px (unbounded `max`), stage hard-codes 6 colours (real symptom is forced-colors, not contrast). Lists FIXED items (Player.tsx role=alert, Join.tsx, ds/Field auto-id) + per-surface e2e coverage map + the fact /play and /join are absent from the axe gate.

- [Onboarding + ViewAsControl (2026-07-29, post-fc40e764)](project_onboarding_viewas_cluster.md) — Onboarding `skip()` discards tier/AI/party (only `finish()` persists them); ready-checklist rows silently wipe the vault; step position never announced. ViewAsControl role=menu: no arrow keys, bare-div owned children, no aria-checked.

## Token-layer landmines (read BEFORE writing any color/theme finding)
- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in PlayerView/Player/Community → DM-only banners lose their border AND tint. Real names: `--color-dm-only-badge{,-subtle}`. [[ds-layer-audit]] item 9.
- `:root` `--layer-*` are LIGHT (tuned for the dark map well); only parchment re-cut them DARK. So a white glyph on them (POIMarker) breaks in the DEFAULT theme, not parchment — check which theme before claiming contrast.
- No on-fill foreground token exists for status colours (`-text` is for `-subtle` backgrounds), so `Button` danger's `#fff` can't be fixed by swapping in an existing token.
- Dead DS exports, ZERO consumers — don't spend fix effort: `Tooltip` (its clipping bug is therefore latent), `NavSidebar`/`NavItem`, `DataTable`'s `sortable`, and the `colors.css` legacy alias bridge (`--bg/--fg/--card/…`). `DataTable`'s missing overflow wrapper IS live, though.

## Tooling gotchas
- [DesignSync availability](reference_designsync_availability.md) — DesignSync can be runtime-disabled in ux-ui-reviewer *subagent* context despite being on the toolset; report up + run from main thread.
