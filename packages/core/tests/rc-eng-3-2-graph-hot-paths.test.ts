import { describe, expect, it } from 'vitest';
import {
	CLUSTER_THRESHOLDS,
	GRAPH_NODE_KINDS,
	buildGraphVisualizationBase,
	buildQualityNode,
	computeGraphClusters,
	computeGraphQuality,
	dispatchCommand,
	filterGraphVisualization,
	getGraphVisualizationForActor,
	parseMarkdownNote,
	resolveWikilink,
	type ClusterInputNode,
	type CoreStateSlice,
	type GraphVisualization,
	type GraphVizFilter,
	type WikilinkTarget,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { parseNoteCached } from '../src/queries/parsed-note-cache';
import { createWikilinkResolver } from '../src/state/wikilink-graph';

/**
 * RC-ENG-3.2 — the graph hot-path optimizations must be invisible in their results. Each is checked
 * against the canonical code it replaces: the batch resolver against `resolveWikilink`, the parse memo
 * against `parseMarkdownNote`, and label propagation against the sort-per-note tally it used to run.
 */

const candidates: WikilinkTarget[] = [
	{
		id: 'a',
		title: ' Alpha ',
		aliases: ['Beta', 'same'],
		sections: [' Heading '],
		source: 'local-markdown',
		available: true,
	},
	{
		id: 'b',
		title: 'Beta',
		aliases: ['alpha'],
		sections: ['Other'],
		source: 'obsidian',
		available: false,
	},
	{
		id: 'c',
		title: 'ALPHA',
		aliases: ['alias'],
		sections: [],
		source: 'google-docs',
		available: true,
	},
	{
		id: 'd',
		title: 'École',
		aliases: ['__proto__', 'constructor'],
		sections: ['Étage'],
		source: 'local-markdown',
		available: true,
	},
	{ id: 'e', title: '', aliases: ['  '], sections: [], source: 'local-markdown', available: true },
];
const targets = [
	'Alpha',
	' alpha ',
	'ALPHA',
	'Beta',
	'same',
	'alias',
	'ÉCOLE',
	'__proto__',
	'constructor',
	'',
	'  ',
	'Missing',
];
const sections = [undefined, '', ' ', 'heading', ' Other ', 'ÉTAGE', 'absent'];

/** Deterministic PRNG so the random graphs are the same on every run. */
function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The label propagation as it was before RC-ENG-3.2: linear resolution, a sorted tally per note. */
function referencePartition(nodes: ClusterInputNode[], index: WikilinkTarget[]): string[][] {
	const known = new Set(nodes.map((n) => n.id));
	const adjacency = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
	for (const node of nodes) {
		for (const target of node.outboundTargets) {
			const r = resolveWikilink({ target }, index);
			if (r.status !== 'resolved' || r.targetId === node.id || !known.has(r.targetId)) continue;
			adjacency.get(node.id)!.add(r.targetId);
			adjacency.get(r.targetId)!.add(node.id);
		}
	}
	const ids = [...adjacency.keys()].sort((a, b) => a.localeCompare(b));
	const labels = new Map(ids.map((id) => [id, id]));
	for (let round = 0; round < CLUSTER_THRESHOLDS.maxRounds; round += 1) {
		let changed = false;
		for (const id of ids) {
			const tally = new Map<string, number>();
			for (const n of adjacency.get(id)!)
				tally.set(labels.get(n)!, (tally.get(labels.get(n)!) ?? 0) + 1);
			let best: string | null = null;
			let bestCount = 0;
			for (const [label, count] of [...tally].sort((x, y) => x[0].localeCompare(y[0]))) {
				if (count > bestCount) {
					best = label;
					bestCount = count;
				}
			}
			if (best !== null && best !== labels.get(id)) {
				labels.set(id, best);
				changed = true;
			}
		}
		if (!changed) break;
	}
	const groups = new Map<string, string[]>();
	for (const [id, label] of labels) groups.set(label, [...(groups.get(label) ?? []), id]);
	return [...groups.values()].map((g) => g.sort()).sort((x, y) => x[0]!.localeCompare(y[0]!));
}

describe('RC-ENG-3.2 graph hot paths', () => {
	it('resolves every link exactly as the canonical resolver does', () => {
		let checks = 0;
		for (const index of [
			candidates,
			[...candidates].reverse(),
			candidates.slice(1),
			[],
			candidates.filter((c) => c.available),
		]) {
			const resolve = createWikilinkResolver(index);
			for (const target of targets) {
				for (const section of sections) {
					expect(resolve({ target, section })).toEqual(resolveWikilink({ target, section }, index));
					checks += 1;
				}
			}
		}
		expect(checks).toBe(5 * targets.length * sections.length);
	});

	it('builds a fresh index per candidate snapshot', () => {
		const before = createWikilinkResolver(candidates);
		const renamed = candidates.map((c) => ({ ...c, title: `${c.title} renamed`, aliases: [] }));
		const after = createWikilinkResolver(renamed);
		expect(before({ target: 'Beta' })).toEqual(resolveWikilink({ target: 'Beta' }, candidates));
		expect(after({ target: 'Beta' })).toEqual({ status: 'unresolved' });
		expect(after({ target: 'Beta renamed' })).toEqual(
			resolveWikilink({ target: 'Beta renamed' }, renamed),
		);
	});

	it('clusters random linked graphs into the same arcs as the sorted tally', () => {
		for (let seed = 1; seed <= 60; seed += 1) {
			const random = mulberry32(seed);
			const size = 2 + Math.floor(random() * 40);
			const titles = Array.from({ length: size }, (_, i) => `Note ${i}`);
			const nodes: ClusterInputNode[] = titles.map((title, i) => ({
				// Shuffled ids so id order and title order disagree.
				id: `n${Math.floor(random() * 1e6)}-${i}`,
				title,
				aliases: random() < 0.1 ? [titles[Math.floor(random() * size)]!] : [],
				outboundTargets: Array.from(
					{ length: Math.floor(random() * 4) },
					() => titles[Math.floor(random() * size)]!,
				),
				updatedAt: '2026-09-01T00:00:00Z',
			}));
			const index: WikilinkTarget[] = nodes.map((n) => ({
				id: n.id,
				title: n.title,
				aliases: n.aliases,
				sections: [],
				source: 'local-markdown',
				available: true,
			}));
			const report = computeGraphClusters(nodes, index, { now: '2026-09-23T00:00:00Z' });
			const partition = report.clusters
				.map((c) => [...c.memberIds].sort())
				.sort((x, y) => x[0]!.localeCompare(y[0]!));
			expect(partition).toEqual(referencePartition(nodes, index));
		}
	});

	it('reports unresolved links and scores through the batch resolver', () => {
		const nodes = candidates.map((c) => ({
			id: c.id,
			title: c.title,
			aliases: c.aliases,
			outboundTargets: targets,
		}));
		const report = computeGraphQuality(nodes, candidates);
		for (const score of report.scores) {
			const node = nodes.find((n) => n.id === score.itemId)!;
			const resolved = new Set(
				node.outboundTargets
					.map((target) => resolveWikilink({ target }, candidates))
					.flatMap((r) => (r.status === 'resolved' && r.targetId !== node.id ? [r.targetId] : [])),
			);
			expect(score.inputs.outboundResolvedCount).toBe(resolved.size);
		}
	});

	it('memoizes note parsing without sharing mutable results', () => {
		const text =
			'---\naliases: [One, Two]\ntags: [x]\n---\nBody #inline [[Target#Part|Shown]] [[Other]]';
		const first = parseNoteCached(text);
		expect(first).toEqual(parseMarkdownNote(text));
		first.aliases.push('mutated');
		first.tags.length = 0;
		first.wikilinks[0]!.target = 'mutated';
		(first.properties['aliases'] as string[]).push('mutated');
		const second = parseNoteCached(text);
		expect(second).toEqual(parseMarkdownNote(text));
		expect(second.aliases).not.toBe(first.aliases);
		expect(parseNoteCached('plain body')).toEqual(parseMarkdownNote('plain body'));
	});
});

/** A linked vault with mixed-case and accented titles, folders, tags and hidden notes. */
function vizVault(): CoreStateSlice {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const titles = Array.from(
		{ length: 40 },
		(_, i) => [`note ${i}`, `Note ${i}`, `École ${i}`, `zeta ${i}`][i % 4]!,
	);
	titles.forEach((title, i) => {
		const result = dispatchCommand(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'note',
				title,
				body: `${i % 3 === 0 ? '#lore ' : ''}See [[${titles[(i + 1) % 40]}]] and [[${titles[(i * 7) % 40]}]].`,
				visibility: i % 5 === 0 ? 'dm-only' : 'player-visible',
				fields: i % 2 === 0 ? { 'dndtools.folder': i % 4 === 0 ? 'Places' : 'People' } : {},
			},
		} as Parameters<typeof dispatchCommand>[2]);
		if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
		state = result.nextState;
	});
	return state;
}

/**
 * The pre-split semantics, written out independently: filter the unfiltered read's nodes, keep edges
 * between survivors, recount degree, then sort (kind, title, id) and (from, to, via).
 */
function filteredAfterTheFact(
	full: GraphVisualization,
	filter: GraphVizFilter,
): GraphVisualization {
	const needle = filter.text?.trim().toLowerCase() ?? '';
	const nodes = full.nodes.filter(
		(n) =>
			(filter.folder === undefined || n.folder === filter.folder) &&
			(filter.tags ?? []).every((tag) => n.tags.includes(tag)) &&
			(!filter.kinds || filter.kinds.includes(n.kind)) &&
			(needle === '' ||
				n.title.toLowerCase().includes(needle) ||
				(n.folder ?? '').toLowerCase().includes(needle) ||
				n.tags.some((tag) => tag.includes(needle))),
	);
	const ids = new Set(nodes.map((n) => n.id));
	const edges = full.edges.filter(
		(e) =>
			ids.has(e.fromId) &&
			ids.has(e.toId) &&
			(!filter.relationships || filter.relationships.includes(e.relationship)),
	);
	const degree = (id: string) => edges.filter((e) => e.fromId === id || e.toId === id).length;
	return {
		...full,
		nodes: nodes
			.map((n) => ({ ...n, degree: degree(n.id) }))
			.sort(
				(a, b) =>
					GRAPH_NODE_KINDS.indexOf(a.kind) - GRAPH_NODE_KINDS.indexOf(b.kind) ||
					a.title.localeCompare(b.title) ||
					a.id.localeCompare(b.id),
			),
		edges: [...edges].sort(
			(a, b) =>
				a.fromId.localeCompare(b.fromId) ||
				a.toId.localeCompare(b.toId) ||
				a.via.localeCompare(b.via),
		),
	};
}

describe('RC-ENG-3.2 graph visualization base + filter', () => {
	const filters: GraphVizFilter[] = [
		{},
		{ text: 'note 1' },
		{ text: '  ÉCOLE ' },
		{ text: 'places' },
		{ kinds: ['note'] },
		{ kinds: ['map'] },
		{ tags: ['lore'] },
		{ folder: 'People', text: 'zeta' },
		{ relationships: ['poi-link'] },
		{ text: 'no such node' },
	];

	it('filters a reused base exactly as a fresh read, for every actor and filter', () => {
		const state = vizVault();
		for (const actorId of [DM_ACTOR.id, PLAYER_ACTOR.id, 'actor-unknown']) {
			const base = buildGraphVisualizationBase(
				state.content,
				state.maps,
				state.session,
				state.permissions,
				actorId,
				'local-vault',
			);
			const full = getGraphVisualizationForActor(
				state.content,
				state.maps,
				state.session,
				state.permissions,
				actorId,
				'local-vault',
			);
			if (actorId === DM_ACTOR.id) expect(full.nodes.length).toBe(40);
			if (actorId === PLAYER_ACTOR.id) expect(full.nodes.length).toBe(32);
			for (const filter of filters) {
				const result = filterGraphVisualization(base, filter);
				expect(result).toEqual(filteredAfterTheFact(full, filter));
				expect(result).toEqual(
					getGraphVisualizationForActor(
						state.content,
						state.maps,
						state.session,
						state.permissions,
						actorId,
						'local-vault',
						filter,
					),
				);
			}
		}
	});

	it('returns fresh results that cannot change the base or each other', () => {
		const state = vizVault();
		const base = buildGraphVisualizationBase(
			state.content,
			state.maps,
			state.session,
			state.permissions,
			DM_ACTOR.id,
			'local-vault',
		);
		const first = filterGraphVisualization(base, {});
		const snapshot = structuredClone(first);
		const tagged = first.nodes.find((n) => n.tags.length > 0)!;
		tagged.tags.push('mutated');
		tagged.title = 'mutated';
		first.nodes.reverse();
		first.edges[0]!.via = 'mutated';
		first.facets.tags.push('mutated');
		first.sourceDiagnostics.push({ ...first.sourceDiagnostics[0]! });
		expect(filterGraphVisualization(base, {})).toEqual(snapshot);
	});
});

describe('RC-ENG-3.2 quality nodes from parsed links', () => {
	it('builds the same node from a parsed note as from its body', () => {
		for (const text of [
			'---\naliases: [Old Name]\n---\nSee [[A]], [[B#Part|b]] and [[A]].',
			'No links here.',
			'`[[not code]]` [[École]] [[ spaced ]] [[x|y]]',
		]) {
			const parsed = parseMarkdownNote(text);
			const input = { id: 'n', title: 'N', aliases: parsed.aliases, body: parsed.body };
			expect(buildQualityNode({ ...input, wikilinks: parsed.wikilinks })).toEqual(
				buildQualityNode(input),
			);
		}
	});
});
