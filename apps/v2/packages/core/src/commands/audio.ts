import {
	configureAudioSourceInputSchema,
	importAudioAssetInputSchema,
	updateAudioAssetMetadataInputSchema,
	validateAudioPackageInputSchema,
} from '../schemas/commands';
import {
	AUDIO_ASSET_ENTITY_TYPE,
	assetNeedsLicenseReview,
	buildAudioAsset,
	buildAudioLicense,
	cloneAudioAsset,
	normalizeAudioTags,
	type AudioAsset,
} from '../state/audio-asset';
import {
	AUDIO_SOURCE_ENTITY_TYPE,
	classifyAudioSource,
	configureAudioSource,
	type AudioSource,
} from '../state/audio-source';
import { validateAudioPackage } from '../state/audio-package';
import type { AudioState } from '../state/audio-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * AUDIO-004 / AUDIO-009 / AUDIO-010 / AUDIO-011 — AUDIO command handlers (Architecture Contract 1 / 2).
 *
 * The DM IMPORTS + manages local audio ASSETS, CONFIGURES declared audio SOURCES, and VALIDATES Scene audio
 * PACKAGES. All four are DM-only (audio config is Player-safe: dm-only). The architecture invariants this
 * slice upholds, fail-closed:
 *
 *   - DM-only. A non-DM cannot import/configure/validate (a player has no audio config authority).
 *   - Content-addressed assets. An asset id IS its content hash, so re-importing identical bytes DEDUPES
 *     to one record; the metadata (license/tags) is still applied. The bytes are validated (size/MIME)
 *     BEFORE any write — an invalid file is rejected and nothing is committed.
 *   - Licensing fails closed. An undeclared license stays `unknown` (flagged for review); the gate is
 *     never silently cleared and metadata is never fabricated.
 *   - Source scope fails closed. An UNSUPPORTED provider is rejected with an unsupported-source diagnostic
 *     and NO source record + NO playback state is created (AUDIO-009 AC2). Cache/offline behavior is the
 *     AUDIO-010 prerequisite for enabling playback.
 *   - Package validation fails closed. A package with a blocking finding (missing asset/license metadata,
 *     unsupported stream) is REPORTED and refused before commit; the validation itself mutates no durable
 *     state (the report rides the rejection/event for the GUI).
 *
 * Each durable mutation appends a `audio.*` op (actor + entity — the audit). The GUI dispatches the intent;
 * it never writes the audio library.
 */

function withAudio(state: CoreStateSlice, audio: AudioState): CoreStateSlice {
	return { ...state, audio };
}

export function handleImportAudioAsset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(importAudioAssetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	// Validate + content-hash the bytes BEFORE any write (fail closed). An invalid file is rejected.
	const built = buildAudioAsset({
		bytes: Uint8Array.from(input.bytes),
		mimeType: input.mimeType,
		fileName: input.fileName,
		title: input.title,
		license: input.license,
		tags: input.tags,
		sourceId: input.sourceId,
		importedBy: actor.id,
		importedAt: env.clock(),
		maxBytes: input.maxBytes,
	});
	if ('error' in built) {
		return reject({ code: 'invalid-audio-asset', message: built.error.message }, state);
	}

	// Content-addressed dedupe: identical bytes ⇒ identical id ⇒ a single record. On a re-import the
	// authored metadata (license/tags/title) is REFRESHED onto the existing record so a corrected license
	// is not lost, but the bytes/hash are unchanged.
	const existing = state.audio.assets[built.id];
	const deduped = existing !== undefined;
	const asset: AudioAsset = deduped
		? { ...existing, title: built.title, license: built.license, tags: built.tags }
		: built;

	const needsReview = assetNeedsLicenseReview(asset);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_ASSET_ENTITY_TYPE,
		entityId: asset.id,
		opType: 'audio.import-asset',
		path: `audio/assets/${asset.id}`,
		// The op value carries METADATA only (license/tags/source/hash) — never the bytes (Contract 2:
		// large binary assets are synced as content-addressed records + metadata ops, not embedded payloads).
		value: {
			assetId: asset.id,
			checksum: asset.checksum,
			licenseKind: asset.license.kind,
			tags: asset.tags,
			sourceId: asset.source.sourceId,
		},
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{ ...state.audio, assets: { ...state.audio.assets, [asset.id]: asset } },
		),
		events: [
			{
				kind: 'audio.asset-imported',
				assetId: asset.id,
				licenseKind: asset.license.kind,
				needsLicenseReview: needsReview,
				deduped,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleUpdateAudioAssetMetadata(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(updateAudioAssetMetadataInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.audio.assets[input.assetId];
	if (!previous) {
		return reject(
			{ code: 'audio-asset-not-found', message: `Audio asset ${input.assetId} does not exist.` },
			state,
		);
	}

	const asset = cloneAudioAsset(previous);
	if (input.title !== undefined) asset.title = input.title.trim() || asset.fileName;
	if (input.license !== undefined) {
		// Fail closed: an update with no kind re-resolves to `unknown` (never silently keeps a cleared kind
		// while wiping its note). The caller passes the full intended license each time.
		asset.license = buildAudioLicense(input.license);
	}
	if (input.tags !== undefined) asset.tags = normalizeAudioTags(input.tags);

	const needsReview = assetNeedsLicenseReview(asset);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_ASSET_ENTITY_TYPE,
		entityId: asset.id,
		opType: 'audio.update-asset-metadata',
		path: `audio/assets/${asset.id}`,
		value: { assetId: asset.id, licenseKind: asset.license.kind, tags: asset.tags },
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{ ...state.audio, assets: { ...state.audio.assets, [asset.id]: asset } },
		),
		events: [
			{
				kind: 'audio.asset-metadata-updated',
				assetId: asset.id,
				licenseKind: asset.license.kind,
				needsLicenseReview: needsReview,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleConfigureAudioSource(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(configureAudioSourceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = input.sourceId ? state.audio.sources[input.sourceId] : undefined;
	const sourceId = previous?.id ?? input.sourceId ?? env.ids();
	const result = configureAudioSource({
		id: sourceId,
		type: input.type,
		displayName: input.displayName,
		url: input.url ?? null,
		cacheBehavior: input.cacheBehavior,
		licenseNote: input.licenseNote,
		createdBy: actor.id,
		createdAt: env.clock(),
		previous,
	});

	if (!result.ok) {
		// AUDIO-009 AC2 — an unsupported provider is rejected fail-closed: NO source record is written, so
		// NO playback state exists. Other config errors (missing URL, disallowed cache behavior) reject too.
		const code =
			result.reason === 'unsupported-source-type' ? 'unsupported-audio-source' : 'invalid-audio-source';
		return reject({ code, message: result.message }, state);
	}

	const source: AudioSource = result.source;
	const classification = classifyAudioSource(source);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_SOURCE_ENTITY_TYPE,
		entityId: source.id,
		opType: 'audio.configure-source',
		path: `audio/sources/${source.id}`,
		value: {
			sourceId: source.id,
			type: source.type,
			cacheBehavior: source.cacheBehavior,
			playbackEnabled: source.playbackEnabled,
		},
		beforeRevision: previous?.revision ?? 0,
		afterRevision: source.revision,
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{ ...state.audio, sources: { ...state.audio.sources, [source.id]: source } },
		),
		events: [
			{
				kind: 'audio.source-configured',
				sourceId: source.id,
				sourceType: classification.type,
				cacheBehavior: source.cacheBehavior,
				playbackEnabled: source.playbackEnabled,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleValidateAudioPackage(
	state: CoreStateSlice,
	_env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(validateAudioPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const report = validateAudioPackage({
		direction: input.direction,
		presets: input.presets,
		library: state.audio,
	});

	// AUDIO-011 — fail closed: a package with ANY blocking finding is REJECTED before commit. The blocking
	// findings ride the rejection `issues` so the import/export surface sees exactly what must be fixed; no
	// durable state is mutated either way (validation is a pure check).
	if (!report.committable) {
		return reject(
			{
				code: 'audio-package-invalid',
				message: `Scene audio package cannot be ${input.direction}ed: ${report.blockingCount} blocking issue(s) must be resolved first.`,
				issues: report.findings
					.filter((finding) => finding.severity === 'blocking')
					.map((finding) => ({ path: finding.presetId, message: finding.message })),
			},
			state,
		);
	}

	// A committable package is accepted with NO durable mutation (validation only). The full report rides
	// the event so the GUI can render the per-asset portability manifest + any non-blocking warnings.
	return {
		status: 'accepted',
		nextState: state,
		events: [
			{
				kind: 'audio.package-validated',
				direction: report.direction,
				committable: report.committable,
				blockingCount: report.blockingCount,
				report,
				actorId: actor.id,
			},
		],
		operationIds: [],
	};
}
