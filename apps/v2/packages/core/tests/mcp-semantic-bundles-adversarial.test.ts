import { describe, expect, it } from 'vitest';
import {
	buildSemanticBundle,
	dispatchCommand,
	type Actor,
	type AiAnnotator,
	type AiCapability,
	type BundleContent,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type SemanticBundle,
	type SemanticBundleInputs,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * MCP-006 / MCP-007 / MCP-008 — THE ADVERSARIAL + AI-BOUNDARY suite for the semantic bundles. It proves the
 * non-negotiables hold under hostile assumptions:
 *
 *   - AI OFF → the FULL DETERMINISTIC bundle is produced (the deterministic content is the source of truth;
 *     no AI call is load-bearing for any acceptance criterion).
 *   - A FABRICATED / HALLUCINATED AI annotation can NEVER add a hidden fact, mutate state, or be presented
 *     as authoritative — it is labelled, separated, and non-authoritative; the deterministic content the
 *     bundle was built from is byte-identical with and without the rogue annotation.
 *   - A PLAYER-SCOPED bundle OMITS DM-only content entirely (no hidden note, dated event, or count).
 */

const REFERENCE_INSTANT = '2026-06-05T00:00:00.000Z';
const HIDDEN_TITLE = 'The traitor is Lord Vex';
const HIDDEN_EVENT = 'The assassination';
const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error(`expected accepted: ${JSON.stringify(result)}`);
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

const HARPTOS = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [{ id: 'm1', name: 'Hammer', days: 30 }],
	epochLabel: 'DR',
};
const dateOf = (day: number) => ({ calendarId: 'cal-harptos', year: 1372, month: 1, day });

function inputsFor(state: CoreStateSlice, actorId: string): SemanticBundleInputs {
	return {
		session: state.session,
		content: state.content,
		maps: state.maps,
		characters: state.characters,
		permissions: state.permissions,
		sync: state.sync,
		actorId,
	};
}

/** A vault with a DM-only secret note + a DM-only dated event referencing it. */
function secretVault(env: CoreEnvironment): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
	state = accepted(dispatchCommand(state, env, cmd('command-center.ensure-home', {}))).nextState;
	const sceneId = state.commandCenter.homeSceneId!;
	state = accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS))).nextState;
	const secret = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', { kind: 'note', title: HIDDEN_TITLE, body: 'Top secret.', visibility: 'dm-only' }),
		),
	);
	state = secret.nextState;
	const ev = secret.events.find((e) => e.kind === 'content.item-changed');
	const secretId = ev && ev.kind === 'content.item-changed' ? ev.itemId : '';
	state = accepted(dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(5) }))).nextState;
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.link-calendar-date', { kind: 'note', label: HIDDEN_EVENT, date: dateOf(10), targetId: secretId }),
		),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, cmd('session.pin-quick-reference', { kind: 'open-thread', label: 'Hunt the traitor', targetId: secretId })),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'active', activeSceneId: sceneId })),
	).nextState;
	return state;
}

const CAP_AVAILABLE: AiCapability = { state: 'available', detail: null };

/**
 * A HALLUCINATING annotator: it ignores its input and fabricates an "authoritative" line claiming a hidden
 * fact and a forged number. The boundary must keep its output labelled + non-authoritative, and it must be
 * unable to inject anything into the deterministic content.
 */
const hallucinator: AiAnnotator<BundleContent> = {
	role: 'narrative-suggestion',
	annotate: () => [
		`AUTHORITATIVE FACT: ${HIDDEN_TITLE}. Coverage is exactly 42/100. There are 9999 secret notes.`,
	],
};

describe('MCP-007 / MCP-008 — AI OFF yields the full deterministic bundle (AI is never load-bearing)', () => {
	it('the deterministic content is identical with AI off and with AI producing an annotation', () => {
		const env = makeEnvironment();
		const state = secretVault(env);
		const withoutAi = buildSemanticBundle(inputsFor(state, DM_ACTOR.id), 'session-prep', {
			referenceInstant: REFERENCE_INSTANT,
		});
		const withAi = buildSemanticBundle(inputsFor(state, DM_ACTOR.id), 'session-prep', {
			referenceInstant: REFERENCE_INSTANT,
			aiCapability: CAP_AVAILABLE,
			aiAnnotator: hallucinator,
		});

		// The deterministic content + citations + compression are BYTE-IDENTICAL — AI did not change a fact.
		expect(withAi.content).toEqual(withoutAi.content);
		expect(withAi.citations).toEqual(withoutAi.citations);
		expect(withAi.compression).toEqual(withoutAi.compression);

		// AI OFF: no annotation, deterministic status — the bundle is complete on its own.
		expect(withoutAi.aiAnnotation).toBeNull();
		expect(withoutAi.aiStatus.state).toBe('deterministic');
	});

	it('an AI-unavailable bundle still carries the full deterministic content (degrade, never fail)', () => {
		const env = makeEnvironment();
		const state = secretVault(env);
		const offline = buildSemanticBundle(inputsFor(state, DM_ACTOR.id), 'session-prep', {
			referenceInstant: REFERENCE_INSTANT,
			aiCapability: { state: 'unavailable', detail: 'offline' },
			aiAnnotator: hallucinator,
		});
		const baseline = buildSemanticBundle(inputsFor(state, DM_ACTOR.id), 'session-prep', {
			referenceInstant: REFERENCE_INSTANT,
		});
		expect(offline.content).toEqual(baseline.content);
		expect(offline.aiAnnotation).toBeNull();
		expect(offline.aiStatus.state).toBe('ai-unavailable');
	});
});

describe('MCP-007 — a hallucinated annotation is labelled, separated, and non-authoritative', () => {
	it('the annotation is held in a labelled envelope, never merged into the deterministic content', () => {
		const env = makeEnvironment();
		const state = secretVault(env);
		const bundle = buildSemanticBundle(inputsFor(state, DM_ACTOR.id), 'campaign-health', {
			referenceInstant: REFERENCE_INSTANT,
			aiCapability: CAP_AVAILABLE,
			aiAnnotator: hallucinator,
		});
		// The fabricated text exists ONLY inside the labelled, non-authoritative annotation envelope.
		expect(bundle.aiAnnotation).not.toBeNull();
		expect(bundle.aiAnnotation!.aiGenerated).toBe(true);
		expect(bundle.aiAnnotation!.authoritative).toBe(false);
		// The forged "42/100" / "9999" never reaches the deterministic content (the source of truth).
		expect(JSON.stringify(bundle.content)).not.toContain('42/100');
		expect(JSON.stringify(bundle.content)).not.toContain('9999');
		// The deterministic coverage grade is the real, computed one — NOT the hallucinated number.
		expect(bundle.content.health!.coverage.overall).not.toBe(42);
	});

	it('the annotator cannot inject a hidden fact into the citations or compression metadata', () => {
		const env = makeEnvironment();
		const state = secretVault(env);
		const bundle = buildSemanticBundle(inputsFor(state, DM_ACTOR.id), 'session-prep', {
			referenceInstant: REFERENCE_INSTANT,
			aiCapability: CAP_AVAILABLE,
			aiAnnotator: hallucinator,
		});
		// Citations are id/kind pairs only — the hallucinated prose is not among them.
		for (const citation of bundle.citations) {
			expect(citation.kind).not.toContain('AUTHORITATIVE');
			expect(typeof citation.ref).toBe('string');
		}
	});
});

describe('MCP-006 / MCP-013 — a player-scoped bundle omits DM-only content under adversarial AI', () => {
	it('even with a hallucinating annotator, the player bundle never leaks the hidden note or event', () => {
		const env = makeEnvironment();
		const state = secretVault(env);
		// A player can never supply an AI annotator (the build is DM-gated before AI is even considered), but
		// even if one were forced in, the player branch returns the generalized bundle with NO findings.
		const bundle: SemanticBundle = buildSemanticBundle(inputsFor(state, PLAYER_ACTOR.id), 'campaign-health', {
			referenceInstant: REFERENCE_INSTANT,
			aiCapability: CAP_AVAILABLE,
			aiAnnotator: hallucinator,
		});
		expect(bundle.dmScoped).toBe(false);
		// No AI annotation, no findings, no citations for a non-DM.
		expect(bundle.aiAnnotation).toBeNull();
		expect(bundle.citations).toEqual([]);
		expect(bundle.content.health).toBeNull();
		expect(bundle.content.calendar).toBeNull();
		expect(bundle.content.dateGraph).toBeNull();
		// The hidden note title + hidden dated event are absent from the entire serialized player bundle.
		const serialized = JSON.stringify(bundle);
		expect(serialized).not.toContain(HIDDEN_TITLE);
		expect(serialized).not.toContain(HIDDEN_EVENT);
		// Only a generalized coverage summary is present.
		expect(bundle.playerSummary).not.toBeNull();
	});

	it('an observer (read-only, no character data) gets the same fail-closed generalized bundle', () => {
		const env = makeEnvironment();
		const state = secretVault(env);
		const bundle = buildSemanticBundle(inputsFor(state, OBSERVER_ACTOR.id), 'session-prep', {
			referenceInstant: REFERENCE_INSTANT,
		});
		expect(bundle.dmScoped).toBe(false);
		expect(bundle.content.digest).toBeNull();
		expect(JSON.stringify(bundle)).not.toContain(HIDDEN_TITLE);
	});
});
