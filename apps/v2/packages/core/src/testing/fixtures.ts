import type { Clock, IdGenerator } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { PERMISSION_STATE_SCHEMA_VERSION } from '../state/permission-state';
import { EMPTY_CHARACTER_STATE } from '../state/character-state';
import { EMPTY_COMMAND_CENTER_STATE } from '../state/command-center-state';
import { EMPTY_VAULT_CONTENT_STATE } from '../state/content';
import { EMPTY_MAP_STATE } from '../state/map-state';
import { EMPTY_SCENE_STATE } from '../state/scene-state';
import { EMPTY_SESSION_STATE } from '../state/session-state';
import { ensureSessionCombatState } from '../state/combat-tracker';
import { EMPTY_ENCOUNTER_STATE } from '../state/encounter';
import { createSystemWidgetPackages } from '../state/widget-package-state';
import { createOperationLog } from '../sync/operation-log';
import type { CoreEnvironment, CoreStateSlice } from '../commands/types';

export function sequentialIds(prefix = 'id'): IdGenerator {
	let n = 0;
	return () => {
		n += 1;
		return `${prefix}-${n.toString().padStart(4, '0')}`;
	};
}

export function fixedClock(start = '2026-06-03T12:00:00.000Z'): Clock {
	let n = 0;
	const baseMs = Date.parse(start);
	return () => {
		n += 1;
		return new Date(baseMs + n * 1000).toISOString();
	};
}

export function makeEnvironment(overrides: Partial<CoreEnvironment> = {}): CoreEnvironment {
	return {
		vaultId: overrides.vaultId ?? 'vault-test',
		sourceId: overrides.sourceId ?? 'local-vault',
		ids: overrides.ids ?? sequentialIds(),
		clock: overrides.clock ?? fixedClock(),
		// MAP-002 / MAP-020: pass through declared import adapters when a test supplies them.
		...(overrides.mapImportAdapters ? { mapImportAdapters: overrides.mapImportAdapters } : {}),
	};
}

export const DM_ACTOR: Actor = { id: 'actor-dm', role: 'dm', displayName: 'Test DM' };
export const PLAYER_ACTOR: Actor = {
	id: 'actor-player',
	role: 'player',
	displayName: 'Test Player',
};
export const OBSERVER_ACTOR: Actor = {
	id: 'actor-observer',
	role: 'observer',
	displayName: 'Test Observer',
};

export function buildPermissionState(...actors: Actor[]): PermissionState {
	const map: Record<string, Actor> = {};
	for (const actor of actors.length > 0 ? actors : [DM_ACTOR]) {
		map[actor.id] = actor;
	}
	return { actors: map, grants: [], schemaVersion: PERMISSION_STATE_SCHEMA_VERSION };
}

export function buildInitialState(...actors: Actor[]): CoreStateSlice {
	return {
		scenes: {
			scenes: { ...EMPTY_SCENE_STATE.scenes },
			schemaVersion: EMPTY_SCENE_STATE.schemaVersion,
		},
		maps: {
			maps: { ...EMPTY_MAP_STATE.maps },
			assets: { ...EMPTY_MAP_STATE.assets },
			schemaVersion: EMPTY_MAP_STATE.schemaVersion,
		},
		permissions: buildPermissionState(...actors),
		session: {
			workflow: EMPTY_SESSION_STATE.workflow,
			workflowRevision: EMPTY_SESSION_STATE.workflowRevision,
			activeSceneId: EMPTY_SESSION_STATE.activeSceneId,
			activeMap: EMPTY_SESSION_STATE.activeMap,
			combat: ensureSessionCombatState(EMPTY_SESSION_STATE.combat),
			diceHistory: [...EMPTY_SESSION_STATE.diceHistory],
			timers: { ...EMPTY_SESSION_STATE.timers },
			playerViewAssignments: { ...EMPTY_SESSION_STATE.playerViewAssignments },
			activeMapProjections: { ...EMPTY_SESSION_STATE.activeMapProjections },
			recapArchiveId: EMPTY_SESSION_STATE.recapArchiveId,
			archives: { ...EMPTY_SESSION_STATE.archives },
			schemaVersion: EMPTY_SESSION_STATE.schemaVersion,
		},
		widgets: createSystemWidgetPackages(),
		commandCenter: {
			homeSceneId: EMPTY_COMMAND_CENTER_STATE.homeSceneId,
			presets: { ...EMPTY_COMMAND_CENTER_STATE.presets },
			schemaVersion: EMPTY_COMMAND_CENTER_STATE.schemaVersion,
		},
		characters: {
			characters: { ...EMPTY_CHARACTER_STATE.characters },
			drafts: { ...EMPTY_CHARACTER_STATE.drafts },
			schemaVersion: EMPTY_CHARACTER_STATE.schemaVersion,
		},
		content: {
			calendars: { ...EMPTY_VAULT_CONTENT_STATE.calendars },
			items: { ...EMPTY_VAULT_CONTENT_STATE.items },
			schemaVersion: EMPTY_VAULT_CONTENT_STATE.schemaVersion,
		},
		encounters: {
			encounters: { ...EMPTY_ENCOUNTER_STATE.encounters },
			schemaVersion: EMPTY_ENCOUNTER_STATE.schemaVersion,
		},
		sync: createOperationLog(),
	};
}
