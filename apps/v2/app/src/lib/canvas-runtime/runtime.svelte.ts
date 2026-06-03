import {
	EMPTY_OPERATION_LOG,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	PERMISSION_STATE_SCHEMA_VERSION,
	dispatchCommand,
	type ActorId,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type SceneId,
} from '@dndtools/v2-core';
import { loadCoreState, persistFullState } from '../platform/storage/scene-store';

interface RuntimeOptions {
	env: CoreEnvironment;
	defaultActorId: ActorId;
}

function browserIdGenerator(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function browserClock(): string {
	return new Date().toISOString();
}

export function defaultEnvironment(): CoreEnvironment {
	return {
		vaultId: 'local-default',
		sourceId: 'local-vault',
		ids: browserIdGenerator,
		clock: browserClock,
	};
}

export class SceneRuntime {
	#state = $state<CoreStateSlice>({
		scenes: { scenes: {}, schemaVersion: EMPTY_SCENE_STATE.schemaVersion },
		permissions: {
			actors: {},
			grants: [],
			schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion,
		},
		sync: { operations: [...EMPTY_OPERATION_LOG.operations] },
	});
	#options: RuntimeOptions;
	#loaded = $state(false);
	#lastError = $state<string | null>(null);

	constructor(options: RuntimeOptions) {
		this.#options = options;
	}

	get state(): CoreStateSlice {
		return this.#state;
	}

	get loaded(): boolean {
		return this.#loaded;
	}

	get lastError(): string | null {
		return this.#lastError;
	}

	get defaultActorId(): ActorId {
		return this.#options.defaultActorId;
	}

	async load(): Promise<void> {
		const loaded = await loadCoreState();
		this.#state = this.#ensureDefaultActor(loaded);
		this.#loaded = true;
	}

	#ensureDefaultActor(slice: CoreStateSlice): CoreStateSlice {
		const id = this.#options.defaultActorId;
		if (slice.permissions.actors[id]) return slice;
		return {
			...slice,
			permissions: {
				...slice.permissions,
				actors: {
					...slice.permissions.actors,
					[id]: { id, role: 'dm', displayName: 'Default DM' },
				},
				schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
			},
		};
	}

	async dispatch(command: CoreCommand): Promise<CommandResult> {
		const before = this.#state;
		// $state values are Proxies; the reducer must run against a plain snapshot so it
		// can return plain objects suitable for both reassignment and structured cloning.
		const plainBefore = $state.snapshot(before) as CoreStateSlice;
		const result = dispatchCommand(plainBefore, this.#options.env, command);
		if (result.status === 'accepted') {
			this.#state = result.nextState;
			try {
				await persistFullState(plainBefore, result.nextState);
				this.#lastError = null;
			} catch (error) {
				this.#lastError = error instanceof Error ? error.message : String(error);
				this.#state = before;
				throw error;
			}
		} else {
			this.#lastError = result.rejection.message;
		}
		return result;
	}
}
