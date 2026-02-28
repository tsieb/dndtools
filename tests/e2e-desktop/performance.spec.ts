import { test, expect } from '@playwright/test';
import { FileSystemAdapter } from '../../mcp/storage.js';
import { createTempVaultDir, launchDesktopApp, closeDesktopApp } from './helpers/desktop-app.js';

const HARD_BUDGET_MS = {
	coldStart: 3_000,
	noteOpen: 200,
	searchResponse: 150,
	saveLatency: 100,
} as const;

const BUDGET_FAILURE_FACTOR = 1.2;
const MEASUREMENT_TOLERANCE_MS = 10;

function buildNote(id: string, title: string, content: string): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id,
		title,
		content,
		folder: '/',
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

function maxAllowedBudget(targetMs: number): number {
	return targetMs * BUDGET_FAILURE_FACTOR + MEASUREMENT_TOLERANCE_MS;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1]! + sorted[mid]!) / 2;
	}
	return sorted[mid]!;
}

test.describe('Desktop performance regression budgets @perf', () => {
	test.skip(
		!process.env.PERF_BENCHMARK,
		'Performance benchmarks run in the scheduled regression workflow.',
	);

	test('meets hard latency budgets with <=20% tolerance', async ({ browserName }, testInfo) => {
		const vaultDir = await createTempVaultDir('dndtools-e2e-perf-');
		const adapter = new FileSystemAdapter(vaultDir);
		await adapter.initialize();
		await adapter.saveNote(
			buildNote(
				'note-perf-anchor',
				'Performance Anchor',
				'Contains PerfSearchToken for deterministic search verification.',
			) as never,
		);
		await adapter.close();

		const coldStartBegin = performance.now();
		const app = await launchDesktopApp(vaultDir);
		const coldStartMs = performance.now() - coldStartBegin;

		try {
			await app.page.getByRole('link', { name: 'All Notes' }).first().click();
			const noteOpenSamplesMs: number[] = [];
			for (let iteration = 0; iteration < 4; iteration += 1) {
				const noteOpenStart = performance.now();
				await app.page.getByText('Performance Anchor').first().click();
				await expect(app.page.getByRole('heading', { name: 'Performance Anchor' })).toBeVisible();
				noteOpenSamplesMs.push(performance.now() - noteOpenStart);
				if (iteration < 3) {
					await app.page.getByRole('link', { name: 'All Notes' }).first().click();
				}
			}
			const noteOpenMs = median(noteOpenSamplesMs.slice(1));

			await app.page.getByRole('link', { name: 'Search' }).first().click();
			const searchInput = app.page.getByPlaceholder('Search notes...');
			const searchSamplesMs: number[] = [];
			for (let iteration = 0; iteration < 8; iteration += 1) {
				await searchInput.fill('PerfSearchToken');
				await expect(app.page.getByRole('button', { name: 'Performance Anchor' })).toBeVisible();
				const telemetryText =
					(await app.page
						.locator('span', { hasText: /Search .*ms/ })
						.first()
						.textContent()) ?? '';
				const elapsed = Number(telemetryText.match(/:\s*([0-9.]+)ms/i)?.[1] ?? '0');
				searchSamplesMs.push(elapsed);
				if (iteration < 7) {
					await searchInput.fill('');
					await app.page.waitForTimeout(180);
				}
			}
			const stableSearchSamples = searchSamplesMs.slice(2).sort((a, b) => a - b);
			const trimmedSearchSamples =
				stableSearchSamples.length >= 5
					? stableSearchSamples.slice(1, stableSearchSamples.length - 1)
					: stableSearchSamples;
			const searchResponseMs = median(trimmedSearchSamples);

			const saveSamplesMs: number[] = [];
			for (let iteration = 0; iteration < 6; iteration += 1) {
				const saveLatency = await app.page.evaluate(async (sample) => {
					const bridge = window.dndtoolsDesktop;
					if (!bridge) return Number.NaN;
					const note = await bridge.getNote('note-perf-anchor' as never);
					if (!note) return Number.NaN;
					const next = {
						...note,
						content: `${note.content}\nperf-save-${sample}`,
						updatedAt: new Date().toISOString(),
					};
					const started = performance.now();
					await bridge.saveNote(next as never);
					return performance.now() - started;
				}, iteration);
				saveSamplesMs.push(saveLatency);
			}
			const stableSaveSamples = saveSamplesMs.slice(1).sort((a, b) => a - b);
			const trimmedSaveSamples =
				stableSaveSamples.length >= 5
					? stableSaveSamples.slice(1, stableSaveSamples.length - 1)
					: stableSaveSamples;
			const saveLatencyMs = median(trimmedSaveSamples);

			const metrics = {
				coldStartMs: Number(coldStartMs.toFixed(2)),
				noteOpenMs: Number(noteOpenMs.toFixed(2)),
				searchResponseMs: Number(searchResponseMs.toFixed(2)),
				saveLatencyMs: Number(saveLatencyMs.toFixed(2)),
			};

			await testInfo.attach('performance-metrics', {
				contentType: 'application/json',
				body: JSON.stringify(
					{
						browserName,
						budgets: HARD_BUDGET_MS,
						failureToleranceFactor: BUDGET_FAILURE_FACTOR,
						measurementToleranceMs: MEASUREMENT_TOLERANCE_MS,
						noteOpenSamplesMs: noteOpenSamplesMs.map((entry) => Number(entry.toFixed(2))),
						searchSamplesMs: searchSamplesMs.map((entry) => Number(entry.toFixed(2))),
						saveSamplesMs: saveSamplesMs.map((entry) => Number(entry.toFixed(2))),
						metrics,
					},
					null,
					2,
				),
			});

			expect(metrics.coldStartMs).toBeLessThanOrEqual(maxAllowedBudget(HARD_BUDGET_MS.coldStart));
			expect(metrics.noteOpenMs).toBeLessThanOrEqual(maxAllowedBudget(HARD_BUDGET_MS.noteOpen));
			expect(metrics.searchResponseMs).toBeLessThanOrEqual(
				maxAllowedBudget(HARD_BUDGET_MS.searchResponse),
			);
			expect(metrics.saveLatencyMs).toBeLessThanOrEqual(
				maxAllowedBudget(HARD_BUDGET_MS.saveLatency),
			);
		} finally {
			await closeDesktopApp(app);
		}
	});
});
