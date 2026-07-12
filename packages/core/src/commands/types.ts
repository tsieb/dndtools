import type { ActorId, OperationId, SceneId } from '../state/ids';
import type { Clock, IdGenerator } from '../state/ids';
import type { CharacterState } from '../state/character-state';
import type { CommandCenterState } from '../state/command-center-state';
import type { MapState } from '../state/map-state';
import type { MapLayerMutationKind } from '../state/map-layers';
import type { MapImportAdapterRegistry } from '../state/map-import';
import type { ActorRole, PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type {
	DiceRollSourceKind,
	DiceRollVisibility,
	SessionWorkflowState,
	SessionState,
} from '../state/session-state';
import type { SceneCardTransitionStyle, SceneCardVisibility } from '../state/scene-card';
import type { WidgetPackageState } from '../state/widget-package-state';
import type { VaultContentState } from '../state/content';
import type { AudioState } from '../state/audio-state';
import type { AudioPackageValidationReport } from '../state/audio-package';
import type { EncounterState } from '../state/encounter';
import type { EncounterDifficulty } from '../state/encounter';
import type { ImportConflictPolicy, ImportSourceKind } from '../state/content-import';
import type { ContentExport, ContentExportMode } from '../state/content-export';
import type { McpPolicyState } from '../state/mcp-policy';
import type { PresenceState } from '../state/presence-state';
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
	/** SES-006 — durable encounters (combatant selection, challenge guidance, terrain, loot, links). */
	encounters: EncounterState;
	/** AUDIO-004/009/010 — the durable audio asset library + declared audio source registry. */
	audio: AudioState;
	/**
	 * MCP-003 / MCP-009 / MCP-011 — the durable MCP identity, policy, and staged-writes slice: agent
	 * connection → scoped actor bindings, per-agent policy modes + allowlists, pending staged proposals,
	 * the write audit trail, and the vault default policy posture. Fail-closed to `strict_review`.
	 */
	mcp: McpPolicyState;
	/**
	 * COLLAB-004 — the EPHEMERAL presence document (Contract 1's seventh, non-durable state document).
	 * OPTIONAL and NEVER op-logged: `session.set-presence` mutates it without appending a durable
	 * operation, and the host RESETS it on session start/end (`session.set-workflow`). Persisting hosts
	 * treat it as device-local; it must never be required for offline correctness.
	 */
	presence?: PresenceState;
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
	// SOFT-DELETE a scene (tombstone; recoverable via scene.restore) / RESTORE it. DM-only. The active
	// scene and the Command Center home scene can never be deleted (fail closed).
	| { type: 'scene.delete'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.restore'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
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
	// SWITCH the active campaign SYSTEM PACKAGE (DM-only). Fail-closed on the pure dry-run: a switch
	// that cannot migrate or would drop widget content is rejected unless the loss is acknowledged.
	| {
			type: 'widget.package.switch-system';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
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
			type: 'command-center.snapshot-auto-save';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.restore-auto-save';
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
	// SES-001: RECOVER an archived Session State back into recap review (the restore counterpart of the
	// recap/archive snapshot). DM-only; validated against the SES-011 transition table; fails closed when
	// no archive is available.
	| { type: 'session.recover'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.record-dice'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SES-003: roll a dice expression / macro / inline roll through the shared dice command. The OUTCOME
	// is computed once in the Processing Core from a recorded seed (reproducible); malformed expressions
	// fail closed; visibility composes with PERM (a secret/DM-only roll is withheld from players).
	| { type: 'dice.roll'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SES-008: draw a rollable table (a declared `dice-table` Vault Object) deterministically; record the
	// selected row, attributed. Append a recorded result to a note via the existing content write path.
	| { type: 'dice.roll-table'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'dice.append-to-note'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SES-002: run combat. Start (roll initiative), advance turn (wraps to next round), apply a
	// per-combatant resource (HP/temp-HP/condition/death-save/concentration), and end (persist log).
	// DM-run; resource application also accepts an authorized combat-participant. Active-session gated.
	| { type: 'combat.start'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'combat.advance-turn'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// UX-SES-006: return to the previous turn (the undo for an accidental advance). DM-only.
	| { type: 'combat.previous-turn'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'combat.apply-resource'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'combat.end'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// UX-SES-008: mid-combat combatant management — add (incl. mass + hidden), remove (GUI-confirmed),
	// explicit reorder, and the hidden/visible toggle. DM-only; active-session gated; fail closed.
	| { type: 'combat.add-combatants'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'combat.remove-combatant'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'combat.reorder-combatant'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'combat.set-combatant-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// SES-006: build / update a durable encounter (DM-only) — combatant selection, challenge guidance,
	// terrain notes, legendary/lair actions, loot, and generated session-log links (by reference).
	| { type: 'encounter.build'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'encounter.update'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SES-004: deliver a handout as a Scene widget to selected recipients (DM-only, active-session-gated),
	// with delivery history + visibility enforcement (non-recipients receive nothing) + optional reveal.
	| { type: 'session.deliver-handout'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'session.reveal-handout-section';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// COLLAB-007: a recipient ACKNOWLEDGES receipt; the DM REVOKES a handout (sealed unless persistent).
	| { type: 'session.acknowledge-handout'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.revoke-handout'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// COLLAB-012: DM PLAYER GROUP management — create / update / delete. Delivery/projection target only;
	// membership grants NO permission. Resolved to individual recipients at delivery/projection time.
	| { type: 'session.create-player-group'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.update-player-group'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.delete-player-group'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SES-007: pin / unpin a quick-reference panel (DM-only). Panels reference content BY REFERENCE; the
	// actor-filtered read resolves each against the live target (a hidden/deleted target degrades, no leak).
	| { type: 'session.pin-quick-reference'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'session.unpin-quick-reference';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// SES-012: campaign calendar continuity — set the current campaign date (validated against its custom
	// calendar) and LINK / UNLINK a date to a note/session/map/event/handout BY REFERENCE (DM-only).
	| { type: 'session.set-campaign-date'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.link-calendar-date'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'session.unlink-calendar-date';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// I11 S11.2.1–S11.2.4 — SCENE CARD (atmosphere) authoring + display. All DM-only. Create/update/delete
	// (soft tombstone) / restore / set-visibility a card; activate a card onto the display (null clears);
	// set-transition + enqueue/dequeue/reorder-queue/advance drive the queue (S11.2.3); a player-visible
	// activation pushes the card banner to player devices and records the durable push history (S11.2.4).
	| { type: 'scene-card.create'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.update'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.delete'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.restore'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.set-visibility'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.activate'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.set-transition'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.enqueue'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.dequeue'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.reorder-queue'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene-card.advance'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
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
	| { type: 'permission.assign-role'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
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
	// Rename / re-describe a map entity (mirrors scene.update-metadata). DM-only.
	| { type: 'map.update-metadata'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
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
	// SYNC-013: the DM-authorized, vault-wide conflict resolution administrative command. References the
	// durable conflict record (any entity type) + the actual source revisions, takes an explicit
	// selected value + optional notes, records audit, and produces a non-conflicted revision.
	| { type: 'conflict.resolve'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
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
	// Structured proficiency state (skills / saves / proficiency bonus / hit dice). Owner or DM.
	| {
			type: 'character.set-proficiencies';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// Post-create attack-list editing (add/edit/remove via full replacement). Owner or DM.
	| { type: 'character.update-attacks'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// Entity visibility + sharedWith delivery-list authoring. DM-only (widening is a DM authority).
	| { type: 'character.set-sharing'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
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
	// I10 S10.1.3 / S10.4.2: structured EQUIPMENT / CURRENCY / ENCUMBRANCE — owner-or-DM authoring of a
	// character's equipment list and coin purse (carried weight / encumbrance / derived AC are computed
	// on read, never stored). `claim-party-inventory-item` moves a stash item into personal equipment.
	| {
			type: 'character.upsert-equipment-item';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.remove-equipment-item';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'character.move-equipment-item';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'character.set-currency'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'character.claim-party-inventory-item';
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
	| { type: 'content.insert-snippet'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// CONTENT-009: author SECTION- / FIELD-level visibility on a note/object (authorized editor). The
	// entity-level default already exists; these add the narrower granularities. Read-time precedence
	// (field > section > entity, hidden-ancestor-wins) is the REUSED PERM visibility-filter engine.
	| {
			type: 'content.set-section-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'content.set-field-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// CONTENT-010: add / remove an EMBED REFERENCE in a host note (authorized editor). The host stores
	// ONLY the target id + projection — never a copy of the target's data (Contract 4). The embedded
	// content is resolved per-viewer at read against the LIVE target (fail-closed unavailable on no access).
	| { type: 'content.add-embed'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.remove-embed'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SRCH-004: DM-only SAVED SEARCH management — create / update / pin / delete. A saved search stores ONLY
	// its filter criteria + visibility + pin state (never a cached result), is visibility-filtered like any
	// entity (a dm-only saved search is absent for players), and is re-evaluated LIVE on every read.
	| { type: 'content.create-saved-search'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.update-saved-search'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.pin-saved-search'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'content.delete-saved-search'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AUDIO-004: import a local audio asset (content-addressed; license/tags/source/hash recorded) and
	// update an existing asset's license/tags metadata. DM-only. An undeclared license stays flagged.
	| { type: 'audio.import-asset'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'audio.update-asset-metadata';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// AUDIO-009 / AUDIO-010: configure (create/update) a DECLARED audio source. An unsupported provider is
	// rejected fail-closed (no source, no playback state). Cache/offline behavior is the playback prerequisite.
	| { type: 'audio.configure-source'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AUDIO-011: validate a Scene audio package for import/export. A blocking finding (missing asset/license,
	// unsupported stream) reports BEFORE commit; the validation itself mutates no durable state.
	| { type: 'audio.validate-package'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AUDIO-005: configure (create/update) / delete an atmosphere AUTOMATION RULE (DM-only). The rule maps a
	// session event (combat start / map reveal / scene activation / handout delivery) to a declared audio
	// command; the license/scope/offline gate is RESOLVED at trigger time (fail closed), never bypassed.
	| { type: 'audio.configure-automation'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'audio.delete-automation'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AUDIO-001: associate (create/update) / disassociate a SCENE / MAP / MAP-LAYER audio cue (DM-only). A
	// Scene "has an audio preset" via a durable association; on activation the core resolves which cues are
	// available to the audio widget, composing the existing source/license/offline gates (fail closed).
	| { type: 'audio.associate-scene'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'audio.disassociate-scene'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AUDIO-002 / AUDIO-003: the DM controls SESSION-OWNED playback — play (or crossfade into) a track,
	// pause/resume, stop (the only thing that clears the track), set the authoritative session volume, and
	// project the active track to players (an offline participant is QUEUED, never blocking local playback).
	// The play/crossfade is validated through the existing AUDIO-009/010/004 gates (fail closed). DM-only.
	| { type: 'session.audio.play'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.audio.pause'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.audio.resume'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.audio.stop'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.audio.set-volume'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.audio.project'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AMBIENCE LAYERS: set (create/update) / remove a secondary looping bed mixed under the primary
	// track. DM-only; the referenced source is validated through the AUDIO-009/010 gates (fail closed).
	| {
			type: 'session.audio.set-ambience-layer';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'session.audio.remove-ambience-layer';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// Record the DM-selected audio OUTPUT DEVICE for the session host (null = platform default).
	| {
			type: 'session.audio.set-output-device';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	// AUDIO-014 (Epic 11.3): APPLY a categorized audio PRESET / scene package to the session audio in one
	// action — the primary track + ambience layers are driven through the EXISTING AUDIO-009/010/004 gates
	// (only a ready, bound layer becomes audible; never a guessed track). DM-only.
	| { type: 'session.audio.apply-preset'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// AUDIO-014 (Epic 11.3): SAVE the current session audio as a named USER preset / scene package (capture
	// track + ambience as references), and DELETE a user preset (a built-in id is refused). DM-only.
	| { type: 'audio.save-preset'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'audio.delete-preset'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// SES-009 — AUTHOR a recap (markdown) onto a session archive. DM-only; fails closed with no archive.
	| { type: 'session.author-recap'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// COLLAB-004 — set/clear ephemeral session PRESENCE. Actor-scoped (a player sets only their own;
	// the DM may clear another's). NEVER op-logged: presence is ephemeral, non-durable state.
	| { type: 'session.set-presence'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MCP-001: DM flips the vault-wide MASTER ENABLE switch (off by default). Enabling is an explicit DM
	// action; disabling cleanly removes ALL agent capability — every later tool call is denied at the
	// master gate before identity/policy/queries run. DM-only.
	| { type: 'mcp.set-enabled'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MCP-011: DM authors / removes an AGENT → SCOPED ACTOR binding. An agent can only ever speak as the
	// bound actor (never widened). DM-only; the bound actor must be a registered participant (fail closed).
	| { type: 'mcp.set-agent-binding'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'mcp.remove-agent-binding'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MCP-009: DM configures a per-agent POLICY (mode + tool allowlist + audit visibility) and the
	// vault-wide DEFAULT posture a never-configured agent inherits. DM-only; an unknown mode is rejected.
	| { type: 'mcp.set-agent-policy'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'mcp.set-vault-default'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MCP-003: DM APPROVES / REJECTS a staged write proposal. Approval RE-VALIDATES authority + schema and
	// commits through the EXISTING authorized dispatch (a grant revoked since staging blocks the commit);
	// a proposal never auto-commits and can never be committed twice (fail closed). DM-only.
	| { type: 'mcp.approve-proposal'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'mcp.reject-proposal'; actorId: ActorId; payload: unknown; idempotencyKey?: string };

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
	// SES-005 — an OPERATE action (pause/resume/reset/advance) was applied to a session timer by an
	// authorized operator/manager/DM. Carries the operation verb for the live tool surface.
	| {
			kind: 'session.timer-operated';
			sceneId: SceneId;
			widgetInstanceId: string;
			actorId: ActorId;
			operation: 'pause' | 'resume' | 'reset' | 'advance';
	  }
	// SES-004 — a handout was delivered as a Scene widget to selected recipients. Carries the recipients
	// THIS delivery targeted + the delivery status (the audit), never recipient-facing content.
	| {
			kind: 'session.handout-delivered';
			handoutId: string;
			sceneId: SceneId;
			widgetInstanceId: string;
			recipientActorIds: ActorId[];
			deliveryStatus: 'delivered' | 'queued';
			actorId: ActorId;
	  }
	// SES-004 — a handout section was revealed/concealed to recipients (progressive reveal).
	| {
			kind: 'session.handout-revealed';
			handoutId: string;
			sectionId: string;
			revealed: boolean;
			actorId: ActorId;
	  }
	// COLLAB-007 — a recipient ACKNOWLEDGED receipt of a handout (delivered/opened status).
	| { kind: 'session.handout-acknowledged'; handoutId: string; actorId: ActorId }
	// COLLAB-007 — the DM REVOKED a handout from recipients. Revoked, non-persistent recipients are sealed.
	| {
			kind: 'session.handout-revoked';
			handoutId: string;
			recipientActorIds: ActorId[];
			deliveryStatus: 'delivered' | 'queued';
			actorId: ActorId;
	  }
	// COLLAB-012 — a Player Group was created/updated/deleted (delivery target only; no permission change).
	| {
			kind: 'session.player-group-created';
			groupId: string;
			memberActorIds: ActorId[];
			actorId: ActorId;
	  }
	| {
			kind: 'session.player-group-updated';
			groupId: string;
			memberActorIds: ActorId[];
			actorId: ActorId;
	  }
	| { kind: 'session.player-group-deleted'; groupId: string; actorId: ActorId }
	// I11 S11.2.1–S11.2.4 — SCENE CARD lifecycle + display + player push events.
	| { kind: 'scene-card.created'; cardId: string; actorId: ActorId }
	| { kind: 'scene-card.updated'; cardId: string; actorId: ActorId }
	| { kind: 'scene-card.deleted'; cardId: string; actorId: ActorId }
	| { kind: 'scene-card.restored'; cardId: string; actorId: ActorId }
	| {
			kind: 'scene-card.visibility-changed';
			cardId: string;
			visibility: SceneCardVisibility;
			actorId: ActorId;
	  }
	// A card was put on (or cleared from, `cardId: null`) the scene display. `pushed` ⇒ it was
	// player-visible and its banner was pushed to player devices (a `scene-card.pushed` also fires).
	| { kind: 'scene-card.activated'; cardId: string | null; pushed: boolean; actorId: ActorId }
	// S11.2.4 — a player-visible card was pushed to player devices (on the session event timeline).
	| { kind: 'scene-card.pushed'; cardId: string; pushRecordId: string; actorId: ActorId }
	// S11.2.3 — the scene queue changed (a card enqueued/dequeued, the order reordered, or advanced).
	| {
			kind: 'scene-card.queue-changed';
			mutation: 'enqueue' | 'dequeue' | 'reorder' | 'advance';
			cardId: string | null;
			actorId: ActorId;
	  }
	// S11.2.3 — the display transition style changed.
	| {
			kind: 'scene-card.transition-changed';
			transitionStyle: SceneCardTransitionStyle;
			actorId: ActorId;
	  }
	// SES-007 — a quick-reference panel was pinned. `kind_` is the panel kind (the `kind` key is the event
	// discriminant). Carries the REFERENCE (kind + target id), never the target's content.
	| {
			kind: 'session.quick-reference-pinned';
			panelId: string;
			kind_: 'note' | 'stat-block' | 'rules-snippet' | 'open-thread' | 'session-context';
			targetId: string | null;
			actorId: ActorId;
	  }
	// SES-007 — a quick-reference panel was unpinned.
	| { kind: 'session.quick-reference-unpinned'; panelId: string; actorId: ActorId }
	// SES-012 — the campaign current date was set (in custom-calendar terms). Carries the calendar id
	// only (never a formatted string — the display is derived at read time).
	| { kind: 'session.campaign-date-set'; calendarId: string; actorId: ActorId }
	// SES-012 — a calendar date was LINKED to a target BY REFERENCE. Carries the reference (kind + target
	// id), never the target's content.
	| {
			kind: 'session.calendar-date-linked';
			linkId: string;
			linkKind: 'note' | 'session' | 'map' | 'event' | 'handout';
			targetId: string | null;
			actorId: ActorId;
	  }
	// SES-012 — a calendar link was removed.
	| { kind: 'session.calendar-date-unlinked'; linkId: string; actorId: ActorId }
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
			kind: 'command-center.auto-save-captured';
			sceneId: SceneId;
			actorId: ActorId;
			capturedAt: string;
	  }
	| {
			kind: 'command-center.auto-save-restored';
			sceneId: SceneId;
			actorId: ActorId;
			capturedAt: string;
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
	// SES-001 — a durable archive was recovered back into recap review. Carries the archive id restored.
	| { kind: 'session.recovered'; actorId: ActorId; archiveId: string }
	| { kind: 'session.dice-recorded'; actorId: ActorId; rollId: string }
	// SES-003 / SES-008 — a deterministic, recorded roll (expression/macro/inline/table) was added to the
	// durable session roll history. Carries the source kind + visibility so subscribers can react without
	// re-reading the (visibility-filtered) history.
	| {
			kind: 'session.roll-recorded';
			actorId: ActorId;
			rollId: string;
			sourceKind: DiceRollSourceKind;
			visibility: DiceRollVisibility;
			total: number;
	  }
	// SES-002 — combat lifecycle + per-combatant resource events.
	| {
			kind: 'combat.started';
			actorId: ActorId;
			encounterId: string | null;
			combatantCount: number;
			revision: number;
	  }
	| {
			kind: 'combat.turn-advanced';
			actorId: ActorId;
			round: number;
			turn: number;
			wrappedRound: boolean;
			activeCombatantId: string | null;
			revision: number;
	  }
	// UX-SES-006 — the turn was returned to the previous combatant (`wrappedRound` true when the
	// revert crossed back into the previous round).
	| {
			kind: 'combat.turn-reverted';
			actorId: ActorId;
			round: number;
			turn: number;
			wrappedRound: boolean;
			activeCombatantId: string | null;
			revision: number;
	  }
	| {
			kind: 'combat.resource-applied';
			actorId: ActorId;
			combatantId: string;
			resourceKind: string;
			revision: number;
	  }
	| {
			kind: 'combat.ended';
			actorId: ActorId;
			encounterId: string | null;
			logEntries: number;
			revision: number;
	  }
	// UX-SES-008 — mid-combat combatant management events (add / remove / reorder / visibility).
	| {
			kind: 'combat.combatants-added';
			actorId: ActorId;
			combatantIds: string[];
			revision: number;
	  }
	| {
			kind: 'combat.combatant-removed';
			actorId: ActorId;
			combatantId: string;
			revision: number;
	  }
	| {
			kind: 'combat.combatant-reordered';
			actorId: ActorId;
			combatantId: string;
			/** The combatant's new 0-based position in the initiative order. */
			position: number;
			revision: number;
	  }
	| {
			kind: 'combat.combatant-visibility-changed';
			actorId: ActorId;
			combatantId: string;
			hidden: boolean;
			revision: number;
	  }
	// SES-006 — encounter build/update events. Carry the computed challenge guidance for the GUI.
	| {
			kind: 'encounter.built';
			encounterId: string;
			difficulty: EncounterDifficulty;
			encounterPoints: number;
			combatantCount: number;
			actorId: ActorId;
	  }
	| {
			kind: 'encounter.updated';
			encounterId: string;
			difficulty: EncounterDifficulty;
			encounterPoints: number;
			combatantCount: number;
			actorId: ActorId;
	  }
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
			kind: 'permission.role-assigned';
			targetActorId: ActorId;
			role: ActorRole;
			previousRole: ActorRole;
			/** The owner (DM) who made the assignment. */
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
	// Map name/description metadata changed (mirrors scene.metadata-changed).
	| { kind: 'map.metadata-changed'; mapId: string; actorId: ActorId; paths: string[] }
	// A scene was soft-deleted (tombstoned; recoverable) / restored.
	| { kind: 'scene.deleted'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.restored'; sceneId: SceneId; actorId: ActorId }
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
	// Structured proficiency state (skills / saves / proficiency bonus / hit dice) changed.
	| {
			kind: 'character.proficiencies-changed';
			characterId: string;
			revision: number;
			actorId: ActorId;
	  }
	// The character's attack list was replaced (post-create add/edit/remove).
	| {
			kind: 'character.attacks-changed';
			characterId: string;
			revision: number;
			attackCount: number;
			actorId: ActorId;
	  }
	// The character's entity visibility and/or sharedWith delivery list changed (DM authored). Carries
	// the new visibility so cross-surface caches can invalidate — never sheet content.
	| {
			kind: 'character.sharing-changed';
			characterId: string;
			visibility: string;
			sharedWith: ActorId[];
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
			authorRole: 'dm' | 'co-dm' | 'player' | 'observer';
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
	// SYNC-013 — the vault-wide, DM-authorized conflict resolution closed a durable conflict record and
	// produced a non-conflicted revision. Entity-agnostic (carries the entity ref + conflict id), never
	// the conflicting/selected value, so the event is non-leaking.
	| {
			kind: 'conflict.resolved';
			entityType: string;
			entityId: string;
			conflictId: string;
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
	// I10 S10.1.3 / S10.4.2 — a character's structured equipment / currency (inventory) changed. The
	// GUI re-derives carried weight / encumbrance / computed AC for that character on this signal.
	| {
			kind: 'character.inventory-changed';
			characterId: string;
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
	// CONTENT-001 AC5 — two authorized editors concurrently updated the same content item from the same
	// base revision. The item is UNCHANGED (the concurrent edit did not overwrite). A durable
	// `content.item-conflict` op is recorded for DM resolution via the vault conflict machinery.
	| {
			kind: 'content.item-conflicted';
			itemId: string;
			conflictId: string;
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
	  }
	// CONTENT-010 — an embed REFERENCE was added to / removed from a host note. Carries the host + the
	// embed id + the TARGET id (the reference only — never the target's content), so the audit records
	// exactly which reference changed without leaking the target's data.
	| {
			kind: 'content.embed-changed';
			hostItemId: string;
			embedId: string;
			targetItemId: string;
			mutation: 'add' | 'remove';
			actorId: ActorId;
	  }
	// SRCH-004 — a saved search was created/updated/pinned/deleted. Carries the saved search's id + its
	// visibility + pin state (never the filter criteria values), so the audit records exactly what changed
	// without leaking DM-only criteria. The read re-evaluates the filter LIVE; this is just the lifecycle.
	| {
			kind: 'content.saved-search-changed';
			searchId: string;
			mutation: 'create' | 'update' | 'pin' | 'delete';
			visibility: string;
			pinned: boolean;
			actorId: ActorId;
	  }
	// AUDIO-004 — a local audio asset was imported or its metadata updated. Carries the asset id + license
	// kind + whether it is flagged for review (the audit), never the asset bytes. `deduped` ⇒ the bytes
	// matched an existing asset (content-addressed dedupe); the metadata was still applied.
	| {
			kind: 'audio.asset-imported';
			assetId: string;
			licenseKind: string;
			needsLicenseReview: boolean;
			deduped: boolean;
			actorId: ActorId;
	  }
	| {
			kind: 'audio.asset-metadata-updated';
			assetId: string;
			licenseKind: string;
			needsLicenseReview: boolean;
			actorId: ActorId;
	  }
	// AUDIO-009 / AUDIO-010 — a declared audio source was configured. Carries the source id + classified
	// type + cache behavior + whether playback is enabled (the AUDIO-010 prerequisite outcome).
	| {
			kind: 'audio.source-configured';
			sourceId: string;
			sourceType: string;
			cacheBehavior: string;
			playbackEnabled: boolean;
			actorId: ActorId;
	  }
	// AUDIO-011 — a Scene audio package was validated. Carries the direction + whether it is committable +
	// the blocking-finding count (the audit). The full report rides the event for the GUI. No durable mutation.
	| {
			kind: 'audio.package-validated';
			direction: 'import' | 'export';
			committable: boolean;
			blockingCount: number;
			report: AudioPackageValidationReport;
			actorId: ActorId;
	  }
	// AUDIO-005 — an atmosphere automation rule was configured. Carries the rule id + trigger + action +
	// enabled state (the audit), never player-facing content. The rule is a dormant definition until a
	// trigger fires; configuring it creates NO playback state.
	| {
			kind: 'audio.automation-configured';
			ruleId: string;
			trigger: string;
			action: string;
			enabled: boolean;
			actorId: ActorId;
	  }
	// AUDIO-005 — an atmosphere automation rule was deleted.
	| { kind: 'audio.automation-deleted'; ruleId: string; actorId: ActorId }
	// AUDIO-001 — a scene/map/layer audio association was created/updated. Carries the association id + the
	// target binding (kind/id/layer) + the cue refs (the audit), never player-facing content. The association
	// is a dormant definition until the target is activated; creating it creates NO playback state.
	| {
			kind: 'audio.association-changed';
			associationId: string;
			targetKind: 'scene' | 'map' | 'map-layer';
			targetId: string;
			layerId: string | null;
			actorId: ActorId;
	  }
	// AUDIO-001 — a scene/map/layer audio association was removed.
	| { kind: 'audio.association-removed'; associationId: string; actorId: ActorId }
	// AUDIO-002 / AUDIO-003 — the SESSION-OWNED currently-playing audio changed (played / paused / resumed /
	// stopped / volume / crossfade). Carries the resulting status + the track reference (source/asset id) +
	// whether it was a crossfade — never asset bytes, never a player's device-local preference. A `stopped`
	// status means the track was cleared (the only thing that clears it — AUDIO-003 AC2).
	| {
			kind: 'session.audio-changed';
			actorId: ActorId;
			status: 'playing' | 'paused' | 'stopped';
			sourceId: string;
			assetId: string | null;
			crossfade: boolean;
	  }
	// AUDIO-003 AC3 — the session's active audio was projected to a player. `queued` ⇒ the participant was
	// unavailable (offline) and the projection is marked undelivered without blocking local playback.
	| {
			kind: 'session.audio-projected';
			actorId: ActorId;
			playerActorId: ActorId;
			deliveryStatus: 'delivered' | 'queued';
	  }
	// An AMBIENCE LAYER was set (created/updated) or removed on the session audio state (DM authored).
	| {
			kind: 'session.ambience-changed';
			layerId: string;
			mutation: 'set' | 'remove';
			sourceId: string | null;
			actorId: ActorId;
	  }
	// The DM-selected session-host audio OUTPUT DEVICE changed (null ⇒ platform default).
	| {
			kind: 'session.audio-output-device-changed';
			deviceId: string | null;
			actorId: ActorId;
	  }
	// AUDIO-014 (Epic 11.3) — a USER audio preset / scene package was saved (created or updated).
	| { kind: 'audio.preset-saved'; presetId: string; actorId: ActorId }
	// AUDIO-014 (Epic 11.3) — a USER audio preset / scene package was deleted.
	| { kind: 'audio.preset-deleted'; presetId: string; actorId: ActorId }
	// SES-009 — a recap was authored onto a session archive. Carries the archive id + revision only.
	| {
			kind: 'session.recap-authored';
			archiveId: string;
			revision: number;
			actorId: ActorId;
	  }
	// COLLAB-004 — an ephemeral presence entry changed. `subjectActorId` is whose presence changed
	// (the actor themselves, or a participant the DM cleared). Carries status only — never cursor data.
	| {
			kind: 'session.presence-changed';
			subjectActorId: ActorId;
			status: 'online' | 'away' | 'offline';
			actorId: ActorId;
	  }
	// The active campaign SYSTEM PACKAGE was switched after a clean/acknowledged dry-run. Carries the
	// package ids + how many widget instances were disabled by the switch (the acknowledged loss).
	| {
			kind: 'widget.system-switched';
			packageId: string;
			previousPackageId: string | null;
			disabledWidgetCount: number;
			actorId: ActorId;
	  }
	// MCP-011 — an agent → scoped actor binding was set/removed. Carries the agent + bound actor id (the
	// audit), never any capability data (a binding confers none). `removed` ⇒ the binding was deleted.
	| {
			kind: 'mcp.agent-binding-changed';
			agentId: string;
			boundActorId: ActorId | null;
			mutation: 'set' | 'removed';
			actorId: ActorId;
	  }
	// MCP-009 — a per-agent policy was configured. Carries the agent + the resolved mode + allowlist size +
	// audit visibility (the audit), never tool internals. The new policy is enforced on the agent's NEXT call.
	| {
			kind: 'mcp.agent-policy-changed';
			agentId: string;
			mode: string;
			allowedToolCount: number;
			auditVisible: boolean;
			actorId: ActorId;
	  }
	// MCP-001 — the vault-wide MASTER ENABLE switch was flipped. `enabled: false` means the entire MCP/agent
	// integration is now off and every agent tool call is denied at the master gate (the audit of the toggle).
	| { kind: 'mcp.enabled-changed'; enabled: boolean; actorId: ActorId }
	// MCP-009 — the vault-wide default policy posture changed (the mode a never-configured agent inherits).
	| { kind: 'mcp.vault-default-changed'; mode: string; actorId: ActorId }
	// MCP-003 — a staged write was captured as a pending proposal (never auto-committed). Carries the
	// proposal id + agent + bound actor + tool + write risk + whether it is batchable (the audit metadata).
	| {
			kind: 'mcp.proposal-staged';
			proposalId: string;
			agentId: string;
			boundActorId: ActorId;
			toolId: string;
			writeRisk: 'low-risk' | 'durable';
			batchable: boolean;
			actorId: ActorId;
	  }
	// MCP-003 — a staged proposal was APPROVED and committed through the existing authorized dispatch.
	// Carries the proposal id + the committed command type + the underlying operation ids (the proof the
	// commit went through op-logging), so the audit ties the approval to the real durable mutation.
	| {
			kind: 'mcp.proposal-approved';
			proposalId: string;
			agentId: string;
			boundActorId: ActorId;
			commandType: string;
			committedOperationIds: OperationId[];
			actorId: ActorId;
	  }
	// MCP-003 — a staged proposal was REJECTED (no durable mutation occurred). `expired` is recorded when a
	// rejection cleared a proposal that could no longer commit (e.g. its actor was unbound).
	| {
			kind: 'mcp.proposal-rejected';
			proposalId: string;
			agentId: string;
			reason: 'rejected' | 'expired';
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
	| 'auto-save-not-available'
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
	| 'snippet-widens-visibility'
	// CONTENT-010 — a remove-embed targeted an embed id that does not exist on the host (fail closed: the
	// host content is never mutated). Distinct so the authoring UI can refresh its embed list.
	| 'content-embed-not-found'
	// SES-006 — an encounter target (start-combat link / update) does not exist (fail closed).
	| 'encounter-not-found'
	// SES-002 — a combatant referenced by an apply-resource command is not in the current combat.
	| 'combatant-not-found'
	// SES-003 — a dice expression failed the pure deterministic parser (malformed; never evaluated).
	| 'invalid-dice-expression'
	// SES-003 — a macro reference resolved to no defined macro (fail closed; no roll produced).
	| 'unknown-macro'
	// SES-008 — the target content item is not a `dice-table` Vault Object subtype.
	| 'not-a-dice-table'
	// SES-008 — a `dice-table` object is missing/has an invalid dice expression or result rows.
	| 'invalid-dice-table'
	// SES-008 — an append-to-note targeted a roll id not present in the session roll history.
	| 'roll-not-found'
	// SRCH-004 — a saved-search target (update/pin/delete) does not exist (fail closed).
	| 'saved-search-not-found'
	// AUDIO-004 — an imported audio file is empty, oversized, or a non-native MIME type (rejected before any
	// write). Distinct so the import UI can explain exactly why the file was refused.
	| 'invalid-audio-asset'
	// AUDIO-004 — an update/package targeted an audio asset id not in the library (fail closed).
	| 'audio-asset-not-found'
	// AUDIO-009 — a configured audio source type is not a declared, supported provider (fail closed: no source
	// record is created and NO playback state is produced — AUDIO-009 AC2).
	| 'unsupported-audio-source'
	// AUDIO-009 / AUDIO-010 — a source configuration is otherwise invalid (missing stream URL, or a cache
	// behavior the type does not permit). Distinct from the unsupported-provider reject so the UI can guide.
	| 'invalid-audio-source'
	// AUDIO-011 — a Scene audio package failed pre-commit validation (missing assets/license metadata,
	// unsupported streams). The blocking findings ride the rejection `issues` so nothing imports/exports
	// silently (fail closed).
	| 'audio-package-invalid'
	// AUDIO-005 — an automation rule configuration is invalid (undeclared trigger/action, or a play missing
	// its required local asset). Distinct from the dangling-reference reject so the authoring UI can guide.
	| 'invalid-audio-automation'
	// AUDIO-005 — a delete/update targeted an automation rule id not in the library (fail closed).
	| 'audio-automation-not-found'
	// AUDIO-001 — a scene/map/layer audio association is invalid (undeclared target, a map-layer association
	// missing/with a stray layer id, or a local/bundled cue missing its required asset). Distinct from the
	// dangling-reference reject so the authoring UI can guide.
	| 'invalid-audio-association'
	// AUDIO-001 — a disassociate/update targeted an association id not in the library (fail closed).
	| 'audio-association-not-found'
	// AUDIO-002 / AUDIO-003 — session playback rejections, all fail-closed so the playback path can never
	// sneak an out-of-scope / unlicensed / offline track into session audio.
	// The play target source id is not configured.
	| 'audio-source-not-found'
	// AUDIO-010 — the source has no declared cache/offline behavior, so playback is disabled (prerequisite).
	| 'audio-playback-disabled'
	// AUDIO-002 — a local/bundled source play omitted its required local asset.
	| 'audio-asset-required'
	// AUDIO-004 — the play target asset is flagged for license review; playback is blocked (no silent bypass).
	| 'audio-license-blocked'
	// AUDIO-010 — the track is unavailable/missing/evicted on this device; playback is not started (no retry).
	| 'audio-track-unavailable'
	// AUDIO-002 — pause/stop/set-volume targeted a session with no active track (nothing to do, fail closed).
	| 'audio-not-playing'
	// AUDIO-014 (Epic 11.3) — apply/delete targeted a preset id that resolves to neither a built-in nor a
	// user preset (fail closed: never a guessed atmosphere).
	| 'audio-preset-not-found'
	// AUDIO-014 — apply targeted a preset with no layer bound to a ready/licensed/available source (nothing
	// audible to apply — never a guessed track).
	| 'audio-preset-not-playable'
	// AUDIO-014 — save/delete targeted a BUILT-IN preset id (shipped code — non-deletable, non-overwritable;
	// copy to customize).
	| 'audio-preset-builtin'
	// AUDIO-014 — save was invoked with nothing playing (no track, no ambience) so there is nothing to capture.
	| 'audio-preset-empty'
	// MCP-011 — an agent binding targeted an actor that is not a registered participant (fail closed: an
	// agent can never be bound to an actor that does not exist). Distinct so the DM authoring UI can guide.
	| 'mcp-actor-not-registered'
	// MCP-011 — a remove-binding / policy-set targeted an agent id that has no binding (fail closed).
	| 'mcp-agent-not-bound'
	// MCP-009 — a policy referenced an unknown policy mode (fail closed: an unknown mode is never accepted;
	// it would otherwise have to collapse to a default and silently change the DM's intent).
	| 'mcp-unknown-policy-mode'
	// MCP-003 — an approve/reject targeted a proposal id that does not exist (fail closed).
	| 'mcp-proposal-not-found'
	// MCP-003 — an approve/reject targeted a proposal that is no longer pending (already approved/rejected/
	// expired). Fail closed: a proposal can never be committed twice (replay/double-commit guard).
	| 'mcp-proposal-not-pending'
	// SEC-002 — a path-like input (an import archive path, a note/object id, a folder name) failed the
	// path-safety gate: a `..` traversal segment, a NUL byte / control character, an unsupported scheme, an
	// absolute path, an excessive length, or a resolved path that escaped the vault root. Fail closed: the
	// request is rejected BEFORE any storage access. The per-input findings ride the rejection `issues`.
	| 'unsafe-path-input'
	// SEC-006 — an input payload crossing a trust boundary breached an explicit SIZE/COUNT ceiling (too many
	// import entries, a single oversized file, an oversized total, or an oversized body). Fail closed: the
	// payload is rejected BEFORE allocation-heavy processing. The breached path/limit rides `issues`.
	| 'payload-too-large'
	// The target scene is soft-deleted: it must be restored before it can be edited, and a live scene
	// cannot be restored (mirrors content-item-deleted / content-item-not-deleted).
	| 'scene-deleted'
	| 'scene-not-deleted'
	// I11 S11.2.1 — a scene card target does not exist; is already soft-deleted (must be restored before
	// editing); or a live card cannot be restored. Mirrors scene-deleted / scene-not-deleted, fail closed.
	| 'scene-card-not-found'
	| 'scene-card-deleted'
	| 'scene-card-not-deleted'
	// A system-package switch would DROP widget content per the dry-run and the caller did not
	// acknowledge the loss (mirrors content-write-loss-unacknowledged). Fail closed: never silent.
	| 'system-switch-loss-unacknowledged';

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
