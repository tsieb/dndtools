import {
	commitContentImportInputSchema,
	exportContentInputSchema,
	writeContentToSourceInputSchema,
} from '../schemas/commands';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	contentItemById,
	isLiveContentItem,
	type ContentItem,
	type VaultContentState,
} from '../state/content';
import {
	applyContentImport,
	planContentImport,
	type ImportArchiveFile,
	type ImportConflictPolicy,
	type ImportSourceKind,
} from '../state/content-import';
import { exportContent, type ContentExport } from '../state/content-export';
import {
	checkContentSourceConstraints,
	contentSourceDescriptor,
	isContentWriteAcknowledged,
} from '../state/content-constraints';
import type { Actor } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, ensureContentStateSlice, parseInput, reject, requireActor } from './helpers';

/**
 * CONTENT-007 / CONTENT-008 — durable IMPORT (transactional, resumable) + EXPORT (read-only) commands.
 *
 * Both are VAULT-LEVEL authoring acts with no pre-existing entity to grant against, so they are DM-only
 * and FAIL CLOSED for anyone else (mirrors the calendar/create-item authority in `commands/content.ts`).
 *
 *  - `content.commit-import` (CONTENT-007). Re-derives the PURE plan (`planContentImport`) from the
 *    provided files + conflict policy and APPLIES it transactionally. RESUMABLE: the caller passes the
 *    `appliedEntryIds` already recorded by a prior partial run; every such step is SKIPPED, so an
 *    interrupted import never double-writes (AC2). On any rejection NOTHING is written — the prior state
 *    is byte-identical (no partial commit). One durable op per accepted commit records what applied,
 *    overwrote, and was skipped (reported for audit, never silently lost).
 *
 *  - `content.export` (CONTENT-008). PURE, read-only: it builds the portable-markdown export + validation
 *    report through the visibility filter (portable omits dm-only/hidden) and the redaction scrub (both
 *    modes strip secrets/absolute paths). It mutates NO durable state; the export payload is returned on
 *    the result event for the GUI to download. A durable op is still recorded as an audit of the export.
 *
 * The GUI dispatches these intents and renders the returned preview/report models; it never reaches
 * storage (Architecture Contract 1).
 */

function contentWith(state: CoreStateSlice, content: VaultContentState): CoreStateSlice {
	return { ...state, content };
}

/** Vault-level authoring (import/export): DM only. Fail closed otherwise. */
function actorMayAuthorVault(actor: Actor): boolean {
	return actor.role === 'dm';
}

// --- CONTENT-007 — commit a transactional, resumable import --------------------------------------

export function handleCommitContentImport(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(commitContentImportInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may import content.' },
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	const files: ImportArchiveFile[] = parsed.data.files.map((file) => ({
		path: file.path,
		text: file.text,
	}));
	const plan = planContentImport(
		content,
		files,
		parsed.data.sourceKind as ImportSourceKind,
		parsed.data.policy as ImportConflictPolicy,
	);

	const applied = applyContentImport(
		content,
		plan,
		actor.id,
		env.clock(),
		parsed.data.appliedEntryIds,
	);

	// Nothing imported and nothing resumed (an empty or wholly-skipped archive): reject so the DM is
	// never left with a silent no-op. The state is returned untouched (no partial commit).
	if (
		applied.appliedEntryIds.length === 0 &&
		applied.resumedSkippedEntryIds.length === 0 &&
		plan.steps.length === 0
	) {
		return reject(
			{
				code: 'invalid-state',
				message:
					plan.skippedPaths.length > 0
						? 'Every file collided and was skipped under the chosen conflict policy; nothing imported.'
						: 'The import archive contained no files; nothing to import.',
			},
			state,
		);
	}

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: 'content-import',
		opType: 'content.import',
		path: 'content/items',
		value: {
			sourceKind: parsed.data.sourceKind,
			policy: parsed.data.policy,
			created: applied.createdItemIds,
			overwritten: applied.overwrittenItemIds,
			// Reported, NEVER silently lost: which steps were skipped (resumed) and which files the
			// conflict policy skipped, so the import audit trail is complete.
			resumedSkipped: applied.resumedSkippedEntryIds,
			policySkippedPaths: plan.skippedPaths,
		},
	});

	const event: CoreEvent = {
		kind: 'content.import-committed',
		sourceKind: parsed.data.sourceKind as ImportSourceKind,
		policy: parsed.data.policy as ImportConflictPolicy,
		createdItemIds: applied.createdItemIds,
		overwrittenItemIds: applied.overwrittenItemIds,
		appliedEntryIds: applied.appliedEntryIds,
		resumedSkippedEntryIds: applied.resumedSkippedEntryIds,
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, applied.nextState), sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-008 — export portable markdown + validation report (read-only) ----------------------

export function handleExportContent(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(exportContentInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may export content.' },
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	const result: ContentExport = exportContent(content, state.permissions, {
		mode: parsed.data.mode,
		portableViewerActorId: parsed.data.portableViewerActorId,
	});

	// The export mutates NO durable content; we still append an audit op recording WHAT was exported (the
	// mode + counts), never the exported content itself.
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: 'content-export',
		opType: 'content.export',
		path: 'content/items',
		value: {
			mode: result.mode,
			exportedItems: result.report.exportedItems,
			omittedForVisibility: result.report.omittedForVisibility,
			redactedItems: result.report.redactedItems,
			clean: result.report.clean,
		},
	});

	const event: CoreEvent = {
		kind: 'content.exported',
		mode: result.mode,
		exportedItems: result.report.exportedItems,
		omittedForVisibility: result.report.omittedForVisibility,
		clean: result.report.clean,
		export: result,
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...state, sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-012 — acknowledged write-back to a target source (fail-closed lossy detection) -------

/**
 * CONTENT-012 — write a note's content back to a target SOURCE (local markdown / Obsidian / Google Docs)
 * after the pre-write CONSTRAINT CHECK. This is the FAIL-CLOSED enforcement seam: the Processing Core
 * re-runs the PURE check from the provided note text + source (a caller cannot bypass the gate by passing
 * a fabricated check), and REJECTS a lossy/destructive write unless the payload carries the matching
 * acknowledgment token. The local draft is NEVER mutated on rejection — the note text is the input, so a
 * rejected/unsupported write leaves the draft content intact (CONTENT-012 AC3). One durable op records
 * the source + exactly which features were dropped/downgraded, so a lossy write is AUDITED, never silently
 * lost. The transports themselves remain deferred per ADR-014; this records the acknowledged write intent.
 */
export function handleWriteContentToSource(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(writeContentToSourceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may write content to a source.' },
			state,
		);
	}

	// Fail closed on an unknown source (never a permissive default).
	if (contentSourceDescriptor(parsed.data.source) === null) {
		return reject(
			{
				code: 'content-source-unknown',
				message: `"${parsed.data.source}" is not a declared note source.`,
			},
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	const existing: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!existing) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!isLiveContentItem(existing)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this item before writing it to a source.' },
			state,
		);
	}

	// Recompute the constraint check fail-closed. A lossy write requires the matching acknowledgment
	// token; a missing/stale token rejects WITHOUT mutating durable state or the local draft.
	const check = checkContentSourceConstraints(parsed.data.noteText, parsed.data.source);
	if (
		!isContentWriteAcknowledged(
			parsed.data.noteText,
			parsed.data.source,
			parsed.data.acknowledgmentToken ?? null,
		)
	) {
		return reject(
			{
				code: 'content-write-loss-unacknowledged',
				message: `Writing to ${check.sourceDisplayName} would lose or downgrade ${
					check.droppedFeatures.length + check.lossyFeatures.length
				} note structure(s). Acknowledge the loss before writing.`,
			},
			state,
		);
	}

	// The acknowledged (or faithful) write is recorded as a durable op. The transport itself is deferred
	// per ADR-014; the op records the source + what was dropped/downgraded so the loss is audited.
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: existing.id,
		opType: 'content.write-to-source',
		path: `content/items/${existing.id}`,
		value: {
			source: parsed.data.source,
			lossy: check.lossy,
			lossyFeatures: [...check.lossyFeatures],
			droppedFeatures: [...check.droppedFeatures],
		},
	});

	const event: CoreEvent = {
		kind: 'content.written-to-source',
		itemId: existing.id,
		source: parsed.data.source,
		lossy: check.lossy,
		lossyFeatures: [...check.lossyFeatures],
		droppedFeatures: [...check.droppedFeatures],
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...state, sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}
