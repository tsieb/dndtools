import type { SyncOperation } from './operation-log';
import {
	type AdapterTransformContext,
	type ExternalMutation,
	type SourceAdapterCapability,
	type SyncSourceAdapter,
	type SyncSourceLifecycleState,
	buildCanonicalOperation,
} from './source-adapters';
import type { PlatformProfileId } from '../state/widget-package-state';
import {
	type FakeVaultTransport,
	readVaultFile,
	writeVaultFile,
} from './source-transport';
import {
	parseMarkdownNote,
	serializeMarkdownNote,
	type ParsedMarkdownNote,
} from '../state/markdown';
import { DNDTOOLS_PROPERTY_NAMESPACE } from '../state/content-import';
import { CONTENT_ITEM_ENTITY_TYPE } from '../state/content';
import type { ContentNoteFeature } from '../state/content-constraints';

/**
 * SYNC-004 / SYNC-012 — the OBSIDIAN sync adapter LOGIC.
 *
 * It reuses `markdown.ts` (the Obsidian-aware parse/serialize keystone) — it does NOT re-implement the
 * transform — and proves a parse → canonical → serialize ROUND-TRIP preserves every user structure the
 * Obsidian source rules name: YAML PROPERTIES, TAGS, ALIASES, INTERNAL `[[links]]`, MARKDOWN links,
 * HEADINGS, and USER-AUTHORED frontmatter. Lamplight metadata is NAMESPACED under `dndtools.*` so it
 * NEVER collides with a user's common properties (Contract 2 Obsidian rules).
 *
 * Per ADR-014 the live Obsidian vault transport is deferred; the adapter is exercised over the
 * in-memory `FakeVaultTransport`. The adapter is pure: deterministic over (file text, transform
 * context). It emits canonical {@link SyncOperation}s only — no new command/reducer — so it plugs in
 * without any core-contract change (SYNC-003).
 */

export const OBSIDIAN_SOURCE_KIND = 'obsidian-vault' as const;

/**
 * SYNC-015 — the Obsidian adapter's declared CAPABILITY metadata. Obsidian is the superset source:
 * frontmatter properties, aliases, tags, inline tags, AND resolved `[[wikilinks]]` are all `supported`
 * (it round-trips everything `markdown.ts` detects), Lamplight metadata stays namespaced, and it is
 * fully offline-capable for a local vault.
 */
export const OBSIDIAN_ADAPTER_CAPABILITY: SourceAdapterCapability = Object.freeze({
	kind: OBSIDIAN_SOURCE_KIND,
	displayName: 'Obsidian vault',
	summary:
		'Obsidian vault markdown. Frontmatter properties, aliases, tags, inline #tags, [[wikilinks]], markdown links, and headings round-trip; Lamplight metadata stays namespaced under dndtools.*.',
	supportedSchemaVersions: Object.freeze([1]),
	// The Obsidian properties/links model this adapter understands. A bare-markdown vault is `0`.
	supportedSourceVersions: Object.freeze(['0', '1']),
	supportedAuthModes: Object.freeze(['none']),
	supportedEntityTypes: Object.freeze([CONTENT_ITEM_ENTITY_TYPE]),
	canRead: true,
	canWrite: true,
	canRename: false,
	canDelete: true,
	canExposeRevisionHistory: false,
	canWatchChanges: true,
	offlineAvailability: 'full',
	// Obsidian is a local vault on desktop; web profile is the deferred ADR-014 target.
	// The mobile profile may be inaccessible at runtime (see `deriveObsidianVaultStatus`).
	supportedPlatformProfiles: Object.freeze(['desktop', 'web'] as PlatformProfileId[]),
	featureSupport: Object.freeze({
		'frontmatter-properties': 'supported',
		aliases: 'supported',
		tags: 'supported',
		'inline-tags': 'supported',
		wikilinks: 'supported',
		'dndtools-namespaced-metadata': 'supported',
	}),
});

/** The Lamplight namespace prefix (`dndtools.`) reused from the import layer. */
const DNDTOOLS_PREFIX = `${DNDTOOLS_PROPERTY_NAMESPACE}.`;

/** A markdown-link `[text](target)` (distinct from an Obsidian `[[wikilink]]`). */
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;
/** An ATX heading line `## Heading`. */
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/gm;

/** A parsed markdown link extracted from a body (preserved on round-trip). */
export interface ParsedMarkdownLink {
	text: string;
	target: string;
	raw: string;
}

/** A parsed heading (level + text) extracted from a body (preserved on round-trip). */
export interface ParsedHeading {
	level: number;
	text: string;
}

/** Extract `[text](target)` markdown links from a body, in document order. Pure. */
export function extractMarkdownLinks(body: string): ParsedMarkdownLink[] {
	const links: ParsedMarkdownLink[] = [];
	for (const match of body.matchAll(MARKDOWN_LINK_PATTERN)) {
		links.push({ text: match[1] ?? '', target: match[2] ?? '', raw: match[0] });
	}
	return links;
}

/** Extract ATX headings from a body, in document order. Pure. */
export function extractHeadings(body: string): ParsedHeading[] {
	const headings: ParsedHeading[] = [];
	for (const match of body.matchAll(HEADING_PATTERN)) {
		headings.push({ level: match[1]!.length, text: match[2]!.trim() });
	}
	return headings;
}

/**
 * The CANONICAL note value an Obsidian file maps to. It separates the USER frontmatter (preserved
 * verbatim) from the Lamplight NAMESPACED metadata so the two can never collide, and surfaces the
 * Obsidian structures (`aliases`/`tags`/`wikilinks`/`markdownLinks`/`headings`) as first-class fields.
 * This is what crosses the boundary as the op `value`; it carries everything needed to re-serialize.
 */
export interface ObsidianCanonicalNote {
	/** The note body (front matter removed), preserved verbatim. */
	body: string;
	/** USER frontmatter properties ONLY — never the interpreted aliases/tags or the dndtools.* namespace. */
	userProperties: Record<string, string | string[]>;
	/** Lamplight namespaced metadata (`dndtools.*` flattened keys), isolated from user properties. */
	dndtoolsMetadata: Record<string, string | string[]>;
	aliases: string[];
	tags: string[];
	/** Obsidian `[[wikilinks]]` raw forms, preserved for round-trip. */
	wikilinks: string[];
	markdownLinks: ParsedMarkdownLink[];
	headings: ParsedHeading[];
}

/** Front-matter keys `markdown.ts` surfaces as first-class fields (not raw "user properties"). */
const INTERPRETED_PROPERTY_KEYS: ReadonlySet<string> = new Set(['aliases', 'tags']);

/**
 * SYNC-004 — PARSE one Obsidian file's text into the canonical note value, REUSING `markdown.ts`. User
 * frontmatter is preserved verbatim; the `dndtools.*` namespace is split out so it can never overwrite a
 * user property; aliases/tags/wikilinks/markdown-links/headings are surfaced as first-class structures.
 * Pure + deterministic.
 */
export function obsidianFileToCanonicalNote(text: string): ObsidianCanonicalNote {
	const parsed: ParsedMarkdownNote = parseMarkdownNote(text);
	const userProperties: Record<string, string | string[]> = {};
	const dndtoolsMetadata: Record<string, string | string[]> = {};
	for (const [key, value] of Object.entries(parsed.properties)) {
		if (key === DNDTOOLS_PROPERTY_NAMESPACE || key.startsWith(DNDTOOLS_PREFIX)) {
			dndtoolsMetadata[key] = value;
			continue;
		}
		if (INTERPRETED_PROPERTY_KEYS.has(key)) continue;
		userProperties[key] = value;
	}
	return {
		body: parsed.body,
		userProperties,
		dndtoolsMetadata,
		aliases: [...parsed.aliases],
		tags: [...parsed.tags],
		wikilinks: parsed.wikilinks.map((link) => link.raw),
		markdownLinks: extractMarkdownLinks(parsed.body),
		headings: extractHeadings(parsed.body),
	};
}

/**
 * SYNC-004 — SERIALIZE a canonical note back to Obsidian file text, REUSING `markdown.ts`. It
 * reconstitutes the front-matter map from user properties + interpreted aliases/tags + the dndtools.*
 * namespace, then serializes deterministically. Body (and therefore headings, markdown links, and
 * wikilinks, which live IN the body) is preserved verbatim, so a parse → serialize → parse round-trip
 * is stable. Pure.
 */
export function canonicalNoteToObsidianFile(note: ObsidianCanonicalNote): string {
	const properties: Record<string, string | string[]> = { ...note.userProperties };
	if (note.aliases.length > 0) properties['aliases'] = [...note.aliases];
	if (note.tags.length > 0) properties['tags'] = [...note.tags];
	for (const [key, value] of Object.entries(note.dndtoolsMetadata)) {
		properties[key] = value;
	}
	return serializeMarkdownNote(properties, note.body);
}

/** A stable, filesystem-independent entity id derived from a vault-relative path (matches import ids). */
export function obsidianEntityIdForPath(path: string): string {
	const slug = path
		.replace(/\.m(d|arkdown)$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `obsidian-${slug === '' ? 'untitled' : slug}`;
}

/** A deterministic op id from the source/entity/issue-time (no entropy — replayable + idempotent). */
function obsidianOperationId(sourceId: string, entityId: string, issuedAt: string): string {
	return `op-obsidian-${sourceId}-${entityId}-${issuedAt}`;
}

/** Which note features are PRESENT in a canonical note (for the fail-closed transform gate). */
export function obsidianPresentFeatures(note: ObsidianCanonicalNote): ContentNoteFeature[] {
	const features: ContentNoteFeature[] = [];
	if (Object.keys(note.userProperties).length > 0) features.push('frontmatter-properties');
	if (note.aliases.length > 0) features.push('aliases');
	if (note.tags.length > 0) features.push('tags');
	if (note.wikilinks.length > 0) features.push('wikilinks');
	if (Object.keys(note.dndtoolsMetadata).length > 0) features.push('dndtools-namespaced-metadata');
	return features;
}

/**
 * The OBSIDIAN adapter instance, bound to a source id + the injected fake vault transport. Reading and
 * writing flow through the transport only; the transforms are pure. A real Obsidian transport later
 * implements `FakeVaultTransport`'s shape with no adapter change.
 */
export function createObsidianAdapter(
	sourceId: string,
): SyncSourceAdapter<{ path: string; text: string }> {
	return {
		sourceId,
		kind: OBSIDIAN_SOURCE_KIND,
		capabilities: () => OBSIDIAN_ADAPTER_CAPABILITY,
		toCanonical(entity, context: AdapterTransformContext): SyncOperation[] {
			const note = obsidianFileToCanonicalNote(entity.text);
			const entityId = obsidianEntityIdForPath(entity.path);
			return [
				buildCanonicalOperation({
					id: obsidianOperationId(sourceId, entityId, context.issuedAt),
					vaultId: context.vaultId,
					sourceId,
					actorId: context.actorId,
					entityType: CONTENT_ITEM_ENTITY_TYPE,
					entityId,
					opType: 'content.import-from-obsidian',
					path: `content/items/${entityId}`,
					value: { sourcePath: entity.path, note },
					...(context.dependencies ? { dependencies: context.dependencies } : {}),
					issuedAt: context.issuedAt,
				}),
			];
		},
		fromCanonical(operation: SyncOperation): ExternalMutation<{ path: string; text: string }>[] {
			const value = (operation.value ?? {}) as {
				sourcePath?: unknown;
				note?: ObsidianCanonicalNote;
			};
			const path = typeof value.sourcePath === 'string' ? value.sourcePath : `${operation.entityId}.md`;
			if (operation.opType.endsWith('delete')) {
				return [{ op: 'delete', externalId: path }];
			}
			const note = value.note;
			if (!note) return [];
			return [{ op: 'write', externalId: path, entity: { path, text: canonicalNoteToObsidianFile(note) } }];
		},
	};
}

/** Input for deriving the Obsidian vault directory accessibility status (SYNC-004 AC3). */
export interface ObsidianVaultAccessInput {
	/** Whether the vault directory is accessible on this device/profile. */
	vaultAccessible: boolean;
	/** Optional profile label for the status message (e.g. `'mobile-profile'`). */
	profileNote?: string;
}

/** Outcome of deriving Obsidian vault accessibility (SYNC-004 AC3). */
export interface ObsidianVaultAccessOutcome {
	/**
	 * `idle` when the directory is accessible on this profile;
	 * `unsupported` when it is not (e.g. a desktop vault path on mobile).
	 */
	state: Extract<SyncSourceLifecycleState, 'idle' | 'unsupported'>;
	/** Generic, non-leaking status message. Always notes cached content is readable when unavailable. */
	message: string;
	/** Always `true`: already-cached content is readable regardless of directory accessibility. */
	cachedContentReadable: boolean;
}

/**
 * SYNC-004 AC3 — Derive the Obsidian vault DIRECTORY ACCESSIBILITY status for a profile. A local vault
 * whose directory is not accessible on the current device profile (e.g. a desktop filesystem path on a
 * mobile profile) reports `unsupported` so the sync-status surface can surface "unavailable capability"
 * while explicitly confirming that already-cached content remains readable (local-first invariant).
 * Pure and deterministic over its input.
 */
export function deriveObsidianVaultStatus(
	input: ObsidianVaultAccessInput,
): ObsidianVaultAccessOutcome {
	if (!input.vaultAccessible) {
		const profile = input.profileNote ? ` (${input.profileNote})` : '';
		return {
			state: 'unsupported',
			message: `The Obsidian vault directory is not accessible on this profile${profile}. Cached content remains readable.`,
			cachedContentReadable: true,
		};
	}
	return {
		state: 'idle',
		message: 'The Obsidian vault directory is accessible.',
		cachedContentReadable: true,
	};
}

/**
 * SYNC-012 — PULL one Obsidian note from the transport into canonical ops. Reads the file, maps it to
 * canonical ops; the file content is never mutated.
 */
export function pullObsidianNote(
	adapter: SyncSourceAdapter<{ path: string; text: string }>,
	transport: FakeVaultTransport,
	path: string,
	context: AdapterTransformContext,
): SyncOperation[] {
	const text = readVaultFile(transport, path);
	if (text === null) return [];
	return adapter.toCanonical({ path, text }, context);
}

/**
 * SYNC-012 — PUSH a canonical op back to the Obsidian transport. Applies the adapter's external
 * mutation to a NEW transport (the input is never mutated — staged-commit discipline) and returns it.
 */
export function pushObsidianOperation(
	adapter: SyncSourceAdapter<{ path: string; text: string }>,
	transport: FakeVaultTransport,
	operation: SyncOperation,
): FakeVaultTransport {
	let next = transport;
	for (const mutation of adapter.fromCanonical(operation)) {
		if (mutation.op === 'write' && mutation.entity) {
			next = writeVaultFile(next, mutation.externalId, mutation.entity.text);
		}
	}
	return next;
}
