import { describe, expect, it } from 'vitest';
import { buildContentItem } from '../state/content';
import { DM_ACTOR } from '../testing/fixtures';
import {
	encodeFolderNote,
	decodeFolderNote,
	folderNotePath,
	mapFolderImages,
} from './markdown-folder';
import { encodeFolderZip, decodeFolderZip } from './folder-zip';

const makeNote = (body: string) =>
	buildContentItem(
		{
			kind: 'note',
			title: 'A: "quoted" title',
			body,
			fields: { tags: ['one,two', 'quoted "tag"'], aliases: ['Other name'] },
			visibility: 'dm-only',
		},
		{ id: 'note-1', authorActorId: DM_ACTOR.id, now: '2026-09-12T01:02:03Z' },
	);

describe('markdown folder codec', () => {
	it.each([
		'',
		'no final newline',
		'\n\n[[link]] and ![[embed]]  \n\n',
		'\r\n雪\r\nline  \r\n',
		'---\na body fence\n---\n',
	])('preserves exact body bytes: %j', (body) => {
		const note = makeNote(body);
		const decoded = decodeFolderNote(encodeFolderNote(note), 'Note.md');
		expect(new TextEncoder().encode(decoded.body)).toEqual(new TextEncoder().encode(body));
		expect(decoded.title).toBe(note.title);
		expect(decoded.fields.tags).toEqual(note.fields.tags);
		expect(decoded.visibility).toBe('dm-only');
		expect(decoded.fields['dndtools.createdAt']).toBe(note.createdAt);
	});
	it('makes image paths portable and restores the original asset reference', () => {
		const body = '\n![Map](asset:asset-123) [[link]] ![[embed]]\n\n';
		const encoded = encodeFolderNote(makeNote(body), { 'asset:asset-123': 'assets/asset-123.png' });
		expect(encoded).toContain('![Map](assets/asset-123.png)');
		expect(decodeFolderNote(encoded, 'Map.md').body).toBe(body);
	});
	it('reads ordinary Obsidian files without trimming their bodies', () => {
		expect(
			decodeFolderNote('---\ntitle: Hello\ntags: [one, two]\n---\n\n[[link]]  \n', 'Note.md'),
		).toMatchObject({
			title: 'Hello',
			body: '\n[[link]]  \n',
			fields: { tags: ['one', 'two'] },
			visibility: 'dm-only',
		});
	});
	it('keeps source paths and disambiguates case-insensitive filename collisions', () => {
		const used = new Set<string>();
		const note = makeNote('');
		note.fields.sourcePath = 'Lore/My Note.md';
		expect(folderNotePath(note, used)).toBe('Lore/My Note.md');
		expect(folderNotePath(note, used)).toBe('Lore/My Note-2.md');
	});
	it('validates ZIP checksums, traversal, duplicate names and truncation', () => {
		const entries = [
			{ path: '雪.md', bytes: new TextEncoder().encode('body\r\n') },
			{ path: 'assets/a.png', bytes: new Uint8Array([0, 255, 2]) },
		];
		const zip = encodeFolderZip(entries);
		expect(encodeFolderZip(entries)).toEqual(zip);
		expect(decodeFolderZip(zip)).toEqual([...entries].sort((a, b) => a.path.localeCompare(b.path)));
		const corrupt = zip.slice();
		corrupt[45] = corrupt[45]! ^ 1;
		expect(() => decodeFolderZip(corrupt)).toThrow();
		expect(() => decodeFolderZip(zip.subarray(0, zip.length - 1))).toThrow();
		expect(() => encodeFolderZip([{ path: '../bad', bytes: new Uint8Array() }])).toThrow();
		expect(() =>
			encodeFolderZip([
				{ path: 'a.md', bytes: new Uint8Array() },
				{ path: 'A.md', bytes: new Uint8Array() },
			]),
		).toThrow();
	});
});

it('does not collect image-like examples in inline code or fenced code', () => {
	const body =
		'`![Example](asset:missing)`\n```md\n![Example](asset:missing)\n```\n[[link]] ![[embed]]';
	const seen: string[] = [];
	const mapped = mapFolderImages(body, (ref) => {
		seen.push(ref);
		return 'changed';
	});
	expect(mapped).toBe(body);
	expect(seen).toEqual([]);
});
