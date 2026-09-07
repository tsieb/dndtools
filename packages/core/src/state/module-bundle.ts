import {
	MODULE_BUNDLE_FORMAT,
	MODULE_BUNDLE_SCHEMA_VERSION,
	CONTENT_MODULE_PAYLOAD_FORMAT,
	moduleBundleEnvelopeSchema,
	payloadSchemaForKind,
	type ModuleKind,
} from '../schemas/module-bundle';
import type { ContentExport } from './content-export';

/**
 * RC-CLD-4.1 — the `.dndmodule` BUNDLE: the one thing the marketplace publishes, lists and installs,
 * whatever kind of content it carries.
 *
 * The marketplace previously had exactly one shape — a bare widget-package definition — so a listing
 * could not say what it was and an install had one hard-coded destination. A bundle names its KIND
 * in the manifest, so the listing row carries it, discovery can filter on it, and the install picks
 * the right REVIEW FLOW: a widget package goes to the package trust review, a content module goes to
 * the transactional `content.commit-import` preview. Nothing installs without a review (ADR-002:
 * a publisher proposes, the DM disposes).
 *
 * Pure data + pure functions: build, parse, and project. No storage, no clock, no ids — a caller
 * supplies `authoredAt`. The command layer and the API edge compose this.
 */

export {
	MODULE_BUNDLE_FORMAT,
	MODULE_BUNDLE_SCHEMA_VERSION,
	MODULE_KINDS,
	CONTENT_MODULE_PAYLOAD_FORMAT,
	SCENE_PACKAGE_PAYLOAD_FORMAT,
	MODULE_ASSET_MEDIA_TYPES,
	MAX_MODULE_ASSETS,
	MAX_MODULE_ASSET_BYTES,
	MAX_MODULE_ASSETS_TOTAL_BYTES,
	decodedByteLength,
} from '../schemas/module-bundle';
export type { ModuleKind } from '../schemas/module-bundle';

/** The manifest: what this module is, who may reuse it, and which kind of payload it carries. */
export interface ModuleManifest {
	kind: ModuleKind;
	id: string;
	name: string;
	summary: string;
	version: string;
	license?: string;
	authoredAt?: string;
	systems?: string[];
}

/** One packaged binary/text asset, carried inline as base64 so a bundle is a single JSON file. */
export interface ModuleAsset {
	path: string;
	mediaType: string;
	dataBase64: string;
}

/** The `content-module` payload — the `content.export` bundle verbatim. */
export interface ContentModulePayload {
	format: typeof CONTENT_MODULE_PAYLOAD_FORMAT;
	version: 1;
	mode: string;
	files: Array<{ path: string; markdown: string }>;
}

export interface ModuleBundle {
	format: typeof MODULE_BUNDLE_FORMAT;
	schemaVersion: typeof MODULE_BUNDLE_SCHEMA_VERSION;
	manifest: ModuleManifest;
	payload: unknown;
	assets: ModuleAsset[];
}

export interface ModuleBundleIssue {
	path: string;
	message: string;
}

export type ModuleBundleParseResult =
	| { ok: true; bundle: ModuleBundle }
	| { ok: false; reason: string; issues: ModuleBundleIssue[] };

function issuesOf(error: {
	issues: Array<{ path: PropertyKey[]; message: string }>;
}): ModuleBundleIssue[] {
	return error.issues.map((issue) => ({
		path: issue.path.map((part) => String(part)).join('.') || '(root)',
		message: issue.message,
	}));
}

/**
 * Parse an untrusted value as a `.dndmodule`. Two passes: the envelope + manifest, then the payload
 * against the schema the manifest's `kind` names. Fail closed — a mismatch is a rejection with the
 * offending field paths, never a partially-trusted bundle.
 */
export function parseModuleBundle(value: unknown): ModuleBundleParseResult {
	const envelope = moduleBundleEnvelopeSchema.safeParse(value);
	if (!envelope.success) {
		return {
			ok: false,
			reason: 'This file is not a valid .dndmodule bundle.',
			issues: issuesOf(envelope.error),
		};
	}
	const { manifest, assets } = envelope.data;
	const payload = payloadSchemaForKind(manifest.kind).safeParse(envelope.data.payload);
	if (!payload.success) {
		return {
			ok: false,
			reason: `The bundle says it is a ${manifest.kind}, but its contents are not a valid ${manifest.kind}.`,
			issues: issuesOf(payload.error).map((issue) => ({
				path: `payload.${issue.path}`,
				message: issue.message,
			})),
		};
	}
	return {
		ok: true,
		bundle: {
			format: MODULE_BUNDLE_FORMAT,
			schemaVersion: MODULE_BUNDLE_SCHEMA_VERSION,
			manifest: manifest as ModuleManifest,
			payload: payload.data,
			assets: assets as ModuleAsset[],
		},
	};
}

/** Build a bundle of any kind, validating it on the way out so a publish cannot ship a bad file. */
export function buildModuleBundle(input: {
	manifest: ModuleManifest;
	payload: unknown;
	assets?: ModuleAsset[];
}): ModuleBundleParseResult {
	return parseModuleBundle({
		format: MODULE_BUNDLE_FORMAT,
		schemaVersion: MODULE_BUNDLE_SCHEMA_VERSION,
		manifest: input.manifest,
		payload: input.payload,
		assets: input.assets ?? [],
	});
}

/** Project a `content.export` result into the `content-module` payload (no re-derivation). */
export function contentExportToModulePayload(exported: ContentExport): ContentModulePayload {
	return {
		format: CONTENT_MODULE_PAYLOAD_FORMAT,
		version: 1,
		mode: exported.mode,
		files: exported.files.map((file) => ({ path: file.path, markdown: file.markdown })),
	};
}

/** Build a content module straight from a `content.export` result. */
export function buildContentModuleBundle(input: {
	manifest: Omit<ModuleManifest, 'kind'>;
	export: ContentExport;
	assets?: ModuleAsset[];
}): ModuleBundleParseResult {
	return buildModuleBundle({
		manifest: { ...input.manifest, kind: 'content-module' },
		payload: contentExportToModulePayload(input.export),
		assets: input.assets,
	});
}

/**
 * The `{path, text}` files a content module hands to `content.commit-import` — the SAME
 * transactional, resumable review the Knowledge import uses. A content module never gets a private
 * write path into the vault.
 */
export function contentModuleImportFiles(
	bundle: ModuleBundle,
): Array<{ path: string; text: string }> {
	if (bundle.manifest.kind !== 'content-module') return [];
	const payload = bundle.payload as ContentModulePayload;
	return payload.files.map((file) => ({ path: file.path, text: file.markdown }));
}

/** A stable, filesystem-safe download name for a bundle. */
export function moduleBundleFileName(manifest: ModuleManifest): string {
	return `${manifest.id}-${manifest.version}.dndmodule`;
}

/** How many items a bundle would install, for the review dialog's honest facts. */
export function moduleBundleItemCount(bundle: ModuleBundle): number {
	switch (bundle.manifest.kind) {
		case 'content-module':
			return (bundle.payload as ContentModulePayload).files.length;
		case 'widget-package':
			return (bundle.payload as { widgets?: unknown[] }).widgets?.length ?? 0;
		case 'scene-package':
			return (bundle.payload as { scenes?: unknown[] }).scenes?.length ?? 0;
		case 'system-package':
			return 1;
	}
}
