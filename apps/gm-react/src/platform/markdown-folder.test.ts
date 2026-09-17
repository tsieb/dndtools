import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
	assetId,
	dispatchCommand,
	hashAssetBytes,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { seedDemoContent } from '../runtime/demo-seed';
import { exportMarkdownFolder, importMarkdownFolder } from './backup';
import { decodeFolderZip, encodeFolderZip } from '../../../../packages/core/src/export/folder-zip';
import { putAssetBytes, getAssetBytes } from './storage/assetStore';
import { safeImageSrc } from '../app/markdown/plugins';
import { __testing } from './storage/coreStore';

function runtime(initial?: CoreStateSlice) {
	let state =
		initial ??
		buildInitialState(
			DM_ACTOR,
			...['actor-player', 'actor-player-2', 'actor-player-3'].map((id) => ({
				id,
				role: 'player' as const,
				displayName: id,
			})),
		);
	const env = makeEnvironment();
	return {
		get state() {
			return state;
		},
		defaultActorId: DM_ACTOR.id,
		async dispatch(command: CoreCommand) {
			const result = dispatchCommand(state, env, command);
			state = result.nextState;
			return result;
		},
	};
}
function resetStorage() {
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
}
beforeEach(resetStorage);
afterEach(() => __testing.closeDb());

describe('demo vault markdown round trip', () => {
	it('imports every exported demo note through real core commands with byte-identical bodies', async () => {
		const source = runtime();
		await seedDemoContent(source);
		const originals = Object.values(source.state.content.items).filter(
			(item) => item.kind === 'note' && !item.deletedAt,
		);
		expect(originals.length).toBeGreaterThan(3);
		const entries = decodeFolderZip(encodeFolderZip(await exportMarkdownFolder(source, true)));
		const target = runtime();
		expect(await importMarkdownFolder(target, entries)).toBe(originals.length);
		for (const original of originals) {
			const copy = Object.values(target.state.content.items).find(
				(note) => note.title === original.title,
			)!;
			expect(new TextEncoder().encode(copy.body)).toEqual(new TextEncoder().encode(original.body));
			expect(copy.visibility).toBe(original.visibility);
			expect(copy.fields.tags).toEqual(original.fields.tags);
			expect(copy.dateFields).toEqual(original.dateFields);
		}
	});
	it('exports private notes and their images only after explicit DM opt-in; players cannot opt in', async () => {
		const source = runtime();
		const bytes = new Uint8Array([137, 80, 78, 71, 0, 1, 255]);
		const id = await putAssetBytes(bytes, 'image/png');
		await source.dispatch({
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'note',
				title: 'Hidden',
				body: `\n[[link]] ![[embed]] ![image](asset:${id})  \r\n`,
			},
		});
		const publicEntries = await exportMarkdownFolder(source);
		expect(publicEntries.map((entry) => entry.path)).toEqual(['vault-assets.json']);
		const privateEntries = await exportMarkdownFolder(source, true);
		expect(privateEntries.some((entry) => entry.path.endsWith('.png'))).toBe(true);
		await __testing.closeDb();
		resetStorage();
		const target = runtime();
		await importMarkdownFolder(target, decodeFolderZip(encodeFolderZip(privateEntries)));
		expect(Object.values(target.state.content.items)[0]!.body).toBe(
			Object.values(source.state.content.items)[0]!.body,
		);
		expect(new Uint8Array(await (await getAssetBytes(id))!.arrayBuffer())).toEqual(bytes);
		source.defaultActorId = 'actor-player';
		await expect(exportMarkdownFolder(source, true)).rejects.toThrow('Only the DM');
	});
	it('rejects corrupted images before creating any notes', async () => {
		const target = runtime();
		const entries = [
			{
				path: 'vault-assets.json',
				bytes: new TextEncoder().encode(
					JSON.stringify([{ path: 'assets/x.png', id: 'asset-wrong', mime: 'image/png' }]),
				),
			},
			{ path: 'assets/x.png', bytes: new Uint8Array([1]) },
			{ path: 'Note.md', bytes: new TextEncoder().encode('body') },
		];
		await expect(importMarkdownFolder(target, entries)).rejects.toThrow('does not match');
		expect(Object.keys(target.state.content.items)).toHaveLength(0);
	});
});

it('preserves granular restrictions before publishing an imported note', async () => {
	const source = runtime();
	const created = await source.dispatch({
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'note',
			title: 'Restricted sections',
			body: '# Public\nVisible.\n\n# Hidden\nPrivate lore.',
			fields: { gmNotes: 'Private field' },
			visibility: 'player-visible',
		},
	});
	expect(created.status).toBe('accepted');
	const id = Object.keys(source.state.content.items)[0]!;
	await source.dispatch({
		type: 'content.set-section-visibility',
		actorId: DM_ACTOR.id,
		payload: { itemId: id, sectionId: 'hidden', rule: { level: 'dm-only' } },
	});
	await source.dispatch({
		type: 'content.set-field-visibility',
		actorId: DM_ACTOR.id,
		payload: { itemId: id, fieldKey: 'gmNotes', rule: { level: 'dm-only' }, sectionId: 'hidden' },
	});
	const publicEntries = await exportMarkdownFolder(source);
	const publicText = publicEntries.map((entry) => new TextDecoder().decode(entry.bytes)).join('\n');
	expect(publicText).not.toContain('Private lore');
	expect(publicText).not.toContain('Private field');
	const target = runtime();
	await importMarkdownFolder(target, await exportMarkdownFolder(source, true));
	const copy = Object.values(target.state.content.items)[0]!;
	expect(copy.sectionVisibility).toEqual(source.state.content.items[id]!.sectionVisibility);
	expect(copy.fieldVisibility).toEqual(source.state.content.items[id]!.fieldVisibility);
	expect(copy.fieldSections).toEqual(source.state.content.items[id]!.fieldSections);
	expect(copy.body).toBe(source.state.content.items[id]!.body);
	expect(copy.visibility).toBe('player-visible');
});

it('carries a custom calendar to an empty vault and refuses a conflicting calendar', async () => {
	const source = runtime();
	const calendar = {
		id: 'calendar-test',
		name: 'Table calendar',
		months: [{ id: 'winter', name: 'Winter', days: 50 }],
	};
	await source.dispatch({
		type: 'content.define-calendar',
		actorId: DM_ACTOR.id,
		payload: calendar,
	});
	await source.dispatch({
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'note',
			title: 'Dated note',
			body: 'A winter event.',
			dateFields: { occurred: { calendarId: calendar.id, year: 4, month: 1, day: 40 } },
		},
	});
	const entries = await exportMarkdownFolder(source, true);
	const target = runtime();
	await importMarkdownFolder(target, entries);
	expect(target.state.content.calendars).toEqual(source.state.content.calendars);
	expect(Object.values(target.state.content.items)[0]!.dateFields).toEqual(
		Object.values(source.state.content.items)[0]!.dateFields,
	);
	const conflicting = runtime();
	await conflicting.dispatch({
		type: 'content.define-calendar',
		actorId: DM_ACTOR.id,
		payload: { ...calendar, months: [{ id: 'winter', name: 'Winter', days: 5 }] },
	});
	await expect(importMarkdownFolder(conflicting, entries)).rejects.toThrow('differs');
	expect(Object.keys(conflicting.state.content.items)).toHaveLength(0);
});

it('writes and reads a real nested folder without altering binary or text bytes', async () => {
	const { mkdtemp, readdir, mkdir, readFile, writeFile, rm } = await import('node:fs/promises');
	const { join, basename } = await import('node:path');
	const { tmpdir } = await import('node:os');
	const { saveMarkdownFolder, readMarkdownFolder } = await import('./fsSource');
	const directory = await mkdtemp(join(tmpdir(), 'markdown-round-trip-'));
	const file = (path: string): import('./fsSource').FsFileHandleLike => ({
		kind: 'file',
		name: basename(path),
		getFile: async () => new File([await readFile(path)], basename(path)),
		createWritable: async () => ({
			write: async (data) => {
				await writeFile(path, data);
			},
			close: async () => {},
		}),
	});
	const dir = (path: string): import('./fsSource').FsDirHandleLike => ({
		kind: 'directory',
		name: basename(path),
		async *values() {
			for (const entry of await readdir(path, { withFileTypes: true }))
				yield entry.isDirectory() ? dir(join(path, entry.name)) : file(join(path, entry.name));
		},
		getDirectoryHandle: async (name, options) => {
			const child = join(path, name);
			if (options?.create) await mkdir(child, { recursive: true });
			return dir(child);
		},
		getFileHandle: async (name) => file(join(path, name)),
	});
	try {
		const entries = [
			{ path: 'Lore/Note.md', bytes: new TextEncoder().encode('\n[[link]] ![[embed]]  \r\n') },
			{ path: 'Lore/assets/image.png', bytes: new Uint8Array([0, 1, 255, 128]) },
		];
		expect(await saveMarkdownFolder(entries, dir(directory))).toBe(true);
		const read = await readMarkdownFolder(dir(directory));
		for (const entry of entries)
			expect(read.find((copy) => copy.path === entry.path)?.bytes).toEqual(entry.bytes);
		await expect(saveMarkdownFolder(entries, dir(directory))).rejects.toThrow('empty folder');
		expect(await readFile(join(directory, 'Lore/assets/image.png'))).toEqual(
			Buffer.from(entries[1]!.bytes),
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

describe('interoperability with folders other tools wrote', () => {
	/** A real 1x1 PNG: the importer identifies images by their bytes, not their filename. */
	const png = () =>
		Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XcAAAAASUVORK5CYII=',
			),
			(char) => char.charCodeAt(0),
		);

	it('adopts an image sitting next to an ordinary markdown note', async () => {
		const bytes = png();
		const target = runtime();
		expect(
			await importMarkdownFolder(target, [
				{
					path: 'Lore/Note.md',
					bytes: new TextEncoder().encode('![Map](assets/map.png)\n[[link]] ![[embed]]'),
				},
				{ path: 'Lore/assets/map.png', bytes },
			]),
		).toBe(1);
		const note = Object.values(target.state.content.items)[0]!;
		const id = assetId(hashAssetBytes(bytes));
		// The image survives: stored, addressable, and accepted by the renderer's URL allow-list.
		expect(note.body).toBe(`![Map](asset:${id})\n[[link]] ![[embed]]`);
		expect(new Uint8Array(await (await getAssetBytes(id))!.arrayBuffer())).toEqual(bytes);
		expect(safeImageSrc(`asset:${id}`)).toEqual({ kind: 'asset', assetId: id });
		const reexported = await exportMarkdownFolder(target, true);
		expect(reexported.find((entry) => entry.path.endsWith('.png'))?.bytes).toEqual(bytes);
	});

	it('leaves a reference naming no file in the folder exactly as written', async () => {
		const target = runtime();
		await importMarkdownFolder(target, [
			{
				path: 'Note.md',
				bytes: new TextEncoder().encode(
					'![Remote](https://example.com/a.png) ![Gone](assets/missing.png) ![Text](notes/a.txt)',
				),
			},
			{ path: 'notes/a.txt', bytes: new TextEncoder().encode('not an image') },
		]);
		expect(Object.values(target.state.content.items)[0]!.body).toBe(
			'![Remote](https://example.com/a.png) ![Gone](assets/missing.png) ![Text](notes/a.txt)',
		);
	});

	it('keeps granular privacy rules when another editor reformats the front matter', async () => {
		const source = runtime();
		await source.dispatch({
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'note',
				title: 'Public with hidden section',
				body: '# Public\nHello.\n\n# Hidden\nDM secret.',
				visibility: 'player-visible',
			},
		});
		const id = Object.keys(source.state.content.items)[0]!;
		await source.dispatch({
			type: 'content.set-section-visibility',
			actorId: DM_ACTOR.id,
			payload: { itemId: id, sectionId: 'hidden', rule: { level: 'dm-only' } },
		});
		const exported = await exportMarkdownFolder(source, true);
		// Only the quoting changes — the same YAML, as another editor would save it.
		const reformatted = exported.map((entry) =>
			entry.path.endsWith('.md')
				? {
						...entry,
						bytes: new TextEncoder().encode(
							new TextDecoder()
								.decode(entry.bytes)
								.replace(
									'dndtools.format: "markdown-folder-v1"',
									'dndtools.format: markdown-folder-v1',
								),
						),
					}
				: entry,
		);
		expect(new TextDecoder().decode(reformatted[0]!.bytes)).not.toBe(
			new TextDecoder().decode(exported[0]!.bytes),
		);
		const target = runtime();
		await importMarkdownFolder(target, reformatted);
		const copy = Object.values(target.state.content.items)[0]!;
		expect(copy.sectionVisibility).toEqual(source.state.content.items[id]!.sectionVisibility);
		expect(copy.visibility).toBe('player-visible');
		// The decisive check: the reformatted copy is no more eligible for a public export than the original.
		const publicText = (await exportMarkdownFolder(target))
			.map((entry) => new TextDecoder().decode(entry.bytes))
			.join('\n');
		expect(publicText).not.toContain('DM secret.');
	});

	it('refuses a note whose Lamplight metadata cannot be read instead of importing it as public', async () => {
		const source = runtime();
		await source.dispatch({
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'note',
				title: 'Damaged metadata',
				body: '# Public\nHello.\n\n# Hidden\nDM secret.',
				visibility: 'player-visible',
			},
		});
		const id = Object.keys(source.state.content.items)[0]!;
		await source.dispatch({
			type: 'content.set-section-visibility',
			actorId: DM_ACTOR.id,
			payload: { itemId: id, sectionId: 'hidden', rule: { level: 'dm-only' } },
		});
		const damaged = (await exportMarkdownFolder(source, true)).map((entry) =>
			entry.path.endsWith('.md')
				? {
						...entry,
						bytes: new TextEncoder().encode(
							new TextDecoder()
								.decode(entry.bytes)
								.replace(/dndtools\.format: .*/, 'dndtools.format: some-other-tool'),
						),
					}
				: entry,
		);
		const target = runtime();
		await expect(importMarkdownFolder(target, damaged)).rejects.toThrow('Nothing imported');
		expect(Object.keys(target.state.content.items)).toHaveLength(0);
	});
});
