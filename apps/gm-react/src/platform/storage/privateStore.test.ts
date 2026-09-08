import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { buildPlayerData } from '../../net/viewModels';
import {
	addPrivateNote,
	closePrivateStores,
	listPrivateBookmarks,
	listPrivateImpressions,
	listPrivateNotes,
	markImpressionShared,
	privateDatabaseName,
	putPrivateBookmark,
	putPrivateImpression,
	removePrivateBookmark,
	removePrivateImpression,
	removePrivateNote,
	resetPrivateStore,
	updatePrivateNote,
} from './privateStore';
import { loadCoreState, persistFullState, __testing } from './coreStore';

const CHARACTER = 'char-thorne';
const OTHER_CHARACTER = 'char-mira';

beforeEach(() => {
	// A fresh IndexedDB universe per test. Dexie captures its indexedDB reference in
	// Dexie.dependencies at import time, so the override must go there too (see assetStore.test.ts).
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
	closePrivateStores();
	await __testing.closeDb();
});

describe('private store: notes', () => {
	it('round-trips a private note and lists the newest edit first', async () => {
		const first = await addPrivateNote(CHARACTER, {
			title: '  The steward lied  ',
			body: 'He knew the seal was broken before we arrived.',
		});
		expect(first.title).toBe('The steward lied');
		const second = await addPrivateNote(CHARACTER, { title: 'Owed favours', body: 'Two.' });

		const notes = await listPrivateNotes(CHARACTER);
		expect(notes.map((n) => n.id)).toEqual([second.id, first.id]);
		expect(notes[1].body).toBe('He knew the seal was broken before we arrived.');
	});

	it('updates a note and reports an honest miss for one that is gone', async () => {
		const note = await addPrivateNote(CHARACTER, { title: 'Draft', body: 'first pass' });
		const updated = await updatePrivateNote(CHARACTER, note.id, { body: 'second pass' });
		expect(updated?.body).toBe('second pass');
		expect(updated?.title).toBe('Draft');

		await removePrivateNote(CHARACTER, note.id);
		expect(await listPrivateNotes(CHARACTER)).toEqual([]);
		expect(await updatePrivateNote(CHARACTER, note.id, { body: 'third' })).toBeNull();
	});

	it('fails closed rather than opening one shared database when the character id is missing', async () => {
		await expect(addPrivateNote('', { title: 'x', body: 'y' })).rejects.toThrow(
			/Private notes need a character/,
		);
		await expect(addPrivateNote('   ', { title: 'x', body: 'y' })).rejects.toThrow(
			/Private notes need a character/,
		);
	});
});

describe('private store: bookmarks', () => {
	it('keeps one bookmark per shared target and rewrites its annotation', async () => {
		const first = await putPrivateBookmark(CHARACTER, {
			targetKind: 'handout',
			targetId: 'content-map-fragment',
			targetTitle: 'Torn map fragment',
			annotation: 'The river bends the wrong way.',
		});
		const second = await putPrivateBookmark(CHARACTER, {
			targetKind: 'handout',
			targetId: 'content-map-fragment',
			targetTitle: 'Torn map fragment',
			annotation: 'The river bends the wrong way — or the map is older than the town.',
		});

		expect(second.id).toBe(first.id);
		expect(second.createdAt).toBe(first.createdAt);
		const bookmarks = await listPrivateBookmarks(CHARACTER);
		expect(bookmarks).toHaveLength(1);
		expect(bookmarks[0].annotation).toContain('older than the town');

		await removePrivateBookmark(CHARACTER, first.id);
		expect(await listPrivateBookmarks(CHARACTER)).toEqual([]);
	});

	it('separates bookmarks on the same id across target kinds', async () => {
		await putPrivateBookmark(CHARACTER, {
			targetKind: 'handout',
			targetId: 'shared-1',
			targetTitle: 'A handout',
			annotation: 'a',
		});
		await putPrivateBookmark(CHARACTER, {
			targetKind: 'journal-entry',
			targetId: 'shared-1',
			targetTitle: 'A journal entry',
			annotation: 'b',
		});
		expect(await listPrivateBookmarks(CHARACTER)).toHaveLength(2);
	});
});

describe('private store: NPC impressions', () => {
	it('links an impression to the shared note the NPC was met in', async () => {
		const impression = await putPrivateImpression(CHARACTER, {
			npcNoteId: 'content-npc-harrow',
			npcName: 'Warden Harrow',
			body: 'Counts the coins twice. Watch the left hand.',
		});
		expect(impression.npcNoteId).toBe('content-npc-harrow');
		expect(impression.sharedAt).toBeNull();

		const listed = await listPrivateImpressions(CHARACTER);
		expect(listed).toHaveLength(1);
		expect(listed[0].npcName).toBe('Warden Harrow');
	});

	it('stamps sharedAt only after the table accepted the request, and clears it on a rewrite', async () => {
		const impression = await putPrivateImpression(CHARACTER, {
			npcNoteId: null,
			npcName: 'The ferryman',
			body: 'Would not take silver.',
		});
		const shared = await markImpressionShared(CHARACTER, impression.id);
		expect(shared?.sharedAt).not.toBeNull();

		// Re-saving the SAME text keeps the stamp: the DM holds exactly this text.
		const unchanged = await putPrivateImpression(CHARACTER, {
			id: impression.id,
			npcNoteId: null,
			npcName: 'The ferryman',
			body: 'Would not take silver.',
		});
		expect(unchanged.sharedAt).toBe(shared?.sharedAt);

		// Rewriting the body clears it — the DM has not seen the new words.
		const rewritten = await putPrivateImpression(CHARACTER, {
			id: impression.id,
			npcNoteId: null,
			npcName: 'The ferryman',
			body: 'Would not take silver. Took the ring without looking at it.',
		});
		expect(rewritten.sharedAt).toBeNull();

		await removePrivateImpression(CHARACTER, impression.id);
		expect(await listPrivateImpressions(CHARACTER)).toEqual([]);
	});

	it('reports an honest miss when stamping an impression that is gone', async () => {
		expect(await markImpressionShared(CHARACTER, 'impression-nope')).toBeNull();
	});
});

describe('private store: isolation', () => {
	it('gives each character its own database, so a second seat on the device sees nothing', async () => {
		await addPrivateNote(CHARACTER, { title: 'Mine', body: 'for my eyes' });
		expect(await listPrivateNotes(OTHER_CHARACTER)).toEqual([]);
		expect(privateDatabaseName(CHARACTER)).toBe(`dndtools-private-${CHARACTER}`);
		expect(privateDatabaseName(CHARACTER)).not.toBe(privateDatabaseName(OTHER_CHARACTER));
	});

	it('erases the whole database on reset, not just its rows', async () => {
		await addPrivateNote(CHARACTER, { title: 'Forget me', body: 'gone' });
		await resetPrivateStore(CHARACTER);
		expect(await Dexie.exists(privateDatabaseName(CHARACTER))).toBe(false);
		expect(await listPrivateNotes(CHARACTER)).toEqual([]);
	});
});

// --- the LEAK TEST (RC-CHR-4.1 acceptance) -------------------------------------------------------
//
// Private content must never reach the host. Three independent checks, because "we did not write the
// code that leaks it" is not evidence: the store is a different DATABASE from the one the sync and
// backup paths read; the replicated player view-model carries none of the text; and no module on the
// replication or MCP path is even allowed to import the store.

const SECRETS = [
	'the steward is the one who opened the gate',
	'do not trust the warden with the ring',
	'the ferryman took the ring without looking',
];

async function seedPrivateContent(): Promise<void> {
	await addPrivateNote(CHARACTER, { title: 'What I actually think', body: SECRETS[0] });
	await putPrivateBookmark(CHARACTER, {
		targetKind: 'journal-entry',
		targetId: 'entry-1',
		targetTitle: 'The gate',
		annotation: SECRETS[1],
	});
	await putPrivateImpression(CHARACTER, {
		npcNoteId: 'content-npc-ferryman',
		npcName: 'The ferryman',
		body: SECRETS[2],
	});
}

describe('private store: the host never receives private content', () => {
	it('keeps private records out of the persisted core slice that sync and backup read', async () => {
		await seedPrivateContent();

		// The core slice is what `persistFullState` writes, what a cloud backup envelopes, and what
		// every MCP read is derived from. A full round trip through it must carry none of the secrets.
		const slice = await loadCoreState();
		await persistFullState(slice, slice);
		const reloaded = await loadCoreState();
		const serialized = JSON.stringify(reloaded);
		for (const secret of SECRETS) expect(serialized).not.toContain(secret);

		// And the private rows are still there — the isolation is not "we lost the notes".
		expect(await listPrivateNotes(CHARACTER)).toHaveLength(1);
		expect(await listPrivateBookmarks(CHARACTER)).toHaveLength(1);
		expect(await listPrivateImpressions(CHARACTER)).toHaveLength(1);
	});

	it('keeps private records out of the replicated player snapshot', async () => {
		await seedPrivateContent();

		// `buildPlayerData` builds the EXACT payload the host replicates to a joined device, and the
		// same shape the DM's own preview renders. Nothing private may appear in it.
		const slice = await loadCoreState();
		const snapshot = JSON.stringify(buildPlayerData(slice, 'actor-player'));
		for (const secret of SECRETS) expect(snapshot).not.toContain(secret);
	});

	it('is imported by no module on the replication, cloud or MCP path', () => {
		// The structural half of the guarantee: a future edit that wires private records into the
		// snapshot builder, the session host, a cloud backup or an MCP tool fails HERE, rather than
		// shipping a silent leak. Widen the allowlist only with an ADR-035 amendment.
		const appRoot = fileURLToPath(new URL('../..', import.meta.url));
		const allowed = new Set([
			'platform/storage/privateStore.ts',
			'platform/storage/privateStore.test.ts',
			'screens/play/Journal.tsx',
		]);

		const importers: string[] = [];
		const walk = (dir: string): void => {
			for (const entry of readdirSync(dir)) {
				const full = path.join(dir, entry);
				if (statSync(full).isDirectory()) {
					walk(full);
					continue;
				}
				if (!/\.(ts|tsx)$/.test(entry)) continue;
				if (!/privateStore/.test(readFileSync(full, 'utf8'))) continue;
				importers.push(path.relative(appRoot, full).split(path.sep).join('/'));
			}
		};
		walk(appRoot);

		expect(importers.length).toBeGreaterThan(0); // the walk actually found this file
		expect(importers.filter((file) => !allowed.has(file))).toEqual([]);
	});
});
