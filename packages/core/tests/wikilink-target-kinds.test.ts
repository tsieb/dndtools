import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	OBSERVER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	dispatchCommand,
	buildWikilinkCandidatesForActor,
	resolveWikilinkForActor,
	suggestWikilinkTargetsForActor,
	getNoteRelationshipsForActor,
	getTypedRelationshipEdgesForActor,
	parseMarkdownNote,
	serializeMarkdownNote,
	detectBrokenLinksForActor,
	previewBulkLinkRepairForActor,
	authorizeLinkRepairForActor,
	type CoreCommand,
} from '../src';

function fixture() {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const env = makeEnvironment();
	const run = (type: CoreCommand['type'], payload: unknown) => {
		const result = dispatchCommand(state, env, {
			type,
			actorId: DM_ACTOR.id,
			payload,
		} as CoreCommand);
		expect(
			result.status,
			JSON.stringify(result.status === 'rejected' ? result.rejection : ''),
		).toBe('accepted');
		if (result.status !== 'accepted') throw new Error('rejected fixture command');
		state = result.nextState;
	};
	for (const visibility of ['player-visible', 'dm-only'] as const) {
		const suffix = visibility === 'dm-only' ? ' secret' : '';
		run('character.quick-create', { kind: 'npc', name: `Mira the Ferryman${suffix}`, visibility });
		for (const kind of ['note', 'faction', 'quest'])
			run('content.create-item', {
				kind: kind === 'note' ? 'note' : 'object',
				title: `${kind}${suffix}`,
				visibility,
				fields: kind === 'note' ? {} : { 'dndtools.objectSubtype': kind },
				body: '',
			});
		run('map.create', {
			name: `Harbor${suffix}`,
			visibility,
			initialLayers: [{ name: 'Places', category: 'base', visibility: 'player-visible' }],
		});
		const map = Object.values(state.maps.maps).find((m) => m.name === `Harbor${suffix}`)!;
		run('map.create-poi', {
			id: `poi-${suffix || 'visible'}`,
			mapId: map.id,
			category: 'settlement',
			layerId: map.layers[0]!.id,
			label: `Dock${suffix}`,
			position: { x: 0.5, y: 0.5 },
			visibility,
		});
	}
	return {
		get state() {
			return state;
		},
		run,
	};
}

describe('RC-KNW-6.1 actor-scoped link targets', () => {
	it.each(['note', 'faction', 'quest', 'character', 'map', 'poi'])(
		'resolves and rejects %s per actor',
		(kind) => {
			const { state } = fixture();
			const dm = buildWikilinkCandidatesForActor(
				state.content,
				state.permissions,
				DM_ACTOR.id,
				state,
			).filter((t) => t.kind === kind);
			expect(dm).toHaveLength(2);
			for (const actor of [DM_ACTOR.id, PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'unknown']) {
				for (const target of dm) {
					const visible =
						actor !== 'unknown' &&
						!(kind === 'character' && actor === OBSERVER_ACTOR.id) &&
						(actor === DM_ACTOR.id || !target.title.endsWith(' secret'));
					const resolved = resolveWikilinkForActor(
						state.content,
						state.permissions,
						actor,
						{ target: target.title },
						state,
					);
					expect(resolved.status).toBe(visible ? 'resolved' : 'unresolved');
					const suggestions = suggestWikilinkTargetsForActor(
						state.content,
						state.permissions,
						actor,
						target.title,
						state,
					);
					expect(suggestions.some((s) => s.itemId === target.id)).toBe(visible);
				}
			}
		},
	);

	it('isolates player autocomplete and backlinks from DM-only characters and source notes', () => {
		const f = fixture();
		f.run('content.create-item', {
			kind: 'note',
			title: 'Voyage',
			body: 'Talk to [[Mira the Ferryman]].',
			visibility: 'player-visible',
		});
		f.run('content.create-item', {
			kind: 'note',
			title: 'Secret voyage',
			body: 'Ambush [[Mira the Ferryman]].',
			visibility: 'dm-only',
		});
		const s = f.state;
		const character = Object.values(s.characters.characters).find(
			(c) => c.name === 'Mira the Ferryman',
		)!;
		expect(
			suggestWikilinkTargetsForActor(s.content, s.permissions, PLAYER_ACTOR.id, 'Mi', s),
		).toEqual([
			{
				itemId: character.id,
				title: character.name,
				kind: 'character',
				route: `/characters/${character.id}`,
			},
		]);
		expect(
			getNoteRelationshipsForActor(
				s.content,
				s.permissions,
				PLAYER_ACTOR.id,
				character.id,
				s,
			).backlinks.map((b) => b.sourceTitle),
		).toEqual(['Voyage']);
		expect(
			getNoteRelationshipsForActor(s.content, s.permissions, DM_ACTOR.id, character.id, s)
				.backlinks,
		).toHaveLength(2);
		expect(
			detectBrokenLinksForActor(
				s.content,
				s.permissions,
				PLAYER_ACTOR.id,
				'[[Mira the Ferryman]] [[missing]]',
				s,
			),
		).toHaveLength(1);
	});

	it('uses the same first-match rule for completion, resolution and backlinks', () => {
		const f = fixture();
		f.run('content.create-item', {
			kind: 'note',
			title: 'Mira the Ferryman',
			visibility: 'player-visible',
		});
		f.run('content.create-item', {
			kind: 'note',
			title: 'Voyage',
			body: '[[Mira the Ferryman]]',
			visibility: 'player-visible',
		});
		const s = f.state;
		const npc = Object.values(s.characters.characters).find((c) => c.name === 'Mira the Ferryman')!;
		const target = Object.values(s.content.items).find((c) => c.title === 'Mira the Ferryman')!;
		expect(
			suggestWikilinkTargetsForActor(s.content, s.permissions, PLAYER_ACTOR.id, 'Mi', s).map(
				(t) => t.itemId,
			),
		).toEqual([target.id]);
		expect(
			getNoteRelationshipsForActor(s.content, s.permissions, PLAYER_ACTOR.id, npc.id, s).backlinks,
		).toEqual([]);
		expect(
			getNoteRelationshipsForActor(s.content, s.permissions, PLAYER_ACTOR.id, target.id, s)
				.backlinks,
		).toHaveLength(1);
	});

	it('keeps valid character links out of repair and repairs unresolved links to visible characters', () => {
		const f = fixture();
		f.run('content.create-item', {
			kind: 'note',
			title: 'Voyage',
			body: '[[Mira the Ferryman]] [[Miraa]]',
		});
		const s = f.state;
		const source = Object.values(s.content.items).find((c) => c.title === 'Voyage')!;
		const preview = previewBulkLinkRepairForActor(s.content, s.permissions, DM_ACTOR.id, s);
		expect(preview.rows.map((row) => row.brokenTarget)).toEqual(['miraa']);
		const repair = authorizeLinkRepairForActor(
			s.content,
			s.permissions,
			DM_ACTOR.id,
			source.id,
			'Miraa',
			'Mira the Ferryman',
			s,
		);
		expect(repair.status).toBe('authorized');
		if (repair.status === 'authorized') expect(repair.result.status).toBe('repaired');
	});

	it('round-trips NPC → faction leads through the character body and graph', () => {
		const f = fixture();
		const npc = Object.values(f.state.characters.characters).find(
			(c) => c.name === 'Mira the Ferryman',
		)!;
		const body = serializeMarkdownNote(
			{ relations: ['leads :: faction'] },
			'Keeps the ferry running.',
		);
		f.run('character.edit-field', { characterId: npc.id, path: 'data.body', value: body });
		const s = f.state;
		expect(
			parseMarkdownNote(String(s.characters.characters[npc.id]!.data.body)).properties.relations,
		).toEqual(['leads :: faction']);
		const edges = getTypedRelationshipEdgesForActor(s.content, s.permissions, PLAYER_ACTOR.id, s);
		expect(edges).toEqual([
			expect.objectContaining({
				sourceId: npc.id,
				sourceTitle: npc.name,
				verb: 'leads',
				targetTitle: 'faction',
			}),
		]);
	});
});
