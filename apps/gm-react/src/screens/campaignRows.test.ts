import { describe, expect, it } from 'vitest';
import type { ActorWikilinkTarget, TypedRelationEdge } from '@dndtools/core';
import { edgesTouching, mentionsOf, npcStoryHome } from './campaignRows';

function target(id: string, kind: string, storage: ActorWikilinkTarget['storage']) {
	return {
		id,
		entityId: id,
		kind,
		storage,
		route: `/route/${id}`,
		body: '',
		title: id,
		aliases: [],
		sections: [],
		source: 'local-markdown',
		available: true,
	} as ActorWikilinkTarget;
}

const candidates = new Map(
	[
		target('npc', 'character', 'character'),
		target('guild', 'faction', 'content'),
		target('cult', 'faction', 'content'),
		target('docks', 'poi', 'poi'),
		target('city', 'map', 'map'),
		target('note-a', 'note', 'content'),
		target('note-b', 'note', 'content'),
		target('other-npc', 'character', 'character'),
	].map((c) => [c.id, c]),
);

const edge = (sourceId: string, verb: string, targetId: string): TypedRelationEdge => ({
	sourceId,
	sourceTitle: sourceId,
	verb,
	targetId,
	targetTitle: targetId,
});

describe('RC-KNW-6.6 Story card reads', () => {
	it('keeps the edges with the entity at either end', () => {
		const edges = [
			edge('npc', 'leads', 'guild'),
			edge('cult', 'hunts', 'npc'),
			edge('a', 'x', 'b'),
		];
		expect(edgesTouching('npc', edges)).toEqual(edges.slice(0, 2));
		expect(edgesTouching('guild', edges)).toEqual([edges[0]]);
	});

	it('finds the NPC faction and place in either direction, preferring a place over a map', () => {
		expect(
			npcStoryHome(
				'npc',
				[
					edge('city', 'shelters', 'npc'),
					edge('npc', 'leads', 'guild'),
					edge('npc', 'works', 'docks'),
				],
				candidates,
			),
		).toEqual({ faction: 'guild', place: 'docks' });
		expect(npcStoryHome('npc', [edge('city', 'shelters', 'npc')], candidates)).toEqual({
			faction: null,
			place: 'city',
		});
		// An edge to another NPC or a plain note is neither.
		expect(
			npcStoryHome(
				'npc',
				[edge('npc', 'knows', 'other-npc'), edge('note-a', 'x', 'npc')],
				candidates,
			),
		).toEqual({ faction: null, place: null });
	});

	it('lists only note-backed mentions, newest edit first', () => {
		const updated: Record<string, string> = {
			'note-a': '2026-01-01T00:00:00Z',
			'note-b': '2026-02-01T00:00:00Z',
		};
		expect(
			mentionsOf(
				[
					{ sourceId: 'note-a', sourceTitle: 'A' },
					{ sourceId: 'other-npc', sourceTitle: 'Another NPC' },
					{ sourceId: 'note-b', sourceTitle: 'B' },
					{ sourceId: 'gone', sourceTitle: 'Gone' },
				],
				candidates,
				(id) => updated[id] ?? '',
			),
		).toEqual([
			{ id: 'note-b', title: 'B', route: '/route/note-b' },
			{ id: 'note-a', title: 'A', route: '/route/note-a' },
		]);
	});
});
