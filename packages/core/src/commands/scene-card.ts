import {
	activateSceneCardInputSchema,
	advanceSceneCardQueueInputSchema,
	createSceneCardInputSchema,
	dequeueSceneCardInputSchema,
	deleteSceneCardInputSchema,
	enqueueSceneCardInputSchema,
	reorderSceneCardQueueInputSchema,
	restoreSceneCardInputSchema,
	setSceneCardTransitionInputSchema,
	setSceneCardVisibilityInputSchema,
	updateSceneCardInputSchema,
} from '../schemas/commands';
import {
	SCENE_CARD_DISPLAY_ENTITY_ID,
	SCENE_CARD_ENTITY_TYPE,
	isLiveSceneCard,
	type SceneCard,
	type SceneCardPushRecord,
	type SceneCardState,
} from '../state/scene-card';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * I11 S11.2.1–S11.2.4 — SCENE CARD (atmosphere) command handlers.
 *
 * Every `scene-card.*` command is DM-only (players/observers never author atmosphere), fail-closed:
 *
 *   - A card defaults `dm-only`; it is pushed to players ONLY when it is `player-visible` and activated.
 *   - Delete is a soft TOMBSTONE (recoverable via restore), mirroring `scene.delete`. Deleting a card
 *     also drops it from the queue and clears the display if it was live (state stays consistent — the
 *     same invariants `ensureSceneCardState` fixes on hydrate, enforced here immediately).
 *   - Activating a `player-visible` card records a durable PUSH RECORD (by reference: card id +
 *     attribution only, never a content copy) and emits `scene-card.pushed` so the push is on the
 *     session event timeline. The player-facing history read resolves the LIVE card and fails closed.
 *
 * Each mutation appends exactly one durable `scene-card.*` op so the change replays in order. The slice
 * lives on `state.session.sceneCards` (campaign-level; never auto-reset between sessions).
 */

function withSceneCards(state: CoreStateSlice, sceneCards: SceneCardState): CoreStateSlice {
	return { ...state, session: { ...state.session, sceneCards } };
}

export function handleCreateSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(createSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const slice = state.session.sceneCards;
	const previous = input.cardId ? slice.cards[input.cardId] : undefined;
	const cardId = previous?.id ?? input.cardId ?? env.ids();
	const now = env.clock();
	const card: SceneCard = {
		id: cardId,
		title: input.title,
		mood: input.mood,
		heroImage: input.heroImage,
		flavorText: input.flavorText,
		audioAssociationId: input.audioAssociationId,
		visibility: input.visibility,
		createdBy: previous?.createdBy ?? actor.id,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
		revision: (previous?.revision ?? 0) + 1,
		deletedAt: null,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: cardId,
		opType: 'scene-card.create',
		path: `sceneCards/${cardId}`,
		value: card,
		beforeRevision: previous?.revision ?? 0,
		afterRevision: card.revision,
	});

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{ ...slice, cards: { ...slice.cards, [cardId]: card } },
		),
		events: [{ kind: 'scene-card.created', cardId, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleUpdateSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(updateSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const slice = state.session.sceneCards;
	const previous = slice.cards[input.cardId];
	if (!isLiveSceneCard(previous)) {
		return reject(
			{ code: 'scene-card-not-found', message: `Scene card ${input.cardId} does not exist.` },
			state,
		);
	}

	const card: SceneCard = {
		...previous,
		title: input.title ?? previous.title,
		mood: input.mood ?? previous.mood,
		heroImage: input.heroImage !== undefined ? input.heroImage : previous.heroImage,
		flavorText: input.flavorText ?? previous.flavorText,
		audioAssociationId:
			input.audioAssociationId !== undefined
				? input.audioAssociationId
				: previous.audioAssociationId,
		updatedAt: env.clock(),
		revision: previous.revision + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: card.id,
		opType: 'scene-card.update',
		path: `sceneCards/${card.id}`,
		value: input,
		beforeRevision: previous.revision,
		afterRevision: card.revision,
	});

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{ ...slice, cards: { ...slice.cards, [card.id]: card } },
		),
		events: [{ kind: 'scene-card.updated', cardId: card.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleDeleteSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(deleteSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { cardId } = parsed.data;

	// Read raw (not the live-aware guard) so an already-tombstoned card gets the DISTINCT rejection.
	const previous = state.session.sceneCards.cards[cardId];
	if (!previous) {
		return reject(
			{ code: 'scene-card-not-found', message: `Scene card ${cardId} does not exist.` },
			state,
		);
	}
	if (!isLiveSceneCard(previous)) {
		return reject(
			{ code: 'scene-card-deleted', message: `Scene card ${cardId} is already deleted.` },
			state,
		);
	}

	const slice = state.session.sceneCards;
	const card: SceneCard = { ...previous, deletedAt: env.clock(), revision: previous.revision + 1 };
	// Keep the slice consistent: a tombstoned card can be neither queued nor live on the display.
	const nextSlice: SceneCardState = {
		...slice,
		cards: { ...slice.cards, [cardId]: card },
		queue: slice.queue.filter((id) => id !== cardId),
		activeCardId: slice.activeCardId === cardId ? null : slice.activeCardId,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: cardId,
		opType: 'scene-card.delete',
		path: `sceneCards/${cardId}`,
		value: { cardId, softDelete: true },
		beforeRevision: previous.revision,
		afterRevision: card.revision,
	});

	return {
		status: 'accepted',
		nextState: withSceneCards({ ...state, sync: nextLog }, nextSlice),
		events: [{ kind: 'scene-card.deleted', cardId, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleRestoreSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(restoreSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { cardId } = parsed.data;

	const previous = state.session.sceneCards.cards[cardId];
	if (!previous) {
		return reject(
			{ code: 'scene-card-not-found', message: `Scene card ${cardId} does not exist.` },
			state,
		);
	}
	// Direct field check (not the `isLiveSceneCard` guard) — a positive guard would narrow the fall-through
	// branch to `never`, and a live card cannot be restored anyway.
	if (previous.deletedAt === null) {
		return reject(
			{ code: 'scene-card-not-deleted', message: `Scene card ${cardId} is not deleted.` },
			state,
		);
	}

	const slice = state.session.sceneCards;
	const card: SceneCard = { ...previous, deletedAt: null, revision: previous.revision + 1 };

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: cardId,
		opType: 'scene-card.restore',
		path: `sceneCards/${cardId}`,
		value: { cardId },
		beforeRevision: previous.revision,
		afterRevision: card.revision,
	});

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{ ...slice, cards: { ...slice.cards, [cardId]: card } },
		),
		events: [{ kind: 'scene-card.restored', cardId, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleSetSceneCardVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setSceneCardVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const slice = state.session.sceneCards;
	const previous = slice.cards[input.cardId];
	if (!isLiveSceneCard(previous)) {
		return reject(
			{ code: 'scene-card-not-found', message: `Scene card ${input.cardId} does not exist.` },
			state,
		);
	}

	const card: SceneCard = {
		...previous,
		visibility: input.visibility,
		updatedAt: env.clock(),
		revision: previous.revision + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: card.id,
		opType: 'scene-card.set-visibility',
		path: `sceneCards/${card.id}`,
		value: { cardId: card.id, visibility: input.visibility },
		beforeRevision: previous.revision,
		afterRevision: card.revision,
	});

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{ ...slice, cards: { ...slice.cards, [card.id]: card } },
		),
		events: [
			{
				kind: 'scene-card.visibility-changed',
				cardId: card.id,
				visibility: input.visibility,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * Activate a card onto the scene display, or clear the display with `cardId: null`. A `player-visible`
 * activation additionally records a durable PUSH RECORD and emits `scene-card.pushed` (S11.2.4). Shared
 * by the direct activate command and the queue-advance path.
 */
function activateOnto(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actor: { id: string },
	cardId: string | null,
	nextQueue: string[],
	queueMutation: 'activate' | 'advance',
): CommandResult {
	const slice = state.session.sceneCards;

	if (cardId === null) {
		const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
			entityType: SCENE_CARD_ENTITY_TYPE,
			entityId: SCENE_CARD_DISPLAY_ENTITY_ID,
			opType: 'scene-card.activate',
			value: { cardId: null },
		});
		return {
			status: 'accepted',
			nextState: withSceneCards(
				{ ...state, sync: nextLog },
				{ ...slice, activeCardId: null, queue: nextQueue },
			),
			events: [{ kind: 'scene-card.activated', cardId: null, pushed: false, actorId: actor.id }],
			operationIds: [op.id],
		};
	}

	const card = slice.cards[cardId];
	if (!isLiveSceneCard(card)) {
		return reject(
			{ code: 'scene-card-not-found', message: `Scene card ${cardId} does not exist.` },
			state,
		);
	}

	const pushed = card.visibility === 'player-visible';
	const now = env.clock();
	const pushRecord: SceneCardPushRecord | null = pushed
		? { id: env.ids(), cardId, pushedBy: actor.id, pushedAt: now }
		: null;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: cardId,
		opType: 'scene-card.activate',
		path: `sceneCards/${cardId}`,
		value: { cardId, pushed, pushRecordId: pushRecord?.id ?? null, via: queueMutation },
	});

	const events: CoreEvent[] = [
		{ kind: 'scene-card.activated', cardId, pushed, actorId: actor.id },
	];
	if (pushRecord) {
		events.push({
			kind: 'scene-card.pushed',
			cardId,
			pushRecordId: pushRecord.id,
			actorId: actor.id,
		});
	}

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{
				...slice,
				activeCardId: cardId,
				queue: nextQueue,
				pushHistory: pushRecord ? [...slice.pushHistory, pushRecord] : slice.pushHistory,
			},
		),
		events,
		operationIds: [op.id],
	};
}

export function handleActivateSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(activateSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	return activateOnto(
		state,
		env,
		actor,
		parsed.data.cardId,
		state.session.sceneCards.queue,
		'activate',
	);
}

export function handleAdvanceSceneCardQueue(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(advanceSceneCardQueueInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const slice = state.session.sceneCards;
	const [head, ...rest] = slice.queue;
	if (!head) {
		return reject({ code: 'invalid-state', message: 'The scene queue is empty.' }, state);
	}

	const result = activateOnto(state, env, actor, head, rest, 'advance');
	if (result.status !== 'accepted') return result;
	return {
		...result,
		events: [
			...result.events,
			{ kind: 'scene-card.queue-changed', mutation: 'advance', cardId: head, actorId: actor.id },
		],
	};
}

export function handleSetSceneCardTransition(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setSceneCardTransitionInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { transitionStyle } = parsed.data;

	const slice = state.session.sceneCards;
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: SCENE_CARD_DISPLAY_ENTITY_ID,
		opType: 'scene-card.set-transition',
		value: { transitionStyle },
	});

	return {
		status: 'accepted',
		nextState: withSceneCards({ ...state, sync: nextLog }, { ...slice, transitionStyle }),
		events: [{ kind: 'scene-card.transition-changed', transitionStyle, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleEnqueueSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(enqueueSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { cardId } = parsed.data;

	const slice = state.session.sceneCards;
	if (!isLiveSceneCard(slice.cards[cardId])) {
		return reject(
			{ code: 'scene-card-not-found', message: `Scene card ${cardId} does not exist.` },
			state,
		);
	}
	if (slice.queue.includes(cardId)) {
		return reject(
			{ code: 'invalid-state', message: `Scene card ${cardId} is already queued.` },
			state,
		);
	}

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: cardId,
		opType: 'scene-card.enqueue',
		value: { cardId },
	});

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{ ...slice, queue: [...slice.queue, cardId] },
		),
		events: [{ kind: 'scene-card.queue-changed', mutation: 'enqueue', cardId, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleDequeueSceneCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(dequeueSceneCardInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { cardId } = parsed.data;

	const slice = state.session.sceneCards;
	if (!slice.queue.includes(cardId)) {
		return reject(
			{ code: 'invalid-state', message: `Scene card ${cardId} is not queued.` },
			state,
		);
	}

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: cardId,
		opType: 'scene-card.dequeue',
		value: { cardId },
	});

	return {
		status: 'accepted',
		nextState: withSceneCards(
			{ ...state, sync: nextLog },
			{ ...slice, queue: slice.queue.filter((id) => id !== cardId) },
		),
		events: [{ kind: 'scene-card.queue-changed', mutation: 'dequeue', cardId, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleReorderSceneCardQueue(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(reorderSceneCardQueueInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { queue } = parsed.data;

	const slice = state.session.sceneCards;
	// The reorder must be a PERMUTATION of the current queue: same set, no adds/drops, no dupes.
	const current = [...slice.queue].sort();
	const proposed = [...queue].sort();
	const samePermutation =
		current.length === proposed.length && current.every((id, i) => id === proposed[i]);
	if (!samePermutation) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'The reordered queue must contain exactly the currently-queued cards.',
			},
			state,
		);
	}

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SCENE_CARD_ENTITY_TYPE,
		entityId: SCENE_CARD_DISPLAY_ENTITY_ID,
		opType: 'scene-card.reorder-queue',
		value: { queue },
	});

	return {
		status: 'accepted',
		nextState: withSceneCards({ ...state, sync: nextLog }, { ...slice, queue: [...queue] }),
		events: [
			{ kind: 'scene-card.queue-changed', mutation: 'reorder', cardId: null, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}
