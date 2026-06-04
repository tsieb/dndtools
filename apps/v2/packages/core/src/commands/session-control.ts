import {
	projectActiveMapInputSchema,
	recordSessionDiceInputSchema,
	setActiveMapInputSchema,
	setSessionWorkflowInputSchema,
	updateSessionCombatInputSchema,
} from '../schemas/commands';
import type { MapEntity } from '../state/map-state';
import {
	EMPTY_SESSION_COMBAT_STATE,
	type ActiveMapDeliveryStatus,
	type SessionArchiveSnapshot,
} from '../state/session-state';
import {
	SCENE_SCHEMA_VERSION,
	type Scene,
	type WidgetBinding,
	type WidgetInstance,
	type WidgetLayout,
} from '../state/scene-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	bumpRevision,
	findWidget,
	parseInput,
	reject,
	requireActor,
	requireDm,
	requireScene,
	withScene,
} from './helpers';

const SESSION_ENTITY_ID = 'session-default';

function homeSceneExists(state: CoreStateSlice): Scene | null {
	const id = state.commandCenter.homeSceneId;
	if (!id) return null;
	return state.scenes.scenes[id] ?? null;
}

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | null {
	return state.maps.maps[mapId] ?? null;
}

function regionExists(map: MapEntity, regionId: string | null): boolean {
	return regionId === null || map.regions.some((region) => region.id === regionId);
}

function resetLiveSessionFields(session: CoreStateSlice['session']): CoreStateSlice['session'] {
	return {
		...session,
		activeSceneId: null,
		activeMap: null,
		combat: { ...EMPTY_SESSION_COMBAT_STATE },
		diceHistory: [],
		timers: {},
		playerViewAssignments: {},
		activeMapProjections: {},
	};
}

function archiveCurrentSession(
	session: CoreStateSlice['session'],
	env: CoreEnvironment,
	actorId: string,
	workflowBeforeArchive: SessionArchiveSnapshot['workflowBeforeArchive'],
): { session: CoreStateSlice['session']; archiveId: string } {
	const archiveId = env.ids();
	const archive: SessionArchiveSnapshot = {
		id: archiveId,
		archivedBy: actorId,
		archivedAt: env.clock(),
		workflowBeforeArchive,
		activeSceneId: session.activeSceneId,
		activeMap: session.activeMap,
		combat: { ...session.combat, combatantIds: [...session.combat.combatantIds] },
		diceHistory: session.diceHistory.map((roll) => ({ ...roll })),
		timers: Object.fromEntries(
			Object.entries(session.timers).map(([id, timer]) => [id, { ...timer }]),
		),
		playerViewAssignments: Object.fromEntries(
			Object.entries(session.playerViewAssignments).map(([id, assignment]) => [
				id,
				{
					...assignment,
					target: {
						...assignment.target,
						sectionIds: assignment.target.sectionIds ? [...assignment.target.sectionIds] : null,
						widgetInstanceIds: assignment.target.widgetInstanceIds
							? [...assignment.target.widgetInstanceIds]
							: null,
						displayState: assignment.target.displayState
							? { ...assignment.target.displayState }
							: null,
						mapRegion: assignment.target.mapRegion ? { ...assignment.target.mapRegion } : null,
					},
				},
			]),
		),
		activeMapProjections: Object.fromEntries(
			Object.entries(session.activeMapProjections).map(([id, projection]) => [
				id,
				{ ...projection },
			]),
		),
	};

	return {
		archiveId,
		session: {
			...resetLiveSessionFields(session),
			recapArchiveId: archiveId,
			archives: { ...session.archives, [archiveId]: archive },
		},
	};
}

export function handleSetSessionWorkflow(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setSessionWorkflowInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const targetWorkflow = parsed.data.workflow;
	const previousWorkflow = state.session.workflow;
	const requestedSceneId =
		parsed.data.activeSceneId !== undefined
			? parsed.data.activeSceneId
			: state.session.activeSceneId;
	if (requestedSceneId) {
		const scene = requireScene(state, requestedSceneId);
		if ('code' in scene) return reject(scene, state);
	}
	if (targetWorkflow === 'active' && !requestedSceneId) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'An active Session requires an active Scene.',
			},
			state,
		);
	}

	let nextSession = state.session;
	const events: CoreEvent[] = [];
	if (targetWorkflow === 'recap') {
		const archived = archiveCurrentSession(nextSession, env, actor.id, previousWorkflow);
		nextSession = archived.session;
		events.push({ kind: 'session.archived', actorId: actor.id, archiveId: archived.archiveId });
	} else if (targetWorkflow === 'archived') {
		if (!nextSession.recapArchiveId) {
			const archived = archiveCurrentSession(nextSession, env, actor.id, previousWorkflow);
			nextSession = archived.session;
			events.push({ kind: 'session.archived', actorId: actor.id, archiveId: archived.archiveId });
		} else {
			nextSession = resetLiveSessionFields(nextSession);
		}
	} else if (targetWorkflow === 'idle') {
		nextSession = {
			...resetLiveSessionFields(nextSession),
			recapArchiveId: null,
		};
	} else {
		nextSession = {
			...nextSession,
			activeSceneId: requestedSceneId ?? null,
		};
	}

	nextSession = {
		...nextSession,
		workflow: targetWorkflow,
		workflowRevision: state.session.workflowRevision + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.set-workflow',
		path: 'workflow',
		value: {
			from: previousWorkflow,
			to: targetWorkflow,
			activeSceneId: nextSession.activeSceneId,
			recapArchiveId: nextSession.recapArchiveId,
		},
		beforeRevision: state.session.workflowRevision,
		afterRevision: nextSession.workflowRevision,
	});

	events.push({
		kind: 'session.workflow-changed',
		actorId: actor.id,
		from: previousWorkflow,
		to: targetWorkflow,
		activeSceneId: nextSession.activeSceneId,
		recapArchiveId: nextSession.recapArchiveId,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events,
		operationIds: [op.id],
	};
}

export function handleUpdateSessionCombat(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	if (state.session.workflow !== 'active') {
		return reject(
			{
				code: 'invalid-state',
				message: 'Combat updates require an active Session workflow.',
			},
			state,
		);
	}

	const parsed = parseInput(updateSessionCombatInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const nextCombat = {
		...parsed.data,
		revision: state.session.combat.revision + 1,
	};
	const nextSession = { ...state.session, combat: nextCombat };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.update-combat',
		path: 'combat',
		value: nextCombat,
		beforeRevision: state.session.combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [{ kind: 'session.combat-updated', actorId: actor.id, revision: nextCombat.revision }],
		operationIds: [op.id],
	};
}

export function handleRecordSessionDice(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (state.session.workflow !== 'active') {
		return reject(
			{
				code: 'invalid-state',
				message: 'Dice history writes require an active Session workflow.',
			},
			state,
		);
	}

	const parsed = parseInput(recordSessionDiceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const roll = {
		id: env.ids(),
		actorId: actor.id,
		expression: parsed.data.expression,
		total: parsed.data.total,
		rolledAt: env.clock(),
	};
	const nextDiceHistory = [...state.session.diceHistory, roll];
	const nextSession = { ...state.session, diceHistory: nextDiceHistory };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.record-dice',
		path: `diceHistory/${roll.id}`,
		value: roll,
		beforeRevision: state.session.diceHistory.length,
		afterRevision: nextDiceHistory.length,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [{ kind: 'session.dice-recorded', actorId: actor.id, rollId: roll.id }],
		operationIds: [op.id],
	};
}

function activeMapBinding(mapId: string, regionId: string | null): WidgetBinding {
	return {
		source: {
			entityType: 'map',
			entityId: mapId,
			...(regionId ? { selector: `region:${regionId}` } : {}),
		},
		mode: 'read',
		requiredCapability: 'viewer',
	};
}

function activeMapLayout(scene: Scene): WidgetLayout {
	const nextZ = Math.max(0, ...scene.widgets.map((widget) => widget.layout.z)) + 1;
	const nextFocus =
		Math.max(0, ...scene.widgets.map((widget) => widget.layout.focusOrder ?? 0)) + 1;
	return {
		x: 24,
		y: 392,
		w: 520,
		h: 260,
		z: nextZ,
		groupId: null,
		dock: null,
		pinned: false,
		focusOrder: nextFocus,
	};
}

function bindActiveMapWidget(
	scene: Scene,
	env: CoreEnvironment,
	widgetInstanceId: string | undefined,
	mapId: string,
	regionId: string | null,
): { scene: Scene; widget: WidgetInstance; created: boolean } | null {
	const binding = activeMapBinding(mapId, regionId);
	const existing = widgetInstanceId
		? findWidget(scene, widgetInstanceId)
		: scene.widgets.find((widget) => widget.type === 'map');
	if (existing && existing.type !== 'map') return null;
	if (existing) {
		const widget = {
			...existing,
			configuration: { ...existing.configuration, activeMap: true, regionId },
			binding,
		};
		return {
			created: false,
			widget,
			scene: {
				...scene,
				widgets: scene.widgets.map((item) => (item.id === widget.id ? widget : item)),
			},
		};
	}

	const widget: WidgetInstance = {
		id: env.ids(),
		type: 'map',
		version: '1.0.0',
		layout: activeMapLayout(scene),
		configuration: { activeMap: true, regionId },
		localState: {},
		binding,
		disabled: null,
	};
	return {
		created: true,
		widget,
		scene: {
			...scene,
			widgets: [...scene.widgets, widget],
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
	};
}

export function handleSetActiveMap(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setActiveMapInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const map = requireMap(state, parsed.data.mapId);
	if (!map) {
		return reject(
			{ code: 'map-not-found', message: `Map ${parsed.data.mapId} does not exist.` },
			state,
		);
	}
	if (!regionExists(map, parsed.data.regionId)) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Region ${parsed.data.regionId} does not exist on map ${map.id}.`,
			},
			state,
		);
	}
	const homeScene = homeSceneExists(state);
	if (!homeScene) {
		return reject(
			{
				code: 'command-center-not-configured',
				message: 'No Command Center home Scene exists for the active map widget.',
			},
			state,
		);
	}

	const bound = bindActiveMapWidget(
		homeScene,
		env,
		parsed.data.widgetInstanceId,
		map.id,
		parsed.data.regionId,
	);
	if (!bound) {
		return reject(
			{
				code: 'widget-not-found',
				message: `Widget ${parsed.data.widgetInstanceId} is not a map widget on the Command Center.`,
			},
			state,
		);
	}
	const nextScene = bumpRevision(bound.scene, env);
	const nextScenes = withScene(state.scenes, homeScene.id, () => nextScene);
	const previousSelection = state.session.activeMap;
	const now = env.clock();
	const nextSelection = {
		mapId: map.id,
		regionId: parsed.data.regionId,
		sceneId: homeScene.id,
		widgetInstanceId: bound.widget.id,
		updatedBy: actor.id,
		updatedAt: now,
		revision: (previousSelection?.revision ?? 0) + 1,
	};
	const nextSession = { ...state.session, activeMap: nextSelection };

	const sceneOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: homeScene.id,
		opType: bound.created
			? 'command-center.add-active-map-widget'
			: 'command-center.bind-active-map-widget',
		path: `widgets/${bound.widget.id}/binding`,
		value: {
			mapId: map.id,
			regionId: parsed.data.regionId,
			widgetInstanceId: bound.widget.id,
		},
		beforeRevision: homeScene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});
	const sessionOp = appendOperationDraft(env, sceneOp.log, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.set-active-map',
		path: 'activeMap',
		value: nextSelection,
		beforeRevision: previousSelection?.revision ?? 0,
		afterRevision: nextSelection.revision,
		dependencies: [sceneOp.op.id, `map:${map.id}@${map.revision}`],
	});
	const events: CoreEvent[] = [];
	if (bound.created) {
		events.push({
			kind: 'scene.widget-added',
			sceneId: homeScene.id,
			widgetInstanceId: bound.widget.id,
			actorId: actor.id,
		});
	}
	events.push({
		kind: 'session.active-map-changed',
		actorId: actor.id,
		sceneId: homeScene.id,
		widgetInstanceId: bound.widget.id,
		mapId: map.id,
		regionId: parsed.data.regionId,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextScenes, session: nextSession, sync: sessionOp.log },
		events,
		operationIds: [sceneOp.op.id, sessionOp.op.id],
	};
}

export function handleProjectActiveMap(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	if (state.session.workflow !== 'active') {
		return reject(
			{
				code: 'invalid-state',
				message: 'Active map projection requires an active Session workflow.',
			},
			state,
		);
	}

	const parsed = parseInput(projectActiveMapInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const activeMap = state.session.activeMap;
	if (!activeMap) {
		return reject(
			{
				code: 'invalid-state',
				message: 'Select an active map before projecting it to players.',
			},
			state,
		);
	}
	const map = requireMap(state, activeMap.mapId);
	if (!map) {
		return reject(
			{ code: 'map-not-found', message: `Map ${activeMap.mapId} does not exist.` },
			state,
		);
	}
	const deliveryStatus: ActiveMapDeliveryStatus =
		parsed.data.connectionState === 'offline' ? 'queued' : 'delivered';
	const now = env.clock();
	const nextProjections = { ...state.session.activeMapProjections };
	const events: CoreEvent[] = [];
	let nextLog = state.sync;
	const operationIds: string[] = [];

	for (const playerActorId of parsed.data.playerActorIds) {
		const player = state.permissions.actors[playerActorId];
		if (!player || player.role === 'dm') {
			return reject(
				{
					code: 'invalid-payload',
					message: `Active map projection target ${playerActorId} must be a registered player or observer.`,
				},
				state,
			);
		}
		const previous = nextProjections[playerActorId];
		const projection = {
			id: previous?.id ?? env.ids(),
			playerActorId,
			mapId: activeMap.mapId,
			regionId: activeMap.regionId,
			deliveryStatus,
			deliveryReason: parsed.data.connectionState,
			createdBy: actor.id,
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			revision: (previous?.revision ?? 0) + 1,
		};
		nextProjections[playerActorId] = projection;
		const draft = appendOperationDraft(env, nextLog, actor.id, {
			entityType: 'session',
			entityId: SESSION_ENTITY_ID,
			opType: 'session.project-active-map',
			path: `activeMapProjections/${playerActorId}`,
			value: projection,
			beforeRevision: previous?.revision ?? 0,
			afterRevision: projection.revision,
			dependencies: [`map:${map.id}@${map.revision}`],
		});
		nextLog = draft.log;
		operationIds.push(draft.op.id);
		events.push({
			kind: 'session.active-map-projected',
			actorId: actor.id,
			playerActorId,
			projectionId: projection.id,
			mapId: projection.mapId,
			regionId: projection.regionId,
			deliveryStatus,
		});
	}

	return {
		status: 'accepted',
		nextState: {
			...state,
			session: { ...state.session, activeMapProjections: nextProjections },
			sync: nextLog,
		},
		events,
		operationIds,
	};
}
