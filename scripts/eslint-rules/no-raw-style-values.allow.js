/**
 * RC-DSN-1.1 ratchet for `no-raw-style-values`.
 *
 * Each entry is a file in `apps/gm-react/src/app` or `apps/gm-react/src/screens` that still
 * contains legacy raw style literals. The migration ratchets when an entry is lowered to the
 * current real count; adding entries without lowering is not accepted. Regenerate with
 * `pnpm lint:raw-style-count --write` after a token migration pass.
 */

export const allow = {
	'apps/gm-react/src/app/canvas/WidgetFrame.tsx': 6,
	'apps/gm-react/src/app/canvas/ZoomCluster.tsx': 2,
	'apps/gm-react/src/app/combat/HpKeypadSheet.tsx': 5,
	'apps/gm-react/src/app/combat/StatBlockSheet.tsx': 2,
	'apps/gm-react/src/app/EncounterBuilder.tsx': 12,
	'apps/gm-react/src/app/EncounterDraftRoster.tsx': 8,
	'apps/gm-react/src/app/ProjectionControl.tsx': 5,
	'apps/gm-react/src/app/sceneCardMood.ts': 20,
	'apps/gm-react/src/app/screen-kit.tsx': 20,
	'apps/gm-react/src/app/session/QuickPanel.tsx': 17,
	'apps/gm-react/src/app/ViewAsControl.tsx': 13,
	'apps/gm-react/src/app/widget-body-kit.tsx': 4,
	'apps/gm-react/src/app/widgets/builtin/AtlasBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/CharacterBody.tsx': 2,
	'apps/gm-react/src/app/widgets/builtin/CharactersBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/CombatBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/DiceBody.tsx': 2,
	'apps/gm-react/src/app/widgets/builtin/GettingStartedBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/InitiativeTracker.tsx': 11,
	'apps/gm-react/src/app/widgets/builtin/Map.tsx': 4,
	'apps/gm-react/src/app/widgets/builtin/PlayerViewsBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/SearchBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/SessionBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/TimerBody.tsx': 1,
	'apps/gm-react/src/app/widgets/builtin/ToolsBody.tsx': 1,
	'apps/gm-react/src/app/widgets/templates/Chart.tsx': 3,
	'apps/gm-react/src/app/widgets/templates/SceneMessage.tsx': 1,
	'apps/gm-react/src/app/widgets/templates/shared.tsx': 3,
	'apps/gm-react/src/app/widgets/templates/StatusList.tsx': 3,
	'apps/gm-react/src/screens/Board.tsx': 3,
	'apps/gm-react/src/screens/BoardLayoutsPanel.tsx': 2,
	'apps/gm-react/src/screens/characters/shared.tsx': 2,
	'apps/gm-react/src/screens/characters/sheet/BioPanel.tsx': 2,
	'apps/gm-react/src/screens/characters/sheet/SharingPanel.tsx': 7,
	'apps/gm-react/src/screens/characters/sheet/SheetHeader.tsx': 7,
	'apps/gm-react/src/screens/characters/sheet/SpellsPanel.tsx': 20,
	'apps/gm-react/src/screens/CommandCenter.tsx': 3,
	'apps/gm-react/src/screens/play/Home.tsx': 10,
	'apps/gm-react/src/screens/SceneCardsPanel.tsx': 1,
	'apps/gm-react/src/screens/SceneQueuePanel.tsx': 1,
	'apps/gm-react/src/screens/session/ActiveMap.tsx': 1,
	'apps/gm-react/src/screens/session/CampaignDate.tsx': 5,
	'apps/gm-react/src/screens/session/Capture.tsx': 12,
	'apps/gm-react/src/screens/session/CombatTracker.tsx': 28,
	'apps/gm-react/src/screens/session/ConditionPickerDialog.tsx': 2,
	'apps/gm-react/src/screens/session/DiceTray.tsx': 11,
	'apps/gm-react/src/screens/session/Handouts.tsx': 5,
	'apps/gm-react/src/screens/session/index.tsx': 2,
	'apps/gm-react/src/screens/session/Lifecycle.tsx': 9,
	'apps/gm-react/src/screens/session/NowPlaying.tsx': 4,
	'apps/gm-react/src/screens/session/PrepRecap.tsx': 8,
	'apps/gm-react/src/screens/session/Roster.tsx': 7,
	'apps/gm-react/src/screens/session/Schedule.tsx': 3,
	'apps/gm-react/src/screens/session/Tables.tsx': 3,
};

// Total current findings: 437
