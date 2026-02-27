// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSystemAdapter } from './storage.js';
import { createFolderId } from '../src/lib/types/note.js';
import { nowISO } from '../src/lib/utils/date.js';
import { generateNoteId } from '../src/lib/utils/id.js';
import type { Note } from '../src/lib/types/note.js';

function testNote(overrides: Partial<Note> = {}): Note {
	const now = nowISO();
	return {
		id: generateNoteId(),
		title: 'Recovery Note',
		content: 'stable content',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function interruptedTempPath(targetPath: string): string {
	return path.join(
		path.dirname(targetPath),
		`.${path.basename(targetPath)}.9999-9999999999999-deadbeef.tmp`,
	);
}

async function writePendingJournal(vaultDir: string, operation: string): Promise<void> {
	const journalPath = path.join(vaultDir, '.vault', 'write-journal.json');
	await fs.mkdir(path.dirname(journalPath), { recursive: true });
	await fs.writeFile(
		journalPath,
		JSON.stringify(
			{
				version: 1,
				pending: [
					{
						id: 'pending-interrupted-write',
						operation,
						startedAt: nowISO(),
					},
				],
			},
			null,
			2,
		),
		'utf-8',
	);
}

describe('interrupted write recovery', () => {
	let tmpDir: string;
	let adapter: FileSystemAdapter;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-recovery-'));
		adapter = new FileSystemAdapter(tmpDir);
		await adapter.initialize();
	});

	afterEach(async () => {
		await adapter.close();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('rolls back interrupted note writes and preserves previous note content', async () => {
		const note = testNote({ title: 'Rollback Note', content: 'old body' });
		await adapter.saveNote(note);

		const filePath = path.join(tmpDir, 'rollback-note.md');
		const tempPath = interruptedTempPath(filePath);
		await fs.writeFile(tempPath, 'new body', 'utf-8');
		await writePendingJournal(tmpDir, 'save-note');

		await adapter.close();
		const restarted = new FileSystemAdapter(tmpDir);
		await restarted.initialize();
		adapter = restarted;

		const recovered = await adapter.getNote(note.id);
		expect(recovered?.content).toBe('old body');
		await expect(fs.stat(tempPath)).rejects.toThrow();
		const report = await adapter.getMetadataIntegrityReport();
		expect(report.journalRecovery.replayed).toBe(true);
		expect(report.journalRecovery.pendingEntries).toBe(1);
	});

	it('rolls back interrupted index writes and preserves previous index state', async () => {
		const note = testNote({ title: 'Index Recovery' });
		await adapter.saveNote(note);

		const indexPath = path.join(tmpDir, '.vault', 'index.json');
		const tempPath = interruptedTempPath(indexPath);
		await fs.writeFile(
			tempPath,
			JSON.stringify({ version: 2, notes: {}, links: {} }, null, 2),
			'utf-8',
		);
		await writePendingJournal(tmpDir, 'save-index');

		await adapter.close();
		const restarted = new FileSystemAdapter(tmpDir);
		await restarted.initialize();
		adapter = restarted;

		const raw = await fs.readFile(indexPath, 'utf-8');
		const parsed = JSON.parse(raw) as {
			notes: Record<string, unknown>;
		};
		expect(parsed.notes[note.id]).toBeDefined();
		await expect(fs.stat(tempPath)).rejects.toThrow();
	});

	it('rolls back interrupted settings writes and preserves previous settings value', async () => {
		await adapter.setSetting('theme', 'dark');

		const settingsPath = path.join(tmpDir, '.vault', 'settings.json');
		const tempPath = interruptedTempPath(settingsPath);
		await fs.writeFile(tempPath, JSON.stringify({ version: 2, theme: 'light' }, null, 2), 'utf-8');
		await writePendingJournal(tmpDir, 'set-setting');

		await adapter.close();
		const restarted = new FileSystemAdapter(tmpDir);
		await restarted.initialize();
		adapter = restarted;

		expect(await adapter.getSetting('theme')).toBe('dark');
		await expect(fs.stat(tempPath)).rejects.toThrow();
	});

	it('rolls back interrupted changelog writes and preserves previous changelog state', async () => {
		const note = testNote({ title: 'Changelog Recovery' });
		await adapter.recordMcpChange({
			type: 'create',
			noteId: note.id,
			title: note.title,
			summary: 'Create note',
			before: null,
			after: { note },
		});

		const changelogPath = path.join(tmpDir, '.vault', 'mcp-changelog.json');
		const before = await adapter.getMcpChangeLog();
		expect(before).toHaveLength(1);

		const tempPath = interruptedTempPath(changelogPath);
		await fs.writeFile(tempPath, JSON.stringify({ version: 2, changes: [] }, null, 2), 'utf-8');
		await writePendingJournal(tmpDir, 'record-mcp-change');

		await adapter.close();
		const restarted = new FileSystemAdapter(tmpDir);
		await restarted.initialize();
		adapter = restarted;

		const after = await adapter.getMcpChangeLog();
		expect(after).toHaveLength(1);
		await expect(fs.stat(tempPath)).rejects.toThrow();
	});
});
