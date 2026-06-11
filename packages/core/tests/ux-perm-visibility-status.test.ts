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
	evaluateVisibilityChangeConflict,
	getContentItemDetailForActor,
	resolveContentVisibilityBadge,
	resolveContentVisibilityToggle,
	resolveSectionVisibilityToggle,
	visibilityAnnouncement,
	CONTENT_ITEM_ENTITY_TYPE,
	VISIBILITY_TOGGLE_SEGMENTS,
	type CommandResult,
	type CoreStateSlice,
	type PermissionGrant,
	type VisibilityLevel,
} from '../src';

/**
 * UX-PERM-001 / UX-PERM-007 — the DM visibility toggle + ambient badge read models.
 *
 * Both resolvers are DM-only DEFAULT-DENY choke points: a player/observer/unknown actor gets `null`
 * (no toggle, no badge — UX-PERM-001 AC3 / UX-PERM-007 AC3). The conflict evaluator fires the AC2
 * warning only for an actual `dm-only` change while ACTIVE grants exist. The section toggle backs
 * the AC4 path (section dm-only on a player-visible entity ⇒ entity visible, section absent).
 */

const env = makeEnvironment();

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`rejected: ${result.rejection.message}`);
	return result;
}

/** Build a state holding one note with the given visibility (and optional granular overrides). */
function stateWithNote(
	visibility: VisibilityLevel,
): { state: CoreStateSlice; itemId: string } {
	const initial = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const result = accept(
		dispatchCommand(initial, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Briefing', body: 'Body.', visibility },
		}),
	);
	const event = result.events[0] as { itemId: string };
	return { state: result.nextState, itemId: event.itemId };
}

function withSectionOverride(
	state: CoreStateSlice,
	itemId: string,
	sectionId: string,
	level: VisibilityLevel,
): CoreStateSlice {
	return accept(
		dispatchCommand(state, env, {
			type: 'content.set-section-visibility',
			actorId: DM_ACTOR.id,
			payload: { itemId, sectionId, rule: { level } },
		}),
	).nextState;
}

describe('UX-PERM-007 resolveContentVisibilityBadge', () => {
	it('is DM-only default-deny: null for player, observer, and unknown actors (AC3)', () => {
		const { state, itemId } = stateWithNote('player-visible');
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'actor-nobody']) {
			expect(
				resolveContentVisibilityBadge(state.content, state.permissions, actorId, itemId),
			).toBeNull();
		}
	});

	it('marks dm-only items with the emphasized "DM only" badge (AC1)', () => {
		const { state, itemId } = stateWithNote('dm-only');
		const badge = resolveContentVisibilityBadge(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			itemId,
		);
		expect(badge).toMatchObject({
			state: 'dm-only',
			label: 'DM only',
			ariaLabel: 'Visibility: Hidden from players',
			emphasized: true,
		});
	});

	it('renders the plain states without emphasis and without a tooltip', () => {
		for (const [level, label] of [
			['player-visible', 'Players'],
			['shared', 'Shared'],
		] as const) {
			const { state, itemId } = stateWithNote(level);
			const badge = resolveContentVisibilityBadge(
				state.content,
				state.permissions,
				DM_ACTOR.id,
				itemId,
			);
			expect(badge).toMatchObject({ state: level, label, emphasized: false });
			expect(badge?.tooltip).toBeUndefined();
		}
	});

	it('shows "Mixed" when a section override differs from the entity level (AC2)', () => {
		const { state, itemId } = stateWithNote('player-visible');
		const mixed = withSectionOverride(state, itemId, 'gm-secrets', 'dm-only');
		const badge = resolveContentVisibilityBadge(
			mixed.content,
			mixed.permissions,
			DM_ACTOR.id,
			itemId,
		);
		expect(badge?.state).toBe('mixed');
		expect(badge?.label).toBe('Mixed');
		expect(badge?.tooltip).toContain('different visibility');
	});

	it('does NOT show "Mixed" when overrides equal the entity level', () => {
		const { state, itemId } = stateWithNote('player-visible');
		const same = withSectionOverride(state, itemId, 'overview', 'player-visible');
		const badge = resolveContentVisibilityBadge(
			same.content,
			same.permissions,
			DM_ACTOR.id,
			itemId,
		);
		expect(badge?.state).toBe('player-visible');
	});

	it('returns null for an unknown or soft-deleted item (fail closed)', () => {
		const { state, itemId } = stateWithNote('player-visible');
		expect(
			resolveContentVisibilityBadge(state.content, state.permissions, DM_ACTOR.id, 'missing'),
		).toBeNull();
		const deleted = accept(
			dispatchCommand(state, env, {
				type: 'content.remove-item',
				actorId: DM_ACTOR.id,
				payload: { itemId },
			}),
		).nextState;
		expect(
			resolveContentVisibilityBadge(deleted.content, deleted.permissions, DM_ACTOR.id, itemId),
		).toBeNull();
	});
});

describe('UX-PERM-001 resolveContentVisibilityToggle / resolveSectionVisibilityToggle', () => {
	it('is DM-only default-deny: null for player, observer, and unknown actors (AC3)', () => {
		const { state, itemId } = stateWithNote('player-visible');
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'actor-nobody']) {
			expect(
				resolveContentVisibilityToggle(state.content, state.permissions, actorId, itemId),
			).toBeNull();
			expect(
				resolveSectionVisibilityToggle(state.content, state.permissions, actorId, itemId, 's1'),
			).toBeNull();
		}
	});

	it('always exposes the three canonical segments in canonical order (AC1)', () => {
		const { state, itemId } = stateWithNote('player-visible');
		const view = resolveContentVisibilityToggle(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			itemId,
		);
		expect(view?.segments.map((segment) => segment.level)).toEqual([
			'shared',
			'player-visible',
			'dm-only',
		]);
		// Each segment carries label + explanatory copy (icon + label, unmistakable states).
		for (const segment of view?.segments ?? []) {
			expect(segment.shortLabel.length).toBeGreaterThan(0);
			expect(segment.description.length).toBeGreaterThan(0);
		}
		expect(view?.current).toBe('player-visible');
		expect(view?.inherited).toBe(false);
	});

	it('section toggle reports the inherited entity level until an override exists', () => {
		const { state, itemId } = stateWithNote('player-visible');
		const inherited = resolveSectionVisibilityToggle(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			itemId,
			'gm-secrets',
		);
		expect(inherited).toMatchObject({ current: 'player-visible', inherited: true });
		const overridden = withSectionOverride(state, itemId, 'gm-secrets', 'dm-only');
		const own = resolveSectionVisibilityToggle(
			overridden.content,
			overridden.permissions,
			DM_ACTOR.id,
			itemId,
			'gm-secrets',
		);
		expect(own).toMatchObject({ current: 'dm-only', inherited: false });
	});

	it('AC4: a dm-only section on a player-visible entity stays absent from the player detail', () => {
		const { state, itemId } = stateWithNote('player-visible');
		const withHidden = withSectionOverride(state, itemId, 'gm-secrets', 'dm-only');
		const detail = getContentItemDetailForActor(
			withHidden.content,
			withHidden.permissions,
			PLAYER_ACTOR.id,
			itemId,
			['overview', 'gm-secrets'],
		);
		expect(detail.visible).toBe(true); // the entity itself remains visible…
		if (detail.visible) {
			expect(detail.visibleSectionIds).toEqual(['overview']); // …the dm-only section is absent
		}
	});

	it('announces the applied state in the canonical phrasing', () => {
		expect(visibilityAnnouncement('player-visible')).toBe(
			'Visibility set to: Players can see this',
		);
		expect(visibilityAnnouncement('dm-only')).toBe('Visibility set to: Hidden from players');
		expect(VISIBILITY_TOGGLE_SEGMENTS).toHaveLength(3);
	});
});

describe('UX-PERM-001 AC2 evaluateVisibilityChangeConflict', () => {
	const NOW = '2026-06-10T12:00:00.000Z';

	function grant(overrides: Partial<PermissionGrant>): PermissionGrant {
		return {
			id: 'grant-1',
			entityType: CONTENT_ITEM_ENTITY_TYPE,
			entityId: 'item-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-01T00:00:00.000Z',
			expiresAt: null,
			...overrides,
		};
	}

	it('warns BEFORE a dm-only change when an active grant exists on the entity', () => {
		const permissions = {
			...buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
			grants: [grant({})],
		};
		const conflict = evaluateVisibilityChangeConflict(
			permissions,
			CONTENT_ITEM_ENTITY_TYPE,
			'item-1',
			'dm-only',
			NOW,
		);
		expect(conflict).toMatchObject({
			activeGrantCount: 1,
			confirmLabel: 'Hide anyway and flag conflict',
			cancelLabel: 'Cancel',
		});
		expect(conflict?.message).toContain('active player access grants');
	});

	it('does not warn for non-dm-only targets, other entities, or expired grants', () => {
		const permissions = {
			...buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
			grants: [grant({})],
		};
		// Widening (or lateral) changes never warn.
		expect(
			evaluateVisibilityChangeConflict(
				permissions,
				CONTENT_ITEM_ENTITY_TYPE,
				'item-1',
				'player-visible',
				NOW,
			),
		).toBeNull();
		// A grant on a DIFFERENT entity is not a conflict.
		expect(
			evaluateVisibilityChangeConflict(
				permissions,
				CONTENT_ITEM_ENTITY_TYPE,
				'item-2',
				'dm-only',
				NOW,
			),
		).toBeNull();
		// An EXPIRED grant is inert (PERM-004): no warning.
		const expired = {
			...permissions,
			grants: [grant({ expiresAt: '2026-06-01T00:00:00.000Z' })],
		};
		expect(
			evaluateVisibilityChangeConflict(
				expired,
				CONTENT_ITEM_ENTITY_TYPE,
				'item-1',
				'dm-only',
				NOW,
			),
		).toBeNull();
	});
});
