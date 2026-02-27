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

	it('detects vaultTooNew when vault metadata version exceeds supported version', async () => {
		// Write a metadata file with a version far ahead of what the app understands.
		const indexPath = path.join(vaultDir, '.vault', 'index.json');
		const current = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as Record<string, unknown>;
		await fs.writeFile(indexPath, JSON.stringify({ ...current, version: 9999 }), 'utf-8');

		const report = await getSchemaMigrationReport(vaultDir);

		expect(report.vaultTooNew).toBe(true);
		// No upgrade should be attempted when the vault is too new.
		expect(report.upgradeApplied).toBe(false);
	});

	it('detects vaultTooNew when a note frontmatter version exceeds supported version', async () => {
		// Write a note with a future schema version.
		const notePath = path.join(vaultDir, 'campaign', 'npcs', 'goblin-ambush.md');
		const raw = await fs.readFile(notePath, 'utf-8');
		const parsed = matter(raw);
		const nextFrontmatter = {
			...(parsed.data as Record<string, unknown>),
			dndtoolsSchemaVersion: 9999,
		};
		await fs.writeFile(notePath, matter.stringify(parsed.content, nextFrontmatter), 'utf-8');

		const report = await getSchemaMigrationReport(vaultDir);

		expect(report.vaultTooNew).toBe(true);
		expect(report.upgradeApplied).toBe(false);
	});

	it('does not apply migrations when vault is too new even if called without dryRun', async () => {
		const indexPath = path.join(vaultDir, '.vault', 'index.json');
		const current = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as Record<string, unknown>;
		await fs.writeFile(indexPath, JSON.stringify({ ...current, version: 9999 }), 'utf-8');

		const report = await runSchemaMigrations(vaultDir, { dryRun: false, createCheckpoint: true });

		expect(report.vaultTooNew).toBe(true);
		expect(report.upgradeApplied).toBe(false);
		// The too-new index must remain untouched (not downgraded).
		const after = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as Record<string, unknown>;
		expect(after.version).toBe(9999);
	});

	it('checkpoint directory is created and can be used to restore the vault', async () => {
		// Apply the migration to create a checkpoint and advance schema to v2.
		const report = await runSchemaMigrations(vaultDir, { dryRun: false, createCheckpoint: true });
		expect(report.upgradeApplied).toBe(true);
		expect(report.checkpointDir).toBeTruthy();

		// The checkpoint directory must exist on disk.
		const checkpointAbsDir = path.join(vaultDir, report.checkpointDir!);
		await expect(fs.stat(checkpointAbsDir)).resolves.toBeTruthy();

		// The checkpoint must contain a backup of index.json with the pre-migration (v1) content.
		const checkpointIndex = await readJson(path.join(checkpointAbsDir, '.vault', 'index.json'));
		expect(checkpointIndex.version).toBe(1);

		// Tamper with the vault to simulate accidental corruption after the migration.
		const liveIndexPath = path.join(vaultDir, '.vault', 'index.json');
		await fs.writeFile(
			liveIndexPath,
			JSON.stringify({ version: 999, notes: {}, links: {} }),
			'utf-8',
		);

		// Restore from the checkpoint using the adapter API.
		const { FileSystemAdapter: FSAdapter } = await import('./storage.js');
		const adapter = new FSAdapter(vaultDir);
		// Initialize triggers migration (no-op now as it's already at v2), then loads state.
		await adapter.initialize();

		const checkpointName = path.basename(checkpointAbsDir);
		const restoreResult = await adapter.restoreMigrationCheckpoint(checkpointName);
		expect(restoreResult.restored).toBeGreaterThan(0);

		// index.json must now reflect the checkpoint's v1 content.
		const restoredIndex = await readJson(liveIndexPath);
		expect(restoredIndex.version).toBe(1);

		await adapter.close();
	});
});
