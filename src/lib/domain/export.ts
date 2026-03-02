import type { Note } from '$lib/types/note.js';
import { notesState } from '$lib/state/notes.svelte.js';
import {
	buildObsidianImportPreview,
	bundleToMarkdownFiles,
	folderFromRelativePath,
	parseJsonBundle,
	parseMarkdownFile,
	type ObsidianImportCandidate,
	type ObsidianImportPreview,
	type UnpackedVaultFile,
} from '$lib/domain/import-export.js';

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
function downloadFile(content: string, filename: string, mimeType = 'text/markdown'): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

/** Export a single note as a .md file download */
export function exportNote(note: Note): void {
	const markdown = noteToMarkdown(note);
	downloadFile(markdown, `${toFilename(note.title)}.md`);
}

/** Export all active notes as markdown/json browser downloads. */
export function exportAllNotes(): void {
	const notes = notesState.activeNotes;
	if (notes.length === 0) return;
	if (notes.length === 1 && notes[0]) {
		exportNote(notes[0]);
		return;
	}

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

export {
	buildObsidianImportPreview,
	bundleToMarkdownFiles,
	folderFromRelativePath,
	parseJsonBundle,
	parseMarkdownFile,
};

export type { ObsidianImportCandidate, ObsidianImportPreview, UnpackedVaultFile };
