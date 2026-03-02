import { extractWikilinks } from '$lib/domain/link-extractor.js';
import type { NoteId } from '$lib/types/note.js';

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function buildContextSnippetAtPosition(
	content: string,
	position: number,
	radius = 72,
): string {
	const start = Math.max(0, position - radius);
	const end = Math.min(content.length, position + radius);
	const snippet = collapseWhitespace(content.slice(start, end));
	const prefix = start > 0 ? '... ' : '';
	const suffix = end < content.length ? ' ...' : '';
	return `${prefix}${snippet}${suffix}`.trim();
}

interface SentenceSpan {
	start: number;
	end: number;
}

function splitSentenceSpans(content: string): SentenceSpan[] {
	if (!content.trim()) return [];
	const spans: SentenceSpan[] = [];
	let start = 0;
	for (let index = 0; index < content.length; index += 1) {
		const char = content[index];
		if (char !== '.' && char !== '!' && char !== '?') continue;
		let end = index + 1;
		while (end < content.length && /\s/.test(content[end] ?? '')) {
			end += 1;
		}
		if (end > start) {
			spans.push({ start, end });
		}
		start = end;
	}
	if (start < content.length) {
		spans.push({ start, end: content.length });
	}
	return spans;
}

export function buildTwoSentenceContextSnippetAtPosition(
	content: string,
	position: number,
): string {
	const spans = splitSentenceSpans(content);
	if (spans.length === 0) {
		return buildContextSnippetAtPosition(content, position);
	}

	const boundedPosition = Math.max(0, Math.min(position, Math.max(0, content.length - 1)));
	let sentenceIndex = spans.findIndex(
		(span) => boundedPosition >= span.start && boundedPosition < span.end,
	);
	if (sentenceIndex < 0) {
		sentenceIndex = spans.length - 1;
	}

	let first = sentenceIndex;
	const second = Math.min(spans.length - 1, sentenceIndex + 1);
	if (first === second && first > 0) {
		first -= 1;
	}

	const snippet = collapseWhitespace(content.slice(spans[first]!.start, spans[second]!.end));
	return snippet || buildContextSnippetAtPosition(content, position);
}

export function findBacklinkContextSnippet(input: {
	sourceContent: string;
	targetId: NoteId;
	resolveTitle: (title: string) => NoteId | null;
}): string | null {
	const { sourceContent, targetId, resolveTitle } = input;
	const target = String(targetId);
	for (const link of extractWikilinks(sourceContent)) {
		const resolved = link.targetIdHint ?? resolveTitle(link.title);
		if (!resolved || String(resolved) !== target) continue;
		return buildTwoSentenceContextSnippetAtPosition(sourceContent, link.position);
	}
	return null;
}
