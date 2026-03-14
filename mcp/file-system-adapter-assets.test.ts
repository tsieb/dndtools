// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSystemAdapter } from './storage.js';

describe('FileSystemAdapter.importAssetFile', () => {
	let vaultDir = '';
	let sourceDir = '';
	let adapter: FileSystemAdapter;

	beforeEach(async () => {
		vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-vault-assets-'));
		sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-source-assets-'));
		adapter = new FileSystemAdapter(vaultDir);
		await adapter.initialize();
	});

	afterEach(async () => {
		await adapter.close();
		await fs.rm(vaultDir, { recursive: true, force: true });
		await fs.rm(sourceDir, { recursive: true, force: true });
	});

	it('copies assets into the vault and preserves a vault-relative path', async () => {
		const sourcePath = path.join(sourceDir, 'fixture image.png');
		await fs.writeFile(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const imported = await adapter.importAssetFile({
			sourcePath,
			targetFolder: '/assets/images',
			suggestedName: 'Fixture Image',
		});

		expect(imported.relativePath).toBe('assets/images/fixture-image.png');
		await expect(fs.stat(imported.absolutePath)).resolves.toBeDefined();
		await expect(fs.stat(sourcePath)).resolves.toBeDefined();
	});

	it('adds a numeric suffix when a file name already exists', async () => {
		const sourcePath = path.join(sourceDir, 'fixture.png');
		await fs.writeFile(sourcePath, Buffer.from([0x01]));
		await fs.mkdir(path.join(vaultDir, 'assets', 'images'), { recursive: true });
		await fs.writeFile(path.join(vaultDir, 'assets', 'images', 'fixture.png'), Buffer.from([0x02]));

		const imported = await adapter.importAssetFile({
			sourcePath,
			targetFolder: '/assets/images',
		});

		expect(imported.relativePath).toBe('assets/images/fixture-2.png');
	});
});
