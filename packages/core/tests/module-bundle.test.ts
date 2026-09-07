import { describe, expect, it } from 'vitest';
import {
	CONTENT_MODULE_PAYLOAD_FORMAT,
	MAX_MODULE_ASSET_BYTES,
	MODULE_BUNDLE_FORMAT,
	MODULE_BUNDLE_SCHEMA_VERSION,
	MODULE_KINDS,
	SCENE_PACKAGE_PAYLOAD_FORMAT,
	buildContentModuleBundle,
	buildModuleBundle,
	contentModuleImportFiles,
	moduleBundleFileName,
	moduleBundleItemCount,
	parseModuleBundle,
	type ContentExport,
	type ModuleManifest,
} from '../src';

/**
 * RC-CLD-4.1 — CONTRACT TESTS for the `.dndmodule` bundle format. The bundle is the trust boundary
 * of the marketplace in both directions, so these assert the fail-closed behaviour: a manifest kind
 * that does not match its payload is a REJECTION, unknown keys are rejections, assets are bounded
 * and media-type-restricted, and a content module's install files are exactly the export's files.
 */

const manifest = (over: Partial<ModuleManifest> = {}): ModuleManifest => ({
	kind: 'content-module',
	id: 'sunken-crypt',
	name: 'The Sunken Crypt',
	summary: 'A three-session delve under a drowned chapel.',
	version: '1.0.0',
	...over,
});

const contentExport: ContentExport = {
	mode: 'portable',
	files: [
		{ path: 'notes/crypt.md', markdown: '# The crypt\n\nWater to the knees.' },
		{ path: 'notes/chapel.md', markdown: '# The chapel\n\nBells under the silt.' },
	],
	report: {
		mode: 'portable',
		totalItems: 3,
		exportedItems: 2,
		omittedForVisibility: 1,
		redactedItems: 0,
		notes: [],
		clean: true,
	},
};

const widgetPayload = {
	id: 'com.example.tracker',
	version: '1.0.0',
	displayName: 'Torch tracker',
	widgets: [
		{
			type: 'com.example.tracker.torch',
			version: '1.0.0',
			displayName: 'Torch',
			author: 'Example',
			supportedProfiles: ['desktop'],
			defaultSize: { width: 4, height: 3 },
			minSize: { width: 2, height: 2 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			capabilitySets: ['manager'],
			commands: [],
			events: [],
			hostPermissions: [],
		},
	],
};

describe('module bundle — the four listing kinds', () => {
	it('names exactly the four marketplace listing kinds', () => {
		expect([...MODULE_KINDS]).toEqual([
			'widget-package',
			'system-package',
			'scene-package',
			'content-module',
		]);
	});

	it('builds a content module from a content.export result and round-trips it', () => {
		const built = buildContentModuleBundle({ manifest: manifest(), export: contentExport });
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.bundle.format).toBe(MODULE_BUNDLE_FORMAT);
		expect(built.bundle.schemaVersion).toBe(MODULE_BUNDLE_SCHEMA_VERSION);
		expect(built.bundle.manifest.kind).toBe('content-module');

		// The payload IS the content.export bundle, unchanged.
		expect(built.bundle.payload).toEqual({
			format: CONTENT_MODULE_PAYLOAD_FORMAT,
			version: 1,
			mode: 'portable',
			files: contentExport.files,
		});

		const reparsed = parseModuleBundle(JSON.parse(JSON.stringify(built.bundle)));
		expect(reparsed.ok).toBe(true);
		if (reparsed.ok) expect(reparsed.bundle).toEqual(built.bundle);
	});

	it('hands the content module to content.commit-import as {path,text} files', () => {
		const built = buildContentModuleBundle({ manifest: manifest(), export: contentExport });
		if (!built.ok) throw new Error('bundle should build');
		expect(contentModuleImportFiles(built.bundle)).toEqual([
			{ path: 'notes/crypt.md', text: '# The crypt\n\nWater to the knees.' },
			{ path: 'notes/chapel.md', text: '# The chapel\n\nBells under the silt.' },
		]);
		expect(moduleBundleItemCount(built.bundle)).toBe(2);
		expect(moduleBundleFileName(built.bundle.manifest)).toBe('sunken-crypt-1.0.0.dndmodule');
	});

	it('accepts a widget package and a scene package under their own kinds', () => {
		const widget = buildModuleBundle({
			manifest: manifest({ kind: 'widget-package', id: 'torch-tracker' }),
			payload: widgetPayload,
		});
		expect(widget.ok).toBe(true);
		if (widget.ok) expect(moduleBundleItemCount(widget.bundle)).toBe(1);

		const scene = buildModuleBundle({
			manifest: manifest({ kind: 'scene-package', id: 'crypt-scenes' }),
			payload: {
				format: SCENE_PACKAGE_PAYLOAD_FORMAT,
				version: 1,
				scenes: [{ id: 'scene-1', name: 'Flooded nave', document: { layers: [] } }],
			},
		});
		expect(scene.ok).toBe(true);
		if (scene.ok) expect(moduleBundleItemCount(scene.bundle)).toBe(1);
	});
});

describe('module bundle — fail closed', () => {
	it('rejects a bundle whose manifest kind does not match its payload', () => {
		const mismatched = buildModuleBundle({
			manifest: manifest({ kind: 'widget-package', id: 'torch-tracker' }),
			payload: {
				format: CONTENT_MODULE_PAYLOAD_FORMAT,
				version: 1,
				mode: 'portable',
				files: [{ path: 'a.md', markdown: '#a' }],
			},
		});
		expect(mismatched.ok).toBe(false);
		if (mismatched.ok) return;
		expect(mismatched.reason).toContain('widget-package');
		expect(mismatched.issues.every((i) => i.path.startsWith('payload'))).toBe(true);
	});

	it('rejects an unknown envelope key, a bad format marker and a non-semver version', () => {
		const base = buildContentModuleBundle({ manifest: manifest(), export: contentExport });
		if (!base.ok) throw new Error('bundle should build');

		expect(parseModuleBundle({ ...base.bundle, extra: 1 }).ok).toBe(false);
		expect(parseModuleBundle({ ...base.bundle, format: 'zip' }).ok).toBe(false);
		expect(parseModuleBundle({ ...base.bundle, schemaVersion: 2 }).ok).toBe(false);
		expect(
			buildContentModuleBundle({
				manifest: manifest({ version: 'v1' }),
				export: contentExport,
			}).ok,
		).toBe(false);
		expect(parseModuleBundle(null).ok).toBe(false);
		expect(parseModuleBundle('not a bundle').ok).toBe(false);
	});

	it('rejects a scriptable asset media type, a traversal path and an oversized asset', () => {
		const withAsset = (asset: Record<string, unknown>) =>
			buildModuleBundle({
				manifest: manifest(),
				payload: {
					format: CONTENT_MODULE_PAYLOAD_FORMAT,
					version: 1,
					mode: 'portable',
					files: [{ path: 'a.md', markdown: '#a' }],
				},
				assets: [asset as never],
			});

		const png = { path: 'maps/crypt.png', mediaType: 'image/png', dataBase64: 'AAAA' };
		expect(withAsset(png).ok).toBe(true);
		// SVG is a scriptable document: never an allowed marketplace asset.
		expect(withAsset({ ...png, mediaType: 'image/svg+xml' }).ok).toBe(false);
		expect(withAsset({ ...png, path: '../../etc/passwd' }).ok).toBe(false);
		expect(withAsset({ ...png, path: '/absolute.png' }).ok).toBe(false);
		expect(withAsset({ ...png, dataBase64: 'not base64!' }).ok).toBe(false);
		expect(
			withAsset({ ...png, dataBase64: 'A'.repeat(Math.ceil((MAX_MODULE_ASSET_BYTES * 4) / 3) + 8) })
				.ok,
		).toBe(false);
	});

	it('rejects two assets sharing a path', () => {
		const duplicate = buildModuleBundle({
			manifest: manifest(),
			payload: {
				format: CONTENT_MODULE_PAYLOAD_FORMAT,
				version: 1,
				mode: 'portable',
				files: [{ path: 'a.md', markdown: '#a' }],
			},
			assets: [
				{ path: 'maps/crypt.png', mediaType: 'image/png', dataBase64: 'AAAA' },
				{ path: 'maps/crypt.png', mediaType: 'image/png', dataBase64: 'BBBB' },
			],
		});
		expect(duplicate.ok).toBe(false);
	});

	it('returns non-installable files for a bundle that is not a content module', () => {
		const widget = buildModuleBundle({
			manifest: manifest({ kind: 'widget-package', id: 'torch-tracker' }),
			payload: widgetPayload,
		});
		if (!widget.ok) throw new Error('bundle should build');
		expect(contentModuleImportFiles(widget.bundle)).toEqual([]);
	});
});
