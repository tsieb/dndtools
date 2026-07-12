import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import {
	isLiveSceneCard,
	type SceneCard,
	type SceneCardHeroImage,
	type SceneCardMood,
	type SceneCardTransitionStyle,
	type SceneCardVisibility,
} from '../state/scene-card';

/**
 * I11 S11.2 — THE actor-filtered SCENE CARD read models. Visibility is decided in the DATA LAYER before
 * any card content reaches a surface (display window, player banner, sync — Contract 3 Axis 1), so every
 * surface consumes THIS, never the raw {@link SessionState}.
 *
 * The privacy guarantee proven here (fail closed):
 *
 *   - A NON-DM actor NEVER sees a `dm-only` card. `getSceneCardForActor` returns `null` for a
 *     player/observer whose target card is `dm-only` or tombstoned — indistinguishable from a card that
 *     does not exist (no title/flavor/mood leak).
 *   - The DM sees every LIVE card (tombstoned cards are omitted from every read).
 *   - The push history a player reviews resolves each row against the LIVE card through the SAME
 *     actor-filtered read, so a card later narrowed to `dm-only` (or deleted) drops out of the players'
 *     scene history with no residual content.
 *
 * Pure + deterministic: a function of (session, permissions, actorId[, cardId]) only. No GUI, no storage.
 */

/** ONE scene card as projected to an actor who may see it. */
export interface SceneCardView {
	id: string;
	title: string;
	mood: SceneCardMood;
	heroImage: SceneCardHeroImage | null;
	flavorText: string;
	audioAssociationId: string | null;
	visibility: SceneCardVisibility;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** ONE player-reviewable push-history row: when a card was pushed + the LIVE card projected for the actor. */
export interface SceneCardPushView {
	id: string;
	pushedAt: string;
	card: SceneCardView;
}

/** The scene DISPLAY surface projected for an actor: the active card, the transition, and the queue depth. */
export interface SceneDisplayView {
	active: SceneCardView | null;
	transitionStyle: SceneCardTransitionStyle;
	/** The number of live cards still queued ahead (DM-facing; 0 for non-DM actors). */
	queuedCount: number;
}

function toView(card: SceneCard): SceneCardView {
	return {
		id: card.id,
		title: card.title,
		mood: card.mood,
		heroImage: card.heroImage,
		flavorText: card.flavorText,
		audioAssociationId: card.audioAssociationId,
		visibility: card.visibility,
		createdAt: card.createdAt,
		updatedAt: card.updatedAt,
		revision: card.revision,
	};
}

/**
 * Project ONE scene card for an actor. Returns `null` (unavailable, no content) for an unknown actor, a
 * missing/tombstoned card, or a `dm-only` card requested by a non-DM actor.
 */
export function getSceneCardForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
	cardId: string,
): SceneCardView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const card = session.sceneCards.cards[cardId];
	if (!isLiveSceneCard(card)) return null;
	if (actor.role !== 'dm' && card.visibility !== 'player-visible') return null;
	return toView(card);
}

/**
 * The actor-filtered LIST of scene cards. The DM sees every live card; a player/observer sees only live
 * `player-visible` cards. Deterministic order (createdAt then id).
 */
export function listSceneCardsForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): SceneCardView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	return Object.values(session.sceneCards.cards)
		.filter(isLiveSceneCard)
		.filter((card) => actor.role === 'dm' || card.visibility === 'player-visible')
		.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)))
		.map(toView);
}

/**
 * The card currently on the scene display, projected for the actor. A player sees it only when it is
 * `player-visible` (this is the banner-push read); the DM always sees the active card. `null` ⇒ idle
 * display (or a card the actor may not see).
 */
export function getActiveSceneCardForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): SceneCardView | null {
	const activeCardId = session.sceneCards.activeCardId;
	if (!activeCardId) return null;
	return getSceneCardForActor(session, permissions, actorId, activeCardId);
}

/**
 * The DM-facing scene QUEUE, in play order (live cards only). A non-DM receives an EMPTY list — the queue
 * is a DM authoring/planning surface, never exposed to players.
 */
export function getSceneCardQueueForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): SceneCardView[] {
	const actor = permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return [];
	const views: SceneCardView[] = [];
	for (const cardId of session.sceneCards.queue) {
		const card = session.sceneCards.cards[cardId];
		if (isLiveSceneCard(card)) views.push(toView(card));
	}
	return views;
}

/**
 * S11.2.4 — the player-reviewable SCENE HISTORY: every push, resolved to the LIVE card through the
 * actor-filtered read. A row whose card is now `dm-only` (for a player) or tombstoned is dropped, so the
 * history never leaks a card the actor may no longer see. Ordered oldest → newest (pushedAt then id).
 */
export function getSceneCardPushHistoryForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): SceneCardPushView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	const rows: SceneCardPushView[] = [];
	for (const record of session.sceneCards.pushHistory) {
		const card = getSceneCardForActor(session, permissions, actorId, record.cardId);
		if (!card) continue;
		rows.push({ id: record.id, pushedAt: record.pushedAt, card });
	}
	return rows.sort((a, b) =>
		a.pushedAt === b.pushedAt ? a.id.localeCompare(b.id) : a.pushedAt.localeCompare(b.pushedAt),
	);
}

/**
 * The scene DISPLAY surface read for the fullscreen / secondary-screen mode (S11.2.2/S11.2.3): the active
 * card projected for the actor, the transition style, and the remaining queue depth (DM-facing).
 */
export function getSceneDisplayForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): SceneDisplayView {
	return {
		active: getActiveSceneCardForActor(session, permissions, actorId),
		transitionStyle: session.sceneCards.transitionStyle,
		queuedCount: getSceneCardQueueForActor(session, permissions, actorId).length,
	};
}
