import { z } from 'zod';
import type { VaultContentState } from '../state/content';
import { CONTENT_ITEM_ENTITY_TYPE } from '../state/content';
import type { PermissionState } from '../state/permission-state';
import { getContentItemsForActor } from './content-query';
import { operationsForEntity, type OperationLog } from '../sync/operation-log';

const snapshotSchema = z.object({
	id: z.string(),
	kind: z.literal('note'),
	title: z.string(),
	body: z.string(),
	visibility: z.enum(['dm-only', 'player-visible', 'shared']),
	sharedWith: z.array(z.string()),
	deletedAt: z.string().nullable(),
	revision: z.number().int().nonnegative(),
});

export interface ContentRevisionView {
	revision: number;
	title: string;
	body: string;
	issuedAt: string;
	actorId: string;
	/** Lines replaced in the changed span, relative to the preceding accessible revision. */
	lineDelta: { added: number; removed: number };
}

function lineDelta(before: string, after: string): ContentRevisionView['lineDelta'] {
	const a = before ? before.split('\n') : [];
	const b = after ? after.split('\n') : [];
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let end = 0;
	while (
		end < a.length - start &&
		end < b.length - start &&
		a[a.length - 1 - end] === b[b.length - 1 - end]
	)
		end++;
	return { added: b.length - start - end, removed: a.length - start - end };
}

/** Newest first; caller supplies the clock so replay is deterministic. Legacy metadata-only ops
 * cannot reconstruct prose and are skipped. Never diff against text the actor cannot receive. */
export function getContentHistoryForActor(
	content: VaultContentState,
	permissions: PermissionState,
	log: OperationLog,
	actorId: string,
	itemId: string,
	now: string,
): ContentRevisionView[] {
	const current = content.items[itemId];
	if (
		!current ||
		current.kind !== 'note' ||
		!getContentItemsForActor({ ...content, items: { [itemId]: current } }, permissions, actorId)
			.length
	)
		return [];
	const cutoff = Date.parse(now) - 30 * 24 * 60 * 60 * 1000;
	if (!Number.isFinite(cutoff)) return [];
	const revisions = new Map<number, ContentRevisionView>();
	let previous = '';
	for (const op of operationsForEntity(log, CONTENT_ITEM_ENTITY_TYPE, itemId)) {
		const parsed = snapshotSchema.safeParse(
			(op.value as { snapshot?: unknown } | undefined)?.snapshot,
		);
		if (!parsed.success || parsed.data.id !== itemId || parsed.data.revision !== op.afterRevision)
			continue;
		const snapshot = parsed.data;
		const visible = getContentItemsForActor(
			{
				...content,
				items: {
					[itemId]: { ...current, ...snapshot },
				},
			},
			permissions,
			actorId,
		)[0];
		if (!visible) {
			previous = '';
			continue;
		}
		const delta = lineDelta(previous, visible.body);
		previous = visible.body;
		const time = Date.parse(op.issuedAt);
		if (time < cutoff || time > Date.parse(now) || !Number.isFinite(time)) continue;
		revisions.set(snapshot.revision, {
			revision: snapshot.revision,
			title: visible.title,
			body: visible.body,
			issuedAt: op.issuedAt,
			actorId: op.actorId,
			lineDelta: delta,
		});
	}
	return [...revisions.values()].sort((a, b) => b.revision - a.revision).slice(0, 50);
}
