// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSystemAdapter } from '../mcp/storage.js';
import { ImportExportService } from './import-export-service.js';
import { createFolderId, createNoteId, type Note } from '../src/lib/types/note.js';
import { restoreNotesFromMarkdownFiles } from '../src/lib/domain/import-export.js';

function createNote(overrides: Partial<Note> = {}): Note {
	const now = '2026-03-01T00:00:00.000Z';
	return {
		id: createNoteId('note-test'),
		title: 'Test',
		content: 'Body',
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

async function waitForTerminalImportStatus(
	service: ImportExportService,
	jobId: string,
): Promise<import('../src/lib/types/import-export.js').ImportJobProgress> {
	const started = Date.now();
	while (Date.now() - started < 15_000) {
		const current = service.getImportJobProgress(jobId);
		if (!current) {
			throw new Error(`Import job ${jobId} disappeared`);
		}
		if (current.status === 'completed' || current.status === 'failed') {
			return current;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out waiting for import job ${jobId}`);
}

describe('ImportExportService', () => {
	let vaultDir = '';
	let adapter: FileSystemAdapter;
	let service: ImportExportService;

	beforeEach(async () => {
		vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-import-export-'));
		adapter = new FileSystemAdapter(vaultDir);
		await adapter.initialize();
		service = new ImportExportService(
			() => adapter,
			() => vaultDir,
		);
	});

	afterEach(async () => {
		await adapter.close();
		await fs.rm(vaultDir, { recursive: true, force: true });
	});

	it('exports portable markdown zip with assets and supports restore parsing', async () => {
		await fs.mkdir(path.join(vaultDir, 'assets'), { recursive: true });
		await fs.writeFile(path.join(vaultDir, 'assets', 'map.png'), Buffer.from([0x89, 0x50]));

		await adapter.saveNote(
			createNote({
				id: createNoteId('note-export'),
				title: 'Export Session',
				folder: createFolderId('/notes'),
				filePath: 'notes/export-session.md',
				content: 'Map: ![Map](../assets/map.png)\nLink: [[Missing Link]]',
			}),
		);

		const outputPath = path.join(vaultDir, 'export-portable.zip');
		const result = await service.exportMarkdownZip({
			profile: 'portable_markdown_zip',
			outputPath,
		});

		expect(result.canceled).toBe(false);
		expect(result.noteCount).toBe(1);
		expect(result.assetCount).toBe(1);
		expect(result.validation.unresolvedLinks).toBeGreaterThan(0);

		const zip = new AdmZip(outputPath);
		const names = zip.getEntries().map((entry) => entry.entryName);
		expect(names).toContain('README.md');
		expect(names).toContain('validation-report.json');
		expect(names).toContain('assets/map.png');
		const markdownEntries = zip
			.getEntries()
			.filter((entry) => entry.entryName.endsWith('.md') && entry.entryName !== 'README.md')
			.map((entry) => ({
				relativePath: entry.entryName,
				content: entry.getData().toString('utf-8'),
			}));

		const restored = restoreNotesFromMarkdownFiles(markdownEntries);
		expect(restored).toHaveLength(1);
		expect(restored[0]?.title).toBe('Export Session');
	});

	it('resumes import from checkpoint and skips already processed files', async () => {
		const sourceRoot = path.join(vaultDir, 'import-source');
		await fs.mkdir(sourceRoot, { recursive: true });
		await fs.writeFile(
			path.join(sourceRoot, 'resume-a.md'),
			'---\ntitle: "Resume A"\n---\n\nA body',
			'utf-8',
		);
		await fs.writeFile(
			path.join(sourceRoot, 'resume-b.md'),
			'---\ntitle: "Resume B"\n---\n\nB body',
			'utf-8',
		);

		const checkpointPath = path.join(
			vaultDir,
			'.vault',
			'import-checkpoints',
			'obsidian-import-checkpoint.json',
		);
		await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
		await fs.writeFile(
			checkpointPath,
			JSON.stringify(
				{
					version: 1,
					sourceRoot,
					createdAt: '2026-03-01T00:00:00.000Z',
					updatedAt: '2026-03-01T00:00:00.000Z',
					totalFiles: 2,
					processedSourcePaths: ['resume-a.md'],
					defaultResolution: 'merge',
				},
				null,
				2,
			),
			'utf-8',
		);

		const started = await service.startImportJob({
			sourceRoot,
			defaultResolution: 'merge',
			resumeFromCheckpoint: true,
		});
		const final = await waitForTerminalImportStatus(service, started.jobId);
		expect(final.status).toBe('completed');
		expect(final.imported).toBe(1);

		expect(await adapter.resolveTitle('Resume B')).not.toBeNull();
		expect(await adapter.resolveTitle('Resume A')).toBeNull();
	});
});
