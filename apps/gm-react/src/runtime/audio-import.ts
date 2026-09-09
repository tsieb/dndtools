import {
	NATIVE_AUDIO_MIME_TYPES,
	isNativeAudioMimeType,
	type AudioLicense,
	type AudioState,
	type CommandResult,
	type CoreCommand,
} from '@dndtools/core';
import { deleteAssetBytes, putAssetBytes } from '../platform/storage/assetStore';

/**
 * RC-AUD-1.2 — decoded-audio metadata (duration + a waveform thumbnail). Web Audio decode has no core
 * equivalent (the core stays framework-free per the boundary lint), so this is measured HERE, client-side,
 * and the measurement rides an `audio.update-asset-metadata` dispatch after the asset already exists — an
 * import never blocks on, or fails because of, a decode that a headless/denied platform cannot do.
 */

/** The minimal decode surface this module needs. A plain object stands in for it under Node in tests. */
export interface AudioAnalysisContext {
	decodeAudioData(data: ArrayBuffer): Promise<{
		duration: number;
		numberOfChannels: number;
		getChannelData(channel: number): ArrayLike<number>;
	}>;
	close(): Promise<void>;
}

/** At most this many waveform samples are read (matches the core's thumbnail cap); the rest are skipped. */
const WAVEFORM_SAMPLE_COUNT = 200;

const DEFAULT_ANALYSIS_CONTEXT_FACTORY = (): AudioAnalysisContext | null => {
	const ctor = globalThis as unknown as {
		AudioContext?: new () => AudioAnalysisContext;
		webkitAudioContext?: new () => AudioAnalysisContext;
	};
	const Ctor = ctor.AudioContext ?? ctor.webkitAudioContext;
	if (!Ctor) return null;
	try {
		return new Ctor();
	} catch {
		return null;
	}
};

/**
 * Measure a decoded track's duration + a coarse waveform thumbnail. Best-effort and fail-SOFT: any missing
 * decoder, denied context, or decode error returns `null` rather than throwing — an unmeasured asset is
 * an honest, unremarkable state (the library just shows no duration yet), never a failed import.
 */
export async function analyzeAudioBytes(
	bytes: Uint8Array,
	createContext: () => AudioAnalysisContext | null = DEFAULT_ANALYSIS_CONTEXT_FACTORY,
): Promise<{ durationSeconds: number; waveform: number[] } | null> {
	const context = createContext();
	if (!context) return null;
	try {
		// decodeAudioData wants its own ArrayBuffer (some implementations detach the input).
		const copy = bytes.slice().buffer;
		const buffer = await context.decodeAudioData(copy);
		const channel = buffer.getChannelData(0);
		const length = channel.length;
		const bucketCount = Math.min(WAVEFORM_SAMPLE_COUNT, length);
		const waveform: number[] = [];
		if (bucketCount > 0) {
			const bucketSize = length / bucketCount;
			for (let i = 0; i < bucketCount; i++) {
				const start = Math.floor(i * bucketSize);
				const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
				let peak = 0;
				for (let j = start; j < end && j < length; j++)
					peak = Math.max(peak, Math.abs(channel[j] ?? 0));
				waveform.push(Math.min(1, peak));
			}
		}
		return { durationSeconds: buffer.duration, waveform };
	} catch {
		return null;
	} finally {
		try {
			await context.close();
		} catch {
			// Cleanup is best-effort — a context that failed to close leaks no durable state.
		}
	}
}

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
 *   5. RC-AUD-1.2 — best-effort: measure a duration + waveform thumbnail and attach it with a follow-up
 *      `audio.update-asset-metadata` dispatch. Runs AFTER the import already succeeded, so a platform with
 *      no decoder (or a decode error) never turns a successful import into a failure.
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
	/** Display title override. Defaults to the file name with its extension stripped. */
	title?: string;
	/**
	 * A licence the CALLER can vouch for — the bundled starter pack's manifest (RC-AUD-1.3) is the
	 * only current source. A hand-picked local file passes nothing here and stays `unknown`, flagged
	 * for review: a licence is never inferred from a file.
	 */
	license?: AudioLicense;
	tags?: string[];
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
	analyze: (
		bytes: Uint8Array,
	) => Promise<{ durationSeconds: number; waveform: number[] } | null> = analyzeAudioBytes,
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
	const title = file.title?.trim() || audioTitleFromFileName(file.name);

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
			return {
				ok: false,
				message: 'The audio source was configured but reported no id — import aborted.',
			};
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
			...(file.license ? { license: file.license } : {}),
			...(file.tags && file.tags.length > 0 ? { tags: file.tags } : {}),
		},
	});
	if (imported.status !== 'accepted') {
		if (!hadAsset) await cleanupBytes(byteId);
		return { ok: false, message: imported.rejection.message };
	}
	const assetId = eventField(imported, 'audio.asset-imported', 'assetId');
	const resolvedAssetId = typeof assetId === 'string' ? assetId : byteId;

	// (5) RC-AUD-1.2 — measure duration + a waveform thumbnail and attach it as a follow-up metadata patch.
	// Best-effort: the asset already imported successfully, so a decode failure (or no decoder on this
	// platform) never turns a successful import into a failure — it just leaves duration unmeasured.
	const analysis = await analyze(file.bytes);
	if (analysis) {
		await runtime.dispatch({
			type: 'audio.update-asset-metadata',
			actorId,
			payload: {
				assetId: resolvedAssetId,
				durationSeconds: analysis.durationSeconds,
				waveform: analysis.waveform,
			},
		});
	}

	return {
		ok: true,
		assetId: resolvedAssetId,
		sourceId,
		title,
		deduped: eventField(imported, 'audio.asset-imported', 'deduped') === true,
		needsLicenseReview: eventField(imported, 'audio.asset-imported', 'needsLicenseReview') === true,
	};
}
