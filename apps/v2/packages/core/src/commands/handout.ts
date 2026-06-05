import { deliverHandoutInputSchema, revealHandoutSectionInputSchema } from '../schemas/commands';
import type {
	HandoutDeliveryRecord,
	HandoutSection,
	PlayerViewDeliveryStatus,
	SessionHandout,
} from '../state/session-state';
import {
	SCENE_SCHEMA_VERSION,
	type Scene,
	type WidgetInstance,
	type WidgetLayout,
} from '../state/scene-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	bumpRevision,
	parseInput,
	reject,
	requireActor,
	requireDm,
	requireScene,
	withScene,
} from './helpers';

/**
 * SES-004 — the HANDOUT DELIVERY commands (Architecture Contract 1 / Contract 3 / Contract 4).
 *
 * The DM delivers a HANDOUT as a Scene WIDGET to SELECTED players or groups. The architecture invariants
 * this slice upholds:
 *
 *   - DM-only + active-session-gated (fail closed): only the DM may deliver/reveal, and only while the
 *     session workflow is `active` (the same guard the dice/combat slices use).
 *   - VISIBILITY ENFORCEMENT is delegated to the PERM visibility-filter at READ time (the recipient set
 *     is the `shared` audience). The reducer never returns recipient-facing content; the actor-filtered
 *     `getHandoutForActor` read decides what each recipient sees. NON-recipients receive NOTHING.
 *   - DELIVERY HISTORY: every delivery to every recipient is appended as a durable
 *     {@link HandoutDeliveryRecord} (who received what, when) — never overwritten.
 *   - OPTIONAL/PROGRESSIVE REVEAL: a `shared` section is withheld from recipients until the DM reveals it
 *     (`revealHandoutSection`); a `player-visible` section is shown to recipients immediately. A
 *     `dm-only` section is never delivered.
 *   - The handout is delivered through a Scene widget that references the handout BY ID (Contract 4
 *     embed/projection) — the widget configuration carries the handout id, never a content clone.
 *
 * Pure Processing-Core policy: delivery resolution is a deterministic function of (state, env, command);
 * the durable write is an op-log entry; the GUI dispatches the intent and renders the actor-filtered read.
 */

const SESSION_ENTITY_ID = 'session-default';
const HANDOUT_WIDGET_TYPE = 'handout';

function handoutLayout(scene: Scene): WidgetLayout {
	const nextZ = Math.max(0, ...scene.widgets.map((widget) => widget.layout.z)) + 1;
	const nextFocus =
		Math.max(0, ...scene.widgets.map((widget) => widget.layout.focusOrder ?? 0)) + 1;
	return {
		x: 24,
		y: 24,
		w: 360,
		h: 280,
		z: nextZ,
		groupId: null,
		dock: null,
		pinned: false,
		focusOrder: nextFocus,
	};
}

/** Find an existing handout widget for this handout id on the scene, or null. */
function findHandoutWidget(scene: Scene, handoutId: string): WidgetInstance | null {
	return (
		scene.widgets.find(
			(widget) => widget.type === HANDOUT_WIDGET_TYPE && widget.configuration.handoutId === handoutId,
		) ?? null
	);
}

/**
 * Ensure a handout widget for `handoutId` exists on `scene`, returning the (possibly mutated) scene and
 * the widget. The widget references the handout BY ID through its configuration (no content clone).
 */
function ensureHandoutWidget(
	scene: Scene,
	env: CoreEnvironment,
	handoutId: string,
): { scene: Scene; widget: WidgetInstance; created: boolean } {
	const existing = findHandoutWidget(scene, handoutId);
	if (existing) return { scene, widget: existing, created: false };
	const widget: WidgetInstance = {
		id: env.ids(),
		type: HANDOUT_WIDGET_TYPE,
		version: '1.0.0',
		layout: handoutLayout(scene),
		configuration: { handoutId },
		localState: {},
		binding: null,
		disabled: null,
	};
	return {
		created: true,
		widget,
		scene: { ...scene, widgets: [...scene.widgets, widget], schemaVersion: SCENE_SCHEMA_VERSION },
	};
}

/** Build the handout's sections from the validated input, assigning ids to new sections. */
function buildSections(
	input: ReturnType<typeof deliverHandoutInputSchema['parse']>['sections'],
	previous: SessionHandout | undefined,
	env: CoreEnvironment,
): HandoutSection[] {
	return input.map((section, index) => {
		const previousSection = section.id
			? previous?.sections.find((existing) => existing.id === section.id)
			: previous?.sections[index];
		return {
			id: section.id ?? previousSection?.id ?? env.ids(),
			heading: section.heading,
			body: section.body,
			visibility: section.visibility,
		};
	});
}

export function handleDeliverHandout(
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
			{ code: 'invalid-state', message: 'Delivering a handout requires an active Session workflow.' },
			state,
		);
	}

	const parsed = parseInput(deliverHandoutInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const sceneResult = requireScene(state, input.sceneId);
	if ('code' in sceneResult) return reject(sceneResult, state);

	// Every recipient must be a registered player/observer — never the DM, never an unknown actor (fail
	// closed: an invalid recipient rejects the whole delivery so no partial, leaky delivery commits).
	for (const recipientId of input.recipientActorIds) {
		const recipient = state.permissions.actors[recipientId];
		if (!recipient || recipient.role === 'dm') {
			return reject(
				{
					code: 'invalid-payload',
					message: `Handout recipient ${recipientId} must be a registered player or observer.`,
				},
				state,
			);
		}
	}

	const previous = input.handoutId ? state.session.handouts[input.handoutId] : undefined;
	if (input.handoutId && !previous) {
		return reject(
			{ code: 'content-item-not-found', message: `Handout ${input.handoutId} does not exist.` },
			state,
		);
	}

	const handoutId = previous?.id ?? env.ids();
	const sections = buildSections(input.sections, previous, env);
	const sectionIds = new Set(sections.map((section) => section.id));
	// Reveal ids must reference sections that exist (fail closed: drop unknown ids).
	const revealedSectionIds = [
		...new Set([
			...(previous?.revealedSectionIds.filter((id) => sectionIds.has(id)) ?? []),
			...input.revealedSectionIds.filter((id) => sectionIds.has(id)),
		]),
	];

	// The recipient set is the UNION of any prior recipients and the new ones (a re-delivery adds to,
	// never silently drops, the audience). Deduped.
	const recipientActorIds = [
		...new Set([...(previous?.recipientActorIds ?? []), ...input.recipientActorIds]),
	];

	// Ensure a handout widget exists on the scene (by reference).
	const ensured = ensureHandoutWidget(sceneResult, env, handoutId);
	const widgetScene = ensured.created ? bumpRevision(ensured.scene, env) : ensured.scene;
	const nextScenes = ensured.created
		? withScene(state.scenes, sceneResult.id, () => widgetScene)
		: state.scenes;

	const now = env.clock();
	const deliveryStatus: PlayerViewDeliveryStatus =
		input.connectionState === 'offline' ? 'queued' : 'delivered';

	// Append ONE delivery record per recipient this delivery targets (history grows, never overwrites).
	const newDeliveries: HandoutDeliveryRecord[] = input.recipientActorIds.map((recipientId) => ({
		id: env.ids(),
		recipientActorId: recipientId,
		deliveredBy: actor.id,
		deliveredAt: now,
		deliveryStatus,
		deliveryReason: input.connectionState,
		sceneId: sceneResult.id,
		widgetInstanceId: ensured.widget.id,
	}));

	const handout: SessionHandout = {
		id: handoutId,
		title: input.title,
		sections,
		revealedSectionIds,
		recipientActorIds,
		deliveries: [...(previous?.deliveries ?? []), ...newDeliveries],
		createdBy: previous?.createdBy ?? actor.id,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
		revision: (previous?.revision ?? 0) + 1,
	};

	const nextSession = {
		...state.session,
		handouts: { ...state.session.handouts, [handoutId]: handout },
	};

	let nextLog = state.sync;
	const operationIds: string[] = [];
	if (ensured.created) {
		const sceneDraft = appendOperationDraft(env, nextLog, actor.id, {
			entityType: 'scene',
			entityId: sceneResult.id,
			opType: 'session.add-handout-widget',
			path: `widgets/${ensured.widget.id}`,
			value: { handoutId, widgetInstanceId: ensured.widget.id },
			beforeRevision: sceneResult.ownership.revision,
			afterRevision: widgetScene.ownership.revision,
		});
		nextLog = sceneDraft.log;
		operationIds.push(sceneDraft.op.id);
	}
	const handoutDraft = appendOperationDraft(env, nextLog, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.deliver-handout',
		path: `handouts/${handoutId}`,
		// The op carries the recipient ids + delivered section count (the audit), NOT recipient-facing
		// content (no leak into the durable log beyond the handout the DM authored).
		value: {
			handoutId,
			recipientActorIds: input.recipientActorIds,
			sceneId: sceneResult.id,
			widgetInstanceId: ensured.widget.id,
			deliveryStatus,
		},
		beforeRevision: previous?.revision ?? 0,
		afterRevision: handout.revision,
		dependencies: [`scene:${sceneResult.id}@${widgetScene.ownership.revision}`],
	});
	nextLog = handoutDraft.log;
	operationIds.push(handoutDraft.op.id);

	const events: CoreEvent[] = [];
	if (ensured.created) {
		events.push({
			kind: 'scene.widget-added',
			sceneId: sceneResult.id,
			widgetInstanceId: ensured.widget.id,
			actorId: actor.id,
		});
	}
	events.push({
		kind: 'session.handout-delivered',
		handoutId,
		sceneId: sceneResult.id,
		widgetInstanceId: ensured.widget.id,
		recipientActorIds: input.recipientActorIds,
		deliveryStatus,
		actorId: actor.id,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextScenes, session: nextSession, sync: nextLog },
		events,
		operationIds,
	};
}

export function handleRevealHandoutSection(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(revealHandoutSectionInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const handout = state.session.handouts[input.handoutId];
	if (!handout) {
		return reject(
			{ code: 'content-item-not-found', message: `Handout ${input.handoutId} does not exist.` },
			state,
		);
	}
	if (!handout.sections.some((section) => section.id === input.sectionId)) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Section ${input.sectionId} does not exist on handout ${handout.id}.`,
			},
			state,
		);
	}

	const currentlyRevealed = handout.revealedSectionIds.includes(input.sectionId);
	if (currentlyRevealed === input.revealed) {
		// No-op reveal/conceal: nothing changes (idempotent), avoid a spurious revision/op.
		return { status: 'accepted', nextState: state, events: [], operationIds: [] };
	}
	const revealedSectionIds = input.revealed
		? [...handout.revealedSectionIds, input.sectionId]
		: handout.revealedSectionIds.filter((id) => id !== input.sectionId);

	const nextHandout: SessionHandout = {
		...handout,
		revealedSectionIds,
		updatedAt: env.clock(),
		revision: handout.revision + 1,
	};
	const nextSession = {
		...state.session,
		handouts: { ...state.session.handouts, [handout.id]: nextHandout },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.reveal-handout-section',
		path: `handouts/${handout.id}/revealedSectionIds`,
		value: { handoutId: handout.id, sectionId: input.sectionId, revealed: input.revealed },
		beforeRevision: handout.revision,
		afterRevision: nextHandout.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.handout-revealed',
				handoutId: handout.id,
				sectionId: input.sectionId,
				revealed: input.revealed,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
