import type { Actor, PermissionState } from './permission-state';
import type { ContentItem, VaultContentState } from './content';
import { serializeMarkdownNote } from './markdown';
import { DNDTOOLS_PROPERTY_NAMESPACE } from './content-import';
import { redactValue, containsSensitiveData } from '../diagnostics/redaction';
import { getContentItemsForActor } from '../queries/content-query';

/**
 * CONTENT-008 — FAIL-CLOSED export of a vault / selected content as PORTABLE MARKDOWN + a VALIDATION
 * REPORT. This is the SECURITY CRUX of the epic, so it composes the two existing security choke-points
 * rather than re-deriving privacy policy:
 *
 *  1. VISIBILITY (PERM). A `portable` export goes through the SAME actor-filtered content query the GUI
 *     uses (`queries/content-query.ts`), evaluated as if for a PLAYER actor. Anything `dm-only` (or a
 *     `shared` item not delivered to that player) is OMITTED ENTIRELY — its title, body, fields, and id
 *     never appear in the export. Nothing dm-only/hidden can leak, because the export is built FROM the
 *     filtered view, not from raw `VaultContentState`.
 *
 *  2. REDACTION (PLAT). Every serialized value is scrubbed by `diagnostics/redaction.ts` so device-local
 *     SECRETS (tokens/keys/credentials) and ABSOLUTE PATHS / file URLs are replaced with stable
 *     placeholders. This runs in BOTH modes — even a `dm-backup` scrubs secrets and absolute paths
 *     (Architecture Contract 2: cloud/export storage must never contain raw absolute paths or secrets).
 *
 * The ONLY difference in `dm-backup` mode is that hidden (dm-only/shared) content is INCLUDED, because a
 * backup is for the DM's own device and is not a player-readable replication stream. Secrets and paths
 * are STILL scrubbed. Both modes emit a validation report; the `containsSensitiveData` self-check fails
 * the export closed if any serialized output would still leak a secret or path.
 *
 * Pure data + pure functions. No GUI, no storage, no clock. The command layer composes this.
 */

export const CONTENT_EXPORT_SCHEMA_VERSION = 1 as const;

/** Export modes (CONTENT-008). `portable` is the default fail-closed mode; `dm-backup` is explicit. */
export type ContentExportMode =
	// Player-shareable: visibility-filtered (no dm-only/hidden), secrets + absolute paths scrubbed.
	| 'portable'
	// DM-only backup: includes hidden content, but STILL scrubs device-local secrets + absolute paths.
	| 'dm-backup';

export const CONTENT_EXPORT_MODES: readonly ContentExportMode[] = ['portable', 'dm-backup'] as const;

/** One exported file: a stable relative path + the serialized, redacted markdown text. */
export interface ExportedFile {
	path: string;
	/** Portable markdown (front matter + body), with secrets/absolute-paths already scrubbed. */
	markdown: string;
}

/** A reviewer-facing note about an item that was transformed or omitted during export. */
export interface ExportValidationNote {
	itemId: string;
	title: string;
	severity: 'info' | 'warning';
	message: string;
}

/** The validation report accompanying every export (CONTENT-008 AC2). */
export interface ExportValidationReport {
	mode: ContentExportMode;
	/** Total items in the vault considered for export. */
	totalItems: number;
	/** Items actually written to the export. */
	exportedItems: number;
	/** Items OMITTED because the portable visibility filter hid them (dm-only/undelivered shared). */
	omittedForVisibility: number;
	/** Items whose serialized output had secrets/paths redacted. */
	redactedItems: number;
	notes: ExportValidationNote[];
	/** Fail-closed self-check: true ⇒ NO exported file still contains a secret or absolute path. */
	clean: boolean;
}

/** The full export result: the portable markdown files + the validation report. */
export interface ContentExport {
	mode: ContentExportMode;
	files: ExportedFile[];
	report: ExportValidationReport;
}

/** A stable, filesystem-independent export path for an item. */
function exportPathForItem(item: ContentItem): string {
	const stem = item.title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${stem === '' ? item.id : stem}.md`;
}

/**
 * Build the front-matter property map for an exported item. User properties (the item's open `fields`)
 * are preserved; aliases/tags are emitted as Obsidian lists; the DND Tools visibility is re-emitted
 * NAMESPACED under `dndtools.visibility` so a round-trip preserves it without polluting common
 * properties. ABSOLUTE PATHS / secrets are NOT special-cased here — `redactValue` scrubs the whole map.
 */
function exportPropertiesFor(item: ContentItem): Record<string, string | string[]> {
	const properties: Record<string, string | string[]> = {};
	properties['title'] = item.title;
	for (const [key, value] of Object.entries(item.fields)) {
		// `aliases`/`tags`/`wikilinks` are surfaced explicitly below; skip the raw copies to avoid dupes.
		if (key === 'aliases' || key === 'tags' || key === 'wikilinks') continue;
		if (typeof value === 'string') properties[key] = value;
		else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
			properties[key] = value as string[];
		}
		// Non-string/non-string[] field values are not portable markdown front matter; they are dropped
		// and reported in the validation notes by the caller.
	}
	const aliases = item.fields['aliases'];
	if (Array.isArray(aliases) && aliases.length > 0) {
		properties['aliases'] = (aliases as unknown[]).map(String);
	}
	const tags = item.fields['tags'];
	if (Array.isArray(tags) && tags.length > 0) {
		properties['tags'] = (tags as unknown[]).map(String);
	}
	// Re-emit the DND Tools visibility NAMESPACED so it never collides with a user property.
	properties[`${DNDTOOLS_PROPERTY_NAMESPACE}.visibility`] = item.visibility;
	return properties;
}

/** Redact a property map fail-closed: secret-named keys and absolute paths/secrets in values. Pure. */
function redactProperties(
	properties: Record<string, string | string[]>,
): { redacted: Record<string, string | string[]>; changed: boolean } {
	const redacted = redactValue(properties, false) as Record<string, string | string[]>;
	const changed = containsSensitiveData(properties);
	return { redacted, changed };
}

/** Serialize one item to a portable, redacted markdown file. Pure. */
function exportItem(item: ContentItem): { file: ExportedFile; redacted: boolean } {
	const { redacted, changed: propsChanged } = redactProperties(exportPropertiesFor(item));
	const redactedBody = redactValue(item.body, false) as string;
	const bodyChanged = item.body !== redactedBody;
	const markdown = serializeMarkdownNote(redacted, redactedBody);
	return { file: { path: exportPathForItem(item), markdown }, redacted: propsChanged || bodyChanged };
}

/**
 * The items eligible for export under a mode. `portable` runs the actor-filtered content query AS the
 * given player actor, so only visible items survive (dm-only/undelivered-shared are omitted). `dm-backup`
 * exports every item directly from state. Returns the chosen items plus the visibility-omitted count.
 */
function selectExportItems(
	state: VaultContentState,
	permissions: PermissionState,
	mode: ContentExportMode,
	portableViewerActorId: string,
): { items: ContentItem[]; omittedForVisibility: number } {
	// CONTENT-001: soft-deleted (tombstoned) items are never exported in either mode — a deleted note is
	// not part of the vault's content until it is restored.
	const all = Object.values(state.items)
		.filter((item) => item.deletedAt === null)
		.sort((a, b) => a.id.localeCompare(b.id));
	if (mode === 'dm-backup') {
		return { items: all, omittedForVisibility: 0 };
	}
	// Portable: the filtered query returns ONLY the items the player may see. We re-key those view ids
	// back to the durable items so we export the canonical body/fields (still only the visible ones).
	const visibleViews = getContentItemsForActor(state, permissions, portableViewerActorId);
	const visibleIds = new Set(visibleViews.map((view) => view.id));
	const items = all.filter((item) => visibleIds.has(item.id));
	return { items, omittedForVisibility: all.length - items.length };
}

export interface ExportContentInput {
	mode: ContentExportMode;
	/**
	 * The actor whose visibility the PORTABLE filter is evaluated against — a representative PLAYER, so
	 * the export contains exactly what a player could see. Ignored in `dm-backup` mode. Fail-closed:
	 * when this actor is missing/unknown the portable filter returns nothing (no leak).
	 */
	portableViewerActorId: string;
}

/**
 * CONTENT-008 — export the vault content as portable markdown + a validation report (pure). Default
 * (`portable`) composes the visibility filter (no dm-only/hidden) AND redaction (no secrets/paths).
 * `dm-backup` includes hidden content but STILL scrubs secrets/paths. The `clean` self-check fails the
 * report closed if any serialized file would still contain a secret or absolute path.
 */
export function exportContent(
	state: VaultContentState,
	permissions: PermissionState,
	input: ExportContentInput,
): ContentExport {
	// CONTENT-001: tombstoned items are not part of the exportable vault total.
	const all = Object.values(state.items).filter((item) => item.deletedAt === null);
	const { items, omittedForVisibility } = selectExportItems(
		state,
		permissions,
		input.mode,
		input.portableViewerActorId,
	);

	const files: ExportedFile[] = [];
	const notes: ExportValidationNote[] = [];
	let redactedItems = 0;

	for (const item of items) {
		const { file, redacted } = exportItem(item);
		files.push(file);
		if (redacted) {
			redactedItems += 1;
			notes.push({
				itemId: item.id,
				title: item.title,
				severity: 'warning',
				message: 'Device-local secrets and/or absolute paths were redacted from this item.',
			});
		}
		// Report any non-portable (non-string) field values that were dropped from front matter.
		const droppedKeys = Object.entries(item.fields)
			.filter(([key]) => key !== 'aliases' && key !== 'tags' && key !== 'wikilinks')
			.filter(([, value]) => !isPortableValue(value))
			.map(([key]) => key);
		if (droppedKeys.length > 0) {
			notes.push({
				itemId: item.id,
				title: item.title,
				severity: 'info',
				message: `Non-portable field value(s) omitted from front matter: ${droppedKeys.sort().join(', ')}.`,
			});
		}
	}

	if (input.mode === 'portable' && omittedForVisibility > 0) {
		notes.push({
			itemId: '(portable-filter)',
			title: 'Portable visibility filter',
			severity: 'info',
			message: `${omittedForVisibility} hidden item(s) were omitted from the portable export.`,
		});
	}

	// Fail-closed self-check: a clean export proves NO serialized file still leaks a secret or path.
	const clean = files.every((file) => !containsSensitiveData(file.markdown));

	return {
		mode: input.mode,
		files,
		report: {
			mode: input.mode,
			totalItems: all.length,
			exportedItems: files.length,
			omittedForVisibility,
			redactedItems,
			notes,
			clean,
		},
	};
}

/** True when a field value is representable as portable markdown front matter (string or string[]). */
function isPortableValue(value: unknown): boolean {
	return (
		typeof value === 'string' ||
		(Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
	);
}

export type { Actor };
