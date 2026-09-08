import { describe, expect, it } from 'vitest';
import { buildPublishChecklist, isValidSemver, type ExportedFile } from '../src';

/**
 * RC-CLD-4.3 — the publish checklist Community › Publish runs over a draft before letting a DM ship
 * it: valid semver + a declared license + a changelog are BLOCKING; a broken link or an asset the
 * bundle cannot carry yet is a WARNING (the DM decides — ADR-002/025 propose, never dispose).
 */

function file(markdown: string): ExportedFile {
	return { path: 'note.md', markdown };
}

describe('isValidSemver', () => {
	it('accepts a plain semver version', () => {
		expect(isValidSemver('1.2.0')).toBe(true);
	});
	it('accepts a pre-release/build suffix', () => {
		expect(isValidSemver('1.2.0-beta.1')).toBe(true);
		expect(isValidSemver('1.2.0+build.7')).toBe(true);
	});
	it('rejects a non-semver string', () => {
		expect(isValidSemver('v1.2')).toBe(false);
		expect(isValidSemver('latest')).toBe(false);
		expect(isValidSemver('')).toBe(false);
	});
});

describe('buildPublishChecklist', () => {
	it('is ready to publish when version/license/changelog are all present and nothing else applies', () => {
		const result = buildPublishChecklist({
			version: '1.0.0',
			license: 'CC-BY-4.0',
			changelog: 'Initial release.',
		});
		expect(result.readyToPublish).toBe(true);
		expect(result.items.map((i) => i.severity)).toEqual(['pass', 'pass', 'pass', 'pass']);
	});

	it('blocks on a missing version, license, and changelog, each with its own item', () => {
		const result = buildPublishChecklist({ version: '', license: '', changelog: '' });
		expect(result.readyToPublish).toBe(false);
		const byId = Object.fromEntries(result.items.map((i) => [i.id, i.severity]));
		expect(byId['semver']).toBe('blocking');
		expect(byId['license']).toBe('blocking');
		expect(byId['changelog']).toBe('blocking');
	});

	it('warns (never blocks) on a wikilink to a note outside the exported module', () => {
		const files: ExportedFile[] = [
			file('---\ntitle: The Sunken Crypt\n---\nThe party found [[Harbor of Saltreach]].'),
		];
		const result = buildPublishChecklist({
			version: '1.0.0',
			license: 'CC-BY-4.0',
			changelog: 'Initial release.',
			contentModuleFiles: files,
		});
		expect(result.readyToPublish).toBe(true);
		const brokenLinks = result.items.find((i) => i.id === 'broken-links')!;
		expect(brokenLinks.severity).toBe('warning');
		expect(brokenLinks.message).toContain('Harbor of Saltreach');
	});

	it('does not flag a wikilink to another note included in the SAME export', () => {
		const files: ExportedFile[] = [
			file('---\ntitle: The Sunken Crypt\n---\nLinked from [[Harbor of Saltreach]].'),
			file('---\ntitle: Harbor of Saltreach\n---\nThe docks.'),
		];
		const result = buildPublishChecklist({
			version: '1.0.0',
			license: 'CC-BY-4.0',
			changelog: 'Initial release.',
			contentModuleFiles: files,
		});
		expect(result.items.find((i) => i.id === 'broken-links')!.severity).toBe('pass');
	});

	it('warns on a referenced image/audio asset a content module cannot bundle', () => {
		const files: ExportedFile[] = [
			file('---\ntitle: The Sunken Crypt\n---\nSee the map: [[crypt-map.png]].'),
		];
		const result = buildPublishChecklist({
			version: '1.0.0',
			license: 'CC-BY-4.0',
			changelog: 'Initial release.',
			contentModuleFiles: files,
		});
		const missingAssets = result.items.find((i) => i.id === 'missing-assets')!;
		expect(missingAssets.severity).toBe('warning');
		expect(missingAssets.message).toContain('crypt-map.png');
		expect(result.readyToPublish).toBe(true);
	});

	it('surfaces a widget package export`s portability warnings as the missing-assets item', () => {
		const result = buildPublishChecklist({
			version: '1.0.0',
			license: 'CC-BY-4.0',
			changelog: 'Initial release.',
			widgetPortabilityWarnings: ['Device-local asset path widgets/foo/icon.png was excluded.'],
		});
		const missingAssets = result.items.find((i) => i.id === 'missing-assets')!;
		expect(missingAssets.severity).toBe('warning');
		expect(missingAssets.message).toContain('excluded');
	});
});
