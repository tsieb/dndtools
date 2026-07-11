import { assignRoleInputSchema } from '../schemas/commands';
import { countCoDmActors } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireCampaignOwner } from './helpers';

/**
 * PERM-011 (Co-DM) — assign a BASE ROLE to an existing participant actor.
 *
 * This is the ONE command that changes an actor's base role, and it is OWNER-scoped: only the
 * campaign-owner DM may run it (a co-DM has DM-grade authoring authority but can never administer the
 * permission model — including elevating themselves). Fail closed at every step:
 *
 *   1. requires the caller be the campaign-owner DM (co-DM / player / observer are rejected),
 *   2. requires the TARGET to be a known, non-owner actor — the owner's own `dm` row is untouchable
 *      here (ownership moves only through `permission.transfer-ownership`), and `dm` is not an
 *      assignable role (the schema already forbids it),
 *   3. when promoting to `co-dm`, enforces the caller's plan CO-DM SEAT LIMIT (`coDmSeatLimit`,
 *      0 on plans without co-DM seats) against the current co-DM headcount — so an over-seat or
 *      no-seat promotion is rejected with an honest message and can never be replayed in,
 *   4. mutates the durable actor role through a PURE reducer and appends a `permission.assign-role`
 *      sync operation (the op-growth signal the P2P host recomputes snapshots from, so a connected
 *      just-promoted co-DM receives their elevated view on the next frame).
 */

function permissionWithActor(permissions: PermissionState, actor: Actor): PermissionState {
	return { ...permissions, actors: { ...permissions.actors, [actor.id]: actor } };
}

export function handleAssignRole(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const ownerCheck = requireCampaignOwner(actor);
	if (ownerCheck) return reject(ownerCheck, state);

	const parsed = parseInput(assignRoleInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { targetActorId, role, coDmSeatLimit } = parsed.data;

	const target = state.permissions.actors[targetActorId];
	if (!target) {
		return reject(
			{ code: 'invalid-payload', message: `Actor ${targetActorId} is not a participant.` },
			state,
		);
	}

	// The campaign owner's own role is never reassigned here — that would silently drop ownership.
	// (Transferring ownership is a separate, explicit command.)
	if (target.role === 'dm') {
		return reject(
			{ code: 'invalid-state', message: 'The campaign owner’s role cannot be reassigned here.' },
			state,
		);
	}

	// No-op assignment: accept idempotently but do not churn the op-log.
	if (target.role === role) {
		return {
			status: 'accepted',
			nextState: state,
			events: [],
			operationIds: [],
		};
	}

	// Co-DM seat entitlement — fail closed. `coDmSeatLimit` is the caller's plan seats (0 without
	// them). A promotion is admitted only while the current co-DM headcount is below the limit.
	if (role === 'co-dm') {
		const seatsInUse = countCoDmActors(state.permissions);
		if (seatsInUse >= coDmSeatLimit) {
			const message =
				coDmSeatLimit <= 0
					? 'Your plan has no Co-DM seats. Upgrade to invite a Co-DM.'
					: `All ${coDmSeatLimit} Co-DM seat${coDmSeatLimit === 1 ? '' : 's'} on your plan ${
							coDmSeatLimit === 1 ? 'is' : 'are'
						} in use. Demote a Co-DM first.`;
			return reject({ code: 'invalid-state', message }, state);
		}
	}

	const previousRole = target.role;
	const nextActor: Actor = { ...target, role };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'permission-actor',
		entityId: target.id,
		opType: 'permission.assign-role',
		path: `actors/${target.id}/role`,
		value: { actorId: target.id, role, previousRole },
	});

	const events: CoreEvent[] = [
		{
			kind: 'permission.role-assigned',
			targetActorId: target.id,
			role,
			previousRole,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: {
			...state,
			permissions: permissionWithActor(state.permissions, nextActor),
			sync: draft.log,
		},
		events,
		operationIds: [draft.op.id],
	};
}
