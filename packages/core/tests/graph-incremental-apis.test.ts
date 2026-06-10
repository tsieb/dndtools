import { describe, expect, it } from 'vitest';
import {
	applyGraphChange,
	backlinksOf,
	buildGraphIndex,
	buildGraphIndexState,
	createDemoMapState,
	diffGraphIndex,
	dispatchCommand,
	emptyGraphIndex,
	emptyGraphIndexState,
	forwardLinksOf,
	getGraphBacklinks,
	getGraphBacklinksForActor,
	getGraphForwardLinksForActor,
	getGraphIndexForActor,
	getGraphIndexStateForActor,
	getGraphRelatedNotes,
	getGraphRelationships,
	getGraphRepairSignalForActor,
	graphFreshnessStatus,
	graphRemoveChange,
	graphRepairSignal,
	graphUpsertChangeForContent,
	graphsEqual,
	markGraphStale,
	markGraphStaleForActor,
	outboundTargetsFromBody,
	publishGraphFreshness,
	resolveGraphLink,
	setGraphAvailability,
	setGraphAvailabilityForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type GraphNodeRecord,
	type MapState,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * GRAPH-005 / GRAPH-006 — INCREMENTAL APIs. The Graph Engine updates INCREMENTALLY after accepted note /
 * object / map / POI / sync operations (only affected nodes/edges + dependent indexes update), and exposes a
 * SOURCE-AGNOSTIC query API to navigation, search, widgets, and MCP without those consumers parsing raw
 * markdown. Tests are the primary evidence.
 *
 * The keystone proofs:
 *   - GRAPH-005 AC1: only affected nodes/edges update, and a sequence of incremental updates CONVERGES to
 *     the same graph a full recompute would produce (incremental == full).
 *   - GRAPH-005 AC2: a failed incremental update marks the graph stale and a repair/REINDEX is required.
 *   - GRAPH-006 AC1: an MCP backlink request uses the graph API rather than reading files ad hoc.
 *   - GRAPH-006 AC2: a widget/player request for related notes returns ONLY visible relationships.
 *
 * Determinism + fail-closed are HARD requirements: identical inputs produce identical graphs, freshness is
 * never reported `fresh` when unproven/unavailable, and an incremental update never surfaces a hidden node.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
	return { ...state, maps: createDemoMapState() };
}

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

function rec(
	overrides: Partial<GraphNodeRecord> & Pick<GraphNodeRecord, 'id' | 'title'>,
): GraphNodeRecord {
	return { kind: 'note', aliases: [], outboundTargets: [], revision: 1, ...overrides };
}

// --- The PURE engine: full build + edge resolution ----------------------------------------------------

describe('GRAPH-005 — pure engine: full build', () => {
	it('builds one node per record and one directed edge per resolved wikilink', () => {
		const records: GraphNodeRecord[] = [
			rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
			rec({ id: 'n-b', title: 'Highmoor', aliases: ['The Keep'] }),
			rec({ id: 'n-c', title: 'Map Notes', outboundTargets: ['the keep'] }),
		];
		const index = buildGraphIndex(records);
		expect(index.nodes.map((node) => node.id).sort()).toEqual(['n-a', 'n-b', 'n-c']);
		// Both Quest Log and Map Notes link Highmoor (via title and via alias, case-insensitively).
		expect(index.edges).toEqual([
			{ fromId: 'n-a', toId: 'n-b', via: 'Highmoor' },
			{ fromId: 'n-c', toId: 'n-b', via: 'the keep' },
		]);
	});

	it('drops a link to a target absent from the visible set (fail closed — no dangling edge)', () => {
		const records: GraphNodeRecord[] = [
			rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Secret Cult', 'Highmoor'] }),
			rec({ id: 'n-b', title: 'Highmoor' }),
		];
		const index = buildGraphIndex(records);
		// Only the Highmoor edge resolves; the Secret Cult link names no visible node ⇒ no edge.
		expect(index.edges).toEqual([{ fromId: 'n-a', toId: 'n-b', via: 'Highmoor' }]);
	});

	it('never relates a node to itself', () => {
		const records: GraphNodeRecord[] = [
			rec({ id: 'n-a', title: 'Highmoor', outboundTargets: ['Highmoor'] }),
		];
		expect(buildGraphIndex(records).edges).toEqual([]);
	});

	it('is deterministic across fresh fixtures whose ids differ but structure matches', () => {
		const build = (suffix: string) =>
			buildGraphIndex([
				rec({ id: `a-${suffix}`, title: 'Quest Log', outboundTargets: ['Highmoor'] }),
				rec({ id: `b-${suffix}`, title: 'Highmoor' }),
			]);
		const first = build('1');
		const second = build('1');
		// Same ids ⇒ byte-identical edges/nodes.
		expect(second).toEqual(first);
		// Different ids but same structure ⇒ same edge SHAPE (one edge, Quest Log → Highmoor).
		const other = build('2');
		expect(other.edges).toHaveLength(1);
		expect(other.edges[0]!.via).toBe('Highmoor');
	});
});

// --- INCREMENTAL == FULL convergence (the keystone determinism proof) ---------------------------------

describe('GRAPH-005 AC1 — incremental updates converge to the full recompute', () => {
	const seed: GraphNodeRecord[] = [
		rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
		rec({ id: 'n-b', title: 'Highmoor' }),
		rec({ id: 'n-c', title: 'Bane' }),
	];

	it('an upsert touches only the affected edges and equals a full rebuild', () => {
		let state = buildGraphIndexState(seed);
		// Update Bane to link Highmoor. Only Bane's edges change; Quest Log → Highmoor is untouched.
		state = applyGraphChange(state, {
			op: 'upsert',
			record: rec({ id: 'n-c', title: 'Bane', outboundTargets: ['Highmoor'] }),
		});
		const full = buildGraphIndex([
			rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
			rec({ id: 'n-b', title: 'Highmoor' }),
			rec({ id: 'n-c', title: 'Bane', outboundTargets: ['Highmoor'] }),
		]);
		expect(graphsEqual(state.index, full)).toBe(true);
		expect(diffGraphIndex(state.index, full)).toEqual({ nodes: [], edges: [] });
		// The new edge appeared; the pre-existing edge is still present (only the affected node changed).
		expect(state.index.edges).toContainEqual({ fromId: 'n-c', toId: 'n-b', via: 'Highmoor' });
		expect(state.index.edges).toContainEqual({ fromId: 'n-a', toId: 'n-b', via: 'Highmoor' });
	});

	it('a remove drops the node and its inbound/outbound edges and equals a full rebuild', () => {
		let state = buildGraphIndexState(seed);
		state = applyGraphChange(state, graphRemoveChange('n-b')); // remove the Highmoor target
		const full = buildGraphIndex([
			rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
			rec({ id: 'n-c', title: 'Bane' }),
		]);
		// Highmoor gone, and Quest Log's edge to it is gone too (its target left the visible set).
		expect(graphsEqual(state.index, full)).toBe(true);
		expect(state.index.nodes.map((n) => n.id).sort()).toEqual(['n-a', 'n-c']);
		expect(state.index.edges).toEqual([]);
	});

	it('a long sequence of mixed upserts/removes converges to the full recompute of the final set', () => {
		let state = emptyGraphIndexState();
		const ops: GraphNodeRecord[] = [
			rec({ id: 'n-1', title: 'One', outboundTargets: ['Two', 'Three'] }),
			rec({ id: 'n-2', title: 'Two', outboundTargets: ['Three'] }),
			rec({ id: 'n-3', title: 'Three' }),
			rec({ id: 'n-4', title: 'Four', outboundTargets: ['One'] }),
		];
		for (const record of ops) state = applyGraphChange(state, { op: 'upsert', record });
		// Retitle Two (a rename) and remove Four.
		state = applyGraphChange(state, {
			op: 'upsert',
			record: rec({ id: 'n-2', title: 'Second', outboundTargets: ['Three'] }),
		});
		state = applyGraphChange(state, graphRemoveChange('n-4'));
		const full = buildGraphIndex([
			rec({ id: 'n-1', title: 'One', outboundTargets: ['Two', 'Three'] }),
			rec({ id: 'n-2', title: 'Second', outboundTargets: ['Three'] }),
			rec({ id: 'n-3', title: 'Three' }),
		]);
		expect(graphsEqual(state.index, full)).toBe(true);
		expect(diffGraphIndex(state.index, full)).toEqual({ nodes: [], edges: [] });
		// One's link to the (now-renamed) "Two" no longer resolves (Two's title is now "Second"); its link to
		// Three still resolves, and the renamed node's own link to Three is preserved.
		expect(state.index.edges).toEqual([
			{ fromId: 'n-1', toId: 'n-3', via: 'Three' },
			{ fromId: 'n-2', toId: 'n-3', via: 'Three' },
		]);
	});

	it('upsert is idempotent: re-applying the same record yields the same graph', () => {
		let state = buildGraphIndexState(seed);
		const change = { op: 'upsert' as const, record: rec({ id: 'n-c', title: 'Bane', outboundTargets: ['Highmoor'] }) };
		state = applyGraphChange(state, change);
		const once = state.index;
		state = applyGraphChange(state, change);
		expect(graphsEqual(state.index, once)).toBe(true);
	});

	it('removing an unknown node is a no-op (idempotent)', () => {
		const state = buildGraphIndexState(seed);
		const after = applyGraphChange(state, graphRemoveChange('n-missing'));
		expect(after).toBe(state);
	});
});

// --- DELTA (serving the graph incrementally) ----------------------------------------------------------

describe('GRAPH-005 — the delta between two snapshots', () => {
	it('reports added/removed nodes and edges; identical graphs produce an empty delta', () => {
		const before = buildGraphIndex([
			rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
			rec({ id: 'n-b', title: 'Highmoor' }),
		]);
		const after = buildGraphIndex([
			rec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
			rec({ id: 'n-b', title: 'Highmoor' }),
			rec({ id: 'n-c', title: 'Bane', outboundTargets: ['Highmoor'] }),
		]);
		const delta = diffGraphIndex(before, after);
		expect(delta.nodes).toEqual([{ op: 'added', node: { id: 'n-c', kind: 'note', title: 'Bane' } }]);
		expect(delta.edges).toEqual([{ op: 'added', edge: { fromId: 'n-c', toId: 'n-b', via: 'Highmoor' } }]);
		// A graph diffed against itself has no changes.
		expect(diffGraphIndex(after, after)).toEqual({ nodes: [], edges: [] });
	});
});

// --- FRESHNESS + repair/reindex (reusing the SRCH cursor convention) ----------------------------------

describe('GRAPH-005 AC2 — freshness + repair/reindex signaling', () => {
	it('a freshly-built graph over records is FRESH and needs no reindex', () => {
		const index = buildGraphIndex([rec({ id: 'n-a', title: 'A', revision: 3 })]);
		expect(graphFreshnessStatus(index)).toBe('fresh');
		expect(publishGraphFreshness(index).behindBy).toBe(0);
		expect(graphRepairSignal(index)).toEqual({ reindexRequired: false, reason: null, status: 'fresh' });
	});

	it('the empty graph is FRESH (nothing to be behind)', () => {
		expect(graphFreshnessStatus(emptyGraphIndex())).toBe('fresh');
	});

	it('marking the graph stale (a failed incremental update) requires a REINDEX (fail closed)', () => {
		const index = markGraphStale(buildGraphIndex([rec({ id: 'n-a', title: 'A' })]));
		expect(graphFreshnessStatus(index)).not.toBe('fresh');
		const signal = graphRepairSignal(index);
		expect(signal.reindexRequired).toBe(true);
		expect(signal.reason).toBe('incremental-update-failed');
	});

	it('an unavailable source forces a REINDEX without discarding the cached graph', () => {
		const built = buildGraphIndex([rec({ id: 'n-a', title: 'A' }), rec({ id: 'n-b', title: 'B' })]);
		const index = setGraphAvailability(built, false);
		expect(graphFreshnessStatus(index)).toBe('stale');
		const signal = graphRepairSignal(index);
		expect(signal.reindexRequired).toBe(true);
		expect(signal.reason).toBe('source-unavailable');
		// The cached nodes still serve; only the freshness is flagged.
		expect(index.nodes).toHaveLength(2);
	});

	it('the stale flag (failed update) takes precedence over unavailability as the more specific cause', () => {
		const index = setGraphAvailability(markGraphStale(buildGraphIndex([rec({ id: 'n-a', title: 'A' })])), false);
		expect(graphRepairSignal(index).reason).toBe('incremental-update-failed');
	});
});

describe('GRAPH-005 — outbound target extraction reuses the shared wikilink parser', () => {
	it('extracts distinct, in-order targets and ignores plain text', () => {
		const body = 'See [[Highmoor]] and [[The Keep|the keep]], then [[Highmoor]] again. No plain links.';
		expect(outboundTargetsFromBody(body)).toEqual(['Highmoor', 'The Keep']);
	});
});

// --- ACTOR-FILTERED incremental graph (visibility non-leak) -------------------------------------------

describe('GRAPH-005 — the actor-filtered incremental graph never leaks a hidden node/edge', () => {
	function vault(): { state: CoreStateSlice; env: CoreEnvironment; targetId: string; secretId: string } {
		const env = makeEnvironment();
		let state = base();
		// A player-visible target note.
		const target = createNote(state, env, { title: 'Highmoor', body: 'The keep stands.', visibility: 'player-visible' });
		state = target.state;
		// A DM-ONLY note that links the target (a hidden backlink SOURCE).
		const secret = createNote(state, env, {
			title: 'Cult Plans',
			body: 'The cult marches on [[Highmoor]] at dawn.',
			visibility: 'dm-only',
		});
		state = secret.state;
		// A player-visible note that links the target (a visible backlink source).
		const visibleSource = createNote(state, env, {
			title: 'Party Journal',
			body: 'We must defend [[Highmoor]].',
			visibility: 'player-visible',
		});
		state = visibleSource.state;
		return { state, env, targetId: target.id, secretId: secret.id };
	}

	it('the DM graph carries the hidden node + its edge; the player graph does NOT', () => {
		const { state, targetId, secretId } = vault();
		const dm = getGraphIndexForActor(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id);
		const player = getGraphIndexForActor(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id);

		// DM: the hidden Cult Plans node + its edge to Highmoor are present.
		expect(dm.nodes.map((n) => n.id)).toContain(secretId);
		expect(dm.edges).toContainEqual({ fromId: secretId, toId: targetId, via: 'Highmoor' });

		// Player: the hidden node is absent everywhere, and no edge references it.
		const serialized = JSON.stringify(player);
		expect(serialized).not.toContain(secretId);
		expect(serialized).not.toContain('Cult Plans');
		expect(player.edges.some((e) => e.fromId === secretId || e.toId === secretId)).toBe(false);
	});

	it('the player backlink reverse index omits the hidden source (fail closed)', () => {
		const { state, targetId, secretId } = vault();
		const dmState = getGraphIndexStateForActor(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id);
		const playerState = getGraphIndexStateForActor(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id);

		const dmBacklinks = getGraphBacklinksForActor(dmState, targetId).map((n) => n.id);
		const playerBacklinks = getGraphBacklinksForActor(playerState, targetId).map((n) => n.id);
		expect(dmBacklinks).toContain(secretId); // DM sees the hidden backlink source
		expect(playerBacklinks).not.toContain(secretId); // player does not
		expect(playerBacklinks.length).toBeGreaterThan(0); // but still sees the VISIBLE backlink source
	});

	it('an unknown/unauthenticated actor gets the empty graph (fail closed)', () => {
		const { state } = vault();
		const result = getGraphIndexForActor(state.content, state.maps, state.session, state.permissions, 'ghost');
		expect(result.nodes).toEqual([]);
		expect(result.edges).toEqual([]);
		const stateResult = getGraphIndexStateForActor(state.content, state.maps, state.session, state.permissions, 'ghost');
		expect(stateResult).toEqual(emptyGraphIndexState());
	});

	it('the per-actor incremental graph == the per-actor full recompute (convergence under visibility)', () => {
		const env = makeEnvironment();
		// An empty-map vault so the full recompute contains ONLY the two notes (no demo map/POI nodes), which
		// lets us assert the incrementally-built note subgraph equals the full recompute exactly.
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
		const a = createNote(state, env, { title: 'Highmoor', body: 'Stands tall.', visibility: 'player-visible' });
		state = a.state;
		const b = createNote(state, env, { title: 'Journal', body: 'Defend [[Highmoor]].', visibility: 'player-visible' });
		state = b.state;

		// Full recompute for the player.
		const full = getGraphIndexStateForActor(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id);

		// Incrementally maintain the player's graph: start empty, upsert each visible note as a change.
		let incremental = emptyGraphIndexState();
		const viewA = { id: a.id, kind: 'note' as const, title: 'Highmoor', body: 'Stands tall.', fields: {}, dateFields: {}, timelineRefs: [], visibility: 'player-visible' as const, authorActorId: DM_ACTOR.id, updatedAt: '2026-06-03T00:00:00.000Z', revision: 1 };
		const viewB = { id: b.id, kind: 'note' as const, title: 'Journal', body: 'Defend [[Highmoor]].', fields: {}, dateFields: {}, timelineRefs: [], visibility: 'player-visible' as const, authorActorId: DM_ACTOR.id, updatedAt: '2026-06-03T00:00:00.000Z', revision: 1 };
		incremental = applyGraphChange(incremental, graphUpsertChangeForContent(viewA));
		incremental = applyGraphChange(incremental, graphUpsertChangeForContent(viewB));

		// The incrementally-built player graph has the SAME edges as the full player recompute.
		expect(graphsEqual(incremental.index, full.index)).toBe(true);
	});

	it('marks a maintained graph stale and requires a reindex through the actor surface', () => {
		const { state } = vault();
		let dmState = getGraphIndexStateForActor(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id);
		expect(getGraphRepairSignalForActor(dmState).reindexRequired).toBe(false);
		dmState = markGraphStaleForActor(dmState);
		expect(getGraphRepairSignalForActor(dmState).reason).toBe('incremental-update-failed');
		// Recovering availability is independent; the failed-update flag still requires a reindex.
		dmState = setGraphAvailabilityForActor(dmState, true);
		expect(getGraphRepairSignalForActor(dmState).reindexRequired).toBe(true);
	});
});

// --- POI → entity edges (map/POI domain) are visibility-filtered --------------------------------------

describe('GRAPH-005 — visible POIs form edges to their linked entities; hidden POIs do not', () => {
	function vaultWithLinkedNotes(): CoreStateSlice {
		const env = makeEnvironment();
		let state = base();
		// The demo map's poi-harbor-town links note-harbor-town (player-visible POI), and the dm-only
		// poi-smugglers-cache links note-smugglers-cache. Create the linked notes so the edges can resolve.
		state = createNote(state, env, { title: 'Harbor Town', body: 'A bustling port.', visibility: 'player-visible' }).state;
		state = createNote(state, env, { title: 'Smugglers Cache', body: 'Hidden stash.', visibility: 'player-visible' }).state;
		return state;
	}

	it('a DM-only POI never appears as a node or edge in the player graph', () => {
		const state = vaultWithLinkedNotes();
		const player = getGraphIndexForActor(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id);
		const serialized = JSON.stringify(player);
		// The dm-only POI's id/label never reaches the player.
		expect(serialized).not.toContain('poi-smugglers-cache');
		expect(serialized).not.toContain("Smugglers' Cache");
		// The visible POI IS a node for the player.
		expect(player.nodes.some((n) => n.id === 'poi-harbor-town')).toBe(true);
		// And the DM sees the hidden POI.
		const dm = getGraphIndexForActor(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id);
		expect(dm.nodes.some((n) => n.id === 'poi-smugglers-cache')).toBe(true);
	});
});

// --- GRAPH-006: the SOURCE-AGNOSTIC query API --------------------------------------------------------

describe('GRAPH-006 — the source-agnostic graph API (one entry point for all consumers)', () => {
	function vault(): { state: CoreStateSlice; targetId: string; secretId: string; visibleSourceId: string } {
		const env = makeEnvironment();
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', body: 'The keep stands.', visibility: 'player-visible' });
		state = target.state;
		const secret = createNote(state, env, {
			title: 'Cult Plans',
			body: 'The cult marches on [[Highmoor]].',
			visibility: 'dm-only',
		});
		state = secret.state;
		const visibleSource = createNote(state, env, {
			title: 'Party Journal',
			body: 'We defend [[Highmoor]].',
			visibility: 'player-visible',
		});
		state = visibleSource.state;
		return { state, targetId: target.id, secretId: secret.id, visibleSourceId: visibleSource.id };
	}

	it('AC1 — an MCP backlink request uses the graph API and is visibility-filtered', () => {
		const { state, targetId, secretId, visibleSourceId } = vault();
		// The DM's MCP request sees the hidden backlink source; the player's does not.
		const dmBacklinks = getGraphBacklinks(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id, targetId, 'mcp');
		const playerBacklinks = getGraphBacklinks(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id, targetId, 'mcp');
		expect(dmBacklinks.map((b) => b.sourceId).sort()).toEqual([secretId, visibleSourceId].sort());
		expect(playerBacklinks.map((b) => b.sourceId)).toEqual([visibleSourceId]);
		// The hidden source is absent from the player MCP payload entirely.
		expect(JSON.stringify(playerBacklinks)).not.toContain('Cult Plans');
	});

	it('AC2 — a player widget request for related notes returns ONLY visible relationships', () => {
		const env = makeEnvironment();
		let state = base();
		// A note that links a player-visible note AND a dm-only note.
		const visibleRelated = createNote(state, env, { title: 'Visible Ally', body: 'An ally.', visibility: 'player-visible' });
		state = visibleRelated.state;
		const hiddenRelated = createNote(state, env, { title: 'Secret Villain', body: 'A villain.', visibility: 'dm-only' });
		state = hiddenRelated.state;
		const hub = createNote(state, env, {
			title: 'Hub',
			body: 'Allied with [[Visible Ally]] but threatened by [[Secret Villain]].',
			visibility: 'player-visible',
		});
		state = hub.state;

		const dmRelated = getGraphRelatedNotes(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id, hub.id, 'widget');
		const playerRelated = getGraphRelatedNotes(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id, hub.id, 'widget');
		expect(dmRelated.map((r) => r.relatedTitle).sort()).toEqual(['Secret Villain', 'Visible Ally']);
		// The player sees only the visible related note; the hidden villain (and its edge) are absent.
		expect(playerRelated.map((r) => r.relatedTitle)).toEqual(['Visible Ally']);
		expect(JSON.stringify(playerRelated)).not.toContain('Secret Villain');
	});

	it('the consumer kind is audit-only: an MCP and a widget request return the SAME visibility result', () => {
		const { state, targetId } = vault();
		const asMcp = getGraphRelationships(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id, targetId, 'mcp');
		const asWidget = getGraphRelationships(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id, targetId, 'widget');
		expect(asWidget.backlinks).toEqual(asMcp.backlinks);
		expect(asWidget.related).toEqual(asMcp.related);
		expect(asWidget.nodeBacklinks).toEqual(asMcp.nodeBacklinks);
	});

	it('a request for a node the actor cannot see returns the fail-closed empty result', () => {
		const { state, secretId } = vault();
		// The player cannot see the dm-only Cult Plans node; relationships fail closed (empty).
		const result = getGraphRelationships(state.content, state.maps, state.session, state.permissions, PLAYER_ACTOR.id, secretId, 'navigation');
		expect(result.backlinks).toEqual([]);
		expect(result.related).toEqual([]);
		expect(result.nodeBacklinks).toEqual([]);
		expect(result.nodeRelated).toEqual([]);
		// An unknown actor likewise.
		const unknown = getGraphRelationships(state.content, state.maps, state.session, state.permissions, 'ghost', secretId, 'mcp');
		expect(unknown.backlinks).toEqual([]);
	});

	it('source-agnostic link resolution never resolves across a hidden node', () => {
		const { state } = vault();
		// "Highmoor" resolves for both; "Cult Plans" resolves for the DM but is unresolved for the player.
		expect(resolveGraphLink(state.content, state.permissions, DM_ACTOR.id, { target: 'Cult Plans' }).status).toBe('resolved');
		expect(resolveGraphLink(state.content, state.permissions, PLAYER_ACTOR.id, { target: 'Cult Plans' }).status).toBe('unresolved');
		// An unknown actor resolves nothing.
		expect(resolveGraphLink(state.content, state.permissions, 'ghost', { target: 'Highmoor' }).status).toBe('unresolved');
	});

	it('the result shape carries no file path, body, or source kind (source-agnostic)', () => {
		const { state, targetId } = vault();
		const result = getGraphRelationships(state.content, state.maps, state.session, state.permissions, DM_ACTOR.id, targetId, 'navigation');
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('.md');
		expect(serialized).not.toContain('local-markdown');
		expect(serialized).not.toContain('dndtools.source');
	});
});

// --- Map state typing guard (the test reads the demo map state shape) ---------------------------------

describe('GRAPH-005 — the graph index composes the actor-filtered map read', () => {
	it('the demo map state is a valid MapState the graph index can consume', () => {
		const maps: MapState = createDemoMapState();
		expect(Object.keys(maps.maps).length).toBeGreaterThan(0);
	});
});

// Ensure the OBSERVER_ACTOR import is used (an observer is a non-DM that must also be fail-closed).
describe('GRAPH-006 — an observer is treated as a non-DM (fail closed)', () => {
	it('an observer never sees a dm-only related note', () => {
		const env = makeEnvironment();
		let state = base();
		const hidden = createNote(state, env, { title: 'Secret', body: 'x', visibility: 'dm-only' });
		state = hidden.state;
		const hub = createNote(state, env, { title: 'Hub', body: 'Threat from [[Secret]].', visibility: 'player-visible' });
		state = hub.state;
		const related = getGraphRelatedNotes(state.content, state.maps, state.session, state.permissions, OBSERVER_ACTOR.id, hub.id, 'widget');
		expect(related).toEqual([]);
		// And forward links via the structural index are likewise empty for the observer.
		const observerState = getGraphIndexStateForActor(state.content, state.maps, state.session, state.permissions, OBSERVER_ACTOR.id);
		expect(getGraphForwardLinksForActor(observerState, hub.id).some((n) => n.title === 'Secret')).toBe(false);
		expect(backlinksOf(observerState.index, hidden.id)).toEqual([]);
		expect(forwardLinksOf(observerState.index, hidden.id)).toEqual([]);
	});
});
