import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { CharacterState } from '../state/character-state';
import type { OperationLog } from '../sync/operation-log';
import type { CalendarDateFormat } from '../state/calendar';
import {
	getPrepRecapDigest,
	type PrepRecapDigest,
	type DigestMode,
} from '../queries/prep-recap-digest';
import {
	getGraphHealthForDm,
	type PlayerScopedHealthSummary,
	getPlayerScopedHealthSummary,
} from '../queries/graph-health-query';
import type { GraphHealthReport } from '../state/graph-health';
import { getCalendarContextForActor } from '../queries/calendar-continuity-query';
import { getDateGraphIndexForActor } from '../queries/graph-dates-query';
import type { DateGraphIndex } from '../state/graph-dates';
import {
	applyAiAnnotation,
	AI_ABSENT_CAPABILITY,
	type AiAnnotation,
	type AiAnnotationStatus,
	type AiAnnotator,
	type AiCapability,
} from './ai-boundary';

/**
 * MCP-006 / MCP-013 — THE SEMANTIC BUNDLE TOOLS: bounded, SOURCE-CITED CONTEXT PACKAGES for session prep,
 * recap, continuity, open threads, coverage gaps, and campaign health, CALENDAR-aware (Feature Inventory
 * I5; Vision AI role). A bundle is NOT a new dataset and NOT a new index — it is a COMPOSITION over the
 * EXISTING deterministic, actor-filtered Processing-Core reads:
 *
 *   - PREP / RECAP / CONTINUITY / OPEN-THREADS ← {@link getPrepRecapDigest} (SES-009): unresolved threads,
 *     recent changes, handout outcomes, combat summaries, the calendar context, and continuity prompts,
 *     all already actor-filtered and DM-gated.
 *   - COVERAGE GAPS / CAMPAIGN HEALTH ← {@link getGraphHealthForDm} (GRAPH-007): stale notes, missing links,
 *     content gaps, open threads, and the deterministic coverage grade.
 *   - CALENDAR / CUSTOM-TIME CONTEXT (MCP-013) ← {@link getCalendarContextForActor} (SES-012) +
 *     {@link getDateGraphIndexForActor} (GRAPH-009): the campaign current date, the visible past/upcoming
 *     linked dated events, and the visible date-relationship graph — included ONLY when the visible source
 *     data actually carries dates/timeline relationships.
 *
 * Because EVERY input is an actor-filtered read, the data layer decided visibility BEFORE the bundle is
 * assembled (Cross-Contract Non-Negotiable 2): a `dm-only` / hidden / soft-deleted source can never enter
 * a bundle, and a citation can never reference a source the actor cannot see. MCP-006 is `dm-only` (the
 * full bundle is a DM surface): a non-DM (or unknown) actor receives a fail-closed, GENERALIZED bundle —
 * NO findings, NO citations, NO exact dates, ONLY coarse coverage bands (MCP-006 AC1 / MCP-013 AC2). The
 * DM-only digest/health reads enforce this gate internally; the player projection here adds the
 * generalization layer so even an aggregate count cannot betray hidden content.
 *
 * SEMANTIC COMPRESSION (MCP-006 AC2): a bundle declares an explicit ITEM BUDGET. When the composed
 * deterministic content EXCEEDS the budget, the bundle CHOOSES BOUNDED SUMMARIES (the highest-signal
 * items + a generalized "+N more" count band) rather than the raw full-vault content — so a bundle is
 * always within context limits and never dumps the whole vault. The compression is deterministic
 * (highest-signal-first, stable tie-break), so the same vault always compresses identically.
 *
 * AI BOUNDARY (MCP-007 / MCP-008): the deterministic bundle above is COMPLETE and CORRECT with AI OFF (the
 * default). An OPTIONAL AI annotation — a labelled, non-authoritative narrative/explanation over the
 * bundle's deterministic facts — may accompany it via the {@link applyAiAnnotation} boundary, held in a
 * SEPARATE `aiAnnotation` field. The annotation is dropped fail-closed when AI is off/absent/unavailable,
 * can only read the already-visible bundle facts, and is never authoritative — so no AI call is ever
 * load-bearing for any acceptance criterion.
 *
 * Pure + deterministic: a function of (session, content, maps, characters, permissions, sync, actor[,
 * options]) only. No GUI, no storage, no embedded model. Per ADR-014 the MCP transport is deferred.
 */

/** The kind of semantic bundle requested. Each composes a specific subset of the deterministic reads. */
export type SemanticBundleKind =
	/** Forward-looking session prep: open threads, upcoming dated events, recent changes, continuity prompts. */
	| 'session-prep'
	/** Backward-looking session recap: what was delivered/fought/changed, recent dated events. */
	| 'session-recap'
	/** Continuity: the open threads + calendar continuity that bridge sessions. */
	| 'continuity'
	/** Open threads only: the unresolved-thread subset (the smallest bundle). */
	| 'open-threads'
	/** Coverage gaps: the graph-health stale/missing/gap/thread findings. */
	| 'coverage-gaps'
	/** Campaign health: the coverage grade + the dated-relationship campaign timeline overview. */
	| 'campaign-health';

/** The closed list of bundle kinds, for the registry/tests and exhaustive routing. */
export const SEMANTIC_BUNDLE_KINDS = [
	'session-prep',
	'session-recap',
	'continuity',
	'open-threads',
	'coverage-gaps',
	'campaign-health',
] as const;

/**
 * A bounded SOURCE CITATION carried by a bundle (MCP-006 "source-cited"). It references WHERE a datum came
 * from by stable id/kind ONLY — never the cited entity's content/title/value — so a citation can never
 * become a side-channel that leaks hidden content. The `ref` is an opaque id the actor already has
 * visibility to (every cited datum was actor-filtered upstream). Mirrors the MCP-010 `McpResponseCitation`.
 */
export interface BundleCitation {
	/** The kind of source the datum is attributed to (e.g. `note`, `thread`, `handout`, `calendar`, `health`). */
	kind: string;
	/** A stable, opaque reference id for the source. Id only — carries no content. */
	ref: string;
}

/** A count BAND generalizing an exact number (so a player-scoped bundle never reveals an exact count). */
export type BundleCountBand = 'none' | 'few' | 'several' | 'many';

/** Generalize an exact count into a coarse band (shared with the graph-health player projection). Pure. */
function generalizeCount(count: number): BundleCountBand {
	if (count <= 0) return 'none';
	if (count <= 2) return 'few';
	if (count <= 5) return 'several';
	return 'many';
}

/**
 * The DETERMINISTIC content of a semantic bundle — the bounded, actor-filtered facts. This is the SOURCE
 * OF TRUTH and is COMPLETE on its own (AI off). It carries ONLY the subset relevant to the bundle kind;
 * unused fields are `null`/empty. Every populated field is derived from an actor-filtered read.
 */
export interface BundleContent {
	/** The prep/recap digest subset (threads/changes/handouts/combat/calendar/continuity). `null` when N/A. */
	digest: PrepRecapDigest | null;
	/** The DM graph-health report (coverage gaps + grade). `null` for a non-DM or a non-health bundle. */
	health: GraphHealthReport | null;
	/** The calendar / custom-time context (MCP-013): current date + visible past/upcoming dated links. */
	calendar: BundleCalendarContext | null;
	/** The visible date-relationship graph overview (MCP-013), present only when dated content exists. */
	dateGraph: DateGraphIndex | null;
}

/** The MCP-013 calendar context a bundle carries: the formatted current date + bounded dated-event lines. */
export interface BundleCalendarContext {
	/** The campaign current date, formatted (stable display string), or `null` when unset. */
	currentDateDisplay: string | null;
	/** Bounded, visible PAST dated events (most-recent first): a formatted date + the DM-authored label. */
	past: BundleDatedEvent[];
	/** Bounded, visible UPCOMING dated events (soonest first): a formatted date + the DM-authored label. */
	upcoming: BundleDatedEvent[];
}

/** ONE dated event line in a bundle: the formatted custom date + the DM-authored label (no target content). */
export interface BundleDatedEvent {
	/** The calendar link id (a stable, opaque ref — also used as the citation ref). */
	id: string;
	/** The formatted custom date display string (CONTENT-011 formatting; stable). */
	dateDisplay: string;
	/** The DM-authored label (safe to show; never derived from a hidden target's content). */
	label: string;
}

/** How the bundle was bounded: whether semantic compression was applied + what it dropped. */
export interface BundleCompression {
	/** The per-section item budget the bundle was bounded to (MCP-006 AC2). */
	budget: number;
	/** True when the composed deterministic content EXCEEDED the budget and was summarized (AC2). */
	applied: boolean;
	/** The generalized count of items omitted by compression (a band, so it never reveals an exact total). */
	omittedBand: BundleCountBand;
}

/** The status of the optional AI annotation over the bundle (re-exported boundary status; labelled). */
export type BundleAiStatus = AiAnnotationStatus;

/**
 * THE SEMANTIC BUNDLE: the bounded, source-cited, calendar-aware context PACKAGE. The deterministic
 * `content` is the source of truth (complete with AI off); `aiAnnotation` is the OPTIONAL, LABELLED,
 * non-authoritative AI layer held SEPARATE from the facts.
 */
export interface SemanticBundle {
	kind: SemanticBundleKind;
	/** The mode of the underlying digest (prep vs recap), for prep/recap/continuity bundles; else `null`. */
	mode: DigestMode | null;
	/** True only for the DM (the full bundle). A non-DM gets the generalized, fail-closed bundle. */
	dmScoped: boolean;
	/** The bounded, actor-filtered DETERMINISTIC content — the source of truth (complete with AI off). */
	content: BundleContent;
	/** Bounded source citations (id/kind only — never content). Empty when the bundle has no findings. */
	citations: BundleCitation[];
	/** How the bundle was bounded (semantic compression evidence, MCP-006 AC2). */
	compression: BundleCompression;
	/**
	 * MCP-006 AC1 — the GENERALIZED player-scoped summary. Present ONLY on a NON-DM bundle: coarse coverage
	 * bands with NO findings/ids/exact dates, so a player-scoped bundle can never reveal hidden content or a
	 * count that betrays it. `null` for the DM (the DM gets the full `content` instead).
	 */
	playerSummary: PlayerScopedHealthSummary | null;
	/**
	 * MCP-007 / MCP-008 — the OPTIONAL, LABELLED, NON-AUTHORITATIVE AI annotation over the bundle's
	 * deterministic facts. `null` when AI is off/absent/unavailable (the default) — the bundle is complete
	 * without it. Always marked `aiGenerated: true`, `authoritative: false`, and held SEPARATE from `content`.
	 */
	aiAnnotation: AiAnnotation | null;
	/** The labelled status of the AI layer (`deterministic` by default; degrades fail-closed). */
	aiStatus: BundleAiStatus;
}

/** The default per-section item budget a bundle is bounded to (MCP-006 AC2 — semantic compression). */
export const DEFAULT_BUNDLE_ITEM_BUDGET = 8 as const;

/** Options for assembling a bundle: item budget, calendar format, and the OPTIONAL AI capability/annotator. */
export interface SemanticBundleOptions {
	/** The explicit "now" instant the campaign-health staleness is measured against (no ambient clock). */
	referenceInstant: string;
	/** The per-section item budget (defaults to {@link DEFAULT_BUNDLE_ITEM_BUDGET}). Bounds compression. */
	itemBudget?: number;
	/** The calendar display format for dated events (defaults to `medium`). */
	format?: CalendarDateFormat;
	/** MCP-008 — the detected AI runtime capability. Defaults to {@link AI_ABSENT_CAPABILITY} (deterministic). */
	aiCapability?: AiCapability;
	/** MCP-007 — the OPTIONAL AI annotator (a permitted annotative role). Absent ⇒ deterministic-only. */
	aiAnnotator?: AiAnnotator<BundleContent>;
}

/** The inputs every bundle reads — the durable Processing-Core state slices + the acting actor. */
export interface SemanticBundleInputs {
	session: SessionState;
	content: VaultContentState;
	maps: MapState;
	characters: CharacterState;
	permissions: PermissionState;
	sync: OperationLog;
	actorId: string;
}

/** Whether a bundle kind looks back (recap) vs forward (prep). Drives the underlying digest mode. */
function digestModeFor(kind: SemanticBundleKind): DigestMode {
	return kind === 'session-recap' ? 'recap' : 'prep';
}

/**
 * Bound a list to the budget, returning the kept head + how many were omitted. Deterministic: the caller
 * passes the list ALREADY in highest-signal-first order, so compression always keeps the same head. This is
 * the SEMANTIC COMPRESSION primitive (MCP-006 AC2) — it chooses a bounded summary over the raw full list.
 */
function boundToBudget<T>(items: readonly T[], budget: number): { kept: T[]; omitted: number } {
	if (budget <= 0) return { kept: [], omitted: items.length };
	if (items.length <= budget) return { kept: [...items], omitted: 0 };
	return { kept: items.slice(0, budget), omitted: items.length - budget };
}

/**
 * MCP-006 — build the DM bundle's DETERMINISTIC content for a kind, bounding each section to the budget and
 * collecting citations. The digest/health are the actor-filtered DM reads (already DM-gated internally), so
 * every datum is visible and every citation references a visible source. Returns the content + citations +
 * the total compression bookkeeping.
 */
function buildDmContent(
	kind: SemanticBundleKind,
	inputs: SemanticBundleInputs,
	budget: number,
	referenceInstant: string,
	format: CalendarDateFormat,
): { content: BundleContent; citations: BundleCitation[]; omitted: number } {
	const mode = digestModeFor(kind);
	const citations: BundleCitation[] = [];
	let omitted = 0;

	// The digest powers prep/recap/continuity/open-threads. Health-only bundles do not need it.
	const needsDigest =
		kind === 'session-prep' ||
		kind === 'session-recap' ||
		kind === 'continuity' ||
		kind === 'open-threads';
	let digest: PrepRecapDigest | null = null;
	let calendar: BundleCalendarContext | null = null;
	let dateGraph: DateGraphIndex | null = null;

	if (needsDigest) {
		const full = getPrepRecapDigest(
			inputs.session,
			inputs.content,
			inputs.maps,
			inputs.characters,
			inputs.permissions,
			inputs.sync,
			inputs.actorId,
			mode,
			{ format },
		);
		// SEMANTIC COMPRESSION (AC2): bound each digest section to the budget rather than carrying the raw
		// full lists. Open-threads bundle keeps ONLY the threads (the smallest, most-focused package).
		const threads = boundToBudget(full.unresolvedThreads, budget);
		omitted += threads.omitted;
		for (const thread of threads.kept) citations.push({ kind: 'thread', ref: thread.panelId });

		const onlyThreads = kind === 'open-threads';
		const changes = onlyThreads ? { kept: [], omitted: 0 } : boundToBudget(full.recentChanges, budget);
		omitted += changes.omitted;
		for (const change of changes.kept) citations.push({ kind: change.entityType, ref: change.entityId });

		const handouts = onlyThreads ? { kept: [], omitted: 0 } : boundToBudget(full.handoutOutcomes, budget);
		omitted += handouts.omitted;
		for (const handout of handouts.kept) citations.push({ kind: 'handout', ref: handout.handoutId });

		const prompts = boundToBudget(full.continuityPrompts, budget);
		omitted += prompts.omitted;

		digest = {
			...full,
			unresolvedThreads: threads.kept,
			recentChanges: changes.kept,
			handoutOutcomes: handouts.kept,
			continuityPrompts: prompts.kept,
		};

		// MCP-013 calendar context: include ONLY when the visible source data actually carries dates.
		if (full.calendarContext.currentDate || full.calendarContext.past.length > 0 || full.calendarContext.upcoming.length > 0) {
			calendar = buildCalendarContext(full.calendarContext, budget, citations);
		}
	} else {
		// COVERAGE / CAMPAIGN-HEALTH bundles read the calendar context directly (no digest needed).
		const context = getCalendarContextForActor(
			inputs.session,
			inputs.content,
			inputs.maps,
			inputs.permissions,
			inputs.actorId,
			format,
		);
		if (context.currentDate || context.past.length > 0 || context.upcoming.length > 0) {
			calendar = buildCalendarContext(context, budget, citations);
		}
	}

	// COVERAGE GAPS / CAMPAIGN HEALTH ← the DM graph-health report (already DM-gated). Bounded by section.
	let health: GraphHealthReport | null = null;
	if (kind === 'coverage-gaps' || kind === 'campaign-health') {
		const fullHealth = getGraphHealthForDm(
			inputs.content,
			inputs.permissions,
			inputs.actorId,
			referenceInstant,
		);
		const stale = boundToBudget(fullHealth.staleNotes, budget);
		const missing = boundToBudget(fullHealth.missingLinks, budget);
		const gaps = boundToBudget(fullHealth.contentGaps, budget);
		const threads = boundToBudget(fullHealth.openThreads, budget);
		omitted += stale.omitted + missing.omitted + gaps.omitted + threads.omitted;
		for (const note of stale.kept) citations.push({ kind: 'note', ref: note.itemId });
		for (const link of missing.kept) citations.push({ kind: 'note', ref: link.sourceId });
		for (const gap of gaps.kept) citations.push({ kind: 'note', ref: gap.itemId });
		health = {
			...fullHealth,
			staleNotes: stale.kept,
			missingLinks: missing.kept,
			contentGaps: gaps.kept,
			openThreads: threads.kept,
		};
	}

	// MCP-013 campaign-health includes the visible DATE-RELATIONSHIP graph overview when dated content exists.
	if (kind === 'campaign-health') {
		const index = getDateGraphIndexForActor(
			inputs.content,
			inputs.session,
			inputs.maps,
			inputs.permissions,
			inputs.actorId,
			format,
		);
		if (index.nodes.length > 0) dateGraph = index;
	}

	return { content: { digest, health, calendar, dateGraph }, citations, omitted };
}

/**
 * MCP-013 — project the SES-012 calendar context into the bundle's bounded calendar context, adding a
 * citation per dated event. Each event carries ONLY the formatted date + the DM-authored label (never the
 * resolved target's title), so an `unavailable` (hidden/deleted-target) link contributes a dated marker
 * without leaking content. Bounded by the budget (AC2). The citation ref is the link id (opaque).
 */
function buildCalendarContext(
	context: { currentDate: { display: string } | null; past: readonly { id: string; date: { display: string }; label: string }[]; upcoming: readonly { id: string; date: { display: string }; label: string }[] },
	budget: number,
	citations: BundleCitation[],
): BundleCalendarContext {
	// Past most-recent-first; upcoming soonest-first (the context is date-ascending, so reverse the past).
	const pastBounded = boundToBudget([...context.past].reverse(), budget);
	const upcomingBounded = boundToBudget(context.upcoming, budget);
	const past: BundleDatedEvent[] = pastBounded.kept.map((link) => {
		citations.push({ kind: 'calendar', ref: link.id });
		return { id: link.id, dateDisplay: link.date.display, label: link.label };
	});
	const upcoming: BundleDatedEvent[] = upcomingBounded.kept.map((link) => {
		citations.push({ kind: 'calendar', ref: link.id });
		return { id: link.id, dateDisplay: link.date.display, label: link.label };
	});
	return {
		currentDateDisplay: context.currentDate?.display ?? null,
		past,
		upcoming,
	};
}

/** The fail-closed EMPTY deterministic content (a non-DM bundle carries no findings). */
const EMPTY_CONTENT: BundleContent = Object.freeze({
	digest: null,
	health: null,
	calendar: null,
	dateGraph: null,
});

/**
 * MCP-006 / MCP-013 — assemble a semantic bundle, fail closed. The DM gets the full bounded, source-cited,
 * calendar-aware deterministic content; a NON-DM (or unknown) actor gets a GENERALIZED player summary with
 * NO findings, NO citations, NO exact dates (MCP-006 AC1 / MCP-013 AC2). The deterministic content is
 * COMPLETE with AI OFF; the OPTIONAL AI annotation (MCP-007/008) is applied via the {@link applyAiAnnotation}
 * boundary and held SEPARATE, dropped fail-closed when AI is off/absent/unavailable.
 *
 * Pure + deterministic for a given (inputs, kind, options): no GUI, no storage, no ambient clock (the
 * staleness reference instant is passed explicitly), no embedded model.
 */
export function buildSemanticBundle(
	inputs: SemanticBundleInputs,
	kind: SemanticBundleKind,
	options: SemanticBundleOptions,
): SemanticBundle {
	const budget = options.itemBudget ?? DEFAULT_BUNDLE_ITEM_BUDGET;
	const format = options.format ?? 'medium';
	const mode = digestModeFor(kind);
	const actor = inputs.permissions.actors[inputs.actorId];
	const isDm = actor?.role === 'dm';

	// NON-DM / UNKNOWN ACTOR — fail closed: NO findings, NO citations, NO exact dates. ONLY a generalized
	// coverage summary (MCP-006 AC1, dm-only) so even an aggregate count cannot betray hidden content. The
	// player summary itself is computed over the player's OWN visible graph (already actor-filtered) and is
	// generalized into coarse bands by `getPlayerScopedHealthSummary`.
	if (!isDm) {
		const playerSummary = getPlayerScopedHealthSummary(
			inputs.content,
			inputs.permissions,
			inputs.actorId,
			options.referenceInstant,
		);
		return {
			kind,
			mode: kind === 'coverage-gaps' || kind === 'campaign-health' ? null : mode,
			dmScoped: false,
			content: EMPTY_CONTENT,
			citations: [],
			compression: { budget, applied: false, omittedBand: 'none' },
			playerSummary,
			aiAnnotation: null,
			aiStatus: { state: 'deterministic', reason: null },
		};
	}

	// DM bundle — the full bounded, source-cited, calendar-aware deterministic content.
	const built = buildDmContent(kind, inputs, budget, options.referenceInstant, format);

	// MCP-007 / MCP-008 — the OPTIONAL labelled AI annotation over the (visible) deterministic content. The
	// annotator reads ONLY `built.content` (already actor-filtered + bounded), produces only text, and is
	// dropped fail-closed when AI is off/absent/unavailable. The bundle is complete without it.
	const ai = applyAiAnnotation(
		built.content,
		options.aiCapability ?? AI_ABSENT_CAPABILITY,
		options.aiAnnotator,
	);

	return {
		kind,
		mode: kind === 'coverage-gaps' || kind === 'campaign-health' ? null : mode,
		dmScoped: true,
		content: built.content,
		citations: built.citations,
		compression: {
			budget,
			applied: built.omitted > 0,
			omittedBand: generalizeCount(built.omitted),
		},
		playerSummary: null,
		aiAnnotation: ai.annotation,
		aiStatus: ai.status,
	};
}
