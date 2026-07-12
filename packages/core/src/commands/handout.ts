import {
	acknowledgeHandoutInputSchema,
	deliverHandoutInputSchema,
	revealHandoutSectionInputSchema,
	revokeHandoutInputSchema,
} from '../schemas/commands';
import type {
	HandoutAcknowledgement,
	HandoutDeliveryRecord,
	HandoutRevocation,
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
import { resolveDeliveryTarget } from '../collab/player-groups';
import { hasDmAuthority } from '../state/permission-state';
import { handoutRecipientSealed } from '../queries/handout-query';
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

	// COLLAB-012 — resolve explicit recipients + Player Group ids to the flat set of INDIVIDUAL recipients.
	// Group resolution is delivery-only (it expands the recipient list; it confers no permission). An
	// explicitly-named recipient that is the DM / unknown still rejects the whole delivery (fail closed);
	// group members that are not deliverable are silently skipped by the resolver. The delivery is recorded
	// against the resolved individual recipients, so a later membership change never retroactively delivers.
	for (const recipientId of input.recipientActorIds) {
		const recipient = state.permissions.actors[recipientId];
		// A DM / co-DM already sees everything (dm-authority read) — they are never a delivery
		// recipient. Fail closed on any elevated or unknown id (COLLAB-012).
		if (!recipient || hasDmAuthority(recipient.role)) {
			return reject(
				{
					code: 'invalid-payload',
					message: `Handout recipient ${recipientId} must be a registered player or observer.`,
				},
				state,
			);
		}
	}
	const resolved = resolveDeliveryTarget(
		{ recipientActorIds: input.recipientActorIds, groupIds: input.groupIds },
		state.session.playerGroups,
		state.permissions,
	);
	if (resolved.unknownGroupIds.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Unknown player group(s): ${resolved.unknownGroupIds.join(', ')}.`,
			},
			state,
		);
	}
	const deliveryRecipientIds = resolved.recipientActorIds;
	if (deliveryRecipientIds.length === 0) {
		return reject(
			{ code: 'invalid-payload', message: 'Select at least one recipient or a non-empty player group.' },
			state,
		);
	}
	// Persistent recipients must be a subset of the resolved recipients (fail closed: cannot grant
	// persistence to a non-recipient).
	for (const persistentId of input.persistentRecipientActorIds) {
		if (!deliveryRecipientIds.includes(persistentId)) {
			return reject(
				{
					code: 'invalid-payload',
					message: `Persistent recipient ${persistentId} must be among the delivery recipients.`,
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

	// The recipient set is the UNION of any prior recipients and the resolved new ones (a re-delivery adds
	// to, never silently drops, the audience). Deduped.
	const recipientActorIds = [
		...new Set([...(previous?.recipientActorIds ?? []), ...deliveryRecipientIds]),
	];
	// Persistent recipients accumulate (a re-delivery can grant persistence; it never silently revokes it).
	const persistentRecipientActorIds = [
		...new Set([
			...(previous?.persistentRecipientActorIds ?? []),
			...input.persistentRecipientActorIds,
		]),
	];
	// Re-delivering to a previously-revoked recipient CLEARS their revocation (they are a recipient again).
	const revocations = (previous?.revocations ?? []).filter(
		(revocation) => !deliveryRecipientIds.includes(revocation.recipientActorId),
	);

	// Ensure a handout widget exists on the scene (by reference).
	const ensured = ensureHandoutWidget(sceneResult, env, handoutId);
	const widgetScene = ensured.created ? bumpRevision(ensured.scene, env) : ensured.scene;
	const nextScenes = ensured.created
		? withScene(state.scenes, sceneResult.id, () => widgetScene)
		: state.scenes;

	const now = env.clock();
	const deliveryStatus: PlayerViewDeliveryStatus =
		input.connectionState === 'offline' ? 'queued' : 'delivered';

	// Append ONE delivery record per RESOLVED recipient this delivery targets (history grows, never
	// overwrites). Recipients resolved via a group are recorded as individual delivery records.
	const newDeliveries: HandoutDeliveryRecord[] = deliveryRecipientIds.map((recipientId) => ({
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
		kind: input.kind,
		title: input.title,
		sections,
		revealedSectionIds,
		recipientActorIds,
		persistentRecipientActorIds,
		deliveries: [...(previous?.deliveries ?? []), ...newDeliveries],
		acknowledgements: previous?.acknowledgements ?? [],
		revocations,
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
			kind: input.kind,
			recipientActorIds: deliveryRecipientIds,
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
		recipientActorIds: deliveryRecipientIds,
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

/**
 * COLLAB-007 — a RECIPIENT acknowledges RECEIPT of a handout (the delivered/opened confirmation). Only a
 * current recipient may acknowledge their OWN handout, and only while their access is NOT sealed (a
 * revoked, non-persistent recipient can no longer acknowledge — fail closed, no leak that the handout
 * exists). Re-acknowledging refreshes the timestamp (idempotent latest-wins). The DM does not acknowledge.
 */
export function handleAcknowledgeHandout(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (hasDmAuthority(actor.role)) {
		return reject(
			{ code: 'invalid-state', message: 'The DM does not acknowledge handout delivery.' },
			state,
		);
	}

	const parsed = parseInput(acknowledgeHandoutInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const handout = state.session.handouts[input.handoutId];
	// Fail closed: a non-recipient (or sealed recipient) gets the SAME `not-found` as a missing handout, so
	// acknowledgement cannot be used to probe a handout's existence.
	if (
		!handout ||
		!handout.recipientActorIds.includes(actor.id) ||
		handoutRecipientSealed(handout, actor)
	) {
		return reject(
			{ code: 'content-item-not-found', message: `Handout ${input.handoutId} is not available to you.` },
			state,
		);
	}

	const now = env.clock();
	const acknowledgements: HandoutAcknowledgement[] = [
		...handout.acknowledgements.filter((ack) => ack.recipientActorId !== actor.id),
		{ recipientActorId: actor.id, acknowledgedAt: now },
	];
	const nextHandout: SessionHandout = {
		...handout,
		acknowledgements,
		updatedAt: now,
		revision: handout.revision + 1,
	};
	const nextSession = {
		...state.session,
		handouts: { ...state.session.handouts, [handout.id]: nextHandout },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.acknowledge-handout',
		path: `handouts/${handout.id}/acknowledgements/${actor.id}`,
		value: { handoutId: handout.id, recipientActorId: actor.id },
		beforeRevision: handout.revision,
		afterRevision: nextHandout.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [{ kind: 'session.handout-acknowledged', handoutId: handout.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

/**
 * COLLAB-007 — the DM REVOKES a handout from recipients. A revoked recipient's access is SEALED: the
 * actor-filtered read returns the handout as unavailable to them (reusing the COLLAB seal model) UNLESS
 * they hold explicit PERSISTENT access (the COLLAB-010 persistent-grant exception). DM-only.
 *
 * An empty recipient list revokes ALL non-persistent recipients (revoke-the-whole-handout). Revoking a
 * persistent recipient is recorded but does not seal them (their persistent grant overrides). The op
 * carries only the revoked recipient ids (the audit) — never recipient-facing content.
 */
export function handleRevokeHandout(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(revokeHandoutInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const handout = state.session.handouts[input.handoutId];
	if (!handout) {
		return reject(
			{ code: 'content-item-not-found', message: `Handout ${input.handoutId} does not exist.` },
			state,
		);
	}

	const persistent = new Set(handout.persistentRecipientActorIds);
	// Target set: the explicit recipients (that are actually recipients of this handout), or — when empty —
	// every current recipient. Persistent recipients can still be recorded as revoked; the read keeps their
	// access (so a later persistence removal would re-seal cleanly).
	const explicit = input.recipientActorIds.filter((id) => handout.recipientActorIds.includes(id));
	const targets =
		input.recipientActorIds.length === 0 ? [...handout.recipientActorIds] : explicit;
	// Only record NEW revocations (idempotent: an already-revoked recipient is not duplicated).
	const alreadyRevoked = new Set(handout.revocations.map((r) => r.recipientActorId));
	const now = env.clock();
	const newRevocations: HandoutRevocation[] = targets
		.filter((id) => !alreadyRevoked.has(id))
		.map((recipientActorId) => ({ recipientActorId, revokedBy: actor.id, revokedAt: now }));

	if (newRevocations.length === 0) {
		// No-op (every target already revoked / none valid): idempotent, no revision/op churn.
		return { status: 'accepted', nextState: state, events: [], operationIds: [] };
	}

	const nextHandout: SessionHandout = {
		...handout,
		revocations: [...handout.revocations, ...newRevocations],
		updatedAt: now,
		revision: handout.revision + 1,
	};
	const nextSession = {
		...state.session,
		handouts: { ...state.session.handouts, [handout.id]: nextHandout },
	};
	const deliveryStatus: PlayerViewDeliveryStatus =
		input.connectionState === 'offline' ? 'queued' : 'delivered';
	const revokedIds = newRevocations.map((revocation) => revocation.recipientActorId);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.revoke-handout',
		path: `handouts/${handout.id}/revocations`,
		value: {
			handoutId: handout.id,
			recipientActorIds: revokedIds,
			// Recipients whose persistent grant overrides the seal (recorded for the audit; still readable).
			persistentOverrides: revokedIds.filter((id) => persistent.has(id)),
			deliveryStatus,
		},
		beforeRevision: handout.revision,
		afterRevision: nextHandout.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.handout-revoked',
				handoutId: handout.id,
				recipientActorIds: revokedIds,
				deliveryStatus,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
