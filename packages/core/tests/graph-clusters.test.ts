import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CLUSTER_THRESHOLDS,
	computeGraphClusters,
	dispatchCommand,
	getGraphClustersForActor,
	type ClusterInputNode,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type WikilinkTarget,
} from '../src';

/**
 * RC-KNW-4.1 — CLUSTERS AND MOMENTUM. Deterministic label-propagation communities over the actor-visible
 * resolved-link graph, each arc scored by MOMENTUM (recent mutations ÷ cluster size) and flagged DORMANT
 * when nothing in it moved. Both halves are covered: the pure engine (explicit records, explicit `now`)
 * and the actor-filtered query path, including the non-leak — a DM-only note must not appear in, or shift,
 * a player's arcs.
 */

const NOW = '2026-06-20T12:00:00.000Z';
const RECENT = '2026-06-18T12:00:00.000Z'; // 2 days old — inside the 14-day window
const OLD = '2026-01-01T12:00:00.000Z'; // ~6 months old — outside it

function node(
	overrides: Partial<ClusterInputNode> & Pick<ClusterInputNode, 'id' | 'title'>,
): ClusterInputNode {
	return { aliases: [], outboundTargets: [], updatedAt: OLD, ...overrides };
}

function target(
	overrides: Partial<WikilinkTarget> & Pick<WikilinkTarget, 'id' | 'title'>,
): WikilinkTarget {
	return { aliases: [], sections: [], source: 'local-markdown', available: true, ...overrides };
}

/** Candidate index mirroring a set of nodes — the shape the query layer builds for real. */
function candidatesFor(nodes: readonly ClusterInputNode[]): WikilinkTarget[] {
	return nodes.map((n) => target({ id: n.id, title: n.title, aliases: n.aliases }));
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
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', ...payload })),
	);
	return { state: result.nextState, id: (result.events[0] as { itemId: string }).itemId };
}

// --- The PURE engine --------------------------------------------------------------------------------

describe('RC-KNW-4.1 — pure engine: label-propagation communities', () => {
	it('groups two link-connected components into two separate clusters', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'] }),
			node({ id: 'n-b', title: 'Brine Court', outboundTargets: ['Cinder Pact'] }),
			node({ id: 'n-c', title: 'Cinder Pact' }),
			node({ id: 'n-x', title: 'Xanthe', outboundTargets: ['Yarrow'] }),
			node({ id: 'n-y', title: 'Yarrow' }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		const membership = report.clusters.map((c) => c.memberIds).sort((a, b) => a.length - b.length);
		expect(membership).toEqual([
			['n-x', 'n-y'],
			['n-a', 'n-b', 'n-c'],
		]);
	});

	it('a note with no resolvable visible link is its own singleton cluster', () => {
		const nodes = [node({ id: 'n-lonely', title: 'Lonely' })];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0]).toMatchObject({ memberIds: ['n-lonely'], size: 1 });
	});

	it('links are followed in BOTH directions — a back-link joins the same arc', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall' }),
			node({ id: 'n-b', title: 'Brine Court', outboundTargets: ['Ashfall'] }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0]!.memberIds).toEqual(['n-a', 'n-b']);
	});

	it('a link that resolves to nothing visible does NOT join two arcs', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['A Note That Does Not Exist'] }),
			node({ id: 'n-b', title: 'Brine Court' }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.clusters.map((c) => c.memberIds)).toEqual([['n-a'], ['n-b']]);
	});

	it('names the cluster after its highest intra-cluster degree note (the anchor)', () => {
		const nodes = [
			node({ id: 'n-hub', title: 'Saltreach' }),
			node({ id: 'n-1', title: 'Dock Ward', outboundTargets: ['Saltreach'] }),
			node({ id: 'n-2', title: 'Ebb Market', outboundTargets: ['Saltreach'] }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.clusters[0]).toMatchObject({ label: 'Saltreach', anchorId: 'n-hub' });
	});

	it('is DETERMINISTIC — the same graph under a different id order clusters identically', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'] }),
			node({ id: 'n-b', title: 'Brine Court' }),
			node({ id: 'n-c', title: 'Cinder Pact', outboundTargets: ['Ashfall'] }),
		];
		const forward = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		const reversed = computeGraphClusters([...nodes].reverse(), candidatesFor(nodes), { now: NOW });
		expect(reversed).toEqual(forward);
	});
});

describe('RC-KNW-4.1 — pure engine: momentum and dormant arcs', () => {
	it('momentum is recent mutations ÷ cluster size', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'], updatedAt: RECENT }),
			node({ id: 'n-b', title: 'Brine Court', outboundTargets: ['Cinder Pact'], updatedAt: OLD }),
			node({ id: 'n-c', title: 'Cinder Pact', updatedAt: OLD }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.clusters[0]).toMatchObject({
			size: 3,
			recentMutations: 1,
			momentum: 0.333,
			dormant: false,
		});
	});

	it('an arc where nothing moved inside the window is DORMANT, and reports when it was last touched', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'], updatedAt: OLD }),
			node({ id: 'n-b', title: 'Brine Court', updatedAt: '2026-02-02T00:00:00.000Z' }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.dormantArcs).toHaveLength(1);
		expect(report.dormantArcs[0]).toMatchObject({
			momentum: 0,
			dormant: true,
			lastTouchedAt: '2026-02-02T00:00:00.000Z',
		});
	});

	it('a single quiet note is not reported as a dormant ARC (one note is not a storyline)', () => {
		const nodes = [node({ id: 'n-lonely', title: 'Lonely', updatedAt: OLD })];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.clusters[0]!.dormant).toBe(true);
		expect(report.dormantArcs).toEqual([]);
	});

	it('dormant arcs are listed oldest-touched first — the arc most owed a scene', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'], updatedAt: OLD }),
			node({ id: 'n-b', title: 'Brine Court', updatedAt: OLD }),
			node({
				id: 'n-c',
				title: 'Cinder Pact',
				outboundTargets: ['Dawn Vault'],
				updatedAt: '2026-05-01T00:00:00.000Z',
			}),
			node({ id: 'n-d', title: 'Dawn Vault', updatedAt: '2026-05-01T00:00:00.000Z' }),
		];
		const report = computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW });
		expect(report.dormantArcs.map((c) => c.label)).toEqual(['Ashfall', 'Cinder Pact']);
	});

	it('honours an explicit recency window, and reports which one it used', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'], updatedAt: OLD }),
			node({ id: 'n-b', title: 'Brine Court', updatedAt: OLD }),
		];
		const wide = computeGraphClusters(nodes, candidatesFor(nodes), {
			now: NOW,
			recentWindowDays: 365,
		});
		expect(wide.recentWindowDays).toBe(365);
		expect(wide.clusters[0]).toMatchObject({ recentMutations: 2, momentum: 1, dormant: false });
		expect(computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW }).recentWindowDays).toBe(
			CLUSTER_THRESHOLDS.recentWindowDays,
		);
	});

	it('reads no clock — a later `now` turns a once-busy arc dormant with no other input change', () => {
		const nodes = [
			node({ id: 'n-a', title: 'Ashfall', outboundTargets: ['Brine Court'], updatedAt: RECENT }),
			node({ id: 'n-b', title: 'Brine Court', updatedAt: RECENT }),
		];
		expect(
			computeGraphClusters(nodes, candidatesFor(nodes), { now: NOW }).clusters[0]!.dormant,
		).toBe(false);
		expect(
			computeGraphClusters(nodes, candidatesFor(nodes), { now: '2027-01-01T00:00:00.000Z' })
				.clusters[0]!.dormant,
		).toBe(true);
	});
});

// --- The ACTOR-FILTERED query path ------------------------------------------------------------------

describe('RC-KNW-4.1 — actor-filtered clusters', () => {
	function vault(): { state: CoreStateSlice; dmOnlyId: string } {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const primer = createNote(state, env, {
			title: 'Campaign Primer',
			body: 'See [[Harbour Watch]] and [[Crypt Rumours]].',
			visibility: 'player-visible',
		});
		state = primer.state;
		const watch = createNote(state, env, {
			title: 'Harbour Watch',
			body: 'Patrols out of [[Campaign Primer]].',
			visibility: 'player-visible',
		});
		state = watch.state;
		// DM-only: it links INTO the player-visible arc, so if it leaked it would enlarge the cluster.
		const crypt = createNote(state, env, {
			title: 'Crypt Rumours',
			body: 'The truth behind [[Harbour Watch]].',
			visibility: 'dm-only',
		});
		state = crypt.state;
		return { state, dmOnlyId: crypt.id };
	}

	it('the DM sees the DM-only note inside the arc', () => {
		const { state, dmOnlyId } = vault();
		const report = getGraphClustersForActor(state.content, state.permissions, DM_ACTOR.id, NOW);
		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0]!.memberIds).toContain(dmOnlyId);
		expect(report.clusters[0]!.size).toBe(3);
	});

	it('a player never sees the DM-only note — not as a member, not as cluster SIZE', () => {
		const { state, dmOnlyId } = vault();
		const report = getGraphClustersForActor(state.content, state.permissions, PLAYER_ACTOR.id, NOW);
		const serialized = JSON.stringify(report);
		expect(serialized).not.toContain(dmOnlyId);
		expect(serialized).not.toContain('Crypt Rumours');
		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0]!.size).toBe(2);
	});

	it('an unknown actor gets the empty report (fail closed)', () => {
		const { state } = vault();
		const report = getGraphClustersForActor(state.content, state.permissions, 'actor-ghost', NOW);
		expect(report.clusters).toEqual([]);
		expect(report.dormantArcs).toEqual([]);
	});

	it('a freshly authored vault has momentum, not dormant arcs', () => {
		const { state } = vault();
		// The fixture clock stamps notes at 2026-06-03; ask two days later.
		const report = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'2026-06-05T00:00:00.000Z',
		);
		expect(report.clusters[0]!.momentum).toBe(1);
		expect(report.dormantArcs).toEqual([]);
	});
});
