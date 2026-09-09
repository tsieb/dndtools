import { parseMarkdownNote } from '../state/markdown';
import type { ExportedFile } from '../state/content-export';

/**
 * RC-CLD-4.3 — CREATOR TOOLING: the publish CHECKLIST the Community › Publish screen runs over a draft
 * before it lets a DM ship it. `moduleManifestSchema` (RC-CLD-4.1, `schemas/module-bundle.ts`) already
 * enforces valid semver and a `.strict()` shape at the wire boundary; this is the pre-flight, ADVISORY
 * pass that runs on the DRAFT (before a bundle is even built) so the checklist can explain WHY, not just
 * reject at publish time. Pure: no storage, no clock, no network — every check reads only its explicit
 * input.
 */

export type PublishChecklistSeverity = 'pass' | 'warning' | 'blocking';

export interface PublishChecklistItem {
	id: 'semver' | 'license' | 'changelog' | 'broken-links' | 'missing-assets';
	severity: PublishChecklistSeverity;
	message: string;
}

export interface PublishChecklistResult {
	items: PublishChecklistItem[];
	/** False when any item is `blocking` — the screen refuses to publish (fail closed, guardrail 9). */
	readyToPublish: boolean;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
// Extensions a content export could plausibly reference but never bundles (no image/audio asset
// pipeline exists for a content module yet — see the missing-assets check below).
const ASSET_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav|pdf)$/i;

/** Whether `version` is a valid semver string, mirroring `schemas/module-bundle.ts`'s `semverSchema`. */
export function isValidSemver(version: string): boolean {
	return SEMVER_PATTERN.test(version.trim());
}

/**
 * Scan a content module's exported files for two self-consistency problems a bundle can only have
 * once it leaves the vault: a `[[wikilink]]` to a note NOT included in this export (broken — the
 * reader's install has nothing to resolve it to), and a `[[target.ext]]` that names an image/audio/pdf
 * asset (content exports carry markdown only; no asset pipeline bundles the referenced file — RC-CLD-8
 * asset packaging is future work, not a gap this checklist can silently paper over).
 */
function checkContentModuleFiles(files: readonly ExportedFile[]): {
	brokenLinks: string[];
	missingAssets: string[];
} {
	const titles = new Set<string>();
	const parsed = files.map((file) => {
		const note = parseMarkdownNote(file.markdown);
		const title = note.properties['title'];
		if (typeof title === 'string' && title.trim() !== '') titles.add(title.trim().toLowerCase());
		return note;
	});

	const brokenLinks = new Set<string>();
	const missingAssets = new Set<string>();
	for (const note of parsed) {
		for (const link of note.wikilinks) {
			const target = link.target.trim();
			if (target === '') continue;
			if (ASSET_EXTENSION_PATTERN.test(target)) {
				missingAssets.add(target);
			} else if (!titles.has(target.toLowerCase())) {
				brokenLinks.add(target);
			}
		}
	}
	return { brokenLinks: [...brokenLinks].sort(), missingAssets: [...missingAssets].sort() };
}

export interface PublishChecklistInput {
	version: string;
	license?: string;
	changelog?: string;
	/** Present for a `content-module` draft — the `content.export` result about to be bundled. */
	contentModuleFiles?: readonly ExportedFile[];
	/**
	 * Present for a `widget-package` draft — `exportWidgetPackage`'s own portability warnings (already
	 * flag device-local/excluded assets; RC-CLD-4.1's `commands/widget-package.ts`). Surfaced here rather
	 * than re-derived, so there is exactly one place that decides a widget asset is unshippable.
	 */
	widgetPortabilityWarnings?: readonly string[];
}

/**
 * RC-CLD-4.3 — build the publish checklist for a draft. `license` and `changelog` are BLOCKING (a
 * listing with neither is exactly the "who wrote this and what changed" gap creator tooling exists to
 * close); a broken link or an asset reference the bundle cannot carry is a WARNING — real content
 * sometimes legitimately links outside its own module, so the DM decides, the checklist informs
 * (ADR-002/025: propose, never dispose).
 */
export function buildPublishChecklist(input: PublishChecklistInput): PublishChecklistResult {
	const items: PublishChecklistItem[] = [];

	const version = input.version.trim();
	items.push(
		isValidSemver(version)
			? { id: 'semver', severity: 'pass', message: `${version} is a valid semver version.` }
			: {
					id: 'semver',
					severity: 'blocking',
					message: 'Use a semver version, e.g. 1.2.0.',
				},
	);

	const license = input.license?.trim() ?? '';
	items.push(
		license !== ''
			? { id: 'license', severity: 'pass', message: `Licensed: ${license}.` }
			: {
					id: 'license',
					severity: 'blocking',
					message: 'Declare a license before publishing (e.g. CC-BY-4.0, OGL-1.0a).',
				},
	);

	const changelog = input.changelog?.trim() ?? '';
	items.push(
		changelog !== ''
			? { id: 'changelog', severity: 'pass', message: 'Changelog recorded for this version.' }
			: {
					id: 'changelog',
					severity: 'blocking',
					message: 'Describe what changed in this version.',
				},
	);

	if (input.contentModuleFiles) {
		const { brokenLinks, missingAssets } = checkContentModuleFiles(input.contentModuleFiles);
		items.push(
			brokenLinks.length === 0
				? { id: 'broken-links', severity: 'pass', message: 'No broken links.' }
				: {
						id: 'broken-links',
						severity: 'warning',
						message: `Link(s) to content outside this module: ${brokenLinks.join(', ')}.`,
					},
		);
		items.push(
			missingAssets.length === 0
				? { id: 'missing-assets', severity: 'pass', message: 'No missing assets.' }
				: {
						id: 'missing-assets',
						severity: 'warning',
						message: `Referenced asset(s) this module cannot bundle yet: ${missingAssets.join(', ')}.`,
					},
		);
	} else if (input.widgetPortabilityWarnings && input.widgetPortabilityWarnings.length > 0) {
		items.push({
			id: 'missing-assets',
			severity: 'warning',
			message: input.widgetPortabilityWarnings.join(' '),
		});
	} else {
		items.push({ id: 'missing-assets', severity: 'pass', message: 'No missing assets.' });
	}

	return {
		items,
		readyToPublish: items.every((item) => item.severity !== 'blocking'),
	};
}
