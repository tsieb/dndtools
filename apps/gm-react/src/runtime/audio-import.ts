import {
	NATIVE_AUDIO_MIME_TYPES,
	isNativeAudioMimeType,
	type AudioState,
	type CommandResult,
	type CoreCommand,
} from '@dndtools/core';
import { deleteAssetBytes, putAssetBytes } from '../platform/storage/assetStore';

/**
 * audio-import — the LOCAL FILE import flow for the audio library (AUDIO-004), decoupled from React
 * so the whole sequence is unit-testable under Node (`pnpm test:app`, fake-indexeddb).
 *
 * The flow keeps the core's content-addressed invariant intact: the asset-byte store computes the
 * SAME content-hash id the core's `audio.import-asset` handler computes (`assetId(hashAssetBytes)`),
 * so metadata and bytes can never disagree. Sequence, fail closed at every step:
 *
 *   1. Reject a non-native MIME type up front (same closed allowlist the core enforces) — an
 *      unsupported file never touches storage.
 *   2. Write the bytes to the device asset-byte store (`putAssetBytes`) — size/quota limits reject
 *      here with an actionable message before any core dispatch.
 *   3. Resolve the owning SOURCE: a re-import of identical bytes reuses the existing asset's source;
 *      a new file gets its own dedicated `local-file` source (one file ⇔ one source, so the
 *      soundboard, ambience layers, and automation can all address it unambiguously).
 *   4. Dispatch `audio.import-asset` with the bytes — the core validates, content-hashes, and
 *      records the metadata. On rejection the just-written bytes are deleted again (no orphans).
 */

/** The `accept` attribute value for the audio file picker: the core's closed MIME allowlist + extensions. */
export const AUDIO_IMPORT_ACCEPT = [
	...Object.keys(NATIVE_AUDIO_MIME_TYPES),
	'.mp3',
	'.m4a',
	'.aac',
	'.ogg',
	'.oga',
	'.opus',
	'.wav',
	'.webm',
	'.flac',
].join(',');

/** The minimal runtime surface the import flow needs (SceneRuntime satisfies it; tests stub it). */
export interface AudioImportRuntime {
	readonly state: { readonly audio: AudioState };
	dispatch(command: CoreCommand): Promise<CommandResult>;
}

export interface AudioImportFile {
	name: string;
	mime: string;
	bytes: Uint8Array;
}

export type AudioImportOutcome =
	| {
			ok: true;
			assetId: string;
			sourceId: string;
			title: string;
			/** True when identical bytes were already in the library (metadata refreshed, no new record). */
			deduped: boolean;
			/** True when the asset imported with an uncleared license (AUDIO-004 review gate armed). */
			needsLicenseReview: boolean;
	  }
	| { ok: false; message: string };

/** Derive a display title from a file name (extension stripped); falls back to the raw name. Pure. */
export function audioTitleFromFileName(fileName: string): string {
	const stripped = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
	return stripped.length > 0 ? stripped : fileName;
}

function eventField(result: CommandResult, kind: string, field: string): unknown {
	if (result.status !== 'accepted') return undefined;
	for (const event of result.events) {
		if ((event as { kind?: string }).kind === kind) {
			return (event as Record<string, unknown>)[field];
		}
	}
	return undefined;
}

async function cleanupBytes(assetId: string): Promise<void> {
	try {
		await deleteAssetBytes(assetId);
	} catch {
		// Cleanup is best-effort; an orphaned blob is reclaimed by the store's garbage collection.
	}
}

/**
 * Import one local audio file: store its bytes on this device, then register it in the core library
 * via `audio.import-asset`. Returns an honest outcome — never a silent partial import.
 */
export async function importAudioFile(
	runtime: AudioImportRuntime,
	actorId: string,
	file: AudioImportFile,
): Promise<AudioImportOutcome> {
	if (file.bytes.byteLength === 0) {
		return { ok: false, message: `“${file.name}” is empty — nothing to import.` };
	}
	if (!isNativeAudioMimeType(file.mime)) {
		return {
			ok: false,
			message: `“${file.mime || 'unknown type'}” is not a supported audio format. Supported: ${Object.keys(NATIVE_AUDIO_MIME_TYPES).join(', ')}.`,
		};
	}
	const title = audioTitleFromFileName(file.name);

	// (2) Bytes first — the store computes the same content hash the core will, and enforces the
	// size/quota bounds fail-closed with an actionable message.
	let byteId: string;
	try {
		byteId = await putAssetBytes(file.bytes, file.mime);
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}

	// (3) Resolve the owning source: identical bytes reuse the existing asset's source; a new file
	// gets its own dedicated local-file source. `hadAsset` guards the byte cleanup on rejection —
	// bytes that were already present before this import are never deleted.
	const existingAsset = runtime.state.audio.assets[byteId];
	const hadAsset = existingAsset !== undefined;
	let sourceId = existingAsset?.source.sourceId ?? null;
	if (sourceId === null) {
		const configured = await runtime.dispatch({
			type: 'audio.configure-source',
			actorId,
			payload: { type: 'local-file', displayName: title, cacheBehavior: 'local' },
		});
		if (configured.status !== 'accepted') {
			if (!hadAsset) await cleanupBytes(byteId);
			return { ok: false, message: configured.rejection.message };
		}
		const configuredId = eventField(configured, 'audio.source-configured', 'sourceId');
		if (typeof configuredId !== 'string' || configuredId.length === 0) {
			if (!hadAsset) await cleanupBytes(byteId);
			return { ok: false, message: 'The audio source was configured but reported no id — import aborted.' };
		}
		sourceId = configuredId;
	}

	// (4) Register the asset metadata through the core (validates + content-hashes the same bytes).
	const imported = await runtime.dispatch({
		type: 'audio.import-asset',
		actorId,
		payload: {
			sourceId,
			bytes: Array.from(file.bytes),
			mimeType: file.mime,
			fileName: file.name,
			title,
		},
	});
	if (imported.status !== 'accepted') {
		if (!hadAsset) await cleanupBytes(byteId);
		return { ok: false, message: imported.rejection.message };
	}
	const assetId = eventField(imported, 'audio.asset-imported', 'assetId');
	return {
		ok: true,
		assetId: typeof assetId === 'string' ? assetId : byteId,
		sourceId,
		title,
		deduped: eventField(imported, 'audio.asset-imported', 'deduped') === true,
		needsLicenseReview: eventField(imported, 'audio.asset-imported', 'needsLicenseReview') === true,
	};
}
