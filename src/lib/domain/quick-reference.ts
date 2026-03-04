import type { Note, NoteId } from '$lib/types/note.js';
import type { VaultObjectType } from '$lib/types/object.js';
import { noteToVaultObject } from '$lib/domain/object-notes.js';
import { getVaultObjectTypeLabel, summarizeVaultObject } from '$lib/domain/objects.js';

export type QuickReferenceEntityType = VaultObjectType | 'rule';

export interface QuickReferenceEntityRecord {
	noteId: NoteId;
	title: string;
	type: QuickReferenceEntityType;
	typeLabel: string;
	keyStats: string[];
	previewLines: string[];
	updatedAt: string;
	searchText: string;
}

export interface QuickReferenceEntitySearchResult extends QuickReferenceEntityRecord {
	score: number;
}

export interface QuickReferenceNoteMeta {
	type: QuickReferenceEntityType;
	typeLabel: string;
	keyStats: string[];
	previewLines: string[];
}

export function quickReferenceIconToken(type: QuickReferenceEntityType): string {
	switch (type) {
		case 'npc':
			return 'N';
		case 'location':
			return 'L';
		case 'item':
			return 'I';
		case 'handout':
			return 'H';
		case 'quest':
			return 'Q';
		case 'character':
			return 'C';
		case 'stat_block':
			return 'S';
		case 'faction':
			return 'F';
		case 'encounter':
			return 'E';
		case 'timeline_event':
			return 'T';
		case 'image':
			return 'P';
		case 'map':
			return 'M';
		case 'rule':
			return 'R';
	}
}

const PREVIEW_LINE_LIMIT = 3;
const PREVIEW_LINE_MAX_LENGTH = 96;

function trimPreviewLine(line: string): string {
	const trimmed = line.trim();
	if (trimmed.length <= PREVIEW_LINE_MAX_LENGTH) return trimmed;
	return `${trimmed.slice(0, PREVIEW_LINE_MAX_LENGTH - 1).trimEnd()}...`;
}

function extractPreviewLines(content: string, maxLines = PREVIEW_LINE_LIMIT): string[] {
	const lines = content
		.split(/\r?\n/)
		.map((line) => trimPreviewLine(line.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s+/, '')))
		.filter(Boolean);
	return lines.slice(0, maxLines);
}

function normalizeEntityType(note: Note): QuickReferenceEntityType {
	const object = noteToVaultObject(note);
	if (object) return object.type;
	return 'rule';
}

function collectKeyStats(note: Note): string[] {
	const object = noteToVaultObject(note);
	if (!object) {
		const tag = note.tags[0];
		return tag ? [`Tag ${tag}`] : [];
	}

	switch (object.type) {
		case 'stat_block': {
			const ac =
				typeof object.data.armorClass === 'number' ? `AC ${object.data.armorClass}` : undefined;
			const hp = object.data.hitPoints ? `HP ${object.data.hitPoints}` : undefined;
			return [ac, hp].filter((entry): entry is string => !!entry);
		}
		case 'npc': {
			const ac =
				typeof object.data.armorClass === 'number' ? `AC ${object.data.armorClass}` : undefined;
			const hp =
				typeof object.data.hitPoints === 'number' ? `HP ${object.data.hitPoints}` : undefined;
			const role = object.data.role ? `Role ${object.data.role}` : undefined;
			return [role, ac, hp].filter((entry): entry is string => !!entry);
		}
		case 'location': {
			const kind = object.data.locationType;
			const region = object.data.region;
			return [kind, region].filter((entry): entry is string => !!entry);
		}
		case 'item': {
			const kind = object.data.itemType;
			const rarity = object.data.rarity ? `Rarity ${object.data.rarity}` : undefined;
			return [kind, rarity].filter((entry): entry is string => !!entry);
		}
		default: {
			const summary = summarizeVaultObject(object);
			return summary
				.split('|')
				.map((entry) => entry.trim())
				.filter(Boolean)
				.slice(0, 3);
		}
	}
}

function entityTypeLabel(note: Note, type: QuickReferenceEntityType): string {
	if (type === 'rule') {
		const frontmatterType = note.frontmatter['type'];
		if (typeof frontmatterType === 'string' && frontmatterType.trim().length > 0) {
			return frontmatterType.trim();
		}
		return 'Rule';
	}
	return getVaultObjectTypeLabel(type);
}

export function buildQuickReferenceEntityRecords(
	notes: readonly Note[],
): QuickReferenceEntityRecord[] {
	return notes
		.filter((note) => !note.deleted)
		.map((note) => {
			const type = normalizeEntityType(note);
			const keyStats = collectKeyStats(note);
			const previewLines = extractPreviewLines(note.content, PREVIEW_LINE_LIMIT);
			const typeLabel = entityTypeLabel(note, type);
			const searchText = [
				note.title,
				typeLabel,
				keyStats.join(' '),
				previewLines.join(' '),
				note.tags.join(' '),
			]
				.join(' ')
				.toLowerCase();
			return {
				noteId: note.id,
				title: note.title,
				type,
				typeLabel,
				keyStats,
				previewLines,
				updatedAt: note.updatedAt,
				searchText,
			};
		})
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function describeQuickReferenceNote(note: Note): QuickReferenceNoteMeta {
	const type = normalizeEntityType(note);
	return {
		type,
		typeLabel: entityTypeLabel(note, type),
		keyStats: collectKeyStats(note),
		previewLines: extractPreviewLines(note.content, PREVIEW_LINE_LIMIT),
	};
}

function scoreRecord(record: QuickReferenceEntityRecord, query: string): number {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return 1;
	const tokens = normalized.split(/\s+/).filter(Boolean);
	const lowerTitle = record.title.toLowerCase();
	const lowerType = record.typeLabel.toLowerCase();

	let score = 0;
	for (const token of tokens) {
		if (lowerTitle === token) {
			score += 700;
			continue;
		}
		if (lowerTitle.startsWith(token)) {
			score += 300;
			continue;
		}
		if (lowerTitle.includes(token)) {
			score += 160;
			continue;
		}
		if (lowerType.includes(token)) {
			score += 110;
			continue;
		}
		if (record.searchText.includes(token)) {
			score += 60;
			continue;
		}
		return -1;
	}
	return score;
}

export function searchQuickReferenceEntities(
	records: readonly QuickReferenceEntityRecord[],
	query: string,
	limit = 14,
): QuickReferenceEntitySearchResult[] {
	return records
		.map((record) => ({ record, score: scoreRecord(record, query) }))
		.filter((entry) => entry.score >= 0)
		.sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt))
		.slice(0, Math.max(1, limit))
		.map(({ record, score }) => ({ ...record, score }));
}
