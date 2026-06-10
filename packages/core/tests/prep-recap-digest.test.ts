import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getPrepRecapDigest,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type PrepRecapDigest,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SES-009 — the DM runs pre-session PREP and post-session RECAP workflows that GATHER unresolved threads,
 * recent changes, handout outcomes, combat summaries, and continuity prompts. The digest is a PURE
 * DERIVATION over the existing durable sources (SES-007 open threads, op-log recent changes, SES-004
 * delivery history, SES-002 combat log, SES-012 calendar context) — nothing is copied.
 *
 * Tests are the primary evidence:
 *   - the digest derives the right items from EACH source,
 *   - DM-only no-leak: a player/observer receives an EMPTY digest (hard, fail-closed),
 *   - the recap derives combat/handout outcomes from the just-ended session's archive snapshot, and
 *   - the digest is DETERMINISTIC (same inputs ⇒ same output) and needs NO AI services (AC2).
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error(`expected accepted: ${JSON.stringify(result)}`);
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

const HARPTOS_PAYLOAD = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
	],
	epochLabel: 'DR',
};
const dateOf = (month: number, day: number, year = 1372) => ({ calendarId: 'cal-harptos', year, month, day });

function digestFor(
	state: CoreStateSlice,
	actorId: string,
	mode: 'prep' | 'recap',
): PrepRecapDigest {
	return getPrepRecapDigest(
		state.session,
		state.content,
		state.maps,
		state.characters,
		state.permissions,
		state.sync,
		actorId,
		mode,
	);
}

/**
 * Build a rich active session: a calendar + dated note + open-thread quick-ref panel + a started combat +
 * a delivered handout, all on the home scene. Returns the assembled state + ids.
 */
function richSession(env: CoreEnvironment): {
	state: CoreStateSlice;
	sceneId: string;
	threadItemId: string;
	handoutId: string;
} {
	let state = base();
	// Home scene + active session.
	state = accepted(dispatchCommand(state, env, cmd('command-center.ensure-home', {}))).nextState;
	const sceneId = state.commandCenter.homeSceneId!;

	// CONTENT-011 calendar + an open-thread note + a future dated event (calendar context).
	state = accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS_PAYLOAD))).nextState;
	const threadNote = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: 'Who poisoned the duke?',
				body: 'Unresolved.',
				visibility: 'dm-only',
			}),
		),
	);
	state = threadNote.nextState;
	const threadEvent = threadNote.events.find((e) => e.kind === 'content.item-changed');
	const threadItemId = threadEvent && threadEvent.kind === 'content.item-changed' ? threadEvent.itemId : '';

	state = accepted(dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(1, 10) }))).nextState;
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.link-calendar-date', { kind: 'event', label: 'The duke’s funeral', date: dateOf(1, 20) }),
		),
	).nextState;

	// SES-007 — pin the note as an OPEN THREAD.
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.pin-quick-reference', { kind: 'open-thread', label: 'Poison mystery', targetId: threadItemId }),
		),
	).nextState;

	// Activate the session (combat/handout writes are active-session-gated).
	state = accepted(
		dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'active', activeSceneId: sceneId })),
	).nextState;

	// SES-002 — start a combat with two combatants (creates an encounter log).
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('combat.start', {
				combatants: [
					{ name: 'Goblin', kind: 'monster', initiative: 12, maxHp: 7, ac: 13 },
					{ name: 'Bandit', kind: 'monster', initiative: 9, maxHp: 11, ac: 12 },
				],
			}),
		),
	).nextState;
	state = accepted(dispatchCommand(state, env, cmd('combat.advance-turn', {}))).nextState;

	// SES-004 — deliver a handout to Player A.
	const delivered = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.deliver-handout', {
				title: 'The cryptic letter',
				sceneId,
				recipientActorIds: [PLAYER_ACTOR.id],
				sections: [{ heading: 'Opening', body: 'A sealed letter.', visibility: 'player-visible' }],
			}),
		),
	);
	state = delivered.nextState;
	const handoutEvent = delivered.events.find((e) => e.kind === 'session.handout-delivered');
	const handoutId = handoutEvent && handoutEvent.kind === 'session.handout-delivered' ? handoutEvent.handoutId : '';

	return { state, sceneId, threadItemId, handoutId };
}

describe('SES-009: prep digest derives items from each source (AC1)', () => {
	it('gathers open threads, recent changes, handout outcomes, combat summary, and calendar context', () => {
		const env = makeEnvironment();
		const { state } = richSession(env);
		const digest = digestFor(state, DM_ACTOR.id, 'prep');

		expect(digest.dmOnly).toBe(true);

		// UNRESOLVED THREADS ← SES-007 open-thread panels (resolved live, dm-only target visible to DM).
		expect(digest.unresolvedThreads).toHaveLength(1);
		expect(digest.unresolvedThreads[0]).toMatchObject({
			label: 'Poison mystery',
			available: true,
			title: 'Who poisoned the duke?',
		});

		// RECENT CHANGES ← the op-log (most recent first, bounded). At least the pins/links/combat ops.
		expect(digest.recentChanges.length).toBeGreaterThan(0);
		const opTypes = digest.recentChanges.map((c) => c.opType);
		expect(opTypes).toContain('session.deliver-handout');

		// HANDOUT OUTCOMES ← SES-004 delivery history (who received what).
		expect(digest.handoutOutcomes).toHaveLength(1);
		expect(digest.handoutOutcomes[0]).toMatchObject({
			handoutTitle: 'The cryptic letter',
			recipientActorId: PLAYER_ACTOR.id,
		});

		// COMBAT SUMMARY ← SES-002 encounter/combat log.
		expect(digest.combatSummary).not.toBeNull();
		expect(digest.combatSummary!.logEntryCount).toBeGreaterThan(0);

		// CALENDAR CONTEXT ← SES-012 current date + upcoming linked event.
		expect(digest.calendarContext.currentDate?.isoLike).toBe('1372-01-10');
		expect(digest.calendarContext.upcoming.map((l) => l.label)).toContain('The duke’s funeral');

		// CONTINUITY PROMPTS ← deterministically synthesized from the above (no AI).
		const promptSources = new Set(digest.continuityPrompts.map((p) => p.source));
		expect(promptSources).toContain('thread');
		expect(promptSources).toContain('calendar');
		expect(promptSources).toContain('handout');
	});

	it('is deterministic: the same state produces an identical digest (no AI, no clock/random)', () => {
		const env = makeEnvironment();
		const { state } = richSession(env);
		const a = digestFor(state, DM_ACTOR.id, 'prep');
		const b = digestFor(state, DM_ACTOR.id, 'prep');
		expect(a).toEqual(b);
	});

	it('bounds recent changes by the configured limit', () => {
		const env = makeEnvironment();
		const { state } = richSession(env);
		const digest = getPrepRecapDigest(
			state.session,
			state.content,
			state.maps,
			state.characters,
			state.permissions,
			state.sync,
			DM_ACTOR.id,
			'prep',
			{ recentChangeLimit: 2 },
		);
		expect(digest.recentChanges).toHaveLength(2);
		// Most-recent-first ordering.
		expect(digest.recentChanges[0]!.at >= digest.recentChanges[1]!.at).toBe(true);
	});
});

describe('SES-009: DM-only no-leak (fail closed, hard assertion)', () => {
	it('returns an EMPTY digest to a player and an observer; no source content leaks', () => {
		const env = makeEnvironment();
		const { state } = richSession(env);

		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'ghost-actor']) {
			const digest = digestFor(state, actorId, 'prep');
			expect(digest.dmOnly).toBe(false);
			expect(digest.unresolvedThreads).toEqual([]);
			expect(digest.recentChanges).toEqual([]);
			expect(digest.handoutOutcomes).toEqual([]);
			expect(digest.combatSummary).toBeNull();
			expect(digest.continuityPrompts).toEqual([]);
			expect(digest.calendarContext.past).toEqual([]);
			expect(digest.calendarContext.upcoming).toEqual([]);
			// The dm-only thread title NEVER appears in a non-DM digest.
			expect(JSON.stringify(digest)).not.toContain('Who poisoned the duke?');
		}
	});
});

describe('SES-009: recap derives outcomes from the just-ended session archive (AC2)', () => {
	it('summarizes the archived combat + handout history after the session enters recap (no AI)', () => {
		const env = makeEnvironment();
		const { state } = richSession(env);

		// Move to recap: the live combat/dice/handout fields are archived into the recap snapshot.
		const recapState = accepted(
			dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'recap' })),
		).nextState;
		// Sanity: the live fields were reset on recap entry.
		expect(recapState.session.combat.log).toHaveLength(0);
		expect(Object.keys(recapState.session.handouts)).toHaveLength(0);
		expect(recapState.session.recapArchiveId).not.toBeNull();

		const digest = digestFor(recapState, DM_ACTOR.id, 'recap');
		// The recap STILL surfaces the combat + handout outcomes — derived from the archive snapshot.
		expect(digest.combatSummary).not.toBeNull();
		expect(digest.combatSummary!.logEntryCount).toBeGreaterThan(0);
		expect(digest.handoutOutcomes).toHaveLength(1);
		expect(digest.handoutOutcomes[0]!.handoutTitle).toBe('The cryptic letter');
		// A recap-mode combat prompt is synthesized without AI.
		expect(digest.continuityPrompts.some((p) => p.source === 'combat' && /Recap combat/.test(p.text))).toBe(true);
		// Calendar context (campaign-level) survives into recap.
		expect(digest.calendarContext.currentDate?.isoLike).toBe('1372-01-10');
	});

	it('a recap digest is still DM-only: a player gets nothing even in recap', () => {
		const env = makeEnvironment();
		const { state } = richSession(env);
		const recapState = accepted(
			dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'recap' })),
		).nextState;
		const playerDigest = digestFor(recapState, PLAYER_ACTOR.id, 'recap');
		expect(playerDigest.dmOnly).toBe(false);
		expect(playerDigest.handoutOutcomes).toEqual([]);
		expect(playerDigest.combatSummary).toBeNull();
	});
});

describe('SES-009: a dangling open thread degrades without leaking (resilience)', () => {
	it('marks a thread whose target was deleted as unavailable and re-anchor prompt', () => {
		const env = makeEnvironment();
		const { state, threadItemId } = richSession(env);
		// Delete the note the open thread references.
		const deleted = accepted(
			dispatchCommand(state, env, cmd('content.remove-item', { itemId: threadItemId })),
		).nextState;
		const digest = digestFor(deleted, DM_ACTOR.id, 'prep');
		expect(digest.unresolvedThreads).toHaveLength(1);
		expect(digest.unresolvedThreads[0]).toMatchObject({ available: false, title: null, label: 'Poison mystery' });
		expect(
			digest.continuityPrompts.some((p) => p.source === 'thread' && /Re-anchor/.test(p.text)),
		).toBe(true);
		// The deleted note's title never leaks through the prompt either.
		expect(JSON.stringify(digest.continuityPrompts)).not.toContain('Who poisoned the duke?');
	});
});
