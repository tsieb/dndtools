import type { McpChangeRecord, McpChangePreview } from '../types/mcp.js';
import type { Note } from '../types/note.js';

const COMPACT_LINE_LIMIT = 24;
const FULL_LINE_LIMIT = 300;

function splitLines(content: string): string[] {
	return content.replace(/\r\n/g, '\n').split('\n');
}

function truncateLines(lines: string[], limit: number): { lines: string[]; truncated: boolean } {
	if (lines.length <= limit) {
		return { lines, truncated: false };
	}
	return { lines: lines.slice(0, limit), truncated: true };
}

function formatTags(tags: string[]): string {
	return tags.join(', ');
}

function metadataChanges(before: Note | null, after: Note | null): string[] {
	if (!before && !after) return [];
	if (!before && after) {
		return ['created'];
	}
	if (before && !after) {
		return ['deleted'];
	}

	const changed: string[] = [];
	const prev = before as Note;
	const next = after as Note;

	if (prev.title !== next.title) changed.push('title');
	if (String(prev.folder) !== String(next.folder)) changed.push('folder');
	if (formatTags(prev.tags) !== formatTags(next.tags)) changed.push('tags');
	if (prev.deleted !== next.deleted) changed.push(next.deleted ? 'trashed' : 'restored');
	if (prev.filePath !== next.filePath) changed.push('path');
	if (JSON.stringify(prev.frontmatter) !== JSON.stringify(next.frontmatter)) changed.push('frontmatter');
	return changed;
}

function buildLineDiff(
	beforeContent: string,
	afterContent: string,
	lineLimit: number,
): { text: string; added: number; removed: number; truncated: boolean } {
	const beforeLines = splitLines(beforeContent);
	const afterLines = splitLines(afterContent);

	let prefix = 0;
	while (
		prefix < beforeLines.length &&
		prefix < afterLines.length &&
		beforeLines[prefix] === afterLines[prefix]
	) {
		prefix += 1;
	}

	let suffix = 0;
	while (
		suffix < beforeLines.length - prefix &&
		suffix < afterLines.length - prefix &&
		beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
	) {
		suffix += 1;
	}

	const removedLines = beforeLines.slice(prefix, beforeLines.length - suffix);
	const addedLines = afterLines.slice(prefix, afterLines.length - suffix);
	const changedLines = [
		...removedLines.map((line) => `-${line}`),
		...addedLines.map((line) => `+${line}`),
	];
	const truncated = truncateLines(changedLines, lineLimit);

	if (changedLines.length === 0) {
		return {
			text: '(content unchanged)',
			added: 0,
			removed: 0,
			truncated: false,
		};
	}

	return {
		text: truncated.lines.join('\n') + (truncated.truncated ? '\n... (truncated)' : ''),
		added: addedLines.length,
		removed: removedLines.length,
		truncated: truncated.truncated,
	};
}

function buildSummary(record: McpChangeRecord, preview: McpChangePreview): string {
	const parts: string[] = [];
	if (preview.metadata.length > 0) {
		parts.push(`Fields: ${preview.metadata.join(', ')}`);
	}
	if (preview.addedLines > 0 || preview.removedLines > 0) {
		parts.push(`Lines: +${preview.addedLines} -${preview.removedLines}`);
	}
	if (parts.length === 0) {
		parts.push(record.summary);
	}
	return parts.join(' | ');
}

export function buildMcpChangePreview(record: McpChangeRecord): McpChangePreview {
	const beforeNote = record.before?.note ?? null;
	const afterNote = record.after?.note ?? null;
	const beforeContent = beforeNote?.content ?? '';
	const afterContent = afterNote?.content ?? '';
	const metadata = metadataChanges(beforeNote, afterNote);
	const compact = buildLineDiff(beforeContent, afterContent, COMPACT_LINE_LIMIT);
	const full = buildLineDiff(beforeContent, afterContent, FULL_LINE_LIMIT);

	const preview: McpChangePreview = {
		summary: '',
		metadata,
		addedLines: compact.added,
		removedLines: compact.removed,
		compactDiff: compact.text,
		fullDiff: full.text,
		hasMore: full.truncated,
	};
	preview.summary = buildSummary(record, preview);
	return preview;
}

export function withMcpChangePreview(record: McpChangeRecord): McpChangeRecord {
	if (record.preview) return record;
	return {
		...record,
		preview: buildMcpChangePreview(record),
	};
}
