import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	EMPTY_AUDIO_STATE,
	type AudioAsset,
	type AudioState,
	type CommandResult,
	type CoreCommand,
} from '@dndtools/core';
import type { AudioImportRuntime } from './audio-import';
import {
	installStarterPack,
	installStarterTrack,
	parseStarterPackManifest,
	starterPackUrl,
	STARTER_PACK_DIR,
	type StarterPackManifest,
} from './audio-starter-pack';

/**
 * RC-AUD-1.3 — the LICENSE MANIFEST test (the story's first acceptance criterion) plus the
 * install-on-demand path.
 *
 * The manifest test reads the REAL files under `public/audio/starter/`, not a fixture: a track
 * committed without a manifest entry, with a licence that is not cleared, or with bytes that no
 * longer match its recorded checksum fails here — the pack's licence claim in `NOTICE.md` is a
 * tested claim rather than a comment.
 */

const PACK_DIR = new URL('../../public/audio/starter/', import.meta.url).pathname;

function readManifest(): StarterPackManifest {
	const raw: unknown = JSON.parse(readFileSync(join(PACK_DIR, 'manifest.json'), 'utf8'));
	const parsed = parseStarterPackManifest(raw);
	if (!parsed.ok) throw new Error(`the shipped manifest is invalid: ${parsed.message}`);
	return parsed.manifest;
}

describe('RC-AUD-1.3 — the shipped starter pack manifest', () => {
	it('parses, and every shipped track carries a cleared license', () => {
		const manifest = readManifest();
		expect(manifest.tracks.length).toBeGreaterThan(0);
		for (const track of manifest.tracks) {
			expect(track.license.kind).not.toBe('unknown');
			expect(track.license.kind).not.toBe('restricted');
			expect(track.license.licenseNote.trim().length).toBeGreaterThan(0);
			if (track.license.kind === 'cc-by') {
				expect(track.license.attribution.trim().length).toBeGreaterThan(0);
			}
		}
	});

	it('matches the bytes on disk: every entry exists at its declared size and checksum', () => {
		for (const track of readManifest().tracks) {
			const bytes = readFileSync(join(PACK_DIR, track.file));
			expect(bytes.byteLength).toBe(track.byteLength);
			expect(createHash('sha256').update(bytes).digest('hex')).toBe(track.sha256);
		}
	});

	it('lists every audio file in the folder — an unlisted, unlicensed track cannot ship', () => {
		const listed = new Set(readManifest().tracks.map((track) => track.file));
		const onDisk = readdirSync(PACK_DIR).filter((name) => name !== 'manifest.json');
		expect([...onDisk].sort()).toEqual([...listed].sort());
	});

	it('is named in NOTICE.md, so the licence is documented where a reader looks for it', () => {
		const notice = readFileSync(new URL('../../../../NOTICE.md', import.meta.url).pathname, 'utf8');
		for (const track of readManifest().tracks) expect(notice).toContain(track.file);
	});
});

describe('RC-AUD-1.3 — parseStarterPackManifest fails closed', () => {
	const base = () => JSON.parse(JSON.stringify(readManifest())) as Record<string, unknown>;

	it('refuses an unreadable shape or an unknown schema version', () => {
		expect(parseStarterPackManifest(null).ok).toBe(false);
		expect(parseStarterPackManifest({ ...base(), schemaVersion: 2 }).ok).toBe(false);
	});

	it('refuses a track whose license is undeclared or restricted', () => {
		for (const kind of ['unknown', 'restricted']) {
			const manifest = base();
			const tracks = manifest.tracks as Record<string, unknown>[];
			tracks[0] = { ...tracks[0], license: { kind, licenseNote: '', attribution: '' } };
			const parsed = parseStarterPackManifest(manifest);
			expect(parsed.ok).toBe(false);
		}
	});

	it('refuses CC BY with no attribution text', () => {
		const manifest = base();
		const tracks = manifest.tracks as Record<string, unknown>[];
		tracks[0] = { ...tracks[0], license: { kind: 'cc-by', licenseNote: 'n', attribution: '  ' } };
		expect(parseStarterPackManifest(manifest).ok).toBe(false);
	});

	it('refuses a file name that could escape the pack folder, and an unsupported audio type', () => {
		const escaped = base();
		(escaped.tracks as Record<string, unknown>[])[0] = {
			...(escaped.tracks as Record<string, unknown>[])[0],
			file: '../../secret.wav',
		};
		expect(parseStarterPackManifest(escaped).ok).toBe(false);

		const wrongType = base();
		(wrongType.tracks as Record<string, unknown>[])[0] = {
			...(wrongType.tracks as Record<string, unknown>[])[0],
			mimeType: 'application/zip',
		};
		expect(parseStarterPackManifest(wrongType).ok).toBe(false);
	});
});

describe('RC-AUD-1.3 — starterPackUrl', () => {
	it('resolves inside the pack folder relative to the document base', () => {
		expect(starterPackUrl('a.wav').endsWith(`${STARTER_PACK_DIR}a.wav`)).toBe(true);
	});
});

/** A minimal fake SceneRuntime that records the import payloads and models content-addressed dedupe. */
function fakeRuntime(): { runtime: AudioImportRuntime; imports: Record<string, unknown>[] } {
	let audio: AudioState = EMPTY_AUDIO_STATE;
	const imports: Record<string, unknown>[] = [];
	const runtime: AudioImportRuntime = {
		get state() {
			return { audio };
		},
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			if (command.type === 'audio.configure-source') {
				return {
					status: 'accepted',
					nextState: {} as never,
					events: [{ kind: 'audio.source-configured', sourceId: 'src-1' } as never],
					operationIds: [],
				};
			}
			if (command.type === 'audio.import-asset') {
				const payload = command.payload as Record<string, unknown>;
				imports.push(payload);
				const bytes = payload.bytes as number[];
				const assetId = `asset-${bytes.length}-${bytes[44] ?? 0}`;
				const deduped = audio.assets[assetId] !== undefined;
				const asset = {
					id: assetId,
					mimeType: payload.mimeType as string,
					fileName: payload.fileName as string,
					title: (payload.title as string) ?? '',
					byteLength: bytes.length,
					checksum: 'chk',
					license: payload.license ?? { kind: 'unknown', licenseNote: '', attribution: '' },
					tags: (payload.tags as string[]) ?? [],
					durationSeconds: null,
					waveform: [],
					source: { sourceId: payload.sourceId as string, importedAt: 't', importedBy: 'dm-1' },
					schemaVersion: 1,
				} as AudioAsset;
				audio = { ...audio, assets: { ...audio.assets, [assetId]: asset } };
				return {
					status: 'accepted',
					nextState: {} as never,
					events: [
						{ kind: 'audio.asset-imported', assetId, deduped, needsLicenseReview: false } as never,
					],
					operationIds: [],
				};
			}
			if (command.type === 'audio.update-asset-metadata') {
				return { status: 'accepted', nextState: {} as never, events: [], operationIds: [] };
			}
			throw new Error(`fakeRuntime does not model ${command.type}`);
		},
	};
	return { runtime, imports };
}

/** Serve the real pack off disk, so the install path is exercised against the shipped bytes. */
function diskFetch(overrides: Record<string, Uint8Array> = {}) {
	return async (url: string) => {
		const file = url.slice(url.lastIndexOf('/') + 1);
		const override = overrides[file];
		const bytes = override ?? new Uint8Array(readFileSync(join(PACK_DIR, file)));
		return {
			ok: true,
			status: 200,
			arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
			text: async () => new TextDecoder().decode(bytes),
		};
	};
}

describe('RC-AUD-1.3 — install on demand', () => {
	it('installs every shipped track with its manifest license and tags attached', async () => {
		const manifest = readManifest();
		const { runtime, imports } = fakeRuntime();
		const report = await installStarterPack(runtime, 'dm-1', manifest, diskFetch());
		expect(report.failed).toEqual([]);
		expect(report.installed).toHaveLength(manifest.tracks.length);
		expect(imports).toHaveLength(manifest.tracks.length);
		for (const [index, payload] of imports.entries()) {
			expect(payload.license).toEqual(manifest.tracks[index]!.license);
			expect(payload.tags).toEqual(manifest.tracks[index]!.tags);
			expect(payload.title).toBe(manifest.tracks[index]!.title);
		}
	});

	it('reports a second install as already present rather than duplicating the library', async () => {
		const manifest = readManifest();
		const { runtime } = fakeRuntime();
		await installStarterPack(runtime, 'dm-1', manifest, diskFetch());
		const again = await installStarterPack(runtime, 'dm-1', manifest, diskFetch());
		expect(again.installed).toEqual([]);
		expect(again.alreadyPresent).toHaveLength(manifest.tracks.length);
		expect(again.failed).toEqual([]);
	});

	it('refuses bytes that do not match the manifest, and installs nothing for that track', async () => {
		const manifest = readManifest();
		const track = manifest.tracks[0]!;
		const { runtime, imports } = fakeRuntime();
		const outcome = await installStarterTrack(
			runtime,
			'dm-1',
			track,
			diskFetch({ [track.file]: new Uint8Array(track.byteLength) }),
		);
		expect(outcome.ok).toBe(false);
		expect(imports).toEqual([]);
	});

	it('fails that track honestly when the file is missing, without throwing', async () => {
		const manifest = readManifest();
		const missing = async () => ({
			ok: false,
			status: 404,
			arrayBuffer: async () => new ArrayBuffer(0),
			text: async () => '',
		});
		const report = await installStarterPack(runtime404(), 'dm-1', manifest, missing);
		expect(report.installed).toEqual([]);
		expect(report.failed).toHaveLength(manifest.tracks.length);
		expect(report.failed[0]!.ok).toBe(false);
	});
});

function runtime404(): AudioImportRuntime {
	return fakeRuntime().runtime;
}
