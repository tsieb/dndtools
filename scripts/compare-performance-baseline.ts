import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PERFORMANCE_BUDGETS, type PerformanceOperation } from '../src/lib/types/diagnostics.js';

type DatasetResult = {
	dataset: string;
	noteCount: number;
	metrics: Record<PerformanceOperation, number>;
};

type PerfReport = {
	version: number;
	generatedAt?: string;
	datasets: DatasetResult[];
};

function toFixed(value: number): string {
	return Number(value.toFixed(2)).toString();
}

function keyFor(dataset: string, operation: PerformanceOperation): string {
	return `${dataset}:${operation}`;
}

async function readReport(filePath: string): Promise<PerfReport> {
	const raw = await fs.readFile(filePath, 'utf-8');
	const parsed = JSON.parse(raw) as PerfReport;
	if (!Array.isArray(parsed.datasets)) {
		throw new Error(`Invalid report format: ${filePath}`);
	}
	return parsed;
}

function mapDatasets(report: PerfReport): Map<string, DatasetResult> {
	return new Map(report.datasets.map((entry) => [entry.dataset, entry]));
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			baseline: { type: 'string' },
			current: { type: 'string' },
			threshold: { type: 'string' },
		},
		strict: true,
	});

	const baselinePath = path.resolve(values.baseline ?? 'tests/perf/performance-baseline.json');
	const currentPath = path.resolve(
		values.current ??
			path.join(process.cwd(), 'tmp', 'performance', 'latest-performance-results.json'),
	);
	const threshold = Number(values.threshold ?? '0.2');
	if (!Number.isFinite(threshold) || threshold < 0) {
		throw new Error(`Invalid threshold value: ${String(values.threshold)}`);
	}

	const [baseline, current] = await Promise.all([
		readReport(baselinePath),
		readReport(currentPath),
	]);
	const baselineDatasets = mapDatasets(baseline);
	const currentDatasets = mapDatasets(current);

	const regressions: string[] = [];
	const rows: string[] = [];

	for (const [datasetName, baselineDataset] of baselineDatasets.entries()) {
		const currentDataset = currentDatasets.get(datasetName);
		if (!currentDataset) {
			regressions.push(`Missing dataset in current report: ${datasetName}`);
			continue;
		}

		for (const operation of Object.keys(PERFORMANCE_BUDGETS) as PerformanceOperation[]) {
			const baselineValue = baselineDataset.metrics[operation];
			const currentValue = currentDataset.metrics[operation];
			if (!Number.isFinite(baselineValue)) {
				regressions.push(`Missing baseline metric: ${keyFor(datasetName, operation)}`);
				continue;
			}
			if (!Number.isFinite(currentValue)) {
				regressions.push(`Missing current metric: ${keyFor(datasetName, operation)}`);
				continue;
			}

			const maxAllowed = baselineValue * (1 + threshold);
			const regressed = currentValue > maxAllowed;
			const deltaPct =
				baselineValue === 0 ? 0 : ((currentValue - baselineValue) / baselineValue) * 100;
			rows.push(
				[
					datasetName,
					operation,
					toFixed(baselineValue),
					toFixed(currentValue),
					`${toFixed(deltaPct)}%`,
					toFixed(maxAllowed),
					regressed ? 'REGRESSION' : 'ok',
				].join('\t'),
			);
			if (regressed) {
				regressions.push(
					`${keyFor(datasetName, operation)} regressed from ${toFixed(baselineValue)}ms to ${toFixed(currentValue)}ms (allowed <= ${toFixed(maxAllowed)}ms)`,
				);
			}
		}
	}

	console.log('dataset\toperation\tbaseline_ms\tcurrent_ms\tdelta_pct\tmax_allowed_ms\tstatus');
	for (const row of rows) {
		console.log(row);
	}

	if (regressions.length > 0) {
		console.error('\nPerformance regression check failed:');
		for (const failure of regressions) {
			console.error(`- ${failure}`);
		}
		process.exit(1);
	}

	console.log('\nPerformance regression check passed.');
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
