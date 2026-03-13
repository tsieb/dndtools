import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { PERFORMANCE_BUDGETS, type PerformanceOperation } from '../../src/lib/types/diagnostics.js';
import { median, percentile } from './command-runner.js';

const gzip = promisify(zlib.gzip);

export type CommandTiming = {
	name: string;
	command: string;
	samplesMs: number[];
	p50Ms: number | null;
};

export type BundleAssetMetric = {
	file: string;
	rawBytes: number;
	gzipBytes: number;
};

export type BundleRouteMetric = {
	route: string;
	jsBytes: number;
	jsGzipBytes: number;
	cssBytes: number;
	cssGzipBytes: number;
	files: string[];
};

export type BundleBaseline = {
	version: 1;
	generatedAt: string;
	totals: {
		jsBytes: number;
		jsGzipBytes: number;
		cssBytes: number;
		cssGzipBytes: number;
		initialRouteJsGzipBytes: number;
	};
	largestJavaScriptAssets: BundleAssetMetric[];
	largestCssAssets: BundleAssetMetric[];
	routes: BundleRouteMetric[];
	budget: {
		initialJsGzipTargetBytes: number;
		compliant: boolean;
	};
};

export type BuildBaseline = {
	version: 1;
	generatedAt: string;
	stages: CommandTiming[];
};

export type TestBaseline = {
	version: 1;
	generatedAt: string;
	suites: CommandTiming[];
};

export type PerformanceDataset = {
	dataset: string;
	noteCount: number;
	metrics: Record<PerformanceOperation, number>;
};

export type PerformanceBaseline = {
	version: 1;
	generatedAt: string;
	budgets?: typeof PERFORMANCE_BUDGETS;
	datasets: PerformanceDataset[];
};

export type MetricsCollection = {
	bundle?: BundleBaseline;
	build?: BuildBaseline;
	test?: TestBaseline;
	performance?: PerformanceBaseline;
};

type ManifestEntry = {
	file: string;
	css?: string[];
	imports?: string[];
	dynamicImports?: string[];
};

export async function writeJson(filePath: string, data: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export async function readJson<T>(filePath: string): Promise<T> {
	const raw = await fs.readFile(filePath, 'utf-8');
	return JSON.parse(raw) as T;
}

export function summarizeTimings(
	name: string,
	command: string,
	samplesMs: number[],
): CommandTiming {
	return {
		name,
		command,
		samplesMs,
		p50Ms: median(samplesMs),
	};
}

export function buildStats(values: number[]): { p50Ms: number | null; p95Ms: number | null } {
	return {
		p50Ms: median(values),
		p95Ms: percentile(values, 0.95),
	};
}

export async function collectBundleMetrics(repoRoot: string): Promise<BundleBaseline> {
	const manifestPath = path.join(
		repoRoot,
		'.svelte-kit',
		'output',
		'client',
		'.vite',
		'manifest.json',
	);
	const clientRoot = path.join(repoRoot, '.svelte-kit', 'output', 'client');
	const manifest = await readJson<Record<string, ManifestEntry>>(manifestPath);
	const routeDictionary = await readRouteDictionary(repoRoot);

	const allJsAssets = await collectAssets(clientRoot, '_app/immutable', '.js');
	const allCssAssets = await collectAssets(clientRoot, '_app/immutable', '.css');
	const largestJavaScriptAssets = [...allJsAssets]
		.sort((left, right) => right.rawBytes - left.rawBytes)
		.slice(0, 10);
	const largestCssAssets = [...allCssAssets]
		.sort((left, right) => right.rawBytes - left.rawBytes)
		.slice(0, 10);

	const routes = await Promise.all(
		Object.entries(routeDictionary).map(async ([route, nodeIndexes]) => {
			const assetSet = new Set<string>();
			const cssSet = new Set<string>();
			const appEntryKey = '.svelte-kit/generated/client-optimized/app.js';

			for (const asset of await resolveEntryAssets(manifest, appEntryKey)) {
				if (asset.endsWith('.css')) {
					cssSet.add(asset);
				} else {
					assetSet.add(asset);
				}
			}

			for (const sharedNode of [0, 1, ...nodeIndexes]) {
				const nodeKey = `.svelte-kit/generated/client-optimized/nodes/${sharedNode}.js`;
				for (const asset of await resolveEntryAssets(manifest, nodeKey)) {
					if (asset.endsWith('.css')) {
						cssSet.add(asset);
					} else {
						assetSet.add(asset);
					}
				}
			}

			const jsAssets = await readAssetMetrics(clientRoot, [...assetSet]);
			const cssAssets = await readAssetMetrics(clientRoot, [...cssSet]);

			return {
				route,
				jsBytes: sumBytes(jsAssets, 'rawBytes'),
				jsGzipBytes: sumBytes(jsAssets, 'gzipBytes'),
				cssBytes: sumBytes(cssAssets, 'rawBytes'),
				cssGzipBytes: sumBytes(cssAssets, 'gzipBytes'),
				files: [...assetSet, ...cssSet].sort(),
			} satisfies BundleRouteMetric;
		}),
	);

	const initialRoute = routes.find((entry) => entry.route === '/') ?? routes[0];
	const totals = {
		jsBytes: sumBytes(allJsAssets, 'rawBytes'),
		jsGzipBytes: sumBytes(allJsAssets, 'gzipBytes'),
		cssBytes: sumBytes(allCssAssets, 'rawBytes'),
		cssGzipBytes: sumBytes(allCssAssets, 'gzipBytes'),
		initialRouteJsGzipBytes: initialRoute?.jsGzipBytes ?? 0,
	};

	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		totals,
		largestJavaScriptAssets,
		largestCssAssets,
		routes: routes.sort((left, right) => left.route.localeCompare(right.route)),
		budget: {
			initialJsGzipTargetBytes: 100 * 1024,
			compliant: totals.initialRouteJsGzipBytes <= 100 * 1024,
		},
	};
}

async function collectAssets(
	clientRoot: string,
	relativeDir: string,
	extension: '.js' | '.css',
): Promise<BundleAssetMetric[]> {
	const root = path.join(clientRoot, relativeDir);
	const metrics: BundleAssetMetric[] = [];
	await walkAssets(root, async (absolutePath) => {
		const relativePath = path.relative(clientRoot, absolutePath).replaceAll('\\', '/');
		if (!relativePath.endsWith(extension)) {
			return;
		}
		const content = await fs.readFile(absolutePath);
		metrics.push({
			file: relativePath,
			rawBytes: content.byteLength,
			gzipBytes: (await gzip(content)).byteLength,
		});
	});
	return metrics;
}

async function readAssetMetrics(clientRoot: string, files: string[]): Promise<BundleAssetMetric[]> {
	const metrics: BundleAssetMetric[] = [];
	for (const file of files) {
		const content = await fs.readFile(path.join(clientRoot, file));
		metrics.push({
			file,
			rawBytes: content.byteLength,
			gzipBytes: (await gzip(content)).byteLength,
		});
	}
	return metrics;
}

async function resolveEntryAssets(
	manifest: Record<string, ManifestEntry>,
	entryKey: string,
	seen = new Set<string>(),
): Promise<string[]> {
	if (seen.has(entryKey)) {
		return [];
	}
	seen.add(entryKey);
	const entry = manifest[entryKey];
	if (!entry) {
		return [];
	}

	const directAssets = [entry.file, ...(entry.css ?? [])];
	const importedAssets = await Promise.all(
		(entry.imports ?? []).map(async (importKey) => resolveEntryAssets(manifest, importKey, seen)),
	);
	return [...directAssets, ...importedAssets.flat()];
}

async function readRouteDictionary(repoRoot: string): Promise<Record<string, number[]>> {
	const appJs = await fs.readFile(
		path.join(repoRoot, '.svelte-kit', 'generated', 'client-optimized', 'app.js'),
		'utf-8',
	);
	const dictionaryMatch = appJs.match(/export const dictionary = (\{[\s\S]*?\n\t\});/);
	if (!dictionaryMatch) {
		throw new Error('Unable to read route dictionary from generated client app manifest.');
	}
	return JSON.parse(dictionaryMatch[1]) as Record<string, number[]>;
}

function sumBytes<T extends { [key: string]: number }>(items: T[], key: keyof T & string): number {
	return items.reduce((sum, item) => sum + item[key], 0);
}

async function walkAssets(
	currentDir: string,
	visitor: (absolutePath: string) => Promise<void>,
): Promise<void> {
	const entries = await fs.readdir(currentDir, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			await walkAssets(absolutePath, visitor);
			continue;
		}
		if (entry.isFile()) {
			await visitor(absolutePath);
		}
	}
}
