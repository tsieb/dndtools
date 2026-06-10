import { describe, expect, it } from 'vitest';
import {
	AI_ANNOTATIVE_ROLES,
	AI_FORBIDDEN_ROLES,
	applyAiAnnotation,
	getGraphHealthForDm,
	getPlayerScopedHealthSummary,
	isAiAnnotativeRole,
	isAiCapabilityRunnable,
	isAiForbiddenRole,
	type AiAnnotator,
	type AiCapability,
} from '../src';
import { DM_ACTOR, buildInitialState } from '../src/testing/fixtures';

/**
 * MCP-007 — AI AGENTS ARE LIMITED TO CREATIVE TEXT ASSISTANCE, NARRATIVE SUGGESTIONS, NAMED ENTITY
 * EXTRACTION, AND EXPLANATION OVER DETERMINISTIC FINDINGS; they do NOT own graph intelligence,
 * relationship scoring, sync conflict resolution, or permission decisions.
 * MCP-008 — LOCAL AI INTEGRATIONS ARE OPTIONAL AND CAPABILITY-DETECTED, with deterministic non-AI
 * fallbacks for every Must-have workflow.
 *
 * The AI-boundary contract formalizes the architectural rule that AI is OPTIONAL and ANNOTATIVE — never
 * load-bearing, never authoritative, never a mutation path, never a visibility bypass. These tests prove:
 *
 *   - MCP-007 AC1: a DETERMINISTIC finding (here graph relationship scoring) is produced with AI disabled.
 *   - MCP-007 AC2: an AI suggestion is NON-AUTHORITATIVE and produces NO state change — only labelled text.
 *   - MCP-007: AI can only perform a permitted ANNOTATIVE role; a FORBIDDEN load-bearing role is refused.
 *   - MCP-008 AC1: with no model runtime (absent capability), the deterministic content still works.
 *   - MCP-008 AC2: an available model reports capability; an unavailable one degrades without blocking.
 */

const TYPED_FACTS = { headline: 'Coverage grade 80/100.', findings: 3 } as const;
type Facts = typeof TYPED_FACTS;

const CAP_ABSENT: AiCapability = { state: 'absent', detail: null };
const CAP_DISABLED: AiCapability = { state: 'present-but-disabled', detail: null };
const CAP_AVAILABLE: AiCapability = { state: 'available', detail: null };
const CAP_UNAVAILABLE: AiCapability = { state: 'unavailable', detail: 'Local model offline.' };

/** A permitted explanation annotator: it reads ONLY the deterministic facts and returns TEXT lines. */
const explainer: AiAnnotator<Facts> = {
	role: 'explanation',
	annotate: (facts) => [`AI: the campaign is at ${facts.headline} with ${facts.findings} findings to address.`],
};

describe('MCP-007 — the annotative-role allowlist matches the requirement statement', () => {
	it('the allowlist is exactly creative text / narrative suggestion / named-entity extraction / explanation', () => {
		expect([...AI_ANNOTATIVE_ROLES].sort()).toEqual(
			['creative-text', 'explanation', 'named-entity-extraction', 'narrative-suggestion'].sort(),
		);
	});

	it('the forbidden, load-bearing concerns are disjoint from the annotative allowlist', () => {
		for (const role of AI_FORBIDDEN_ROLES) {
			expect(isAiAnnotativeRole(role)).toBe(false);
			expect(isAiForbiddenRole(role)).toBe(true);
		}
		for (const role of AI_ANNOTATIVE_ROLES) {
			expect(isAiForbiddenRole(role)).toBe(false);
		}
	});

	it('names graph intelligence, relationship scoring, conflict resolution, and permission decisions as forbidden', () => {
		expect([...AI_FORBIDDEN_ROLES].sort()).toEqual(
			['graph-intelligence', 'permission-decision', 'relationship-scoring', 'sync-conflict-resolution'].sort(),
		);
	});
});

describe('MCP-007 AC1 — deterministic findings are produced with AI disabled', () => {
	it('graph relationship scoring (a deterministic finding) runs with no AI involved', () => {
		const state = buildInitialState(DM_ACTOR);
		// The graph health report (which includes the relationship-quality scoring) is computed purely.
		const report = getGraphHealthForDm(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'2026-06-05T00:00:00.000Z',
		);
		// It exists and is well-formed WITHOUT any AI call — algorithms own graph intelligence (MCP-007).
		expect(report.coverage.overall).toBeGreaterThanOrEqual(0);
		expect(report.coverage.overall).toBeLessThanOrEqual(100);
		expect(Array.isArray(report.staleNotes)).toBe(true);
	});
});

describe('MCP-008 AC1 — the deterministic content stands alone with no model runtime', () => {
	it('with an ABSENT capability, applyAiAnnotation yields no annotation and a deterministic status', () => {
		const result = applyAiAnnotation(TYPED_FACTS, CAP_ABSENT, explainer);
		expect(result.annotation).toBeNull();
		expect(result.status.state).toBe('deterministic');
	});

	it('with no annotator at all, the surface is plain deterministic (the default)', () => {
		const result = applyAiAnnotation(TYPED_FACTS, CAP_AVAILABLE, undefined);
		expect(result.annotation).toBeNull();
		expect(result.status.state).toBe('deterministic');
	});

	it('a present-but-disabled model is treated as off (deterministic, no annotation)', () => {
		const result = applyAiAnnotation(TYPED_FACTS, CAP_DISABLED, explainer);
		expect(result.annotation).toBeNull();
		expect(result.status.state).toBe('deterministic');
	});
});

describe('MCP-008 AC2 — capability detection: available reports; unavailable degrades without blocking', () => {
	it('isAiCapabilityRunnable is true ONLY for an available model', () => {
		expect(isAiCapabilityRunnable(CAP_AVAILABLE)).toBe(true);
		expect(isAiCapabilityRunnable(CAP_ABSENT)).toBe(false);
		expect(isAiCapabilityRunnable(CAP_DISABLED)).toBe(false);
		expect(isAiCapabilityRunnable(CAP_UNAVAILABLE)).toBe(false);
	});

	it('an UNAVAILABLE model degrades — the annotation is dropped but the status is labelled, never an error', () => {
		const result = applyAiAnnotation(TYPED_FACTS, CAP_UNAVAILABLE, explainer);
		expect(result.annotation).toBeNull();
		expect(result.status.state).toBe('ai-unavailable');
		// The reason is a generic, non-leaking string the GUI can surface.
		expect(result.status.reason).toBe('Local model offline.');
	});

	it('an AVAILABLE model produces a LABELLED, NON-AUTHORITATIVE annotation, separate from the facts', () => {
		const result = applyAiAnnotation(TYPED_FACTS, CAP_AVAILABLE, explainer);
		expect(result.status.state).toBe('ai-applied');
		expect(result.annotation).not.toBeNull();
		// The annotation is structurally labelled AI-generated and never authoritative.
		expect(result.annotation!.aiGenerated).toBe(true);
		expect(result.annotation!.authoritative).toBe(false);
		expect(result.annotation!.role).toBe('explanation');
		expect(result.annotation!.lines[0]).toContain('AI:');
	});
});

describe('MCP-007 — AI can never own a load-bearing concern (a forbidden role is refused fail closed)', () => {
	it('an annotator declaring a FORBIDDEN role is refused; only the deterministic content remains', () => {
		const rogue = {
			// Someone tries to wire AI to relationship scoring — a deterministic Core concern.
			role: 'relationship-scoring',
			annotate: () => ['AI claims score 0.99'],
		} as unknown as AiAnnotator<Facts>;
		const result = applyAiAnnotation(TYPED_FACTS, CAP_AVAILABLE, rogue);
		// REFUSED: no annotation is produced, even though the model is available.
		expect(result.annotation).toBeNull();
		expect(result.status.state).toBe('deterministic');
	});

	it('the annotator that ran cannot mutate the facts it was given (it only returns text)', () => {
		// The boundary passes the facts to a pure annotator; the original object is unchanged.
		const facts = { ...TYPED_FACTS };
		applyAiAnnotation(facts, CAP_AVAILABLE, explainer);
		expect(facts).toEqual(TYPED_FACTS);
	});
});

describe('MCP-007 AC2 — an AI suggestion is non-authoritative and changes no state', () => {
	it('a deterministic surface is identical whether or not an AI annotation accompanies it', () => {
		const state = buildInitialState(DM_ACTOR);
		const before = getPlayerScopedHealthSummary(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'2026-06-05T00:00:00.000Z',
		);
		// Running an AI annotation over arbitrary facts does not, and cannot, touch the deterministic read.
		applyAiAnnotation(TYPED_FACTS, CAP_AVAILABLE, explainer);
		const after = getPlayerScopedHealthSummary(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'2026-06-05T00:00:00.000Z',
		);
		expect(after).toEqual(before);
	});
});
