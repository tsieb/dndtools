import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
	sequentialIds,
} from '../src/testing/fixtures';
import {
	GRAPH_QUALITY_THRESHOLD_VERSION,
	QUALITY_THRESHOLDS,
	buildQualityNode,
	computeGraphQuality,
	dispatchCommand,
	getGraphQualityForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type QualityNode,
	type WikilinkTarget,
} from '../src';

/**
 * GRAPH-003 — DETERMINISTIC graph-quality intelligence: UNRESOLVED links (+ repair candidates), ALIAS /
 * DUPLICATE-TITLE disambiguation, ORPHAN + HUB notes, and RELATIONSHIP-QUALITY scoring — ACTOR-FILTERED and
 * fail-closed, with NO AI. Tests are the primary evidence: both the pure engine and the actor-filtered query
 * path are covered, including the unresolved-link hidden-vs-missing non-leak and DETERMINISM across fresh
 * fixtures whose volatile ids differ.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
	actorId = DM_ACTOR.id,
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', ...payload }, actorId)),
	);
	const id = (result.events[0] as { itemId: string }).itemId;
	return { state: result.nextState, id };
}

function node(
	overrides: Partial<QualityNode> & Pick<QualityNode, 'id' | 'title'>,
): QualityNode {
	return { aliases: [], outboundTargets: [], ...overrides };
}

function target(
	overrides: Partial<WikilinkTarget> & Pick<WikilinkTarget, 'id' | 'title'>,
): WikilinkTarget {
	return { aliases: [], sections: [], source: 'local-markdown', available: true, ...overrides };
}

// --- The PURE engine (deterministic functions of explicit records) -----------------------------------

describe('GRAPH-003 — pure engine: unresolved links + repair candidates (AC1)', () => {
	it('reports an unresolved wikilink with a deterministic repair candidate, no AI', () => {
		const nodes: QualityNode[] = [
			node({ id: 'n-a', title: 'Quest Log', outboundTargets: ['Highmor'] }), // typo
		];
		const candidates: WikilinkTarget[] = [target({ id: 'n-t', title: 'Highmoor' })];
		const report = computeGraphQuality(nodes, candidates);
		expect(report.unresolvedLinks).toHaveLength(1);
		expect(report.unresolvedLinks[0]).toMatchObject({
			sourceId: 'n-a',
			sourceTitle: 'Quest Log',
			target: 'highmor',
			repairCandidate: 'Highmoor',
		});
	});

	it('a link that resolves to a visible target is NOT unresolved', () => {
		const nodes: QualityNode[] = [node({ id: 'n-a', title: 'A', outboundTargets: ['Highmoor'] })];
		const candidates: WikilinkTarget[] = [target({ id: 'n-t', title: 'Highmoor' })];
		expect(computeGraphQuality(nodes, candidates).unresolvedLinks).toEqual([]);
	});

	it('proposes NO candidate when nothing visible is close enough (better than a misleading fix)', () => {
		const nodes: QualityNode[] = [node({ id: 'n-a', title: 'A', outboundTargets: ['Zzzxqq'] })];
		const candidates: WikilinkTarget[] = [target({ id: 'n-t', title: 'Highmoor' })];
		expect(computeGraphQuality(nodes, candidates).unresolvedLinks[0]!.repairCandidate).toBeNull();
	});
});

describe('GRAPH-003 — pure engine: disambiguation (AC2)', () => {
	it('surfaces a DUPLICATE-TITLE group when two notes share a title', () => {
		const nodes: QualityNode[] = [
			node({ id: 'n-1', title: 'Raven' }),
			node({ id: 'n-2', title: 'Raven' }),
			node({ id: 'n-3', title: 'Unique' }),
		];
		const report = computeGraphQuality(nodes, []);
		expect(report.disambiguation).toHaveLength(1);
		expect(report.disambiguation[0]).toMatchObject({
			kind: 'duplicate-title',
			name: 'raven',
			itemIds: ['n-1', 'n-2'],
		});
	});

	it('surfaces an ALIAS-COLLISION when an alias shadows another note title', () => {
		const nodes: QualityNode[] = [
			node({ id: 'n-1', title: 'The Keep' }),
			node({ id: 'n-2', title: 'Highmoor', aliases: ['The Keep'] }),
		];
		const report = computeGraphQuality(nodes, []);
		expect(report.disambiguation).toHaveLength(1);
		expect(report.disambiguation[0]).toMatchObject({
			kind: 'alias-collision',
			name: 'the keep',
			itemIds: ['n-1', 'n-2'],
		});
	});
});

describe('GRAPH-003 — pure engine: orphans + hubs', () => {
	it('flags a note with no inbound and no resolvable outbound links as an orphan', () => {
		const nodes: QualityNode[] = [
			node({ id: 'n-lonely', title: 'Lonely' }),
			node({ id: 'n-hub', title: 'Hub', outboundTargets: ['Lonely'] }),
		];
		const report = computeGraphQuality(nodes, [
			target({ id: 'n-lonely', title: 'Lonely' }),
			target({ id: 'n-hub', title: 'Hub' }),
		]);
		// Lonely is referenced by Hub (inbound 1) so it is NOT an orphan; Hub has no inbound + 1 outbound,
		// so Hub is also connected. Neither is an orphan.
		expect(report.orphans).toEqual([]);

		const isolated = computeGraphQuality([node({ id: 'n-x', title: 'X' })], []);
		expect(isolated.orphans.map((o) => o.itemId)).toEqual(['n-x']);
	});

	it('flags a HUB at/above the inbound threshold', () => {
		const refs = Array.from({ length: QUALITY_THRESHOLDS.hubInboundMin }, (_, i) =>
			node({ id: `n-ref-${i}`, title: `Ref ${i}`, outboundTargets: ['Hub'] }),
		);
		const nodes: QualityNode[] = [node({ id: 'n-hub', title: 'Hub' }), ...refs];
		const candidates: WikilinkTarget[] = nodes.map((n) => target({ id: n.id, title: n.title }));
		const report = computeGraphQuality(nodes, candidates);
		expect(report.hubs.map((h) => h.itemId)).toEqual(['n-hub']);
		expect(report.hubs[0]!.inboundCount).toBe(QUALITY_THRESHOLDS.hubInboundMin);
	});
});

describe('GRAPH-003 — pure engine: relationship-quality scores carry inputs + threshold + sources, no AI (AC3)', () => {
	it('each score includes deterministic inputs, the threshold version, and source references', () => {
		const nodes: QualityNode[] = [
			node({ id: 'n-hub', title: 'Hub', outboundTargets: ['A', 'B'] }),
			node({ id: 'n-a', title: 'A', outboundTargets: ['Hub'] }),
			node({ id: 'n-b', title: 'B' }),
		];
		const candidates: WikilinkTarget[] = nodes.map((n) => target({ id: n.id, title: n.title }));
		const report = computeGraphQuality(nodes, candidates);
		const hubScore = report.scores.find((s) => s.itemId === 'n-hub')!;
		expect(hubScore.inputs).toEqual({
			inboundCount: 1, // A links to Hub
			outboundResolvedCount: 2, // Hub links to A + B
			outboundUnresolvedCount: 0,
		});
		expect(hubScore.thresholdVersion).toBe(GRAPH_QUALITY_THRESHOLD_VERSION);
		expect(hubScore.sourceRefs).toEqual(['n-a', 'n-b']); // visible contributing edges only, sorted
		// No `rationale`/AI field exists on the score — the type itself proves there is no AI-only rationale.
		expect(Object.keys(hubScore).sort()).toEqual(
			['band', 'inputs', 'itemId', 'score', 'sourceRefs', 'thresholdVersion', 'title'].sort(),
		);
	});
});

describe('GRAPH-003 — DETERMINISM (same inputs → identical output; stable across fresh ids)', () => {
	it('produces an identical report across two fresh fixtures whose volatile ids differ', () => {
		const candidatesFor = (ids: { hub: string; a: string }): WikilinkTarget[] => [
			target({ id: ids.hub, title: 'Hub' }),
			target({ id: ids.a, title: 'Alpha' }),
		];
		const buildNodes = (ids: { hub: string; a: string }): QualityNode[] => [
			buildQualityNode({ id: ids.hub, title: 'Hub', aliases: [], body: 'See [[Alpha]] and [[Ghost]].' }),
			buildQualityNode({ id: ids.a, title: 'Alpha', aliases: [], body: 'Back to [[Hub]].' }),
		];
		const idsA = { hub: 'uuid-zzz-1', a: 'uuid-aaa-2' };
		const idsB = { hub: 'uuid-111-9', a: 'uuid-222-3' };
		const reportA = computeGraphQuality(buildNodes(idsA), candidatesFor(idsA));
		const reportB = computeGraphQuality(buildNodes(idsB), candidatesFor(idsB));
		// Normalize the volatile ids to a stable content key (title) so the structural fingerprint matches.
		const fingerprint = (r: ReturnType<typeof computeGraphQuality>): string =>
			JSON.stringify({
				unresolved: r.unresolvedLinks.map((u) => `${u.sourceTitle}->${u.target}=${u.repairCandidate}`),
				orphans: r.orphans.map((o) => o.title),
				hubs: r.hubs.map((h) => `${h.title}:${h.inboundCount}`),
				scores: r.scores.map((s) => `${s.title}:${s.band}:${s.score}`),
			});
		expect(fingerprint(reportA)).toBe(fingerprint(reportB));
	});

	it('is stable across repeated runs (byte-identical output)', () => {
		const nodes: QualityNode[] = [
			node({ id: 'n-z', title: 'Zephyr', outboundTargets: ['Ghost'] }),
			node({ id: 'n-a', title: 'Alpha', outboundTargets: ['Ghst'] }),
		];
		const candidates: WikilinkTarget[] = [target({ id: 'n-g', title: 'Ghosty' })];
		const first = JSON.stringify(computeGraphQuality(nodes, candidates));
		const second = JSON.stringify(computeGraphQuality(nodes, candidates));
		expect(first).toBe(second);
	});
});

// --- The ACTOR-FILTERED query (visibility + tombstone choke-point) ------------------------------------

describe('GRAPH-003 — actor-filtered: hidden notes are never analyzed nor revealed', () => {
	const env = makeEnvironment();

	it("an unresolved link to a dm-only note reads as truly-missing for a player (no hidden-vs-missing leak)", () => {
		let state = base();
		// A dm-only target note, and a player-visible note linking to it by an exact title.
		state = createNote(state, env, { title: 'Hidden Lair', visibility: 'dm-only' }).state;
		const linker = createNote(state, env, {
			title: 'Field Notes',
			visibility: 'player-visible',
			body: 'A rumor of [[Hidden Lair]] persists.',
		});
		state = linker.state;

		const playerReport = getGraphQualityForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		const unresolved = playerReport.unresolvedLinks.find((u) => u.sourceId === linker.id);
		// The link is reported UNRESOLVED for the player (the target is not in their visible set) and the
		// repair candidate is NULL — nothing in the player's report reveals that a hidden note named the target.
		expect(unresolved).toMatchObject({ target: 'hidden lair', repairCandidate: null });

		// The DM, who CAN see the target, resolves the same link — so it is NOT unresolved for the DM.
		const dmReport = getGraphQualityForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(dmReport.unresolvedLinks.find((u) => u.sourceId === linker.id)).toBeUndefined();
	});

	it('a dm-only note is never a duplicate/hub/orphan/score row for a player', () => {
		let state = base();
		state = createNote(state, env, { title: 'Raven', visibility: 'dm-only' }).state;
		state = createNote(state, env, { title: 'Raven', visibility: 'player-visible' }).state;
		const playerReport = getGraphQualityForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		// The player sees only ONE 'Raven' (the visible one), so there is NO duplicate-title collision —
		// the hidden duplicate cannot create a finding that would betray its existence.
		expect(playerReport.disambiguation).toEqual([]);
		expect(playerReport.scores.map((s) => s.itemId)).toHaveLength(1);

		// The DM sees BOTH 'Raven' notes ⇒ a duplicate-title group appears for the DM.
		const dmReport = getGraphQualityForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(dmReport.disambiguation.map((g) => g.kind)).toEqual(['duplicate-title']);
	});

	it('an unknown/unauthenticated actor gets the empty report (fail closed)', () => {
		let state = base();
		state = createNote(state, env, { title: 'A', visibility: 'player-visible', body: '[[Ghost]]' }).state;
		const report = getGraphQualityForActor(state.content, state.permissions, 'ghost-actor');
		expect(report.unresolvedLinks).toEqual([]);
		expect(report.scores).toEqual([]);
	});

	it('the player report is deterministic across fresh fixtures built with a fresh id generator', () => {
		const build = (): CoreStateSlice => {
			const e = makeEnvironment({ ids: sequentialIds('fresh') });
			let state = base();
			state = createNote(state, e, {
				title: 'Hub',
				visibility: 'player-visible',
				body: 'Links to [[Alpha]] and a [[Ghost]].',
			}).state;
			state = createNote(state, e, {
				title: 'Alpha',
				visibility: 'player-visible',
				body: 'Back to [[Hub]].',
			}).state;
			return state;
		};
		const a = getGraphQualityForActor(build().content, base().permissions, PLAYER_ACTOR.id);
		const b = getGraphQualityForActor(build().content, base().permissions, PLAYER_ACTOR.id);
		const key = (r: ReturnType<typeof getGraphQualityForActor>): string =>
			JSON.stringify({
				u: r.unresolvedLinks.map((x) => `${x.sourceTitle}->${x.target}`),
				s: r.scores.map((x) => `${x.title}:${x.score}`),
			});
		expect(key(a)).toBe(key(b));
	});
});
