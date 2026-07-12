import { hasDmAuthority } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type {
	HandoutDeliveryRecord,
	HandoutKind,
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
 *   - REVOCATION / SEALING (COLLAB-007): a recipient the DM has REVOKED — and who does NOT hold explicit
 *     PERSISTENT access — is SEALED: the read returns `{ kind: 'unavailable' }` to them, exactly as if
 *     they were never a recipient (reusing the COLLAB-010/014 seal disposition; no content, no leak). A
 *     persistent recipient keeps the handout despite revocation. The DM always sees the handout.
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
	/** COLLAB-007 — the handout content kind (handout/image/note/map-fragment/cipher/rumor). */
	handoutKind: HandoutKind;
	title: string;
	sections: HandoutSectionView[];
	/** Whether the viewer is a recipient of this handout (the DM is treated as always able to see it). */
	isRecipient: boolean;
	/** COLLAB-007 — whether THIS recipient has acknowledged receipt (always false for the DM). */
	acknowledged: boolean;
	/**
	 * COLLAB-007 — whether the viewer holds PERSISTENT access (the handout survives revocation/session end).
	 * True for the DM; for a recipient, true when they are in `persistentRecipientActorIds`.
	 */
	persistent: boolean;
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

/** Whether a recipient holds PERSISTENT access (the handout survives revocation). The DM always does. */
export function handoutRecipientPersistent(handout: SessionHandout, actor: Actor): boolean {
	if (hasDmAuthority(actor.role)) return true;
	return (handout.persistentRecipientActorIds ?? []).includes(actor.id);
}

/**
 * COLLAB-007 — whether a recipient's access to a handout is SEALED (revoked and not persistent). A sealed
 * recipient is treated exactly like a non-recipient by the actor-filtered read: the handout is unavailable
 * to them with no content leak. The DM is never sealed; a persistent recipient is never sealed.
 */
export function handoutRecipientSealed(handout: SessionHandout, actor: Actor): boolean {
	if (hasDmAuthority(actor.role)) return false;
	if (handoutRecipientPersistent(handout, actor)) return false;
	return (handout.revocations ?? []).some((revocation) => revocation.recipientActorId === actor.id);
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

	// COLLAB-007 — REVOCATION/SEAL gate first: a revoked, non-persistent recipient is sealed and receives
	// NOTHING (indistinguishable from a non-recipient — no content, no leak).
	if (handoutRecipientSealed(handout, actor)) return { kind: 'unavailable' };

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

	const acknowledged =
		!hasDmAuthority(actor.role) &&
		(handout.acknowledgements ?? []).some((ack) => ack.recipientActorId === actor.id);

	return {
		kind: 'available',
		id: handout.id,
		handoutKind: handout.kind ?? 'handout',
		title: handout.title,
		sections,
		isRecipient: hasDmAuthority(actor.role) || handout.recipientActorIds.includes(actor.id),
		acknowledged,
		persistent: handoutRecipientPersistent(handout, actor),
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
	if (!actor || !hasDmAuthority(actor.role)) return [];
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

/** COLLAB-007 — per-recipient delivery/ack/revocation status for the DM (delivered/opened/revoked). */
export interface HandoutRecipientStatus {
	recipientActorId: string;
	/** Whether the recipient confirmed RECEIPT (the "opened" status, when supported — COLLAB-007 AC1). */
	acknowledged: boolean;
	acknowledgedAt: string | null;
	/** Whether the DM has REVOKED this recipient's access. */
	revoked: boolean;
	revokedAt: string | null;
	/** Whether this recipient holds PERSISTENT access (keeps the handout despite revocation/session end). */
	persistent: boolean;
	/** Whether the recipient's access is currently SEALED (revoked AND not persistent). */
	sealed: boolean;
}

/** COLLAB-007 — the full DM status surface for one handout: kind, recipients, and their ack/revoke state. */
export interface HandoutStatusView {
	handoutId: string;
	handoutKind: HandoutKind;
	title: string;
	recipients: HandoutRecipientStatus[];
}

/**
 * COLLAB-007 — the DM-only HANDOUT STATUS surface: for each handout, the per-recipient delivered/opened
 * (acknowledged)/revoked/sealed state (AC1 "the DM sees delivered/opened status"). A non-DM receives an
 * EMPTY list (fail closed — this is a DM audit surface). Deterministic ordering (handout createdAt then id,
 * recipient id).
 */
export function getHandoutStatusForDm(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): HandoutStatusView[] {
	const actor = permissions.actors[actorId];
	if (!actor || !hasDmAuthority(actor.role)) return [];
	return Object.values(session.handouts)
		.sort((a, b) =>
			a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
		)
		.map((handout) => {
			const ackByRecipient = new Map(
				(handout.acknowledgements ?? []).map((ack) => [ack.recipientActorId, ack]),
			);
			const revokeByRecipient = new Map(
				(handout.revocations ?? []).map((revocation) => [revocation.recipientActorId, revocation]),
			);
			const persistent = new Set(handout.persistentRecipientActorIds ?? []);
			const recipients: HandoutRecipientStatus[] = [...handout.recipientActorIds]
				.sort()
				.map((recipientActorId) => {
					const ack = ackByRecipient.get(recipientActorId);
					const revocation = revokeByRecipient.get(recipientActorId);
					const isPersistent = persistent.has(recipientActorId);
					return {
						recipientActorId,
						acknowledged: !!ack,
						acknowledgedAt: ack?.acknowledgedAt ?? null,
						revoked: !!revocation,
						revokedAt: revocation?.revokedAt ?? null,
						persistent: isPersistent,
						sealed: !!revocation && !isPersistent,
					};
				});
			return {
				handoutId: handout.id,
				handoutKind: handout.kind ?? 'handout',
				title: handout.title,
				recipients,
			};
		});
}
