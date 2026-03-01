import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemAdapter } from '../../mcp/storage.js';
import {
	generateFixtureVault,
	parseFixtureVaultOptions,
	parseTagDistribution,
} from '../../scripts/generate-fixture-vault.ts';

describe('generate-fixture-vault', () => {
	it('parses and normalizes tag distributions', () => {
		const distribution = parseTagDistribution('lore:3,npc:1');
		expect(distribution).toEqual([
			{ name: 'lore', weight: 0.75 },
			{ name: 'npc', weight: 0.25 },
		]);
	});

	it('parses fixture CLI options with defaults', () => {
		const options = parseFixtureVaultOptions(['--notes', '12', '--objects', '4', '--seed', '42']);
		expect(options.noteCount).toBe(12);
		expect(options.objectCount).toBe(4);
		expect(options.seed).toBe(42);
		expect(options.outputDir.length).toBeGreaterThan(0);
	});

	it('generates a fixture vault with requested notes, objects, and links', async () => {
		const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-fixture-'));
		const fixtureDir = path.join(tmpRoot, 'vault');

		try {
			const summary = await generateFixtureVault({
				outputDir: fixtureDir,
				noteCount: 16,
				objectCount: 6,
				depth: 4,
				linkDensity: 0.5,
				tagDistribution: 'lore:4,npc:2,quest:1',
				force: false,
				seed: 1337,
			});
			expect(summary.noteCount).toBe(16);
			expect(summary.objectCount).toBe(6);
			expect(summary.effectiveNoteCount).toBe(22);
			expect(summary.linkCount).toBeGreaterThan(0);

			const storage = new FileSystemAdapter(fixtureDir);
			await storage.initialize();
			const [notes, objects, links] = await Promise.all([
				storage.getAllNotes(),
				storage.getAllObjects(),
				storage.getAllLinks(),
			]);

			expect(notes).toHaveLength(22);
			expect(objects).toHaveLength(6);
			expect(links.length).toBeGreaterThan(0);
			const deepestFolder = Math.max(
				...notes.map((note) => String(note.folder).split('/').filter(Boolean).length),
				0,
			);
			expect(deepestFolder).toBeLessThanOrEqual(4);
			await storage.close();
		} finally {
			await fs.rm(tmpRoot, { recursive: true, force: true });
		}
	}, 60_000);
});
