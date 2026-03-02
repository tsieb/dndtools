import { stringify as stringifyYaml } from 'yaml';
import type { Note } from '$lib/types/note.js';
import { createFolderId } from '$lib/types/note.js';
import type {
	ExportValidationIssue,
	ImportFeatureMappingReport,
} from '$lib/types/import-export.js';
import { extractFrontmatter } from '$lib/markdown/frontmatter.js';
import { extractWikilinks } from './link-extractor.js';
import { slugify } from '$lib/utils/slug.js';

export const IMPORT_MAX_NOTE_BYTES = 10 * 1024 * 1024;
export const LARGE_IMPORT_THRESHOLD = 500;

const MARKDOWN_FILE_REGEX = /\.(md|markdown)$/i;
const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

const RESERVED_FRONTMATTER_KEYS = new Set([
	'title',
	'tags',
	'aliases',
	'created',
	'modified',
	'createdAt',
	'updatedAt',
	'id',
	'folder',
	'pinned',
	'pinnedAt',
]);

export interface UnpackedVaultFile {
	relativePath: string;
	content: string;
}

export interface ObsidianImportCandidate {
	id: string;
	title: string;
	content: string;
	tags: string[];
	folder: Note['folder'];
	sourcePath: string;
	frontmatter: Record<string, unknown>;
	manualResolutionHints: string[];
}

export interface ObsidianImportPreview {
	markdownCount: number;
	candidates: ObsidianImportCandidate[];
	skippedPaths: string[];
	duplicateTitles: string[];
	featureMapping: ImportFeatureMappingReport;
}

interface BundleNote {
	title: string;
	folder: string;
	tags: string[];
	content: string;
	createdAt?: string;
	updatedAt?: string;
}

interface ExportBundle {
	notes: BundleNote[];
}

export interface MarkdownExportEntry {
	relativePath: string;
	content: string;
	noteId: string;
	noteTitle: string;
}

export interface BuildMarkdownExportOptions {
	deterministic?: boolean;
	includeStableIds?: boolean;
	pathPrefix?: string;
}

function normalizeNewlines(content: string): string {
	return content.replace(/\r\n/g, '\n');
}

function normalizeFolderPath(path: string): string {
	const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	return normalized.length > 0 ? normalized : '/';
}

function toFilename(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || 'untitled'
	);
}

function toImportTitleFromFilename(filename: string): string {
	return filename
		.replace(/\.(md|markdown)$/i, '')
		.replace(/-/g, ' ')
		.trim();
}

function stablePathHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}
	return `imp-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeTagValue(raw: string): string {
	return raw.trim().replace(/^#/, '').toLowerCase();
}

function parseTagList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => (typeof entry === 'string' ? normalizeTagValue(entry) : ''))
			.filter((entry) => entry.length > 0);
	}
	if (typeof value === 'string') {
		return value
			.split(/[,\s]+/g)
			.map((entry) => normalizeTagValue(entry))
			.filter((entry) => entry.length > 0);
	}
	return [];
}

function extractCustomFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
	const custom: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(frontmatter)) {
		if (!RESERVED_FRONTMATTER_KEYS.has(key)) {
			custom[key] = value;
		}
	}
	return custom;
}

function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => sortKeysDeep(entry));
	}
	if (typeof value === 'object' && value !== null) {
		const sorted = Object.keys(value as Record<string, unknown>)
			.sort((a, b) => a.localeCompare(b))
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
				return acc;
			}, {});
		return sorted;
	}
	return value;
}

function normalizeIsoDate(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toISOString();
}

export function isMarkdownFilePath(filePath: string): boolean {
	return MARKDOWN_FILE_REGEX.test(filePath);
}

/** Convert an imported directory-relative file path into a vault folder path */
export function folderFromRelativePath(relativePath: string): string {
	const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	if (!normalized) return '/';

	const segments = normalized.split('/').filter(Boolean);
	if (segments.length <= 1) return '/';

	// webkitRelativePath includes the selected root directory as segment[0]
	const folderSegments = segments.slice(1, -1);
	return folderSegments.length > 0 ? `/${folderSegments.join('/')}` : '/';
}

/** Parse a markdown file into a partial Note */
export function parseMarkdownFile(content: string, filename: string): Partial<Note> {
	const normalized = normalizeNewlines(content);
	const parsed = extractFrontmatter(normalized);
	const frontmatter = parsed.frontmatter;
	const rawTitle = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
	const title = rawTitle || toImportTitleFromFilename(filename) || 'Untitled';
	const tags = parseTagList(frontmatter.tags);
	const folder = typeof frontmatter.folder === 'string' ? frontmatter.folder : '/';

	return {
		title,
		content: parsed.body.trim(),
		tags,
		folder: createFolderId(folder),
		frontmatter: extractCustomFrontmatter(frontmatter),
	};
}

/** Import notes from a JSON bundle export */
export function parseJsonBundle(content: string): Partial<Note>[] {
	const bundle = JSON.parse(content) as ExportBundle;
	if (!bundle.notes || !Array.isArray(bundle.notes)) {
		throw new Error('Invalid export file format');
	}

	return bundle.notes.map((n) => ({
		title: n.title,
		content: n.content,
		tags: n.tags || [],
		folder: createFolderId(n.folder || '/'),
		frontmatter: {},
	}));
}

function bundleNoteToMarkdown(note: BundleNote): string {
	const frontmatter: Record<string, unknown> = {
		title: note.title,
		tags: note.tags,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
	};
	if (note.folder && note.folder !== '/') {
		frontmatter.folder = note.folder;
	}
	const cleaned = Object.fromEntries(
		Object.entries(frontmatter).filter(([, value]) => {
			if (value === undefined || value === null) return false;
			if (Array.isArray(value)) return value.length > 0;
			return true;
		}),
	);
	return `---\n${stringifyYaml(cleaned).trimEnd()}\n---\n\n${normalizeNewlines(note.content)}`;
}

/** Convert a JSON bundle into markdown files (folder structure + note content) */
export function bundleToMarkdownFiles(content: string): UnpackedVaultFile[] {
	const bundle = JSON.parse(content) as ExportBundle;
	if (!bundle.notes || !Array.isArray(bundle.notes)) {
		throw new Error('Invalid export file format');
	}

	const fileCountByPath = new Map<string, number>();

	return bundle.notes.map((note) => {
		const folder = normalizeFolderPath(note.folder || '/');
		const baseName = toFilename(note.title || 'untitled');
		const directory = folder === '/' ? '' : folder;

		const basePath = `${directory}/${baseName}`.replace(/^\/+/, '');
		const existing = fileCountByPath.get(basePath) ?? 0;
		fileCountByPath.set(basePath, existing + 1);
		const suffix = existing > 0 ? `-${existing + 1}` : '';
		const relativePath = `${basePath}${suffix}.md`;

		return {
			relativePath,
			content: bundleNoteToMarkdown({
				title: note.title || 'Untitled',
				content: note.content || '',
				tags: note.tags || [],
				folder: note.folder || '/',
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
			}),
		};
	});
}

export interface ObsidianWikilinkNormalization {
	content: string;
	mappedWikilinks: number;
	mappedEmbeds: number;
	manualResolutionHints: string[];
	referencedAssets: string[];
}

/** Normalize Obsidian wikilinks and embeds to DND Tools-compatible markdown forms. */
export function normalizeObsidianWikilinks(content: string): ObsidianWikilinkNormalization {
	let mappedWikilinks = 0;
	let mappedEmbeds = 0;
	const manualHints = new Set<string>();
	const referencedAssets = new Set<string>();

	const normalized = normalizeNewlines(content).replace(
		/(!?)\[\[([^\]]+)\]\]/g,
		(full: string, bang: string, body: string) => {
			const [targetPart, ...displayParts] = body.split('|');
			const targetRaw = (targetPart ?? '').trim();
			if (!targetRaw) return full;
			const display = displayParts.join('|').trim();
			const manual = targetRaw.includes('#') || targetRaw.includes('^');
			if (manual) {
				manualHints.add(targetRaw);
			}

			const sectionStripped = targetRaw.split('#')[0]!.split('^')[0]!;
			const pathNormalized = sectionStripped.replace(/\\/g, '/').replace(/\.md$/i, '');
			const isEmbed = bang === '!';
			if (isEmbed && IMAGE_EXTENSION_REGEX.test(pathNormalized)) {
				mappedEmbeds += 1;
				const normalizedAsset = pathNormalized.replace(/^\/+/, '');
				referencedAssets.add(normalizedAsset);
				const fileName = normalizedAsset.split('/').pop() ?? normalizedAsset;
				const altText = display || fileName.replace(/\.[^.]+$/, '');
				return `![${altText}](assets/${fileName})`;
			}

			if (pathNormalized !== targetRaw) {
				mappedWikilinks += 1;
			}
			return display ? `[[${pathNormalized}|${display}]]` : `[[${pathNormalized}]]`;
		},
	);

	return {
		content: normalized,
		mappedWikilinks,
		mappedEmbeds,
		manualResolutionHints: [...manualHints].sort((a, b) => a.localeCompare(b)),
		referencedAssets: [...referencedAssets].sort((a, b) => a.localeCompare(b)),
	};
}

/** Build an Obsidian import preview and conflict summary from unpacked files. */
export function buildObsidianImportPreview(
	files: UnpackedVaultFile[],
	existingTitles: Iterable<string>,
): ObsidianImportPreview {
	const existing = new Set(Array.from(existingTitles, (title) => title.trim().toLowerCase()));
	const duplicateTitleSet = new Set<string>();
	const candidates: ObsidianImportCandidate[] = [];
	const skippedPaths: string[] = [];
	const incomingTitleCounts = new Map<string, number>();
	let markdownCount = 0;
	let mappedWikilinks = 0;
	let mappedEmbeds = 0;
	let manualResolutionCount = 0;

	for (const file of files) {
		const normalizedPath = file.relativePath.replace(/\\/g, '/');
		if (!isMarkdownFilePath(normalizedPath)) {
			skippedPaths.push(normalizedPath);
			continue;
		}

		markdownCount += 1;
		const filename = normalizedPath.split('/').pop() ?? normalizedPath;
		const parsed = parseMarkdownFile(file.content, filename);
		const normalizedWikilinks = normalizeObsidianWikilinks(parsed.content ?? '');
		mappedWikilinks += normalizedWikilinks.mappedWikilinks;
		mappedEmbeds += normalizedWikilinks.mappedEmbeds;
		manualResolutionCount += normalizedWikilinks.manualResolutionHints.length;

		const title =
			parsed.title?.trim() || filename.replace(/\.(md|markdown)$/i, '').trim() || 'Untitled';
		const normalizedTitle = title.toLowerCase();
		const nextCount = (incomingTitleCounts.get(normalizedTitle) ?? 0) + 1;
		incomingTitleCounts.set(normalizedTitle, nextCount);
		if (existing.has(normalizedTitle) || nextCount > 1) {
			duplicateTitleSet.add(title);
		}

		candidates.push({
			id: stablePathHash(normalizedPath),
			title,
			content: normalizedWikilinks.content,
			tags: parsed.tags ?? [],
			folder: createFolderId(folderFromRelativePath(normalizedPath)),
			sourcePath: normalizedPath,
			frontmatter: parsed.frontmatter ?? {},
			manualResolutionHints: normalizedWikilinks.manualResolutionHints,
		});
	}

	return {
		markdownCount,
		candidates,
		skippedPaths,
		duplicateTitles: Array.from(duplicateTitleSet).sort((a, b) => a.localeCompare(b)),
		featureMapping: {
			mapped: [
				'Obsidian title/tags/frontmatter to DND Tools note metadata',
				'Folder structure to vault folder paths',
				'Wikilink .md target normalization',
				'Image embed conversion to markdown assets paths',
			],
			ignored: ['Non-markdown files during note import preview'],
			manualResolution: [
				`Section/block link references requiring manual validation: ${manualResolutionCount}`,
				`Mapped wikilinks: ${mappedWikilinks}`,
				`Mapped embeds: ${mappedEmbeds}`,
			],
		},
	};
}

function buildFrontmatterForExport(
	note: Note,
	deterministic: boolean,
	includeStableIds: boolean,
): string {
	const frontmatter: Record<string, unknown> = {
		title: note.title,
		tags: deterministic ? [...note.tags].sort((a, b) => a.localeCompare(b)) : note.tags,
		createdAt: deterministic ? normalizeIsoDate(note.createdAt) : note.createdAt,
		updatedAt: deterministic ? normalizeIsoDate(note.updatedAt) : note.updatedAt,
		...note.frontmatter,
	};

	if (note.folder !== '/') {
		frontmatter.folder = String(note.folder);
	}
	if (includeStableIds) {
		frontmatter.id = note.id;
	}
	const serialized = deterministic ? sortKeysDeep(frontmatter) : frontmatter;
	return `---\n${stringifyYaml(serialized as Record<string, unknown>).trimEnd()}\n---`;
}

/** Build canonical markdown export entries for zip profiles. */
export function buildMarkdownExportEntries(
	notes: Note[],
	options: BuildMarkdownExportOptions = {},
): MarkdownExportEntry[] {
	const deterministic = options.deterministic ?? false;
	const includeStableIds = options.includeStableIds ?? deterministic;
	const pathPrefix = deterministic ? (options.pathPrefix ?? 'notes') : (options.pathPrefix ?? '');
	const sortedNotes = [...notes].sort((a, b) => {
		const folderCompare = String(a.folder).localeCompare(String(b.folder));
		if (folderCompare !== 0) return folderCompare;
		const titleCompare = a.title.localeCompare(b.title);
		if (titleCompare !== 0) return titleCompare;
		return String(a.id).localeCompare(String(b.id));
	});

	const usedPaths = new Map<string, number>();
	const entries: MarkdownExportEntry[] = [];

	for (const note of sortedNotes) {
		const folder = String(note.folder).replace(/^\/+|\/+$/g, '');
		const safeTitle = slugify(note.title) || 'untitled';
		let filename = deterministic ? `${safeTitle}--${note.id}.md` : `${safeTitle}.md`;
		const baseDirectory = [pathPrefix, folder].filter((segment) => segment.length > 0).join('/');
		let relativePath = [baseDirectory, filename].filter((segment) => segment.length > 0).join('/');

		if (!deterministic) {
			const existing = usedPaths.get(relativePath) ?? 0;
			if (existing > 0) {
				filename = `${safeTitle}-${existing + 1}.md`;
				relativePath = [baseDirectory, filename].filter((segment) => segment.length > 0).join('/');
			}
			usedPaths.set(relativePath, existing + 1);
		}

		const frontmatter = buildFrontmatterForExport(note, deterministic, includeStableIds);
		entries.push({
			relativePath,
			content: `${frontmatter}\n\n${normalizeNewlines(note.content).trimEnd()}\n`,
			noteId: note.id,
			noteTitle: note.title,
		});
	}

	return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/** Validate unresolved wikilink targets for export reporting. */
export function validateUnresolvedLinks(notes: Note[]): ExportValidationIssue[] {
	const titleIndex = new Set(notes.map((note) => note.title.trim().toLowerCase()));
	const issues: ExportValidationIssue[] = [];

	for (const note of notes) {
		for (const link of extractWikilinks(note.content, { includeEmbeds: true })) {
			if (link.targetIdHint) continue;
			const normalizedTarget = link.title.replace(/\.md$/i, '').trim().toLowerCase();
			if (!normalizedTarget) continue;
			if (titleIndex.has(normalizedTarget)) continue;
			issues.push({
				code: 'unresolved_link',
				severity: 'warning',
				message: `Unresolved wikilink target "${link.title}" in "${note.title}"`,
				noteId: note.id,
				noteTitle: note.title,
				target: link.title,
			});
		}
	}

	return issues;
}

/** Reconstruct importable notes from markdown export files (used by restore verification tests). */
export function restoreNotesFromMarkdownFiles(files: UnpackedVaultFile[]): Partial<Note>[] {
	return files
		.filter((file) => isMarkdownFilePath(file.relativePath))
		.map((file) => {
			const filename = file.relativePath.split('/').pop() ?? file.relativePath;
			const parsed = parseMarkdownFile(file.content, filename);
			const folderFromPath = createFolderId(
				file.relativePath.includes('/')
					? `/${file.relativePath.split('/').slice(0, -1).join('/')}`
					: '/',
			);
			return {
				title: parsed.title ?? toImportTitleFromFilename(filename),
				content: parsed.content ?? '',
				tags: parsed.tags ?? [],
				folder: parsed.folder ?? folderFromPath,
				frontmatter: parsed.frontmatter ?? {},
			};
		});
}
