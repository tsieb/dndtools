import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PERFORMANCE_BUDGETS, type PerformanceOperation } from '../src/lib/types/diagnostics.js';
import {
	readJson,
	type BuildBaseline,
	type BundleBaseline,
	type PerformanceBaseline,
	type TestBaseline,
	writeJson,
} from './lib/metrics.js';

type MetricsCategory = 'bundle' | 'build' | 'test' | 'performance';

type ComparisonRow = {
	category: MetricsCategory;
	label: string;
	baseline: number;
	current: number;
	deltaPct: number;
	status: 'improved' | 'regressed' | 'flat';
	budgetStatus?: 'pass' | 'fail';
};

const CATEGORIES: MetricsCategory[] = ['bundle', 'build', 'test', 'performance'];

function parseCategories(rawValue: string | undefined): MetricsCategory[] {
	if (!rawValue) {
		return CATEGORIES;
	}
	return rawValue
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry): entry is MetricsCategory => CATEGORIES.includes(entry as MetricsCategory));
}

function round(value: number): number {
	return Number(value.toFixed(2));
}

function percentDelta(current: number, baseline: number): number {
	if (baseline === 0) {
		return current === 0 ? 0 : 100;
	}
	return round(((current - baseline) / baseline) * 100);
}

function classify(deltaPct: number): 'improved' | 'regressed' | 'flat' {
	if (deltaPct > 0.5) return 'regressed';
	if (deltaPct < -0.5) return 'improved';
	return 'flat';
}

async function maybeRead<T>(filePath: string): Promise<T | null> {
	try {
		return await readJson<T>(filePath);
	} catch {
		return null;
	}
}

function compareBundle(baseline: BundleBaseline, current: BundleBaseline): ComparisonRow[] {
	return [
		makeRow(
			'bundle',
			'initial_js_gzip',
			baseline.totals.initialRouteJsGzipBytes,
			current.totals.initialRouteJsGzipBytes,
			current.budget.compliant ? 'pass' : 'fail',
		),
		makeRow('bundle', 'total_js_gzip', baseline.totals.jsGzipBytes, current.totals.jsGzipBytes),
		makeRow('bundle', 'total_css_gzip', baseline.totals.cssGzipBytes, current.totals.cssGzipBytes),
	];
}

function compareTimings(
	category: 'build' | 'test',
	baseline: BuildBaseline | TestBaseline,
	current: BuildBaseline | TestBaseline,
): ComparisonRow[] {
	const baselineEntries = 'stages' in baseline ? baseline.stages : baseline.suites;
	const currentEntries = 'stages' in current ? current.stages : current.suites;
	const currentByName = new Map(currentEntries.map((entry) => [entry.name, entry]));
	return baselineEntries.flatMap((entry) => {
		const currentEntry = currentByName.get(entry.name);
		if (!currentEntry || entry.p50Ms === null || currentEntry.p50Ms === null) {
			return [];
		}
		return [makeRow(category, entry.name, entry.p50Ms, currentEntry.p50Ms)];
	});
}

function comparePerformance(
	baseline: PerformanceBaseline,
	current: PerformanceBaseline,
): ComparisonRow[] {
	const currentDatasets = new Map(current.datasets.map((entry) => [entry.dataset, entry]));
	const rows: ComparisonRow[] = [];
	for (const dataset of baseline.datasets) {
		const currentDataset = currentDatasets.get(dataset.dataset);
		if (!currentDataset) {
			continue;
		}
		for (const operation of Object.keys(PERFORMANCE_BUDGETS) as PerformanceOperation[]) {
			rows.push(
				makeRow(
					'performance',
					`${dataset.dataset}:${operation}`,
					dataset.metrics[operation],
					currentDataset.metrics[operation],
					currentDataset.metrics[operation] <= PERFORMANCE_BUDGETS[operation].regressionThresholdMs
						? 'pass'
						: 'fail',
				),
			);
		}
	}
	return rows;
}

function makeRow(
	category: MetricsCategory,
	label: string,
	baseline: number,
	current: number,
	budgetStatus?: 'pass' | 'fail',
): ComparisonRow {
	const deltaPct = percentDelta(current, baseline);
	return {
		category,
		label,
		baseline,
		current,
		deltaPct,
		status: classify(deltaPct),
		budgetStatus,
	};
}

function renderText(rows: ComparisonRow[]): string {
	const header = 'category\tlabel\tbaseline\tcurrent\tdelta_pct\tstatus\tbudget';
	const lines = rows.map((row) =>
		[
			row.category,
			row.label,
			row.baseline,
			row.current,
			`${row.deltaPct}%`,
			row.status,
			row.budgetStatus ?? '',
		].join('\t'),
	);
	return [header, ...lines].join('\n');
}

function renderMarkdown(rows: ComparisonRow[]): string {
	const lines = [
		'<!-- dndtools-metrics-report -->',
		'## Metrics Comparison',
		'',
		'| Category | Metric | Baseline | Current | Delta | Status | Budget |',
		'| --- | --- | ---: | ---: | ---: | --- | --- |',
	];
	for (const row of rows) {
		lines.push(
			`| ${row.category} | ${row.label} | ${row.baseline} | ${row.current} | ${row.deltaPct}% | ${row.status} | ${row.budgetStatus ?? 'n/a'} |`,
		);
	}
	return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			baselineDir: { type: 'string' },
			currentDir: { type: 'string' },
			only: { type: 'string' },
			markdown: { type: 'string' },
			json: { type: 'string' },
			enforceRegression: { type: 'boolean' },
		},
		strict: true,
	});

	const baselineDir = path.resolve(values.baselineDir ?? path.join(process.cwd(), 'tests', 'perf'));
	const currentDir = path.resolve(
		values.currentDir ?? path.join(process.cwd(), 'tmp', 'metrics', 'latest'),
	);
	const categories = parseCategories(values.only);
	const rows: ComparisonRow[] = [];

	for (const category of categories) {
		if (category === 'bundle') {
			const [baseline, current] = await Promise.all([
				maybeRead<BundleBaseline>(path.join(baselineDir, 'bundle-baseline.json')),
				maybeRead<BundleBaseline>(path.join(currentDir, 'bundle-baseline.json')),
			]);
			if (baseline && current) rows.push(...compareBundle(baseline, current));
		}

		if (category === 'build') {
			const [baseline, current] = await Promise.all([
				maybeRead<BuildBaseline>(path.join(baselineDir, 'build-baseline.json')),
				maybeRead<BuildBaseline>(path.join(currentDir, 'build-baseline.json')),
			]);
			if (baseline && current) rows.push(...compareTimings('build', baseline, current));
		}

		if (category === 'test') {
			const [baseline, current] = await Promise.all([
				maybeRead<TestBaseline>(path.join(baselineDir, 'test-baseline.json')),
				maybeRead<TestBaseline>(path.join(currentDir, 'test-baseline.json')),
			]);
			if (baseline && current) rows.push(...compareTimings('test', baseline, current));
		}

		if (category === 'performance') {
			const [baseline, current] = await Promise.all([
				maybeRead<PerformanceBaseline>(path.join(baselineDir, 'performance-baseline.json')),
				maybeRead<PerformanceBaseline>(path.join(currentDir, 'performance-baseline.json')),
			]);
			if (baseline && current) rows.push(...comparePerformance(baseline, current));
		}
	}

	const text = renderText(rows);
	console.log(text);

	if (values.markdown) {
		const markdownPath = path.resolve(values.markdown);
		await fs.mkdir(path.dirname(markdownPath), { recursive: true });
		await fs.writeFile(markdownPath, renderMarkdown(rows), 'utf-8');
	}
	if (values.json) {
		await writeJson(path.resolve(values.json), { rows });
	}

	if (values.enforceRegression) {
		const regressions = rows.filter(
			(row) => row.status === 'regressed' || row.budgetStatus === 'fail',
		);
		if (regressions.length > 0) {
			console.error('\nMetrics regression check failed.');
			process.exit(1);
		}
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
