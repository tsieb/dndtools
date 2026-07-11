/**
 * I11 S11.2.1 — the durable SCENE CARD (atmosphere) model.
 *
 * A Scene Card is a DM-authored ATMOSPHERE object — title, mood, hero image, flavor text, and an
 * optional AUDIO-001 association reference — displayed in the fullscreen scene display mode
 * (S11.2.2), queued/advanced during play (S11.2.3), and pushed to player devices as a banner when
 * player-visible (S11.2.4). It is DELIBERATELY DISTINCT from the Command Center `Scene` (the canvas
 * of sections/widgets in `scene-state.ts`): a scene card carries presentation content only — it has
 * no widgets, no layout, and no bindings.
 *
 * The slice lives ON the session document (like Player Groups / calendar continuity) but is
 * CAMPAIGN-level: cards, the queue, and the push history are NOT reset when the session workflow
 * transitions (the calendar-continuity precedent). The DM clears the live display explicitly via
 * `scene-card.activate` with a null card.
 *
 * Invariants (enforced by the `scene-card.*` command reducers + the actor-filtered queries):
 *
 *   - DM-only authoring. Every `scene-card.*` command is DM-only; players/observers never mutate cards.
 *   - Fail-closed visibility. A card defaults `dm-only`; the actor-filtered reads OMIT dm-only cards
 *     (and push-history rows whose card is dm-only) for non-DM actors — a hidden card never leaks.
 *   - References, never copies. The audio cue is referenced by AUDIO-001 association id (resolved
 *     live at activation through the existing audio gates); the hero image is a vault asset id or a
 *     URL, never embedded bytes (Contract 2 — bytes never enter CoreStateSlice).
 *   - Soft delete. `scene-card.delete` tombstones (recoverable via `scene-card.restore`), mirroring
 *     `scene.delete`; a tombstoned card reads exactly like a missing one.
 *
 * Pure data. No GUI, no storage, no clock — ids/clock are supplied by the command env.
 */

export const SCENE_CARD_SCHEMA_VERSION = 1 as const;

/** The entity type a scene card is addressed by in ops/events. */
export const SCENE_CARD_ENTITY_TYPE = 'scene-card' as const;

/** The entity id used for display-wide ops (activate-to-none) that target no single card. */
export const SCENE_CARD_DISPLAY_ENTITY_ID = 'scene-card-display' as const;

/** The mood palette a card is themed by (I11 S11.2.1's closed enum). */
export type SceneCardMood = 'combat' | 'exploration' | 'mystery' | 'social' | 'rest';

export const SCENE_CARD_MOODS: readonly SceneCardMood[] = Object.freeze([
	'combat',
	'exploration',
	'mystery',
	'social',
	'rest',
]);

/** True when `value` is a declared mood. Unknown values fail closed to `exploration` on hydrate. */
export function isSceneCardMood(value: unknown): value is SceneCardMood {
	return typeof value === 'string' && (SCENE_CARD_MOODS as readonly string[]).includes(value);
}

/**
 * Card visibility: `dm-only` (the fail-closed default — display mode only, never pushed) or
 * `player-visible` (activation pushes the card banner to player devices and records it in the
 * player-reviewable push history).
 */
export type SceneCardVisibility = 'dm-only' | 'player-visible';

export const SCENE_CARD_VISIBILITIES: readonly SceneCardVisibility[] = Object.freeze([
	'dm-only',
	'player-visible',
]);

export function isSceneCardVisibility(value: unknown): value is SceneCardVisibility {
	return (
		typeof value === 'string' && (SCENE_CARD_VISIBILITIES as readonly string[]).includes(value)
	);
}

/** Flavor text is bounded markdown (I11 S11.2.1 — max 500 chars). */
export const SCENE_CARD_FLAVOR_MAX_LENGTH = 500 as const;

/**
 * The hero image reference: a content-addressed VAULT ASSET id (the existing image-asset store) or an
 * external URL. A reference, never bytes; the display surface resolves it at render and degrades
 * gracefully (mood gradient) when the reference no longer resolves.
 */
export interface SceneCardHeroImage {
	kind: 'vault-asset' | 'url';
	ref: string;
}

/** How the display surface transitions between cards when the queue advances (I11 S11.2.3). */
export type SceneCardTransitionStyle = 'crossfade' | 'slide' | 'cut';

export const SCENE_CARD_TRANSITION_STYLES: readonly SceneCardTransitionStyle[] = Object.freeze([
	'crossfade',
	'slide',
	'cut',
]);

export function isSceneCardTransitionStyle(value: unknown): value is SceneCardTransitionStyle {
	return (
		typeof value === 'string' &&
		(SCENE_CARD_TRANSITION_STYLES as readonly string[]).includes(value)
	);
}

/** ONE durable scene card. */
export interface SceneCard {
	id: string;
	title: string;
	mood: SceneCardMood;
	/** The hero image reference (vault asset id or URL), or null (mood-gradient-only card). */
	heroImage: SceneCardHeroImage | null;
	/** Bounded flavor markdown (≤ {@link SCENE_CARD_FLAVOR_MAX_LENGTH} chars). */
	flavorText: string;
	/** The AUDIO-001 association this card cues on activation, by id — or null (silent card). */
	audioAssociationId: string | null;
	visibility: SceneCardVisibility;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	revision: number;
	/** Soft-delete tombstone (mirrors `scene.deletedAt`); null ⇒ live. */
	deletedAt: string | null;
}

/** True when the card exists and is not tombstoned. */
export function isLiveSceneCard(card: SceneCard | undefined | null): card is SceneCard {
	return Boolean(card && card.deletedAt === null);
}

/**
 * ONE durable PUSH RECORD (I11 S11.2.4): a player-visible card was activated and its banner pushed to
 * player devices. BY REFERENCE — the record carries the card id + attribution only, never a content
 * copy, so the player-facing history read resolves the LIVE card and fails closed (a card later
 * narrowed to dm-only disappears from the players' history without leaking).
 */
export interface SceneCardPushRecord {
	id: string;
	cardId: string;
	pushedBy: string;
	pushedAt: string;
}

/** The durable scene-card slice (lives on the session document; campaign-level, never auto-reset). */
export interface SceneCardState {
	cards: Record<string, SceneCard>;
	/** The upcoming queue, in play order (card ids; each live, deduped). Advance shifts the head. */
	queue: string[];
	/** The card currently on the scene display, or null (display idle). */
	activeCardId: string | null;
	/** The transition the display surface renders between cards (I11 S11.2.3). */
	transitionStyle: SceneCardTransitionStyle;
	/** Player-visible pushes, oldest first (the players' reviewable scene history — S11.2.4). */
	pushHistory: SceneCardPushRecord[];
	schemaVersion: typeof SCENE_CARD_SCHEMA_VERSION;
}

export const EMPTY_SCENE_CARD_STATE: SceneCardState = Object.freeze({
	cards: {},
	queue: [],
	activeCardId: null,
	transitionStyle: 'crossfade' as const,
	pushHistory: [],
	schemaVersion: SCENE_CARD_SCHEMA_VERSION,
});

/**
 * Tolerantly hydrate a possibly-undefined/partial persisted scene-card slice, FAIL CLOSED:
 *
 *   - An unknown visibility collapses to `dm-only` (never widened to players by a corrupt record).
 *   - An unknown mood collapses to `exploration`; an unknown transition to `crossfade`.
 *   - Flavor text is re-truncated to the bound.
 *   - The queue is deduped and reduced to LIVE cards; a dangling/tombstoned `activeCardId` clears.
 */
export function ensureSceneCardState(state: Partial<SceneCardState> | undefined): SceneCardState {
	const cards: Record<string, SceneCard> = {};
	for (const [id, card] of Object.entries(state?.cards ?? {})) {
		if (!card) continue;
		cards[id] = {
			id: card.id ?? id,
			title: card.title ?? '',
			mood: isSceneCardMood(card.mood) ? card.mood : 'exploration',
			heroImage:
				card.heroImage &&
				(card.heroImage.kind === 'vault-asset' || card.heroImage.kind === 'url') &&
				typeof card.heroImage.ref === 'string' &&
				card.heroImage.ref.length > 0
					? { kind: card.heroImage.kind, ref: card.heroImage.ref }
					: null,
			flavorText:
				typeof card.flavorText === 'string'
					? card.flavorText.slice(0, SCENE_CARD_FLAVOR_MAX_LENGTH)
					: '',
			audioAssociationId:
				typeof card.audioAssociationId === 'string' && card.audioAssociationId.length > 0
					? card.audioAssociationId
					: null,
			visibility: isSceneCardVisibility(card.visibility) ? card.visibility : 'dm-only',
			createdBy: card.createdBy ?? '',
			createdAt: card.createdAt ?? '',
			updatedAt: card.updatedAt ?? card.createdAt ?? '',
			revision: card.revision ?? 0,
			deletedAt: card.deletedAt ?? null,
		};
	}

	const seen = new Set<string>();
	const queue: string[] = [];
	for (const id of state?.queue ?? []) {
		if (typeof id !== 'string' || seen.has(id)) continue;
		if (!isLiveSceneCard(cards[id])) continue;
		seen.add(id);
		queue.push(id);
	}

	const activeCardId =
		typeof state?.activeCardId === 'string' && isLiveSceneCard(cards[state.activeCardId])
			? state.activeCardId
			: null;

	const pushHistory: SceneCardPushRecord[] = [];
	for (const record of state?.pushHistory ?? []) {
		if (!record || typeof record.cardId !== 'string') continue;
		// A history row referencing a card that no longer exists at all is dropped (nothing to resolve);
		// a row whose card is merely tombstoned is kept — restore brings its history back.
		if (!cards[record.cardId]) continue;
		pushHistory.push({
			id: record.id ?? '',
			cardId: record.cardId,
			pushedBy: record.pushedBy ?? '',
			pushedAt: record.pushedAt ?? '',
		});
	}

	return {
		cards,
		queue,
		activeCardId,
		transitionStyle: isSceneCardTransitionStyle(state?.transitionStyle)
			? state.transitionStyle
			: 'crossfade',
		pushHistory,
		schemaVersion: SCENE_CARD_SCHEMA_VERSION,
	};
}
