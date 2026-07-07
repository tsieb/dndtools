// `pnpm validate` — the whole-application validation harness.
//
// Orchestrates every check across all layers/environments into ordered, parallel
// stages, writes a consolidated report (JSON + Markdown + HTML dashboard), and
// exits non-zero if any required check fails.
//
//   pnpm validate                 # default: static + unit + build + browser + audit
//   pnpm validate --fast          # static + unit + audit only (quick signal)
//   pnpm validate --live          # + live AWS cloud validation (needs dndtools profile)
//   pnpm validate --desktop       # + packaged Electron smoke (needs a display)
//   pnpm validate --full          # everything (still capability-gated)
//   pnpm validate --layer=unit,static
//   pnpm validate --only=e2e,test:core
//   pnpm validate --skip=e2e
//   pnpm validate --list          # print the catalog and exit
//   pnpm validate --jobs=4 --no-report

import path from 'node:path';
import type { Check, Layer } from './types.ts';
import { CHECKS } from './registry.ts';
import { defaultJobs, run } from './runner.ts';
import { writeReports } from './report.ts';
import { REPO_ROOT, c, fmtDuration } from './util.ts';

const ALL_LAYERS: Layer[] = ['static', 'unit', 'build', 'browser', 'desktop', 'cloud', 'audit'];
const DEFAULT_LAYERS: Layer[] = ['static', 'unit', 'build', 'browser', 'audit'];
const FAST_LAYERS: Layer[] = ['static', 'unit', 'audit'];

function parseArgs(argv: string[]) {
	const flags = new Set<string>();
	const kv: Record<string, string> = {};
	for (const a of argv) {
		if (a.startsWith('--') && a.includes('=')) {
			const [k, v] = a.slice(2).split('=');
			kv[k] = v;
		} else if (a.startsWith('--')) {
			flags.add(a.slice(2));
		}
	}
	return { flags, kv };
}

function selectChecks(
	flags: Set<string>,
	kv: Record<string, string>,
): { checks: Check[]; label: string } {
	const only = kv.only
		?.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const skip = new Set(
		kv.skip
			?.split(',')
			.map((s) => s.trim())
			.filter(Boolean) ?? [],
	);

	if (only?.length) {
		const set = new Set(only);
		return {
			checks: CHECKS.filter((ch) => set.has(ch.id) && !skip.has(ch.id)),
			label: `only=${only.join(',')}`,
		};
	}

	const layerFlag = kv.layer?.split(',').map((s) => s.trim()) as Layer[] | undefined;
	let layers: Layer[];
	if (flags.has('full')) layers = ALL_LAYERS;
	else if (layerFlag?.length) layers = layerFlag;
	else if (flags.has('fast')) layers = [...FAST_LAYERS];
	else layers = [...DEFAULT_LAYERS];

	if (!layerFlag) {
		if ((flags.has('live') || flags.has('full')) && !layers.includes('cloud')) layers.push('cloud');
		if ((flags.has('desktop') || flags.has('full')) && !layers.includes('desktop'))
			layers.push('desktop');
	}
	const layerSet = new Set(layers);

	const explicitlyOn = (ch: Check): boolean => {
		if (!ch.offByDefault) return true;
		if (layerFlag?.includes(ch.layer)) return true; // asked for the layer by name
		if (flags.has('full')) return true;
		if (ch.layer === 'cloud') return flags.has('live');
		if (ch.layer === 'desktop') return flags.has('desktop');
		return false;
	};

	const checks = CHECKS.filter(
		(ch) => layerSet.has(ch.layer) && explicitlyOn(ch) && !skip.has(ch.id),
	);
	const label =
		(flags.has('full') ? 'full' : flags.has('fast') ? 'fast' : layers.join('+')) +
		(skip.size ? ` (skip ${[...skip].join(',')})` : '');
	return { checks, label };
}

function printList(): void {
	console.log(c.bold('\nValidation check catalog\n'));
	for (const layer of ALL_LAYERS) {
		const rows = CHECKS.filter((ch) => ch.layer === layer);
		if (!rows.length) continue;
		console.log(c.cyan(`${layer}`));
		for (const ch of rows) {
			const tags = [
				ch.offByDefault ? 'off-by-default' : '',
				ch.requires?.length ? `needs:${ch.requires.join('/')}` : '',
				ch.optional ? 'optional' : '',
			]
				.filter(Boolean)
				.join(' ');
			console.log(`  ${c.bold(ch.id.padEnd(22))} ${ch.description} ${c.gray(tags)}`);
		}
		console.log('');
	}
}

function printSummary(report: Awaited<ReturnType<typeof run>>): void {
	console.log(c.bold('\n══════════ Validation summary ══════════'));
	const icon: Record<string, (s: string) => string> = {
		pass: (s) => c.green(s),
		fail: (s) => c.red(s),
		warn: (s) => c.yellow(s),
		skip: (s) => c.gray(s),
	};
	const glyph: Record<string, string> = { pass: '✔', fail: '✘', warn: '▲', skip: '–' };
	for (const r of report.results) {
		const detail = r.status === 'skip' ? c.gray(r.skipReason ?? '') : r.summary;
		console.log(
			`${icon[r.status](glyph[r.status])} ${r.id.padEnd(24)} ${c.gray(fmtDuration(r.durationMs).padStart(7))}  ${detail}`,
		);
	}
	console.log(c.bold('────────────────────────────────────────'));
	console.log(
		`${c.green(`${report.counts.pass} pass`)} · ${c.red(`${report.counts.fail} fail`)} · ` +
			`${c.yellow(`${report.counts.warn} warn`)} · ${c.gray(`${report.counts.skip} skip`)} · ${fmtDuration(report.durationMs)}`,
	);
	console.log(
		report.ok ? c.green(c.bold('\n✔ VALIDATION PASSED')) : c.red(c.bold('\n✘ VALIDATION FAILED')),
	);
}

async function main(): Promise<void> {
	const { flags, kv } = parseArgs(process.argv.slice(2));
	if (flags.has('help') || flags.has('h')) {
		console.log(
			[
				'pnpm validate [options]',
				'  --fast            static + unit + audit only',
				'  --live            include live AWS cloud validation (needs dndtools profile)',
				'  --desktop         include packaged Electron smoke (needs a display)',
				'  --full            every layer (capability-gated)',
				'  --layer=a,b       restrict to layers: ' + ALL_LAYERS.join(','),
				'  --only=id,id      run exactly these check ids',
				'  --skip=id,id      exclude these check ids',
				'  --jobs=N          parallelism cap',
				'  --no-report       skip writing report files',
				'  --list            print the check catalog',
			].join('\n'),
		);
		return;
	}
	if (flags.has('list')) return printList();

	const { checks, label } = selectChecks(flags, kv);
	if (!checks.length) {
		console.error(c.red('No checks selected. Try --list.'));
		process.exit(2);
	}
	const jobs = kv.jobs ? Math.max(1, parseInt(kv.jobs, 10)) : defaultJobs();
	const logDir = path.join(REPO_ROOT, 'test-results/validation/logs');

	console.log(c.bold(`Running ${checks.length} check(s) · selection=${label} · jobs=${jobs}`));
	const report = await run({ checks, selectionLabel: label, logDir, jobs });
	printSummary(report);

	if (!flags.has('no-report')) {
		const outDir = path.join(REPO_ROOT, 'test-results/validation');
		const { html, md } = writeReports(report, outDir);
		console.log(
			c.cyan(`\nReport: ${path.relative(REPO_ROOT, html)}  ·  ${path.relative(REPO_ROOT, md)}`),
		);
	}
	process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
	console.error(c.red(`validate: ${err?.stack ?? err}`));
	process.exit(2);
});
