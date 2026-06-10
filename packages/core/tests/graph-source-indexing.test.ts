import { describe, expect, it } from 'vitest';
import {
	buildSourceGraphIndex,
	combineSourceStatuses,
	configuredSourceFromRecords,
	createDemoMapState,
	dispatchCommand,
	emptySourceGraphIndex,
	getSourceGraphDiagnosticsForActor,
	getSourceGraphIndexForActor,
	getSourceGraphNodesForActor,
	getSourceRefForActor,
	isSourceGraphPartial,
	isSourceGraphPartialForActor,
	publishSourceFreshness,
	sourceFreshnessStatus,
	sourceGraphNodes,
	sourceRefForNode,
	unknownGraphSourceRef,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type GraphSourceKind,
	type SourceGraphIndex,
	type SourceGraphNodeRecord,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * GRAPH-001 / GRAPH-008 — SOURCE INDEXING. The Graph Engine indexes the link graph FROM the content sources
 * (local files, Obsidian notes, Google Docs documents) ACROSS all configured sync sources, PRESERVES each
 * node's source-specific identifiers + revision metadata to reconcile it back to its source, and marks the
 * cached graph PARTIAL/STALE when a source is not cached/available offline — without blocking the cached
 * relationships that DID index. Tests are the primary evidence.
 *
 * The keystone proofs:
 *   - GRAPH-001 AC1: cached relationships across local/Obsidian/Google-Docs sources are queryable offline.
 *   - GRAPH-001 AC2: a player's source graph omits hidden nodes + their edges (fail closed).
 *   - GRAPH-001 AC3: a configured source that is not cached marks the graph partial without blocking the
 *     visible cached relationships.
 *   - GRAPH-008 AC1: a Google-Docs node carries its source id + document id (+ revision) metadata.
 *   - GRAPH-008 AC2: Obsidian aliases resolve without overwriting user-authored frontmatter.
 *   - GRAPH-008 AC3: when source metadata is unavailable offline, diagnostics show cached metadata as
 *     stale/partial rather than silently recomputed.
 *
 * Determinism + fail-closed are HARD requirements: identical sources produce identical indexes; a player
 * never discovers a hidden node through a source ref or diagnostic; an unavailable source is never `fresh`.
 */

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

function srcRec(
	overrides: Partial<SourceGraphNodeRecord> &
		Pick<SourceGraphNodeRecord, 'id' | 'title'> & {
			sourceId?: string;
			sourceKind?: GraphSourceKind;
			externalId?: string | null;
			documentId?: string | null;
			revisionId?: string | null;
		},
): SourceGraphNodeRecord {
	const {
		sourceId = 'local-vault',
		sourceKind = 'local-vault',
		externalId = null,
		documentId = null,
		revisionId = null,
		...rest
	} = overrides;
	return {
		kind: 'note',
		aliases: [],
		outboundTargets: [],
		revision: 1,
		source: { sourceId, sourceKind, externalId, documentId, revisionId },
		...rest,
	};
}

// --- The PURE engine: full build over sources + provenance --------------------------------------------

describe('GRAPH-001 — pure engine: build the graph FROM sources across all configured sync sources', () => {
	it('builds the SAME structural nodes/edges as the GRAPH-005 engine and tags every node with provenance', () => {
		const records: SourceGraphNodeRecord[] = [
			srcRec({
				id: 'n-a',
				title: 'Quest Log',
				outboundTargets: ['Highmoor'],
				sourceId: 'obsidian-1',
				sourceKind: 'obsidian-vault',
				externalId: 'lore/QuestLog.md',
			}),
			srcRec({
				id: 'n-b',
				title: 'Highmoor',
				aliases: ['The Keep'],
				sourceId: 'gdocs-1',
				sourceKind: 'google-docs',
				externalId: 'drive-file-123',
				documentId: 'drive-file-123',
				revisionId: 'rev-7',
			}),
		];
		const sources = [
			configuredSourceFromRecords('obsidian-1', 'obsidian-vault', [records[0]!], true),
			configuredSourceFromRecords('gdocs-1', 'google-docs', [records[1]!], true),
		];
		const index = buildSourceGraphIndex(records, sources);
		// One structural graph: the edge resolves exactly as GRAPH-005 would resolve it.
		expect(index.graph.edges).toEqual([{ fromId: 'n-a', toId: 'n-b', via: 'Highmoor' }]);
		// Every node carries its provenance.
		expect(index.sourceRefs['n-a']!.sourceKind).toBe('obsidian-vault');
		expect(index.sourceRefs['n-b']).toEqual({
			sourceId: 'gdocs-1',
			sourceKind: 'google-docs',
			externalId: 'drive-file-123',
			documentId: 'drive-file-123',
			revisionId: 'rev-7',
		});
	});

	it('is DETERMINISTIC: identical sources produce identical indexes (reindex reproducibility)', () => {
		const build = (): SourceGraphIndex => {
			const records: SourceGraphNodeRecord[] = [
				srcRec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'], sourceId: 's1' }),
				srcRec({ id: 'n-b', title: 'Highmoor', sourceId: 's1' }),
			];
			return buildSourceGraphIndex(records, [
				configuredSourceFromRecords('s1', 'local-vault', records, true),
			]);
		};
		// Two independent rebuilds of the same sources are byte-identical (reindex reproducibility).
		expect(build()).toEqual(build());
	});

	it('a source-change produces a CONSISTENT index: adding a link adds exactly one edge', () => {
		const before = buildSourceGraphIndex(
			[
				srcRec({ id: 'n-a', title: 'Quest Log' }),
				srcRec({ id: 'n-b', title: 'Highmoor' }),
			],
			[],
		);
		const after = buildSourceGraphIndex(
			[
				srcRec({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmoor'] }),
				srcRec({ id: 'n-b', title: 'Highmoor' }),
			],
			[],
		);
		expect(before.graph.edges).toEqual([]);
		expect(after.graph.edges).toEqual([{ fromId: 'n-a', toId: 'n-b', via: 'Highmoor' }]);
	});

	it('the empty index is fresh and carries no nodes/sources', () => {
		const empty = emptySourceGraphIndex();
		expect(empty.graph.nodes).toEqual([]);
		expect(empty.sources).toEqual([]);
		expect(empty.status).toBe('fresh');
		expect(isSourceGraphPartial(empty)).toBe(false);
	});
});

// --- GRAPH-008: source-specific identifiers + revision metadata reconcile a node back to its source -----

describe('GRAPH-008 — preserve source-specific identifiers + revision metadata', () => {
	it('AC1: a Google Docs node carries its source id and document id (+ revision) metadata', () => {
		const records: SourceGraphNodeRecord[] = [
			srcRec({
				id: 'gdoc-abc',
				title: 'Session Recap',
				sourceId: 'gdocs-main',
				sourceKind: 'google-docs',
				externalId: 'abc',
				documentId: 'abc',
				revisionId: 'rev-42',
			}),
		];
		const index = buildSourceGraphIndex(records, [
			configuredSourceFromRecords('gdocs-main', 'google-docs', records, true),
		]);
		const ref = sourceRefForNode(index, 'gdoc-abc');
		expect(ref).not.toBeNull();
		expect(ref!.sourceId).toBe('gdocs-main');
		expect(ref!.documentId).toBe('abc');
		expect(ref!.revisionId).toBe('rev-42');
		// The source-aware node projection joins the structural node with its provenance.
		const nodes = sourceGraphNodes(index);
		expect(nodes[0]!.source.documentId).toBe('abc');
	});

	it('a node with no recorded provenance carries the fail-closed unknown ref (no guessed source)', () => {
		const ref = unknownGraphSourceRef('local-vault');
		expect(ref).toEqual({
			sourceId: 'local-vault',
			sourceKind: 'local-vault',
			externalId: null,
			documentId: null,
			revisionId: null,
		});
	});

	it('a node id absent from the visible index resolves to null (fail closed, no leak)', () => {
		const index = buildSourceGraphIndex([srcRec({ id: 'n-a', title: 'A' })], []);
		expect(sourceRefForNode(index, 'n-missing')).toBeNull();
	});
});

// --- Per-source freshness + partial/stale (reusing the SRCH cursor convention) ------------------------

describe('GRAPH-001 AC3 / GRAPH-008 AC3 — per-source freshness marks partial/stale, never fresh-when-unavailable', () => {
	it('an available source that contributed records is FRESH', () => {
		const records = [srcRec({ id: 'n-a', title: 'A', revision: 3 })];
		const source = configuredSourceFromRecords('s1', 'local-vault', records, true);
		expect(sourceFreshnessStatus(source)).toBe('fresh');
		expect(publishSourceFreshness(source).behindBy).toBe(0);
	});

	it('an UNAVAILABLE (not-cached) source is STALE (fail closed — never fresh)', () => {
		const source = configuredSourceFromRecords('remote-1', 'google-docs', [], false);
		expect(sourceFreshnessStatus(source)).not.toBe('fresh');
		expect(publishSourceFreshness(source).available).toBe(false);
	});

	it('combineSourceStatuses takes the WORST status (one not-cached source marks the whole graph partial)', () => {
		expect(combineSourceStatuses(['fresh', 'fresh'])).toBe('fresh');
		expect(combineSourceStatuses(['fresh', 'partial'])).toBe('partial');
		expect(combineSourceStatuses(['fresh', 'stale'])).toBe('stale');
		expect(combineSourceStatuses([])).toBe('fresh');
	});

	it('the overall index is PARTIAL/STALE when any source is unavailable, but the cached nodes still serve', () => {
		const cached = [srcRec({ id: 'n-a', title: 'A', sourceId: 'local-vault' })];
		const index = buildSourceGraphIndex(cached, [
			configuredSourceFromRecords('local-vault', 'local-vault', cached, true),
			// A configured remote source whose content was never cached on this offline device.
			configuredSourceFromRecords('gdocs-remote', 'google-docs', [], false),
		]);
		// The cached relationships are STILL present (not blocked).
		expect(index.graph.nodes.map((n) => n.id)).toEqual(['n-a']);
		// But the overall index signals partial/stale because a source is not cached.
		expect(isSourceGraphPartial(index)).toBe(true);
	});
});

// --- ACTOR-FILTERED: build the source graph from the real content/map reads (visibility non-leak) ------

describe('GRAPH-001 AC1/AC2 — the actor-filtered source graph from local/Obsidian/Google-Docs notes', () => {
	function vault(): { state: CoreStateSlice; env: CoreEnvironment; targetId: string; secretId: string; gdocId: string } {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		// A player-visible LOCAL note (the link target).
		const target = createNote(state, env, {
			title: 'Highmoor',
			body: 'The keep stands.',
			visibility: 'player-visible',
			fields: { sourcePath: 'lore/Highmoor.md' },
		});
		state = target.state;
		// A DM-ONLY note that links the target (a hidden node + hidden edge).
		const secret = createNote(state, env, {
			title: 'Cult Plans',
			body: 'The cult marches on [[Highmoor]] at dawn.',
			visibility: 'dm-only',
			fields: { sourcePath: 'secret/Cult.md' },
		});
		state = secret.state;
		// A player-visible GOOGLE DOCS note that links the target (a different-source visible relationship).
		const gdoc = createNote(state, env, {
			title: 'Party Journal',
			body: 'We must defend [[Highmoor]].',
			visibility: 'player-visible',
			fields: {
				'dndtools.sourceId': 'gdocs-main',
				'dndtools.sourceKind': 'google-docs',
				'dndtools.documentId': 'drive-journal-1',
				'dndtools.revisionId': 'rev-3',
			},
		});
		state = gdoc.state;
		return { state, env, targetId: target.id, secretId: secret.id, gdocId: gdoc.id };
	}

	it('AC1: cached relationships across sources are queryable; the Google-Docs node carries its provenance', () => {
		const { state, targetId, gdocId } = vault();
		const dm = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			'local-vault',
		);
		// The Google-Docs note → Highmoor edge is queryable from the cached graph (offline, zero network).
		expect(dm.graph.edges).toContainEqual({ fromId: gdocId, toId: targetId, via: 'Highmoor' });
		// GRAPH-008 AC1: the Google-Docs node carries source id + document id + revision.
		const ref = getSourceRefForActor(dm, gdocId);
		expect(ref).toEqual({
			sourceId: 'gdocs-main',
			sourceKind: 'google-docs',
			externalId: 'drive-journal-1',
			documentId: 'drive-journal-1',
			revisionId: 'rev-3',
		});
		// The two sources (local + Google Docs) are both indexed across.
		expect(dm.sources.map((s) => s.sourceId).sort()).toEqual(['gdocs-main', 'local-vault']);
	});

	it('AC2: the player source graph OMITS the hidden node, its edge, AND its source ref (fail closed)', () => {
		const { state, secretId } = vault();
		const player = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			'local-vault',
		);
		const serialized = JSON.stringify(player);
		// The hidden node id, title, and its source PATH never reach the player anywhere in the index.
		expect(serialized).not.toContain(secretId);
		expect(serialized).not.toContain('Cult Plans');
		expect(serialized).not.toContain('secret/Cult.md');
		// No source ref for the hidden node, and no edge references it.
		expect(getSourceRefForActor(player, secretId)).toBeNull();
		expect(player.graph.edges.some((e) => e.fromId === secretId || e.toId === secretId)).toBe(false);
	});

	it('the DM source graph DOES carry the hidden node + its provenance (DM authority by role)', () => {
		const { state, secretId } = vault();
		const dm = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			'local-vault',
		);
		expect(getSourceRefForActor(dm, secretId)).not.toBeNull();
		expect(getSourceRefForActor(dm, secretId)!.externalId).toBe('secret/Cult.md');
	});

	it('the source-aware node projection joins every visible node with its provenance, deterministically', () => {
		const { state, gdocId } = vault();
		const player = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			'local-vault',
		);
		const nodes = getSourceGraphNodesForActor(player);
		// Every projected node has a source ref, and none names the hidden node.
		expect(nodes.length).toBeGreaterThan(0);
		expect(nodes.every((n) => n.source !== undefined)).toBe(true);
		const gdocNode = nodes.find((n) => n.id === gdocId);
		expect(gdocNode!.source.sourceKind).toBe('google-docs');
		// Projection is deterministic across calls.
		expect(getSourceGraphNodesForActor(player)).toEqual(nodes);
	});

	it('an unknown/unauthenticated actor gets the empty index (fail closed)', () => {
		const { state } = vault();
		const result = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			'ghost',
			'local-vault',
		);
		expect(result).toEqual(emptySourceGraphIndex());
	});

	it('is DETERMINISTIC per actor: two builds over the same state are identical (reindex reproducibility)', () => {
		const { state } = vault();
		const build = () =>
			getSourceGraphIndexForActor(
				state.content,
				state.maps,
				state.session,
				state.permissions,
				PLAYER_ACTOR.id,
				'local-vault',
			);
		expect(build()).toEqual(build());
	});
});

// --- GRAPH-008 AC2: aliases resolve without overwriting user-authored frontmatter ---------------------

describe('GRAPH-008 AC2 — Obsidian aliases resolve without overwriting user frontmatter', () => {
	it('a note whose body aliases resolve a link, with user frontmatter left intact', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		// An Obsidian note with user frontmatter AND an aliases property; the alias resolves the link.
		const target = createNote(state, env, {
			title: 'Highmoor',
			body: '---\nauthor: Trent\naliases: [The Keep]\nstatus: canon\n---\nThe keep stands.',
			visibility: 'player-visible',
			fields: {
				author: 'Trent', // user frontmatter preserved as a field — must NOT be overwritten
				'dndtools.sourceId': 'obsidian-1',
				'dndtools.sourceKind': 'obsidian-vault',
				'dndtools.sourcePath': 'lore/Highmoor.md',
			},
		});
		state = target.state;
		// A second note links the target by its ALIAS ("The Keep"), not its title.
		const linker = createNote(state, env, {
			title: 'Journal',
			body: 'We defend [[The Keep]].',
			visibility: 'player-visible',
		});
		state = linker.state;

		const index = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			'local-vault',
		);
		// The alias resolved: Journal → Highmoor via "The Keep".
		expect(index.graph.edges).toContainEqual({ fromId: linker.id, toId: target.id, via: 'The Keep' });
		// The user-authored frontmatter field is untouched by indexing (read-only): the stored item still
		// carries `author: Trent`.
		expect(state.content.items[target.id]!.fields['author']).toBe('Trent');
	});
});

// --- GRAPH-001 AC3 / GRAPH-008 AC3: partial/stale diagnostics when a source is not cached offline -----

describe('GRAPH-001 AC3 / GRAPH-008 AC3 — a not-cached source marks the graph partial; diagnostics show stale', () => {
	function vault(): { state: CoreStateSlice } {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		state = createNote(state, env, {
			title: 'Highmoor',
			body: 'The keep stands.',
			visibility: 'player-visible',
			fields: { sourcePath: 'lore/Highmoor.md' },
		}).state;
		return { state };
	}

	it('a configured but not-cached Google-Docs source marks the graph PARTIAL without blocking cached nodes', () => {
		const { state } = vault();
		const index = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			'local-vault',
			{
				configuredSources: [
					{ sourceId: 'gdocs-remote', kind: 'google-docs', available: false },
				],
			},
		);
		// The local cached relationship is STILL present (not blocked).
		expect(index.graph.nodes.some((n) => n.title === 'Highmoor')).toBe(true);
		// But the index signals partial/stale because the Google-Docs source is not cached.
		expect(isSourceGraphPartialForActor(index)).toBe(true);
	});

	it('diagnostics report the not-cached source as STALE rather than silently recomputed (no content leak)', () => {
		const { state } = vault();
		const index = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			'local-vault',
			{
				configuredSources: [
					{ sourceId: 'gdocs-remote', kind: 'google-docs', available: false },
				],
			},
		);
		const diagnostics = getSourceGraphDiagnosticsForActor(index);
		const remote = diagnostics.find((d) => d.sourceId === 'gdocs-remote');
		expect(remote).toBeDefined();
		expect(remote!.available).toBe(false);
		expect(remote!.status).not.toBe('fresh');
		// The diagnostic message names the source kind + the stale-not-recomputed posture; it carries no
		// content (no note title/body), so it never leaks.
		expect(remote!.message).toContain('not cached');
		const localDiag = diagnostics.find((d) => d.sourceId === 'local-vault');
		expect(localDiag!.status).toBe('fresh');
	});

	it('when every configured source is cached, the graph is FRESH and not partial', () => {
		const { state } = vault();
		const index = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			'local-vault',
		);
		expect(index.status).toBe('fresh');
		expect(isSourceGraphPartialForActor(index)).toBe(false);
	});
});

// --- Map/POI nodes are indexed under the local-vault source -------------------------------------------

describe('GRAPH-001 — map and POI nodes are indexed from the local-vault source', () => {
	it('the demo map nodes carry the local-vault provenance and visibility still fails closed for players', () => {
		const env = makeEnvironment();
		let state = { ...buildInitialState(DM_ACTOR, PLAYER_ACTOR), maps: createDemoMapState() };
		// Create the linked notes so the POI→note edges can resolve.
		state = createNote(state, env, { title: 'Harbor Town', body: 'A bustling port.', visibility: 'player-visible' }).state;

		const player = getSourceGraphIndexForActor(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			'local-vault',
		);
		// The visible POI is a node with a local-vault source ref.
		const poi = getSourceRefForActor(player, 'poi-harbor-town');
		expect(poi).not.toBeNull();
		expect(poi!.sourceKind).toBe('local-vault');
		// The DM-only POI never reaches the player (fail closed).
		expect(getSourceRefForActor(player, 'poi-smugglers-cache')).toBeNull();
		expect(JSON.stringify(player)).not.toContain('poi-smugglers-cache');
	});
});
