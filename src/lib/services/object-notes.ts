import type { Note } from '$lib/types/note.js';
import type {
	CharacterData,
	ImageData,
	StatBlockData,
	VaultObject,
	VaultObjectType,
} from '$lib/types/object.js';
import { createVaultObjectId } from '$lib/types/object.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import {
	normalizeCharacterData,
	normalizeImageData,
	normalizeStatBlockData,
	summarizeVaultObject,
} from '$lib/services/objects.js';

interface DndToolsObjectEnvelope {
	kind?: string;
	summary?: unknown;
	data?: unknown;
	embed?: {
		defaultView?: unknown;
		defaultOpen?: unknown;
		maxDepth?: unknown;
	};
}

interface DndToolsMeta {
	object?: DndToolsObjectEnvelope;
}

function getDndToolsMeta(note: Note): DndToolsMeta | null {
	const raw = note.frontmatter['dndtools'];
	if (typeof raw !== 'object' || raw === null) return null;
	return raw as DndToolsMeta;
}

function normalizeObjectType(kind: unknown): VaultObjectType | null {
	if (kind === 'stat_block' || kind === 'character' || kind === 'image') {
		return kind;
	}
	return null;
}

function normalizeObjectData(type: VaultObjectType, raw: unknown): StatBlockData | CharacterData | ImageData {
	const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	switch (type) {
		case 'stat_block':
			return normalizeStatBlockData(source as Partial<StatBlockData>);
		case 'character':
			return normalizeCharacterData(source as Partial<CharacterData>);
		case 'image':
			return normalizeImageData(source as Partial<ImageData>);
	}
}

export function isVaultObjectNote(note: Note): boolean {
	const meta = getDndToolsMeta(note);
	return !!normalizeObjectType(meta?.object?.kind);
}

export function noteToVaultObject(note: Note): VaultObject | null {
	const meta = getDndToolsMeta(note);
	const type = normalizeObjectType(meta?.object?.kind);
	if (!type) return null;

	const rawSummary =
		typeof meta?.object?.summary === 'string'
			? meta.object.summary
			: typeof note.frontmatter['summary'] === 'string'
				? note.frontmatter['summary']
				: '';
	const data = normalizeObjectData(type, meta?.object?.data);
	const base = {
		id: createVaultObjectId(String(note.id)),
		type,
		name: note.title,
		summary: rawSummary.trim(),
		tags: [...note.tags],
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
	};

	const object = { ...base, data } as VaultObject;
	if (!object.summary) {
		object.summary = summarizeVaultObject(object);
	}
	return object;
}

function defaultObjectFolder(type: VaultObjectType): string {
	return `/objects/${type}`;
}

function buildObjectMarkdown(type: VaultObjectType, data: StatBlockData | CharacterData | ImageData): string {
	if (type === 'stat_block') {
		const value = data as StatBlockData;
		return [
			'## Stat Block',
			'',
			`- Creature Type: ${value.creatureType ?? ''}`.trimEnd(),
			`- Size: ${value.size ?? ''}`.trimEnd(),
			`- Alignment: ${value.alignment ?? ''}`.trimEnd(),
			`- Armor Class: ${value.armorClass ?? ''}`.trimEnd(),
			`- Hit Points: ${value.hitPoints ?? ''}`.trimEnd(),
			`- Speed: ${value.speed ?? ''}`.trimEnd(),
			`- Challenge Rating: ${value.challengeRating ?? ''}`.trimEnd(),
			'',
			'## Traits',
			...(value.traits.length > 0
				? value.traits.map((entry) => `- **${entry.name}:** ${entry.description}`)
				: ['- _Add traits_']),
			'',
			'## Actions',
			...(value.actions.length > 0
				? value.actions.map((entry) => `- **${entry.name}:** ${entry.description}`)
				: ['- _Add actions_']),
		].join('\n');
	}

	if (type === 'character') {
		const value = data as CharacterData;
		const classLine =
			value.className && value.level ? `${value.className} ${value.level}` : (value.className ?? '');
		return [
			'## Character Sheet',
			'',
			`- Ancestry: ${value.ancestry ?? ''}`.trimEnd(),
			`- Class: ${classLine}`.trimEnd(),
			`- Background: ${value.background ?? ''}`.trimEnd(),
			`- Alignment: ${value.alignment ?? ''}`.trimEnd(),
			`- Armor Class: ${value.armorClass ?? ''}`.trimEnd(),
			`- Hit Points: ${value.hitPoints ?? ''}`.trimEnd(),
			`- Speed: ${value.speed ?? ''}`.trimEnd(),
			'',
			'## Goals',
			...(value.goals.length > 0 ? value.goals.map((entry) => `- ${entry}`) : ['- _Add goals_']),
			'',
			'## Bonds',
			...(value.bonds.length > 0 ? value.bonds.map((entry) => `- ${entry}`) : ['- _Add bonds_']),
			'',
			'## Flaws',
			...(value.flaws.length > 0 ? value.flaws.map((entry) => `- ${entry}`) : ['- _Add flaws_']),
			...(value.notes ? ['', '## Notes', '', value.notes] : []),
		].join('\n');
	}

	const value = data as ImageData;
	const alt = value.alt?.trim() || 'Image';
	return [
		'## Image',
		'',
		value.url ? `![${alt}](${value.url})` : '_No image URL provided._',
		...(value.caption ? ['', `> ${value.caption}`] : []),
		...(value.credit ? ['', `Credit: ${value.credit}`] : []),
	].join('\n');
}

export function vaultObjectToNote(object: VaultObject, existing?: Note | null): Note {
	const data = normalizeObjectData(object.type, object.data);
	const summary = object.summary.trim() || summarizeVaultObject({ ...object, data } as VaultObject);
	const baseFrontmatter = { ...(existing?.frontmatter ?? {}) };
	const existingDndtools =
		typeof baseFrontmatter['dndtools'] === 'object' && baseFrontmatter['dndtools'] !== null
			? (baseFrontmatter['dndtools'] as Record<string, unknown>)
			: {};
	baseFrontmatter['dndtools'] = {
		...existingDndtools,
		object: {
			kind: object.type,
			summary,
			data,
			embed: {
				defaultView: 'card',
				defaultOpen: false,
				maxDepth: 4,
			},
		},
	};

	return {
		id: existing?.id ?? createNoteId(String(object.id)),
		title: object.name,
		content: existing?.content?.trim() ? existing.content : buildObjectMarkdown(object.type, data),
		folder: existing?.folder ?? createFolderId(defaultObjectFolder(object.type)),
		filePath: existing?.filePath,
		tags: [...object.tags],
		frontmatter: baseFrontmatter,
		createdAt: existing?.createdAt ?? object.createdAt,
		updatedAt: object.updatedAt,
		deleted: existing?.deleted ?? false,
		deletedAt: existing?.deletedAt ?? null,
		pinned: existing?.pinned ?? false,
		pinnedAt: existing?.pinnedAt ?? null,
	};
}

export function getObjectNoteEmbedDefaults(note: Note): {
	defaultView?: 'card' | 'inline' | 'content';
	defaultOpen?: boolean;
	maxDepth?: number;
} {
	const meta = getDndToolsMeta(note);
	const embed = meta?.object?.embed;
	const view =
		embed?.defaultView === 'card' || embed?.defaultView === 'inline' || embed?.defaultView === 'content'
			? embed.defaultView
			: undefined;
	const defaultOpen = typeof embed?.defaultOpen === 'boolean' ? embed.defaultOpen : undefined;
	const maxDepth =
		typeof embed?.maxDepth === 'number' && Number.isFinite(embed.maxDepth)
			? Math.max(1, Math.trunc(embed.maxDepth))
			: undefined;
	return { defaultView: view, defaultOpen, maxDepth };
}
