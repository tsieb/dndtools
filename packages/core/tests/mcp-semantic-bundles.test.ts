import { describe, expect, it } from 'vitest';
import {
	buildSemanticBundle,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpTool,
	SEMANTIC_BUNDLE_KINDS,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type SemanticBundle,
	type SemanticBundleInputs,
	type SemanticBundleKind,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * MCP-006 — MCP SEMANTIC BUNDLE TOOLS PRE-PROCESS VAULT DATA INTO BOUNDED, SOURCE-CITED CONTEXT PACKAGES
 * for session prep, recap, continuity, open threads, coverage gaps, and campaign health.
 * MCP-013 — those bundles INCLUDE CALENDAR / CUSTOM-TIME CONTEXT for prep, recap, continuity, and campaign
 * health when the visible source data carries dates or timeline relationships.
 *
 * The bundle is a COMPOSITION over the existing deterministic, actor-filtered reads (the prep/recap digest,
 * graph health/coverage, the SES-012/GRAPH-009 calendar reads) — it adds NO new index or visibility path.
 * These tests prove every acceptance criterion plus the determinism guarantee:
 *
 *   - MCP-006 AC1: a session-prep bundle includes BOUNDED SOURCE REFERENCES (citations) and EXCLUDES hidden
 *     player-inaccessible content unless DM-scoped (a non-DM gets the generalized, finding-free bundle).
 *   - MCP-006 AC2: when the composed content exceeds the budget, SEMANTIC COMPRESSION chooses bounded
 *     summaries (the budgeted head + an omitted-count band) rather than the raw full-vault content.
 *   - MCP-013 AC1: a DM recap/prep bundle includes the visible custom dates + source citations.
 *   - MCP-013 AC2: a player-scoped bundle omits hidden dated events and the revealing aggregate counts.
 *
 * The bundle is also reachable through the MCP tool surface (one `bundle.<kind>` read tool per kind), so the
 * agent path inherits the SAME actor filtering.
 */

const REFERENCE_INSTANT = '2026-06-05T00:00:00.000Z';
const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
}

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
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
	],
	epochLabel: 'DR',
};
const dateOf = (month: number, day: number, year = 1372) => ({
	calendarId: 'cal-harptos',
	year,
	month,
	day,
});

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

function bundleFor(
	state: CoreStateSlice,
	actorId: string,
	kind: SemanticBundleKind,
	itemBudget?: number,
): SemanticBundle {
	return buildSemanticBundle(inputsFor(state, actorId), kind, {
		referenceInstant: REFERENCE_INSTANT,
		...(itemBudget !== undefined ? { itemBudget } : {}),
	});
}

/**
 * A rich vault: a calendar, a DM-only open-thread note, a player-visible note, a current campaign date, a
 * future DM-only dated event + a player-visible dated event, an active session with combat + a delivered
 * handout. Built with the same command idioms as the prep/recap digest tests.
 */
function richVault(env: CoreEnvironment): { state: CoreStateSlice; threadItemId: string } {
	let state = base();
	state = accepted(dispatchCommand(state, env, cmd('command-center.ensure-home', {}))).nextState;
	const sceneId = state.commandCenter.homeSceneId!;

	state = accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS))).nextState;

	// A DM-only open-thread note (hidden from players).
	const threadNote = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: 'Who poisoned the duke?',
				body: 'Unresolved secret.',
				visibility: 'dm-only',
			}),
		),
	);
	state = threadNote.nextState;
	const threadEvent = threadNote.events.find((e) => e.kind === 'content.item-changed');
	const threadItemId =
		threadEvent && threadEvent.kind === 'content.item-changed' ? threadEvent.itemId : '';

	// A player-visible note (so a player has some visible graph for the generalized summary).
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: 'The town square',
				body: 'Open to all.',
				visibility: 'player-visible',
			}),
		),
	).nextState;

	state = accepted(
		dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(1, 10) })),
	).nextState;
	// A DM-only dated event (a hidden timeline event) + a player-visible bare dated marker.
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.link-calendar-date', {
				kind: 'note',
				label: 'Secret ritual',
				date: dateOf(1, 20),
				targetId: threadItemId,
			}),
		),
	).nextState;
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.link-calendar-date', {
				kind: 'event',
				label: 'The town fair',
				date: dateOf(1, 25),
			}),
		),
	).nextState;

	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.pin-quick-reference', {
				kind: 'open-thread',
				label: 'Poison mystery',
				targetId: threadItemId,
			}),
		),
	).nextState;

	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('session.set-workflow', { workflow: 'active', activeSceneId: sceneId }),
		),
	).nextState;
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('combat.start', {
				combatants: [{ name: 'Goblin', kind: 'monster', initiative: 12, maxHp: 7, ac: 13 }],
			}),
		),
	).nextState;
	state = accepted(
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
	).nextState;

	return { state, threadItemId };
}

describe('MCP-006 AC1 — a session-prep bundle includes bounded source references, DM-scoped', () => {
	it('the DM prep bundle carries the digest + source citations (a bounded, source-cited package)', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, DM_ACTOR.id, 'session-prep');

		expect(bundle.dmScoped).toBe(true);
		expect(bundle.content.digest).not.toBeNull();
		// The digest exposes the DM-only thread (visible to the DM) and the handout outcome.
		expect(bundle.content.digest!.unresolvedThreads.map((t) => t.title)).toContain(
			'Who poisoned the duke?',
		);
		expect(bundle.content.digest!.handoutOutcomes.map((h) => h.handoutTitle)).toContain(
			'The cryptic letter',
		);

		// BOUNDED SOURCE REFERENCES — the bundle cites the sources it drew on (id/kind only, never content).
		expect(bundle.citations.length).toBeGreaterThan(0);
		const citationKinds = new Set(bundle.citations.map((c) => c.kind));
		expect(citationKinds.has('thread')).toBe(true);
		expect(citationKinds.has('handout')).toBe(true);
		// A citation is an id/kind pair — it carries no content/title/body field.
		for (const citation of bundle.citations) {
			expect(typeof citation.ref).toBe('string');
			expect(Object.keys(citation).sort()).toEqual(['kind', 'ref']);
		}
	});

	it('a player bundle EXCLUDES hidden content: no findings, no citations, only a generalized summary', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, PLAYER_ACTOR.id, 'session-prep');

		expect(bundle.dmScoped).toBe(false);
		// No DM digest content, no citations, no calendar findings reach a player.
		expect(bundle.content.digest).toBeNull();
		expect(bundle.content.calendar).toBeNull();
		expect(bundle.content.health).toBeNull();
		expect(bundle.citations).toEqual([]);
		// The hidden thread title NEVER appears anywhere in the serialized player bundle.
		expect(JSON.stringify(bundle)).not.toContain('Who poisoned the duke?');
		expect(JSON.stringify(bundle)).not.toContain('Secret ritual');
		// Only a GENERALIZED coverage summary (coarse bands) is present.
		expect(bundle.playerSummary).not.toBeNull();
		expect(['none', 'few', 'several', 'many']).toContain(bundle.playerSummary!.openThreads);
	});

	it('an unknown actor receives the fail-closed generalized bundle (no findings)', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, 'actor-ghost', 'session-prep');
		expect(bundle.dmScoped).toBe(false);
		expect(bundle.citations).toEqual([]);
		expect(bundle.content.digest).toBeNull();
	});
});

describe('MCP-006 AC2 — semantic compression chooses summaries over raw full-vault content', () => {
	it('bounds each section to the budget and reports the omitted count as a band, not raw content', () => {
		const env = makeEnvironment();
		let state = base();
		state = accepted(dispatchCommand(state, env, cmd('command-center.ensure-home', {}))).nextState;
		const sceneId = state.commandCenter.homeSceneId!;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.set-workflow', { workflow: 'active', activeSceneId: sceneId }),
			),
		).nextState;
		// Pin MANY open threads so the open-threads bundle exceeds a small budget.
		for (let i = 0; i < 9; i += 1) {
			const note = accepted(
				dispatchCommand(
					state,
					env,
					cmd('content.create-item', {
						kind: 'note',
						title: `Thread ${i}`,
						body: 'x',
						visibility: 'dm-only',
					}),
				),
			);
			state = note.nextState;
			const ev = note.events.find((e) => e.kind === 'content.item-changed');
			const id = ev && ev.kind === 'content.item-changed' ? ev.itemId : '';
			state = accepted(
				dispatchCommand(
					state,
					env,
					cmd('session.pin-quick-reference', { kind: 'open-thread', label: `T${i}`, targetId: id }),
				),
			).nextState;
		}

		const budget = 3;
		const bundle = bundleFor(state, DM_ACTOR.id, 'open-threads', budget);
		// COMPRESSION: the section is bounded to the budget — NOT the raw full list of 9.
		expect(bundle.content.digest!.unresolvedThreads.length).toBe(budget);
		expect(bundle.compression.applied).toBe(true);
		expect(bundle.compression.budget).toBe(budget);
		// The omitted count is a generalized BAND (a summary), never the raw remaining content.
		expect(['few', 'several', 'many']).toContain(bundle.compression.omittedBand);
	});

	it('does not compress when the content is within the budget', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, DM_ACTOR.id, 'open-threads', 50);
		expect(bundle.compression.applied).toBe(false);
		expect(bundle.compression.omittedBand).toBe('none');
	});
});

describe('MCP-013 AC1 — a DM recap/prep bundle includes visible custom dates + source citations', () => {
	it('the DM bundle carries the current date + visible upcoming dated events with citations', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, DM_ACTOR.id, 'session-prep');

		expect(bundle.content.calendar).not.toBeNull();
		// The campaign current date is formatted (CONTENT-011 formatting), and the DM sees BOTH dated events.
		expect(bundle.content.calendar!.currentDateDisplay).not.toBeNull();
		const upcomingLabels = bundle.content.calendar!.upcoming.map((e) => e.label);
		expect(upcomingLabels).toContain('Secret ritual'); // the DM-only dated event (visible to the DM)
		expect(upcomingLabels).toContain('The town fair'); // the player-visible dated marker
		// Each dated event carries a calendar source citation (id only).
		const calendarCitations = bundle.citations.filter((c) => c.kind === 'calendar');
		expect(calendarCitations.length).toBeGreaterThan(0);
	});

	it('campaign-health bundles include the visible date-relationship graph when dated content exists', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, DM_ACTOR.id, 'campaign-health');
		expect(bundle.content.health).not.toBeNull();
		expect(bundle.content.dateGraph).not.toBeNull();
		expect(bundle.content.dateGraph!.nodes.length).toBeGreaterThan(0);
	});
});

describe('RC-AI-1.3 — stale-notes is the narrowest health bundle (staleness findings only)', () => {
	it('carries only the staleness findings: no missing links, gaps, threads, digest, or calendar', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, DM_ACTOR.id, 'stale-notes');
		expect(bundle.dmScoped).toBe(true);
		expect(bundle.content.health).not.toBeNull();
		expect(bundle.content.health!.missingLinks).toEqual([]);
		expect(bundle.content.health!.contentGaps).toEqual([]);
		expect(bundle.content.health!.openThreads).toEqual([]);
		expect(bundle.content.digest).toBeNull();
		expect(bundle.content.calendar).toBeNull();
		expect(bundle.content.dateGraph).toBeNull();
		expect(bundle.mode).toBeNull();
		// Every citation this bundle can carry is a `note` (the staleness findings), never a thread/handout.
		for (const citation of bundle.citations) expect(citation.kind).toBe('note');
	});

	it('a player agent gets the generalized, finding-free bundle (no leak)', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, PLAYER_ACTOR.id, 'stale-notes');
		expect(bundle.dmScoped).toBe(false);
		expect(bundle.content.health).toBeNull();
		expect(bundle.playerSummary).not.toBeNull();
	});
});

describe('MCP-013 AC2 — a player-scoped bundle omits hidden dated events + revealing counts', () => {
	it('a player bundle never exposes the hidden dated event or an exact count', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const bundle = bundleFor(state, PLAYER_ACTOR.id, 'campaign-health');
		// No calendar findings, no date graph, no exact counts reach the player.
		expect(bundle.content.calendar).toBeNull();
		expect(bundle.content.dateGraph).toBeNull();
		// The hidden dated event label is absent from the entire serialized player bundle.
		expect(JSON.stringify(bundle)).not.toContain('Secret ritual');
		// Only a coarse coverage band — never an exact 0–100 grade or a raw count.
		expect(['low', 'moderate', 'good', 'excellent']).toContain(bundle.playerSummary!.coverageBand);
		expect(JSON.stringify(bundle)).not.toMatch(/"coverage":/);
	});
});

describe('MCP-006 — the bundle is deterministic + reproducible across fresh fixtures', () => {
	it('the same state produces an identical bundle (no AI, no clock, no random)', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		for (const kind of SEMANTIC_BUNDLE_KINDS) {
			const a = bundleFor(state, DM_ACTOR.id, kind);
			const b = bundleFor(state, DM_ACTOR.id, kind);
			expect(a, `bundle ${kind} must be deterministic`).toEqual(b);
		}
	});

	it('every bundle kind builds for the DM and the player without throwing', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		for (const kind of SEMANTIC_BUNDLE_KINDS) {
			expect(() => bundleFor(state, DM_ACTOR.id, kind)).not.toThrow();
			expect(() => bundleFor(state, PLAYER_ACTOR.id, kind)).not.toThrow();
		}
	});
});

describe('MCP-006 / MCP-013 — the bundles are reachable through the MCP tool surface', () => {
	const registry = createBaselineMcpToolRegistry();

	it('every bundle.<kind> tool is a registered read tool returning the bundle for the DM', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		for (const kind of SEMANTIC_BUNDLE_KINDS) {
			const toolId = `bundle.${kind}`;
			expect(registry.get(toolId)?.kind).toBe('read');
			const result = invokeMcpTool(state, env, registry, {
				toolId,
				actorId: DM_ACTOR.id,
				agentId: 'agent-dm',
				input: { referenceInstant: REFERENCE_INSTANT },
			});
			expect(result.status).toBe('read-ok');
			if (result.status !== 'read-ok') throw new Error('expected read-ok');
			const bundle = result.data as SemanticBundle;
			expect(bundle.kind).toBe(kind);
			expect(bundle.dmScoped).toBe(true);
		}
	});

	it('a player-scoped agent gets the generalized, finding-free bundle through the tool (no leak)', () => {
		const env = makeEnvironment();
		const { state } = richVault(env);
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'bundle.session-prep',
			actorId: PLAYER_ACTOR.id,
			agentId: 'agent-player',
			input: { referenceInstant: REFERENCE_INSTANT },
		});
		expect(result.status).toBe('read-ok');
		if (result.status !== 'read-ok') throw new Error('expected read-ok');
		const bundle = result.data as SemanticBundle;
		expect(bundle.dmScoped).toBe(false);
		expect(JSON.stringify(bundle)).not.toContain('Who poisoned the duke?');
		expect(JSON.stringify(bundle)).not.toContain('Secret ritual');
	});
});
