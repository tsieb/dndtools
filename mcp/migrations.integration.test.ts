// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import {
	CURRENT_SCHEMA_VERSION,
	getSchemaMigrationReport,
	runSchemaMigrations,
} from './migrations.js';
import { FileSystemAdapter } from './storage.js';

const fixtureVault = path.resolve('mcp/fixtures/schema-v1');

async function readJson(filePath: string): Promise<Record<string, unknown>> {
	const raw = await fs.readFile(filePath, 'utf-8');
	return JSON.parse(raw) as Record<string, unknown>;
}

describe('schema migrations integration', () => {
	let tmpDir: string;
	let vaultDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-migrations-'));
		vaultDir = path.join(tmpDir, 'vault');
		await fs.cp(fixtureVault, vaultDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('produces a dry-run report with pending schema upgrades', async () => {
		const report = await getSchemaMigrationReport(vaultDir);

		expect(report.dryRun).toBe(true);
		expect(report.upgradeRequired).toBe(true);
		expect(report.steps.find((step) => step.id === 'metadata_v1_to_v2')?.pending).toBeGreaterThan(
			0,
		);
		expect(report.steps.find((step) => step.id === 'notes_v1_to_v2')?.pending).toBeGreaterThan(0);
		expect(report.steps.find((step) => step.id === 'objects_v1_to_v2')?.pending).toBeGreaterThan(0);
		expect(report.changedFiles).toContain('.vault/index.json');
		expect(report.changedFiles).toContain('campaign/npcs/goblin-ambush.md');
		expect(report.changedFiles).toContain('objects/sildar-hallwinter.md');
	});

	it('applies migrations with a checkpoint and upgrades note/object/metadata versions', async () => {
		const report = await runSchemaMigrations(vaultDir, { dryRun: false, createCheckpoint: true });

		expect(report.upgradeApplied).toBe(true);
		expect(report.failures).toHaveLength(0);
		expect(report.checkpointDir).toBeTruthy();
		expect(report.rollbackApplied).toBe(false);

		const index = await readJson(path.join(vaultDir, '.vault', 'index.json'));
		const boards = await readJson(path.join(vaultDir, '.vault', 'session-boards.json'));
		const objects = await readJson(path.join(vaultDir, '.vault', 'objects.json'));
		const changelog = await readJson(path.join(vaultDir, '.vault', 'mcp-changelog.json'));
		const settings = await readJson(path.join(vaultDir, '.vault', 'settings.json'));
		expect(index.version).toBe(CURRENT_SCHEMA_VERSION.metadata);
		expect(boards.version).toBe(CURRENT_SCHEMA_VERSION.metadata);
		expect(objects.version).toBe(CURRENT_SCHEMA_VERSION.metadata);
		expect(changelog.version).toBe(CURRENT_SCHEMA_VERSION.metadata);
		expect(settings.version).toBe(CURRENT_SCHEMA_VERSION.metadata);

		const noteRaw = await fs.readFile(
			path.join(vaultDir, 'campaign', 'npcs', 'goblin-ambush.md'),
			'utf-8',
		);
		const note = matter(noteRaw);
		expect((note.data as Record<string, unknown>).dndtoolsSchemaVersion).toBe(
			CURRENT_SCHEMA_VERSION.notes,
		);

		const objectRaw = await fs.readFile(
			path.join(vaultDir, 'objects', 'sildar-hallwinter.md'),
			'utf-8',
		);
		const objectNote = matter(objectRaw);
		const objectFrontmatter = objectNote.data as {
			dndtools?: { object?: { schemaVersion?: number } };
		};
		expect(objectFrontmatter.dndtools?.object?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION.objects);
	});

	it('runs schema migration as part of adapter initialization', async () => {
		const adapter = new FileSystemAdapter(vaultDir);
		await adapter.initialize();

		const report = await adapter.getSchemaMigrationReport();
		expect(report.upgradeRequired).toBe(false);
		expect(report.to.metadata).toBe(CURRENT_SCHEMA_VERSION.metadata);

		await adapter.close();
	});
});
