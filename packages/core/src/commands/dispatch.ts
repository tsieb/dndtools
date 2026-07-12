import type { CommandResult, CoreCommand, CoreEnvironment, CoreStateSlice } from './types';
import {
	handleCreateScene,
	handleDeleteScene,
	handleInstantiateSceneTemplate,
	handleRestoreScene,
	handleSaveSceneTemplate,
	handleSetSceneSections,
	handleUpdateSceneMetadata,
} from './scene-meta';
import {
	handleAddWidget,
	handleConfigureWidget,
	handleDestroyWidget,
	handleDockWidget,
	handleGroupWidgets,
	handleLayerWidget,
	handleMoveGroup,
	handleMoveWidget,
	handlePinWidget,
	handleResizeWidget,
	handleSetWidgetFocusOrder,
} from './widget';
import { handleDispatchWidgetCommand } from './widget-command';
import {
	handleApplyCommandCenterPreset,
	handleEnsureCommandCenterHome,
	handleRestoreCommandCenterAutoSave,
	handleSaveCommandCenterPreset,
	handleSnapshotCommandCenterAutoSave,
} from './command-center';
import { handleProjectPlayerView, handleRevokePlayerView } from './player-view';
import {
	handleAcknowledgeHandout,
	handleDeliverHandout,
	handleRevealHandoutSection,
	handleRevokeHandout,
} from './handout';
import {
	handleCreatePlayerGroup,
	handleDeletePlayerGroup,
	handleUpdatePlayerGroup,
} from './player-group';
import {
	handleActivateSceneCard,
	handleAdvanceSceneCardQueue,
	handleCreateSceneCard,
	handleDequeueSceneCard,
	handleDeleteSceneCard,
	handleEnqueueSceneCard,
	handleReorderSceneCardQueue,
	handleRestoreSceneCard,
	handleSetSceneCardTransition,
	handleSetSceneCardVisibility,
	handleUpdateSceneCard,
} from './scene-card';
import { handlePinQuickReference, handleUnpinQuickReference } from './quick-reference';
import {
	handleLinkCalendarDate,
	handleSetCampaignDate,
	handleUnlinkCalendarDate,
} from './calendar-continuity';
import { handleGrantCapabilitySet, handleRevokeGrant, handleTransferOwnership } from './grant';
import { handleAssignRole } from './assign-role';
import {
	handleAuthorRecap,
	handleProjectActiveMap,
	handleRecordSessionDice,
	handleRecoverSession,
	handleSetActiveMap,
	handleSetSessionWorkflow,
} from './session-control';
import {
	handleAddCombatants,
	handleAdvanceCombatTurn,
	handleApplyCombatResource,
	handleEndCombat,
	handlePreviousCombatTurn,
	handleRemoveCombatant,
	handleReorderCombatant,
	handleSetCombatantVisibility,
	handleStartCombat,
} from './combat';
import { handleAppendRollToNote, handleRollDice, handleRollTable } from './dice';
import { handleBuildEncounter, handleUpdateEncounter } from './encounter';
import {
	handleDisableWidgetPackage,
	handleEnableWidgetPackage,
	handleInstallWidgetPackage,
	handleRemoveWidgetPackage,
	handleSwitchSystemPackage,
	handleUpgradeWidgetPackage,
} from './widget-package';
import {
	handleCreateMapLayer,
	handleDeleteMapLayer,
	handleDuplicateMapLayer,
	handleLockMapLayer,
	handleRenameMapLayer,
	handleReorderMapLayer,
	handleSetMapLayerEnabled,
	handleSetMapLayerOpacity,
	handleSetMapLayerTags,
	handleSetMapLayerVisibility,
} from './map-layer';
import { handleEditMapLayer, handleGenerateMapLayers } from './map-editing';
import {
	handleCommitMapImport,
	handleCreateMap,
	handleImportMapAsset,
	handleUpdateMapMetadata,
} from './map-entity';
import { handleEmbedChildMap, handleRemoveMapEmbed, handleUpdateMapEmbed } from './map-nesting';
import {
	handleAppendMapFog,
	handleConfigureMapOverlay,
	handleCreateMapPoi,
	handleCreateMapRoute,
	handleCreateMapToken,
	handleDeleteMapPoi,
	handleDeleteMapRoute,
	handleDeleteMapToken,
	handleMoveMapToken,
	handleRemoveMapFog,
	handleSetMapOverlayMode,
	handleUpdateMapPoi,
	handleUpdateMapRoute,
	handleUpdateMapToken,
} from './map-annotations';
import {
	handleCreateCharacterDraft,
	handleEditCharacterField,
	handleFinalizeCharacterDraft,
	handleQuickCreateCharacter,
	handleResolveCharacterConflict,
	handleRevokeCharacterDraft,
	handleSetCharacterCombat,
	handleTransferCharacterDraft,
	handleUpdateCharacterDraftStep,
} from './character';
import {
	handleRestCharacter,
	handleSetCharacterSpell,
	handleSetClassResource,
	handleSetSpellSlots,
	handleUpdateCombatResource,
} from './character-resources';
import {
	handleSetCharacterProficiencies,
	handleSetCharacterSharing,
	handleUpdateCharacterAttacks,
} from './character-sheet';
import {
	handleCancelAdvancement,
	handleCommitAdvancement,
	handleOpenAdvancement,
	handleSetAdvancementChoices,
	handleSetCharacterXp,
} from './character-advancement';
import {
	handleRemovePartyInventoryItem,
	handleSetMarchingOrder,
	handleUpsertPartyInventoryItem,
} from './character-party';
import {
	handleClaimPartyInventoryItem,
	handleMoveEquipmentItem,
	handleRemoveEquipmentItem,
	handleSetCurrency,
	handleUpsertEquipmentItem,
} from './character-inventory';
import {
	handleAddJournalEntry,
	handleRemoveJournalEntry,
	handleSetJournalEntryVisibility,
	handleUpdateJournalEntry,
} from './character-journal';
import {
	handleCreateContentItem,
	handleDefineCalendar,
	handleRemoveContentItem,
	handleRestoreContentItem,
	handleSetContentItemVisibility,
	handleUpdateContentItem,
} from './content';
import {
	handleCommitContentImport,
	handleExportContent,
	handleWriteContentToSource,
} from './content-import-export';
import {
	handleCreateVaultObject,
	handleRenameWikilinkTarget,
	handleRepairWikilink,
	handleUpdateVaultObject,
} from './vault-object';
import { handleCreateFromTemplate, handleInsertSnippet } from './content-templates';
import {
	handleAddContentEmbed,
	handleRemoveContentEmbed,
	handleSetContentFieldVisibility,
	handleSetContentSectionVisibility,
} from './content-visibility-embeds';
import {
	handleCreateSavedSearch,
	handleDeleteSavedSearch,
	handlePinSavedSearch,
	handleUpdateSavedSearch,
} from './saved-search';
import {
	handleConfigureAudioSource,
	handleImportAudioAsset,
	handleUpdateAudioAssetMetadata,
	handleValidateAudioPackage,
} from './audio';
import {
	handleConfigureAudioAutomation,
	handleDeleteAudioAutomation,
} from './audio-automation';
import {
	handleAssociateSceneAudio,
	handleDisassociateSceneAudio,
} from './audio-association';
import {
	handlePauseSessionAudio,
	handlePlaySessionAudio,
	handleProjectSessionAudio,
	handleRemoveAmbienceLayer,
	handleResumeSessionAudio,
	handleSetAmbienceLayer,
	handleSetAudioOutputDevice,
	handleSetSessionAudioVolume,
	handleStopSessionAudio,
} from './audio-playback';
import {
	handleApplyAudioPreset,
	handleDeleteAudioPreset,
	handleSaveAudioPreset,
} from './audio-preset';
import { handleSetPresence } from './presence';
import { handleResolveVaultConflict } from './conflict-resolution';
import {
	handleApproveMcpProposal,
	handleRejectMcpProposal,
	handleRemoveMcpAgentBinding,
	handleSetMcpAgentBinding,
	handleSetMcpAgentPolicy,
	handleSetMcpEnabled,
	handleSetMcpVaultDefault,
} from './mcp-policy';
import { EMPTY_MAP_IMPORT_ADAPTER_REGISTRY } from '../state/map-import';
import { classifyObserverCommand } from '../collab/observer-access';

export function dispatchCommand(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	// COLLAB-011 AC2 — OBSERVER WRITE GATE (fail closed, BEFORE mutation). Every command in this surface is
	// a durable mutation (commands are the only mutation interface — Contract 1 binding rule 1), and an
	// observer is read-only with no write authority (Contract 3 Base Roles). So an observer may invoke NONE
	// of them: classify the actor and REJECT every command type for an observer before any reducer runs.
	// A non-observer passes through to the command's own reducer, which enforces that actor's authority.
	const observerCheck = classifyObserverCommand(state.permissions, command.actorId, command.type);
	if (!observerCheck.allowed) {
		return {
			status: 'rejected',
			rejection: { code: 'actor-not-authorized', message: observerCheck.message },
			nextState: state,
		};
	}
	switch (command.type) {
		case 'scene.create':
			return handleCreateScene(state, env, command.actorId, command.payload);
		case 'scene.update-metadata':
			return handleUpdateSceneMetadata(state, env, command.actorId, command.payload);
		case 'scene.delete':
			return handleDeleteScene(state, env, command.actorId, command.payload);
		case 'scene.restore':
			return handleRestoreScene(state, env, command.actorId, command.payload);
		case 'scene.set-sections':
			return handleSetSceneSections(state, env, command.actorId, command.payload);
		case 'scene.save-template':
			return handleSaveSceneTemplate(state, env, command.actorId, command.payload);
		case 'scene.instantiate-template':
			return handleInstantiateSceneTemplate(state, env, command.actorId, command.payload);
		case 'scene.add-widget':
			return handleAddWidget(state, env, command.actorId, command.payload);
		case 'scene.move-widget':
			return handleMoveWidget(state, env, command.actorId, command.payload);
		case 'scene.resize-widget':
			return handleResizeWidget(state, env, command.actorId, command.payload);
		case 'scene.layer-widget':
			return handleLayerWidget(state, env, command.actorId, command.payload);
		case 'scene.group-widgets':
			return handleGroupWidgets(state, env, command.actorId, command.payload);
		case 'scene.move-group':
			return handleMoveGroup(state, env, command.actorId, command.payload);
		case 'scene.dock-widget':
			return handleDockWidget(state, env, command.actorId, command.payload);
		case 'scene.pin-widget':
			return handlePinWidget(state, env, command.actorId, command.payload);
		case 'scene.set-focus-order':
			return handleSetWidgetFocusOrder(state, env, command.actorId, command.payload);
		case 'scene.destroy-widget':
			return handleDestroyWidget(state, env, command.actorId, command.payload);
		case 'scene.configure-widget':
			return handleConfigureWidget(state, env, command.actorId, command.payload);
		case 'widget.package.install':
			return handleInstallWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.enable':
			return handleEnableWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.disable':
			return handleDisableWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.remove':
			return handleRemoveWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.upgrade':
			return handleUpgradeWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.switch-system':
			return handleSwitchSystemPackage(state, env, command.actorId, command.payload);
		case 'widget.dispatch-command':
			return handleDispatchWidgetCommand(
				state,
				env,
				command.actorId,
				command.payload,
				command.idempotencyKey,
			);
		case 'command-center.ensure-home':
			return handleEnsureCommandCenterHome(state, env, command.actorId, command.payload);
		case 'command-center.save-preset':
			return handleSaveCommandCenterPreset(state, env, command.actorId, command.payload);
		case 'command-center.apply-preset':
			return handleApplyCommandCenterPreset(state, env, command.actorId, command.payload);
		case 'command-center.snapshot-auto-save':
			return handleSnapshotCommandCenterAutoSave(state, env, command.actorId, command.payload);
		case 'command-center.restore-auto-save':
			return handleRestoreCommandCenterAutoSave(state, env, command.actorId, command.payload);
		case 'session.project-player-view':
			return handleProjectPlayerView(state, env, command.actorId, command.payload);
		case 'session.revoke-player-view':
			return handleRevokePlayerView(state, env, command.actorId, command.payload);
		case 'session.set-workflow':
			return handleSetSessionWorkflow(state, env, command.actorId, command.payload);
		case 'session.recover':
			return handleRecoverSession(state, env, command.actorId, command.payload);
		case 'session.record-dice':
			return handleRecordSessionDice(state, env, command.actorId, command.payload);
		case 'dice.roll':
			return handleRollDice(state, env, command.actorId, command.payload);
		case 'dice.roll-table':
			return handleRollTable(state, env, command.actorId, command.payload);
		case 'dice.append-to-note':
			return handleAppendRollToNote(state, env, command.actorId, command.payload);
		case 'combat.start':
			return handleStartCombat(state, env, command.actorId, command.payload);
		case 'combat.advance-turn':
			return handleAdvanceCombatTurn(state, env, command.actorId, command.payload);
		case 'combat.previous-turn':
			return handlePreviousCombatTurn(state, env, command.actorId, command.payload);
		case 'combat.apply-resource':
			return handleApplyCombatResource(state, env, command.actorId, command.payload);
		case 'combat.end':
			return handleEndCombat(state, env, command.actorId, command.payload);
		// UX-SES-008 — mid-combat combatant management (DM-only; active-session + running-combat gated).
		case 'combat.add-combatants':
			return handleAddCombatants(state, env, command.actorId, command.payload);
		case 'combat.remove-combatant':
			return handleRemoveCombatant(state, env, command.actorId, command.payload);
		case 'combat.reorder-combatant':
			return handleReorderCombatant(state, env, command.actorId, command.payload);
		case 'combat.set-combatant-visibility':
			return handleSetCombatantVisibility(state, env, command.actorId, command.payload);
		case 'encounter.build':
			return handleBuildEncounter(state, env, command.actorId, command.payload);
		case 'encounter.update':
			return handleUpdateEncounter(state, env, command.actorId, command.payload);
		case 'session.deliver-handout':
			return handleDeliverHandout(state, env, command.actorId, command.payload);
		case 'session.reveal-handout-section':
			return handleRevealHandoutSection(state, env, command.actorId, command.payload);
		case 'session.acknowledge-handout':
			return handleAcknowledgeHandout(state, env, command.actorId, command.payload);
		case 'session.revoke-handout':
			return handleRevokeHandout(state, env, command.actorId, command.payload);
		case 'session.create-player-group':
			return handleCreatePlayerGroup(state, env, command.actorId, command.payload);
		case 'session.update-player-group':
			return handleUpdatePlayerGroup(state, env, command.actorId, command.payload);
		case 'session.delete-player-group':
			return handleDeletePlayerGroup(state, env, command.actorId, command.payload);
		// I11 S11.2.1–S11.2.4 — SCENE CARD (atmosphere) authoring, display, queue, and player push.
		case 'scene-card.create':
			return handleCreateSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.update':
			return handleUpdateSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.delete':
			return handleDeleteSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.restore':
			return handleRestoreSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.set-visibility':
			return handleSetSceneCardVisibility(state, env, command.actorId, command.payload);
		case 'scene-card.activate':
			return handleActivateSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.set-transition':
			return handleSetSceneCardTransition(state, env, command.actorId, command.payload);
		case 'scene-card.enqueue':
			return handleEnqueueSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.dequeue':
			return handleDequeueSceneCard(state, env, command.actorId, command.payload);
		case 'scene-card.reorder-queue':
			return handleReorderSceneCardQueue(state, env, command.actorId, command.payload);
		case 'scene-card.advance':
			return handleAdvanceSceneCardQueue(state, env, command.actorId, command.payload);
		case 'session.pin-quick-reference':
			return handlePinQuickReference(state, env, command.actorId, command.payload);
		case 'session.unpin-quick-reference':
			return handleUnpinQuickReference(state, env, command.actorId, command.payload);
		case 'session.set-campaign-date':
			return handleSetCampaignDate(state, env, command.actorId, command.payload);
		case 'session.link-calendar-date':
			return handleLinkCalendarDate(state, env, command.actorId, command.payload);
		case 'session.unlink-calendar-date':
			return handleUnlinkCalendarDate(state, env, command.actorId, command.payload);
		case 'session.set-active-map':
			return handleSetActiveMap(state, env, command.actorId, command.payload);
		case 'session.project-active-map':
			return handleProjectActiveMap(state, env, command.actorId, command.payload);
		case 'permission.grant-capability-set':
			return handleGrantCapabilitySet(state, env, command.actorId, command.payload);
		case 'permission.revoke-grant':
			return handleRevokeGrant(state, env, command.actorId, command.payload);
		case 'permission.transfer-ownership':
			return handleTransferOwnership(state, env, command.actorId, command.payload);
		case 'permission.assign-role':
			return handleAssignRole(state, env, command.actorId, command.payload);
		case 'map.create-layer':
			return handleCreateMapLayer(state, env, command.actorId, command.payload);
		case 'map.rename-layer':
			return handleRenameMapLayer(state, env, command.actorId, command.payload);
		case 'map.reorder-layer':
			return handleReorderMapLayer(state, env, command.actorId, command.payload);
		case 'map.duplicate-layer':
			return handleDuplicateMapLayer(state, env, command.actorId, command.payload);
		case 'map.lock-layer':
			return handleLockMapLayer(state, env, command.actorId, command.payload);
		case 'map.delete-layer':
			return handleDeleteMapLayer(state, env, command.actorId, command.payload);
		case 'map.set-layer-visibility':
			return handleSetMapLayerVisibility(state, env, command.actorId, command.payload);
		case 'map.set-layer-enabled':
			return handleSetMapLayerEnabled(state, env, command.actorId, command.payload);
		case 'map.set-layer-opacity':
			return handleSetMapLayerOpacity(state, env, command.actorId, command.payload);
		case 'map.set-layer-tags':
			return handleSetMapLayerTags(state, env, command.actorId, command.payload);
		case 'map.edit-layer':
			return handleEditMapLayer(state, env, command.actorId, command.payload);
		case 'map.generate-layers':
			return handleGenerateMapLayers(state, env, command.actorId, command.payload);
		case 'map.create':
			return handleCreateMap(state, env, command.actorId, command.payload);
		case 'map.import-asset':
			return handleImportMapAsset(
				state,
				env,
				command.actorId,
				command.payload,
				env.mapImportAdapters ?? EMPTY_MAP_IMPORT_ADAPTER_REGISTRY,
			);
		case 'map.commit-import':
			return handleCommitMapImport(
				state,
				env,
				command.actorId,
				command.payload,
				env.mapImportAdapters ?? EMPTY_MAP_IMPORT_ADAPTER_REGISTRY,
			);
		case 'map.embed-child':
			return handleEmbedChildMap(state, env, command.actorId, command.payload);
		case 'map.update-embed':
			return handleUpdateMapEmbed(state, env, command.actorId, command.payload);
		case 'map.remove-embed':
			return handleRemoveMapEmbed(state, env, command.actorId, command.payload);
		case 'map.create-poi':
			return handleCreateMapPoi(state, env, command.actorId, command.payload);
		case 'map.update-poi':
			return handleUpdateMapPoi(state, env, command.actorId, command.payload);
		case 'map.delete-poi':
			return handleDeleteMapPoi(state, env, command.actorId, command.payload);
		case 'map.create-route':
			return handleCreateMapRoute(state, env, command.actorId, command.payload);
		case 'map.update-route':
			return handleUpdateMapRoute(state, env, command.actorId, command.payload);
		case 'map.delete-route':
			return handleDeleteMapRoute(state, env, command.actorId, command.payload);
		case 'map.append-fog':
			return handleAppendMapFog(state, env, command.actorId, command.payload);
		case 'map.remove-fog':
			return handleRemoveMapFog(state, env, command.actorId, command.payload);
		case 'map.create-token':
			return handleCreateMapToken(state, env, command.actorId, command.payload);
		case 'map.move-token':
			return handleMoveMapToken(state, env, command.actorId, command.payload);
		case 'map.update-token':
			return handleUpdateMapToken(state, env, command.actorId, command.payload);
		case 'map.delete-token':
			return handleDeleteMapToken(state, env, command.actorId, command.payload);
		case 'map.set-overlay-mode':
			return handleSetMapOverlayMode(state, env, command.actorId, command.payload);
		case 'map.configure-overlay':
			return handleConfigureMapOverlay(state, env, command.actorId, command.payload);
		case 'map.update-metadata':
			return handleUpdateMapMetadata(state, env, command.actorId, command.payload);
		case 'character.quick-create':
			return handleQuickCreateCharacter(state, env, command.actorId, command.payload);
		case 'character.set-combat':
			return handleSetCharacterCombat(state, env, command.actorId, command.payload);
		case 'character.create-draft':
			return handleCreateCharacterDraft(state, env, command.actorId, command.payload);
		case 'character.transfer-draft':
			return handleTransferCharacterDraft(state, env, command.actorId, command.payload);
		case 'character.revoke-draft':
			return handleRevokeCharacterDraft(state, env, command.actorId, command.payload);
		case 'character.update-draft-step':
			return handleUpdateCharacterDraftStep(state, env, command.actorId, command.payload);
		case 'character.finalize-draft':
			return handleFinalizeCharacterDraft(state, env, command.actorId, command.payload);
		case 'character.edit-field':
			return handleEditCharacterField(state, env, command.actorId, command.payload);
		case 'character.resolve-conflict':
			return handleResolveCharacterConflict(state, env, command.actorId, command.payload);
		case 'conflict.resolve':
			return handleResolveVaultConflict(state, env, command.actorId, command.payload);
		case 'character.update-combat-resource':
			return handleUpdateCombatResource(state, env, command.actorId, command.payload);
		case 'character.set-spell-slots':
			return handleSetSpellSlots(state, env, command.actorId, command.payload);
		case 'character.set-class-resource':
			return handleSetClassResource(state, env, command.actorId, command.payload);
		case 'character.set-spell':
			return handleSetCharacterSpell(state, env, command.actorId, command.payload);
		case 'character.rest':
			return handleRestCharacter(state, env, command.actorId, command.payload);
		case 'character.set-proficiencies':
			return handleSetCharacterProficiencies(state, env, command.actorId, command.payload);
		case 'character.update-attacks':
			return handleUpdateCharacterAttacks(state, env, command.actorId, command.payload);
		case 'character.set-sharing':
			return handleSetCharacterSharing(state, env, command.actorId, command.payload);
		case 'character.set-xp':
			return handleSetCharacterXp(state, env, command.actorId, command.payload);
		case 'character.open-advancement':
			return handleOpenAdvancement(state, env, command.actorId, command.payload);
		case 'character.set-advancement-choices':
			return handleSetAdvancementChoices(state, env, command.actorId, command.payload);
		case 'character.commit-advancement':
			return handleCommitAdvancement(state, env, command.actorId, command.payload);
		case 'character.cancel-advancement':
			return handleCancelAdvancement(state, env, command.actorId, command.payload);
		case 'character.set-marching-order':
			return handleSetMarchingOrder(state, env, command.actorId, command.payload);
		case 'character.upsert-party-inventory-item':
			return handleUpsertPartyInventoryItem(state, env, command.actorId, command.payload);
		case 'character.remove-party-inventory-item':
			return handleRemovePartyInventoryItem(state, env, command.actorId, command.payload);
		case 'character.upsert-equipment-item':
			return handleUpsertEquipmentItem(state, env, command.actorId, command.payload);
		case 'character.remove-equipment-item':
			return handleRemoveEquipmentItem(state, env, command.actorId, command.payload);
		case 'character.move-equipment-item':
			return handleMoveEquipmentItem(state, env, command.actorId, command.payload);
		case 'character.set-currency':
			return handleSetCurrency(state, env, command.actorId, command.payload);
		case 'character.claim-party-inventory-item':
			return handleClaimPartyInventoryItem(state, env, command.actorId, command.payload);
		case 'character.add-journal-entry':
			return handleAddJournalEntry(state, env, command.actorId, command.payload);
		case 'character.update-journal-entry':
			return handleUpdateJournalEntry(state, env, command.actorId, command.payload);
		case 'character.set-journal-entry-visibility':
			return handleSetJournalEntryVisibility(state, env, command.actorId, command.payload);
		case 'character.remove-journal-entry':
			return handleRemoveJournalEntry(state, env, command.actorId, command.payload);
		case 'content.define-calendar':
			return handleDefineCalendar(state, env, command.actorId, command.payload);
		case 'content.create-item':
			return handleCreateContentItem(state, env, command.actorId, command.payload);
		case 'content.update-item':
			return handleUpdateContentItem(state, env, command.actorId, command.payload);
		case 'content.set-item-visibility':
			return handleSetContentItemVisibility(state, env, command.actorId, command.payload);
		case 'content.remove-item':
			return handleRemoveContentItem(state, env, command.actorId, command.payload);
		case 'content.restore-item':
			return handleRestoreContentItem(state, env, command.actorId, command.payload);
		case 'content.commit-import':
			return handleCommitContentImport(state, env, command.actorId, command.payload);
		case 'content.export':
			return handleExportContent(state, env, command.actorId, command.payload);
		case 'content.write-to-source':
			return handleWriteContentToSource(state, env, command.actorId, command.payload);
		case 'content.create-object':
			return handleCreateVaultObject(state, env, command.actorId, command.payload);
		case 'content.update-object':
			return handleUpdateVaultObject(state, env, command.actorId, command.payload);
		case 'content.rename-wikilink-target':
			return handleRenameWikilinkTarget(state, env, command.actorId, command.payload);
		case 'content.repair-wikilink':
			return handleRepairWikilink(state, env, command.actorId, command.payload);
		case 'content.create-from-template':
			return handleCreateFromTemplate(state, env, command.actorId, command.payload);
		case 'content.insert-snippet':
			return handleInsertSnippet(state, env, command.actorId, command.payload);
		case 'content.set-section-visibility':
			return handleSetContentSectionVisibility(state, env, command.actorId, command.payload);
		case 'content.set-field-visibility':
			return handleSetContentFieldVisibility(state, env, command.actorId, command.payload);
		case 'content.add-embed':
			return handleAddContentEmbed(state, env, command.actorId, command.payload);
		case 'content.remove-embed':
			return handleRemoveContentEmbed(state, env, command.actorId, command.payload);
		case 'content.create-saved-search':
			return handleCreateSavedSearch(state, env, command.actorId, command.payload);
		case 'content.update-saved-search':
			return handleUpdateSavedSearch(state, env, command.actorId, command.payload);
		case 'content.pin-saved-search':
			return handlePinSavedSearch(state, env, command.actorId, command.payload);
		case 'content.delete-saved-search':
			return handleDeleteSavedSearch(state, env, command.actorId, command.payload);
		case 'audio.import-asset':
			return handleImportAudioAsset(state, env, command.actorId, command.payload);
		case 'audio.update-asset-metadata':
			return handleUpdateAudioAssetMetadata(state, env, command.actorId, command.payload);
		case 'audio.configure-source':
			return handleConfigureAudioSource(state, env, command.actorId, command.payload);
		case 'audio.validate-package':
			return handleValidateAudioPackage(state, env, command.actorId, command.payload);
		case 'audio.configure-automation':
			return handleConfigureAudioAutomation(state, env, command.actorId, command.payload);
		case 'audio.delete-automation':
			return handleDeleteAudioAutomation(state, env, command.actorId, command.payload);
		case 'audio.associate-scene':
			return handleAssociateSceneAudio(state, env, command.actorId, command.payload);
		case 'audio.disassociate-scene':
			return handleDisassociateSceneAudio(state, env, command.actorId, command.payload);
		case 'session.audio.play':
			return handlePlaySessionAudio(state, env, command.actorId, command.payload);
		case 'session.audio.pause':
			return handlePauseSessionAudio(state, env, command.actorId, command.payload);
		case 'session.audio.resume':
			return handleResumeSessionAudio(state, env, command.actorId, command.payload);
		case 'session.audio.stop':
			return handleStopSessionAudio(state, env, command.actorId, command.payload);
		case 'session.audio.set-volume':
			return handleSetSessionAudioVolume(state, env, command.actorId, command.payload);
		case 'session.audio.project':
			return handleProjectSessionAudio(state, env, command.actorId, command.payload);
		case 'session.audio.set-ambience-layer':
			return handleSetAmbienceLayer(state, env, command.actorId, command.payload);
		case 'session.audio.remove-ambience-layer':
			return handleRemoveAmbienceLayer(state, env, command.actorId, command.payload);
		case 'session.audio.set-output-device':
			return handleSetAudioOutputDevice(state, env, command.actorId, command.payload);
		case 'session.audio.apply-preset':
			return handleApplyAudioPreset(state, env, command.actorId, command.payload);
		case 'audio.save-preset':
			return handleSaveAudioPreset(state, env, command.actorId, command.payload);
		case 'audio.delete-preset':
			return handleDeleteAudioPreset(state, env, command.actorId, command.payload);
		case 'session.author-recap':
			return handleAuthorRecap(state, env, command.actorId, command.payload);
		case 'session.set-presence':
			return handleSetPresence(state, env, command.actorId, command.payload);
		case 'mcp.set-enabled':
			return handleSetMcpEnabled(state, env, command.actorId, command.payload);
		case 'mcp.set-agent-binding':
			return handleSetMcpAgentBinding(state, env, command.actorId, command.payload);
		case 'mcp.remove-agent-binding':
			return handleRemoveMcpAgentBinding(state, env, command.actorId, command.payload);
		case 'mcp.set-agent-policy':
			return handleSetMcpAgentPolicy(state, env, command.actorId, command.payload);
		case 'mcp.set-vault-default':
			return handleSetMcpVaultDefault(state, env, command.actorId, command.payload);
		case 'mcp.approve-proposal':
			return handleApproveMcpProposal(state, env, command.actorId, command.payload);
		case 'mcp.reject-proposal':
			return handleRejectMcpProposal(state, env, command.actorId, command.payload);
	}
}

export type { CoreCommand };
