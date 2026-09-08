import {
	isAudioLicenseKind,
	isNativeAudioMimeType,
	type AudioLicense,
	type AudioLicenseKind,
} from '@dndtools/core';
import { importAudioFile, type AudioImportRuntime } from './audio-import';

/**
 * RC-AUD-1.3 — the bundled STARTER PACK and its INSTALL-ON-DEMAND path.
 *
 * The pack is a folder of CC0 ambience loops plus a `manifest.json` (see `NOTICE.md` and
 * `apps/gm-react/scripts/generate-starter-audio.mjs`). It is NOT pre-loaded into anyone's library:
 * a fresh vault stays empty until the DM asks for it, and then each track goes through the SAME
 * `importAudioFile` sequence a hand-picked file does — content-hashed, byte-store first, core
 * dispatch second. So a starter track is an ordinary audio asset afterwards: playable, deletable,
 * dedupable, and subject to the same AUDIO-004 licence gate.
 *
 * One code path serves both targets. Desktop BUNDLES the folder (Electron loads the app with
 * `base: './'`, so the relative URL resolves inside the asar) and web FETCHES it from the hosting
 * origin at the same relative path. Nothing here reaches a third-party origin.
 *
 * Fail closed, in this order, so a tampered or half-written pack installs nothing rather than
 * something unlabelled:
 *
 *   1. The manifest must parse and declare `schemaVersion: 1`.
 *   2. Every track needs a plain file name (no path separators, no `..`), a MIME type inside the
 *      core's native allowlist, and a positive `byteLength`.
 *   3. Every track needs a CLEARED licence — `unknown` and `restricted` are refused outright, and
 *      `cc-by` without attribution text is refused too. The installer never invents a licence, and
 *      it never installs a track it would then have to flag for review.
 *   4. Fetched bytes must match the manifest's `byteLength`, and its `sha256` when this platform
 *      exposes a digest. A mismatch fails THAT track with a readable reason; the rest still install.
 */

/** Where the pack lives, relative to the app's document base. Same string on desktop and web. */
export const STARTER_PACK_DIR = 'audio/starter/';
export const STARTER_PACK_MANIFEST_FILE = 'manifest.json';
export const STARTER_PACK_SCHEMA_VERSION = 1;

/** Licence kinds a bundled track may declare. `unknown`/`restricted` can never ship in the pack. */
const CLEARED_LICENSE_KINDS: readonly AudioLicenseKind[] = Object.freeze([
	'cc0',
	'cc-by',
	'owned',
	'royalty-free',
	'licensed',
]);

/** One track as declared by the manifest. The manifest is the licence record; nothing is inferred. */
export interface StarterPackTrack {
	id: string;
	/** Plain file name inside {@link STARTER_PACK_DIR}. Never a path. */
	file: string;
	title: string;
	mimeType: string;
	byteLength: number;
	/** Lowercase hex SHA-256 of the file, verified at install when a digest is available. */
	sha256: string;
	durationSeconds: number;
	tags: string[];
	license: AudioLicense;
}

export interface StarterPackManifest {
	schemaVersion: number;
	name: string;
	description: string;
	tracks: StarterPackTrack[];
}

export type StarterPackParse =
	| { ok: true; manifest: StarterPackManifest }
	| { ok: false; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseLicense(raw: unknown, where: string): AudioLicense | string {
	const record = asRecord(raw);
	if (!record) return `${where} has no license block.`;
	const kind = record.kind;
	if (!isAudioLicenseKind(kind)) return `${where} declares an unrecognised license kind.`;
	if (!CLEARED_LICENSE_KINDS.includes(kind)) {
		return `${where} declares “${kind}”, which is not cleared to ship — the starter pack only carries cleared licenses.`;
	}
	const licenseNote = typeof record.licenseNote === 'string' ? record.licenseNote : '';
	const attribution = typeof record.attribution === 'string' ? record.attribution : '';
	if (kind === 'cc-by' && attribution.trim().length === 0) {
		return `${where} is CC BY but carries no attribution text.`;
	}
	return { kind, licenseNote, attribution };
}

/** True when `file` is a plain file name that cannot escape the pack folder. */
function isPlainFileName(file: string): boolean {
	return !file.includes('/') && !file.includes('\\') && file !== '.' && file !== '..';
}

/**
 * Validate a parsed manifest, fail closed. Pure — the licence-manifest test runs it against the
 * real file on disk, so a track committed with a bad or missing licence fails the build, not a user.
 */
export function parseStarterPackManifest(raw: unknown): StarterPackParse {
	const record = asRecord(raw);
	if (!record) return { ok: false, message: 'The starter pack manifest is not an object.' };
	if (record.schemaVersion !== STARTER_PACK_SCHEMA_VERSION) {
		return {
			ok: false,
			message: `The starter pack manifest declares schema version ${String(record.schemaVersion)}; this app reads version ${STARTER_PACK_SCHEMA_VERSION}.`,
		};
	}
	const name = nonEmptyString(record.name);
	if (!name) return { ok: false, message: 'The starter pack manifest has no name.' };
	if (!Array.isArray(record.tracks) || record.tracks.length === 0) {
		return { ok: false, message: 'The starter pack manifest lists no tracks.' };
	}

	const tracks: StarterPackTrack[] = [];
	const seen = new Set<string>();
	for (const [index, entry] of record.tracks.entries()) {
		const track = asRecord(entry);
		const where = `Starter pack track ${index + 1}`;
		if (!track) return { ok: false, message: `${where} is not an object.` };
		const id = nonEmptyString(track.id);
		const file = nonEmptyString(track.file);
		const title = nonEmptyString(track.title);
		const mimeType = nonEmptyString(track.mimeType);
		if (!id) return { ok: false, message: `${where} has no id.` };
		if (!file || !isPlainFileName(file)) {
			return { ok: false, message: `${where} has no plain file name.` };
		}
		if (!title) return { ok: false, message: `${where} has no title.` };
		if (!mimeType || !isNativeAudioMimeType(mimeType)) {
			return { ok: false, message: `${where} declares an unsupported audio type.` };
		}
		if (seen.has(id) || seen.has(file)) {
			return { ok: false, message: `${where} repeats an id or file name.` };
		}
		seen.add(id);
		seen.add(file);
		if (
			typeof track.byteLength !== 'number' ||
			!Number.isInteger(track.byteLength) ||
			track.byteLength <= 0
		) {
			return { ok: false, message: `${where} has no byte length.` };
		}
		const sha256 = typeof track.sha256 === 'string' ? track.sha256.toLowerCase() : '';
		if (!/^[0-9a-f]{64}$/.test(sha256)) {
			return { ok: false, message: `${where} has no SHA-256 checksum.` };
		}
		const license = parseLicense(track.license, where);
		if (typeof license === 'string') return { ok: false, message: license };
		const duration = typeof track.durationSeconds === 'number' ? track.durationSeconds : 0;
		const tags = Array.isArray(track.tags)
			? track.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
			: [];
		tracks.push({
			id,
			file,
			title,
			mimeType,
			byteLength: track.byteLength,
			sha256,
			durationSeconds: duration > 0 ? duration : 0,
			tags,
			license,
		});
	}

	return {
		ok: true,
		manifest: {
			schemaVersion: STARTER_PACK_SCHEMA_VERSION,
			name,
			description: typeof record.description === 'string' ? record.description : '',
			tracks,
		},
	};
}

/** The document base the pack is resolved against. `./` under Electron, the deploy path on web. */
function documentBase(): string {
	const base = typeof document !== 'undefined' ? document.baseURI : '';
	return base || 'http://localhost/';
}

/** Absolute URL of one pack file. Exported so tests and the e2e spec address the same bytes. */
export function starterPackUrl(file: string): string {
	return new URL(`${STARTER_PACK_DIR}${file}`, documentBase()).toString();
}

type FetchLike = (url: string) => Promise<{
	ok: boolean;
	status: number;
	arrayBuffer(): Promise<ArrayBuffer>;
	text(): Promise<string>;
}>;

const defaultFetch: FetchLike = (url) => fetch(url);

/**
 * Load + validate the shipped manifest. Returns the same fail-closed message shape the parser does,
 * so a missing folder (web build without the pack) reads as an honest "not available here" instead
 * of a crash or an empty success.
 */
export async function loadStarterPackManifest(
	fetchImpl: FetchLike = defaultFetch,
): Promise<StarterPackParse> {
	let text: string;
	try {
		const response = await fetchImpl(starterPackUrl(STARTER_PACK_MANIFEST_FILE));
		if (!response.ok) {
			return {
				ok: false,
				message: `The starter pack is not available here (the manifest returned ${response.status}).`,
			};
		}
		text = await response.text();
	} catch (error) {
		return {
			ok: false,
			message: `The starter pack could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	try {
		return parseStarterPackManifest(JSON.parse(text));
	} catch {
		return { ok: false, message: 'The starter pack manifest is not valid JSON.' };
	}
}

/** Lowercase hex SHA-256, or null when this platform exposes no digest (then the check is skipped). */
async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) return null;
	try {
		const digest = await subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	} catch {
		return null;
	}
}

export type StarterTrackOutcome =
	| { ok: true; trackId: string; title: string; assetId: string; deduped: boolean }
	| { ok: false; trackId: string; title: string; message: string };

/**
 * Install one manifest track: fetch its bytes, verify them against the manifest, then hand them to
 * the ordinary import flow with the manifest's licence and tags attached — so the asset lands
 * already cleared and never trips the licence-review warning.
 */
export async function installStarterTrack(
	runtime: AudioImportRuntime,
	actorId: string,
	track: StarterPackTrack,
	fetchImpl: FetchLike = defaultFetch,
): Promise<StarterTrackOutcome> {
	const fail = (message: string): StarterTrackOutcome => ({
		ok: false,
		trackId: track.id,
		title: track.title,
		message,
	});
	let bytes: Uint8Array;
	try {
		const response = await fetchImpl(starterPackUrl(track.file));
		if (!response.ok)
			return fail(`“${track.title}” is missing from the starter pack (${response.status}).`);
		bytes = new Uint8Array(await response.arrayBuffer());
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
	if (bytes.byteLength !== track.byteLength) {
		return fail(`“${track.title}” does not match the starter pack manifest and was not installed.`);
	}
	const digest = await sha256Hex(bytes);
	if (digest !== null && digest !== track.sha256) {
		return fail(`“${track.title}” failed its checksum and was not installed.`);
	}

	const outcome = await importAudioFile(runtime, actorId, {
		name: track.file,
		mime: track.mimeType,
		bytes,
		title: track.title,
		license: track.license,
		tags: track.tags,
	});
	if (!outcome.ok) return fail(outcome.message);
	return {
		ok: true,
		trackId: track.id,
		title: outcome.title,
		assetId: outcome.assetId,
		deduped: outcome.deduped,
	};
}

export interface StarterPackReport {
	/** Tracks newly added to the library. */
	installed: StarterTrackOutcome[];
	/** Tracks whose identical bytes were already in the library (content-addressed dedupe). */
	alreadyPresent: StarterTrackOutcome[];
	failed: StarterTrackOutcome[];
}

/**
 * Install the whole pack, one track at a time, and report each track's real outcome. Sequential on
 * purpose: the byte store enforces a quota, and a partial install that says which track ran out of
 * room is more useful than a parallel one that says "some failed".
 */
export async function installStarterPack(
	runtime: AudioImportRuntime,
	actorId: string,
	manifest: StarterPackManifest,
	fetchImpl: FetchLike = defaultFetch,
): Promise<StarterPackReport> {
	const report: StarterPackReport = { installed: [], alreadyPresent: [], failed: [] };
	for (const track of manifest.tracks) {
		const outcome = await installStarterTrack(runtime, actorId, track, fetchImpl);
		if (!outcome.ok) report.failed.push(outcome);
		else if (outcome.deduped) report.alreadyPresent.push(outcome);
		else report.installed.push(outcome);
	}
	return report;
}
