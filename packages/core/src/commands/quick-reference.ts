import { pinQuickReferenceInputSchema, unpinQuickReferenceInputSchema } from '../schemas/commands';
import type { QuickReferencePanel } from '../state/session-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * SES-007 — the QUICK-REFERENCE PANEL commands (Architecture Contract 1 / Contract 3 / Contract 4).
 *
 * The DM CREATES, PINS, and uses quick-reference panels for VISIBLE notes, stat blocks, rules snippets,
 * open threads, and session context. The architecture invariants this slice upholds:
 *
 *   - DM-only (SES-007 is dm-only). Only the DM may pin/unpin; a non-DM is rejected fail closed.
 *   - Panels reference content BY REFERENCE (a target id), never a content copy (Contract 4 link/embed).
 *     The actor-filtered read resolves each reference against the LIVE target, so a pinned reference to a
 *     now-hidden/deleted target degrades to an unavailable/empty state — no leak (resolved in the read).
 *   - DURABLE PIN STATE: pins live in {@link SessionState.quickReferencePanels} and survive route changes
 *     and reloads (SES-007 AC1). Pin order is stable (monotonic `order`).
 *
 * Pure Processing-Core policy: the pin/unpin reducers are deterministic; the durable write is an op-log
 * entry; the GUI dispatches the intent and renders the actor-filtered read (never touches storage).
 */

const SESSION_ENTITY_ID = 'session-default';

/** The next monotonic pin order (max existing + 1, or 0 for the first pin). Keeps pins stably ordered. */
function nextPinOrder(state: CoreStateSlice): number {
	const orders = Object.values(state.session.quickReferencePanels).map((panel) => panel.order);
	return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

export function handlePinQuickReference(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(pinQuickReferenceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	// A `session-context` panel carries no target; every other kind MUST reference a target id (fail
	// closed: a content/stat-block/thread panel with no target would be meaningless and unresolvable).
	if (input.kind !== 'session-context' && !input.targetId) {
		return reject(
			{
				code: 'invalid-payload',
				message: `A ${input.kind} quick-reference panel requires a target id.`,
			},
			state,
		);
	}

	const panelId = env.ids();
	const now = env.clock();
	const panel: QuickReferencePanel = {
		id: panelId,
		kind: input.kind,
		label: input.label,
		targetId: input.kind === 'session-context' ? null : input.targetId,
		order: nextPinOrder(state),
		createdBy: actor.id,
		createdAt: now,
		revision: 1,
	};
	const nextSession = {
		...state.session,
		quickReferencePanels: { ...state.session.quickReferencePanels, [panelId]: panel },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.pin-quick-reference',
		path: `quickReferencePanels/${panelId}`,
		// The op records the REFERENCE (kind + target id + order), never the target's content.
		value: { panelId, kind: panel.kind, targetId: panel.targetId, order: panel.order },
		beforeRevision: 0,
		afterRevision: panel.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.quick-reference-pinned',
				panelId,
				kind_: panel.kind,
				targetId: panel.targetId,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleUnpinQuickReference(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(unpinQuickReferenceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const panel = state.session.quickReferencePanels[parsed.data.panelId];
	if (!panel) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Quick-reference panel ${parsed.data.panelId} does not exist.`,
			},
			state,
		);
	}

	const nextPanels = { ...state.session.quickReferencePanels };
	delete nextPanels[panel.id];
	const nextSession = { ...state.session, quickReferencePanels: nextPanels };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.unpin-quick-reference',
		path: `quickReferencePanels/${panel.id}`,
		value: { panelId: panel.id },
		beforeRevision: panel.revision,
		afterRevision: panel.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.quick-reference-unpinned',
				panelId: panel.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
