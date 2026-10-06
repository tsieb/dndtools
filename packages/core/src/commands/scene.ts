import {
	duplicateSceneInputSchema,
	reorderScreenPinsInputSchema,
	// RC-WID-6.6
	repointWidgetInputSchema,
	setScreenLayoutPolicyInputSchema,
	setScreenPinnedInputSchema,
} from '../schemas/commands';
import { findPackageRecordForWidgetType } from '../state/widget-package-state';
import {
	SCENE_SCHEMA_VERSION,
	isLiveScene,
	isPinnedScreen,
	listPinnedScreens,
	screenMetaOf,
	withScreenMeta,
	type Scene,
	type SceneState,
	type SectionLayoutRegion,
	type WidgetInstance,
} from '../state/scene-state';
import {
	appendOperationDraft,
	bumpRevision,
	findWidget,
	parseInput,
	reject,
	replaceWidget,
	requireActor,
	requireDm,
	requireScene,
	validateObjectAgainstSchema,
	withScene,
} from './helpers';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';

/**
 * RC-CAN-7.2 / ADR-041 — the SCREEN commands. A screen is a scene, so these live beside the other
 * scene commands and mutate the same record; what they own is the additive screen metadata
 * (`Scene.screen`) plus whole-screen duplication.
 *
 * All four are DM-only, matching every other scene-level command in `scene-meta.ts`: pinning,
 * ordering, layout policy and duplication are GM workspace decisions, not table actions.
 */

/**
 * `scene.set-pinned` — pin or unpin a SCREEN in the shell's Screens group. Distinct from
 * `scene.pin-widget`, which pins a TILE inside a screen.
 *
 * A new pin lands ABOVE every existing one: the reducer reads the current maximum from its own state
 * rather than taking a position from the caller, so two clients pinning at once cannot claim the same
 * slot. Unpinning leaves the remaining orders as they are (they may go non-contiguous);
 * `scene.reorder-pins` is the one command that renumbers.
 *
 * Fail closed: a template is not a workspace and can never be pinned, and pinning a screen that is
 * already pinned is rejected rather than replayed, mirroring `scene.delete` refusing a re-delete.
 * Pinning is a shell shortcut only — it changes NO visibility field, so it cannot project a GM-only
 * screen to players.
 */
export function handleSetScreenPinned(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setScreenPinnedInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

	if (parsed.data.pinned && scene.templateMeta.isTemplate) {
		return reject(
			{
				code: 'invalid-state',
				message: `Scene ${scene.id} is a template and cannot be pinned as a screen.`,
			},
			state,
		);
	}

	const meta = screenMetaOf(scene);
	if (meta.pinned === parsed.data.pinned) {
		return reject(
			{
				code: 'invalid-state',
				message: `Screen ${scene.id} is already ${parsed.data.pinned ? 'pinned' : 'unpinned'}.`,
			},
			state,
		);
	}

	const nextPinOrder = parsed.data.pinned ? nextPinSlot(state.scenes) : null;
	const nextScene = bumpRevision(
		withScreenMeta(scene, { ...meta, pinned: parsed.data.pinned, pinOrder: nextPinOrder }),
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.set-pinned',
		path: `screen/pinned`,
		value: { sceneId: scene.id, pinned: parsed.data.pinned, pinOrder: nextPinOrder },
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.pin-changed',
				sceneId: scene.id,
				actorId: actor.id,
				pinned: parsed.data.pinned,
			},
		],
		operationIds: [op.id],
	};
}

/** One above the highest pin currently held, or 0 when nothing is pinned. */
function nextPinSlot(state: SceneState): number {
	const orders = listPinnedScreens(state).map((scene) => screenMetaOf(scene).pinOrder ?? -1);
	if (orders.length === 0) return 0;
	return Math.max(...orders) + 1;
}

/**
 * `scene.reorder-pins` — write the GM's complete pin order, front to back, and renumber the pins to
 * 0..n-1. This is the ONE command behind both drag reordering and the keyboard equivalent
 * (CAN-7.4), so the two can never diverge.
 *
 * Fail closed: the payload must name EXACTLY the set of currently pinned live screens. A duplicate,
 * an unknown or deleted id, an unpinned id, or an omitted pin is rejected outright, so a client
 * working from a stale list cannot silently unpin a screen by reordering the rest. Scenes whose
 * position is unchanged are left byte-identical rather than rewritten with the same value.
 */
export function handleReorderScreenPins(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(reorderScreenPinsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const requested = parsed.data.sceneIds;
	if (new Set(requested).size !== requested.length) {
		return reject(
			{ code: 'invalid-payload', message: 'A screen may appear in the pin order only once.' },
			state,
		);
	}

	for (const sceneId of requested) {
		const scene = state.scenes.scenes[sceneId];
		if (!scene || !isLiveScene(scene)) {
			return reject(
				{ code: 'scene-not-found', message: `Scene ${sceneId} does not exist.` },
				state,
			);
		}
		if (!isPinnedScreen(scene)) {
			return reject({ code: 'invalid-state', message: `Screen ${sceneId} is not pinned.` }, state);
		}
	}

	const pinned = listPinnedScreens(state.scenes);
	const requestedSet = new Set(requested);
	const missing = pinned.filter((scene) => !requestedSet.has(scene.id)).map((scene) => scene.id);
	if (missing.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: `The pin order must list every pinned screen; missing ${missing.join(', ')}.`,
			},
			state,
		);
	}

	let nextScenes: SceneState = state.scenes;
	const moved: string[] = [];
	requested.forEach((sceneId, index) => {
		const scene = nextScenes.scenes[sceneId];
		if (!scene) return;
		const meta = screenMetaOf(scene);
		if (meta.pinOrder === index) return;
		moved.push(sceneId);
		nextScenes = withScene(nextScenes, sceneId, (current) =>
			bumpRevision(withScreenMeta(current, { ...meta, pinOrder: index }), env),
		);
	});

	if (moved.length === 0) {
		return reject(
			{ code: 'invalid-state', message: 'The pinned screens are already in this order.' },
			state,
		);
	}

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		// The order is a property of the pin SET, not of any one screen, so the operation is keyed on
		// the set and carries the whole list. Replaying it reproduces the order regardless of which
		// individual screens happened to move.
		entityId: 'screen-pins',
		opType: 'scene.reorder-pins',
		path: 'screen/pinOrder',
		value: { sceneIds: requested },
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextScenes, sync: nextLog },
		events: [{ kind: 'scene.pins-reordered', actorId: actor.id, sceneIds: requested }],
		operationIds: [op.id],
	};
}

/**
 * `scene.set-layout-policy` — move a screen between `flow` and `canvas`.
 *
 * ADR-041 requires policy conversion to preserve widget identity, configuration and bindings. That is
 * guaranteed here by construction rather than by copying carefully: the reducer writes the policy
 * field and nothing else, so `scene.widgets` and `scene.sections` come through by REFERENCE. Whatever
 * a policy means for rendering is decided downstream by the board that draws it.
 */
export function handleSetScreenLayoutPolicy(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setScreenLayoutPolicyInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

	const meta = screenMetaOf(scene);
	if (meta.layoutPolicy === parsed.data.layoutPolicy) {
		return reject(
			{
				code: 'invalid-state',
				message: `Screen ${scene.id} already uses the ${parsed.data.layoutPolicy} layout policy.`,
			},
			state,
		);
	}

	const nextScene = bumpRevision(
		withScreenMeta(scene, { ...meta, layoutPolicy: parsed.data.layoutPolicy }),
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.set-layout-policy',
		path: 'screen/layoutPolicy',
		value: { sceneId: scene.id, layoutPolicy: parsed.data.layoutPolicy },
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.layout-policy-changed',
				sceneId: scene.id,
				actorId: actor.id,
				layoutPolicy: parsed.data.layoutPolicy,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * `scene.duplicate` — copy a whole screen.
 *
 * Every widget survives: type, version, layout (position, size, z, dock, tile pin, focus order),
 * configuration, local state and binding are carried over verbatim. Only identities are minted fresh
 * — scene id, widget ids, section ids and group ids — and group membership is REMAPPED rather than
 * dropped, so a grouped arrangement duplicates as a grouped arrangement. `disabled` is cleared, as in
 * `scene.save-template`: a placeholder is a statement about the current package status, which the copy
 * re-derives rather than inherits.
 *
 * The copy starts GM-ONLY with no sharing targets and no player-view assignments (ADR-041: creating a
 * workspace does not project it to players), unpinned, and carrying the source's layout policy plus a
 * `duplicate` origin. The origin is provenance and nothing reads it to re-seed content.
 */
export function handleDuplicateScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(duplicateSceneInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const source = requireScene(state, parsed.data.sceneId);
	if ('code' in source) return reject(source, state);

	const now = env.clock();
	const newId = env.ids();

	// Groups are part of the arrangement, so each distinct source group gets ONE new id that every
	// member of that group then shares. Minting per widget would silently dissolve every group.
	const groupIds = new Map<string, string>();
	const widgetIds = new Map<string, string>();
	const widgets: WidgetInstance[] = source.widgets.map((widget) => {
		const groupId = widget.layout.groupId;
		if (groupId !== null && !groupIds.has(groupId)) groupIds.set(groupId, env.ids());
		const copy: WidgetInstance = {
			...widget,
			id: env.ids(),
			layout: {
				...widget.layout,
				groupId: groupId === null ? null : (groupIds.get(groupId) ?? null),
			},
			configuration: { ...widget.configuration },
			localState: { ...widget.localState },
			binding: widget.binding ? { ...widget.binding } : null,
			disabled: null,
		};
		widgetIds.set(widget.id, copy.id);
		return copy;
	});

	const sections: SectionLayoutRegion[] = source.sections.map((section) => ({
		...section,
		id: env.ids(),
		bounds: { ...section.bounds },
		widgetInstanceIds: section.widgetInstanceIds
			.map((id) => widgetIds.get(id))
			.filter((id): id is string => Boolean(id)),
	}));

	const copy: Scene = withScreenMeta(
		{
			id: newId,
			name: parsed.data.name,
			description: source.description,
			tags: source.tags.slice(),
			// GM-only by default: a duplicate inherits the source's CONTENT, never its audience.
			visibility: 'dm-only',
			visualSettings: { ...source.visualSettings },
			ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
			sharingTargets: [],
			playerViewAssignments: [],
			// A copy is never itself a template, but it keeps whatever template the source was born
			// from, so provenance survives one more hop.
			templateMeta: {
				isTemplate: false,
				instantiatedFromTemplateSceneId: source.templateMeta.instantiatedFromTemplateSceneId,
			},
			sections,
			widgets,
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		{
			// Pinning is a per-GM shortcut, not a property of the content: a copy starts unpinned.
			pinned: false,
			pinOrder: null,
			layoutPolicy: screenMetaOf(source).layoutPolicy,
			origin: { kind: 'duplicate', sourceSceneId: source.id, defaultKey: null, at: now },
		},
	);

	const nextSceneState: SceneState = {
		schemaVersion: state.scenes.schemaVersion,
		scenes: { ...state.scenes.scenes, [newId]: copy },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: newId,
		opType: 'scene.duplicate',
		value: copy,
		afterRevision: copy.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.duplicated',
				sourceSceneId: source.id,
				newSceneId: newId,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * RC-WID-6.6 — `scene.repoint-widget`: a placed widget draws as its fork from now on (the tile's
 * "Edit widget"), or a fork's placed copy goes back to the widget it was copied from.
 *
 * Only that lineage is accepted. The target must name the instance's current type in
 * `authoring.forkedFrom`, or the instance's current package must name the target there, so this can
 * never turn a tile into an unrelated widget and skip what `scene.add-widget` checks. The target's
 * package must be installed. It may be off: a fork of custom code starts off, and the tile moves
 * onto it while the GM edits it, reading "disabled, preserved" until the save turns it on (the scene
 * read reports a switched-off package exactly as it does for a package disabled after placement).
 * The instance keeps its id, layout, binding and local state; it moves to the target's version, and
 * its configuration must satisfy the target's schema. `disabled` is cleared: it described the old
 * package, and the scene read re-derives the new one's status. DM-only, like the fork itself.
 */
export function handleRepointWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(repointWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const instance = findWidget(scene, parsed.data.widgetInstanceId);
	if (!instance) {
		return reject(
			{
				code: 'widget-not-found',
				message: `Widget ${parsed.data.widgetInstanceId} not found on Scene ${scene.id}.`,
			},
			state,
		);
	}
	const widgetType = parsed.data.widgetType;
	if (widgetType === instance.type) {
		return reject(
			{ code: 'invalid-state', message: `Widget ${instance.id} is already a ${widgetType}.` },
			state,
		);
	}
	const target = findPackageRecordForWidgetType(state.widgets, widgetType);
	if (!target || target.removedAt) {
		return reject(
			{
				code: 'package-not-found',
				message: `No installed package declares widget type ${widgetType}.`,
			},
			state,
		);
	}
	const current = findPackageRecordForWidgetType(state.widgets, instance.type);
	const ontoFork = target.package.authoring?.forkedFrom;
	const backFromFork = current?.package.authoring?.forkedFrom;
	const related =
		(ontoFork?.widgetType === instance.type &&
			(!current || ontoFork.packageId === current.package.id)) ||
		(backFromFork?.widgetType === widgetType && backFromFork.packageId === target.package.id);
	if (!related) {
		return reject(
			{
				code: 'invalid-state',
				message: `${widgetType} is not a copy of ${instance.type}, nor the widget it was copied from.`,
			},
			state,
		);
	}
	const definition = target.package.widgets.find((candidate) => candidate.type === widgetType)!;
	const configIssues = validateObjectAgainstSchema(
		definition.configurationSchema,
		instance.configuration,
	);
	if (configIssues.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Widget ${instance.id}'s settings do not fit ${widgetType}.`,
				issues: configIssues.map((issue) => ({
					path: `configuration.${issue.path}`,
					message: issue.message,
				})),
			},
			state,
		);
	}

	const nextWidget: WidgetInstance = {
		...instance,
		type: widgetType,
		version: definition.version,
		disabled: null,
	};
	const nextScene = bumpRevision(replaceWidget(scene, nextWidget), env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.repoint-widget',
		path: `widgets/${instance.id}/type`,
		value: {
			sceneId: scene.id,
			widgetInstanceId: instance.id,
			fromType: instance.type,
			fromVersion: instance.version,
			widgetType,
			version: definition.version,
		},
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-repointed',
				sceneId: scene.id,
				widgetInstanceId: instance.id,
				actorId: actor.id,
				widgetType,
			},
		],
		operationIds: [op.id],
	};
}
