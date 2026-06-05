import {
	EMPTY_CHARACTER_STATE,
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	EMPTY_VAULT_CONTENT_STATE,
	createCommandLifecycle,
	createMapImportAdapterRegistry,
	createOperationLog,
	createDemoMapState,
	createSystemWidgetPackages,
	mergeSystemWidgetPackages,
	markFailure,
	markPending,
	markSuccess,
	PERMISSION_STATE_SCHEMA_VERSION,
	dispatchCommand,
	type ActorId,
	type Actor,
	type CommandLifecycleState,
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
	// PERM-011: a demo Observer so the read-only, no-character-data surface is reachable
	// from the "view as" control. The Processing Core caps this participant to the observer
	// ceiling regardless of any grant.
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
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

/**
 * MAP-002 / MAP-020 — the DECLARED external map-format import adapters for the prototype. One adapter
 * (`vtt-scene`) is declared so the import flow can demonstrate a working adapter with a capability
 * summary and unsupported-element diagnostics. Any OTHER external format is undeclared, so its import
 * is rejected fail-closed (no silent best-effort) — exactly the MAP-002 gating contract.
 */
export const MAP_IMPORT_ADAPTERS = createMapImportAdapterRegistry([
	{
		formatId: 'vtt-scene',
		displayName: 'Virtual Tabletop Scene',
		version: '1.0.0',
		elementSupport: {
			dimensions: 'importable',
			'background-image': 'importable',
			grid: 'importable',
			walls: 'lossy',
			notes: 'lossy',
			lights: 'unsupported',
			tokens: 'unsupported',
		},
	},
]);

export function defaultEnvironment(): CoreEnvironment {
	return {
		vaultId: 'local-default',
		sourceId: 'local-vault',
		ids: browserIdGenerator,
		clock: browserClock,
		mapImportAdapters: MAP_IMPORT_ADAPTERS,
	};
}

export class SceneRuntime {
	#state = $state<CoreStateSlice>({
		scenes: { scenes: {}, schemaVersion: EMPTY_SCENE_STATE.schemaVersion },
		maps: {
			maps: { ...EMPTY_MAP_STATE.maps },
			assets: { ...EMPTY_MAP_STATE.assets },
			schemaVersion: EMPTY_MAP_STATE.schemaVersion,
		},
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
		sync: createOperationLog(),
	});
	#options: RuntimeOptions;
	#loaded = $state(false);
	#lastError = $state<string | null>(null);
	// PLAT-018: the lifecycle state of the most recently dispatched durable command. The
	// GUI renders pending/success/failure/retry/undo affordances from this rather than
	// inventing per-call status flags.
	#lastLifecycle = $state<CommandLifecycleState | null>(null);
	// The actor whose actor-filtered view the GUI is currently rendering. Choosing
	// whose view to render is a GUI concern (Contract 1); the Processing Core still
	// enforces every visibility and permission check. Defaults to the session DM and
	// can be switched ("view as") to demonstrate actor filtering (NAV-008/NAV-010).
	#activeActorId = $state<ActorId>('');

	constructor(options: RuntimeOptions) {
		this.#options = options;
		this.#activeActorId = options.defaultActorId;
	}

	get state(): CoreStateSlice {
		return this.#state;
	}

	/**
	 * MAP-002 / MAP-020: the declared external-format import adapters, so the GUI can run the pure
	 * import PREVIEW (capability summary + diagnostics) against the same registry the dispatch uses.
	 * The GUI reads this descriptor; it never reaches storage (Contract 1).
	 */
	get mapImportAdapters() {
		return this.#options.env.mapImportAdapters ?? MAP_IMPORT_ADAPTERS;
	}

	get loaded(): boolean {
		return this.#loaded;
	}

	get lastError(): string | null {
		return this.#lastError;
	}

	/** PLAT-018: lifecycle state of the most recently dispatched durable command. */
	get lastLifecycle(): CommandLifecycleState | null {
		return this.#lastLifecycle;
	}

	/** The actor whose filtered view is currently rendered. Existing call sites read
	 *  this; it now tracks the active "view as" actor rather than a fixed default. */
	get defaultActorId(): ActorId {
		return this.#activeActorId;
	}

	get activeActorId(): ActorId {
		return this.#activeActorId;
	}

	/**
	 * Generate an id through the configured platform id generator. GUI components must use
	 * this instead of reaching `crypto.randomUUID` directly, so id generation stays a
	 * platform service behind the runtime boundary (PLAT-006).
	 */
	newId(): string {
		return this.#options.env.ids();
	}

	/** Actors available to view the app as, sorted DM-first then by name. */
	get actors(): Actor[] {
		return Object.values(this.#state.permissions.actors).sort((a, b) => {
			if (a.role !== b.role) return a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : 0;
			return a.displayName.localeCompare(b.displayName);
		});
	}

	/** Switch the actor whose filtered view the GUI renders. Ignores unknown actors. */
	setActiveActor(actorId: ActorId): void {
		if (this.#state.permissions.actors[actorId]) this.#activeActorId = actorId;
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
		// PLAT-018: the command enters the pending state before the durable write. No
		// partial UI success is shown until the write actually commits (AC1).
		let lifecycle = markPending(createCommandLifecycle(command.type));
		this.#lastLifecycle = lifecycle;
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
				lifecycle = markSuccess(lifecycle, result.operationIds);
			} catch (error) {
				// Durable write failed after acceptance: roll back the in-memory state,
				// clear pending, and surface retry/recovery guidance (PLAT-018 AC1).
				const message = error instanceof Error ? error.message : String(error);
				this.#lastError = message;
				this.#state = before;
				lifecycle = markFailure(lifecycle, message);
				this.#lastLifecycle = lifecycle;
				throw error;
			}
		} else {
			this.#lastError = result.rejection.message;
			lifecycle = markFailure(lifecycle, result.rejection.message);
		}
		this.#lastLifecycle = lifecycle;
		return result;
	}
}
