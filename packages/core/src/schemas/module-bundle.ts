/**
 * RC-CLD-4.1 — zod schemas for the `.dndmodule` BUNDLE, the single distributable unit the
 * marketplace publishes and installs.
 *
 * A bundle is `manifest + payload + assets`. The manifest declares WHICH OF THE FOUR LISTING KINDS
 * the bundle is, and the payload is then validated against that kind's own canonical schema — a
 * bundle whose manifest says `widget-package` but whose payload is a system package is a rejection,
 * not a surprise at install time (fail closed, guardrail 9).
 *
 * The `content-module` kind EXTENDS `content.export`: its payload is byte-for-byte the
 * `dndtools-content-export` bundle the Export surface already downloads and the Knowledge import
 * already reads, so a content module round-trips through the existing transactional import review
 * rather than through a second, parallel content path.
 *
 * Every object is `.strict()`. Assets are base64 with a media-type allow-list; SVG is NOT on it,
 * because an SVG is a scriptable document and a marketplace asset is untrusted by definition.
 */
import { z } from 'zod';
import { CONTENT_EXPORT_MODES } from '../state/content-export';
import { systemPackageSchema } from './system-package';
import { widgetPackageDefinitionSchema } from './widget-package';

/** The four listing kinds a marketplace listing (and therefore a bundle) can have. */
export const MODULE_KINDS = [
	'widget-package',
	'system-package',
	'scene-package',
	'content-module',
] as const;

export type ModuleKind = (typeof MODULE_KINDS)[number];

/** File format marker + schema version of the `.dndmodule` envelope itself. */
export const MODULE_BUNDLE_FORMAT = 'dndmodule' as const;
export const MODULE_BUNDLE_SCHEMA_VERSION = 1 as const;

/** The payload format marker for each kind that owns one (widget/system payloads are bare models). */
export const CONTENT_MODULE_PAYLOAD_FORMAT = 'dndtools-content-export' as const;
export const SCENE_PACKAGE_PAYLOAD_FORMAT = 'dndtools-scene-package' as const;

// Bounds. A bundle crosses a trust boundary in both directions (publish and install), so it is
// bounded here rather than only at the API edge.
export const MAX_MODULE_ASSETS = 64;
export const MAX_MODULE_ASSET_BYTES = 512 * 1024;
export const MAX_MODULE_ASSETS_TOTAL_BYTES = 2 * 1024 * 1024;

/** Media types an asset may declare. Inert, non-scriptable payloads only — no SVG, no HTML. */
export const MODULE_ASSET_MEDIA_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'audio/mpeg',
	'audio/ogg',
	'audio/wav',
	'application/json',
	'text/markdown',
	'text/plain',
] as const;

const moduleIdSchema = z
	.string()
	.min(1)
	.max(120)
	.regex(
		/^[a-z0-9][a-z0-9._-]*$/,
		'Start a module id with a lower-case letter or digit, then letters, digits, dots, dashes or underscores.',
	);

const semverSchema = z
	.string()
	.min(1)
	.max(40)
	.regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'Use a semver version, e.g. 1.2.0.');

/** A relative, traversal-free POSIX path: no leading slash, no `..`, no backslashes, no controls. */
const assetPathSchema = z
	.string()
	.min(1)
	.max(240)
	.regex(
		/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/,
		'Use a relative path with no "..", no leading slash and no backslashes.',
	);

const base64Schema = z
	.string()
	.max(MAX_MODULE_ASSET_BYTES * 2)
	.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Use base64 data.');

export const moduleAssetSchema = z
	.object({
		path: assetPathSchema,
		mediaType: z.enum(MODULE_ASSET_MEDIA_TYPES),
		dataBase64: base64Schema,
	})
	.strict()
	.refine((asset) => decodedByteLength(asset.dataBase64) <= MAX_MODULE_ASSET_BYTES, {
		message: `An asset may be at most ${MAX_MODULE_ASSET_BYTES} bytes.`,
		path: ['dataBase64'],
	});

/** Byte length of base64 data without allocating the buffer. */
export function decodedByteLength(base64: string): number {
	if (base64.length === 0) return 0;
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
	return (base64.length / 4) * 3 - padding;
}

export const moduleManifestSchema = z
	.object({
		kind: z.enum(MODULE_KINDS),
		id: moduleIdSchema,
		name: z.string().min(1).max(80),
		summary: z.string().min(1).max(280),
		version: semverSchema,
		/** SPDX-ish free text; the publish checklist (RC-CLD-4.3) is what enforces a real licence. */
		license: z.string().min(1).max(80).optional(),
		/** RC-CLD-4.3 — what changed in this version. The publish checklist requires one before shipping. */
		changelog: z.string().min(1).max(2000).optional(),
		authoredAt: z.string().min(1).max(40).optional(),
		/** Systems the module targets, for discovery filters (RC-CLD-4.2). */
		systems: z.array(z.string().min(1).max(80)).max(16).optional(),
	})
	.strict();

/** `content-module` payload — the SAME bundle `content.export` already produces. */
export const contentModulePayloadSchema = z
	.object({
		format: z.literal(CONTENT_MODULE_PAYLOAD_FORMAT),
		version: z.literal(1),
		mode: z.enum(CONTENT_EXPORT_MODES as readonly ['portable', 'dm-backup']),
		files: z
			.array(z.object({ path: z.string().min(1).max(240), markdown: z.string() }).strict())
			.min(1),
	})
	.strict();

/**
 * `scene-package` payload. There is no scene-export command yet, so this declares the wire format a
 * scene package must arrive in; the scene story fills in the producer.
 */
export const scenePackagePayloadSchema = z
	.object({
		format: z.literal(SCENE_PACKAGE_PAYLOAD_FORMAT),
		version: z.literal(1),
		scenes: z
			.array(
				z
					.object({
						id: z.string().min(1).max(200),
						name: z.string().min(1).max(200),
						/** The serialized scene document; validated by the scene importer, not here. */
						document: z.unknown(),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

/** Payload schema for a kind. Exported so the API edge can validate without parsing the envelope. */
export function payloadSchemaForKind(kind: ModuleKind): z.ZodTypeAny {
	switch (kind) {
		case 'widget-package':
			return widgetPackageDefinitionSchema;
		case 'system-package':
			return systemPackageSchema;
		case 'scene-package':
			return scenePackagePayloadSchema;
		case 'content-module':
			return contentModulePayloadSchema;
	}
}

/**
 * The envelope. `payload` is validated in a second pass against the manifest's kind (a
 * discriminated union over four unrelated payload schemas would report every branch's errors).
 */
export const moduleBundleEnvelopeSchema = z
	.object({
		format: z.literal(MODULE_BUNDLE_FORMAT),
		schemaVersion: z.literal(MODULE_BUNDLE_SCHEMA_VERSION),
		manifest: moduleManifestSchema,
		payload: z.unknown(),
		assets: z.array(moduleAssetSchema).max(MAX_MODULE_ASSETS).default([]),
	})
	.strict()
	.refine(
		(bundle) =>
			bundle.assets.reduce((sum, a) => sum + decodedByteLength(a.dataBase64), 0) <=
			MAX_MODULE_ASSETS_TOTAL_BYTES,
		{
			message: `A bundle's assets may total at most ${MAX_MODULE_ASSETS_TOTAL_BYTES} bytes.`,
			path: ['assets'],
		},
	)
	.refine((bundle) => new Set(bundle.assets.map((a) => a.path)).size === bundle.assets.length, {
		message: 'Two assets share the same path.',
		path: ['assets'],
	});
