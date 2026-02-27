// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic, writeJsonAtomic } from './safe-write.js';

describe('safe-write', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-atomic-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('writes text atomically', async () => {
		const target = path.join(tmpDir, 'note.md');
		await writeFileAtomic(target, '# Note');
		const content = await fs.readFile(target, 'utf-8');
		expect(content).toBe('# Note');
	});

	it('overwrites existing file atomically', async () => {
		const target = path.join(tmpDir, 'data.txt');
		await fs.writeFile(target, 'old', 'utf-8');
		await writeFileAtomic(target, 'new');
		const content = await fs.readFile(target, 'utf-8');
		expect(content).toBe('new');
	});

	it('writes JSON atomically', async () => {
		const target = path.join(tmpDir, '.vault', 'index.json');
		await writeJsonAtomic(target, { version: 1, notes: {}, links: {} });
		const parsed = JSON.parse(await fs.readFile(target, 'utf-8')) as Record<string, unknown>;
		expect(parsed.version).toBe(1);
	});

	it('fails JSON atomic write when serialized payload fails validation', async () => {
		const target = path.join(tmpDir, '.vault', 'index.json');
		await expect(
			writeJsonAtomic(
				target,
				{ version: 'invalid', notes: {}, links: {} },
				{
					label: 'index.json',
					validate: (value) => {
						const record = value as Record<string, unknown>;
						return typeof record.version === 'number';
					},
				},
			),
		).rejects.toThrow(/schema validation/i);
		await expect(fs.stat(target)).rejects.toThrow();
	});

	it('fails JSON atomic write for non-serializable payloads', async () => {
		const target = path.join(tmpDir, '.vault', 'settings.json');
		await expect(writeJsonAtomic(target, { value: BigInt(1) })).rejects.toThrow();
		await expect(fs.stat(target)).rejects.toThrow();
	});
});
