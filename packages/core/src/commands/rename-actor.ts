import { renameActorInputSchema } from '../schemas/commands';
import type { Actor } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor } from './helpers';

/**
 * Rename a participant actor — the display name the roster, the sidebar account block and every
 * player-facing view-model show for them. Two callers are allowed, and nobody else:
 *
 *   1. the actor renaming THEMSELVES (a DM naming their own seat, a player fixing a typo),
 *   2. the campaign-owner DM renaming any participant.
 *
 * The role is never touched here (that is `permission.assign-role`'s one job). The change is
 * durable through a `permission.rename-actor` op so a connected table picks the new name up on
 * the next replicated view-model.
 */
export function handleRenameActor(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(renameActorInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { targetActorId, displayName } = parsed.data;

	const target = state.permissions.actors[targetActorId];
	if (!target) {
		return reject(
			{ code: 'invalid-payload', message: `Actor ${targetActorId} is not a participant.` },
			state,
		);
	}
	if (target.id !== actor.id && actor.role !== 'dm') {
		return reject(
			{
				code: 'actor-not-authorized',
				message: 'Only the campaign owner (DM) may rename another participant.',
			},
			state,
		);
	}

	const previousDisplayName = target.displayName;
	if (previousDisplayName === displayName) {
		return { status: 'accepted', nextState: state, events: [], operationIds: [] };
	}

	const nextActor: Actor = { ...target, displayName };
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'permission-actor',
		entityId: target.id,
		opType: 'permission.rename-actor',
		path: `actors/${target.id}/displayName`,
		value: { actorId: target.id, displayName, previousDisplayName },
	});
	const events: CoreEvent[] = [
		{
			kind: 'permission.actor-renamed',
			targetActorId: target.id,
			displayName,
			previousDisplayName,
			actorId: actor.id,
		},
	];
	return {
		status: 'accepted',
		nextState: {
			...state,
			permissions: {
				...state.permissions,
				actors: { ...state.permissions.actors, [target.id]: nextActor },
			},
			sync: draft.log,
		},
		events,
		operationIds: [draft.op.id],
	};
}
