import { z } from 'zod';
import type { ContentItem, VaultContentState } from '../state/content';
import type { PermissionState } from '../state/permission-state';
import { getContentItemsForActor } from './content-query';
import {
	CONTENT_HISTORY_ENTITY_TYPE,
	operationsForEntity,
	type OperationLog,
} from '../sync/operation-log';

/**
 * RC-KNW-5.2 — note history is stored as REVERSE deltas, never whole snapshots. Each note mutation
 * records the prose it replaced (only the changed span), so typing costs a few bytes per save and a
 * pasted body costs nothing. Every op stays far below the cloud-backup per-op ciphertext cap: a
 * delta over {@link CONTENT_REVISION_PATCH_MAX_BYTES} is dropped and recorded as a gap instead.
 * The chain is anchored at the live note and verified by a prose hash at every step, so an edit made
 * by a path that records no history ends the reachable history rather than producing wrong text.
 */
export const CONTENT_REVISION_FORMAT = 'reverse-delta-v1';
export const CONTENT_REVISION_PATCH_MAX_BYTES = 16 * 1024;

const patchSchema = z.object({
	title: z.string().optional(),
	at: z.number().int().nonnegative(),
	remove: z.number().int().nonnegative(),
	insert: z.string(),
});
type ProsePatch = z.infer<typeof patchSchema>;

const revisionValueSchema = z.object({
	format: z.literal(CONTENT_REVISION_FORMAT),
	prose: z.string(),
	visibility: z.enum(['dm-only', 'player-visible', 'shared']),
	sharedWith: z.array(z.string()),
	deletedAt: z.string().nullable(),
	/** Absent: first revision. Null: the replaced prose exceeded the size cap (history stops). */
	back: patchSchema.nullable().optional(),
});

/** cyrb53 — deterministic 53-bit string hash; only detects chain breaks, not a security boundary. */
function hash53(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 2654435761);
		h2 = Math.imul(h2 ^ c, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function proseHash(title: string, body: string): string {
	return hash53(`${title.length}:${title}${body}`);
}

function utf8Bytes(text: string): number {
	let bytes = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80) bytes += 1;
		else if (c < 0x800) bytes += 2;
		else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
			bytes += 4;
			i++;
		} else bytes += 3;
	}
	return bytes;
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c < 0xdc00;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c < 0xe000;

/** Patch turning `after` back into `before`: only the differing span, never splitting a surrogate pair. */
function reverseBodyPatch(after: string, before: string): Omit<ProsePatch, 'title'> {
	let start = 0;
	const max = Math.min(after.length, before.length);
	while (start < max && after.charCodeAt(start) === before.charCodeAt(start)) start++;
	if (start > 0 && start < max && isHighSurrogate(after.charCodeAt(start - 1))) start--;
	let end = 0;
	while (
		end < after.length - start &&
		end < before.length - start &&
		after.charCodeAt(after.length - 1 - end) === before.charCodeAt(before.length - 1 - end)
	)
		end++;
	if (end > 0 && isLowSurrogate(after.charCodeAt(after.length - end))) end--;
	return {
		at: start,
		remove: after.length - start - end,
		insert: before.slice(start, before.length - end),
	};
}

function applyPatch(title: string, body: string, patch: ProsePatch) {
	if (patch.at + patch.remove > body.length) return undefined;
	return {
		title: patch.title ?? title,
		body: body.slice(0, patch.at) + patch.insert + body.slice(patch.at + patch.remove),
	};
}

/**
 * Operation value for a note mutation, or undefined for other kinds (history is notes-only).
 * `before` is the item as it was before the command; omit it for a create.
 */
export function contentRevisionValue(
	before: ContentItem | undefined,
	after: ContentItem,
): z.infer<typeof revisionValueSchema> | undefined {
	if (after.kind !== 'note') return undefined;
	const value: z.infer<typeof revisionValueSchema> = {
		format: CONTENT_REVISION_FORMAT,
		prose: proseHash(after.title, after.body),
		visibility: after.visibility,
		sharedWith: [...after.sharedWith],
		deletedAt: after.deletedAt,
	};
	if (!before) return value;
	const patch: ProsePatch = {
		...(before.title !== after.title ? { title: before.title } : {}),
		...reverseBodyPatch(after.body, before.body),
	};
	return {
		...value,
		back: utf8Bytes(JSON.stringify(patch)) <= CONTENT_REVISION_PATCH_MAX_BYTES ? patch : null,
	};
}

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

const HISTORY_LIMIT = 50;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
	const nowMs = Date.parse(now);
	const cutoff = nowMs - HISTORY_WINDOW_MS;
	if (!Number.isFinite(cutoff)) return [];

	// Walk newest → oldest from the live prose, verifying each step. One revision past the page (or
	// the window) is kept so the oldest listed row still diffs against its real predecessor.
	const walked: { view?: ContentRevisionView; body?: string }[] = [];
	let listed = 0;
	let prose: { title: string; body: string } | undefined = current;
	const ops = operationsForEntity(log, CONTENT_HISTORY_ENTITY_TYPE, itemId).reverse();
	for (const op of ops) {
		if (!prose || listed > HISTORY_LIMIT) break;
		const parsed = revisionValueSchema.safeParse(op.value);
		if (!parsed.success || op.afterRevision === undefined) continue;
		const value = parsed.data;
		if (value.prose !== proseHash(prose.title, prose.body)) break;
		const visible = getContentItemsForActor(
			{
				...content,
				items: {
					[itemId]: {
						...current,
						...prose,
						visibility: value.visibility,
						sharedWith: value.sharedWith,
						deletedAt: value.deletedAt,
						revision: op.afterRevision,
					},
				},
			},
			permissions,
			actorId,
		)[0];
		const time = Date.parse(op.issuedAt);
		const inWindow = Number.isFinite(time) && time >= cutoff && time <= nowMs;
		if (visible && inWindow && listed < HISTORY_LIMIT) {
			listed++;
			walked.push({
				body: visible.body,
				view: {
					revision: op.afterRevision,
					title: visible.title,
					body: visible.body,
					issuedAt: op.issuedAt,
					actorId: op.actorId,
					lineDelta: { added: 0, removed: 0 },
				},
			});
		} else {
			walked.push(visible ? { body: visible.body } : {});
			if (visible && listed === HISTORY_LIMIT) listed++;
		}
		if (Number.isFinite(time) && time < cutoff) break;
		prose = value.back ? applyPatch(prose.title, prose.body, value.back) : undefined;
	}
	const rows: ContentRevisionView[] = [];
	walked.forEach((node, index) => {
		if (!node.view) return;
		node.view.lineDelta = lineDelta(walked[index + 1]?.body ?? '', node.view.body);
		rows.push(node.view);
	});
	return rows;
}
