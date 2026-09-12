import type { ContentItem, VaultContentState } from '../state/content';
import type { PermissionState } from '../state/permission-state';
import { hasDmAuthority } from '../state/permission-state';
import { getContentItemsForActor } from '../queries/content-query';
import {
	createContentItemInputSchema,
	setContentSectionVisibilityInputSchema,
	setContentFieldVisibilityInputSchema,
	defineCalendarInputSchema,
} from '../schemas/commands';
import { containsSensitiveData } from '../diagnostics/redaction';
import { sanitizeMarkdownContent } from '../security/content-safety';
import { obsidianFileToCanonicalNote } from '../sync/obsidian-adapter';

export interface FolderEntry {
	path: string;
	bytes: Uint8Array;
}
export { FOLDER_MAX_BYTES, FOLDER_MAX_FILES, safeFolderPath } from './folder-zip';
import { safeFolderPath } from './folder-zip';

/** Image destinations only: prose, code, wikilinks and embeds are never rewritten. */
export function mapFolderImages(body: string, map: (ref: string) => string): string {
	let fence: { marker: string; length: number } | null = null;
	return body
		.split(/(\r?\n)/)
		.map((line) => {
			const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
			if (marker) {
				if (!fence) fence = { marker: marker[0]!, length: marker.length };
				else if (marker[0] === fence.marker && marker.length >= fence.length) fence = null;
				return line;
			}
			if (fence) return line;
			return line.replace(
				/(`+)[^\r\n]*?\1|(!\[[^\]\r\n]*\]\()([^\s)]+)(\))/g,
				(raw, code: string | undefined, before: string, ref: string, after: string) =>
					code ? raw : `${before}${map(ref)}${after}`,
			);
		})
		.join('');
}

export function selectFolderNotes(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	includeDmOnly = false,
): ContentItem[] {
	const actor = permissions.actors[actorId];
	if (!actor || !hasDmAuthority(actor.role))
		throw new Error('Only the DM may export a markdown folder.');
	const all = Object.values(content.items).filter(
		(item) => item.kind === 'note' && item.deletedAt === null,
	);
	if (includeDmOnly) return all.sort((a, b) => a.id.localeCompare(b.id));
	// The list projection strips secret callouts but does not slice raw section bodies.
	// Omit notes with restricted sections/fields entirely from a public folder.
	const publicId = '__markdown_export_reader__';
	const projected = getContentItemsForActor(
		content,
		{
			...permissions,
			actors: { ...permissions.actors, [publicId]: { ...actor, id: publicId, role: 'player' } },
		},
		publicId,
	);
	return all
		.filter(
			(item) =>
				item.visibility === 'player-visible' &&
				[...Object.values(item.sectionVisibility), ...Object.values(item.fieldVisibility)].every(
					(rule) => rule.level === 'player-visible',
				),
		)
		.flatMap((item) => {
			const view = projected.find((entry) => entry.id === item.id);
			return view
				? [
						{
							...item,
							body: view.body,
							fields: view.fields,
							sectionVisibility: {},
							fieldVisibility: {},
							fieldSections: {},
							sharedWith: [],
						},
					]
				: [];
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Valid YAML with JSON-quoted scalars; the body starts immediately after the closing fence. */
export function encodeFolderNote(note: ContentItem, assets: Record<string, string> = {}): string {
	if (
		containsSensitiveData({
			title: note.title,
			body: note.body,
			fields: note.fields,
			dateFields: note.dateFields,
			timelineRefs: note.timelineRefs,
		})
	) {
		throw new Error(
			`Note "${note.title}" contains device secrets or absolute paths; remove them before exporting.`,
		);
	}
	const props: Record<string, unknown> = {
		'dndtools.format': 'markdown-folder-v1',
		title: note.title,
		tags: note.fields.tags ?? [],
		aliases: note.fields.aliases ?? [],
		'dndtools.visibility': note.visibility,
		'dndtools.createdAt': note.fields['dndtools.createdAt'] ?? note.createdAt,
		'dndtools.updatedAt': note.fields['dndtools.updatedAt'] ?? note.updatedAt,
		'dndtools.fields': JSON.stringify(note.fields),
		'dndtools.dateFields': JSON.stringify(note.dateFields),
		'dndtools.timelineRefs': JSON.stringify(note.timelineRefs),
		'dndtools.sharedWith': note.sharedWith,
		'dndtools.sectionVisibility': JSON.stringify(note.sectionVisibility),
		'dndtools.fieldVisibility': JSON.stringify(note.fieldVisibility),
		'dndtools.fieldSections': JSON.stringify(note.fieldSections),
		'dndtools.assets': JSON.stringify(assets),
	};
	const body = mapFolderImages(note.body, (ref) => assets[ref] ?? ref);
	if (sanitizeMarkdownContent(body) !== body) {
		throw new Error(
			`Note "${note.title}" contains unsupported HTML or URLs that cannot round-trip safely.`,
		);
	}
	return `---\n${Object.keys(props)
		.sort()
		.map((key) => `${key}: ${JSON.stringify(props[key])}`)
		.join('\n')}\n---\n${body}`;
}

/** Import payload validated by the same schema as the create command, with no whitespace cleanup. */
export function decodeFolderNote(text: string, path: string) {
	const note = obsidianFileToCanonicalNote(text, { preserveBody: true });
	const props = readFolderProperties(text);
	const own = props['dndtools.format'] === 'markdown-folder-v1';
	const json = (key: string, fallback: unknown): unknown =>
		own && typeof props[key] === 'string' ? JSON.parse(props[key] as string) : fallback;
	const assets = json('dndtools.assets', {}) as Record<string, unknown>;
	if (!assets || typeof assets !== 'object' || Array.isArray(assets))
		throw new Error('Invalid note asset map.');
	const reverse = new Map<string, string>();
	for (const [ref, target] of Object.entries(assets)) {
		if (!/^asset:[\w-]+$/.test(ref) || typeof target !== 'string' || !safeFolderPath(target))
			throw new Error('Invalid note asset path.');
		reverse.set(target, ref);
	}
	const fields = json('dndtools.fields', {
		...note.userProperties,
		tags: note.tags,
		aliases: note.aliases,
	});
	if (!fields || typeof fields !== 'object' || Array.isArray(fields))
		throw new Error('Invalid note fields.');
	if (own)
		for (const key of ['tags', 'aliases']) {
			if (Array.isArray(props[key]) && (key in fields || (props[key] as unknown[]).length > 0)) {
				(fields as Record<string, unknown>)[key] = props[key];
			}
		}
	return createContentItemInputSchema.parse({
		kind: 'note',
		title: props.title ?? note.userProperties.title ?? path.replace(/\.(md|markdown)$/i, ''),
		body: mapFolderImages(sanitizeMarkdownContent(note.body), (ref) => reverse.get(ref) ?? ref),
		fields: {
			...(fields as Record<string, unknown>),
			...(own
				? {
						'dndtools.createdAt': props['dndtools.createdAt'],
						'dndtools.updatedAt': props['dndtools.updatedAt'],
					}
				: {}),
		},
		visibility:
			props['dndtools.visibility'] ?? note.dndtoolsMetadata['dndtools.visibility'] ?? 'dm-only',
		dateFields: json('dndtools.dateFields', {}),
		timelineRefs: json('dndtools.timelineRefs', []),
		sharedWith: own ? props['dndtools.sharedWith'] : [],
	});
}

export function folderNotePath(note: ContentItem, used: Set<string>): string {
	const source = note.fields.sourcePath;
	const title = `${
		note.title
			.replace(/[\\/:*?"<>|]/g, '-')
			.split('')
			.map((char) => (char.charCodeAt(0) < 32 ? '-' : char))
			.join('')
			.replace(/^\.+/, '') || 'Untitled'
	}.md`;
	const preferred =
		typeof source === 'string' && /\.md$/i.test(source) && safeFolderPath(source) ? source : title;
	if (!safeFolderPath(preferred)) throw new Error('Note filename is too long or unsafe.');
	let path = preferred;
	for (let i = 2; used.has(path.toLowerCase()); i++) path = preferred.replace(/\.md$/i, `-${i}.md`);
	used.add(path.toLowerCase());
	return path;
}

function readFolderProperties(text: string): Record<string, unknown> {
	const fence = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	const props: Record<string, unknown> = Object.create(null);
	if (fence)
		for (const line of fence[1]!.split(/\r?\n/)) {
			const match = /^([\w.-]+): (.*)$/.exec(line);
			if (match) {
				try {
					props[match[1]!] = JSON.parse(match[2]!);
				} catch {
					/* Ordinary Obsidian scalar. */
				}
			}
		}
	return props;
}

/** Validate granular rules before any writes; the importer applies them while the note is private. */
export function decodeFolderRules(text: string) {
	const props = readFolderProperties(text);
	const read = (key: string): Record<string, unknown> => {
		const value: unknown =
			props['dndtools.format'] === 'markdown-folder-v1' && typeof props[key] === 'string'
				? JSON.parse(props[key] as string)
				: {};
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error('Invalid note visibility metadata.');
		return value as Record<string, unknown>;
	};
	const sections = read('dndtools.sectionVisibility');
	const fields = read('dndtools.fieldVisibility');
	const attribution = read('dndtools.fieldSections');
	return {
		sections: Object.entries(sections).map(([sectionId, rule]) =>
			setContentSectionVisibilityInputSchema.parse({ itemId: 'pending', sectionId, rule }),
		),
		fields: [...new Set([...Object.keys(fields), ...Object.keys(attribution)])].map((fieldPath) => {
			if (!fieldPath.startsWith('fields.')) throw new Error('Invalid field visibility path.');
			return setContentFieldVisibilityInputSchema.parse({
				itemId: 'pending',
				fieldKey: fieldPath.slice(7),
				rule: fields[fieldPath] ?? null,
				sectionId: attribution[fieldPath] ?? null,
			});
		}),
	};
}

export function decodeFolderCalendars(value: unknown) {
	if (!Array.isArray(value)) throw new Error('Invalid folder calendars.');
	return value.map((calendar) => defineCalendarInputSchema.parse(calendar));
}
