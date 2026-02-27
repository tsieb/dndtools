import type { McpChangeRecord, McpChangePreview } from '../types/mcp.js';
import type { Note } from '../types/note.js';
import { extractWikilinks } from './link-extractor.js';

const COMPACT_LINE_LIMIT = 24;
const FULL_LINE_LIMIT = 300;
const LINK_PREVIEW_LIMIT = 12;

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
	if (JSON.stringify(prev.frontmatter) !== JSON.stringify(next.frontmatter))
		changed.push('frontmatter');
	return changed;
}

function hasMetadata(metadata: string[], key: string): boolean {
	return metadata.includes(key);
}

function summarizeSemanticImpact(preview: McpChangePreview): string {
	const parts: string[] = [];
	if (preview.semantic.titleChanged) parts.push('rename');
	if (preview.semantic.folderChanged) parts.push('move');
	if (preview.semantic.tagsChanged) parts.push('retag');
	if (preview.semantic.frontmatterChanged) parts.push('frontmatter');
	if (preview.semantic.deletedStateChanged) parts.push('trash-state');
	if (parts.length === 0) {
		return preview.semantic.structural ? 'structural update' : 'content update';
	}
	return parts.join(', ');
}

function normalizeLinkTarget(target: string): string {
	return target.trim().toLowerCase();
}

function getLinkTargetSet(content: string): Set<string> {
	const links = extractWikilinks(content);
	const targets = new Set<string>();
	for (const link of links) {
		if (link.targetIdHint) {
			targets.add(`id:${normalizeLinkTarget(link.targetIdHint)}`);
			continue;
		}
		targets.add(`title:${normalizeLinkTarget(link.title)}`);
	}
	return targets;
}

function compactLinkTargets(values: Set<string>): string[] {
	return [...values].sort((a, b) => a.localeCompare(b)).slice(0, LINK_PREVIEW_LIMIT);
}

function buildLinkImpact(
	beforeContent: string,
	afterContent: string,
): McpChangePreview['linkImpact'] {
	const beforeTargets = getLinkTargetSet(beforeContent);
	const afterTargets = getLinkTargetSet(afterContent);
	const added = new Set<string>();
	const removed = new Set<string>();

	for (const target of afterTargets) {
		if (!beforeTargets.has(target)) {
			added.add(target);
		}
	}
	for (const target of beforeTargets) {
		if (!afterTargets.has(target)) {
			removed.add(target);
		}
	}

	return {
		added: added.size,
		removed: removed.size,
		addedTargets: compactLinkTargets(added),
		removedTargets: compactLinkTargets(removed),
	};
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
	parts.push(`Semantic: ${summarizeSemanticImpact(preview)}`);
	if (preview.addedLines > 0 || preview.removedLines > 0) {
		parts.push(`Lines: +${preview.addedLines} -${preview.removedLines}`);
	}
	if (preview.linkImpact.added > 0 || preview.linkImpact.removed > 0) {
		parts.push(`Links: +${preview.linkImpact.added} -${preview.linkImpact.removed}`);
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
	const semantic: McpChangePreview['semantic'] = {
		titleChanged: hasMetadata(metadata, 'title'),
		folderChanged: hasMetadata(metadata, 'folder') || hasMetadata(metadata, 'path'),
		tagsChanged: hasMetadata(metadata, 'tags'),
		frontmatterChanged: hasMetadata(metadata, 'frontmatter'),
		deletedStateChanged:
			hasMetadata(metadata, 'deleted') ||
			hasMetadata(metadata, 'trashed') ||
			hasMetadata(metadata, 'restored'),
		structural:
			record.type !== 'update' ||
			hasMetadata(metadata, 'title') ||
			hasMetadata(metadata, 'folder') ||
			hasMetadata(metadata, 'path') ||
			hasMetadata(metadata, 'frontmatter') ||
			hasMetadata(metadata, 'created') ||
			hasMetadata(metadata, 'deleted'),
	};
	const linkImpact = buildLinkImpact(beforeContent, afterContent);

	const preview: McpChangePreview = {
		summary: '',
		metadata,
		addedLines: compact.added,
		removedLines: compact.removed,
		compactDiff: compact.text,
		fullDiff: full.text,
		hasMore: full.truncated,
		semantic,
		linkImpact,
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
