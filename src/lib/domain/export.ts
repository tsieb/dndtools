import type { Note } from '$lib/types/note.js';
import { notesState } from '$lib/state/notes.svelte.js';

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

export interface UnpackedVaultFile {
	relativePath: string;
	content: string;
}

/** Convert a note to markdown with YAML frontmatter */
export function noteToMarkdown(note: Note): string {
	const lines: string[] = ['---'];
	lines.push(`title: "${note.title.replace(/"/g, '\\"')}"`);
	if (note.tags.length > 0) {
		lines.push(`tags: [${note.tags.join(', ')}]`);
	}
	if (note.folder !== '/') {
		lines.push(`folder: "${note.folder}"`);
	}
	lines.push(`created: ${note.createdAt}`);
	lines.push(`modified: ${note.updatedAt}`);
	lines.push('---');
	lines.push('');
	lines.push(note.content);
	return lines.join('\n');
}

/** Trigger a file download in the browser */
function downloadFile(content: string, filename: string, mimeType: string = 'text/markdown'): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** Slugify a title for use as filename */
function toFilename(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		|| 'untitled';
}

/** Export a single note as a .md file download */
export function exportNote(note: Note): void {
	const md = noteToMarkdown(note);
	downloadFile(md, `${toFilename(note.title)}.md`);
}

/** Export all active notes as individual .md files in a single JSON manifest
 *  (lightweight alternative to zip — no extra dependency) */
export function exportAllNotes(): void {
	const notes = notesState.activeNotes;
	if (notes.length === 0) return;

	if (notes.length === 1 && notes[0]) {
		exportNote(notes[0]);
		return;
	}

	// For multiple notes, create a JSON bundle that preserves structure
	const bundle = {
		version: 1,
		exportedAt: new Date().toISOString(),
		noteCount: notes.length,
		notes: notes.map((note) => ({
			title: note.title,
			folder: note.folder,
			tags: note.tags,
			content: note.content,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
		})),
	};

	downloadFile(JSON.stringify(bundle, null, 2), 'dndtools-vault-export.json', 'application/json');
}

function bundleNoteToMarkdown(note: BundleNote): string {
	const lines: string[] = ['---'];
	lines.push(`title: "${note.title.replace(/"/g, '\\"')}"`);
	if (note.tags.length > 0) {
		lines.push(`tags: [${note.tags.join(', ')}]`);
	}
	if (note.folder && note.folder !== '/') {
		lines.push(`folder: "${note.folder}"`);
	}
	if (note.createdAt) {
		lines.push(`created: ${note.createdAt}`);
	}
	if (note.updatedAt) {
		lines.push(`modified: ${note.updatedAt}`);
	}
	lines.push('---');
	lines.push('');
	lines.push(note.content);
	return lines.join('\n');
}

function normalizeFolderPath(path: string): string {
	const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	return normalized.length > 0 ? normalized : '/';
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

/** Parse a markdown file into a partial Note */
export function parseMarkdownFile(content: string, filename: string): Partial<Note> {
	const note: Partial<Note> = {};

	// Try to extract frontmatter
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (fmMatch && fmMatch[1] !== undefined && fmMatch[2] !== undefined) {
		const fmBlock = fmMatch[1];
		note.content = fmMatch[2].trim();

		// Parse simple YAML fields
		const titleMatch = fmBlock.match(/title:\s*"?([^"\n]+)"?/);
		if (titleMatch?.[1]) note.title = titleMatch[1].trim();

		const tagsMatch = fmBlock.match(/tags:\s*\[([^\]]*)\]/);
		if (tagsMatch?.[1]) {
			note.tags = tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
		}
	} else {
		note.content = content;
	}

	// Fallback title from filename
	if (!note.title) {
		note.title = filename.replace(/\.md$/i, '').replace(/-/g, ' ');
	}

	return note;
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
		folder: n.folder as Note['folder'],
	}));
}
