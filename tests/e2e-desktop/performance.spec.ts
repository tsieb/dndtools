import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { launchDesktopApp } from './helpers/desktop-app.js';
import { generateFixtureVault } from '../../scripts/generate-fixture-vault.js';
import { FileSystemAdapter } from '../../mcp/storage.js';
import { registerGetSessionPrepBundleTool } from '../../mcp/tools/vault/get-session-prep-bundle.js';
import { parseToolEnvelope, type ToolResult } from '../../mcp/tools/shared/response.js';
import { PERFORMANCE_BUDGETS, type PerformanceOperation } from '../../src/lib/types/diagnostics.js';

const PERF_OUTPUT_PATH =
	process.env.PERF_RESULTS_PATH ??
	path.join(process.cwd(), 'tmp', 'performance', 'latest-performance-results.json');

type DatasetConfig = {
	name: 'notes_1000' | 'notes_5000';
	noteCount: number;
	seed: number;
};

type PerformanceSummarySnapshot = {
	sampleCount: number;
	lastMs: number | null;
};

type DatasetResult = {
	dataset: DatasetConfig['name'];
	noteCount: number;
	metrics: Record<PerformanceOperation, number>;
};

class MockMcpServer {
	handler: ((input: Record<string, unknown>) => Promise<ToolResult>) | null = null;

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: (input: Record<string, unknown>) => Promise<ToolResult>,
	): void {
		if (name === 'get_session_prep_bundle') {
			this.handler = handler;
		}
	}
}

const DATASETS: readonly DatasetConfig[] = [
	{ name: 'notes_1000', noteCount: 1_000, seed: 20260301 },
	{ name: 'notes_5000', noteCount: 5_000, seed: 20260302 },
] as const;

function asNumber(value: number | null | undefined): number {
	return Number((value ?? 0).toFixed(2));
}

async function createFixtureVault(config: DatasetConfig): Promise<string> {
	const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), `dndtools-perf-${config.name}-`));
	await generateFixtureVault({
		outputDir: baseDir,
		noteCount: config.noteCount,
		objectCount: 0,
		depth: 4,
		linkDensity: 0.08,
		tagDistribution: 'lore:4,npc:3,quest:2,location:2',
		force: true,
		seed: config.seed,
	});
	return baseDir;
}

async function getOperationSummary(
	page: Page,
	operation: PerformanceOperation,
): Promise<PerformanceSummarySnapshot> {
	return page.evaluate(async (op) => {
		const bridge = window.dndtoolsDesktop;
		if (!bridge) return { sampleCount: 0, lastMs: null };
		const health = await bridge.getDiagnosticsHealth();
		const summary = health.performance.summaries.find((entry) => entry.operation === op);
		return {
			sampleCount: summary?.sampleCount ?? 0,
			lastMs: summary?.lastMs ?? null,
		};
	}, operation);
}

async function waitForOperationSample(
	page: Page,
	operation: PerformanceOperation,
	previousCount: number,
	timeoutMs = 15_000,
): Promise<number> {
	const startedAt = Date.now();
	while (Date.now() - startedAt <= timeoutMs) {
		const summary = await getOperationSummary(page, operation);
		if (summary.sampleCount > previousCount && summary.lastMs !== null) {
			return asNumber(summary.lastMs);
		}
		await page.waitForTimeout(100);
	}
	throw new Error(`Timed out waiting for ${operation} telemetry sample.`);
}

async function measureMcpBundleCall(vaultDir: string): Promise<number> {
	const storage = new FileSystemAdapter(vaultDir);
	await storage.initialize();
	try {
		const server = new MockMcpServer();
		registerGetSessionPrepBundleTool(server as never, storage as never);
		if (!server.handler) {
			throw new Error('Failed to register get_session_prep_bundle handler.');
		}
		const startedAt = performance.now();
		const result = await server.handler({});
		const elapsedMs = performance.now() - startedAt;
		const envelope = parseToolEnvelope(result);
		expect(envelope?.ok).toBe(true);
		return asNumber(elapsedMs);
	} finally {
		await storage.close();
	}
}

async function runDatasetBenchmark(config: DatasetConfig): Promise<DatasetResult> {
	const vaultDir = await createFixtureVault(config);
	const app = await launchDesktopApp(vaultDir);

	try {
		const coldStartMs = await waitForOperationSample(app.page, 'cold_start', 0);
		const vaultOpenMs = await waitForOperationSample(app.page, 'vault_open', 0);

		const noteOpenBefore = await getOperationSummary(app.page, 'note_open');
		await app.page.getByRole('link', { name: 'All Notes' }).first().click();
		await app.page.getByText('Fixture Note 00001').first().click();
		await expect(app.page.getByRole('heading', { name: 'Fixture Note 00001' })).toBeVisible();
		const noteOpenMs = await waitForOperationSample(
			app.page,
			'note_open',
			noteOpenBefore.sampleCount,
		);

		const searchBefore = await getOperationSummary(app.page, 'search_response');
		await app.page.getByRole('link', { name: 'Search' }).first().click();
		const searchInput = app.page.getByPlaceholder('Search notes...');
		await searchInput.fill('Fixture Note 00001');
		await expect(app.page.getByRole('button', { name: 'Fixture Note 00001' })).toBeVisible();
		const searchResponseMs = await waitForOperationSample(
			app.page,
			'search_response',
			searchBefore.sampleCount,
		);

		await app.page.getByRole('button', { name: 'Fixture Note 00001' }).first().click();
		await expect(app.page.getByRole('heading', { name: 'Fixture Note 00001' })).toBeVisible();
		await app.page.getByRole('button', { name: 'Edit' }).click();
		const titleInput = app.page.getByPlaceholder('Note title...');
		await expect(titleInput).toBeVisible();
		const priorTitle = await titleInput.inputValue();
		await titleInput.fill(`${priorTitle} Perf`);

		const saveBefore = await getOperationSummary(app.page, 'note_save');
		const graphBefore = await getOperationSummary(app.page, 'graph_rebuild_incremental');
		await app.page.getByRole('button', { name: 'Save' }).click();
		const noteSaveMs = await waitForOperationSample(app.page, 'note_save', saveBefore.sampleCount);
		const graphRebuildIncrementalMs = await waitForOperationSample(
			app.page,
			'graph_rebuild_incremental',
			graphBefore.sampleCount,
		);

		const mcpBundleCallMs = await measureMcpBundleCall(vaultDir);

		return {
			dataset: config.name,
			noteCount: config.noteCount,
			metrics: {
				cold_start: coldStartMs,
				vault_open: vaultOpenMs,
				note_open: noteOpenMs,
				search_response: searchResponseMs,
				note_save: noteSaveMs,
				graph_rebuild_incremental: graphRebuildIncrementalMs,
				mcp_bundle_call: mcpBundleCallMs,
			},
		};
	} finally {
		await app.electronApp.close();
		await fs.rm(vaultDir, { recursive: true, force: true });
	}
}

async function writePerformanceResults(results: DatasetResult[]): Promise<void> {
	await fs.mkdir(path.dirname(PERF_OUTPUT_PATH), { recursive: true });
	await fs.writeFile(
		PERF_OUTPUT_PATH,
		`${JSON.stringify(
			{
				version: 1,
				generatedAt: new Date().toISOString(),
				budgets: PERFORMANCE_BUDGETS,
				datasets: results,
			},
			null,
			2,
		)}\n`,
		'utf-8',
	);
}

test.describe('Desktop performance regression budgets @perf', () => {
	test.skip(
		!process.env.PERF_BENCHMARK,
		'Performance benchmarks run in scheduled/explicit regression workflows only.',
	);

	test('measures all budgeted operations against hard thresholds', async ({
		browserName,
	}, testInfo) => {
		test.setTimeout(25 * 60_000);
		const results: DatasetResult[] = [];

		for (const dataset of DATASETS) {
			results.push(await runDatasetBenchmark(dataset));
		}

		await writePerformanceResults(results);

		await testInfo.attach('performance-results', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					browserName,
					outputPath: PERF_OUTPUT_PATH,
					budgets: PERFORMANCE_BUDGETS,
					datasets: results,
				},
				null,
				2,
			),
		});

		for (const dataset of results) {
			for (const [operation, value] of Object.entries(dataset.metrics) as Array<
				[PerformanceOperation, number]
			>) {
				const threshold = PERFORMANCE_BUDGETS[operation].regressionThresholdMs;
				expect(
					value,
					`${dataset.dataset}:${operation} exceeded regression threshold (${threshold}ms)`,
				).toBeLessThanOrEqual(threshold);
			}
		}
	});
});
