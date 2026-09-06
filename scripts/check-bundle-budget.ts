/**
 * RC-ENG-1.2 — BUNDLE BUDGET ENFORCEMENT + ROUTE-LEVEL ANALYSIS. Reads a real production build of
 * `apps/gm-react` (a `vite build` output directory) and grades the CORE (eagerly-loaded) bundle's
 * gzip size against the `core-bundle-size` budget declared in `packages/core/src/perf/bundle-budget.ts`,
 * using the SAME `measureCoreBundleSize` the app and its tests use — CI and the budget registry can
 * never disagree about what "breach" means.
 *
 * ROUTE-LEVEL ANALYSIS: every JS asset in the build is classified CORE or LAZY from the built
 * `index.html` itself, not guessed from filenames. A `<script type="module">` or
 * `<link rel="modulepreload">` reference is something the browser fetches before the shell is
 * interactive — CORE. Every other emitted `.js` asset is a route/feature chunk Vite split out for
 * on-demand loading — LAZY, and does not count against the core-bundle budget (PERF-005 AC1: an
 * inactive/optional feature must not inflate the core path). The report lists every asset with its
 * classification and gzip size so a regression names WHICH route/chunk grew, not just THAT the total
 * did.
 *
 * FAIL CLOSED: a missing/empty dist directory is a hard error (never "0 bytes, pass"); an over-budget
 * core bundle exits non-zero so CI fails the build.
 *
 * Usage:
 *   tsx scripts/check-bundle-budget.ts [--dist apps/gm-react/dist]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { measureCoreBundleSize } from '../packages/core/src/index';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/** One emitted JS asset's route-level classification. */
export interface BundleAsset {
	readonly file: string;
	readonly category: 'core' | 'lazy';
	readonly gzipBytes: number;
}

/**
 * Classify every `.js` file under `<dist>/assets` as CORE (referenced eagerly from `index.html` via
 * a module script or a modulepreload link) or LAZY (any other emitted chunk). Asset filenames are
 * matched by their basename so a `/assets/foo.js` reference in the HTML matches the file on disk
 * regardless of the configured `base` path.
 */
export function classifyBundleAssets(
	indexHtml: string,
	assetFiles: readonly string[],
): Set<string> {
	const eager = new Set<string>();
	const refPattern = /<(?:script[^>]*\ssrc|link[^>]*\shref)=["']([^"']+\.js)["'][^>]*>/g;
	let match: RegExpExecArray | null;
	while ((match = refPattern.exec(indexHtml)) !== null) {
		const ref = match[1]!;
		const isModulePreloadOrScript =
			/\srel=["']modulepreload["']/.test(match[0]) || /<script/.test(match[0]);
		if (!isModulePreloadOrScript) continue;
		const base = ref.split('/').pop();
		if (base && assetFiles.includes(base)) eager.add(base);
	}
	return eager;
}

/** Read every `.js` asset under `<dist>/assets`, gzip it, and classify it CORE vs LAZY. */
export function analyzeBundleDist(distDir: string): BundleAsset[] {
	const assetsDir = join(distDir, 'assets');
	const indexHtmlPath = join(distDir, 'index.html');
	if (!existsSync(assetsDir) || !existsSync(indexHtmlPath)) {
		throw new Error(
			`check-bundle-budget: ${distDir} is not a built app (missing assets/ or index.html) — run vite build first`,
		);
	}
	const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
	if (jsFiles.length === 0) {
		throw new Error(`check-bundle-budget: ${assetsDir} contains no JS assets — nothing to grade`);
	}
	const indexHtml = readFileSync(indexHtmlPath, 'utf8');
	const eager = classifyBundleAssets(indexHtml, jsFiles);
	return jsFiles
		.map((file) => {
			const bytes = readFileSync(join(assetsDir, file));
			return {
				file,
				category: eager.has(file) ? ('core' as const) : ('lazy' as const),
				gzipBytes: gzipSync(bytes).length,
			};
		})
		.sort((a, b) => b.gzipBytes - a.gzipBytes);
}

/** Total gzip bytes of every CORE-classified asset — what the core-bundle-size budget grades. */
export function totalCoreGzipBytes(assets: readonly BundleAsset[]): number {
	return assets.filter((a) => a.category === 'core').reduce((sum, a) => sum + a.gzipBytes, 0);
}

function formatKiB(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main(): void {
	const args = process.argv.slice(2);
	const distFlagIndex = args.indexOf('--dist');
	const distArg = distFlagIndex >= 0 ? args[distFlagIndex + 1] : undefined;
	const distDir = resolve(REPO_ROOT, distArg ?? 'apps/gm-react/dist');

	const assets = analyzeBundleDist(distDir);
	const coreBytes = totalCoreGzipBytes(assets);
	const measurement = measureCoreBundleSize(coreBytes);

	console.log(`check-bundle-budget: route-level analysis of ${distDir}`);
	for (const asset of assets) {
		console.log(
			`  [${asset.category.padEnd(4)}] ${formatKiB(asset.gzipBytes).padStart(10)}  ${asset.file}`,
		);
	}
	console.log(
		`check-bundle-budget: core bundle = ${formatKiB(coreBytes)} gzipped across ${
			assets.filter((a) => a.category === 'core').length
		} asset(s) — verdict: ${measurement.result}`,
	);

	if (measurement.result === 'breach') {
		console.error(
			`check-bundle-budget: BREACH — core bundle ${formatKiB(coreBytes)} exceeds its budget ` +
				`(margin ${measurement.marginToTarget})`,
		);
		process.exit(1);
	}
	if (measurement.result === 'unknown' || measurement.result === 'error') {
		console.error(`check-bundle-budget: could not grade the core bundle (${measurement.result})`);
		process.exit(1);
	}
	console.log('check-bundle-budget: OK — core bundle within budget');
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	main();
}
