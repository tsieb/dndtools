import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import matter from 'gray-matter';
import type { FileSystemAdapter } from '../mcp/storage.js';
import type { Note } from '../src/lib/types/note.js';
import { createFolderId, createNoteId } from '../src/lib/types/note.js';
import { nowISO } from '../src/lib/utils/date.js';
import type {
	ExportProfile,
	ExportValidationIssue,
	ExportZipResult,
	ImportAnalysisIssue,
	ImportAnalysisReport,
	ImportCheckpointSummary,
	ImportJobProgress,
	ImportResolutionChoice,
} from '../src/lib/types/import-export.js';
import {
	IMPORT_MAX_NOTE_BYTES,
	LARGE_IMPORT_THRESHOLD,
	buildMarkdownExportEntries,
	buildObsidianImportPreview,
	isMarkdownFilePath,
	normalizeObsidianWikilinks,
	type ObsidianImportCandidate,
	type UnpackedVaultFile,
	validateUnresolvedLinks,
} from '../src/lib/domain/import-export.js';
import { extractWikilinks } from '../src/lib/domain/link-extractor.js';

const CHECKPOINT_VERSION = 1;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const OBSIDIAN_EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;
const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

interface ImportCheckpointFile {
	version: number;
	sourceRoot: string;
	createdAt: string;
	updatedAt: string;
	totalFiles: number;
	processedSourcePaths: string[];
	defaultResolution: ImportResolutionChoice;
}

interface ImportJobRuntime {
	progress: ImportJobProgress;
}

interface ExportAssetFile {
	absolutePath: string;
	zipPath: string;
}

interface ImportCandidateRuntime {
	candidate: ObsidianImportCandidate;
	fileSizeBytes: number;
	invalidFrontmatter: boolean;
	encodingIssue: boolean;
}

function isSafeImportRoot(value: string): boolean {
	return value.length > 0 && !value.includes('\0');
}

function normalizeForComparison(value: string): string {
	return value.trim().toLowerCase();
}

function hasFrontmatterBlock(content: string): boolean {
	return /^---\r?\n[\s\S]*?\r?\n---\r?\n?/m.test(content);
}

function toIssueId(code: ImportAnalysisIssue['code'], sourcePath: string, suffix = ''): string {
	return suffix ? `${code}:${sourcePath}:${suffix}` : `${code}:${sourcePath}`;
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const absolutePath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			const nested = await listFilesRecursive(absolutePath);
			files.push(...nested);
			continue;
		}
		if (entry.isFile()) {
			files.push(absolutePath);
		}
	}
	return files;
}

function resolvePathInsideRoot(rootDir: string, maybeRelativePath: string): string {
	const resolved = path.resolve(rootDir, maybeRelativePath);
	const normalizedRoot = path.resolve(rootDir);
	if (!resolved.startsWith(normalizedRoot)) {
		throw new Error(`Resolved path escaped root: ${maybeRelativePath}`);
	}
	return resolved;
}

function ensureNormalizedRelativePath(rootDir: string, absolutePath: string): string {
	return path.relative(rootDir, absolutePath).replace(/\\/g, '/');
}

function safeDecodeUtf8(buffer: Buffer): { ok: true; content: string } | { ok: false } {
	try {
		const decoder = new TextDecoder('utf-8', { fatal: true });
		return { ok: true, content: decoder.decode(buffer) };
	} catch {
		return { ok: false };
	}
}

function issueSeverityTally(issues: ImportAnalysisIssue[]): ImportAnalysisReport['stats'] {
	return {
		errors: issues.filter((issue) => issue.severity === 'error').length,
		warnings: issues.filter((issue) => issue.severity === 'warning').length,
		infos: issues.filter((issue) => issue.severity === 'info').length,
		duplicateTitles: issues.filter(
			(issue) =>
				issue.code === 'duplicate_title_existing' || issue.code === 'duplicate_title_incoming',
		).length,
		idCollisions: issues.filter((issue) => issue.code === 'id_collision').length,
		invalidFrontmatter: issues.filter((issue) => issue.code === 'invalid_frontmatter').length,
		encodingIssues: issues.filter((issue) => issue.code === 'encoding_issue').length,
		missingLinkedFiles: issues.filter((issue) => issue.code === 'missing_linked_file').length,
		sizeLimitExceeded: issues.filter((issue) => issue.code === 'size_limit_exceeded').length,
		manualResolutionItems: issues.filter((issue) => issue.code === 'manual_wikilink_resolution')
			.length,
	};
}

function buildImportNote(candidate: ObsidianImportCandidate): Note {
	const now = nowISO();
	return {
		id: createNoteId(candidate.id),
		title: candidate.title,
		content: candidate.content,
		folder: candidate.folder,
		tags: [...candidate.tags],
		frontmatter: { ...candidate.frontmatter },
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

function mergeImportedNote(existing: Note, incoming: ObsidianImportCandidate): Note {
	const now = nowISO();
	const mergedTags = Array.from(
		new Set([
			...existing.tags.map((tag) => tag.toLowerCase()),
			...incoming.tags.map((tag) => tag.toLowerCase()),
		]),
	).sort((a, b) => a.localeCompare(b));
	const mergedContent =
		`${existing.content.trimEnd()}\n\n---\n## Imported Merge (${incoming.sourcePath})\n\n${incoming.content.trim()}`.trim();
	return {
		...existing,
		content: mergedContent,
		tags: mergedTags,
		frontmatter: {
			...existing.frontmatter,
			...incoming.frontmatter,
			importMergedFrom: incoming.sourcePath,
		},
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: existing.pinned,
		pinnedAt: existing.pinnedAt,
	};
}

function overwriteImportedNote(existing: Note, incoming: ObsidianImportCandidate): Note {
	const now = nowISO();
	return {
		...existing,
		title: incoming.title,
		content: incoming.content,
		folder: incoming.folder,
		tags: [...incoming.tags],
		frontmatter: {
			...incoming.frontmatter,
		},
		updatedAt: now,
		deleted: false,
		deletedAt: null,
	};
}

export class ImportExportService {
	private jobs = new Map<string, ImportJobRuntime>();

	constructor(
		private readonly getStorage: () => FileSystemAdapter,
		private readonly getVaultDir: () => string,
	) {}

	private checkpointDir(): string {
		return path.join(this.getVaultDir(), '.vault', 'import-checkpoints');
	}

	private checkpointFilePath(): string {
		return path.join(this.checkpointDir(), 'obsidian-import-checkpoint.json');
	}

	private async loadCheckpointFile(): Promise<ImportCheckpointFile | null> {
		try {
			const raw = await fs.readFile(this.checkpointFilePath(), 'utf-8');
			const parsed = JSON.parse(raw) as Partial<ImportCheckpointFile>;
			if (
				parsed.version !== CHECKPOINT_VERSION ||
				typeof parsed.sourceRoot !== 'string' ||
				typeof parsed.createdAt !== 'string' ||
				typeof parsed.updatedAt !== 'string' ||
				typeof parsed.totalFiles !== 'number' ||
				!Array.isArray(parsed.processedSourcePaths)
			) {
				return null;
			}
			const defaultResolution: ImportResolutionChoice =
				parsed.defaultResolution === 'merge' ||
				parsed.defaultResolution === 'overwrite' ||
				parsed.defaultResolution === 'skip'
					? parsed.defaultResolution
					: 'skip';
			return {
				version: CHECKPOINT_VERSION,
				sourceRoot: parsed.sourceRoot,
				createdAt: parsed.createdAt,
				updatedAt: parsed.updatedAt,
				totalFiles: parsed.totalFiles,
				processedSourcePaths: parsed.processedSourcePaths
					.filter((entry): entry is string => typeof entry === 'string')
					.sort((a, b) => a.localeCompare(b)),
				defaultResolution,
			};
		} catch {
			return null;
		}
	}

	private async saveCheckpointFile(checkpoint: ImportCheckpointFile): Promise<void> {
		await fs.mkdir(this.checkpointDir(), { recursive: true });
		await fs.writeFile(this.checkpointFilePath(), JSON.stringify(checkpoint, null, 2), 'utf-8');
	}

	private async clearCheckpointFile(): Promise<void> {
		await fs.rm(this.checkpointFilePath(), { force: true });
	}

	private async scanImportSource(sourceRoot: string): Promise<{
		allFiles: string[];
		unpackedMarkdown: UnpackedVaultFile[];
		candidateRuntime: Map<string, ImportCandidateRuntime>;
		issues: ImportAnalysisIssue[];
	}> {
		const absoluteSource = path.resolve(sourceRoot);
		const allAbsoluteFiles = await listFilesRecursive(absoluteSource);
		const allFiles = allAbsoluteFiles.map((entry) =>
			ensureNormalizedRelativePath(absoluteSource, entry),
		);
		const markdownFiles = allAbsoluteFiles.filter((absolutePath) =>
			isMarkdownFilePath(absolutePath.replace(/\\/g, '/')),
		);

		const unpackedMarkdown: UnpackedVaultFile[] = [];
		const candidateRuntime = new Map<string, ImportCandidateRuntime>();
		const issues: ImportAnalysisIssue[] = [];

		for (const absolutePath of markdownFiles) {
			const relativePath = ensureNormalizedRelativePath(absoluteSource, absolutePath);
			try {
				const fileBuffer = await fs.readFile(absolutePath);
				if (fileBuffer.byteLength > IMPORT_MAX_NOTE_BYTES) {
					issues.push({
						id: toIssueId('size_limit_exceeded', relativePath),
						code: 'size_limit_exceeded',
						severity: 'error',
						message: `File exceeds size limit (${IMPORT_MAX_NOTE_BYTES} bytes): ${relativePath}`,
						sourcePath: relativePath,
						relatedPaths: [],
						resolutionChoices: ['skip'],
						recommendedResolution: 'skip',
					});
				}

				const decoded = safeDecodeUtf8(fileBuffer);
				if (!decoded.ok) {
					issues.push({
						id: toIssueId('encoding_issue', relativePath),
						code: 'encoding_issue',
						severity: 'error',
						message: `File is not valid UTF-8 and cannot be imported: ${relativePath}`,
						sourcePath: relativePath,
						relatedPaths: [],
						resolutionChoices: ['skip'],
						recommendedResolution: 'skip',
					});
					continue;
				}

				let invalidFrontmatter = false;
				try {
					matter(decoded.content);
				} catch {
					invalidFrontmatter = true;
					issues.push({
						id: toIssueId('invalid_frontmatter', relativePath),
						code: 'invalid_frontmatter',
						severity: 'warning',
						message: `Frontmatter could not be parsed cleanly: ${relativePath}`,
						sourcePath: relativePath,
						relatedPaths: [],
						resolutionChoices: ['skip', 'overwrite', 'merge'],
						recommendedResolution: 'merge',
					});
				}

				unpackedMarkdown.push({
					relativePath,
					content: decoded.content,
				});

				// Candidate runtime is finalized after preview parsing below.
				candidateRuntime.set(relativePath, {
					candidate: {
						id: '',
						title: '',
						content: '',
						tags: [],
						folder: createFolderId('/'),
						sourcePath: relativePath,
						frontmatter: {},
						manualResolutionHints: [],
					},
					fileSizeBytes: fileBuffer.byteLength,
					invalidFrontmatter,
					encodingIssue: false,
				});
			} catch (error) {
				issues.push({
					id: toIssueId('encoding_issue', relativePath, 'read_error'),
					code: 'encoding_issue',
					severity: 'error',
					message: `Failed to read markdown file "${relativePath}": ${String(error)}`,
					sourcePath: relativePath,
					relatedPaths: [],
					resolutionChoices: ['skip'],
					recommendedResolution: 'skip',
				});
			}
		}

		return {
			allFiles: allFiles.sort((a, b) => a.localeCompare(b)),
			unpackedMarkdown,
			candidateRuntime,
			issues,
		};
	}

	private collectMissingLinkedFileIssues(
		candidates: ObsidianImportCandidate[],
	): ImportAnalysisIssue[] {
		const allPaths = new Set<string>();
		for (const candidate of candidates) {
			allPaths.add(candidate.sourcePath.toLowerCase());
		}

		const issues: ImportAnalysisIssue[] = [];
		for (const candidate of candidates) {
			const candidateDir = candidate.sourcePath.includes('/')
				? candidate.sourcePath.split('/').slice(0, -1).join('/')
				: '';

			for (const link of extractWikilinks(candidate.content, { includeEmbeds: true })) {
				if (link.targetIdHint) continue;
				const linkTarget = link.title.trim();
				if (!linkTarget) continue;
				const looksLikePath =
					linkTarget.includes('/') || linkTarget.includes('\\') || /\.[a-z0-9]+$/i.test(linkTarget);
				if (!looksLikePath) continue;

				const normalizedTarget = linkTarget.replace(/\\/g, '/');
				const candidatesToCheck = new Set<string>();
				candidatesToCheck.add(
					path.posix
						.normalize(path.posix.join(candidateDir, normalizedTarget))
						.replace(/^\.\/+/, ''),
				);
				candidatesToCheck.add(normalizedTarget);
				if (!/\.(md|markdown)$/i.test(normalizedTarget)) {
					candidatesToCheck.add(`${normalizedTarget}.md`);
					candidatesToCheck.add(`${normalizedTarget}.markdown`);
				}

				const exists = [...candidatesToCheck].some((entry) => allPaths.has(entry.toLowerCase()));
				if (exists) continue;

				issues.push({
					id: toIssueId('missing_linked_file', candidate.sourcePath, linkTarget),
					code: 'missing_linked_file',
					severity: 'warning',
					message: `Linked file reference "${linkTarget}" was not found in source import set`,
					sourcePath: candidate.sourcePath,
					relatedPaths: [...candidatesToCheck].sort((a, b) => a.localeCompare(b)),
					resolutionChoices: ['skip', 'overwrite', 'merge'],
					recommendedResolution: 'merge',
				});
			}
		}

		return issues;
	}

	async analyzeImportSource(sourceRoot: string): Promise<ImportAnalysisReport> {
		if (!isSafeImportRoot(sourceRoot)) {
			throw new Error('Invalid import source root');
		}

		const absoluteSource = path.resolve(sourceRoot);
		const storage = this.getStorage();
		const existingNotes = await storage.getAllNotes({ includeDeleted: true });
		const existingTitleIndex = new Set(
			existingNotes.map((note) => normalizeForComparison(note.title)),
		);
		const existingIdIndex = new Set(existingNotes.map((note) => String(note.id)));

		const scanned = await this.scanImportSource(absoluteSource);
		const preview = buildObsidianImportPreview(scanned.unpackedMarkdown, existingTitleIndex);
		const incomingTitleCounts = new Map<string, number>();
		for (const candidate of preview.candidates) {
			const normalized = normalizeForComparison(candidate.title);
			incomingTitleCounts.set(normalized, (incomingTitleCounts.get(normalized) ?? 0) + 1);
		}

		const issues = [...scanned.issues];
		for (const candidate of preview.candidates) {
			const runtime = scanned.candidateRuntime.get(candidate.sourcePath);
			if (runtime) {
				runtime.candidate = candidate;
			}
			if (existingTitleIndex.has(normalizeForComparison(candidate.title))) {
				issues.push({
					id: toIssueId('duplicate_title_existing', candidate.sourcePath),
					code: 'duplicate_title_existing',
					severity: 'warning',
					message: `Existing note title collision: "${candidate.title}"`,
					sourcePath: candidate.sourcePath,
					relatedPaths: [],
					resolutionChoices: ['skip', 'overwrite', 'merge'],
					recommendedResolution: 'merge',
				});
			}
			if ((incomingTitleCounts.get(normalizeForComparison(candidate.title)) ?? 0) > 1) {
				issues.push({
					id: toIssueId('duplicate_title_incoming', candidate.sourcePath),
					code: 'duplicate_title_incoming',
					severity: 'warning',
					message: `Duplicate title inside import set: "${candidate.title}"`,
					sourcePath: candidate.sourcePath,
					relatedPaths: preview.candidates
						.filter(
							(entry) =>
								normalizeForComparison(entry.title) === normalizeForComparison(candidate.title),
						)
						.map((entry) => entry.sourcePath),
					resolutionChoices: ['skip', 'overwrite', 'merge'],
					recommendedResolution: 'merge',
				});
			}
			if (existingIdIndex.has(candidate.id)) {
				issues.push({
					id: toIssueId('id_collision', candidate.sourcePath),
					code: 'id_collision',
					severity: 'warning',
					message: `Imported note ID collides with existing note ID: ${candidate.id}`,
					sourcePath: candidate.sourcePath,
					relatedPaths: [],
					resolutionChoices: ['skip', 'overwrite', 'merge'],
					recommendedResolution: 'overwrite',
				});
			}
			for (const hint of candidate.manualResolutionHints) {
				issues.push({
					id: toIssueId('manual_wikilink_resolution', candidate.sourcePath, hint),
					code: 'manual_wikilink_resolution',
					severity: 'info',
					message: `Manual link validation recommended for "${hint}"`,
					sourcePath: candidate.sourcePath,
					relatedPaths: [],
					resolutionChoices: ['skip', 'overwrite', 'merge'],
					recommendedResolution: 'merge',
				});
			}
		}

		issues.push(...this.collectMissingLinkedFileIssues(preview.candidates));
		issues.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

		return {
			generatedAt: nowISO(),
			sourceRoot: absoluteSource,
			totalFiles: scanned.allFiles.length,
			markdownFiles: preview.markdownCount,
			largeImport: preview.markdownCount > LARGE_IMPORT_THRESHOLD,
			candidates: preview.candidates
				.map((candidate) => ({
					sourcePath: candidate.sourcePath,
					title: candidate.title,
					folder: String(candidate.folder),
					id: candidate.id,
					tags: [...candidate.tags].sort((a, b) => a.localeCompare(b)),
					hasFrontmatter:
						hasFrontmatterBlock(
							scanned.unpackedMarkdown.find((entry) => entry.relativePath === candidate.sourcePath)
								?.content ?? '',
						) || Object.keys(candidate.frontmatter).length > 0,
					manualResolutionHints: [...candidate.manualResolutionHints],
				}))
				.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
			issues,
			stats: issueSeverityTally(issues),
			featureMapping: preview.featureMapping,
		};
	}

	async startImportJob(input: {
		sourceRoot: string;
		defaultResolution: ImportResolutionChoice;
		resumeFromCheckpoint?: boolean;
	}): Promise<ImportJobProgress> {
		const sourceRoot = path.resolve(input.sourceRoot);
		const defaultResolution = input.defaultResolution;
		const resumeFromCheckpoint = input.resumeFromCheckpoint ?? false;
		const jobId = randomUUID();
		const initial: ImportJobProgress = {
			jobId,
			sourceRoot,
			status: 'queued',
			startedAt: nowISO(),
			updatedAt: nowISO(),
			totalFiles: 0,
			processedFiles: 0,
			imported: 0,
			skipped: 0,
			overwritten: 0,
			merged: 0,
			warnings: 0,
			errors: [],
			lastError: null,
			checkpointStored: false,
		};
		this.jobs.set(jobId, { progress: initial });
		void this.runImportJob({
			jobId,
			sourceRoot,
			defaultResolution,
			resumeFromCheckpoint,
		});
		return { ...initial };
	}

	private async runImportJob(input: {
		jobId: string;
		sourceRoot: string;
		defaultResolution: ImportResolutionChoice;
		resumeFromCheckpoint: boolean;
	}): Promise<void> {
		const runtime = this.jobs.get(input.jobId);
		if (!runtime) return;
		const progress = runtime.progress;
		progress.status = 'running';
		progress.updatedAt = nowISO();

		try {
			const analysis = await this.analyzeImportSource(input.sourceRoot);
			let candidates = analysis.candidates
				.map((summary) => summary.sourcePath)
				.map((sourcePath) => sourcePath)
				.sort((a, b) => a.localeCompare(b));

			const checkpoint = input.resumeFromCheckpoint ? await this.loadCheckpointFile() : null;
			if (checkpoint && checkpoint.sourceRoot === input.sourceRoot) {
				const processedSet = new Set(checkpoint.processedSourcePaths);
				candidates = candidates.filter((sourcePath) => !processedSet.has(sourcePath));
				progress.processedFiles = checkpoint.processedSourcePaths.length;
				progress.totalFiles = checkpoint.totalFiles;
				progress.checkpointStored = true;
			} else {
				progress.totalFiles = candidates.length;
			}
			progress.updatedAt = nowISO();

			// Re-scan markdown content for full import candidates.
			const scanned = await this.scanImportSource(input.sourceRoot);
			const preview = buildObsidianImportPreview(
				scanned.unpackedMarkdown,
				(await this.getStorage().getAllNotes({ includeDeleted: true })).map((note) => note.title),
			);
			const candidateByPath = new Map(
				preview.candidates.map((candidate) => [candidate.sourcePath, candidate]),
			);
			const issuesByPath = new Map<string, ImportAnalysisIssue[]>();
			for (const issue of analysis.issues) {
				const bucket = issuesByPath.get(issue.sourcePath);
				if (bucket) {
					bucket.push(issue);
				} else {
					issuesByPath.set(issue.sourcePath, [issue]);
				}
			}

			const processedPaths = new Set<string>();
			if (checkpoint && checkpoint.sourceRoot === input.sourceRoot) {
				for (const entry of checkpoint.processedSourcePaths) {
					processedPaths.add(entry);
				}
			}

			for (const sourcePath of candidates) {
				const candidate = candidateByPath.get(sourcePath);
				if (!candidate) {
					progress.skipped += 1;
					progress.processedFiles += 1;
					progress.updatedAt = nowISO();
					continue;
				}
				const candidateIssues = issuesByPath.get(sourcePath) ?? [];
				const blockingError = candidateIssues.some(
					(issue) => issue.code === 'encoding_issue' || issue.code === 'size_limit_exceeded',
				);
				if (blockingError) {
					progress.skipped += 1;
					progress.errors.push(`Skipped "${candidate.title}" due to blocking validation errors`);
					progress.processedFiles += 1;
					processedPaths.add(sourcePath);
					await this.saveCheckpointFile({
						version: CHECKPOINT_VERSION,
						sourceRoot: input.sourceRoot,
						createdAt: progress.startedAt,
						updatedAt: nowISO(),
						totalFiles: progress.totalFiles,
						processedSourcePaths: [...processedPaths].sort((a, b) => a.localeCompare(b)),
						defaultResolution: input.defaultResolution,
					});
					progress.checkpointStored = true;
					progress.updatedAt = nowISO();
					continue;
				}

				const storage = this.getStorage();
				const existingNotes = await storage.getAllNotes({ includeDeleted: true });
				const byId = new Map(existingNotes.map((note) => [String(note.id), note]));
				const byTitle = new Map(
					existingNotes.map((note) => [normalizeForComparison(note.title), note]),
				);
				const existing =
					byId.get(candidate.id) ?? byTitle.get(normalizeForComparison(candidate.title)) ?? null;

				const hasConflict = candidateIssues.some(
					(issue) =>
						issue.code === 'duplicate_title_existing' ||
						issue.code === 'duplicate_title_incoming' ||
						issue.code === 'id_collision' ||
						issue.code === 'invalid_frontmatter',
				);

				const resolution: ImportResolutionChoice = hasConflict ? input.defaultResolution : 'merge';
				if (resolution === 'skip') {
					progress.skipped += 1;
				} else if (existing && resolution === 'overwrite') {
					await storage.saveNote(overwriteImportedNote(existing, candidate));
					progress.imported += 1;
					progress.overwritten += 1;
				} else if (existing && resolution === 'merge') {
					await storage.saveNote(mergeImportedNote(existing, candidate));
					progress.imported += 1;
					progress.merged += 1;
				} else {
					await storage.saveNote(buildImportNote(candidate));
					progress.imported += 1;
				}

				progress.warnings += candidateIssues.filter((issue) => issue.severity === 'warning').length;
				progress.processedFiles += 1;
				processedPaths.add(sourcePath);
				await this.saveCheckpointFile({
					version: CHECKPOINT_VERSION,
					sourceRoot: input.sourceRoot,
					createdAt: progress.startedAt,
					updatedAt: nowISO(),
					totalFiles: progress.totalFiles,
					processedSourcePaths: [...processedPaths].sort((a, b) => a.localeCompare(b)),
					defaultResolution: input.defaultResolution,
				});
				progress.checkpointStored = true;
				progress.updatedAt = nowISO();
			}

			progress.status = 'completed';
			progress.updatedAt = nowISO();
			progress.lastError = null;
			await this.clearCheckpointFile();
			progress.checkpointStored = false;
		} catch (error) {
			progress.status = 'failed';
			progress.lastError = String(error);
			progress.errors.push(`Import failed: ${String(error)}`);
			progress.updatedAt = nowISO();
			progress.checkpointStored = true;
		}
	}

	getImportJobProgress(jobId: string): ImportJobProgress | null {
		const runtime = this.jobs.get(jobId);
		if (!runtime) return null;
		return { ...runtime.progress, errors: [...runtime.progress.errors] };
	}

	async getImportCheckpointSummary(): Promise<ImportCheckpointSummary> {
		const checkpoint = await this.loadCheckpointFile();
		if (!checkpoint) {
			return {
				exists: false,
				sourceRoot: null,
				createdAt: null,
				totalFiles: 0,
				processedFiles: 0,
				remainingFiles: 0,
				defaultResolution: 'skip',
			};
		}
		return {
			exists: true,
			sourceRoot: checkpoint.sourceRoot,
			createdAt: checkpoint.createdAt,
			totalFiles: checkpoint.totalFiles,
			processedFiles: checkpoint.processedSourcePaths.length,
			remainingFiles: Math.max(0, checkpoint.totalFiles - checkpoint.processedSourcePaths.length),
			defaultResolution: checkpoint.defaultResolution,
		};
	}

	async clearImportCheckpoint(): Promise<void> {
		await this.clearCheckpointFile();
	}

	private resolveAssetTargetPath(
		rawReference: string,
		note: Note,
		profile: ExportProfile,
		assetPathByAbsolute: Map<string, string>,
		usedPortableAssetNames: Map<string, number>,
	): ExportAssetFile | null {
		const vaultDir = this.getVaultDir();
		const trimmed = rawReference.trim().replace(/^<|>$/g, '');
		if (!trimmed || /^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
			return null;
		}
		const noQuery = trimmed.split('?')[0]!.split('#')[0]!;
		const referencePath = noQuery.replace(/\\/g, '/');
		if (!IMAGE_EXTENSION_REGEX.test(referencePath)) {
			return null;
		}

		const noteDirectory = note.filePath
			? path.dirname(resolvePathInsideRoot(vaultDir, note.filePath))
			: vaultDir;
		const absoluteCandidate = path.isAbsolute(referencePath)
			? path.resolve(vaultDir, referencePath.replace(/^[/\\]+/, ''))
			: path.resolve(noteDirectory, referencePath);
		const normalizedVault = path.resolve(vaultDir);
		const normalizedAbsolute = path.resolve(absoluteCandidate);
		if (!normalizedAbsolute.startsWith(normalizedVault)) {
			throw new Error(`Asset path escaped vault root: ${rawReference}`);
		}
		if (assetPathByAbsolute.has(normalizedAbsolute)) {
			return {
				absolutePath: normalizedAbsolute,
				zipPath: assetPathByAbsolute.get(normalizedAbsolute)!,
			};
		}

		let zipPath: string;
		if (profile === 'deterministic_markdown_zip') {
			const rel = path
				.relative(vaultDir, normalizedAbsolute)
				.replace(/\\/g, '/')
				.replace(/^\/+/, '');
			zipPath = `assets/${rel}`;
		} else {
			const baseName = path.basename(normalizedAbsolute);
			const previous = usedPortableAssetNames.get(baseName) ?? 0;
			usedPortableAssetNames.set(baseName, previous + 1);
			zipPath =
				previous === 0
					? `assets/${baseName}`
					: `assets/${path.parse(baseName).name}-${previous + 1}${path.extname(baseName)}`;
		}

		assetPathByAbsolute.set(normalizedAbsolute, zipPath);
		return { absolutePath: normalizedAbsolute, zipPath };
	}

	async exportMarkdownZip(options: {
		profile: ExportProfile;
		outputPath: string;
	}): Promise<ExportZipResult> {
		const storage = this.getStorage();
		const notes = await storage.getAllNotes({ includeDeleted: false });
		const profile = options.profile;
		const assetPathByAbsolute = new Map<string, string>();
		const usedPortableAssetNames = new Map<string, number>();
		const assetFiles: ExportAssetFile[] = [];
		const brokenEmbedIssues: ExportValidationIssue[] = [];

		const transformedNotes: Note[] = [];
		for (const note of notes) {
			let content = note.content;

			content = content.replace(MARKDOWN_IMAGE_REGEX, (full, rawPath: string) => {
				try {
					const resolved = this.resolveAssetTargetPath(
						rawPath,
						note,
						profile,
						assetPathByAbsolute,
						usedPortableAssetNames,
					);
					if (!resolved) return full;
					assetFiles.push(resolved);
					return full.replace(rawPath, resolved.zipPath);
				} catch {
					brokenEmbedIssues.push({
						code: 'broken_embed',
						severity: 'warning',
						message: `Broken markdown embed "${rawPath}" in "${note.title}"`,
						noteId: note.id,
						noteTitle: note.title,
						target: rawPath,
					});
					return full;
				}
			});

			content = content.replace(OBSIDIAN_EMBED_REGEX, (full, rawPath: string) => {
				try {
					const resolved = this.resolveAssetTargetPath(
						rawPath,
						note,
						profile,
						assetPathByAbsolute,
						usedPortableAssetNames,
					);
					if (!resolved) return full;
					assetFiles.push(resolved);
					return `![](${resolved.zipPath})`;
				} catch {
					brokenEmbedIssues.push({
						code: 'broken_embed',
						severity: 'warning',
						message: `Broken Obsidian embed "${rawPath}" in "${note.title}"`,
						noteId: note.id,
						noteTitle: note.title,
						target: rawPath,
					});
					return full;
				}
			});

			const normalizedForMarkdown = normalizeObsidianWikilinks(content).content;
			transformedNotes.push({
				...note,
				content: normalizedForMarkdown,
			});
		}

		const zip = new AdmZip();
		const markdownEntries = buildMarkdownExportEntries(transformedNotes, {
			deterministic: profile === 'deterministic_markdown_zip',
			includeStableIds: profile === 'deterministic_markdown_zip',
		});
		for (const entry of markdownEntries) {
			zip.addFile(entry.relativePath, Buffer.from(entry.content, 'utf-8'));
		}

		const seenAssetZipPaths = new Set<string>();
		for (const asset of assetFiles) {
			if (seenAssetZipPaths.has(asset.zipPath)) continue;
			seenAssetZipPaths.add(asset.zipPath);
			try {
				const content = await fs.readFile(asset.absolutePath);
				zip.addFile(asset.zipPath, content);
			} catch {
				brokenEmbedIssues.push({
					code: 'broken_embed',
					severity: 'warning',
					message: `Failed to include asset "${asset.absolutePath}"`,
					noteId: '',
					noteTitle: '',
					target: asset.absolutePath,
				});
			}
		}
		if (seenAssetZipPaths.size === 0) {
			zip.addFile('assets/.keep', Buffer.from('', 'utf-8'));
		}

		const unresolvedLinkIssues = validateUnresolvedLinks(transformedNotes);
		const validationIssues = [...brokenEmbedIssues, ...unresolvedLinkIssues];
		const validation = {
			generatedAt: nowISO(),
			brokenEmbeds: brokenEmbedIssues.length,
			unresolvedLinks: unresolvedLinkIssues.length,
			issues: validationIssues,
		};

		const readme = [
			'# DND Tools Markdown Export',
			'',
			`Generated: ${validation.generatedAt}`,
			`Profile: ${profile}`,
			`Notes: ${markdownEntries.length}`,
			`Assets: ${seenAssetZipPaths.size}`,
			'',
			'## Structure',
			'- Markdown notes are exported as plain `.md` files.',
			'- Image assets are copied under `assets/`.',
			'- Validation details are in `validation-report.json`.',
			'',
			'## Restore',
			'Import the markdown files back into DND Tools via Settings -> Import/Export.',
		].join('\n');
		zip.addFile('README.md', Buffer.from(readme, 'utf-8'));
		zip.addFile(
			'validation-report.json',
			Buffer.from(JSON.stringify(validation, null, 2), 'utf-8'),
		);

		await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
		zip.writeZip(options.outputPath);

		return {
			canceled: false,
			path: options.outputPath,
			profile,
			noteCount: markdownEntries.length,
			assetCount: seenAssetZipPaths.size,
			validation,
		};
	}
}
