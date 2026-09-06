import type { CoreStateSlice } from '../commands/types';
import type { McpProposalBaseSnapshot, McpStagedProposal } from '../state/mcp-policy';
import { getContentItemDetailForActor } from '../queries/content-query';
import type { McpResponseWarning } from './response-contract';

/**
 * RC-AI-2.2 — the THREE-WAY CONFLICT RECORD for a staged AI write.
 *
 * A proposal stages a note rewrite against the revision the agent read (`baseRevision`). If a human
 * edits that note before the DM reviews the proposal, the two edits have diverged and approving the
 * proposal as staged is a SILENT NO-OP: `content.update-item` sees the stale base, records a
 * `content.item-conflict` op, leaves the note untouched, and the proposal is nonetheless marked
 * approved. The DM is told a write landed that did not (a fake success — the exact thing the
 * guardrails forbid).
 *
 * This module makes the divergence a first-class, reviewable record instead: the THREE sides a merge
 * needs — the BASE the agent worked from, what the AI proposes, and what the note says now — plus the
 * per-region classification of who changed what, and the diff3 merge when the two edits do not touch
 * the same lines. It is PURE: it reads current state (as the proposal's own bound actor, never wider)
 * and computes; it mutates nothing and dispatches nothing. The resolution itself is a validated Core
 * command (`mcp.resolve-proposal-conflict`), because AI proposes and the DM disposes.
 *
 * The BASE comes from {@link McpStagedProposal.baseSnapshot}, captured at staging. A proposal staged by
 * an older build carries none; the record then says so (`base.available === false`), the base and merge
 * columns are withheld rather than invented, and only the two-sided choices are offered.
 */

/** How a resolution can settle the divergence. `merge` is only ever offered on a CLEAN merge. */
export const MCP_CONFLICT_RESOLUTIONS = ['keep-ai', 'keep-mine', 'merge'] as const;
export type McpConflictResolution = (typeof MCP_CONFLICT_RESOLUTIONS)[number];

/** Who changed a region of the note, relative to the base the agent read. */
export type McpConflictHunkKind =
	| 'unchanged'
	/** Only the AI moved these lines — a clean merge takes the AI's. */
	| 'ai-only'
	/** Only the human moved these lines — a clean merge keeps the note's. */
	| 'mine-only'
	/** Both landed the SAME text. Not a conflict; the merge takes it once. */
	| 'agreed'
	/** Both changed the same region differently. No merge can pick for the DM. */
	| 'conflicting';

/** ONE region of the note, with the three sides' text for it. Line arrays, bounded by the caps below. */
export interface McpConflictHunk {
	/** Stable within one record (`h0`, `h1`, …) so a UI can key and label rows. */
	id: string;
	kind: McpConflictHunkKind;
	/** The 1-based line number the region starts at in the CURRENT note (where the DM would look). */
	line: number;
	base: string[];
	ai: string[];
	current: string[];
}

/** One side of the record. Title + body as they stand for that side. */
export interface McpConflictSide {
	title: string;
	body: string;
	/** The note revision this side is anchored to; null for the AI side (it is not a revision yet). */
	revision: number | null;
}

/** THE THREE-WAY CONFLICT RECORD for one staged proposal. */
export interface McpProposalConflict {
	proposalId: string;
	itemId: string;
	/** The note's CURRENT title — what the DM will recognize it by. */
	label: string;
	/** The base the agent worked from. `available` is false when the proposal predates base capture. */
	base: (McpConflictSide & { available: true }) | { available: false };
	ai: McpConflictSide;
	current: McpConflictSide;
	/** Whether the two edits rename the note differently (a title-level conflict). */
	titleConflict: boolean;
	/** The CHANGED regions, in note order. Unchanged regions are omitted (bounded by the cap). */
	hunks: McpConflictHunk[];
	/** The diff3 result. `null` when there is no base, or when a region conflicts (nothing to offer). */
	merge: { title: string; body: string } | null;
	/** The resolutions honestly available for THIS record. `merge` appears only when `merge` is non-null. */
	resolutions: McpConflictResolution[];
	warnings: McpResponseWarning[];
}

/** Caps so one record can never become an unbounded diff or an unbounded render. */
const CONFLICT_MAX_LINES = 400;
const CONFLICT_MAX_HUNKS = 20;
const CONFLICT_HUNK_MAX_LINES = 12;

function splitLines(text: string): string[] {
	return text === '' ? [] : text.split(/\r?\n/);
}

/**
 * The matched line pairs between two line arrays, by longest common subsequence — the same alignment
 * the preview's line delta uses, exposed as index pairs so the three-way walk can tell a MOVED region
 * from a REWRITTEN one. Returns `null` beyond {@link CONFLICT_MAX_LINES} rather than running a
 * quadratic table over an arbitrarily long note.
 */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> | null {
	if (a.length > CONFLICT_MAX_LINES || b.length > CONFLICT_MAX_LINES) return null;
	const table: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			table[i]![j] =
				a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
		}
	}
	const pairs: Array<[number, number]> = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			pairs.push([i, j]);
			i += 1;
			j += 1;
		} else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
			i += 1;
		} else {
			j += 1;
		}
	}
	return pairs;
}

/** `base line index → the matching index on the other side`, for lines the two sides share. */
function matchMap(pairs: Array<[number, number]>): Map<number, number> {
	const map = new Map<number, number>();
	for (const [baseIndex, otherIndex] of pairs) map.set(baseIndex, otherIndex);
	return map;
}

function sameLines(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((line, index) => line === b[index]);
}

interface RawChunk {
	kind: McpConflictHunkKind;
	base: string[];
	ai: string[];
	current: string[];
}

/**
 * The DIFF3 walk. Both sides are aligned to the base by LCS; the walk advances through stable lines
 * (present, in order, in all three) and collects the divergent regions between them. A region only one
 * side touched resolves to that side; a region both touched identically resolves once; a region both
 * touched differently is a conflict and resolves to nothing — the DM chooses.
 */
function diff3(base: string[], ai: string[], current: string[]): RawChunk[] | null {
	const aiPairs = lcsPairs(base, ai);
	const curPairs = lcsPairs(base, current);
	if (aiPairs === null || curPairs === null) return null;
	const aiMatch = matchMap(aiPairs);
	const curMatch = matchMap(curPairs);

	const chunks: RawChunk[] = [];
	let bi = 0;
	let ai_ = 0;
	let ci = 0;
	const pushDivergent = (baseSeg: string[], aiSeg: string[], curSeg: string[]) => {
		if (baseSeg.length === 0 && aiSeg.length === 0 && curSeg.length === 0) return;
		const aiChanged = !sameLines(baseSeg, aiSeg);
		const curChanged = !sameLines(baseSeg, curSeg);
		const kind: McpConflictHunkKind = !aiChanged
			? 'mine-only'
			: !curChanged
				? 'ai-only'
				: sameLines(aiSeg, curSeg)
					? 'agreed'
					: 'conflicting';
		chunks.push({ kind, base: baseSeg, ai: aiSeg, current: curSeg });
	};

	while (bi < base.length || ai_ < ai.length || ci < current.length) {
		// The next line that is stable across all three, at or after every cursor.
		let stable = -1;
		for (let k = bi; k < base.length; k += 1) {
			const a = aiMatch.get(k);
			const c = curMatch.get(k);
			if (a !== undefined && c !== undefined && a >= ai_ && c >= ci) {
				stable = k;
				break;
			}
		}
		if (stable === -1) {
			// No stable line left: everything remaining is one divergent tail.
			pushDivergent(base.slice(bi), ai.slice(ai_), current.slice(ci));
			break;
		}
		const aiStable = aiMatch.get(stable)!;
		const curStable = curMatch.get(stable)!;
		pushDivergent(base.slice(bi, stable), ai.slice(ai_, aiStable), current.slice(ci, curStable));
		// Run the stable region as far as all three keep agreeing, so unchanged prose is one chunk.
		let run = 0;
		while (
			base[stable + run] !== undefined &&
			aiMatch.get(stable + run) === aiStable + run &&
			curMatch.get(stable + run) === curStable + run
		) {
			run += 1;
		}
		const stableSeg = base.slice(stable, stable + run);
		chunks.push({ kind: 'unchanged', base: stableSeg, ai: stableSeg, current: stableSeg });
		bi = stable + run;
		ai_ = aiStable + run;
		ci = curStable + run;
	}
	return chunks;
}

/** Trim a hunk's side to the display cap, so one enormous rewrite cannot flood the review panel. */
function cap(lines: string[]): string[] {
	return lines.length > CONFLICT_HUNK_MAX_LINES ? lines.slice(0, CONFLICT_HUNK_MAX_LINES) : lines;
}

/**
 * RC-AI-2.2 — compute the three-way conflict record for ONE staged proposal, or `null` when there is
 * no conflict to resolve (the write is not a note rewrite, the target is unreadable to the proposal's
 * actor, or the base revision the agent read is still the current one).
 */
export function computeMcpProposalConflict(
	state: CoreStateSlice,
	proposal: McpStagedProposal,
): McpProposalConflict | null {
	if (proposal.commandType !== 'content.update-item') return null;
	if (proposal.status !== 'pending') return null;
	const payload =
		proposal.payload !== null && typeof proposal.payload === 'object'
			? (proposal.payload as Record<string, unknown>)
			: {};
	const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
	const baseRevision = typeof payload.baseRevision === 'number' ? payload.baseRevision : null;
	if (itemId === '' || baseRevision === null) return null;

	const detail = getContentItemDetailForActor(
		state.content,
		state.permissions,
		proposal.actorId,
		itemId,
	);
	// An unreadable target is the preview's `no-baseline` case, not a conflict: there is nothing to
	// three-way against, and inventing sides would be worse than saying nothing.
	if (!detail.visible) return null;
	if (baseRevision >= detail.revision) return null;

	const aiTitle = typeof payload.title === 'string' ? payload.title : detail.title;
	const aiBody = typeof payload.body === 'string' ? payload.body : detail.body;
	const snapshot = proposal.baseSnapshot ?? null;
	const warnings: McpResponseWarning[] = [];

	const current: McpConflictSide = {
		title: detail.title,
		body: detail.body,
		revision: detail.revision,
	};
	const ai: McpConflictSide = { title: aiTitle, body: aiBody, revision: null };

	if (snapshot === null || snapshot.itemId !== itemId) {
		// No captured base: state the two sides honestly and withhold the merge rather than pretending
		// the current note is what the agent read (which would silently attribute the human's edit to
		// the AI's base and "merge" the DM's own work away).
		warnings.push({
			code: 'no-base-snapshot',
			message: 'This proposal was staged without a baseline, so the two edits cannot be merged.',
		});
		return {
			proposalId: proposal.id,
			itemId,
			label: detail.title,
			base: { available: false },
			ai,
			current,
			titleConflict: aiTitle !== detail.title,
			hunks: [],
			merge: null,
			resolutions: ['keep-ai', 'keep-mine'],
			warnings,
		};
	}

	const baseSide: McpConflictSide = {
		title: snapshot.title,
		body: snapshot.body,
		revision: snapshot.revision,
	};
	const chunks = diff3(splitLines(snapshot.body), splitLines(aiBody), splitLines(detail.body));
	if (chunks === null) {
		warnings.push({
			code: 'diff-bounded',
			message: 'The note is too long to compare line by line, so it cannot be merged here.',
		});
		return {
			proposalId: proposal.id,
			itemId,
			label: detail.title,
			base: { ...baseSide, available: true },
			ai,
			current,
			titleConflict: aiTitle !== detail.title && aiTitle !== snapshot.title,
			hunks: [],
			merge: null,
			resolutions: ['keep-ai', 'keep-mine'],
			warnings,
		};
	}

	// A title only conflicts when BOTH sides moved it, and moved it somewhere different.
	const aiMovedTitle = aiTitle !== snapshot.title;
	const humanMovedTitle = detail.title !== snapshot.title;
	const titleConflict = aiMovedTitle && humanMovedTitle && aiTitle !== detail.title;

	const hunks: McpConflictHunk[] = [];
	const mergedLines: string[] = [];
	let clean = !titleConflict;
	let line = 1;
	let truncated = false;
	for (const chunk of chunks) {
		if (chunk.kind === 'conflicting') clean = false;
		const resolved =
			chunk.kind === 'ai-only' || chunk.kind === 'agreed'
				? chunk.ai
				: chunk.kind === 'mine-only' || chunk.kind === 'unchanged'
					? chunk.current
					: null;
		if (resolved !== null) mergedLines.push(...resolved);
		if (chunk.kind !== 'unchanged') {
			if (hunks.length >= CONFLICT_MAX_HUNKS) {
				truncated = true;
			} else {
				hunks.push({
					id: `h${hunks.length}`,
					kind: chunk.kind,
					line,
					base: cap(chunk.base),
					ai: cap(chunk.ai),
					current: cap(chunk.current),
				});
			}
		}
		line += chunk.current.length;
	}
	if (truncated) {
		warnings.push({
			code: 'hunks-bounded',
			message: 'Only the first differing passages are listed; the note has more.',
		});
	}

	const mergedTitle = aiMovedTitle && !humanMovedTitle ? aiTitle : detail.title;
	const merge = clean ? { title: mergedTitle, body: mergedLines.join('\n') } : null;
	if (!clean && !titleConflict) {
		warnings.push({
			code: 'overlapping-edits',
			message: 'The assistant and the note changed the same lines, so there is no merge to offer.',
		});
	}
	if (titleConflict) {
		warnings.push({
			code: 'title-conflict',
			message: 'The assistant and the note give this entry different titles.',
		});
	}

	return {
		proposalId: proposal.id,
		itemId,
		label: detail.title,
		base: { ...baseSide, available: true },
		ai,
		current,
		titleConflict,
		hunks,
		merge,
		resolutions: merge === null ? ['keep-ai', 'keep-mine'] : ['keep-ai', 'keep-mine', 'merge'],
		warnings,
	};
}

/**
 * RC-AI-2.2 — the base snapshot for a write about to be STAGED, or `null` when the write is not a note
 * rewrite (every other command creates something, so it has no baseline to diverge from) or the target
 * is not readable by the bound actor (in which case the staging itself is already denied upstream).
 *
 * Read AS THE BOUND ACTOR: the snapshot can never contain prose that actor could not already read, so
 * capturing it widens nothing. Pure — the caller stores it on the proposal.
 */
export function captureProposalBase(
	state: CoreStateSlice,
	actorId: string,
	commandType: string,
	payload: unknown,
): McpProposalBaseSnapshot | null {
	if (commandType !== 'content.update-item') return null;
	const record =
		payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	const itemId = typeof record.itemId === 'string' ? record.itemId : '';
	if (itemId === '') return null;
	const detail = getContentItemDetailForActor(state.content, state.permissions, actorId, itemId);
	if (!detail.visible) return null;
	return { itemId, revision: detail.revision, title: detail.title, body: detail.body };
}
