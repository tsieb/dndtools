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

/**
 * Resolve an ordinary relative image reference (`assets/map.png`, `../img/a.png`) against the note's
 * own folder, returning the folder-relative path it names — or `null` when it is not a file this
 * folder can carry (an `asset:`/`http:` URL, an absolute path, a traversal out of the folder).
 * Ordinary Obsidian vaults address their images this way, so the importer must be able to find them.
 */
export function resolveFolderImageRef(notePath: string, ref: string): string | null {
	const trimmed = ref.trim();
	if (trimmed === '' || trimmed.startsWith('/') || trimmed.startsWith('#')) return null;
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return null; // asset:, http:, data:, …
	let decoded: string;
	try {
		decoded = decodeURIComponent(trimmed.split('#')[0]!.split('?')[0]!);
	} catch {
		return null; // a malformed percent escape names nothing
	}
	const segments = notePath.split('/').slice(0, -1);
	for (const part of decoded.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (segments.length === 0) return null;
			segments.pop();
			continue;
		}
		segments.push(part);
	}
	const resolved = segments.join('/');
	return resolved !== '' && safeFolderPath(resolved) ? resolved : null;
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
	const own = props.own;
	const scalar = (key: string): string | undefined => {
		const value = props.values[key];
		return typeof value === 'string' ? value : undefined;
	};
	const json = (key: string, fallback: unknown): unknown =>
		own ? readFolderJson(props, key, fallback) : fallback;
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
			const value = props.values[key];
			if (Array.isArray(value) && (key in fields || value.length > 0)) {
				(fields as Record<string, unknown>)[key] = value;
			}
		}
	return createContentItemInputSchema.parse({
		kind: 'note',
		title: scalar('title') ?? note.userProperties.title ?? path.replace(/\.(md|markdown)$/i, ''),
		body: mapFolderImages(sanitizeMarkdownContent(note.body), (ref) => reverse.get(ref) ?? ref),
		fields: {
			...(fields as Record<string, unknown>),
			...(own
				? {
						'dndtools.createdAt': scalar('dndtools.createdAt'),
						'dndtools.updatedAt': scalar('dndtools.updatedAt'),
					}
				: {}),
		},
		visibility:
			scalar('dndtools.visibility') ?? note.dndtoolsMetadata['dndtools.visibility'] ?? 'dm-only',
		dateFields: json('dndtools.dateFields', {}),
		timelineRefs: json('dndtools.timelineRefs', []),
		sharedWith: own ? props.values['dndtools.sharedWith'] : [],
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

/** The portable marker every Lamplight markdown-folder export carries in its front matter. */
const FOLDER_FORMAT = 'markdown-folder-v1';

/**
 * The front-matter keys that carry Lamplight's OWN transfer metadata — including every privacy
 * rule. `dndtools.visibility` is deliberately absent: the legacy Obsidian import reads it from
 * ordinary vault files that were never produced by this exporter.
 */
const FOLDER_METADATA_KEYS: ReadonlySet<string> = new Set([
	'dndtools.format',
	'dndtools.createdAt',
	'dndtools.updatedAt',
	'dndtools.fields',
	'dndtools.dateFields',
	'dndtools.timelineRefs',
	'dndtools.sharedWith',
	'dndtools.sectionVisibility',
	'dndtools.fieldVisibility',
	'dndtools.fieldSections',
	'dndtools.assets',
]);

interface FolderProperties {
	/** Decoded values: every equivalent YAML spelling of one scalar decodes to the same value. */
	values: Record<string, unknown>;
	/** The raw text right of `key:`, so a JSON payload respelled as a YAML flow node still reads. */
	raw: Record<string, string>;
	/** The file claims to be a Lamplight export (any `dndtools.*` transfer key is present). */
	claimed: boolean;
	/** The claim was understood: its metadata — privacy rules included — can be trusted. */
	own: boolean;
}

/**
 * Decode one YAML scalar spelling to its value. Quoting is presentation, not meaning: a note whose
 * front matter was reformatted by another editor must decode to exactly the same values, because
 * those values carry the DM's privacy rules.
 */
function decodeYamlScalar(raw: string): string | string[] {
	const trimmed = raw.trim();
	if (trimmed.startsWith('"')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === 'string') return parsed;
		} catch {
			/* Not a spelling we understand; fall through to the literal text. */
		}
		return trimmed;
	}
	if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'"))
		return trimmed.slice(1, -1).replace(/''/g, "'");
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string'))
				return parsed as string[];
		} catch {
			/* A bare YAML flow sequence (`[one, two]`); split it below. */
		}
		const inner = trimmed.slice(1, -1).trim();
		if (inner === '') return [];
		return inner
			.split(',')
			.map((entry) => {
				const value = decodeYamlScalar(entry);
				return Array.isArray(value) ? entry.trim() : value;
			})
			.filter((entry) => entry.length > 0);
	}
	return trimmed;
}

/** Parse the front-matter block: `key: scalar`, flow sequences, and `key:`-then-`- item` lists. */
function parseFolderFrontMatter(text: string): FolderProperties {
	const fence = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	const values: Record<string, unknown> = Object.create(null);
	const raw: Record<string, string> = Object.create(null);
	let claimed = false;
	let listKey: string | null = null;
	let list: string[] = [];
	const flush = (): void => {
		if (listKey !== null) {
			values[listKey] = list;
			raw[listKey] = JSON.stringify(list);
			listKey = null;
			list = [];
		}
	};
	if (fence)
		for (const line of fence[1]!.split(/\r?\n/)) {
			if (line.trim() === '') continue;
			const item = /^\s*-\s+(.*)$/.exec(line);
			if (item && listKey !== null) {
				const value = decodeYamlScalar(item[1]!);
				list.push(Array.isArray(value) ? item[1]!.trim() : value);
				continue;
			}
			const pair = /^([\w.-]+):(?:[ \t]+(.*))?$/.exec(line);
			flush();
			// Anything else (an indented nested mapping, a block scalar) stays unread on purpose:
			// a Lamplight key spelled that way ends up empty and is refused below, never trusted.
			if (!pair) continue;
			const key = pair[1]!;
			if (FOLDER_METADATA_KEYS.has(key)) claimed = true;
			const value = pair[2] ?? '';
			if (value.trim() === '') {
				listKey = key;
				list = [];
				continue;
			}
			values[key] = decodeYamlScalar(value);
			raw[key] = value.trim();
		}
	flush();
	return { values, raw, claimed, own: claimed && values['dndtools.format'] === FOLDER_FORMAT };
}

/**
 * Read the front matter, FAIL-CLOSED. A file that presents Lamplight transfer metadata we cannot
 * interpret is refused outright rather than imported as an ordinary note: dropping the metadata
 * would silently drop the DM-only rules with it and publish the prose they were protecting.
 */
function readFolderProperties(text: string): FolderProperties {
	const props = parseFolderFrontMatter(text);
	if (props.claimed && !props.own)
		throw new Error(
			'This markdown file carries Lamplight metadata that cannot be read. Nothing imported.',
		);
	return props;
}

/** Read one JSON payload property, accepting any YAML spelling that still means the same value. */
function readFolderJson(props: FolderProperties, key: string, fallback: unknown): unknown {
	const decoded = props.values[key];
	if (decoded === undefined) return fallback;
	const spellings = typeof decoded === 'string' ? [decoded, props.raw[key]] : [props.raw[key]];
	for (const spelling of spellings) {
		if (spelling === undefined) continue;
		try {
			return JSON.parse(spelling) as unknown;
		} catch {
			/* Try the next spelling before refusing. */
		}
	}
	throw new Error(`Lamplight note metadata "${key}" could not be read. Nothing imported.`);
}

/** Validate granular rules before any writes; the importer applies them while the note is private. */
export function decodeFolderRules(text: string) {
	const props = readFolderProperties(text);
	const read = (key: string): Record<string, unknown> => {
		const value: unknown = props.own ? readFolderJson(props, key, {}) : {};
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
