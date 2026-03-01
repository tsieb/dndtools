import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { launchDesktopApp } from './helpers/desktop-app.js';
import { generateFixtureVault } from '../../scripts/generate-fixture-vault.js';

const MB = 1024 * 1024;
const HEAP_GROWTH_BUDGET_MB = 20;

function noteTitle(index: number): string {
	return `Fixture Note ${String(index).padStart(5, '0')}`;
}

async function createFixtureVault(noteCount: number): Promise<string> {
	const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), `dndtools-memory-${noteCount}-`));
	await generateFixtureVault({
		outputDir: vaultDir,
		noteCount,
		objectCount: 0,
		depth: 4,
		linkDensity: 0.08,
		tagDistribution: 'lore:4,npc:3,quest:2,location:2',
		force: true,
		seed: 20260303,
	});
	return vaultDir;
}

async function heapUsedBytes(app: Awaited<ReturnType<typeof launchDesktopApp>>): Promise<number> {
	return app.electronApp.evaluate(async () => {
		const maybeGc = (globalThis as { gc?: () => void }).gc;
		if (typeof maybeGc === 'function') {
			maybeGc();
			maybeGc();
		}
		return process.memoryUsage().heapUsed;
	});
}

test.describe('Desktop memory profile @memory', () => {
	test.skip(
		!process.env.MEMORY_PROFILE,
		'Memory profiling runs in nightly CI or explicit local profiling sessions.',
	);

	test('heap growth stays below budget for fixed interaction script', async ({
		browserName,
	}, testInfo) => {
		test.setTimeout(35 * 60_000);
		const vaultDir = await createFixtureVault(5_000);
		const app = await launchDesktopApp(vaultDir);

		try {
			const beforeHeap = await heapUsedBytes(app);

			await app.page.getByRole('link', { name: 'All Notes' }).first().click();
			for (let index = 1; index <= 50; index += 1) {
				await app.page.getByText(noteTitle(index)).first().click();
				await expect(
					app.page.getByRole('heading', { name: noteTitle(index) }).first(),
				).toBeVisible();
				if (index < 50) {
					await app.page.getByRole('link', { name: 'All Notes' }).first().click();
				}
			}

			await app.page.getByRole('link', { name: 'Search' }).first().click();
			const searchInput = app.page.getByPlaceholder('Search notes...');
			for (let index = 1; index <= 20; index += 1) {
				await searchInput.fill(noteTitle(index));
				await app.page.waitForTimeout(120);
				await searchInput.fill('');
				await app.page.waitForTimeout(60);
			}

			for (let index = 1; index <= 10; index += 1) {
				const title = noteTitle(index);
				await app.page.evaluate(
					async ({ targetTitle, run }: { targetTitle: string; run: number }) => {
						const bridge = window.dndtoolsDesktop;
						if (!bridge) return;
						const note = await bridge.resolveTitle(targetTitle);
						if (!note) return;
						await bridge.saveNote({
							...note,
							content: `${note.content}\nmemory-profile-save-${run}`,
							updatedAt: new Date().toISOString(),
						});
					},
					{ targetTitle: title, run: index },
				);
			}

			await app.page.waitForTimeout(500);
			const afterHeap = await heapUsedBytes(app);
			const deltaMb = (afterHeap - beforeHeap) / MB;

			await testInfo.attach('memory-profile', {
				contentType: 'application/json',
				body: JSON.stringify(
					{
						browserName,
						heapGrowthBudgetMb: HEAP_GROWTH_BUDGET_MB,
						beforeHeapBytes: beforeHeap,
						afterHeapBytes: afterHeap,
						heapGrowthMb: Number(deltaMb.toFixed(2)),
						vaultNoteCount: 5_000,
					},
					null,
					2,
				),
			});

			expect(deltaMb).toBeLessThan(HEAP_GROWTH_BUDGET_MB);
		} finally {
			await app.electronApp.close();
			await fs.rm(vaultDir, { recursive: true, force: true });
		}
	});
});
