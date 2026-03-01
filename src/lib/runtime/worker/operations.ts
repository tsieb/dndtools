import MiniSearch from 'minisearch';
import type {
	BuildLinkGraphRequest,
	BuildLinkGraphResult,
	BuildSearchIndexRequest,
	BuildSearchIndexResult,
	IndexedNoteDocument,
	ParseNoteBatchRequest,
	ParseNoteBatchResult,
} from './types.js';

const SEARCH_FIELDS: Array<keyof IndexedNoteDocument> = [
	'title',
	'content',
	'tags',
	'folder',
	'filePath',
	'type',
];
const SEARCH_STORE_FIELDS: Array<keyof IndexedNoteDocument> = [
	'title',
	'folder',
	'filePath',
	'type',
	'tags',
	'updatedAt',
];

export const SEARCH_INDEX_OPTIONS = {
	fields: SEARCH_FIELDS,
	storeFields: SEARCH_STORE_FIELDS,
	searchOptions: {
		boost: { title: 4, tags: 2.5, type: 2, content: 1.2, folder: 1 },
		fuzzy: 0.2,
		prefix: true,
	},
};

function noteType(frontmatter: Record<string, unknown>): string {
	const value = frontmatter.type;
	if (typeof value !== 'string') return '';
	return value.trim().toLowerCase();
}

function toIndexedDocument(input: ParseNoteBatchRequest['notes'][number]): IndexedNoteDocument {
	return {
		id: String(input.id),
		title: input.title,
		content: input.content,
		tags: input.tags.join(' '),
		folder: input.folder,
		filePath: input.filePath ?? '',
		type: noteType(input.frontmatter),
		updatedAt: input.updatedAt,
	};
}

export function parseNotesForIndex(input: ParseNoteBatchRequest): ParseNoteBatchResult {
	return {
		documents: input.notes.filter((note) => !note.deleted).map(toIndexedDocument),
	};
}

export function buildSerializedSearchIndex(input: BuildSearchIndexRequest): BuildSearchIndexResult {
	const index = new MiniSearch<IndexedNoteDocument>(SEARCH_INDEX_OPTIONS);
	index.addAll(input.documents);
	return {
		serializedIndex: JSON.stringify(index.toJSON()),
	};
}

export function buildLinkGraphEntries(input: BuildLinkGraphRequest): BuildLinkGraphResult {
	const noteIdSet = new Set(input.noteIds);
	const forward = new Map<string, Set<string>>();
	const backward = new Map<string, Set<string>>();

	for (const noteId of input.noteIds) {
		forward.set(noteId, new Set());
	}

	for (const link of input.links) {
		if (!noteIdSet.has(link.sourceId)) continue;
		const sourceTargets = forward.get(link.sourceId);
		if (!sourceTargets) continue;
		sourceTargets.add(link.targetId);
		if (!backward.has(link.targetId)) {
			backward.set(link.targetId, new Set());
		}
		backward.get(link.targetId)!.add(link.sourceId);
	}

	return {
		forwardEntries: [...forward.entries()].map(([id, targets]) => [id, [...targets]]),
		backwardEntries: [...backward.entries()].map(([id, sources]) => [id, [...sources]]),
	};
}
