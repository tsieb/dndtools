/** Validate the unapplied resolver proposal in temporary copies; never edits application source. */
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { resolveWikilink, type WikilinkTarget } from '../../packages/core/src/state/wikilink-graph';
import { computeGraphQuality } from '../../packages/core/src/state/graph-quality';
import {
	computeGraphClusters,
	type ClusterInputNode,
} from '../../packages/core/src/state/graph-clusters';

const root = fileURLToPath(new URL('../../', import.meta.url));
const patch = join(root, 'scripts/perf/proposals/rc-eng-3.2-wikilink-index.patch');
const statePath = 'packages/core/src/state';
const changed = new Set(['wikilink-graph.ts', 'graph-quality.ts', 'graph-clusters.ts']);
const patchPaths = execFileSync('git', ['apply', '--numstat', patch], { encoding: 'utf8' })
	.trim()
	.split('\n')
	.map((line) => line.split('\t')[2])
	.sort();
assert.deepEqual(patchPaths, [...changed].map((name) => `${statePath}/${name}`).sort());
const scratch = mkdtempSync(join(tmpdir(), 'rc-eng-resolver-check-'));
const copiedState = join(scratch, statePath);
const originalState = join(root, statePath);
const before = [...changed].map((name) => readFileSync(join(originalState, name)));
const now = '2026-09-20T00:00:00Z';
try {
	mkdirSync(copiedState, { recursive: true });
	for (const name of readdirSync(originalState)) {
		const original = join(originalState, name);
		const copy = join(copiedState, name);
		if (changed.has(name)) copyFileSync(original, copy);
		else symlinkSync(original, copy);
	}
	// All three patch destinations are regular copies, never symlinks to source.
	execFileSync('git', ['apply', '--check', '--unsafe-paths', `--directory=${scratch}`, patch]);
	execFileSync('git', ['apply', '--unsafe-paths', `--directory=${scratch}`, patch]);
	const draft = (await import(pathToFileURL(join(copiedState, 'wikilink-graph.ts')).href)) as {
		createWikilinkResolver: (
			candidates: readonly WikilinkTarget[],
		) => (link: Parameters<typeof resolveWikilink>[0]) => ReturnType<typeof resolveWikilink>;
	};
	const quality = (await import(pathToFileURL(join(copiedState, 'graph-quality.ts')).href)) as {
		computeGraphQuality: typeof computeGraphQuality;
	};
	const clusters = (await import(pathToFileURL(join(copiedState, 'graph-clusters.ts')).href)) as {
		computeGraphClusters: typeof computeGraphClusters;
	};
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
		{
			id: 'e',
			title: '',
			aliases: ['  '],
			sections: [],
			source: 'local-markdown',
			available: true,
		},
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
		'Private',
	];
	const sections = [undefined, '', ' ', 'heading', ' Other ', 'ÉTAGE', 'absent'];
	let resolutionChecks = 0;
	let reportChecks = 0;
	for (const input of [
		candidates,
		[...candidates].reverse(),
		candidates.slice(1),
		[],
		candidates.filter((c) => c.available),
	]) {
		const resolve = draft.createWikilinkResolver(input);
		for (const target of targets)
			for (const section of sections) {
				assert.deepEqual(resolve({ target, section }), resolveWikilink({ target, section }, input));
				resolutionChecks++;
			}
		const nodes: ClusterInputNode[] = input.map((c) => ({
			id: c.id,
			title: c.title,
			aliases: c.aliases,
			outboundTargets: targets,
			updatedAt: now,
		}));
		assert.deepEqual(quality.computeGraphQuality(nodes, input), computeGraphQuality(nodes, input));
		assert.deepEqual(
			clusters.computeGraphClusters(nodes, input, { now }),
			computeGraphClusters(nodes, input, { now }),
		);
		reportChecks += 2;
	}
	// Rebuilding for renamed/removed/availability-changed candidates must never reuse old lookups.
	const revised = candidates
		.slice(1)
		.map((c) => ({ ...c, title: `${c.title} changed`, aliases: [], available: !c.available }));
	for (const target of targets) {
		assert.deepEqual(
			draft.createWikilinkResolver(revised)({ target }),
			resolveWikilink({ target }, revised),
		);
		resolutionChecks++;
	}
	const large: WikilinkTarget[] = Array.from({ length: 2000 }, (_, i) => ({
		id: `note-${i}`,
		title: `Perf note ${i}`,
		aliases: [],
		sections: [],
		source: 'local-markdown',
		available: true,
	}));
	const nodes: ClusterInputNode[] = large.map((c, i) => ({
		id: c.id,
		title: c.title,
		aliases: [],
		updatedAt: now,
		outboundTargets: [`Perf note ${(i + 1) % 2000}`, `Perf note ${(i + 7) % 2000}`],
	}));
	assert.deepEqual(quality.computeGraphQuality(nodes, large), computeGraphQuality(nodes, large));
	assert.deepEqual(
		clusters.computeGraphClusters(nodes, large, { now }),
		computeGraphClusters(nodes, large, { now }),
	);
	reportChecks += 2;
	const samples: Record<string, number[]> = {
		qualityOriginal: [],
		qualityDraft: [],
		clustersOriginal: [],
		clustersDraft: [],
	};
	const runs = {
		qualityOriginal: () => computeGraphQuality(nodes, large),
		qualityDraft: () => quality.computeGraphQuality(nodes, large),
		clustersOriginal: () => computeGraphClusters(nodes, large, { now }),
		clustersDraft: () => clusters.computeGraphClusters(nodes, large, { now }),
	};
	for (let i = 0; i < 7; i++) {
		const entries = Object.entries(runs);
		for (const [name, run] of i % 2 ? entries.reverse() : entries) {
			const start = performance.now();
			run();
			samples[name].push(performance.now() - start);
		}
	}
	console.log(
		JSON.stringify(
			{
				kind: 'unapplied-proposal-diagnostic-not-browser-budget',
				sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
					cwd: root,
					encoding: 'utf8',
				}).trim(),
				patchSha256: createHash('sha256').update(readFileSync(patch)).digest('hex'),
				resolutionChecks,
				reportChecks,
				samples,
			},
			null,
			2,
		),
	);
} finally {
	for (const [i, name] of [...changed].entries())
		assert.deepEqual(readFileSync(join(originalState, name)), before[i]);
	rmSync(scratch, { recursive: true, force: true });
}
