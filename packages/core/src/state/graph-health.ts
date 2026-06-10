import type { GraphQualityReport } from './graph-quality';

/**
 * GRAPH-007 — the PURE DETERMINISTIC GRAPH HEALTH + COVERAGE engine: it grades a vault's link graph for
 * STALE NOTES, MISSING LINKS, CONTENT GAPS, and OPEN THREADS with DETERMINISTIC SCORING, and exposes an
 * OPTIONAL narrative AI EXPLANATION as a thin labelled layer over those deterministic findings (the
 * findings stay the source of truth).
 *
 * Everything here is a PURE function of its explicit inputs (a {@link GraphQualityReport} computed over an
 * actor's visible graph + a set of {@link HealthNoteSignal}s describing each visible note's staleness /
 * connectivity). It NEVER reads ambient state, storage, a clock, an id generator, a real transport, or any
 * AI runtime, and it embeds NO date arithmetic of its own — staleness is fed in as a pre-computed
 * deterministic age bucket. Because the inputs are ALREADY actor-filtered, the report can never name or
 * reveal a note the actor cannot see; the DM-only / player-scoped projection is enforced by the query
 * layer (`queries/graph-health-query.ts`), which additionally GENERALIZES counts for a player-scoped
 * surface so an aggregate can never betray hidden content (GRAPH-007 AC3).
 *
 * AI is SUPPLEMENTARY (Cross-Contract Non-Negotiable 7): {@link explainGraphHealth} produces a deterministic
 * narrative from the findings BY DEFAULT (no AI), and accepts an OPTIONAL provider-agnostic explainer that
 * can only annotate the already-computed findings — it can NEVER change a score, add a finding, or replace
 * the deterministic findings as the source of truth (GRAPH-007 AC2). When no AI runtime is available the
 * deterministic report still completes (AC4) — by construction, since the report needs no AI at all.
 *
 * Determinism (a HARD requirement): the same inputs always produce the same report with TOTAL tie-breakers,
 * so it is reproducible across fresh fixtures whose volatile ids differ and across repeated runs. The
 * Processing Core owns the scoring; the GUI renders the computed report (Architecture Contract 1).
 */

export const GRAPH_HEALTH_SCHEMA_VERSION = 1 as const;

/**
 * The THRESHOLD VERSION stamped on the health report (GRAPH-007). Bumping it is a scoring-policy change so a
 * persisted/compared report records which threshold set produced it. Kept in lockstep with {@link HEALTH_THRESHOLDS}.
 */
export const GRAPH_HEALTH_THRESHOLD_VERSION = '1' as const;

/**
 * The deterministic STALENESS age buckets (in days) the staleness grading uses. A note whose `ageDays` is
 * at/above `staleDays` is `stale`; at/above `agingDays` is `aging`; otherwise `fresh`. Frozen + versioned
 * so the grading is reproducible. The query layer computes `ageDays` from the visible note's `updatedAt`
 * against an explicit reference instant (no ambient clock reaches this engine).
 */
export const HEALTH_THRESHOLDS = Object.freeze({
	/** Days since last update at/above which a note is STALE. */
	staleDays: 180,
	/** Days since last update at/above which a note is AGING (but not yet stale). */
	agingDays: 60,
});

/** The graded staleness band of a note. */
export type StalenessBand = 'fresh' | 'aging' | 'stale';

/**
 * ONE note's deterministic HEALTH SIGNAL as fed to the engine: its identity + a pre-computed staleness age
 * (in whole days, or `null` when no timestamp), plus its connectivity already graded by the quality report.
 * The note is actor-visible, so deriving a health finding from it leaks nothing.
 */
export interface HealthNoteSignal {
	itemId: string;
	title: string;
	/** Whole days since the note was last updated, relative to the query's reference instant. `null` ⇒ unknown. */
	ageDays: number | null;
}

/** ONE STALE-NOTE finding: a visible note that has not been updated within the staleness window. */
export interface StaleNoteFinding {
	itemId: string;
	title: string;
	ageDays: number;
	band: StalenessBand;
}

/** ONE MISSING-LINK finding: an unresolved link, surfaced from the quality report (with its repair candidate). */
export interface MissingLinkFinding {
	sourceId: string;
	sourceTitle: string;
	/** The broken target the link names. */
	target: string;
	/** The deterministic repair candidate from the quality report, or `null`. */
	repairCandidate: string | null;
}

/** ONE CONTENT-GAP finding: a visible note that is poorly connected (an orphan or an isolated note). */
export interface ContentGapFinding {
	itemId: string;
	title: string;
	/** Why it is a gap: it has no links at all (`orphan`) or only a single connection (`isolated`). */
	reason: 'orphan' | 'isolated';
}

/** ONE OPEN-THREAD finding: a duplicate-title / alias collision that needs the DM to disambiguate/resolve. */
export interface OpenThreadFinding {
	/** Why the thread is open: a duplicate title or an alias collision (from the quality report). */
	kind: 'duplicate-title' | 'alias-collision';
	/** The colliding name. */
	name: string;
	/** The colliding notes' ids (all visible). */
	itemIds: string[];
}

/**
 * The COVERAGE SCORE: a single deterministic 0–100 grade of the visible graph's health, with its component
 * sub-scores, so the grade is explainable WITHOUT AI (GRAPH-007 AC1). Higher is healthier. Computed purely
 * from the finding counts over the visible set, so it never reflects hidden content.
 */
export interface CoverageScore {
	/** The overall 0–100 health grade (100 == no findings). */
	overall: number;
	/** The component penalties (each a non-negative integer subtracted from 100, clamped). */
	components: {
		staleNotes: number;
		missingLinks: number;
		contentGaps: number;
		openThreads: number;
	};
}

/** The complete, DETERMINISTIC graph health + coverage report (GRAPH-007). DM-projected by the query layer. */
export interface GraphHealthReport {
	schemaVersion: typeof GRAPH_HEALTH_SCHEMA_VERSION;
	thresholdVersion: typeof GRAPH_HEALTH_THRESHOLD_VERSION;
	staleNotes: StaleNoteFinding[];
	missingLinks: MissingLinkFinding[];
	contentGaps: ContentGapFinding[];
	openThreads: OpenThreadFinding[];
	coverage: CoverageScore;
}

/** Grade a note's staleness from its pre-computed age (in days) against the thresholds. Pure. */
function stalenessBand(ageDays: number): StalenessBand {
	if (ageDays >= HEALTH_THRESHOLDS.staleDays) return 'stale';
	if (ageDays >= HEALTH_THRESHOLDS.agingDays) return 'aging';
	return 'fresh';
}

/**
 * GRAPH-007 — compute the DETERMINISTIC graph health + coverage report from a visible-graph quality report
 * + per-note staleness signals. STALE NOTES come from the staleness signals (notes past the aging window);
 * MISSING LINKS from the quality report's unresolved links; CONTENT GAPS from its orphans + isolated
 * scores; OPEN THREADS from its duplicate-title / alias-collision disambiguation groups. The COVERAGE SCORE
 * is a deterministic 0–100 grade penalized by each finding category. Every input is over the actor's visible
 * graph, so the report never reveals hidden content; every list has a total tie-breaker so the report is
 * reproducible. Pure + needs no AI (AC4 — completes offline).
 */
export function computeGraphHealth(
	quality: GraphQualityReport,
	signals: readonly HealthNoteSignal[],
): GraphHealthReport {
	// STALE NOTES — notes whose age is at/above the aging window, graded + ordered most-stale first.
	const staleNotes: StaleNoteFinding[] = [];
	for (const signal of signals) {
		if (signal.ageDays === null) continue;
		const band = stalenessBand(signal.ageDays);
		if (band === 'fresh') continue;
		staleNotes.push({ itemId: signal.itemId, title: signal.title, ageDays: signal.ageDays, band });
	}
	staleNotes.sort(
		(a, b) =>
			b.ageDays - a.ageDays || a.title.localeCompare(b.title) || a.itemId.localeCompare(b.itemId),
	);

	// MISSING LINKS — the quality report's unresolved links (already deterministically ordered).
	const missingLinks: MissingLinkFinding[] = quality.unresolvedLinks.map((link) => ({
		sourceId: link.sourceId,
		sourceTitle: link.sourceTitle,
		target: link.target,
		repairCandidate: link.repairCandidate,
	}));

	// CONTENT GAPS — orphans (no links) + isolated notes (a single connection). Orphans first, deduped.
	const orphanIds = new Set(quality.orphans.map((orphan) => orphan.itemId));
	const contentGaps: ContentGapFinding[] = quality.orphans.map((orphan) => ({
		itemId: orphan.itemId,
		title: orphan.title,
		reason: 'orphan' as const,
	}));
	for (const score of quality.scores) {
		if (orphanIds.has(score.itemId)) continue; // already reported as an orphan (the stronger gap)
		// An `isolated` band that is NOT an orphan means it has exactly one connection — a thin thread.
		if (score.band === 'isolated' && score.score > 0) {
			contentGaps.push({ itemId: score.itemId, title: score.title, reason: 'isolated' });
		}
	}
	contentGaps.sort(
		(a, b) =>
			gapReasonOrder(a.reason) - gapReasonOrder(b.reason) ||
			a.title.localeCompare(b.title) ||
			a.itemId.localeCompare(b.itemId),
	);

	// OPEN THREADS — duplicate-title + alias-collision groups that need the DM to disambiguate/resolve.
	const openThreads: OpenThreadFinding[] = quality.disambiguation.map((group) => ({
		kind: group.kind,
		name: group.name,
		itemIds: [...group.itemIds],
	}));

	const coverage = computeCoverageScore({
		staleNotes: staleNotes.length,
		missingLinks: missingLinks.length,
		contentGaps: contentGaps.length,
		openThreads: openThreads.length,
	});

	return {
		schemaVersion: GRAPH_HEALTH_SCHEMA_VERSION,
		thresholdVersion: GRAPH_HEALTH_THRESHOLD_VERSION,
		staleNotes,
		missingLinks,
		contentGaps,
		openThreads,
		coverage,
	};
}

function gapReasonOrder(reason: ContentGapFinding['reason']): number {
	return reason === 'orphan' ? 0 : 1;
}

/** Penalty weight per finding in a category (each finding subtracts this from the perfect 100 grade). */
const COVERAGE_PENALTY = Object.freeze({
	staleNote: 1,
	missingLink: 2,
	contentGap: 2,
	openThread: 3,
});

/**
 * GRAPH-007 AC1 — compute the deterministic 0–100 COVERAGE SCORE from the finding counts. Each category
 * contributes a bounded penalty (so one noisy category cannot drive the grade arbitrarily negative); the
 * overall grade is 100 minus the summed penalties, clamped to [0, 100]. Purely a function of the counts, so
 * the grade is reproducible and explainable without AI. Pure.
 */
function computeCoverageScore(counts: {
	staleNotes: number;
	missingLinks: number;
	contentGaps: number;
	openThreads: number;
}): CoverageScore {
	const cap = (value: number, max: number): number => Math.min(value, max);
	const components = {
		staleNotes: cap(counts.staleNotes * COVERAGE_PENALTY.staleNote, 30),
		missingLinks: cap(counts.missingLinks * COVERAGE_PENALTY.missingLink, 30),
		contentGaps: cap(counts.contentGaps * COVERAGE_PENALTY.contentGap, 25),
		openThreads: cap(counts.openThreads * COVERAGE_PENALTY.openThread, 15),
	};
	const penalty =
		components.staleNotes +
		components.missingLinks +
		components.contentGaps +
		components.openThreads;
	return { overall: Math.max(0, 100 - penalty), components };
}

/**
 * GRAPH-007 AC2 — the status of the OPTIONAL narrative AI explanation over a health report. The explanation
 * is SECONDARY to the deterministic findings and may be `deterministic` (the default — a synthesized,
 * no-AI narrative), `ai-applied` (an explainer annotated the deterministic findings), or `ai-unavailable`
 * (an explainer was requested but is offline/absent — the deterministic narrative is returned unchanged).
 * In EVERY state the deterministic findings remain the source of truth and the report is complete (AC4).
 */
export interface HealthExplanationStatus {
	state: 'deterministic' | 'ai-applied' | 'ai-unavailable';
	/** A generic, non-leaking reason when `ai-unavailable` (e.g. "offline"); else `null`. */
	reason: string | null;
}

/** A narrative explanation of a health report: the deterministic findings + the (optional) AI layer status. */
export interface HealthExplanation {
	/** A deterministic, no-AI narrative line per finding category (always present — the source of truth). */
	lines: string[];
	status: HealthExplanationStatus;
}

/**
 * GRAPH-007 — the OPTIONAL, provider-agnostic AI explainer seam. A caller (the GUI) supplies it ONLY when
 * the DM turned AI explanation ON; absent ⇒ the explanation is `deterministic`. It is deliberately a thin
 * seam: a final AI architecture decision is deferred (ADR-014), so the core embeds no model. It can only
 * ANNOTATE the already-computed deterministic narrative lines; it can never add a finding, change a score,
 * or replace the deterministic findings as the source of truth (AC2).
 */
export interface HealthAiExplainer {
	/** Whether the DM enabled AI explanation. When false the deterministic narrative is returned as-is. */
	enabled: boolean;
	/** Whether the AI runtime is currently available (false when offline/absent). Defaults to available. */
	available?: boolean;
	/**
	 * A pure annotator over the deterministic narrative lines: given the deterministic lines it may return
	 * an annotated narrative. It receives ONLY the already-computed lines (which name only visible content),
	 * so it can never introduce hidden content. When omitted, the deterministic narrative is used unchanged.
	 */
	annotate?: (lines: readonly string[], report: GraphHealthReport) => string[];
}

/**
 * GRAPH-007 AC2 / AC4 — build a narrative EXPLANATION of a health report. The DETERMINISTIC narrative (one
 * line per finding category + the coverage grade) is ALWAYS produced, with NO AI, so the report completes
 * even when no AI runtime is available (AC4). When an explainer is enabled AND available, it may ANNOTATE
 * the deterministic lines — but the deterministic FINDINGS remain the source of truth (AC2): the explainer
 * never changes a score or adds a finding. When the explainer is enabled but unavailable, the deterministic
 * narrative is returned unchanged with an `ai-unavailable` status (degrade, never fail). Pure.
 */
export function explainGraphHealth(
	report: GraphHealthReport,
	explainer?: HealthAiExplainer,
): HealthExplanation {
	// The deterministic narrative — a stable, no-AI sentence per category. This IS the source of truth.
	const lines = [
		`Coverage grade ${report.coverage.overall}/100.`,
		`${report.staleNotes.length} stale note(s) past the freshness window.`,
		`${report.missingLinks.length} missing link(s) need repair.`,
		`${report.contentGaps.length} content gap(s) (orphan or isolated notes).`,
		`${report.openThreads.length} open thread(s) (duplicate titles or alias collisions) to resolve.`,
	];

	if (!explainer || !explainer.enabled) {
		return { lines, status: { state: 'deterministic', reason: null } };
	}
	if (explainer.available === false) {
		// Degrade, do not fail: the deterministic narrative is returned unchanged (AC4).
		return { lines, status: { state: 'ai-unavailable', reason: 'AI explanation unavailable.' } };
	}
	if (!explainer.annotate) {
		// Enabled + available but no annotator supplied: the deterministic narrative is the explanation.
		return { lines, status: { state: 'ai-applied', reason: null } };
	}
	// The annotator may only re-word/augment the deterministic lines; the findings + scores are unchanged.
	const annotated = explainer.annotate([...lines], report);
	return { lines: annotated, status: { state: 'ai-applied', reason: null } };
}
