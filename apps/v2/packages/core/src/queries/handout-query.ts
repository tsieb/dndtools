import type { Actor, PermissionState } from '../state/permission-state';
import type {
	HandoutDeliveryRecord,
	HandoutSection,
	SessionHandout,
	SessionState,
} from '../state/session-state';
import {
	evaluateVisibility,
	type EntityVisibilityMetadata,
} from '../permissions/visibility-filter';

/**
 * SES-004 — THE single actor-filtered HANDOUT read model. Visibility is decided in the DATA LAYER BEFORE
 * any handout content is returned to ANY surface (widget, recap, sync — Contract 3 Axis 1 /
 * Cross-Contract Non-Negotiable 2), so every surface consumes THIS, never the raw {@link SessionState}.
 *
 * The privacy guarantee proven here:
 *
 *   - A NON-RECIPIENT receives NOTHING. `getHandoutForActor` returns `{ kind: 'unavailable' }` for a
 *     player/observer who is not in the handout's recipient set — no title, no section headings, no
 *     bodies, no count. Indistinguishable from a handout that does not exist (fail closed).
 *   - A RECIPIENT receives only the sections they may see, computed by the PERM visibility-filter
 *     (`shared` ⇒ delivered to recipients; `dm-only` ⇒ never; `player-visible` ⇒ shown to recipients).
 *   - PROGRESSIVE REVEAL: a `shared` section is withheld from recipients until it is in
 *     `revealedSectionIds`. A `player-visible` section is shown without a reveal step. The DM always
 *     sees every section (and which are revealed).
 *
 * Pure + deterministic: a function of (session, permissions, actor[, handoutId]) only. No GUI, no storage.
 */

/** One handout section as projected to an actor (only sections the actor may see appear). */
export interface HandoutSectionView {
	id: string;
	heading: string;
	body: string;
	/** Whether this section is currently revealed (always true for a delivered section a recipient sees). */
	revealed: boolean;
}

/** A handout as projected to an actor who may see it. */
export interface HandoutView {
	kind: 'available';
	id: string;
	title: string;
	sections: HandoutSectionView[];
	/** Whether the viewer is a recipient of this handout (the DM is treated as always able to see it). */
	isRecipient: boolean;
	updatedAt: string;
	revision: number;
}

/** A handout the actor may NOT see (non-recipient / unknown actor / hidden). NOTHING else is exposed. */
export interface HandoutUnavailable {
	kind: 'unavailable';
}

export type HandoutQueryResult = HandoutView | HandoutUnavailable;

/**
 * Build the PERM visibility metadata for a handout, treating the handout's recipient set as the `shared`
 * audience and folding PROGRESSIVE REVEAL into the per-section rule: a `shared` section that has NOT been
 * revealed is downgraded to `dm-only` so even a recipient cannot see it yet. A `player-visible` section
 * stays `player-visible` (shown to recipients without a reveal). A `dm-only` section stays hidden from
 * everyone but the DM.
 *
 * The handout ENTITY is `shared` to the recipients, so a non-recipient fails the entity check (the
 * filter returns hidden for them) and never reaches any section — the keystone of the non-leak guarantee.
 */
function handoutVisibilityMetadata(handout: SessionHandout): EntityVisibilityMetadata {
	const revealed = new Set(handout.revealedSectionIds);
	const sections: Record<string, { level: 'shared' | 'player-visible' | 'dm-only'; sharedWith?: string[] }> =
		{};
	for (const section of handout.sections) {
		const level = section.visibility;
		if (level === 'shared') {
			sections[section.id] = revealed.has(section.id)
				? { level: 'shared', sharedWith: handout.recipientActorIds }
				: // Not yet revealed: withheld from recipients (treated dm-only at the section level).
					{ level: 'dm-only' };
		} else if (level === 'player-visible') {
			sections[section.id] = { level: 'player-visible' };
		} else {
			sections[section.id] = { level: 'dm-only' };
		}
	}
	return {
		entityType: 'handout',
		entityId: handout.id,
		// The handout entity is `shared` to its recipients: a non-recipient cannot see the entity at all.
		entity: { level: 'shared', sharedWith: handout.recipientActorIds },
		sections,
	};
}

/** Whether a section is visible to the actor under the handout's reveal-aware visibility metadata. */
function sectionVisible(
	meta: EntityVisibilityMetadata,
	section: HandoutSection,
	actor: Actor,
	permissions: PermissionState,
): boolean {
	return evaluateVisibility(meta, { sectionId: section.id }, actor, permissions).visible;
}

/**
 * SES-004 — project ONE handout for an actor. A non-recipient (or unknown actor, or hidden entity)
 * receives `{ kind: 'unavailable' }` with NO content. A recipient/DM receives the handout with only the
 * sections they may see.
 */
export function getHandoutForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
	handoutId: string,
): HandoutQueryResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'unavailable' };
	const handout = session.handouts[handoutId];
	if (!handout) return { kind: 'unavailable' };

	const meta = handoutVisibilityMetadata(handout);
	// Entity-level gate: a non-recipient (and any actor the entity rule denies) gets NOTHING.
	if (!evaluateVisibility(meta, {}, actor, permissions).visible) return { kind: 'unavailable' };

	const revealed = new Set(handout.revealedSectionIds);
	const sections: HandoutSectionView[] = [];
	for (const section of handout.sections) {
		if (!sectionVisible(meta, section, actor, permissions)) continue;
		sections.push({
			id: section.id,
			heading: section.heading,
			body: section.body,
			revealed: section.visibility === 'shared' ? revealed.has(section.id) : true,
		});
	}

	return {
		kind: 'available',
		id: handout.id,
		title: handout.title,
		sections,
		isRecipient: actor.role === 'dm' || handout.recipientActorIds.includes(actor.id),
		updatedAt: handout.updatedAt,
		revision: handout.revision,
	};
}

/**
 * SES-004 — the actor-filtered LIST of handouts. Returns ONLY the handouts the actor may see (a player
 * sees handouts delivered TO them; the DM sees all), each already section-filtered. Ordered by delivery
 * time (most recent last) then id for a deterministic list. A non-recipient's handouts are omitted
 * entirely (never appear in the list).
 */
export function getHandoutsForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): HandoutView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	return Object.values(session.handouts)
		.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)))
		.map((handout) => getHandoutForActor(session, permissions, actorId, handout.id))
		.filter((result): result is HandoutView => result.kind === 'available');
}

/** A delivery-history row as projected to the DM (who received what, when). */
export interface HandoutDeliveryView {
	handoutId: string;
	handoutTitle: string;
	delivery: HandoutDeliveryRecord;
}

/**
 * SES-004 — the durable DELIVERY HISTORY, DM-only. A non-DM receives an EMPTY list (fail closed): the
 * delivery log records WHO received WHAT and WHEN across all recipients, which is a DM audit surface. The
 * DM sees every delivery, ordered by delivery time then id (deterministic).
 */
export function getHandoutDeliveryHistory(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): HandoutDeliveryView[] {
	const actor = permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return [];
	const rows: HandoutDeliveryView[] = [];
	for (const handout of Object.values(session.handouts)) {
		for (const delivery of handout.deliveries) {
			rows.push({ handoutId: handout.id, handoutTitle: handout.title, delivery });
		}
	}
	return rows.sort((a, b) =>
		a.delivery.deliveredAt === b.delivery.deliveredAt
			? a.delivery.id.localeCompare(b.delivery.id)
			: a.delivery.deliveredAt.localeCompare(b.delivery.deliveredAt),
	);
}
