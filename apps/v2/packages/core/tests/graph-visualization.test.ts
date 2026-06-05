import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	emptyGraphVisualization,
	getGraphVisualizationForActor,
	GRAPH_RELATIONSHIP_KINDS,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type GraphVizFilter,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * GRAPH-004 — VISUALIZATION. A user views a FILTERED graph visualization by folder, tag, entity type,
 * source, relationship type, and visibility-safe search text. The visualization renders a COMPUTED,
 * actor-filtered model: it composes the GRAPH-001/008 source graph (no second graph) and adds the
 * folder/tag enrichment + the deterministic filter pass on top.
 *
 * The keystone proofs:
 *   - GRAPH-004 AC1: filtering by `map` shows ONLY visible map nodes and their visible edges.
 *   - GRAPH-004 fail-closed: a player never sees a hidden node, edge, label, facet, or count.
 *   - The folder/tag/source/relationship/text filters intersect and are matched over visible content only.
 *   - Determinism: identical inputs produce an identical, stably-ordered model.
 */

const DEFAULT_SOURCE_ID = 'local-vault';

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
	actorId = DM_ACTOR.id,
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', ...payload }, actorId)),
	);
	const id = (result.events[0] as { itemId: string }).itemId;
	return { state: result.nextState, id };
}

/** Build a small actor-visible vault: linked notes in folders/tags/sources + a couple of maps. */
function buildVault(): { state: CoreStateSlice; env: CoreEnvironment; ids: Record<string, string> } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const ids: Record<string, string> = {};

	// Highmoor — a player-visible local note in folder "Locations" tagged #keep, linked from others.
	const highmoor = createNote(state, env, {
		title: 'Highmoor',
		body: '---\ntags: [keep]\n---\nAn ancient keep on the moor.',
		visibility: 'player-visible',
		fields: { 'dndtools.folder': 'Locations' },
	});
	state = highmoor.state;
	ids.highmoor = highmoor.id;

	// Quest Log — a player-visible Obsidian note in folder "Sessions" that links to Highmoor.
	const questLog = createNote(state, env, {
		title: 'Quest Log',
		body: 'The party set out for [[Highmoor]] at dawn. #travel',
		visibility: 'player-visible',
		fields: {
			'dndtools.folder': 'Sessions',
			'dndtools.sourceId': 'obsidian-1',
			'dndtools.sourceKind': 'obsidian-vault',
			'dndtools.sourcePath': 'sessions/QuestLog.md',
		},
	});
	state = questLog.state;
	ids.questLog = questLog.id;

	// Secret Plot — a DM-ONLY note that links to Highmoor, in folder "Secrets" tagged #villain.
	const secret = createNote(state, env, {
		title: 'Secret Plot',
		body: '---\ntags: [villain]\n---\nThe villain lurks in [[Highmoor]].',
		visibility: 'dm-only',
		fields: { 'dndtools.folder': 'Secrets' },
	});
	state = secret.state;
	ids.secret = secret.id;

	return { state, env, ids };
}

// --- The visible model + actor filtering ----------------------------------------------------------------

describe('GRAPH-004 — the actor-filtered visualization model', () => {
	it('builds the DM model: every visible node, its folder/tags/source, and the visible edges', () => {
		const { state, ids } = buildVault();
		const viz = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			DEFAULT_SOURCE_ID,
		);
		const titles = viz.nodes.map((n) => n.title);
		expect(titles).toContain('Highmoor');
		expect(titles).toContain('Quest Log');
		// The DM sees the dm-only node too.
		expect(titles).toContain('Secret Plot');

		const highmoor = viz.nodes.find((n) => n.id === ids.highmoor)!;
		expect(highmoor.folder).toBe('Locations');
		expect(highmoor.tags).toEqual(['keep']);
		expect(highmoor.source).toBe('local-vault');

		const questLog = viz.nodes.find((n) => n.id === ids.questLog)!;
		expect(questLog.source).toBe('obsidian-vault');
		expect(questLog.folder).toBe('Sessions');

		// Both Quest Log and Secret Plot link to Highmoor — two wikilink edges into Highmoor (DM sees both).
		const intoHighmoor = viz.edges.filter((e) => e.toId === ids.highmoor);
		expect(intoHighmoor.map((e) => e.fromId).sort()).toEqual(
			[ids.questLog, ids.secret].sort(),
		);
		expect(intoHighmoor.every((e) => e.relationship === 'wikilink')).toBe(true);
		// Highmoor's in-result degree counts both inbound edges.
		expect(highmoor.degree).toBe(2);
	});

	it('FAIL CLOSED: a player never sees the dm-only node, its edge, its folder facet, or it in a count', () => {
		const { state, ids } = buildVault();
		const player = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			DEFAULT_SOURCE_ID,
		);
		const titles = player.nodes.map((n) => n.title);
		// The dm-only Secret Plot node is ABSENT.
		expect(titles).not.toContain('Secret Plot');
		expect(player.nodes.some((n) => n.id === ids.secret)).toBe(false);
		// Its edge into Highmoor is ABSENT — only the player-visible Quest Log edge remains.
		const intoHighmoor = player.edges.filter((e) => e.toId === ids.highmoor);
		expect(intoHighmoor.map((e) => e.fromId)).toEqual([ids.questLog]);
		// The "Secrets" folder + #villain tag (which exist ONLY because of hidden content) never appear as a
		// facet — the facets are indistinguishable from a vault without the hidden material.
		expect(player.facets.folders).not.toContain('Secrets');
		expect(player.facets.tags).not.toContain('villain');
		// The count reflects visible nodes only.
		expect(player.totalVisibleNodes).toBe(player.nodes.length);
		expect(player.totalVisibleNodes).toBe(2);
	});

	it('an unknown / unauthenticated actor receives the EMPTY model (fail closed)', () => {
		const { state } = buildVault();
		const viz = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			'actor-nobody',
			DEFAULT_SOURCE_ID,
		);
		expect(viz).toEqual(emptyGraphVisualization());
	});

	it('an observer sees the player-visible notes but no dm-only content (role ceiling)', () => {
		const { state } = buildVault();
		const observer = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			OBSERVER_ACTOR.id,
			DEFAULT_SOURCE_ID,
		);
		expect(observer.nodes.map((n) => n.title)).not.toContain('Secret Plot');
	});

	it('is DETERMINISTIC: identical inputs produce an identical model', () => {
		const { state } = buildVault();
		const run = () =>
			getGraphVisualizationForActor(
				state.content,
				state.maps,
				state.session,
				state.permissions,
				DM_ACTOR.id,
				DEFAULT_SOURCE_ID,
			);
		expect(run()).toEqual(run());
	});
});

// --- The filters: folder, tag, entity type, source, relationship type, search text ----------------------

describe('GRAPH-004 — filters intersect over visible content only', () => {
	function viz(state: CoreStateSlice, actorId: string, filter: GraphVizFilter) {
		return getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			actorId,
			DEFAULT_SOURCE_ID,
			filter,
		);
	}

	it('filters by FOLDER (exact match)', () => {
		const { state, ids } = buildVault();
		const result = viz(state, DM_ACTOR.id, { folder: 'Sessions' });
		expect(result.nodes.map((n) => n.id)).toEqual([ids.questLog]);
	});

	it('filters by TAG (case-insensitive, ALL required)', () => {
		const { state, ids } = buildVault();
		const result = viz(state, DM_ACTOR.id, { tags: ['KEEP'] });
		expect(result.nodes.map((n) => n.id)).toEqual([ids.highmoor]);
	});

	it('filters by SOURCE (the GRAPH source taxonomy)', () => {
		const { state, ids } = buildVault();
		const result = viz(state, DM_ACTOR.id, { sources: ['obsidian-vault'] });
		expect(result.nodes.map((n) => n.id)).toEqual([ids.questLog]);
	});

	it('filters by SEARCH TEXT over title/folder/tag (visibility-safe — never matches hidden content)', () => {
		const { state, ids } = buildVault();
		// "high" matches the Highmoor title for the DM and the player alike.
		expect(viz(state, DM_ACTOR.id, { text: 'high' }).nodes.map((n) => n.id)).toEqual([ids.highmoor]);
		// A player searching for the hidden node's title matches NOTHING (the hidden node is not in the model).
		expect(viz(state, PLAYER_ACTOR.id, { text: 'secret plot' }).nodes).toEqual([]);
	});

	it('combines facets intersectively (folder AND tag)', () => {
		const { state, ids } = buildVault();
		// Highmoor is in "Locations" AND tagged #keep — it survives; nothing else does.
		expect(viz(state, DM_ACTOR.id, { folder: 'Locations', tags: ['keep'] }).nodes.map((n) => n.id)).toEqual([
			ids.highmoor,
		]);
		// A contradictory combination (Sessions folder but the #keep tag) yields no node.
		expect(viz(state, DM_ACTOR.id, { folder: 'Sessions', tags: ['keep'] }).nodes).toEqual([]);
	});
});

// --- GRAPH-004 AC1: filtering by `map` shows only visible map nodes and their visible edges --------------

describe('GRAPH-004 AC1 — filtering by entity type `map`', () => {
	it('shows only visible map nodes (and their visible edges); hidden maps never appear', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);

		// A player-visible note that a POI on a visible map will pin (so a poi-link edge exists).
		const harborTown = createNote(state, env, {
			title: 'Harbor Town',
			body: 'A bustling port.',
			visibility: 'player-visible',
			fields: { 'dndtools.folder': 'Locations' },
		});
		state = harborTown.state;

		// A player-visible map with a POI linked to Harbor Town. A fresh map seeds a default base layer
		// (`${mapId}-layer-0`), which the POI is placed on; the layer is set player-visible so the POI shows.
		const mapResult = accepted(
			dispatchCommand(
				state,
				env,
				cmd('map.create', { name: 'Western Reaches', description: 'The coast.', visibility: 'player-visible' }),
			),
		);
		state = mapResult.nextState;
		const mapId = (mapResult.events[0] as { mapId: string }).mapId;
		const baseLayerId = `${mapId}-layer-0`;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('map.set-layer-visibility', { mapId, layerId: baseLayerId, visibility: 'player-visible' }),
			),
		).nextState;

		const poiResult = accepted(
			dispatchCommand(
				state,
				env,
				cmd('map.create-poi', {
					mapId,
					layerId: baseLayerId,
					label: 'Harbor',
					position: { x: 0.5, y: 0.5 },
					visibility: 'player-visible',
					linkedEntityType: 'note',
					linkedEntityId: harborTown.id,
				}),
			),
		);
		state = poiResult.nextState;

		// A DM-ONLY map that must never appear for a player.
		const secretMap = accepted(
			dispatchCommand(
				state,
				env,
				cmd('map.create', { name: 'Secret Lair', description: 'Hidden.', visibility: 'dm-only' }),
			),
		);
		state = secretMap.nextState;
		const secretMapId = (secretMap.events[0] as { mapId: string }).mapId;

		// DM filtering by `map` sees BOTH maps.
		const dm = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			DEFAULT_SOURCE_ID,
			{ kinds: ['map'] },
		);
		expect(dm.nodes.every((n) => n.kind === 'map')).toBe(true);
		expect(dm.nodes.map((n) => n.id).sort()).toEqual([mapId, secretMapId].sort());

		// PLAYER filtering by `map` sees ONLY the visible map (the dm-only map is absent — AC1 + fail closed).
		const player = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			DEFAULT_SOURCE_ID,
			{ kinds: ['map'] },
		);
		expect(player.nodes.map((n) => n.id)).toEqual([mapId]);
		expect(player.nodes.some((n) => n.id === secretMapId)).toBe(false);

		// Filtering nodes to `map` + `note` lets the poi-link edge's note endpoint survive, but a map-only
		// filter drops cross-kind edges (the poi endpoint is excluded), proving edges follow surviving nodes.
		const poiAndNote = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			DEFAULT_SOURCE_ID,
			{ kinds: ['poi', 'note'] },
		);
		const poiLink = poiAndNote.edges.find((e) => e.relationship === 'poi-link');
		expect(poiLink).toBeDefined();
		expect(poiLink!.toId).toBe(harborTown.id);
	});
});

// --- Relationship-type filter + facets ------------------------------------------------------------------

describe('GRAPH-004 — relationship-type filter and facets', () => {
	it('exposes the relationship-kind constant in stable order', () => {
		expect([...GRAPH_RELATIONSHIP_KINDS]).toEqual(['wikilink', 'poi-link']);
	});

	it('filters EDGES by relationship kind without dropping the nodes', () => {
		const { state, ids } = buildVault();
		// Only wikilink edges exist in this vault; filtering to poi-link yields the nodes but no edges.
		const onlyPoi = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			DEFAULT_SOURCE_ID,
			{ relationships: ['poi-link'] },
		);
		expect(onlyPoi.nodes.some((n) => n.id === ids.highmoor)).toBe(true);
		expect(onlyPoi.edges).toEqual([]);

		const onlyWiki = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			DEFAULT_SOURCE_ID,
			{ relationships: ['wikilink'] },
		);
		expect(onlyWiki.edges.length).toBeGreaterThan(0);
		expect(onlyWiki.edges.every((e) => e.relationship === 'wikilink')).toBe(true);
	});

	it('facets list only the folders/tags/sources/kinds present in the visible graph', () => {
		const { state } = buildVault();
		const player = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			DEFAULT_SOURCE_ID,
		);
		expect(player.facets.folders).toEqual(['Locations', 'Sessions']);
		expect(player.facets.tags).toEqual(['keep', 'travel']);
		expect(player.facets.sources.sort()).toEqual(['local-vault', 'obsidian-vault']);
		expect(player.facets.kinds).toEqual(['note']);
	});
});

// --- Partial / offline source signal --------------------------------------------------------------------

describe('GRAPH-004 — partial/offline source signal', () => {
	it('marks the model partial and surfaces a non-leaking diagnostic when a source is not cached', () => {
		const { state } = buildVault();
		const viz = getGraphVisualizationForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			DEFAULT_SOURCE_ID,
			{},
			{ configuredSources: [{ sourceId: 'gdocs-remote', kind: 'google-docs', available: false }] },
		);
		expect(viz.partial).toBe(true);
		const remote = viz.sourceDiagnostics.find((d) => d.sourceId === 'gdocs-remote');
		expect(remote).toBeDefined();
		expect(remote!.available).toBe(false);
		// The diagnostic carries no note title/body — only the source id/kind + status.
		expect(remote!.message).not.toContain('Highmoor');
	});
});
