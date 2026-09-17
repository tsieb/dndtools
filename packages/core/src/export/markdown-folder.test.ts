import { describe, expect, it } from 'vitest';
import { buildContentItem } from '../state/content';
import { DM_ACTOR } from '../testing/fixtures';
import {
	encodeFolderNote,
	decodeFolderNote,
	decodeFolderRules,
	folderNotePath,
	mapFolderImages,
	resolveFolderImageRef,
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

describe('front matter spelling never changes what a note means', () => {
	const protectedNote = () => {
		const note = makeNote('# Public\nHello.\n\n# Hidden\nDM secret.');
		note.visibility = 'player-visible';
		note.sectionVisibility = { hidden: { level: 'dm-only' } };
		note.fieldVisibility = { 'fields.gmNotes': { level: 'dm-only' } };
		note.fieldSections = { 'fields.gmNotes': 'hidden' };
		return note;
	};
	/** Respell the front matter the way another editor would, without changing its meaning. */
	const respell = (text: string, replace: (line: string) => string) => {
		const fence = /^---\n([\s\S]*?)\n---\n?/.exec(text)!;
		return `---\n${fence[1]!.split('\n').map(replace).join('\n')}\n---\n${text.slice(fence[0].length)}`;
	};
	it.each([
		[
			'unquoted plain scalars',
			(line: string) =>
				/^(dndtools\.(format|visibility|createdAt|updatedAt)): "(.*)"$/.test(line)
					? line.replace(/: "(.*)"$/, ': $1')
					: line,
		],
		[
			'single-quoted JSON payloads',
			(line: string) =>
				line.startsWith('dndtools.sectionVisibility: ') ||
				line.startsWith('dndtools.fieldVisibility: ')
					? `${line.slice(0, line.indexOf(': '))}: '${JSON.parse(line.slice(line.indexOf(': ') + 2)) as string}'`
					: line,
		],
		[
			'flow payloads spelled as bare YAML nodes',
			(line: string) =>
				line.startsWith('dndtools.fieldSections: ') ||
				line.startsWith('dndtools.sectionVisibility: ')
					? `${line.slice(0, line.indexOf(': '))}: ${JSON.parse(line.slice(line.indexOf(': ') + 2)) as string}`
					: line,
		],
	])('decodes %s to the same privacy rules', (_label, replace) => {
		const note = protectedNote();
		const original = encodeFolderNote(note);
		const reformatted = respell(original, replace);
		expect(reformatted).not.toBe(original);
		expect(decodeFolderRules(reformatted)).toEqual(decodeFolderRules(original));
		expect(decodeFolderRules(reformatted).sections).toHaveLength(1);
		expect(decodeFolderNote(reformatted, 'Note.md').body).toBe(
			decodeFolderNote(original, 'Note.md').body,
		);
	});
	it('refuses a file whose Lamplight metadata cannot be read rather than publishing its prose', () => {
		const original = encodeFolderNote(protectedNote());
		for (const damaged of [
			original.replace(/^dndtools\.format: .*$/m, 'dndtools.format: some-other-tool'),
			original.replace(/^dndtools\.format: .*$/m, 'dndtools.format:'),
			original.replace(
				/^dndtools\.sectionVisibility: .*$/m,
				'dndtools.sectionVisibility:\n  hidden:\n    level: dm-only',
			),
		]) {
			expect(() => decodeFolderRules(damaged)).toThrow(/Nothing imported|visibility metadata/);
		}
	});
	it('still reads an ordinary vault note that only carries dndtools.visibility', () => {
		expect(
			decodeFolderNote('---\ndndtools.visibility: player-visible\n---\nHi\n', 'Note.md'),
		).toMatchObject({ visibility: 'player-visible' });
	});
	it('reads block-list tags the way an Obsidian editor writes them', () => {
		expect(
			decodeFolderNote('---\ntags:\n  - one\n  - "two"\n---\nbody', 'Note.md').fields.tags,
		).toEqual(['one', 'two']);
	});
});

describe('relative image references', () => {
	it.each([
		['Lore/Note.md', 'assets/map.png', 'Lore/assets/map.png'],
		['Lore/Note.md', './assets/map.png', 'Lore/assets/map.png'],
		['Lore/Deep/Note.md', '../assets/map.png', 'Lore/assets/map.png'],
		['Note.md', 'my%20map.png', 'my map.png'],
		['Note.md', 'map.png#anchor', 'map.png'],
	])('resolves %s + %s against the note folder', (notePath, ref, expected) => {
		expect(resolveFolderImageRef(notePath, ref)).toBe(expected);
	});
	it.each([
		['Note.md', 'asset:asset-123'],
		['Note.md', 'https://example.com/a.png'],
		['Note.md', 'data:image/png;base64,AAAA'],
		['Note.md', '/etc/passwd'],
		['Lore/Note.md', '../../../etc/passwd'],
		['Note.md', '%E0%A4%A'],
	])('refuses %s + %s', (notePath, ref) => {
		expect(resolveFolderImageRef(notePath, ref)).toBeNull();
	});
});
