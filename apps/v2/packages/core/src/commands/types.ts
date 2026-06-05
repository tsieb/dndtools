import type { ActorId, OperationId, SceneId } from '../state/ids';
import type { Clock, IdGenerator } from '../state/ids';
import type { CharacterState } from '../state/character-state';
import type { CommandCenterState } from '../state/command-center-state';
import type { MapState } from '../state/map-state';
import type { MapLayerMutationKind } from '../state/map-layers';
import type { MapImportAdapterRegistry } from '../state/map-import';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { SessionWorkflowState, SessionState } from '../state/session-state';
import type { WidgetPackageState } from '../state/widget-package-state';
import type { VaultContentState } from '../state/content';
import type { ImportConflictPolicy, ImportSourceKind } from '../state/content-import';
import type { ContentExport, ContentExportMode } from '../state/content-export';
import type { OperationLog, SyncOperation } from '../sync/operation-log';

export interface CoreStateSlice {
	scenes: SceneState;
	maps: MapState;
	permissions: PermissionState;
	session: SessionState;
	widgets: WidgetPackageState;
	commandCenter: CommandCenterState;
	characters: CharacterState;
	/** CONTENT — calendar-aware notes/structured objects + the campaign calendar registry. */
	content: VaultContentState;
	sync: OperationLog;
}

export interface CoreEnvironment {
	vaultId: string;
	sourceId: string;
	ids: IdGenerator;
	clock: Clock;
	/**
	 * MAP-002 / MAP-020 — declared external-format import adapters. Optional; when absent NO external
	 * scene format is declared, so every external import is rejected fail-closed (only native image/SVG
	 * imports succeed). Modeled as a typed registry so a format can never be imported without a declared
	 * adapter.
	 */
	mapImportAdapters?: MapImportAdapterRegistry;
}

export type CoreCommand =
	| { type: 'scene.create'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.update-metadata'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.set-sections'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.save-template'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'scene.instantiate-template';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'scene.add-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.move-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.resize-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.layer-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.group-widgets'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.move-group'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.dock-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.pin-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.set-focus-order'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.destroy-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.configure-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.install'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.enable'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.disable'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.remove'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.upgrade'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'widget.dispatch-command';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.ensure-home';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.save-preset';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.apply-preset';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'session.project-player-view';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'session.revoke-player-view';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'session.set-workflow'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.update-combat'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.record-dice'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.set-active-map'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'session.project-active-map';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'permission.grant-capability-set';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'permission.revoke-grant'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'permission.transfer-ownership';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'map.create-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.rename-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.reorder-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.duplicate-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.lock-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.delete-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'map.set-layer-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'map.set-layer-enabled'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.set-layer-opacity'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.set-layer-tags'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-003: draw/paint edit (before+after content capture for undo and sync).
	| { type: 'map.edit-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-004: deterministic procedural generation saved as editable map layers.
	| { type: 'map.generate-layers'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-001: create a map entity (name, scale, projection, default visibility, initial layers).
	| { type: 'map.create'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-002: import a native image/SVG as a content-addressed map asset.
	| { type: 'map.import-asset'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-020: commit a previewed import as a transaction (rollback-safe, no partial commit).
	| { type: 'map.commit-import'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-008 / MAP-017: embed a child map in a parent (cycle + depth fail-closed in the reducer).
	| { type: 'map.embed-child'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-008: update an embed's transform / transition behavior / threshold.
	| { type: 'map.update-embed'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-008: remove an embed (never deletes the child map).
	| { type: 'map.remove-embed'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-010 / MAP-011: create / update / delete a POI (normalized coords, independent visibility).
	| { type: 'map.create-poi'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.update-poi'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.delete-poi'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-013: create / update / delete a route (waypoints; distance/time are derived, not stored).
	| { type: 'map.create-route'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.update-route'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.delete-route'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-012: append / remove a durable fog reveal/conceal op (syncs to player views; queued offline).
	| { type: 'map.append-fog'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.remove-fog'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-019: combat token lifecycle (create/move/update/delete). Move records distance from scale.
	| { type: 'map.create-token'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.move-token'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.update-token'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.delete-token'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-014: explicit combat overlay mode + prerequisite-gated configuration.
	| { type: 'map.set-overlay-mode'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.configure-overlay'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CHAR-001: DM quick-create of an NPC/monster/sidekick (simplified, dm-only default, bindable).
	| { type: 'character.quick-create'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CHAR-013: draft ownership lifecycle (create/assign, atomic transfer, revoke) — exactly one owner.
	| { type: 'character.create-draft'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'character.transfer-draft';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'character.revoke-draft'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CHAR-002: the draft owner saves a guided-flow step and finalizes a valid draft (resumable).
	| {
			type: 'character.update-draft-step';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.finalize-draft';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CHAR-001 foundation: set a character's combat field so a bound widget refreshes.
	| { type: 'character.set-combat'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CHAR-004 / CHAR-005: edit any character field (validated, attributed; same-path concurrent edits
	// surface a conflict instead of silent last-write-wins).
	| { type: 'character.edit-field'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CHAR-004: the DM resolves an unresolved same-path conflict by selecting the local/remote value.
	| {
			type: 'character.resolve-conflict';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CHAR-007: update a combat resource (HP/temp-HP/conditions/death-saves/concentration/slots/class
	// resources) DURING a session. Owner OR combat-participant; gated on the active-session workflow.
	| {
			type: 'character.update-combat-resource';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CHAR-008: owner-managed spell/slot/class-resource structure + deterministic rest recovery.
	| { type: 'character.set-spell-slots'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'character.set-class-resource';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'character.set-spell'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'character.rest'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CHAR-009: staged-then-commit level-up / advancement (XP or milestone), owner-only.
	| { type: 'character.set-xp'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'character.open-advancement'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'character.set-advancement-choices';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.commit-advancement';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.cancel-advancement';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CHAR-011: party-record authoring (marching order + party inventory) — DM-only.
	| { type: 'character.set-marching-order'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'character.upsert-party-inventory-item';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.remove-party-inventory-item';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CHAR-012 / CHAR-016: character journal — owner/DM author; per-entry visibility; a visibility
	// change is the cross-surface invalidation trigger.
	| { type: 'character.add-journal-entry'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'character.update-journal-entry';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.set-journal-entry-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.remove-journal-entry';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CONTENT-011: campaign calendar registry + calendar-aware content items (notes/objects) with
	// custom-date fields, timeline references, and per-item visibility. Authorized-editor only.
	| { type: 'content.define-calendar'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.create-item'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.update-item'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'content.set-item-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'content.remove-item'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-001: restore a soft-deleted content item (the inverse of remove-item).
	| { type: 'content.restore-item'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-005: create / update a structured Vault Object (note-backed record). The frontmatter `fields`
	// are SCHEMA-VALIDATED against the subtype registry at dispatch; an invalid object is rejected fail-closed
	// (no invalid revision committed). The frontmatter and markdown body stay in sync per the deterministic
	// rule in `state/vault-object.ts`.
	| { type: 'content.create-object'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.update-object'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-006: RENAME a wikilink target (rename the note + propagate the rename to every referring link in
	// the actor's visible notes) and REPAIR a broken wikilink (rewrite a broken target to a visible, available
	// fix). Both are actor-filtered + fail-closed (never touch a hidden target; never a destructive offline
	// rewrite).
	| { type: 'content.rename-wikilink-target'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.repair-wikilink'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-007: commit a transactional, resumable import of a markdown archive / Obsidian vault
	// (preview is pure/read-only; resume skips already-applied steps; no partial commit on rejection).
	| { type: 'content.commit-import'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-008: export portable markdown + validation report (fail-closed visibility + redaction).
	| { type: 'content.export'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-012: write a note's content back to a target SOURCE (local markdown / Obsidian / Google
	// Docs). FAIL-CLOSED: a write that would lose/downgrade detected structures is rejected unless the
	// payload carries the matching acknowledgment token (the pre-write constraint check surfaces exactly
	// what is lost). The local draft is never mutated by a rejected write.
	| { type: 'content.write-to-source'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-003: create a note/object FROM A STARTER PRESET with variables. The generated content is
	// validated through the EXISTING pipeline BEFORE the write; a missing required variable or invalid
	// generated content is rejected fail-closed. Visibility fails closed to dm-only (no silent widening).
	| { type: 'content.create-from-template'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-004: insert a SNIPPET into an existing note. The result funnels through the SAME
	// validation + sanitization (render) + visibility pipeline as hand-typed content — a snippet cannot
	// skip validation, smuggle unsanitized markdown, or widen the note's visibility (all fail-closed).
	| { type: 'content.insert-snippet'; actorId: ActorId; payload: unknown; idempotencyKey?: string };

export type CoreEvent =
	| { kind: 'scene.created'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.metadata-changed'; sceneId: SceneId; actorId: ActorId; paths: string[] }
	| { kind: 'scene.sections-changed'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.widget-added'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| {
			kind: 'scene.widget-layout-changed';
			sceneId: SceneId;
			widgetInstanceId: string;
			actorId: ActorId;
			field: 'position' | 'size' | 'z' | 'dock' | 'pin' | 'group' | 'focusOrder';
	  }
	| { kind: 'scene.widget-destroyed'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| {
			kind: 'scene.widget-configured';
			sceneId: SceneId;
			widgetInstanceId: string;
			actorId: ActorId;
	  }
	| {
			kind: 'scene.template-saved';
			templateSceneId: SceneId;
			sourceSceneId: SceneId;
			actorId: ActorId;
	  }
	| {
			kind: 'scene.template-instantiated';
			templateSceneId: SceneId;
			newSceneId: SceneId;
			actorId: ActorId;
	  }
	| { kind: 'widget.package-installed'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-enabled'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-disabled'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-removed'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-upgraded'; packageId: string; actorId: ActorId }
	| { kind: 'session.timer-started'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| { kind: 'command-center.home-created'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'command-center.home-ready'; sceneId: SceneId; actorId: ActorId }
	| {
			kind: 'command-center.preset-saved';
			presetId: string;
			sceneId: SceneId;
			actorId: ActorId;
	  }
	| {
			kind: 'command-center.preset-restored';
			presetId: string;
			sceneId: SceneId;
			actorId: ActorId;
			restoredWidgetCount: number;
			missingWidgetTypes: string[];
	  }
	| {
			kind: 'session.player-view-projected';
			assignmentId: string;
			sceneId: SceneId;
			playerActorId: ActorId;
			actorId: ActorId;
			deliveryStatus: 'delivered' | 'queued';
	  }
	| {
			kind: 'session.player-view-revoked';
			assignmentId: string;
			sceneId: SceneId;
			playerActorId: ActorId;
			actorId: ActorId;
	  }
	| {
			kind: 'session.workflow-changed';
			actorId: ActorId;
			from: SessionWorkflowState;
			to: SessionWorkflowState;
			activeSceneId: SceneId | null;
			recapArchiveId: string | null;
	  }
	| { kind: 'session.archived'; actorId: ActorId; archiveId: string }
	| { kind: 'session.combat-updated'; actorId: ActorId; revision: number }
	| { kind: 'session.dice-recorded'; actorId: ActorId; rollId: string }
	| {
			kind: 'session.active-map-changed';
			actorId: ActorId;
			sceneId: SceneId;
			widgetInstanceId: string;
			mapId: string;
			regionId: string | null;
	  }
	| {
			kind: 'session.active-map-projected';
			actorId: ActorId;
			playerActorId: ActorId;
			projectionId: string;
			mapId: string;
			regionId: string | null;
			deliveryStatus: 'delivered' | 'queued';
	  }
	| {
			kind: 'permission.grant-added';
			grantId: string;
			entityType: string;
			entityId: string;
			playerActorId: ActorId;
			capabilitySet: string;
			actorId: ActorId;
	  }
	| {
			kind: 'permission.grant-revoked';
			grantId: string;
			entityType: string;
			entityId: string;
			playerActorId: ActorId;
			capabilitySet: string;
			actorId: ActorId;
	  }
	| {
			kind: 'permission.ownership-transferred';
			entityType: string;
			entityId: string;
			toPlayerActorId: ActorId;
			newGrantId: string;
			revokedGrantIds: string[];
			capabilitySet: string;
			actorId: ActorId;
	  }
	| {
			kind: 'map.layer-changed';
			mapId: string;
			layerId: string;
			mutation: MapLayerMutationKind;
			actorId: ActorId;
	  }
	| { kind: 'map.created'; mapId: string; actorId: ActorId }
	| {
			kind: 'map.embed-changed';
			parentMapId: string;
			embedId: string;
			childMapId: string;
			mutation: 'embed' | 'update' | 'remove';
			actorId: ActorId;
	  }
	| {
			kind: 'map.import-committed';
			mapId: string;
			mapCreated: boolean;
			assetId: string | null;
			assetDeduped: boolean;
			droppedElementCount: number;
			actorId: ActorId;
	  }
	| {
			kind: 'map.poi-changed';
			mapId: string;
			poiId: string;
			mutation: 'create' | 'update' | 'delete';
			actorId: ActorId;
	  }
	| {
			kind: 'map.route-changed';
			mapId: string;
			routeId: string;
			mutation: 'create' | 'update' | 'delete';
			actorId: ActorId;
	  }
	| {
			kind: 'map.fog-changed';
			mapId: string;
			fogId: string;
			mutation: 'reveal' | 'conceal' | 'remove';
			deliveryStatus: 'delivered' | 'queued';
			actorId: ActorId;
	  }
	| {
			kind: 'map.token-changed';
			mapId: string;
			tokenId: string;
			mutation: 'create' | 'move' | 'update' | 'delete';
			/** Real-world move distance from the map scale, when a move was committed (MAP-019 AC2). */
			moveDistance: number | null;
			actorId: ActorId;
	  }
	| {
			kind: 'map.overlay-changed';
			mapId: string;
			mode: string;
			mutation: 'set-mode' | 'configure';
			actorId: ActorId;
	  }
	| {
			kind: 'character.created';
			characterId: string;
			kindOfCharacter: string;
			visibility: string;
			actorId: ActorId;
	  }
	| {
			kind: 'character.combat-changed';
			characterId: string;
			revision: number;
			actorId: ActorId;
	  }
	| {
			kind: 'character.draft-created';
			draftId: string;
			ownerActorId: ActorId;
			actorId: ActorId;
	  }
	| {
			kind: 'character.draft-transferred';
			draftId: string;
			fromOwnerActorId: ActorId;
			toOwnerActorId: ActorId;
			actorId: ActorId;
	  }
	| {
			kind: 'character.draft-revoked';
			draftId: string;
			ownerActorId: ActorId;
			actorId: ActorId;
	  }
	| {
			kind: 'character.draft-step-updated';
			draftId: string;
			stepId: string;
			revision: number;
			stepValid: boolean;
			readyToFinalize: boolean;
			actorId: ActorId;
	  }
	| {
			kind: 'character.draft-finalized';
			draftId: string;
			characterId: string;
			actorId: ActorId;
	  }
	| {
			kind: 'character.field-edited';
			characterId: string;
			path: string;
			revision: number;
			authorRole: 'dm' | 'player' | 'observer';
			actorId: ActorId;
	  }
	| {
			kind: 'character.field-conflicted';
			characterId: string;
			conflictId: string;
			path: string;
			actorId: ActorId;
	  }
	| {
			kind: 'character.conflict-resolved';
			characterId: string;
			conflictId: string;
			path: string;
			revision: number;
			actorId: ActorId;
	  }
	| {
			kind: 'character.resource-changed';
			characterId: string;
			revision: number;
			resourceKind: string;
			actorId: ActorId;
	  }
	| {
			kind: 'character.resources-managed';
			characterId: string;
			revision: number;
			actorId: ActorId;
	  }
	| {
			kind: 'character.rested';
			characterId: string;
			revision: number;
			rest: 'short' | 'long';
			actorId: ActorId;
	  }
	| {
			kind: 'character.advancement-changed';
			characterId: string;
			revision: number;
			actorId: ActorId;
	  }
	| {
			kind: 'character.advancement-finalized';
			characterId: string;
			toLevel: number;
			revision: number;
			actorId: ActorId;
	  }
	// CHAR-011 — the party record (marching order / inventory) changed.
	| {
			kind: 'character.party-changed';
			revision: number;
			actorId: ActorId;
	  }
	// CHAR-012 / CHAR-016 — a journal entry was added/updated/visibility-changed/removed. Carries the
	// owner id and the DATA-LAYER invalidation audience (the actors whose cached journal views must be
	// re-evaluated before new content is delivered — CHAR-016 AC2). `*` means "all players".
	| {
			kind: 'character.journal-changed';
			characterId: string;
			entryId: string;
			visibility: string;
			ownerActorId: ActorId | null;
			invalidatedActorIds: ActorId[];
			actorId: ActorId;
	  }
	// CONTENT-011 — a campaign calendar definition was registered/updated.
	| { kind: 'content.calendar-defined'; calendarId: string; actorId: ActorId }
	// CONTENT-011 — a content item was created/updated/visibility-changed/removed. Carries the new
	// visibility and the DATA-LAYER invalidation audience (the actors whose cached content views must
	// be re-evaluated before new content is delivered — CONTENT-011 AC2). `*` means "all players".
	| {
			kind: 'content.item-changed';
			itemId: string;
			mutation: 'create' | 'update' | 'set-visibility' | 'remove' | 'restore';
			visibility: string;
			invalidatedActorIds: ActorId[];
			actorId: ActorId;
	  }
	// CONTENT-007 — a transactional import committed. Carries what was created/overwritten and which
	// steps were APPLIED vs RESUMED-SKIPPED (already written by a prior partial run — AC2), for the audit.
	| {
			kind: 'content.import-committed';
			sourceKind: ImportSourceKind;
			policy: ImportConflictPolicy;
			createdItemIds: string[];
			overwrittenItemIds: string[];
			appliedEntryIds: string[];
			resumedSkippedEntryIds: string[];
			actorId: ActorId;
	  }
	// CONTENT-008 — a portable-markdown export was produced (no durable content mutation). `clean` is the
	// fail-closed self-check (no secret/path leaked); the full export payload rides the event for the GUI.
	| {
			kind: 'content.exported';
			mode: ContentExportMode;
			exportedItems: number;
			omittedForVisibility: number;
			clean: boolean;
			export: ContentExport;
			actorId: ActorId;
	  }
	// CONTENT-005 — a structured Vault Object was created/updated after passing subtype-schema validation.
	// Carries the subtype + the DATA-LAYER invalidation audience (so the same cross-surface invalidation the
	// content item commands use applies). A note-backed object reuses the `content.item-changed` envelope for
	// the item lifecycle; this distinct event records the subtype for the object-aware surfaces.
	| {
			kind: 'content.object-changed';
			itemId: string;
			subtype: string;
			mutation: 'create' | 'update';
			visibility: string;
			invalidatedActorIds: ActorId[];
			actorId: ActorId;
	  }
	// CONTENT-006 — a wikilink target was renamed: the target note's title changed AND the rename propagated to
	// referring links. Carries the renamed item, old/new titles, and the ids of the notes whose bodies were
	// rewritten + total links rewritten, so the audit records exactly what propagated (deterministic).
	| {
			kind: 'content.wikilink-target-renamed';
			itemId: string;
			fromTitle: string;
			toTitle: string;
			rewrittenItemIds: string[];
			linksRewritten: number;
			actorId: ActorId;
	  }
	// CONTENT-006 — a broken wikilink was repaired in a note body: the broken target was rewritten to a chosen
	// visible, available fix target. Carries the item + the broken/fix targets + how many links were rewritten.
	| {
			kind: 'content.wikilink-repaired';
			itemId: string;
			brokenTarget: string;
			fixTarget: string;
			linksRewritten: number;
			actorId: ActorId;
	  }
	// CONTENT-012 — a note was written back to a target source after the lossy-detection check passed
	// (either nothing was lost, or the human acknowledged exactly what was lost). Carries the source and
	// the dropped/lossy feature lists so the write audit records what was downgraded — never silently lost.
	| {
			kind: 'content.written-to-source';
			itemId: string;
			source: string;
			lossy: boolean;
			lossyFeatures: string[];
			droppedFeatures: string[];
			actorId: ActorId;
	  };

export type RejectionCode =
	| 'unknown-actor'
	| 'actor-not-authorized'
	| 'scene-not-found'
	| 'widget-not-found'
	| 'package-not-found'
	| 'package-disabled'
	| 'command-not-declared'
	| 'invalid-payload'
	| 'idempotency-replay'
	| 'invalid-state'
	| 'map-not-found'
	| 'revision-conflict'
	| 'hidden-target'
	| 'conflicted-target'
	| 'template-source-not-template'
	| 'command-center-not-configured'
	| 'preset-not-found'
	// MAP-017 — nesting integrity rejections (cycle / depth bound), kept fail-closed and distinct so
	// the DM authoring UI can explain exactly why an embed was refused.
	| 'nesting-cycle'
	| 'nesting-max-depth'
	// MAP-014 — a combat overlay mode whose declared prerequisite visual state is unmet is blocked with
	// this code (fail-closed, even against a forced transition). MAP-019 — a non-DM moving a token they
	// do not control is rejected with `actor-not-authorized`.
	| 'overlay-prerequisite-unmet'
	// CHAR — a draft target does not exist.
	| 'draft-not-found'
	// CHAR-002 — the actor is not the single draft owner, so the edit fails closed (non-owner reject).
	| 'not-draft-owner'
	// CHAR-002 — finalize attempted on a draft that has not passed validation.
	| 'draft-incomplete'
	// CHAR — the draft has already been finalized and is read-only.
	| 'draft-finalized'
	// CHAR — a character target does not exist.
	| 'character-not-found'
	// CHAR-004 — a conflict-resolution target does not exist.
	| 'conflict-not-found'
	// CONTENT-011 — a referenced campaign calendar definition does not exist (fail closed: a content
	// item can never carry a date in an unknown calendar).
	| 'calendar-not-found'
	// CONTENT-011 — a content item target does not exist.
	| 'content-item-not-found'
	// CONTENT-011 — a custom-date field or timeline reference is not a valid date for its calendar.
	| 'invalid-calendar-date'
	// CONTENT-001 — the target item is soft-deleted: it must be restored before it can be edited, and a
	// live item cannot be restored. Distinct so the authoring UI can route the actor to the recycle bin.
	| 'content-item-deleted'
	| 'content-item-not-deleted'
	// CONTENT-012 — a write to a target source would LOSE or DOWNGRADE detected structures and the caller
	// did not acknowledge the specific loss (missing/stale token). Fail closed: the lossy write never
	// commits silently; the pre-write constraint check tells the human exactly what is lost.
	| 'content-write-loss-unacknowledged'
	// CONTENT-012 — the target source id is not a declared note source (fail closed to unsupported).
	| 'content-source-unknown'
	// CONTENT-005 — a structured Vault Object's frontmatter failed subtype-schema validation; the invalid
	// object is rejected fail-closed (no invalid revision committed). Distinct so the authoring UI can surface
	// the per-field issues. A Scene routed to the object validator is rejected with this code (Contract 4).
	| 'object-schema-invalid'
	// CONTENT-005 — the target content item exists but is not a structured object (its subtype is absent).
	| 'not-a-vault-object'
	// CONTENT-006 — a wikilink repair was refused fail-closed: the broken source is unavailable/uncached (no
	// destructive offline rewrite), or the chosen fix does not resolve to a visible, available target.
	| 'wikilink-source-unavailable'
	| 'wikilink-fix-unresolved'
	| 'wikilink-target-unchanged'
	// CONTENT-003 — the named template starter preset does not exist.
	| 'template-not-found'
	// CONTENT-003 — a template could not produce valid content: a required variable is missing, or the
	// generated content failed the EXISTING markdown/object validation. Fail closed: nothing is written.
	// The per-issue findings ride the `issues` list for the authoring UI.
	| 'template-render-invalid'
	// CONTENT-004 — the named snippet does not exist.
	| 'snippet-not-found'
	// CONTENT-004 — inserting the snippet would make the note invalid (the resulting text failed the SAME
	// validator hand-typed content passes). Fail closed: the snippet gets no free pass; nothing is inserted.
	| 'snippet-content-invalid'
	// CONTENT-004 — a snippet attempted to WIDEN the host note's visibility. Fail closed: a snippet inherits
	// the note's visibility and can never raise its audience.
	| 'snippet-widens-visibility';

export interface CommandRejection {
	code: RejectionCode;
	message: string;
	issues?: Array<{ path: string; message: string }>;
}

export type CommandResult =
	| {
			status: 'accepted';
			nextState: CoreStateSlice;
			events: CoreEvent[];
			operationIds: OperationId[];
	  }
	| {
			status: 'rejected';
			rejection: CommandRejection;
			nextState: CoreStateSlice;
	  };

export interface ReducerOutput {
	nextState: CoreStateSlice;
	events: CoreEvent[];
	operations: SyncOperation[];
}
