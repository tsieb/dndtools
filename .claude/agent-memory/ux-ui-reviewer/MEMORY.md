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
- [Map editor cluster (re-verified 2026-07-30 @ b5ed692f, run #5)](reference_map_editor_cluster.md) — CommitSlider/drag-copy/LayerRow-zIndex now FIXED; 20 open, led by ONE root cause: `FeatureShape` drops `feature.style` so the Water River/Lake control, all 8 Terrain styles and all 17 prop assets render identically. Also: pinch-zoom is Android-gated. ⚠️ Premise correction — the `isPhone && !quickMapMode` layout IS covered by responsive.spec.ts:808.
- [Shell + board/scene cluster (re-verified 2026-07-30 @ b5ed692f, run #7)](project_shell_board_scene_cluster.md) — Layouts panel/heights/Delete-confirm/profileId/hotkey-guard/toast-offset all FIXED; led by widget Roll+Start chips ignoring the core's live-session gate (raw enum error) and SceneEditor never resetting on `:id` change (cross-scene metadata overwrite). Verdict on the phone-fit change + full spec-coupling map inside.
- [Settings/Extensions/Community/Upgrade/ConnectedSources cluster (2026-07-29)](project_settings_extensions_cluster.md) — confirms Tabs aria-controls/tabpanel gap + 2 no-confirm deletes still live; new 3rd hand-rolled radiogroup w/o roving tabindex (Settings tool-preference); ConnectedSources status text has no role=status. Cluster is otherwise a confirm/undo exemplar — verified NON-defects listed.
- [Knowledge/WikiReader/Graph/Atlas cluster (re-audited post-fc40e764)](project_knowledge_wiki_graph_atlas_cluster.md) — wikilinks/`<ul>`/push-confirm now FIXED; still open: Atlas "Focus on map" is dead-by-equivalence with Edit, Knowledge has ZERO live regions + one unlabeled Textarea + success/failure styled identically, 16px Atlas reorder chevrons. Graph.tsx is NOT clean after all (Selected panel above Search reflows the list).
- [Campaign/Session/CommandCenter cluster (re-verified 2026-07-30, post-8138156b)](project_campaign_session_hub_cluster.md) — Session combat row + End-combat confirm + axe combat gate now FIXED (gate RUN, 0 violations); 11 open, led by Campaign NPC tiles as role=button divs. Names the specs that pin QuestCard's button role.
- [Player/PlayerView/Join cluster (re-verified 2026-07-30 @ 0a07165d)](project_player_char_scene_display_cluster.md) — nav opacity/skip-link/toast-region/banner-pause/pips/sheet-padding now FIXED; 16 open, led by `backgroundImage` overwriting the `background` shorthand (stage backdrop dies whenever a scene IS projected) and Player.tsx tab bodies unkeyed by charId (identity drafts write onto the wrong PC). Has a label→spec coupling table.

- [Onboarding + ViewAsControl (2026-07-29, post-fc40e764)](project_onboarding_viewas_cluster.md) — Onboarding `skip()` discards tier/AI/party (only `finish()` persists them); ready-checklist rows silently wipe the vault; step position never announced. ViewAsControl role=menu: no arrow keys, bare-div owned children, no aria-checked.

## Token-layer landmines (read BEFORE writing any color/theme finding)
- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in PlayerView/Player/Community → DM-only banners lose their border AND tint. Real names: `--color-dm-only-badge{,-subtle}`. [[ds-layer-audit]] item 9.
- `:root` `--layer-*` are LIGHT (tuned for the dark map well); only parchment re-cut them DARK. So a white glyph on them (POIMarker) breaks in the DEFAULT theme, not parchment — check which theme before claiming contrast.
- No on-fill foreground token exists for status colours (`-text` is for `-subtle` backgrounds), so `Button` danger's `#fff` can't be fixed by swapping in an existing token.
- Dead DS exports, ZERO consumers — don't spend fix effort: `Tooltip` (its clipping bug is therefore latent), `NavSidebar`/`NavItem`, `DataTable`'s `sortable`, and the `colors.css` legacy alias bridge (`--bg/--fg/--card/…`). `DataTable`'s missing overflow wrapper IS live, though.

## Tooling gotchas
- [DesignSync availability](reference_designsync_availability.md) — DesignSync can be runtime-disabled in ux-ui-reviewer *subagent* context despite being on the toolset; report up + run from main thread.
