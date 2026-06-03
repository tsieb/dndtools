import type { Clock, IdGenerator } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { PERMISSION_STATE_SCHEMA_VERSION } from '../state/permission-state';
import { EMPTY_SCENE_STATE } from '../state/scene-state';
import { EMPTY_OPERATION_LOG } from '../sync/operation-log';
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
		scenes: { scenes: { ...EMPTY_SCENE_STATE.scenes }, schemaVersion: EMPTY_SCENE_STATE.schemaVersion },
		permissions: buildPermissionState(...actors),
		sync: { operations: [...EMPTY_OPERATION_LOG.operations] },
	};
}
