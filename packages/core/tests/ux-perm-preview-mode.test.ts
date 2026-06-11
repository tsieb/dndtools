import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	buildPermissionState,
	makeEnvironment,
} from '../src/testing';
import {
	dispatchCommand,
	getContentItemsForActor,
	isPreviewActorId,
	parsePreviewParam,
	permissionsWithPreviewActors,
	previewBannerModel,
	resolvePreviewActor,
	PREVIEW_OBSERVER_ACTOR_ID,
	PREVIEW_PLAYER_ACTOR_ID,
	type CommandResult,
	type CoreStateSlice,
	type PermissionGrant,
} from '../src';

/**
 * UX-PERM-006 — "Preview as player / observer": the core actor-resolution side.
 *
 * The preview renders through the SAME actor-filtered queries a real player would use — these tests
 * prove the resolution is fail-closed (unknown/non-player specifics collapse to the generic
 * zero-grant actor; `dm` is never previewable), the permission projection is pure and strips any
 * grant addressed to a reserved id, and the URL parameter is a strict two-role allowlist.
 */

const env = makeEnvironment();

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`rejected: ${result.rejection.message}`);
	return result;
}

describe('parsePreviewParam', () => {
	it('accepts exactly the two preview roles', () => {
		expect(parsePreviewParam('player')).toBe('player');
		expect(parsePreviewParam('observer')).toBe('observer');
	});

	it('fails closed on anything else — dm, casing variants, empty, null', () => {
		for (const value of ['dm', 'DM', 'Player', 'OBSERVER', '', 'admin', null, undefined]) {
			expect(parsePreviewParam(value)).toBeNull();
		}
	});
});

describe('resolvePreviewActor', () => {
	const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

	it('resolves the generic zero-grant actors when no specific player is chosen', () => {
		expect(resolvePreviewActor(permissions, { role: 'player' })).toEqual({
			role: 'player',
			actorId: PREVIEW_PLAYER_ACTOR_ID,
			label: 'Player',
			specific: false,
		});
		expect(resolvePreviewActor(permissions, { role: 'observer' })).toEqual({
			role: 'observer',
			actorId: PREVIEW_OBSERVER_ACTOR_ID,
			label: 'Observer',
			specific: false,
		});
	});

	it('emulates a specific connected player by exact id (AC3)', () => {
		const resolved = resolvePreviewActor(permissions, {
			role: 'player',
			playerActorId: PLAYER_ACTOR.id,
		});
		expect(resolved).toEqual({
			role: 'player',
			actorId: PLAYER_ACTOR.id,
			label: 'Test Player (Player)',
			specific: true,
		});
	});

	it('fails closed: unknown, DM, observer, or reserved ids collapse to the generic actor', () => {
		for (const playerActorId of [
			'actor-nobody',
			DM_ACTOR.id,
			OBSERVER_ACTOR.id,
			PREVIEW_PLAYER_ACTOR_ID,
		]) {
			const resolved = resolvePreviewActor(permissions, { role: 'player', playerActorId });
			expect(resolved.actorId).toBe(PREVIEW_PLAYER_ACTOR_ID);
			expect(resolved.specific).toBe(false);
		}
	});

	it('never resolves a dm preview: an unknown role coerces to the least-visible observer', () => {
		const resolved = resolvePreviewActor(permissions, {
			role: 'dm' as unknown as 'player',
		});
		expect(resolved.actorId).toBe(PREVIEW_OBSERVER_ACTOR_ID);
		expect(resolved.role).toBe('observer');
	});
});

describe('permissionsWithPreviewActors', () => {
	it('adds the two reserved zero-grant actors without mutating the input (pure)', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const before = JSON.stringify(permissions);
		const projected = permissionsWithPreviewActors(permissions);
		expect(JSON.stringify(permissions)).toBe(before);
		expect(projected.actors[PREVIEW_PLAYER_ACTOR_ID]).toMatchObject({ role: 'player' });
		expect(projected.actors[PREVIEW_OBSERVER_ACTOR_ID]).toMatchObject({ role: 'observer' });
		expect(isPreviewActorId(PREVIEW_PLAYER_ACTOR_ID)).toBe(true);
		expect(isPreviewActorId(PLAYER_ACTOR.id)).toBe(false);
	});

	it('strips any grant addressed to a reserved preview id (no smuggled shared content)', () => {
		const hostile: PermissionGrant = {
			id: 'grant-hostile',
			entityType: 'content-item',
			entityId: 'item-secret',
			playerActorId: PREVIEW_PLAYER_ACTOR_ID,
			capabilitySet: 'viewer',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-01T00:00:00.000Z',
			expiresAt: null,
		};
		const legit: PermissionGrant = { ...hostile, id: 'grant-ok', playerActorId: PLAYER_ACTOR.id };
		const permissions = {
			...buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
			grants: [hostile, legit],
		};
		const projected = permissionsWithPreviewActors(permissions);
		expect(projected.grants.map((grant) => grant.id)).toEqual(['grant-ok']);
	});

	it('replaces a squatting persisted record on a reserved id with the canonical generic actor', () => {
		const squatter = {
			id: PREVIEW_PLAYER_ACTOR_ID,
			role: 'dm' as const,
			displayName: 'Impostor',
		};
		const permissions = buildPermissionState(DM_ACTOR, squatter);
		const projected = permissionsWithPreviewActors(permissions);
		expect(projected.actors[PREVIEW_PLAYER_ACTOR_ID]).toMatchObject({
			role: 'player',
			displayName: 'Player (preview)',
		});
	});
});

describe('generic preview actor sees exactly the player-visible surface (AC1)', () => {
	it('player-visible content present; dm-only and undelivered shared content absent', () => {
		let state: CoreStateSlice = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const titles = [
			['Public Lore', 'player-visible'],
			['Forbidden Plot', 'dm-only'],
			['Sealed Orders', 'shared'],
		] as const;
		for (const [title, visibility] of titles) {
			state = accept(
				dispatchCommand(state, env, {
					type: 'content.create-item',
					actorId: DM_ACTOR.id,
					payload: { kind: 'note', title, body: 'Body.', visibility },
				}),
			).nextState;
		}
		const projected = permissionsWithPreviewActors(state.permissions);
		const visible = getContentItemsForActor(state.content, projected, PREVIEW_PLAYER_ACTOR_ID);
		expect(visible.map((item) => item.title)).toEqual(['Public Lore']);
		// And the serialized result never carries the hidden titles (hard no-leak).
		const wire = JSON.stringify(visible);
		expect(wire).not.toContain('Forbidden Plot');
		expect(wire).not.toContain('Sealed Orders');
	});
});

describe('previewBannerModel', () => {
	it('produces the persistent banner copy + the documented exit shortcut', () => {
		const model = previewBannerModel({
			role: 'player',
			actorId: PREVIEW_PLAYER_ACTOR_ID,
			label: 'Player',
			specific: false,
		});
		expect(model.title).toBe('Previewing as: Player');
		expect(model.subtitle).toBe('You cannot make changes in this mode');
		expect(model.exitLabel).toBe('Exit preview');
		expect(model.ariaKeyShortcuts).toBe('Shift+Escape');
		expect(model.announcement).toContain('all editing is disabled');
	});
});
