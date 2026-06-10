import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import {
	computeGraphHealth,
	GRAPH_HEALTH_SCHEMA_VERSION,
	GRAPH_HEALTH_THRESHOLD_VERSION,
	type GraphHealthReport,
	type HealthNoteSignal,
} from '../state/graph-health';
import { getGraphQualityForActor } from './graph-quality-query';
import { getContentItemsForActor } from './content-query';

/**
 * GRAPH-007 — the ACTOR-FILTERED GRAPH HEALTH + COVERAGE surface. The DM runs health/coverage reports for
 * stale notes, missing links, content gaps, and open threads with deterministic scoring; a player-scoped
 * surface gets a GENERALIZED projection that can never reveal hidden content.
 *
 * The report is computed ENTIRELY from EXISTING actor-filtered reads — it is NOT a second index:
 *
 *   - The link-graph findings come from {@link getGraphQualityForActor} (GRAPH-003), which is itself built
 *     on {@link getContentItemsForActor} + the actor-filtered wikilink candidate index. So a `dm-only` /
 *     soft-deleted note never enters the analysis, and a missing-link finding can never reveal a hidden
 *     target (it is `unresolved` either way) — the report is fail-closed by construction.
 *   - The staleness signals come from the SAME visible items' `updatedAt`, aged against an EXPLICIT
 *     reference instant the caller passes (no ambient clock reaches the Processing Core), so the staleness
 *     grade is deterministic.
 *
 * GRAPH-007 is `Multi-user: dm-only` / `Player-safe: dm-only` (Contract 3): the FULL report is a DM
 * surface. {@link getGraphHealthForDm} returns the full report ONLY for the DM (a non-DM gets the empty
 * report — fail closed). For an explicit player-scoped surface, {@link getGraphHealthForActor} computes the
 * report over ONLY the actor's VISIBLE graph (so no hidden node/snippet can appear — AC3) AND GENERALIZES
 * the aggregate counts into bands rather than exact numbers, so even a count can never betray hidden content
 * (AC3). No AI is required at any point, so the report completes offline (AC4).
 *
 * Pure + deterministic: the same (content, permissions, actor, reference instant) always returns the same
 * report. The Processing Core owns the scoring; the GUI renders the computed report (Architecture Contract
 * 1). Optional narrative AI explanation is a thin labelled layer (`explainGraphHealth`, GRAPH-007 AC2) —
 * the deterministic findings here remain the source of truth.
 */

/** The fail-closed EMPTY health report (a non-DM on the DM surface, or an unknown actor). */
function emptyReport(): GraphHealthReport {
	return {
		schemaVersion: GRAPH_HEALTH_SCHEMA_VERSION,
		thresholdVersion: GRAPH_HEALTH_THRESHOLD_VERSION,
		staleNotes: [],
		missingLinks: [],
		contentGaps: [],
		openThreads: [],
		coverage: { overall: 100, components: { staleNotes: 0, missingLinks: 0, contentGaps: 0, openThreads: 0 } },
	};
}

/** Whole days between two ISO instants (`updatedAt` → reference). `null` when either is unparseable. Pure. */
function ageInDays(updatedAt: string, referenceInstant: string): number | null {
	const updatedMs = Date.parse(updatedAt);
	const referenceMs = Date.parse(referenceInstant);
	if (Number.isNaN(updatedMs) || Number.isNaN(referenceMs)) return null;
	// A clock-free pure transform of the two explicit ISO strings — never reads the host clock.
	return Math.max(0, Math.floor((referenceMs - updatedMs) / 86_400_000));
}

/**
 * Build the per-note staleness SIGNALS over the actor's visible notes, aged against an explicit reference
 * instant. Only visible notes contribute, so the staleness findings never name a hidden note. Pure.
 */
function buildHealthSignals(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	referenceInstant: string,
): HealthNoteSignal[] {
	return getContentItemsForActor(content, permissions, actorId)
		.filter((view) => view.kind === 'note')
		.map((view) => ({
			itemId: view.id,
			title: view.title,
			ageDays: ageInDays(view.updatedAt, referenceInstant),
		}));
}

/**
 * GRAPH-007 — compute the health report over an actor's VISIBLE graph. Composes the actor-filtered quality
 * report (GRAPH-003) + the visible notes' staleness signals. By construction every finding is over the
 * visible set, so no hidden node/snippet appears. Pure + deterministic; needs no AI.
 */
function computeHealthForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	referenceInstant: string,
): GraphHealthReport {
	const quality = getGraphQualityForActor(content, permissions, actorId);
	const signals = buildHealthSignals(content, permissions, actorId, referenceInstant);
	return computeGraphHealth(quality, signals);
}

/**
 * GRAPH-007 AC1 / AC4 — the DM-only GRAPH HEALTH + COVERAGE report: stale notes, missing links, content
 * gaps, and open threads with deterministic scoring + source references. A non-DM (or unknown) actor
 * receives the EMPTY report (fail closed — GRAPH-007 is dm-only). The `referenceInstant` is the explicit
 * "now" the staleness is measured against (passed by the caller; the Processing Core reads no ambient
 * clock). No AI is involved, so the report completes offline (AC4). Pure + deterministic.
 */
export function getGraphHealthForDm(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	referenceInstant: string,
): GraphHealthReport {
	const actor = permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return emptyReport();
	return computeHealthForActor(content, permissions, actorId, referenceInstant);
}

/** A generalized count BAND (so a player-scoped aggregate never reveals an exact hidden-influenced number). */
export type CountBand = 'none' | 'few' | 'several' | 'many';

/** Generalize an exact count into a coarse band (GRAPH-007 AC3 — aggregate generalization). Pure. */
function generalizeCount(count: number): CountBand {
	if (count <= 0) return 'none';
	if (count <= 2) return 'few';
	if (count <= 5) return 'several';
	return 'many';
}

/**
 * GRAPH-007 AC3 — a PLAYER-SCOPED health summary. Computed over ONLY the actor's VISIBLE graph (so no
 * hidden node, snippet, or finding can appear), and the aggregate counts are GENERALIZED into coarse bands
 * rather than exact numbers, so even a count can never betray the presence of hidden content. There are NO
 * per-finding rows here (no ids/titles/snippets) — only the generalized bands + a coverage GRADE BAND.
 */
export interface PlayerScopedHealthSummary {
	schemaVersion: typeof GRAPH_HEALTH_SCHEMA_VERSION;
	staleNotes: CountBand;
	missingLinks: CountBand;
	contentGaps: CountBand;
	openThreads: CountBand;
	/** The coverage grade generalized into a coarse band (not the exact 0–100 score). */
	coverageBand: 'low' | 'moderate' | 'good' | 'excellent';
}

/** Generalize the exact 0–100 coverage grade into a coarse band (no exact number reaches a player). */
function coverageBand(overall: number): PlayerScopedHealthSummary['coverageBand'] {
	if (overall >= 90) return 'excellent';
	if (overall >= 70) return 'good';
	if (overall >= 50) return 'moderate';
	return 'low';
}

/**
 * GRAPH-007 AC3 — the GENERALIZED, PLAYER-SCOPED health summary for ANY actor. Computed over the actor's
 * OWN visible graph (a player sees only their visible notes, so the analysis already omits hidden nodes +
 * snippets), and every aggregate is GENERALIZED into a coarse band — so a player-scoped surface can never
 * read an exact count that would reveal hidden content (AC3). An unknown actor gets the all-`none` summary
 * (fail closed). For the DM this is simply a coarse summary of the full report. Pure + deterministic.
 */
export function getPlayerScopedHealthSummary(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	referenceInstant: string,
): PlayerScopedHealthSummary {
	const actor = permissions.actors[actorId];
	if (!actor) {
		return {
			schemaVersion: GRAPH_HEALTH_SCHEMA_VERSION,
			staleNotes: 'none',
			missingLinks: 'none',
			contentGaps: 'none',
			openThreads: 'none',
			coverageBand: 'excellent',
		};
	}
	const report = computeHealthForActor(content, permissions, actorId, referenceInstant);
	return {
		schemaVersion: GRAPH_HEALTH_SCHEMA_VERSION,
		staleNotes: generalizeCount(report.staleNotes.length),
		missingLinks: generalizeCount(report.missingLinks.length),
		contentGaps: generalizeCount(report.contentGaps.length),
		openThreads: generalizeCount(report.openThreads.length),
		coverageBand: coverageBand(report.coverage.overall),
	};
}
