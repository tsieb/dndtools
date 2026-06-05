import { assetNeedsLicenseReview, licenseReviewReason, type AudioAsset } from './audio-asset';
import { capabilityForAudioSourceType } from './audio-source';
import type { AudioState } from './audio-state';

/**
 * AUDIO-011 — FAIL-CLOSED validation of a SCENE AUDIO PACKAGE before import or export commit.
 *
 * A Scene audio package is the set of audio PRESETS (track references) a Scene carries, plus the local
 * assets and stream sources those presets reference. AUDIO-011 requires that an import OR export is only
 * COMMITTABLE once every blocking condition is reported BEFORE the commit:
 *
 *   - MISSING assets (a preset references an asset id not present in the library) — AUDIO-011 AC1.
 *   - MISSING LICENSING metadata (a referenced local asset is unlicensed/flagged) — AUDIO-011 AC1, reusing
 *     the AUDIO-004 license-review gate (no parallel licensing policy).
 *   - UNSUPPORTED STREAMS (a preset references a source whose type is not declared/supported) — AUDIO-011 AC1.
 *   - DEVICE-LOCAL OUTPUT ROUTES (a preset pins a device-local output route that does not travel with the
 *     package) — AUDIO-011 AC1.
 *   - Per included local asset: SOURCE, LICENSE metadata, CONTENT HASH, and PORTABILITY status — AUDIO-011 AC2.
 *
 * The validation REPORT mirrors the CONTENT-008 export validation report + the MAP-020 import diagnostics:
 * non-leaking findings (ids + reasons, never raw payload contents), an explicit `committable` flag, and a
 * per-asset portability manifest. Pure data + pure functions; the command layer composes this and only
 * commits when `committable` is true.
 */

export const AUDIO_PACKAGE_SCHEMA_VERSION = 1 as const;

/** Whether the package is being VALIDATED for an import (incoming) or an export (outgoing). */
export type AudioPackageDirection = 'import' | 'export';

/**
 * One audio PRESET reference inside a Scene package. A preset references a TRACK by an asset id (a local
 * asset) and/or a source id (a stream/source), and may pin a device-local OUTPUT ROUTE. It NEVER clones
 * the asset bytes — Contract 4 embed/projection: the package owns the reference, the library owns the data.
 */
export interface AudioPackagePreset {
	id: string;
	label: string;
	/** The local asset this preset references, or null when it is a pure-stream preset. */
	assetId: string | null;
	/** The configured source this preset plays through, or null when it is a pure local-asset preset. */
	sourceId: string | null;
	/**
	 * A pinned device-local OUTPUT ROUTE id (e.g. a specific speaker/headset). Device-local routes do NOT
	 * travel with a portable package (Contract 2: device-local only); a pinned route is REPORTED so the DM
	 * knows it will not survive the package. Null when the preset uses the default output.
	 */
	outputRouteId: string | null;
}

/** The portability status of an included local asset (AUDIO-011 AC2). */
export type AudioAssetPortability =
	// Travels with the package: present in the library, licensed, content-hash verifiable.
	| 'portable'
	// Present + hash-verifiable but NOT cleared for redistribution (license flagged) — reported, blocks.
	| 'license-blocked'
	// Referenced but missing from the library — cannot travel (blocks the commit).
	| 'missing';

/** The non-leaking finding kinds a package validation can raise (AUDIO-011 AC1). */
export type AudioPackageFindingKind =
	| 'missing-asset'
	| 'missing-license'
	| 'unsupported-stream'
	| 'device-local-output-route';

export type AudioPackageFindingSeverity = 'blocking' | 'warning';

export interface AudioPackageFinding {
	presetId: string;
	kind: AudioPackageFindingKind;
	severity: AudioPackageFindingSeverity;
	/** Non-leaking message: describes the preset + reason, never raw asset bytes or stream payload. */
	message: string;
}

/**
 * The per-included-asset PORTABILITY MANIFEST entry (AUDIO-011 AC2). Each included local asset must have
 * a SOURCE, LICENSE metadata, a CONTENT HASH, and a portability status. The manifest is built FROM the
 * library record (never fabricated), so a missing asset has no manifest entry and instead raises a finding.
 */
export interface AudioPackageManifestEntry {
	assetId: string;
	fileName: string;
	/** The source id the asset belongs to (provenance — AUDIO-011 AC2). */
	sourceId: string;
	/** The content hash (the asset id IS the hash; the bare checksum is surfaced too) — AUDIO-011 AC2. */
	contentHash: string;
	checksum: string;
	licenseKind: AudioAsset['license']['kind'];
	/** The required attribution text (verbatim; empty when none). */
	attribution: string;
	portability: AudioAssetPortability;
}

/** The full AUDIO-011 validation report. `committable` is the fail-closed commit gate (no blocking findings). */
export interface AudioPackageValidationReport {
	direction: AudioPackageDirection;
	presetCount: number;
	findings: AudioPackageFinding[];
	/** The per-included-asset portability manifest (AUDIO-011 AC2). */
	manifest: AudioPackageManifestEntry[];
	/** Count of BLOCKING findings — the commit is refused while this is > 0. */
	blockingCount: number;
	/** Fail-closed commit gate: true ONLY when there are no blocking findings. */
	committable: boolean;
	schemaVersion: typeof AUDIO_PACKAGE_SCHEMA_VERSION;
}

export interface ValidateAudioPackageInput {
	direction: AudioPackageDirection;
	presets: readonly AudioPackagePreset[];
	/** The audio library the package's references resolve against (the local asset + source registry). */
	library: AudioState;
}

/** Build a portability manifest entry from a library asset (never fabricates metadata). Pure. */
function manifestEntryFor(asset: AudioAsset): AudioPackageManifestEntry {
	const flagged = assetNeedsLicenseReview(asset);
	return {
		assetId: asset.id,
		fileName: asset.fileName,
		sourceId: asset.source.sourceId,
		contentHash: asset.id,
		checksum: asset.checksum,
		licenseKind: asset.license.kind,
		attribution: asset.license.attribution,
		// AUDIO-011 AC2: a present, licensed asset is portable; a present but unlicensed asset is
		// license-blocked (reported, blocks redistribution — fail closed). Missing is handled by the caller.
		portability: flagged ? 'license-blocked' : 'portable',
	};
}

/**
 * AUDIO-011 — VALIDATE a Scene audio package for an import/export commit, fail-closed. For each preset:
 *
 *   1. A referenced LOCAL ASSET that is missing from the library raises a BLOCKING `missing-asset` finding
 *      (and no manifest entry — it cannot travel). A present asset gets a manifest entry; an unlicensed
 *      asset raises a BLOCKING `missing-license` finding (reusing the AUDIO-004 review gate) AND is marked
 *      `license-blocked` in the manifest.
 *   2. A referenced SOURCE whose type is NOT declared/supported raises a BLOCKING `unsupported-stream`
 *      finding (the AUDIO-009 unsupported-source rule, applied to package contents).
 *   3. A pinned device-local OUTPUT ROUTE raises a WARNING `device-local-output-route` finding — it does
 *      not block the commit, but the DM is told it will not travel with the package (Contract 2).
 *
 * The package is `committable` ONLY when there are zero BLOCKING findings. The caller (command layer)
 * refuses to commit otherwise, so a missing/unlicensed/unsupported package never imports or exports
 * silently.
 */
export function validateAudioPackage(
	input: ValidateAudioPackageInput,
): AudioPackageValidationReport {
	const findings: AudioPackageFinding[] = [];
	const manifest: AudioPackageManifestEntry[] = [];
	const seenAssetIds = new Set<string>();

	for (const preset of input.presets) {
		// (1) Local asset reference.
		if (preset.assetId !== null) {
			const asset = input.library.assets[preset.assetId];
			if (!asset) {
				findings.push({
					presetId: preset.id,
					kind: 'missing-asset',
					severity: 'blocking',
					message: `Preset "${preset.label}" references audio asset ${preset.assetId}, which is missing from the library.`,
				});
			} else {
				if (!seenAssetIds.has(asset.id)) {
					seenAssetIds.add(asset.id);
					manifest.push(manifestEntryFor(asset));
				}
				if (assetNeedsLicenseReview(asset)) {
					const reason = licenseReviewReason(asset);
					findings.push({
						presetId: preset.id,
						kind: 'missing-license',
						severity: 'blocking',
						message: `Preset "${preset.label}" includes asset ${asset.id} whose license is not cleared (${reason ?? 'flagged'}).`,
					});
				}
			}
		}

		// (2) Source / stream reference.
		if (preset.sourceId !== null) {
			const source = input.library.sources[preset.sourceId];
			const supported =
				source !== undefined && capabilityForAudioSourceType(source.type) !== null;
			if (!supported) {
				findings.push({
					presetId: preset.id,
					kind: 'unsupported-stream',
					severity: 'blocking',
					message: `Preset "${preset.label}" references source ${preset.sourceId}, which is unsupported or undeclared.`,
				});
			}
		}

		// (3) Device-local output route — warns, does not block (it just will not travel).
		if (preset.outputRouteId !== null) {
			findings.push({
				presetId: preset.id,
				kind: 'device-local-output-route',
				severity: 'warning',
				message: `Preset "${preset.label}" pins device-local output route ${preset.outputRouteId}, which will not travel with the package.`,
			});
		}
	}

	// A referenced-but-missing asset has a blocking finding above but no manifest entry; reflect that the
	// commit is blocked. Mark any manifest entry for an asset that was also flagged as license-blocked
	// (already done in `manifestEntryFor`). `missing` portability is implicit (no manifest entry exists).
	const blockingCount = findings.filter((f) => f.severity === 'blocking').length;
	return {
		direction: input.direction,
		presetCount: input.presets.length,
		findings,
		manifest,
		blockingCount,
		committable: blockingCount === 0,
		schemaVersion: AUDIO_PACKAGE_SCHEMA_VERSION,
	};
}

/** Resolve the portability of a single referenced asset id against the library (AUDIO-011 AC2). Pure. */
export function assetPortability(
	library: AudioState,
	assetId: string,
): AudioAssetPortability {
	const asset = library.assets[assetId];
	if (!asset) return 'missing';
	return assetNeedsLicenseReview(asset) ? 'license-blocked' : 'portable';
}
