import { describe, expect, it } from 'vitest';
import type { CharacterView, PermissionState, SessionState } from '@dndtools/core';
import {
	OWNER_ANY,
	OWNER_NONE,
	TAG_ANY,
	buildRosterEntries,
	gridTargetIndex,
	lastPlayedIndex,
	levelOf,
	matchesRosterFilter,
	ownersOf,
	rosterFacets,
	serializeTags,
	tagsOf,
	type RosterFilter,
} from './roster';

type RosterSession = Pick<SessionState, 'archives' | 'workflow' | 'combat'>;

function view(partial: Partial<CharacterView> & { id: string }): CharacterView {
	return {
		kind: 'pc',
		name: partial.id,
		visibility: 'shared',
		abilityScores: {},
		attributes: {},
		attacks: [],
		combat: { hp: 10, maxHp: 10, ac: 12, tempHp: 0, conditions: [] },
		data: {},
		proficiencies: {},
		resources: [],
		updatedAt: '2026-09-01T00:00:00.000Z',
		revision: 1,
		...partial,
	} as unknown as CharacterView;
}

const grant = (entityId: string, playerActorId: string, capabilitySet: string) => ({
	id: `${entityId}-${playerActorId}-${capabilitySet}`,
	entityType: 'character',
	entityId,
	playerActorId,
	capabilitySet,
	createdBy: 'dm',
	createdAt: '2026-09-01T00:00:00.000Z',
});

const permissions = {
	actors: {
		dm: { id: 'dm', role: 'dm', displayName: 'Game Master' },
		robin: { id: 'robin', role: 'player', displayName: 'Robin' },
		ash: { id: 'ash', role: 'player', displayName: 'Ash' },
		watcher: { id: 'watcher', role: 'observer', displayName: 'Watcher' },
	},
	grants: [
		grant('sera', 'robin', 'owner'),
		grant('sera', 'ash', 'viewer'),
		grant('tor', 'ash', 'owner'),
		grant('tor', 'robin', 'owner'),
	],
} as unknown as PermissionState;

const archive = (
	id: string,
	archivedAt: string,
	characterIds: string[],
	recapIds: string[] = [],
) => ({
	id,
	archivedAt,
	combat: {
		status: 'ended',
		combatants: Object.fromEntries(
			characterIds.map((characterId, i) => [`${id}-c${i}`, { characterId }]),
		),
	},
	...(recapIds.length > 0
		? {
				recap: {
					changes: recapIds.map((entityId) => ({ entityType: 'character', entityId, label: '' })),
				},
			}
		: {}),
});

const idleSession = (archives: ReturnType<typeof archive>[]): RosterSession =>
	({
		workflow: 'idle',
		combat: { status: 'idle', combatants: {} },
		archives: Object.fromEntries(archives.map((a) => [a.id, a])),
	}) as unknown as RosterSession;

describe('roster derivations (RC-CHR-5.3)', () => {
	it('reads the level from data.level, defaulting a PC to 1 and other kinds to none', () => {
		expect(levelOf(view({ id: 'a', data: { level: 3 } }))).toBe(3);
		expect(levelOf(view({ id: 'b', data: { level: '4' } }))).toBe(4);
		expect(levelOf(view({ id: 'c' }))).toBe(1);
		expect(levelOf(view({ id: 'd', data: { level: 'garbage' } }))).toBe(1);
		expect(levelOf(view({ id: 'e', kind: 'npc' }))).toBeNull();
		expect(levelOf(view({ id: 'f', kind: 'monster', data: { level: 5 } }))).toBe(5);
	});

	it('reads tags from the comma-separated data.tags string or an imported array', () => {
		expect(tagsOf(view({ id: 'a', data: { tags: 'boss, Undead,  BOSS ,' } }))).toEqual([
			'boss',
			'Undead',
		]);
		expect(tagsOf(view({ id: 'b', data: { tags: ['coast', 7, ' coast', 'ally'] } }))).toEqual([
			'coast',
			'ally',
		]);
		expect(tagsOf(view({ id: 'c' }))).toEqual([]);
		expect(serializeTags(['boss', ' undead ', 'Boss'])).toBe('boss, undead');
		expect(tagsOf(view({ id: 'd', data: { tags: serializeTags([]) } }))).toEqual([]);
	});

	it('names only players holding a live owner grant, never the DM or a viewer', () => {
		expect(ownersOf(permissions, 'sera')).toEqual([{ id: 'robin', name: 'Robin' }]);
		expect(ownersOf(permissions, 'tor').map((o) => o.name)).toEqual(['Ash', 'Robin']);
		expect(ownersOf(permissions, 'mira')).toEqual([]);
	});

	it('keeps the newest session a character appeared in, and marks a live combatant as in play', () => {
		const archives = [
			archive('a1', '2026-09-01T20:00:00.000Z', ['sera', 'tor']),
			archive('a2', '2026-09-05T20:00:00.000Z', [], ['sera']),
			archive('a0', '2026-08-20T20:00:00.000Z', ['tor']),
		];
		const index = lastPlayedIndex(idleSession(archives));
		expect(index.get('sera')).toEqual({ live: false, at: '2026-09-05T20:00:00.000Z' });
		expect(index.get('tor')).toEqual({ live: false, at: '2026-09-01T20:00:00.000Z' });
		expect(index.has('mira')).toBe(false);

		const live = {
			...idleSession(archives),
			workflow: 'active',
			combat: {
				status: 'running',
				combatants: { x: { characterId: 'tor' }, y: { characterId: null } },
			},
		} as unknown as RosterSession;
		expect(lastPlayedIndex(live).get('tor')).toEqual({ live: true });
		// Combat that is not running (set up but not started, or ended) is not "in play".
		const staged = { ...live, combat: { ...live.combat, status: 'ended' } } as RosterSession;
		expect(lastPlayedIndex(staged).get('tor')).toEqual({
			live: false,
			at: '2026-09-01T20:00:00.000Z',
		});
	});

	it('filters by kind, owner and tag together', () => {
		const entries = buildRosterEntries(
			[
				view({ id: 'sera', data: { tags: 'scout' } }),
				view({ id: 'tor' }),
				view({ id: 'mira', kind: 'npc', data: { tags: 'Ferry, ally' } }),
				view({ id: 'pip', kind: 'sidekick' }),
				view({ id: 'king', kind: 'monster', data: { tags: 'boss' } }),
			],
			permissions,
			idleSession([]),
		);
		const pick = (filter: Partial<RosterFilter>) =>
			entries
				.filter((entry) =>
					matchesRosterFilter(entry, { kind: 'all', owner: OWNER_ANY, tag: TAG_ANY, ...filter }),
				)
				.map((entry) => entry.view.id);

		expect(pick({})).toEqual(['sera', 'tor', 'mira', 'pip', 'king']);
		expect(pick({ kind: 'npc' })).toEqual(['mira', 'pip']);
		expect(pick({ owner: 'ash' })).toEqual(['tor']);
		expect(pick({ owner: OWNER_NONE })).toEqual(['mira', 'pip', 'king']);
		expect(pick({ tag: 'ferry' })).toEqual(['mira']);
		expect(pick({ kind: 'pc', tag: 'boss' })).toEqual([]);

		const facets = rosterFacets(entries);
		expect(facets.owners.map((o) => o.id)).toEqual(['ash', 'robin']);
		expect(facets.tags).toEqual(['ally', 'boss', 'Ferry', 'scout']);
	});

	it('moves through a wrapped grid by column and stops at the edges', () => {
		// 7 cards in 3 columns:  0 1 2 / 3 4 5 / 6
		expect(gridTargetIndex('ArrowRight', 0, 7, 3)).toBe(1);
		expect(gridTargetIndex('ArrowRight', 6, 7, 3)).toBeNull();
		expect(gridTargetIndex('ArrowLeft', 0, 7, 3)).toBeNull();
		expect(gridTargetIndex('ArrowDown', 2, 7, 3)).toBe(5);
		expect(gridTargetIndex('ArrowDown', 5, 7, 3)).toBeNull();
		expect(gridTargetIndex('ArrowUp', 4, 7, 3)).toBe(1);
		expect(gridTargetIndex('ArrowUp', 1, 7, 3)).toBeNull();
		expect(gridTargetIndex('Home', 4, 7, 3)).toBe(0);
		expect(gridTargetIndex('End', 4, 7, 3)).toBe(6);
		expect(gridTargetIndex('End', 6, 7, 3)).toBeNull();
		// A one-column phone layout: Down is simply "next".
		expect(gridTargetIndex('ArrowDown', 0, 3, 1)).toBe(1);
		expect(gridTargetIndex('Enter', 0, 3, 1)).toBeNull();
		expect(gridTargetIndex('ArrowRight', 0, 0, 1)).toBeNull();
	});
});
