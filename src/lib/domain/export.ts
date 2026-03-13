import { strToU8, zipSync } from 'fflate';
import type { Note } from '$lib/types/note.js';
import type { ExportProfile, ExportValidationReport } from '$lib/types/import-export.js';
import { notesState } from '$lib/state/notes.svelte.js';
import {
	buildMarkdownExportEntries,
	buildObsidianImportPreview,
	bundleToMarkdownFiles,
	folderFromRelativePath,
	parseJsonBundle,
	parseMarkdownFile,
	validateUnresolvedLinks,
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

export interface ExportPayload {
	filename: string;
	content: string | Uint8Array;
	mimeType: string;
	profile?: ExportProfile | 'single_markdown';
	validation?: ExportValidationReport;
}

/** Build the canonical browser export payload for one or many notes. */
export async function buildNotesExportPayload(notes: Note[]): Promise<ExportPayload | null> {
	if (notes.length === 0) return null;
	if (notes.length === 1 && notes[0]) {
		return {
			filename: `${toFilename(notes[0].title)}.md`,
			content: noteToMarkdown(notes[0]),
			mimeType: 'text/markdown',
			profile: 'single_markdown',
		};
	}

	const profile: ExportProfile = 'portable_markdown_zip';
	const validationIssues = validateUnresolvedLinks(notes);
	const validation: ExportValidationReport = {
		generatedAt: new Date().toISOString(),
		brokenEmbeds: 0,
		unresolvedLinks: validationIssues.length,
		issues: validationIssues,
	};
	const readme = [
		'# DND Tools Markdown Export',
		'',
		`Generated: ${validation.generatedAt}`,
		`Profile: ${profile}`,
		`Notes: ${notes.length}`,
		'',
		'## Structure',
		'- Markdown notes are exported as plain `.md` files.',
		'- Validation details are stored in `validation-report.json`.',
		'- `assets/.keep` preserves the archive layout for future asset exports.',
		'',
		'## Restore',
		'Import the markdown files back into DND Tools via Settings -> Import/Export.',
	].join('\n');
	const zipEntries = Object.fromEntries(
		buildMarkdownExportEntries(notes, {
			deterministic: false,
			includeStableIds: false,
		}).map((entry) => [entry.relativePath, strToU8(entry.content)]),
	);
	zipEntries['README.md'] = strToU8(readme);
	zipEntries['validation-report.json'] = strToU8(JSON.stringify(validation, null, 2));
	zipEntries['assets/.keep'] = new Uint8Array();

	return {
		filename: 'dndtools-markdown-export.zip',
		content: zipSync(zipEntries),
		mimeType: 'application/zip',
		profile,
		validation,
	};
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
function downloadFile(
	content: string | Uint8Array | Blob,
	filename: string,
	mimeType = 'text/markdown',
): void {
	let blob: Blob;
	if (content instanceof Blob) {
		blob = content;
	} else if (content instanceof Uint8Array) {
		blob = new Blob([new Uint8Array(content)], { type: mimeType });
	} else {
		blob = new Blob([content], { type: mimeType });
	}
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
export async function exportAllNotes(): Promise<void> {
	const payload = await buildNotesExportPayload(notesState.activeNotes);
	if (!payload) return;
	downloadFile(payload.content, payload.filename, payload.mimeType);
}

export {
	buildObsidianImportPreview,
	bundleToMarkdownFiles,
	folderFromRelativePath,
	parseJsonBundle,
	parseMarkdownFile,
};

export type { ObsidianImportCandidate, ObsidianImportPreview, UnpackedVaultFile };
