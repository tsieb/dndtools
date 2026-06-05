import type { ActorId } from './ids';
import type { ContentItem, VaultContentState } from './content';
import { CONTENT_ITEM_ENTITY_TYPE } from './content';
import { parseMarkdownNote, type ParsedMarkdownNote } from './markdown';
import { normalizeVisibilityLevel, type VisibilityLevel } from '../permissions/visibility-filter';

/**
 * CONTENT-007 — TRANSACTIONAL import of local MARKDOWN archives and OBSIDIAN vault content.
 *
 * This is the same write-ahead / staged-then-commit discipline the MAP-020 import (`state/map-import.ts`)
 * and the migration recovery (`migration/write-ahead.ts`) use, expressed as PURE reducers:
 *
 *  1. PARSE (pure, deterministic). Each archive file's text is parsed once by `parseMarkdownNote`,
 *     preserving FRONTMATTER PROPERTIES, ALIASES, TAGS, and `[[wikilinks]]` (Architecture Contract 2
 *     Obsidian rules). DND Tools metadata stays NAMESPACED under `dndtools.*`; we never pollute a user's
 *     common properties, and we read visibility only from `dndtools.visibility` (fail-closed default).
 *
 *  2. PREVIEW (pure, READ-ONLY). Before any write the DM sees, per file: the resolved title, whether it
 *     COLLIDES with an existing item, the unsupported/preserved metadata, and the action the selected
 *     CONFLICT POLICY would take (`create` / `skip` / `overwrite` / `keep-both`). Nothing is mutated.
 *
 *  3. RESUMABLE PROGRESS (durable). The import runs as a PLAN of ordered, idempotent STEPS. Each applied
 *     step is recorded by its stable `entryId`; a resumed import re-derives the plan and SKIPS every
 *     already-applied step, so an interrupted import never double-writes (CONTENT-007 AC2).
 *
 *  4. STAGED COMMIT (pure, transactional). Applying the plan returns a NEW `VaultContentState`; a caller
 *     that discards it (cancel/reject) leaves the prior state byte-identical — NO partial commit.
 *
 * Pure data + pure functions. No GUI, no storage, no real filesystem (ADR-014: operate on provided text
 * content). The command layer composes these and appends durable ops.
 */

export const CONTENT_IMPORT_SCHEMA_VERSION = 1 as const;

/** The DND Tools frontmatter namespace. User properties are NEVER written under a non-namespaced key. */
export const DNDTOOLS_PROPERTY_NAMESPACE = 'dndtools' as const;

/** How a colliding file (one whose stable id already exists in the vault) is resolved. */
export type ImportConflictPolicy =
	// Leave the existing item untouched; the incoming file is reported as skipped.
	| 'skip'
	// Replace the existing item's content with the incoming file (bumps the existing item's revision).
	| 'overwrite'
	// Import the incoming file under a fresh, de-duplicated id, keeping BOTH copies.
	| 'keep-both';

export const IMPORT_CONFLICT_POLICIES: readonly ImportConflictPolicy[] = [
	'skip',
	'overwrite',
	'keep-both',
] as const;

/** The kind of archive being imported. Both parse with the same Obsidian-aware markdown parser. */
export type ImportSourceKind = 'markdown-archive' | 'obsidian-vault';

/** One file in an import archive: a stable relative path + its raw markdown text. */
export interface ImportArchiveFile {
	/** Relative path within the archive (e.g. `lore/Highmoor.md`). The id is derived from this. */
	path: string;
	/** The raw file text (front matter + body). Parsed deterministically; never executed. */
	text: string;
}

/** The action the selected conflict policy resolves a file to, surfaced in the preview. */
export type ImportFileAction = 'create' | 'skip' | 'overwrite' | 'keep-both';

/** One preview row: the resolved item, whether it collides, and what will happen. Read-only. */
export interface ImportPreviewEntry {
	/** Stable per-file step id (derived from the path) — also the resumable-progress key. */
	entryId: string;
	sourcePath: string;
	/** The resolved title (frontmatter `title` ⇒ first `# heading` ⇒ filename). */
	title: string;
	/** The vault item id this file targets BEFORE conflict resolution. */
	targetItemId: string;
	/** True when `targetItemId` already exists in the vault (a collision). */
	collides: boolean;
	action: ImportFileAction;
	/** Preserved Obsidian metadata, for reviewer-visible reassurance (never raw secret values). */
	preserved: { properties: number; aliases: number; tags: number; wikilinks: number };
	/** Frontmatter keys this importer does not interpret but PRESERVES verbatim (reported, not lost). */
	unsupportedProperties: string[];
}

/** The full read-only preview of an import under a chosen conflict policy. */
export interface ImportPreview {
	sourceKind: ImportSourceKind;
	policy: ImportConflictPolicy;
	entries: ImportPreviewEntry[];
	/** Aggregate counts so the DM can judge the import at a glance. */
	summary: {
		total: number;
		create: number;
		skip: number;
		overwrite: number;
		keepBoth: number;
		collisions: number;
	};
}

/** Frontmatter keys this importer interprets directly (everything else is preserved as a property). */
const INTERPRETED_KEYS: ReadonlySet<string> = new Set(['title', 'aliases', 'tags']);

/** Derive a stable, filesystem-independent item id from an archive-relative path. */
export function importItemIdForPath(path: string): string {
	const slug = path
		.replace(/\.m(d|arkdown)$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `content-import-${slug === '' ? 'untitled' : slug}`;
}

/** The stable resumable-progress step id for a file (one per source path). */
export function importEntryIdForPath(path: string): string {
	return `import-step-${importItemIdForPath(path).slice('content-import-'.length)}`;
}

/** Resolve the display title: frontmatter `title` ⇒ first `# heading` ⇒ filename stem. */
function resolveTitle(parsed: ParsedMarkdownNote, path: string): string {
	const titleProp = parsed.properties['title'];
	if (typeof titleProp === 'string' && titleProp.trim() !== '') return titleProp.trim();
	const heading = /^#\s+(.+)$/m.exec(parsed.body);
	if (heading) return heading[1]!.trim();
	const stem = path.split('/').pop() ?? path;
	return stem.replace(/\.m(d|arkdown)$/i, '');
}

/** Read the fail-closed per-item visibility from namespaced `dndtools.visibility` (default dm-only). */
function resolveVisibility(parsed: ParsedMarkdownNote): VisibilityLevel {
	const namespaced = parsed.properties[`${DNDTOOLS_PROPERTY_NAMESPACE}.visibility`];
	const flat = (parsed.properties[DNDTOOLS_PROPERTY_NAMESPACE] as unknown) as
		| Record<string, unknown>
		| undefined;
	const raw =
		typeof namespaced === 'string'
			? namespaced
			: flat && typeof flat === 'object'
				? (flat['visibility'] as unknown)
				: undefined;
	return normalizeVisibilityLevel(raw);
}

/** The structured, parsed form of one file plus its derived ids/metadata. Internal to import. */
interface ResolvedImportFile {
	entryId: string;
	sourcePath: string;
	itemId: string;
	title: string;
	parsed: ParsedMarkdownNote;
	visibility: VisibilityLevel;
	unsupportedProperties: string[];
}

/** Parse + resolve a single archive file deterministically. Pure. */
function resolveFile(file: ImportArchiveFile): ResolvedImportFile {
	const parsed = parseMarkdownNote(file.text);
	const unsupportedProperties = Object.keys(parsed.properties)
		.filter((key) => !INTERPRETED_KEYS.has(key) && !key.startsWith(`${DNDTOOLS_PROPERTY_NAMESPACE}.`))
		.filter((key) => key !== DNDTOOLS_PROPERTY_NAMESPACE)
		.sort();
	return {
		entryId: importEntryIdForPath(file.path),
		sourcePath: file.path,
		itemId: importItemIdForPath(file.path),
		title: resolveTitle(parsed, file.path),
		parsed,
		visibility: resolveVisibility(parsed),
		unsupportedProperties,
	};
}

/** The conflict-policy action a colliding/non-colliding file resolves to. Pure. */
function actionFor(collides: boolean, policy: ImportConflictPolicy): ImportFileAction {
	if (!collides) return 'create';
	return policy;
}

/**
 * CONTENT-007 — PREVIEW an import without mutating anything (pure, read-only). It parses every file,
 * detects collisions against the existing vault, resolves each file's action under the chosen policy,
 * and reports the preserved/unsupported metadata. Nothing is written; a caller may discard the preview
 * with no effect.
 */
export function previewContentImport(
	state: VaultContentState,
	files: readonly ImportArchiveFile[],
	sourceKind: ImportSourceKind,
	policy: ImportConflictPolicy,
): ImportPreview {
	const entries: ImportPreviewEntry[] = [];
	const summary = { total: 0, create: 0, skip: 0, overwrite: 0, keepBoth: 0, collisions: 0 };
	// Files are processed in sorted path order so the preview (and the derived plan) are deterministic.
	const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
	for (const file of ordered) {
		const resolved = resolveFile(file);
		const collides = resolved.itemId in state.items;
		const action = actionFor(collides, policy);
		entries.push({
			entryId: resolved.entryId,
			sourcePath: resolved.sourcePath,
			title: resolved.title,
			targetItemId: resolved.itemId,
			collides,
			action,
			preserved: {
				properties: Object.keys(resolved.parsed.properties).length,
				aliases: resolved.parsed.aliases.length,
				tags: resolved.parsed.tags.length,
				wikilinks: resolved.parsed.wikilinks.length,
			},
			unsupportedProperties: resolved.unsupportedProperties,
		});
		summary.total += 1;
		if (collides) summary.collisions += 1;
		if (action === 'create') summary.create += 1;
		else if (action === 'skip') summary.skip += 1;
		else if (action === 'overwrite') summary.overwrite += 1;
		else summary.keepBoth += 1;
	}
	return { sourceKind, policy, entries, summary };
}

/** One concrete, idempotent step in the import plan: write one item under a resolved id. */
export interface ImportPlanStep {
	/** Stable resumable-progress key (matches the preview entry). */
	entryId: string;
	sourcePath: string;
	/** Whether this step CREATES a fresh item or OVERWRITES an existing one. */
	mode: 'create' | 'overwrite';
	/** The final item id the step writes (a keep-both step uses a de-duplicated id). */
	itemId: string;
	resolved: ResolvedImportFile;
}

/** The ordered, deterministic plan derived from a preview (skipped files produce no step). */
export interface ImportPlan {
	sourceKind: ImportSourceKind;
	policy: ImportConflictPolicy;
	steps: ImportPlanStep[];
	/** Source paths reported as skipped (collision under `skip` policy) — for the audit. */
	skippedPaths: string[];
}

/** A fresh, vault-unique id for a keep-both import (suffixes `-2`, `-3`, … until free). */
function uniqueKeepBothId(baseId: string, taken: ReadonlySet<string>): string {
	let suffix = 2;
	let candidate = `${baseId}-${suffix}`;
	while (taken.has(candidate)) {
		suffix += 1;
		candidate = `${baseId}-${suffix}`;
	}
	return candidate;
}

/**
 * CONTENT-007 — derive the deterministic, ordered import PLAN from the files + policy. This is pure and
 * is the SAME derivation a resume re-runs, so a resumed import lands on identical step ids. `skip`
 * collisions yield no step (and are reported); `keep-both` collisions get a fresh unique id.
 */
export function planContentImport(
	state: VaultContentState,
	files: readonly ImportArchiveFile[],
	sourceKind: ImportSourceKind,
	policy: ImportConflictPolicy,
): ImportPlan {
	const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
	const steps: ImportPlanStep[] = [];
	const skippedPaths: string[] = [];
	// Ids that will be occupied as the plan runs, so keep-both ids dedupe against BOTH the existing
	// vault and earlier keep-both steps in the same plan (deterministic).
	const taken = new Set<string>(Object.keys(state.items));
	for (const file of ordered) {
		const resolved = resolveFile(file);
		const collides = resolved.itemId in state.items;
		if (collides && policy === 'skip') {
			skippedPaths.push(resolved.sourcePath);
			continue;
		}
		let itemId = resolved.itemId;
		let mode: 'create' | 'overwrite' = 'create';
		if (collides && policy === 'overwrite') {
			mode = 'overwrite';
		} else if (collides && policy === 'keep-both') {
			itemId = uniqueKeepBothId(resolved.itemId, taken);
		}
		taken.add(itemId);
		steps.push({ entryId: resolved.entryId, sourcePath: resolved.sourcePath, mode, itemId, resolved });
	}
	return { sourceKind, policy, steps, skippedPaths };
}

/** Build the durable content item a plan step writes, preserving all parsed Obsidian metadata. Pure. */
function buildImportedItem(
	step: ImportPlanStep,
	existing: ContentItem | undefined,
	authorActorId: ActorId,
	now: string,
): ContentItem {
	const { resolved } = step;
	// Preserve EVERY user property verbatim; strip only the keys we interpret directly so they are not
	// duplicated. DND Tools metadata (namespaced) is preserved as-is. Aliases/tags become first-class.
	const fields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(resolved.parsed.properties)) {
		if (!INTERPRETED_KEYS.has(key)) fields[key] = value;
	}
	fields['aliases'] = [...resolved.parsed.aliases];
	fields['tags'] = [...resolved.parsed.tags];
	fields['wikilinks'] = resolved.parsed.wikilinks.map((link) => link.raw);
	fields['sourcePath'] = resolved.sourcePath;
	return {
		id: step.itemId,
		kind: 'note',
		title: resolved.title,
		body: resolved.parsed.body,
		fields,
		dateFields: existing && step.mode === 'overwrite' ? existing.dateFields : {},
		timelineRefs: existing && step.mode === 'overwrite' ? existing.timelineRefs : [],
		// Visibility FAILS CLOSED to dm-only unless the file's namespaced dndtools.visibility says otherwise.
		visibility: resolved.visibility,
		sharedWith: [],
		authorActorId,
		createdAt: existing && step.mode === 'overwrite' ? existing.createdAt : now,
		updatedAt: now,
		revision: existing && step.mode === 'overwrite' ? existing.revision + 1 : 1,
	};
}

/** The applied result of running an import plan against state: the new state + what was applied. */
export interface AppliedImport {
	nextState: VaultContentState;
	/** Step ids actually applied in THIS run (newly written). */
	appliedEntryIds: string[];
	/** Step ids skipped because resumable progress already recorded them (CONTENT-007 AC2). */
	resumedSkippedEntryIds: string[];
	/** Item ids created in this run. */
	createdItemIds: string[];
	/** Item ids overwritten in this run. */
	overwrittenItemIds: string[];
}

/**
 * CONTENT-007 — APPLY an import plan to a candidate `VaultContentState`. Pure and transactional:
 *
 *  - The input state is NEVER mutated; a new state is returned. A caller that discards the result (a
 *    cancelled/rejected import) leaves the prior state byte-identical — there is NO partial commit.
 *  - RESUMABLE: every step whose `entryId` is in `alreadyAppliedEntryIds` is SKIPPED (its item is not
 *    re-written), so re-running after an interruption never duplicates a completed safe write (AC2).
 *
 * The op-log append is the command layer's job; this returns the state + the applied/skipped step ids.
 */
export function applyContentImport(
	state: VaultContentState,
	plan: ImportPlan,
	authorActorId: ActorId,
	now: string,
	alreadyAppliedEntryIds: readonly string[] = [],
): AppliedImport {
	const applied = new Set(alreadyAppliedEntryIds);
	const items = { ...state.items };
	const appliedEntryIds: string[] = [];
	const resumedSkippedEntryIds: string[] = [];
	const createdItemIds: string[] = [];
	const overwrittenItemIds: string[] = [];

	for (const step of plan.steps) {
		if (applied.has(step.entryId)) {
			resumedSkippedEntryIds.push(step.entryId);
			continue;
		}
		const existing = items[step.itemId];
		items[step.itemId] = buildImportedItem(step, existing, authorActorId, now);
		appliedEntryIds.push(step.entryId);
		if (step.mode === 'overwrite') overwrittenItemIds.push(step.itemId);
		else createdItemIds.push(step.itemId);
	}

	return {
		nextState: { ...state, items },
		appliedEntryIds,
		resumedSkippedEntryIds,
		createdItemIds,
		overwrittenItemIds,
	};
}

export const CONTENT_IMPORT_ITEM_ENTITY_TYPE = CONTENT_ITEM_ENTITY_TYPE;
