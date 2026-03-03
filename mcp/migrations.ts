import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { nowISO } from '../src/lib/utils/date.js';
import { writeFileAtomic, writeJsonAtomic } from './safe-write.js';

const NOTE_SCHEMA_VERSION_KEY = 'dndtoolsSchemaVersion';

const METADATA_FILE_DEFAULTS: Record<string, Record<string, unknown>> = {
	'index.json': { version: 2, notes: {}, links: {} },
	'session-boards.json': { version: 2, boards: {} },
	'objects.json': { version: 2, objects: {} },
	'mcp-changelog.json': { version: 2, changes: [] },
	'settings.json': { version: 2 },
};

export const CURRENT_SCHEMA_VERSION = {
	notes: 2,
	objects: 2,
	metadata: 2,
} as const;

export interface VaultSchemaVersions {
	notes: number;
	objects: number;
	metadata: number;
}

export interface SchemaMigrationFailure {
	step: string;
	file: string | null;
	message: string;
}

export interface SchemaMigrationStepReport {
	id: 'metadata_v1_to_v2' | 'notes_v1_to_v2' | 'objects_v1_to_v2';
	description: string;
	fromVersion: number;
	toVersion: number;
	pending: number;
	applied: number;
	changedFiles: string[];
	warnings: string[];
	failures: SchemaMigrationFailure[];
}

export interface SchemaMigrationReport {
	startedAt: string;
	finishedAt: string;
	dryRun: boolean;
	upgradeRequired: boolean;
	upgradeApplied: boolean;
	rollbackApplied: boolean;
	/** True when the vault schema is newer than this app understands. Opening is refused. */
	vaultTooNew: boolean;
	checkpointDir: string | null;
	from: VaultSchemaVersions;
	to: VaultSchemaVersions;
	changedFiles: string[];
	warnings: string[];
	failures: SchemaMigrationFailure[];
	steps: SchemaMigrationStepReport[];
}

interface NoteMigrationCandidate {
	filePath: string;
	relPath: string;
	noteVersion: number;
	objectVersion: number;
	isObjectNote: boolean;
	noteNeedsUpgrade: boolean;
	objectNeedsUpgrade: boolean;
}

interface MetadataMigrationCandidate {
	fileName: string;
	filePath: string;
	relPath: string;
	version: number;
	exists: boolean;
	content: Record<string, unknown> | null;
	needsUpgrade: boolean;
}

interface BackupRecord {
	filePath: string;
	backupPath: string | null;
	existed: boolean;
}

function toRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return {};
	}
	// gray-matter may return shared object references for identical sources; clone to avoid
	// cross-call mutations leaking between migration passes or tests.
	return structuredClone(value as Record<string, unknown>);
}

function readVersion(raw: unknown, fallback: number): number {
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return Math.max(1, Math.trunc(raw));
	}
	return fallback;
}

async function findMarkdownFiles(vaultDir: string): Promise<string[]> {
	const files: string[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.')) {
				if (entry.name !== '.vault') {
					continue;
				}
				if (dir === vaultDir) {
					continue;
				}
			}
			if (entry.name === 'node_modules' || entry.name === '.vault') continue;

			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}
			if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
				files.push(fullPath);
			}
		}
	}

	await walk(vaultDir);
	return files;
}

function parseObjectVersion(frontmatter: Record<string, unknown>): {
	version: number;
	isObjectNote: boolean;
} {
	const dndtools = toRecord(frontmatter.dndtools);
	const object = toRecord(dndtools.object);
	const kind = object.kind;
	const isObjectNote =
		kind === 'stat_block' ||
		kind === 'character' ||
		kind === 'image' ||
		kind === 'npc' ||
		kind === 'location' ||
		kind === 'faction' ||
		kind === 'quest' ||
		kind === 'item' ||
		kind === 'handout' ||
		kind === 'encounter' ||
		kind === 'timeline_event';
	if (!isObjectNote) {
		return { version: CURRENT_SCHEMA_VERSION.objects, isObjectNote: false };
	}
	return {
		version: readVersion(object.schemaVersion, 1),
		isObjectNote: true,
	};
}

async function collectNoteCandidates(vaultDir: string): Promise<NoteMigrationCandidate[]> {
	const markdownFiles = await findMarkdownFiles(vaultDir);
	const candidates: NoteMigrationCandidate[] = [];

	for (const filePath of markdownFiles) {
		const raw = await fs.readFile(filePath, 'utf-8');
		const parsed = matter(raw);
		const fm = toRecord(parsed.data);
		const noteVersion = readVersion(fm[NOTE_SCHEMA_VERSION_KEY], 1);
		const objectInfo = parseObjectVersion(fm);
		const relPath = path.relative(vaultDir, filePath).replace(/\\/g, '/');
		if (process.env['DEBUG_MIGRATIONS']) {
			console.log(
				`DEBUG note candidate FULLPATH: ${filePath} dndtoolsSchemaVersion=${String(fm[NOTE_SCHEMA_VERSION_KEY])} noteVersion=${noteVersion}`,
			);
		}
		candidates.push({
			filePath,
			relPath,
			noteVersion,
			objectVersion: objectInfo.version,
			isObjectNote: objectInfo.isObjectNote,
			noteNeedsUpgrade: noteVersion < CURRENT_SCHEMA_VERSION.notes,
			objectNeedsUpgrade:
				objectInfo.isObjectNote && objectInfo.version < CURRENT_SCHEMA_VERSION.objects,
		});
	}

	return candidates;
}

async function collectMetadataCandidates(vaultDir: string): Promise<MetadataMigrationCandidate[]> {
	const metaDir = path.join(vaultDir, '.vault');
	const candidates: MetadataMigrationCandidate[] = [];

	for (const [fileName, defaultValue] of Object.entries(METADATA_FILE_DEFAULTS)) {
		const filePath = path.join(metaDir, fileName);
		const relPath = `.vault/${fileName}`;
		try {
			const raw = await fs.readFile(filePath, 'utf-8');
			const parsed = toRecord(JSON.parse(raw));
			const version = readVersion(parsed.version, 1);
			candidates.push({
				fileName,
				filePath,
				relPath,
				version,
				exists: true,
				content: parsed,
				needsUpgrade: version < CURRENT_SCHEMA_VERSION.metadata,
			});
		} catch {
			candidates.push({
				fileName,
				filePath,
				relPath,
				version: readVersion(defaultValue.version, 1),
				exists: false,
				content: null,
				needsUpgrade: true,
			});
		}
	}

	return candidates;
}

function aggregateFromVersions(
	noteCandidates: NoteMigrationCandidate[],
	metadataCandidates: MetadataMigrationCandidate[],
): VaultSchemaVersions {
	const noteVersion = noteCandidates.length
		? Math.min(...noteCandidates.map((candidate) => candidate.noteVersion))
		: CURRENT_SCHEMA_VERSION.notes;
	const objectVersionCandidates = noteCandidates
		.filter((candidate) => candidate.isObjectNote)
		.map((candidate) => candidate.objectVersion);
	const objectVersion = objectVersionCandidates.length
		? Math.min(...objectVersionCandidates)
		: CURRENT_SCHEMA_VERSION.objects;
	const metadataVersion = metadataCandidates.length
		? Math.min(...metadataCandidates.map((candidate) => candidate.version))
		: CURRENT_SCHEMA_VERSION.metadata;
	return {
		notes: noteVersion,
		objects: objectVersion,
		metadata: metadataVersion,
	};
}

/**
 * Detect whether any file in the vault carries a schema version greater than
 * what this build of the application understands. When true the vault was
 * created (or last migrated) by a newer app version and must not be opened.
 */
function detectVaultTooNew(
	noteCandidates: NoteMigrationCandidate[],
	metadataCandidates: MetadataMigrationCandidate[],
): boolean {
	for (const c of noteCandidates) {
		if (c.noteVersion > CURRENT_SCHEMA_VERSION.notes) return true;
	}
	for (const c of noteCandidates) {
		if (c.isObjectNote && c.objectVersion > CURRENT_SCHEMA_VERSION.objects) return true;
	}
	for (const c of metadataCandidates) {
		if (c.exists && c.version > CURRENT_SCHEMA_VERSION.metadata) return true;
	}
	return false;
}

function createStepReport(
	id: SchemaMigrationStepReport['id'],
	description: string,
	fromVersion: number,
	toVersion: number,
	pending: number,
): SchemaMigrationStepReport {
	return {
		id,
		description,
		fromVersion,
		toVersion,
		pending,
		applied: 0,
		changedFiles: [],
		warnings: [],
		failures: [],
	};
}

async function backupFile(
	vaultDir: string,
	checkpointDir: string,
	filePath: string,
	backups: Map<string, BackupRecord>,
): Promise<void> {
	if (backups.has(filePath)) return;
	try {
		await fs.stat(filePath);
		const relPath = path.relative(vaultDir, filePath);
		const backupPath = path.join(checkpointDir, relPath);
		await fs.mkdir(path.dirname(backupPath), { recursive: true });
		await fs.copyFile(filePath, backupPath);
		backups.set(filePath, { filePath, backupPath, existed: true });
	} catch {
		backups.set(filePath, { filePath, backupPath: null, existed: false });
	}
}

async function rollbackFromCheckpoint(backups: Map<string, BackupRecord>): Promise<void> {
	const entries = [...backups.values()].reverse();
	for (const entry of entries) {
		if (entry.existed && entry.backupPath) {
			await fs.mkdir(path.dirname(entry.filePath), { recursive: true });
			await fs.copyFile(entry.backupPath, entry.filePath);
			continue;
		}
		await fs.unlink(entry.filePath).catch(() => undefined);
	}
}

export async function getSchemaMigrationReport(vaultDir: string): Promise<SchemaMigrationReport> {
	return runSchemaMigrations(vaultDir, { dryRun: true });
}

export async function runSchemaMigrations(
	vaultDir: string,
	options?: {
		dryRun?: boolean;
		createCheckpoint?: boolean;
	},
): Promise<SchemaMigrationReport> {
	const startedAt = nowISO();
	const dryRun = options?.dryRun ?? false;
	const createCheckpoint = options?.createCheckpoint ?? !dryRun;
	const resolvedVaultDir = path.resolve(vaultDir);

	await fs.mkdir(resolvedVaultDir, { recursive: true });
	await fs.mkdir(path.join(resolvedVaultDir, '.vault'), { recursive: true });

	const noteCandidates = await collectNoteCandidates(resolvedVaultDir);
	const metadataCandidates = await collectMetadataCandidates(resolvedVaultDir);
	const from = aggregateFromVersions(noteCandidates, metadataCandidates);
	const vaultTooNew = detectVaultTooNew(noteCandidates, metadataCandidates);

	const metadataPending = metadataCandidates.filter((candidate) => candidate.needsUpgrade);
	const notesPending = noteCandidates.filter((candidate) => candidate.noteNeedsUpgrade);
	const objectPending = noteCandidates.filter((candidate) => candidate.objectNeedsUpgrade);

	const metadataStep = createStepReport(
		'metadata_v1_to_v2',
		'Upgrade .vault metadata file version markers and initialize missing metadata files.',
		1,
		CURRENT_SCHEMA_VERSION.metadata,
		metadataPending.length,
	);
	const notesStep = createStepReport(
		'notes_v1_to_v2',
		'Add note schema version marker in markdown frontmatter.',
		1,
		CURRENT_SCHEMA_VERSION.notes,
		notesPending.length,
	);
	const objectsStep = createStepReport(
		'objects_v1_to_v2',
		'Add object schema version marker for object-backed notes.',
		1,
		CURRENT_SCHEMA_VERSION.objects,
		objectPending.length,
	);

	const report: SchemaMigrationReport = {
		startedAt,
		finishedAt: nowISO(),
		dryRun,
		upgradeRequired: metadataStep.pending > 0 || notesStep.pending > 0 || objectsStep.pending > 0,
		upgradeApplied: false,
		rollbackApplied: false,
		vaultTooNew,
		checkpointDir: null,
		from,
		to: {
			notes: CURRENT_SCHEMA_VERSION.notes,
			objects: CURRENT_SCHEMA_VERSION.objects,
			metadata: CURRENT_SCHEMA_VERSION.metadata,
		},
		changedFiles: [],
		warnings: [],
		failures: [],
		steps: [metadataStep, notesStep, objectsStep],
	};

	const changedFileSet = new Set<string>();

	for (const candidate of metadataPending) {
		metadataStep.changedFiles.push(candidate.relPath);
		changedFileSet.add(candidate.relPath);
		if (!candidate.exists) {
			const warning = `${candidate.relPath} was missing and will be created with defaults.`;
			metadataStep.warnings.push(warning);
			report.warnings.push(warning);
		}
	}
	for (const candidate of notesPending) {
		notesStep.changedFiles.push(candidate.relPath);
		changedFileSet.add(candidate.relPath);
	}
	for (const candidate of objectPending) {
		if (!objectsStep.changedFiles.includes(candidate.relPath)) {
			objectsStep.changedFiles.push(candidate.relPath);
		}
		changedFileSet.add(candidate.relPath);
	}

	report.changedFiles = [...changedFileSet].sort((a, b) => a.localeCompare(b));

	if (dryRun || vaultTooNew || !report.upgradeRequired) {
		report.finishedAt = nowISO();
		return report;
	}

	const backupRecords = new Map<string, BackupRecord>();
	const checkpointDir = createCheckpoint
		? path.join(
				resolvedVaultDir,
				'.vault',
				'checkpoints',
				`schema-migration-${Date.now()}-${randomUUID().slice(0, 8)}`,
			)
		: null;
	if (checkpointDir) {
		await fs.mkdir(checkpointDir, { recursive: true });
		report.checkpointDir = path.relative(resolvedVaultDir, checkpointDir).replace(/\\/g, '/');
	}

	try {
		for (const candidate of metadataPending) {
			if (checkpointDir) {
				await backupFile(resolvedVaultDir, checkpointDir, candidate.filePath, backupRecords);
			}
			const nextData = candidate.content
				? { ...candidate.content, version: CURRENT_SCHEMA_VERSION.metadata }
				: {
						...METADATA_FILE_DEFAULTS[candidate.fileName],
						version: CURRENT_SCHEMA_VERSION.metadata,
					};
			await writeJsonAtomic(candidate.filePath, nextData);
			metadataStep.applied += 1;
		}

		for (const candidate of noteCandidates) {
			if (!candidate.noteNeedsUpgrade && !candidate.objectNeedsUpgrade) {
				continue;
			}
			if (checkpointDir) {
				await backupFile(resolvedVaultDir, checkpointDir, candidate.filePath, backupRecords);
			}

			const raw = await fs.readFile(candidate.filePath, 'utf-8');
			const parsed = matter(raw);
			const fm = toRecord(parsed.data);

			if (candidate.noteNeedsUpgrade) {
				fm[NOTE_SCHEMA_VERSION_KEY] = CURRENT_SCHEMA_VERSION.notes;
				notesStep.applied += 1;
			}

			if (candidate.objectNeedsUpgrade) {
				const dndtools = toRecord(fm.dndtools);
				const object = toRecord(dndtools.object);
				object.schemaVersion = CURRENT_SCHEMA_VERSION.objects;
				dndtools.object = object;
				fm.dndtools = dndtools;
				objectsStep.applied += 1;
			}

			const rewritten = matter.stringify(parsed.content, fm);
			await writeFileAtomic(candidate.filePath, rewritten);
		}

		report.upgradeApplied = true;
	} catch (error) {
		const failure: SchemaMigrationFailure = {
			step: 'migration_engine',
			file: null,
			message: error instanceof Error ? error.message : String(error),
		};
		report.failures.push(failure);
		if (checkpointDir) {
			await rollbackFromCheckpoint(backupRecords);
			report.rollbackApplied = true;
		}
	}

	report.finishedAt = nowISO();
	return report;
}
