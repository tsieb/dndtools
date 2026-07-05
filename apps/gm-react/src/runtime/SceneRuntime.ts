import {
	EMPTY_CHARACTER_STATE,
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	EMPTY_VAULT_CONTENT_STATE,
	EMPTY_ENCOUNTER_STATE,
	EMPTY_AUDIO_STATE,
	EMPTY_MCP_POLICY_STATE,
	ensureCalendarContinuityState,
	ensureEncounterState,
	ensureSessionAudioState,
	ensureSessionCombatState,
	createCommandLifecycle,
	createOperationLog,
	createDemoMapState,
	createSystemWidgetPackages,
	mergeSystemWidgetPackages,
	markFailure,
	markPending,
	markSuccess,
	PERMISSION_STATE_SCHEMA_VERSION,
	dispatchCommand,
	permissionsWithPreviewActors,
	resolvePreviewActor,
	PREVIEW_READONLY_MESSAGE,
	type ActorId,
	type Actor,
	type CommandLifecycleState,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type PreviewSelection,
	type ResolvedPreview,
} from '@dndtools/core';
import { loadCoreState, persistFullState } from '../platform/storage/coreStore';
import { MAP_IMPORT_ADAPTERS } from './environment';
import { seedDemoContent } from './demo-seed';

export interface RuntimeOptions {
	env: CoreEnvironment;
	defaultActorId: ActorId;
}

const DEFAULT_DEMO_PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
	// PERM-011: a demo Observer so the read-only, no-character-data surface is reachable.
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
];

function emptySlice(): CoreStateSlice {
	return {
		scenes: { scenes: {}, schemaVersion: EMPTY_SCENE_STATE.schemaVersion },
		maps: {
			maps: { ...EMPTY_MAP_STATE.maps },
			assets: { ...EMPTY_MAP_STATE.assets },
			schemaVersion: EMPTY_MAP_STATE.schemaVersion,
		},
		permissions: { actors: {}, grants: [], schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion },
		session: {
			workflow: EMPTY_SESSION_STATE.workflow,
			workflowRevision: EMPTY_SESSION_STATE.workflowRevision,
			activeSceneId: EMPTY_SESSION_STATE.activeSceneId,
			activeMap: EMPTY_SESSION_STATE.activeMap,
			combat: ensureSessionCombatState(EMPTY_SESSION_STATE.combat),
			diceHistory: [...EMPTY_SESSION_STATE.diceHistory],
			timers: {},
			playerViewAssignments: {},
			activeMapProjections: {},
			handouts: {},
			quickReferencePanels: {},
			audioPlayback: {
				track: EMPTY_SESSION_STATE.audioPlayback.track,
				deliveries: { ...EMPTY_SESSION_STATE.audioPlayback.deliveries },
				schemaVersion: EMPTY_SESSION_STATE.audioPlayback.schemaVersion,
			},
			playerGroups: {},
			calendarContinuity: { ...EMPTY_SESSION_STATE.calendarContinuity },
			recapArchiveId: null,
			archives: {},
			schemaVersion: EMPTY_SESSION_STATE.schemaVersion,
		},
		widgets: createSystemWidgetPackages(),
		commandCenter: {
			homeSceneId: EMPTY_COMMAND_CENTER_STATE.homeSceneId,
			presets: {},
			autoSave: null,
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
			savedSearches: { ...EMPTY_VAULT_CONTENT_STATE.savedSearches },
			schemaVersion: EMPTY_VAULT_CONTENT_STATE.schemaVersion,
		},
		encounters: {
			encounters: { ...EMPTY_ENCOUNTER_STATE.encounters },
			schemaVersion: EMPTY_ENCOUNTER_STATE.schemaVersion,
		},
		audio: {
			assets: { ...EMPTY_AUDIO_STATE.assets },
			sources: { ...EMPTY_AUDIO_STATE.sources },
			automationRules: { ...EMPTY_AUDIO_STATE.automationRules },
			associations: { ...EMPTY_AUDIO_STATE.associations },
			schemaVersion: EMPTY_AUDIO_STATE.schemaVersion,
		},
		mcp: {
			enabled: EMPTY_MCP_POLICY_STATE.enabled,
			bindings: { ...EMPTY_MCP_POLICY_STATE.bindings },
			policies: { ...EMPTY_MCP_POLICY_STATE.policies },
			proposals: { ...EMPTY_MCP_POLICY_STATE.proposals },
			auditEntries: [...EMPTY_MCP_POLICY_STATE.auditEntries],
			vaultDefaultMode: EMPTY_MCP_POLICY_STATE.vaultDefaultMode,
			schemaVersion: EMPTY_MCP_POLICY_STATE.schemaVersion,
		},
		sync: createOperationLog(),
	};
}

/**
 * SceneRuntime — the React port of the production `SceneRuntime` (apps/gm canvas-runtime). It owns
 * the in-memory CoreStateSlice, loads/persists through the Dexie storage port, and is the SINGLE
 * write choke point: every GUI mutation flows through `dispatch`, which runs the pure
 * `dispatchCommand` reducer and persists the result. A plain observable (subscribe/version) so React
 * can read it through `useSyncExternalStore`. React state is already plain objects, so — unlike the
 * Svelte version — no `$state.snapshot` is needed before the reducer.
 */
export class SceneRuntime {
	private innerState: CoreStateSlice = emptySlice();
	private readonly options: RuntimeOptions;
	private isLoaded = false;
	private loadFailed = false;
	private error: string | null = null;
	private lifecycle: CommandLifecycleState | null = null;
	private activeActor: ActorId;
	private previewState: ResolvedPreview | null = null;

	private version = 0;
	private readonly listeners = new Set<() => void>();

	constructor(options: RuntimeOptions) {
		this.options = options;
		this.activeActor = options.defaultActorId;
	}

	// ── Observable plumbing (for useSyncExternalStore) ────────────────────────────────────────
	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getVersion = (): number => this.version;

	private emit(): void {
		this.version += 1;
		for (const listener of this.listeners) listener();
	}

	// ── Public reads ──────────────────────────────────────────────────────────────────────────
	/** The actor-filtered view. While previewing, the permission state is projected with the
	 *  reserved zero-grant generic preview actors; the raw state is never mutated. */
	get state(): CoreStateSlice {
		return this.previewState
			? { ...this.innerState, permissions: permissionsWithPreviewActors(this.innerState.permissions) }
			: this.innerState;
	}

	get loaded(): boolean {
		return this.isLoaded;
	}

	/** True when the initial load threw (Dexie unavailable, quota, corrupt slice). The shell renders a
	 *  retry state instead of an infinite boot, and `lastError` carries the message. */
	get hasLoadError(): boolean {
		return this.loadFailed;
	}

	get lastError(): string | null {
		return this.error;
	}

	get lastLifecycle(): CommandLifecycleState | null {
		return this.lifecycle;
	}

	get mapImportAdapters() {
		return this.options.env.mapImportAdapters ?? MAP_IMPORT_ADAPTERS;
	}

	/** The actor whose filtered view is currently rendered (the previewed actor while previewing). */
	get activeActorId(): ActorId {
		return this.previewState ? this.previewState.actorId : this.activeActor;
	}

	/** Existing call sites read `defaultActorId`; it tracks the active "view as" actor. */
	get defaultActorId(): ActorId {
		return this.activeActorId;
	}

	get preview(): ResolvedPreview | null {
		return this.previewState;
	}

	/** Actors available to "view as", DM-first then by name. */
	get actors(): Actor[] {
		return Object.values(this.innerState.permissions.actors).sort((a, b) => {
			if (a.role !== b.role) return a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : 0;
			return a.displayName.localeCompare(b.displayName);
		});
	}

	newId(): string {
		return this.options.env.ids();
	}

	// ── View-as + preview ───────────────────────────────────────────────────────────────────
	setActiveActor(actorId: ActorId): void {
		if (this.innerState.permissions.actors[actorId]) {
			this.activeActor = actorId;
			this.emit();
		}
	}

	/** Enter "Preview as player / observer" — DM-only, fail closed. */
	enterPreview(selection: PreviewSelection): void {
		if (this.innerState.permissions.actors[this.activeActor]?.role !== 'dm') return;
		this.previewState = resolvePreviewActor(this.innerState.permissions, selection);
		this.emit();
	}

	exitPreview(): void {
		this.previewState = null;
		this.emit();
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────
	async load(): Promise<void> {
		this.loadFailed = false;
		try {
			const loaded = await loadCoreState();
			this.innerState = this.ensureDefaultActor(loaded);
			// Populate a fresh vault with representative content (guarded by per-slice emptiness) so every
			// screen resembles the populated design-studio prototype rather than an empty shell. Seeds via
			// the real command path, so it persists and survives reload exactly like user-authored content.
			// EXCEPT when onboarding's "Start fresh" recorded an explicit empty-vault choice — that wipe
			// would otherwise be undone right here on the post-wipe reload.
			if (!this.freshVaultChosen()) await seedDemoContent(this);
			// A seed command is not a user action — don't let it surface as the last lifecycle (which some
			// screens reflect, e.g. ScenesCreator's "Saved" affordance).
			this.lifecycle = null;
			this.error = null;
			this.isLoaded = true;
		} catch (error) {
			// A thrown load (Dexie blocked in private mode, storage quota, a corrupt persisted slice)
			// must not leave the shell stuck on an un-rejectable boot. Surface it so the shell can offer
			// a retry, and don't let it escape as an unhandled rejection.
			this.error = error instanceof Error ? error.message : String(error);
			this.loadFailed = true;
		}
		this.emit();
	}

	/** Onboarding's "Start fresh" records an explicit empty-vault choice (device-local); honor it on
	 * every subsequent boot by skipping BOTH demo-population paths (command seed + demo map state). */
	private freshVaultChosen(): boolean {
		try {
			return typeof window !== 'undefined' && window.localStorage.getItem('dndtools:react:vault-choice') === 'fresh';
		} catch {
			return false;
		}
	}

	private ensureDefaultActor(slice: CoreStateSlice): CoreStateSlice {
		const id = this.options.defaultActorId;
		const withDefaultWidgets = {
			...slice,
			maps: Object.keys(slice.maps.maps).length > 0 || this.freshVaultChosen() ? slice.maps : createDemoMapState(),
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
			combat: ensureSessionCombatState(withDefaultWidgets.session.combat),
			diceHistory: withDefaultWidgets.session.diceHistory ?? [],
			timers: withDefaultWidgets.session.timers ?? {},
			playerViewAssignments: withDefaultWidgets.session.playerViewAssignments ?? {},
			activeMapProjections: withDefaultWidgets.session.activeMapProjections ?? {},
			handouts: withDefaultWidgets.session.handouts ?? {},
			quickReferencePanels: withDefaultWidgets.session.quickReferencePanels ?? {},
			audioPlayback: ensureSessionAudioState(withDefaultWidgets.session.audioPlayback),
			calendarContinuity: ensureCalendarContinuityState(
				withDefaultWidgets.session.calendarContinuity,
			),
			recapArchiveId: withDefaultWidgets.session.recapArchiveId ?? null,
			archives: withDefaultWidgets.session.archives ?? {},
		};
		return {
			...withDefaultWidgets,
			session,
			encounters: ensureEncounterState(withDefaultWidgets.encounters),
			permissions: {
				...withDefaultWidgets.permissions,
				actors: nextActors,
				schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
			},
		};
	}

	/**
	 * The single durable write path. While previewing, EVERY command is rejected read-only before it
	 * reaches the core or storage. On acceptance the new state is committed and persisted; a failed
	 * durable write rolls the in-memory state back and surfaces the error (PLAT-018).
	 */
	async dispatch(command: CoreCommand): Promise<CommandResult> {
		if (this.previewState) {
			const rejection = {
				code: 'actor-not-authorized' as const,
				message: PREVIEW_READONLY_MESSAGE,
			};
			this.error = rejection.message;
			this.lifecycle = markFailure(
				markPending(createCommandLifecycle(command.type)),
				rejection.message,
			);
			this.emit();
			return { status: 'rejected', rejection, nextState: this.innerState };
		}
		const before = this.innerState;
		let lifecycle = markPending(createCommandLifecycle(command.type));
		this.lifecycle = lifecycle;
		this.emit();
		const result = dispatchCommand(before, this.options.env, command);
		if (result.status === 'accepted') {
			this.innerState = result.nextState;
			try {
				await persistFullState(before, result.nextState);
				this.error = null;
				lifecycle = markSuccess(lifecycle, result.operationIds);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.error = message;
				this.innerState = before;
				lifecycle = markFailure(lifecycle, message);
				this.lifecycle = lifecycle;
				this.emit();
				throw error;
			}
		} else {
			this.error = result.rejection.message;
			lifecycle = markFailure(lifecycle, result.rejection.message);
		}
		this.lifecycle = lifecycle;
		this.emit();
		return result;
	}
}
