/**
 * MCP-007 / MCP-008 — THE AI-BOUNDARY CONTRACT: the architectural rule, as enforceable Processing-Core
 * code, that AI is OPTIONAL and ANNOTATIVE — never load-bearing, never authoritative, never a mutation
 * path, and never a visibility bypass (Vision "AI supplements algorithms"; Cross-Contract Non-Negotiable
 * 7: "AI is supplementary; algorithmic graph/search/suggestion systems remain deterministic core
 * features").
 *
 * The codebase already proves this boundary in TWO concrete seams — the search `SemanticAssist` re-rank
 * (`queries/search-query.ts`, SRCH-011) and the graph-health `HealthAiExplainer` (`state/graph-health.ts`,
 * GRAPH-007 AC2). Both share the SAME shape: a deterministic base that is the source of truth, an OPTIONAL
 * provider-agnostic seam (`enabled` / `available?` / a pure transform over ALREADY-VISIBLE data), and a
 * LABELLED status that degrades to the deterministic base when AI is off/unavailable. This module does NOT
 * invent a parallel seam — it FORMALIZES that established pattern into ONE reusable contract the MCP
 * semantic-bundle tools (and any future AI surface) compose, so the boundary is enforced uniformly:
 *
 *   1. CAPABILITY DETECTION (MCP-008) — AI is OPTIONAL and capability-detected. {@link AiCapability} is the
 *      detected runtime state (absent / present-but-disabled / available / unavailable). Every Must-have
 *      workflow has a deterministic non-AI fallback, so the bundle is COMPLETE with AI off (the default).
 *   2. ALLOWED ROLES (MCP-007) — an AI annotation may ONLY perform a permitted role: creative text
 *      assistance, narrative suggestion, named-entity extraction, or explanation OVER deterministic
 *      findings. It may NOT own graph intelligence, relationship scoring, sync conflict resolution, or
 *      permission decisions — those are deterministic Core concerns. {@link AI_ANNOTATIVE_ROLES} is the
 *      closed allowlist; {@link AI_FORBIDDEN_ROLES} names the load-bearing concerns AI can never own.
 *   3. ANNOTATION ENVELOPE — an AI contribution is carried in a LABELLED, SEPARATED envelope
 *      ({@link AiAnnotation}) that is plainly marked AI-generated and held APART from the deterministic
 *      facts, so a consumer can never mistake an AI suggestion for an authoritative finding.
 *   4. FAIL CLOSED — {@link applyAiAnnotation} runs an OPTIONAL annotator over the deterministic content
 *      and returns the annotation + a {@link AiAnnotationStatus}. The deterministic content is ALWAYS
 *      returned unchanged; the annotator can read only what it is given (already actor-filtered), produces
 *      only text, mutates nothing, and is dropped entirely when AI is off/unavailable.
 *
 * Pure + deterministic: with AI off (the default) the same inputs always yield the same `disabled`
 * annotation. Per ADR-014 a final AI/model architecture is deferred, so this embeds NO model — it is the
 * provider-agnostic boundary the future sidecar plugs an optional model into.
 */

/**
 * MCP-008 — the DETECTED AI runtime CAPABILITY. AI is optional and capability-detected; this is the state a
 * caller (the GUI / future sidecar) reports so the bundle layer can decide whether to even offer an
 * annotation. EVERY state has the SAME guarantee: the deterministic bundle is complete and correct.
 *
 *   - `absent`               — no local model runtime is installed/configured (MCP-008 AC1). The default.
 *   - `present-but-disabled` — a model exists but the DM has not enabled AI assistance. Off by choice.
 *   - `available`            — a model is installed AND enabled AND currently reachable.
 *   - `unavailable`          — a model is enabled but currently unreachable (e.g. offline) (MCP-008 AC2).
 */
export type AiCapabilityState = 'absent' | 'present-but-disabled' | 'available' | 'unavailable';

/**
 * MCP-008 — the reported AI capability. `state` is the detected runtime state; `detail` is a generic,
 * non-leaking human string the GUI surfaces (e.g. "Local model offline") — never an internal path/secret.
 */
export interface AiCapability {
	state: AiCapabilityState;
	/** A generic, non-leaking status string for the GUI; `null` when there is nothing to report. */
	detail: string | null;
}

/** The fail-closed default capability: no model present, deterministic-only. Used when none is reported. */
export const AI_ABSENT_CAPABILITY: AiCapability = Object.freeze({ state: 'absent', detail: null });

/**
 * MCP-008 — whether the reported capability can actually RUN an annotation. Only `available` can; every
 * other state means the deterministic content stands alone (AI off/absent/unreachable). Fail closed: an
 * unknown/under-reported capability is treated as not-runnable. Pure.
 */
export function isAiCapabilityRunnable(capability: AiCapability): boolean {
	return capability.state === 'available';
}

/**
 * MCP-007 — the CLOSED allowlist of roles an AI annotation may perform. These are the ONLY things AI is
 * permitted to do (Vision: "creative text assistance, narrative suggestions, named entity extraction" +
 * "explanation over deterministic findings"). Each is purely ANNOTATIVE — it transforms or describes
 * already-computed, already-visible deterministic content into text; it never computes an authoritative
 * value. Declared as a const tuple so the registry, the bundle layer, and the tests share ONE source of
 * truth and a typo can never silently widen what AI may do.
 */
export const AI_ANNOTATIVE_ROLES = [
	/** Draft / polish prose over visible content (e.g. a read-aloud paragraph for a prep note). */
	'creative-text',
	/** Suggest narrative beats / hooks derived from visible deterministic findings. */
	'narrative-suggestion',
	/** Extract named entities (people/places/things) from visible text. */
	'named-entity-extraction',
	/** Explain / summarize the deterministic findings in natural language (no new facts). */
	'explanation',
] as const;

export type AiAnnotativeRole = (typeof AI_ANNOTATIVE_ROLES)[number];

/**
 * MCP-007 — the load-bearing concerns AI can NEVER own. These are DETERMINISTIC Processing-Core
 * responsibilities (Vision: "It does not own graph intelligence or relationship scoring — algorithms
 * do"; the permission + conflict models are Contract-3/Contract-2 Core concerns). They are listed
 * explicitly so a test can assert none of them is ever an annotative role, and so the rule is documented
 * where it is enforced rather than only in prose.
 */
export const AI_FORBIDDEN_ROLES = [
	/** Graph intelligence (relationship discovery/quality) — owned by GRAPH-003/007 deterministic engines. */
	'graph-intelligence',
	/** Relationship scoring — owned by the deterministic graph-quality scorer. */
	'relationship-scoring',
	/** Sync conflict resolution — owned by the deterministic conflict model (Contract 2). */
	'sync-conflict-resolution',
	/** Permission/visibility decisions — owned by the deterministic permission model (Contract 3). */
	'permission-decision',
] as const;

export type AiForbiddenRole = (typeof AI_FORBIDDEN_ROLES)[number];

/** MCP-007 — whether a role is in the annotative allowlist. Fail closed: an unknown role is NOT allowed. Pure. */
export function isAiAnnotativeRole(role: string): role is AiAnnotativeRole {
	return (AI_ANNOTATIVE_ROLES as readonly string[]).includes(role);
}

/**
 * MCP-007 — whether a role is a FORBIDDEN, load-bearing concern AI may never own. A forbidden role is, by
 * construction, disjoint from the annotative allowlist (asserted in tests), so a single check classifies a
 * proposed role as deterministic-only. Pure.
 */
export function isAiForbiddenRole(role: string): role is AiForbiddenRole {
	return (AI_FORBIDDEN_ROLES as readonly string[]).includes(role);
}

/**
 * THE LABELLED AI ANNOTATION ENVELOPE. An AI contribution NEVER replaces a deterministic value and is
 * NEVER merged into the facts — it is carried in this separate, plainly-labelled envelope so a consumer
 * can render it as clearly AI-generated and apart from the authoritative findings:
 *
 *   - `aiGenerated` is ALWAYS true here (the type exists only to mark AI text), so the label is structural,
 *     not a flag a caller might forget to set.
 *   - `authoritative` is ALWAYS false: an annotation is a SUGGESTION over deterministic facts, never a
 *     finding the app acts on. (MCP-007 AC2 — an AI suggestion needs a human/Core command before any state
 *     change; this surface produces NO command at all.)
 *   - `role` is the permitted annotative role the text performed (always one of {@link AI_ANNOTATIVE_ROLES}).
 *   - `lines` is the generated text. It is derived ONLY from the already-actor-filtered deterministic
 *     content the annotator was given, so it can never carry a hidden fact.
 */
export interface AiAnnotation {
	/** Structural label: this content is AI-generated. Always true. */
	aiGenerated: true;
	/** Structural label: an annotation is never authoritative. Always false. */
	authoritative: false;
	/** The permitted annotative role this text performed (MCP-007). */
	role: AiAnnotativeRole;
	/** The generated annotation lines (text only; derived from the visible deterministic content). */
	lines: string[];
}

/**
 * The status of the OPTIONAL AI annotation over a deterministic surface, mirroring the established
 * `SemanticAssistStatus` / `HealthExplanationStatus` vocabulary so the boundary reads uniformly:
 *
 *   - `deterministic` — AI is off/absent (the default). NO annotation; the deterministic content stands alone.
 *   - `ai-applied`    — an annotation was produced and is carried in the LABELLED envelope, SEPARATE from facts.
 *   - `ai-unavailable`— AI was enabled but unreachable; the deterministic content is returned unchanged.
 */
export interface AiAnnotationStatus {
	state: 'deterministic' | 'ai-applied' | 'ai-unavailable';
	/** A generic, non-leaking reason when `ai-unavailable` (e.g. "offline"); else `null`. */
	reason: string | null;
}

/**
 * MCP-007 / MCP-008 — the OPTIONAL, provider-agnostic AI ANNOTATOR seam. A caller supplies it ONLY when the
 * DM enabled AI assistance AND a model is detected; absent ⇒ the surface is deterministic-only. It is a
 * thin seam (a final model is deferred per ADR-014):
 *
 *   - `role` declares which permitted annotative role the annotator performs (MCP-007). A `role` NOT in the
 *     allowlist is REFUSED by {@link applyAiAnnotation} — AI can never be wired to a forbidden concern.
 *   - `annotate` is a PURE transform that receives ONLY the deterministic facts the bundle already computed
 *     (already actor-filtered, already visible) and returns TEXT lines. It cannot read raw state, cannot
 *     return a structured value, and cannot dispatch a command — so it can never add a hidden fact, change
 *     a score, or mutate state. Any text it returns is held in the labelled, non-authoritative envelope.
 */
export interface AiAnnotator<TFacts> {
	/** The permitted annotative role this annotator performs (must be in {@link AI_ANNOTATIVE_ROLES}). */
	role: AiAnnotativeRole;
	/** A pure annotator over the deterministic facts → text lines. Reads only the given (visible) facts. */
	annotate: (facts: TFacts) => string[];
}

/** The result of an optional annotation: the labelled envelope (or `null`) + the labelled status. */
export interface AiAnnotationResult {
	/** The labelled, non-authoritative AI annotation, or `null` when AI is off/absent/unavailable/refused. */
	annotation: AiAnnotation | null;
	status: AiAnnotationStatus;
}

/** The fail-closed result when there is no annotation (AI off/absent). Reused so the default is one object. */
const DETERMINISTIC_RESULT: AiAnnotationResult = Object.freeze({
	annotation: null,
	status: Object.freeze({ state: 'deterministic', reason: null }),
});

/**
 * MCP-007 / MCP-008 — run an OPTIONAL AI annotation over the deterministic `facts`, fail closed. The
 * deterministic content is the caller's source of truth and is NEVER touched here; this only decides
 * whether a LABELLED, NON-AUTHORITATIVE annotation accompanies it. The gates, most-restrictive-first:
 *
 *   1. NO ANNOTATOR / NOT RUNNABLE → `deterministic`, no annotation. When AI is off/absent (the default) or
 *      the capability is not `available`, there is simply no AI layer (MCP-008: deterministic fallback).
 *   2. ENABLED BUT UNAVAILABLE → `ai-unavailable`, no annotation. When the annotator is supplied but the
 *      detected capability is `unavailable` (e.g. offline), DEGRADE — never fail (MCP-008 AC2): the
 *      deterministic content already stands alone, so we just drop the annotation and label the status.
 *   3. FORBIDDEN ROLE → `deterministic`, no annotation. If the supplied annotator declares a role NOT in
 *      the annotative allowlist (e.g. someone wired AI to "relationship-scoring"), it is REFUSED fail
 *      closed (MCP-007): AI can never own a load-bearing concern, so its output is dropped entirely.
 *   4. APPLY → `ai-applied`. The pure annotator runs over the (visible) facts and its TEXT is wrapped in
 *      the labelled, non-authoritative envelope, SEPARATE from the deterministic content.
 *
 * Pure + deterministic for a given (facts, capability, annotator). It dispatches no command and mutates no
 * state — an AI suggestion that should change state must go through a human/Core command elsewhere
 * (MCP-007 AC2); this surface only produces labelled text.
 */
export function applyAiAnnotation<TFacts>(
	facts: TFacts,
	capability: AiCapability,
	annotator: AiAnnotator<TFacts> | undefined,
): AiAnnotationResult {
	// 1 — No annotator OR AI off/absent: deterministic-only (the default, MCP-008 fallback).
	if (!annotator) {
		return DETERMINISTIC_RESULT;
	}
	if (!isAiCapabilityRunnable(capability)) {
		// 2 — The annotator was supplied but the model is not available. If it is explicitly UNAVAILABLE
		// (enabled-but-unreachable), label `ai-unavailable` (degrade, never fail — MCP-008 AC2). Otherwise
		// (absent / present-but-disabled) AI is simply off, so the surface is plain deterministic.
		if (capability.state === 'unavailable') {
			return {
				annotation: null,
				status: { state: 'ai-unavailable', reason: capability.detail ?? 'AI annotation unavailable.' },
			};
		}
		return DETERMINISTIC_RESULT;
	}
	// 3 — Refuse a forbidden/unknown role fail closed: AI can never own a load-bearing concern (MCP-007).
	if (!isAiAnnotativeRole(annotator.role)) {
		return DETERMINISTIC_RESULT;
	}
	// 4 — Apply: the pure annotator runs over the visible facts; its TEXT is wrapped, labelled + separated.
	const lines = annotator.annotate(facts);
	return {
		annotation: { aiGenerated: true, authoritative: false, role: annotator.role, lines },
		status: { state: 'ai-applied', reason: null },
	};
}
