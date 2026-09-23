import { describe, expect, it } from 'vitest';
import {
	CLUSTER_THRESHOLDS,
	computeGraphClusters,
	computeGraphQuality,
	parseMarkdownNote,
	resolveWikilink,
	type ClusterInputNode,
	type WikilinkTarget,
} from '../src';
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
