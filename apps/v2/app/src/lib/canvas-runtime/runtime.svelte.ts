import {
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	createOperationLog,
	createDemoMapState,
	createSystemWidgetPackages,
	mergeSystemWidgetPackages,
	PERMISSION_STATE_SCHEMA_VERSION,
	dispatchCommand,
	type ActorId,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '@dndtools/v2-core';
import { loadCoreState, persistFullState } from '../platform/storage/scene-store';

interface RuntimeOptions {
	env: CoreEnvironment;
	defaultActorId: ActorId;
}

const DEFAULT_DEMO_PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
];

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
		maps: { maps: { ...EMPTY_MAP_STATE.maps }, schemaVersion: EMPTY_MAP_STATE.schemaVersion },
		permissions: {
			actors: {},
			grants: [],
			schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion,
		},
		session: {
			workflow: EMPTY_SESSION_STATE.workflow,
			workflowRevision: EMPTY_SESSION_STATE.workflowRevision,
			activeSceneId: EMPTY_SESSION_STATE.activeSceneId,
			activeMap: EMPTY_SESSION_STATE.activeMap,
			combat: {
				...EMPTY_SESSION_STATE.combat,
				combatantIds: [...EMPTY_SESSION_STATE.combat.combatantIds],
			},
			diceHistory: [...EMPTY_SESSION_STATE.diceHistory],
			timers: {},
			playerViewAssignments: {},
			activeMapProjections: {},
			recapArchiveId: null,
			archives: {},
			schemaVersion: EMPTY_SESSION_STATE.schemaVersion,
		},
		widgets: createSystemWidgetPackages(),
		commandCenter: {
			homeSceneId: EMPTY_COMMAND_CENTER_STATE.homeSceneId,
			presets: {},
			schemaVersion: EMPTY_COMMAND_CENTER_STATE.schemaVersion,
		},
		sync: createOperationLog(),
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
		const withDefaultWidgets = {
			...slice,
			maps: Object.keys(slice.maps.maps).length > 0 ? slice.maps : createDemoMapState(),
			widgets: mergeSystemWidgetPackages(slice.widgets),
		};
		const actors = withDefaultWidgets.permissions.actors;
		const nextActors: CoreStateSlice['permissions']['actors'] = {
			...actors,
			...(actors[id] ? {} : { [id]: { id, role: 'dm' as const, displayName: 'Default DM' } }),
		};
		for (const participant of DEFAULT_DEMO_PARTICIPANTS) {
			nextActors[participant.id] ??= participant;
		}
		const session = {
			...withDefaultWidgets.session,
			workflow: withDefaultWidgets.session.workflow ?? EMPTY_SESSION_STATE.workflow,
			workflowRevision:
				withDefaultWidgets.session.workflowRevision ?? EMPTY_SESSION_STATE.workflowRevision,
			activeSceneId: withDefaultWidgets.session.activeSceneId ?? null,
			activeMap: withDefaultWidgets.session.activeMap ?? null,
			combat: withDefaultWidgets.session.combat ?? {
				...EMPTY_SESSION_STATE.combat,
				combatantIds: [...EMPTY_SESSION_STATE.combat.combatantIds],
			},
			diceHistory: withDefaultWidgets.session.diceHistory ?? [],
			timers: withDefaultWidgets.session.timers ?? {},
			playerViewAssignments: withDefaultWidgets.session.playerViewAssignments ?? {},
			activeMapProjections: withDefaultWidgets.session.activeMapProjections ?? {},
			recapArchiveId: withDefaultWidgets.session.recapArchiveId ?? null,
			archives: withDefaultWidgets.session.archives ?? {},
		};
		return {
			...withDefaultWidgets,
			session,
			permissions: {
				...withDefaultWidgets.permissions,
				actors: nextActors,
				schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
			},
		};
	}

	async dispatch(command: CoreCommand): Promise<CommandResult> {
		const before = this.#state;
		// $state values are Proxies; the reducer must run against a plain snapshot so it
		// can return plain objects suitable for both reassignment and structured cloning.
		// structuredClone preserves the sync log's idempotencyKeys Set at runtime, but
		// Svelte's Snapshot type widens Set to {}, so bridge through unknown.
		const plainBefore = $state.snapshot(before) as unknown as CoreStateSlice;
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
