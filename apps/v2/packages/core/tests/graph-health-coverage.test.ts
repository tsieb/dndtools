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
	computeGraphHealth,
	dispatchCommand,
	explainGraphHealth,
	getGraphHealthForDm,
	getGraphQualityForActor,
	getPlayerScopedHealthSummary,
	HEALTH_THRESHOLDS,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type GraphHealthReport,
	type GraphQualityReport,
	type HealthNoteSignal,
} from '../src';

/**
 * GRAPH-007 — the DM runs GRAPH HEALTH + COVERAGE reports (stale notes, missing links, content gaps, open
 * threads) with DETERMINISTIC SCORING and OPTIONAL AI explanation. Tests are the primary evidence: the pure
 * scoring engine + the DM-only / player-scoped actor-filtered surface are covered, including AC1 (no AI →
 * deterministic scores + source refs), AC2 (AI enabled → deterministic findings remain the source of truth),
 * AC3 (player-scoped surface omits/generalizes hidden content), and AC4 (no AI runtime → still completes).
 */

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', ...payload })),
	);
	const id = (result.events[0] as { itemId: string }).itemId;
	return { state: result.nextState, id };
}

/** The fixed-clock fixtures stamp `updatedAt` near 2026-06-03; a far-future reference makes notes stale. */
const FAR_FUTURE = '2030-01-01T00:00:00.000Z';
/** A reference instant immediately after creation keeps notes fresh. */
const FRESH_REFERENCE = '2026-06-03T13:00:00.000Z';

function signal(
	overrides: Partial<HealthNoteSignal> & Pick<HealthNoteSignal, 'itemId' | 'title'>,
): HealthNoteSignal {
	return { ageDays: null, ...overrides };
}

const EMPTY_QUALITY: GraphQualityReport = {
	schemaVersion: 1,
	thresholdVersion: '1',
	unresolvedLinks: [],
	disambiguation: [],
	orphans: [],
	hubs: [],
	scores: [],
};

// --- The PURE scoring engine -------------------------------------------------------------------------

describe('GRAPH-007 — pure engine: deterministic findings + coverage score (AC1)', () => {
	it('grades stale notes, missing links, content gaps, open threads, and a coverage score', () => {
		const quality: GraphQualityReport = {
			...EMPTY_QUALITY,
			unresolvedLinks: [
				{ sourceId: 'n-a', sourceTitle: 'A', target: 'ghost', repairCandidate: null },
			],
			orphans: [{ itemId: 'n-o', title: 'Orphan' }],
			disambiguation: [
				{ kind: 'duplicate-title', name: 'raven', itemIds: ['n-1', 'n-2'], titles: ['Raven', 'Raven'] },
			],
			scores: [{ itemId: 'n-o', title: 'Orphan', band: 'isolated', score: 0, inputs: { inboundCount: 0, outboundResolvedCount: 0, outboundUnresolvedCount: 0 }, thresholdVersion: '1', sourceRefs: [] }],
		};
		const signals: HealthNoteSignal[] = [
			signal({ itemId: 'n-stale', title: 'Stale', ageDays: HEALTH_THRESHOLDS.staleDays + 1 }),
			signal({ itemId: 'n-fresh', title: 'Fresh', ageDays: 1 }),
		];
		const report = computeGraphHealth(quality, signals);
		expect(report.staleNotes.map((s) => s.itemId)).toEqual(['n-stale']);
		expect(report.staleNotes[0]!.band).toBe('stale');
		expect(report.missingLinks.map((m) => m.target)).toEqual(['ghost']);
		expect(report.contentGaps.map((g) => `${g.itemId}:${g.reason}`)).toEqual(['n-o:orphan']);
		expect(report.openThreads.map((t) => t.name)).toEqual(['raven']);
		// Coverage is penalized below 100 by every category; the exact value is a deterministic function.
		expect(report.coverage.overall).toBeLessThan(100);
		expect(report.coverage.overall).toBe(
			100 - (1 /*stale*/ + 2 /*missing*/ + 2 /*gap*/ + 3 /*thread*/),
		);
	});

	it('a clean vault scores a perfect 100 coverage', () => {
		expect(computeGraphHealth(EMPTY_QUALITY, []).coverage.overall).toBe(100);
	});
});

describe('GRAPH-007 — pure engine: optional AI explanation (AC2/AC4)', () => {
	const report = computeGraphHealth(EMPTY_QUALITY, []);

	it('produces a DETERMINISTIC narrative with NO AI by default (AC4 — completes with no AI runtime)', () => {
		const explanation = explainGraphHealth(report);
		expect(explanation.status.state).toBe('deterministic');
		expect(explanation.lines[0]).toContain('Coverage grade 100/100');
	});

	it('AI unavailable DEGRADES to the deterministic narrative, never fails (AC4)', () => {
		const explanation = explainGraphHealth(report, { enabled: true, available: false });
		expect(explanation.status.state).toBe('ai-unavailable');
		// The deterministic narrative is returned unchanged — the findings remain the source of truth.
		expect(explanation.lines[0]).toContain('Coverage grade 100/100');
	});

	it('an enabled AI annotator may only re-word the deterministic lines, never change findings (AC2)', () => {
		const before = computeGraphHealth(EMPTY_QUALITY, []);
		const explanation = explainGraphHealth(before, {
			enabled: true,
			annotate: (lines) => lines.map((line) => `🔮 ${line}`),
		});
		expect(explanation.status.state).toBe('ai-applied');
		// The deterministic FINDINGS object is untouched by the explanation (it is the source of truth).
		expect(before.coverage.overall).toBe(100);
		expect(explanation.lines.every((line) => line.startsWith('🔮'))).toBe(true);
	});
});

// --- The ACTOR-FILTERED surface (DM-only + player-scoped) ---------------------------------------------

describe('GRAPH-007 — DM-only report (Multi-user: dm-only)', () => {
	const env = makeEnvironment();

	it('the DM gets the full health report; a non-DM gets the empty report (fail closed)', () => {
		let state = base();
		state = createNote(state, env, {
			title: 'Quest Log',
			visibility: 'player-visible',
			body: 'Onward to [[Ghost Town]].', // a missing link
		}).state;

		const dmReport = getGraphHealthForDm(state.content, state.permissions, DM_ACTOR.id, FAR_FUTURE);
		expect(dmReport.missingLinks.map((m) => m.target)).toEqual(['ghost town']);
		expect(dmReport.staleNotes.length).toBeGreaterThan(0); // FAR_FUTURE makes the note stale

		const playerReport = getGraphHealthForDm(state.content, state.permissions, PLAYER_ACTOR.id, FAR_FUTURE);
		expect(playerReport.missingLinks).toEqual([]);
		expect(playerReport.staleNotes).toEqual([]);
		expect(playerReport.coverage.overall).toBe(100);
	});

	it('a fresh-enough reference instant leaves notes un-stale (deterministic age, no ambient clock)', () => {
		let state = base();
		state = createNote(state, env, { title: 'New Note', visibility: 'player-visible' }).state;
		const report = getGraphHealthForDm(state.content, state.permissions, DM_ACTOR.id, FRESH_REFERENCE);
		expect(report.staleNotes).toEqual([]);
	});
});

describe('GRAPH-007 — player-scoped surface omits/generalizes hidden content (AC3)', () => {
	const env = makeEnvironment();

	it('the player-scoped summary is computed over visible content only and generalizes counts', () => {
		let state = base();
		// A dm-only note with several missing links the player can never see.
		state = createNote(state, env, {
			title: 'Secret Plans',
			visibility: 'dm-only',
			body: '[[Ghost1]] [[Ghost2]] [[Ghost3]] [[Ghost4]] [[Ghost5]] [[Ghost6]]',
		}).state;
		// One player-visible note with a single missing link.
		state = createNote(state, env, {
			title: 'Public Note',
			visibility: 'player-visible',
			body: 'Refers to [[Ghost A]].',
		}).state;

		const playerSummary = getPlayerScopedHealthSummary(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			FRESH_REFERENCE,
		);
		// The player's summary reflects ONLY their visible graph: 1 missing link ⇒ the 'few' band — never the
		// 6 hidden-note links. The result is GENERALIZED to a band, never an exact hidden-influenced count (AC3).
		expect(playerSummary.missingLinks).toBe('few');
		expect(['none', 'few', 'several', 'many']).toContain(playerSummary.missingLinks);

		// The DM's full report sees ALL the missing links (visible + hidden).
		const dmReport = getGraphHealthForDm(state.content, state.permissions, DM_ACTOR.id, FRESH_REFERENCE);
		expect(dmReport.missingLinks.length).toBe(7); // 6 hidden-note links + 1 visible-note link
	});

	it('an unknown actor gets the all-none player-scoped summary (fail closed)', () => {
		let state = base();
		state = createNote(state, env, { title: 'A', visibility: 'player-visible', body: '[[Ghost]]' }).state;
		const summary = getPlayerScopedHealthSummary(state.content, state.permissions, 'ghost', FRESH_REFERENCE);
		expect(summary.missingLinks).toBe('none');
		expect(summary.coverageBand).toBe('excellent');
	});
});

describe('GRAPH-007 — DETERMINISM (stable across fresh fixtures + repeated runs)', () => {
	it('the DM report is structurally identical across fresh fixtures whose ids differ', () => {
		const build = (): CoreStateSlice => {
			const e = makeEnvironment({ ids: sequentialIds(`h-${Math.random()}`) });
			let state = base();
			state = createNote(state, e, {
				title: 'Hub',
				visibility: 'player-visible',
				body: 'See [[Alpha]] and [[Ghost]].',
			}).state;
			state = createNote(state, e, { title: 'Alpha', visibility: 'player-visible', body: 'Back to [[Hub]].' }).state;
			return state;
		};
		const fingerprint = (state: CoreStateSlice): string => {
			const report: GraphHealthReport = getGraphHealthForDm(
				state.content,
				state.permissions,
				DM_ACTOR.id,
				FAR_FUTURE,
			);
			return JSON.stringify({
				stale: report.staleNotes.map((s) => `${s.title}:${s.band}`),
				missing: report.missingLinks.map((m) => `${m.sourceTitle}->${m.target}`),
				gaps: report.contentGaps.map((g) => `${g.title}:${g.reason}`),
				coverage: report.coverage.overall,
			});
		};
		expect(fingerprint(build())).toBe(fingerprint(build()));
	});

	it('quality + health compose deterministically (the DM report builds on the GRAPH-003 report)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, {
			title: 'Log',
			visibility: 'player-visible',
			body: 'A [[Ghost]] link.',
		}).state;
		const quality = getGraphQualityForActor(state.content, state.permissions, DM_ACTOR.id);
		const health = getGraphHealthForDm(state.content, state.permissions, DM_ACTOR.id, FAR_FUTURE);
		// The health report's missing links are exactly the quality report's unresolved links.
		expect(health.missingLinks.map((m) => m.target)).toEqual(
			quality.unresolvedLinks.map((u) => u.target),
		);
	});
});
