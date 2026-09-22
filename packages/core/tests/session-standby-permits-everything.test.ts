import { describe, expect, it } from 'vitest';
import {
	SESSION_COMMAND_AVAILABILITY,
	SESSION_WORKFLOW_STATES,
	buildAudioAutomationRule,
	configureAudioSource,
	createDemoMapState,
	dispatchCommand,
	ensureAudioState,
	evaluateAudioAutomationRule,
	getCombatTrackerForActor,
	happenedLive,
	getDiceHistoryForActor,
	resolveAudioAutomationForActor,
	type AudioAutomationRule,
	type AudioAutomationTrigger,
	type AudioState,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SessionWorkflowState,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

/**
 * RC-SES-6.1 — Standby permits everything (RC roadmap §1.6 D2). Every command that used to wait for Go
 * live, and every DM projection/reference command that used to wait for any non-idle workflow, is
 * accepted in all seven workflow states. Only the live-only effects wait: the session clock, audio
 * automation and SFX events, and the session-start triggers. The rolls, encounter-log entries and
 * handout deliveries those commands write carry the workflow they were made in, and the archive that
 * the recap and the end-of-session capture review keeps only the live ones.
 */

interface Ctx {
	state: CoreStateSlice;
	env: CoreEnvironment;
	homeSceneId: string;
	characterId: string;
	tableItemId: string;
}

function accepted(result: CommandResult, label: string): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`${label} rejected: ${result.rejection.code} — ${result.rejection.message}`);
	}
	return result.nextState;
}

function run(ctx: Ctx, command: CoreCommand): Ctx {
	return { ...ctx, state: accepted(dispatchCommand(ctx.state, ctx.env, command), command.type) };
}

function setWorkflow(ctx: Ctx, workflow: SessionWorkflowState): Ctx {
	const needsScene =
		workflow === 'active' || workflow === 'prep' || workflow === 'paused' || workflow === 'ending';
	return run(ctx, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow, ...(needsScene ? { activeSceneId: ctx.homeSceneId } : {}) },
	});
}

/** The allowed transitions that reach each workflow from a fresh Standby (`idle`). */
const PATH_FROM_STANDBY: Record<SessionWorkflowState, SessionWorkflowState[]> = {
	idle: [],
	prep: ['prep'],
	active: ['active'],
	paused: ['active', 'paused'],
	ending: ['active', 'ending'],
	recap: ['active', 'ending', 'recap'],
	archived: ['active', 'ending', 'recap', 'archived'],
};

/** A vault with a home Scene, the demo maps, a dice table and a character, driven into `workflow`. */
function inWorkflow(workflow: SessionWorkflowState): Ctx {
	const env = makeEnvironment();
	let ctx: Ctx = {
		state: { ...buildInitialState(DM_ACTOR, PLAYER_ACTOR), maps: createDemoMapState() },
		env,
		homeSceneId: '',
		characterId: '',
		tableItemId: '',
	};
	ctx = run(ctx, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
	ctx = run(ctx, {
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'object',
			title: 'Wandering monsters',
			fields: {
				'dndtools.objectSubtype': 'dice-table',
				dice: '1d4',
				entries: ['Wolves', 'Bandits', 'An ogre', 'Nothing'],
			},
		},
	});
	ctx = run(ctx, {
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'sidekick',
			name: 'Pip',
			visibility: 'player-visible',
			combat: { hp: 10, maxHp: 20, ac: 12 },
		},
	});
	ctx = {
		...ctx,
		homeSceneId: ctx.state.commandCenter.homeSceneId!,
		characterId: Object.keys(ctx.state.characters.characters)[0]!,
		tableItemId: Object.values(ctx.state.content.items).find(
			(item) => item.title === 'Wandering monsters',
		)!.id,
	};
	for (const step of PATH_FROM_STANDBY[workflow]) ctx = setWorkflow(ctx, step);
	expect(ctx.state.session.workflow).toBe(workflow);
	return ctx;
}

const startCombat = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'combat.start',
		actorId: DM_ACTOR.id,
		payload: {
			combatants: [
				{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 },
				{ kind: 'monster', name: 'Bandit', initiative: 12, maxHp: 11 },
				{ kind: 'monster', name: 'Wolf', initiative: 9, maxHp: 11 },
			],
		},
	});

const advanceTurn = (ctx: Ctx): Ctx =>
	run(ctx, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} });

const roll = (ctx: Ctx, label: string): Ctx =>
	run(ctx, { type: 'dice.roll', actorId: DM_ACTOR.id, payload: { expression: '1d20', label } });

const deliverLetter = (ctx: Ctx, title = 'A letter'): Ctx =>
	run(ctx, {
		type: 'session.deliver-handout',
		actorId: DM_ACTOR.id,
		payload: {
			title,
			sections: [
				{ id: 'sec-1', heading: 'Body', body: 'You find a letter.', visibility: 'shared' },
			],
			sceneId: ctx.homeSceneId,
			recipientActorIds: [PLAYER_ACTOR.id],
			connectionState: 'connected',
		},
	});

const selectMap = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'session.set-active-map',
		actorId: DM_ACTOR.id,
		payload: { mapId: 'map-western-reaches', regionId: 'region-north-road' },
	});

const startQuickTimer = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'session.quick-timer.start',
		actorId: DM_ACTOR.id,
		payload: { kind: 'countdown', durationSeconds: 300 },
	});

const projectPlayerView = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'session.project-player-view',
		actorId: DM_ACTOR.id,
		payload: {
			playerActorIds: [PLAYER_ACTOR.id],
			connectionState: 'connected',
			target: {
				kind: 'scene',
				sceneId: ctx.homeSceneId,
				sectionIds: null,
				widgetInstanceIds: null,
				displayState: null,
				mapRegion: null,
			},
		},
	});

const pinSessionContext = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'session.pin-quick-reference',
		actorId: DM_ACTOR.id,
		payload: { kind: 'session-context', label: 'Tonight' },
	});

/** Every command the story moves to always-available: the former `live-session` and `dm-admin` sets. */
const FORMERLY_GATED: CoreCommand['type'][] = [
	'session.record-dice',
	'dice.roll',
	'dice.roll-table',
	'combat.start',
	'combat.advance-turn',
	'combat.apply-resource',
	'combat.end',
	'session.deliver-handout',
	'session.reveal-handout-section',
	'session.project-active-map',
	'character.update-combat-resource',
	'session.quick-timer.start',
	'session.quick-timer.pause',
	'session.quick-timer.resume',
	'session.quick-timer.reset',
	'session.quick-timer.lap',
	'session.project-player-view',
	'session.revoke-player-view',
	'session.set-active-map',
	'session.pin-quick-reference',
	'session.unpin-quick-reference',
];

// These commands inherited the removed combat guard but were not in the category registry.
const FORMERLY_COMBAT_GATED: CoreCommand['type'][] = [
	'combat.previous-turn',
	'combat.add-combatants',
	'combat.remove-combatant',
	'combat.reorder-combatant',
	'combat.set-combatant-visibility',
	'combat.place-token',
	'combat.move-token',
	'combat.remove-token',
	'combat.place-template',
	'combat.remove-template',
];

const placeToken = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'combat.place-token',
		actorId: DM_ACTOR.id,
		payload: {
			combatantId: ctx.state.session.combat.order[0]!,
			mapId: 'map-western-reaches',
			x: 0.3,
			y: 0.4,
		},
	});
const placeTemplate = (ctx: Ctx): Ctx =>
	run(ctx, {
		type: 'combat.place-template',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'sphere',
			mapId: 'map-western-reaches',
			label: 'Fireball',
			x: 0.3,
			y: 0.4,
			size: 20,
		},
	});

interface MovedCommand {
	name: string;
	type: CoreCommand['type'];
	/** Preconditions, established in the same workflow the command then runs in. */
	setup?: (ctx: Ctx) => Ctx;
	command: (ctx: Ctx) => CoreCommand;
}

const MOVED: MovedCommand[] = [
	{
		name: 'combat.previous-turn',
		type: 'combat.previous-turn',
		setup: (ctx) => advanceTurn(startCombat(ctx)),
		command: () => ({ type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'combat.add-combatants',
		type: 'combat.add-combatants',
		setup: startCombat,
		command: () => ({
			type: 'combat.add-combatants',
			actorId: DM_ACTOR.id,
			payload: { combatants: [{ kind: 'monster', name: 'Ogre', initiative: 5, maxHp: 20 }] },
		}),
	},
	{
		name: 'combat.remove-combatant',
		type: 'combat.remove-combatant',
		setup: startCombat,
		command: (ctx) => ({
			type: 'combat.remove-combatant',
			actorId: DM_ACTOR.id,
			payload: { combatantId: ctx.state.session.combat.order[0]! },
		}),
	},
	{
		name: 'combat.reorder-combatant',
		type: 'combat.reorder-combatant',
		setup: startCombat,
		command: (ctx) => ({
			type: 'combat.reorder-combatant',
			actorId: DM_ACTOR.id,
			payload: { combatantId: ctx.state.session.combat.order[1]!, direction: 'earlier' },
		}),
	},
	{
		name: 'combat.set-combatant-visibility',
		type: 'combat.set-combatant-visibility',
		setup: startCombat,
		command: (ctx) => ({
			type: 'combat.set-combatant-visibility',
			actorId: DM_ACTOR.id,
			payload: { combatantId: ctx.state.session.combat.order[0]!, hidden: true },
		}),
	},
	{
		name: 'combat.place-token',
		type: 'combat.place-token',
		setup: startCombat,
		command: (ctx) => ({
			type: 'combat.place-token',
			actorId: DM_ACTOR.id,
			payload: {
				combatantId: ctx.state.session.combat.order[0]!,
				mapId: 'map-western-reaches',
				x: 0.3,
				y: 0.4,
			},
		}),
	},
	{
		name: 'combat.move-token',
		type: 'combat.move-token',
		setup: (ctx) => placeToken(startCombat(ctx)),
		command: (ctx) => ({
			type: 'combat.move-token',
			actorId: DM_ACTOR.id,
			payload: { combatantId: ctx.state.session.combat.order[0]!, x: 0.5, y: 0.6 },
		}),
	},
	{
		name: 'combat.remove-token',
		type: 'combat.remove-token',
		setup: (ctx) => placeToken(startCombat(ctx)),
		command: (ctx) => ({
			type: 'combat.remove-token',
			actorId: DM_ACTOR.id,
			payload: { combatantId: ctx.state.session.combat.order[0]! },
		}),
	},
	{
		name: 'combat.place-template',
		type: 'combat.place-template',
		setup: startCombat,
		command: () => ({
			type: 'combat.place-template',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sphere',
				mapId: 'map-western-reaches',
				label: 'Fireball',
				x: 0.3,
				y: 0.4,
				size: 20,
			},
		}),
	},
	{
		name: 'combat.remove-template',
		type: 'combat.remove-template',
		setup: (ctx) => placeTemplate(startCombat(ctx)),
		command: (ctx) => ({
			type: 'combat.remove-template',
			actorId: DM_ACTOR.id,
			payload: { templateId: ctx.state.session.combat.templates[0]!.id },
		}),
	},
	{
		name: 'session.record-dice',
		type: 'session.record-dice',
		command: () => ({
			type: 'session.record-dice',
			actorId: DM_ACTOR.id,
			payload: { expression: '1d20', total: 11 },
		}),
	},
	{
		name: 'dice.roll',
		type: 'dice.roll',
		command: () => ({
			type: 'dice.roll',
			actorId: PLAYER_ACTOR.id,
			payload: { expression: '1d20' },
		}),
	},
	{
		name: 'dice.roll-table',
		type: 'dice.roll-table',
		command: (ctx) => ({
			type: 'dice.roll-table',
			actorId: DM_ACTOR.id,
			payload: { tableItemId: ctx.tableItemId, seed: 'standby' },
		}),
	},
	{
		name: 'combat.start',
		type: 'combat.start',
		command: () => ({
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: { combatants: [{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 }] },
		}),
	},
	{
		name: 'combat.advance-turn',
		type: 'combat.advance-turn',
		setup: startCombat,
		command: () => ({ type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'combat.apply-resource',
		type: 'combat.apply-resource',
		setup: startCombat,
		command: (ctx) => ({
			type: 'combat.apply-resource',
			actorId: DM_ACTOR.id,
			payload: { combatantId: ctx.state.session.combat.order[0]!, kind: 'hp', delta: -1 },
		}),
	},
	{
		name: 'combat.end',
		type: 'combat.end',
		setup: startCombat,
		command: () => ({ type: 'combat.end', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'session.deliver-handout',
		type: 'session.deliver-handout',
		command: (ctx) => ({
			type: 'session.deliver-handout',
			actorId: DM_ACTOR.id,
			payload: {
				title: 'A letter',
				sections: [{ heading: 'Body', body: 'You find a letter.', visibility: 'player-visible' }],
				sceneId: ctx.homeSceneId,
				recipientActorIds: [PLAYER_ACTOR.id],
				connectionState: 'connected',
			},
		}),
	},
	{
		name: 'session.reveal-handout-section',
		type: 'session.reveal-handout-section',
		setup: deliverLetter,
		command: (ctx) => ({
			type: 'session.reveal-handout-section',
			actorId: DM_ACTOR.id,
			payload: {
				handoutId: Object.keys(ctx.state.session.handouts)[0]!,
				sectionId: 'sec-1',
				revealed: true,
			},
		}),
	},
	{
		name: 'session.project-active-map',
		type: 'session.project-active-map',
		setup: selectMap,
		command: () => ({
			type: 'session.project-active-map',
			actorId: DM_ACTOR.id,
			payload: { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'connected' },
		}),
	},
	{
		name: 'character.update-combat-resource',
		type: 'character.update-combat-resource',
		command: (ctx) => ({
			type: 'character.update-combat-resource',
			actorId: DM_ACTOR.id,
			payload: { characterId: ctx.characterId, kind: 'hp', delta: -1 },
		}),
	},
	{
		name: 'session.quick-timer.start',
		type: 'session.quick-timer.start',
		command: () => ({
			type: 'session.quick-timer.start',
			actorId: DM_ACTOR.id,
			payload: { kind: 'countdown', durationSeconds: 300 },
		}),
	},
	{
		name: 'session.quick-timer.pause',
		type: 'session.quick-timer.pause',
		setup: startQuickTimer,
		command: () => ({ type: 'session.quick-timer.pause', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'session.quick-timer.resume',
		type: 'session.quick-timer.resume',
		setup: (ctx) =>
			run(startQuickTimer(ctx), {
				type: 'session.quick-timer.pause',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		command: () => ({ type: 'session.quick-timer.resume', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'session.quick-timer.reset',
		type: 'session.quick-timer.reset',
		setup: startQuickTimer,
		command: () => ({ type: 'session.quick-timer.reset', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'session.quick-timer.lap',
		type: 'session.quick-timer.lap',
		setup: startQuickTimer,
		command: () => ({ type: 'session.quick-timer.lap', actorId: DM_ACTOR.id, payload: {} }),
	},
	{
		name: 'session.project-player-view',
		type: 'session.project-player-view',
		setup: (ctx) => ctx,
		command: (ctx) => ({
			type: 'session.project-player-view',
			actorId: DM_ACTOR.id,
			payload: {
				playerActorIds: [PLAYER_ACTOR.id],
				connectionState: 'connected',
				target: {
					kind: 'scene',
					sceneId: ctx.homeSceneId,
					sectionIds: null,
					widgetInstanceIds: null,
					displayState: null,
					mapRegion: null,
				},
			},
		}),
	},
	{
		name: 'session.revoke-player-view',
		type: 'session.revoke-player-view',
		setup: projectPlayerView,
		command: () => ({
			type: 'session.revoke-player-view',
			actorId: DM_ACTOR.id,
			payload: { playerActorIds: [PLAYER_ACTOR.id] },
		}),
	},
	{
		name: 'session.set-active-map',
		type: 'session.set-active-map',
		command: () => ({
			type: 'session.set-active-map',
			actorId: DM_ACTOR.id,
			payload: { mapId: 'map-western-reaches', regionId: 'region-north-road' },
		}),
	},
	{
		name: 'session.pin-quick-reference',
		type: 'session.pin-quick-reference',
		command: () => ({
			type: 'session.pin-quick-reference',
			actorId: DM_ACTOR.id,
			payload: { kind: 'session-context', label: 'Tonight' },
		}),
	},
	{
		name: 'session.unpin-quick-reference',
		type: 'session.unpin-quick-reference',
		setup: pinSessionContext,
		command: (ctx) => ({
			type: 'session.unpin-quick-reference',
			actorId: DM_ACTOR.id,
			payload: { panelId: Object.keys(ctx.state.session.quickReferencePanels)[0]! },
		}),
	},
	{
		// The session-writing widget command (the Timer widget) lost the same guard.
		name: 'widget.dispatch-command (Timer widget timer.start)',
		type: 'widget.dispatch-command',
		command: (ctx) => {
			const scene = ctx.state.scenes.scenes[ctx.homeSceneId]!;
			const timer = scene.widgets.find((widget) => widget.type === 'timer');
			if (!timer) throw new Error('the home Scene has no Timer widget');
			return {
				type: 'widget.dispatch-command',
				actorId: DM_ACTOR.id,
				idempotencyKey: `standby-timer-${ctx.state.session.workflow}`,
				payload: {
					sceneId: ctx.homeSceneId,
					widgetInstanceId: timer.id,
					commandType: 'timer.start',
					payload: { durationSeconds: 60 },
					expectedRevision: scene.ownership.revision,
				},
			};
		},
	},
];

describe('RC-SES-6.1: every moved command runs in every workflow state', () => {
	it('covers every command that used to wait for Go live or for a non-idle workflow', () => {
		const covered = MOVED.map((moved) => moved.type).filter(
			(type) => type !== 'widget.dispatch-command',
		);
		expect([...covered].sort()).toEqual([...FORMERLY_GATED, ...FORMERLY_COMBAT_GATED].sort());
		for (const type of FORMERLY_GATED) {
			expect(SESSION_COMMAND_AVAILABILITY[type]).toBe('always');
		}
	});

	describe.each(MOVED.map((moved) => [moved.name, moved] as const))('%s', (_name, moved) => {
		it.each([...SESSION_WORKFLOW_STATES])('is accepted in %s', (workflow) => {
			let ctx = inWorkflow(workflow);
			if (moved.setup) ctx = moved.setup(ctx);
			const next = accepted(dispatchCommand(ctx.state, ctx.env, moved.command(ctx)), moved.name);
			// Using a table tool never moves the workflow: it is not going live.
			expect(next.session.workflow).toBe(workflow);
		});
	});
});

describe('RC-SES-6.1: records carry the workflow they happened in', () => {
	it.each([...SESSION_WORKFLOW_STATES])(
		'stamps rolls, encounter-log entries and handout deliveries made in %s',
		(workflow) => {
			let ctx = inWorkflow(workflow);
			ctx = startCombat(ctx);
			ctx = roll(ctx, 'Perception');
			ctx = deliverLetter(ctx);
			const { session } = ctx.state;
			expect(session.diceHistory.at(-1)).toMatchObject({ label: 'Perception', workflow });
			expect(
				session.combat.log.map((entry) => [entry.kind, (entry as { workflow?: string }).workflow]),
			).toEqual([
				['combat-started', workflow],
				['roll', workflow],
			]);
			const [handout] = Object.values(session.handouts);
			expect(handout?.deliveries).toEqual([expect.objectContaining({ workflow })]);
			const live = workflow === 'active';
			expect(happenedLive(session.diceHistory.at(-1)!)).toBe(live);
			expect(session.combat.log.every(happenedLive)).toBe(live);
			expect(handout!.deliveries.every(happenedLive)).toBe(live);
		},
	);

	it.each([...SESSION_WORKFLOW_STATES])(
		'the actor-filtered combat history keeps the workflow of entries made in %s without widening visibility',
		(workflow) => {
			let ctx = startCombat(inWorkflow(workflow));
			const wolfId = ctx.state.session.combat.order[2]!;
			ctx = run(ctx, {
				type: 'combat.set-combatant-visibility',
				actorId: DM_ACTOR.id,
				payload: { combatantId: wolfId, hidden: true },
			});
			ctx = roll(ctx, 'Perception');
			const { combat } = ctx.state.session;
			const stored = new Map(combat.log.map((entry) => [entry.id, entry]));
			const live = workflow === 'active';
			for (const actor of [DM_ACTOR, PLAYER_ACTOR]) {
				const view = getCombatTrackerForActor(combat, ctx.state.permissions, actor.id);
				expect(view.log.length).toBeGreaterThan(0);
				for (const row of view.log) {
					expect(row.workflow).toBe(workflow);
					expect(happenedLive(row)).toBe(live);
					expect(happenedLive(row)).toBe(happenedLive(stored.get(row.id)!));
				}
				// Attribution does not widen the filter: the entry naming the hidden Wolf stays DM-only.
				const namesWolf = view.log.some((row) => row.combatantId === wolfId);
				expect(namesWolf).toBe(actor.id === DM_ACTOR.id);
			}
		},
	);

	it('a legacy encounter-log entry without a workflow projects without one and reads as live', () => {
		const ctx = startCombat(inWorkflow('active'));
		const legacyLog = ctx.state.session.combat.log.map(
			({ workflow: _workflow, ...entry }) => entry,
		);
		const combat = { ...ctx.state.session.combat, log: legacyLog };
		for (const actor of [DM_ACTOR, PLAYER_ACTOR]) {
			const view = getCombatTrackerForActor(combat, ctx.state.permissions, actor.id);
			expect(view.log.length).toBeGreaterThan(0);
			for (const row of view.log) {
				expect('workflow' in row).toBe(false);
				expect(happenedLive(row)).toBe(true);
			}
		}
	});

	it('recover retains outside-session rolls, combat events and mixed handout deliveries without duplicates', () => {
		let ctx = deliverLetter(startCombat(roll(inWorkflow('idle'), 'Standby check')), 'Mixed letter');
		const mixedId = Object.keys(ctx.state.session.handouts)[0]!;
		ctx = deliverLetter(ctx, 'Outside only');
		const outsideRoll = ctx.state.session.diceHistory[0]!;
		const outsideCombat = [...ctx.state.session.combat.log];
		const outsideHandouts = ctx.state.session.handouts;
		ctx = setWorkflow(ctx, 'active');
		ctx = advanceTurn(roll(ctx, 'Live check'));
		ctx = run(ctx, {
			type: 'session.deliver-handout',
			actorId: DM_ACTOR.id,
			payload: {
				handoutId: mixedId,
				title: 'Mixed letter',
				sections: [{ id: 'sec-1', heading: 'Body', body: 'Again', visibility: 'shared' }],
				sceneId: ctx.homeSceneId,
				recipientActorIds: [PLAYER_ACTOR.id],
				connectionState: 'connected',
			},
		});
		const mixedDeliveries = ctx.state.session.handouts[mixedId]!.deliveries;
		ctx = setWorkflow(setWorkflow(ctx, 'ending'), 'recap');
		const archiveId = ctx.state.session.recapArchiveId!;
		const archiveBefore = structuredClone(ctx.state.session.archives[archiveId]!);
		expect(archiveBefore.handouts[mixedId]!.deliveries).toEqual(
			mixedDeliveries.filter(happenedLive),
		);
		expect(Object.keys(archiveBefore.handouts)).toEqual([mixedId]);
		// History written after archive creation must survive recovery as well.
		ctx = roll(ctx, 'Recap check');
		const recapRoll = ctx.state.session.diceHistory.at(-1)!;
		for (let attempt = 0; attempt < 2; attempt++) {
			ctx = run(ctx, { type: 'session.recover', actorId: DM_ACTOR.id, payload: { archiveId } });
			expect(ctx.state.session.diceHistory).toEqual(
				expect.arrayContaining([outsideRoll, recapRoll, ...archiveBefore.diceHistory]),
			);
			expect(ctx.state.session.diceHistory).toHaveLength(3);
			expect(ctx.state.session.combat.log).toEqual(
				expect.arrayContaining([...outsideCombat, ...archiveBefore.combat.log]),
			);
			expect(ctx.state.session.combat.log).toHaveLength(
				outsideCombat.length + archiveBefore.combat.log.length,
			);
			expect(ctx.state.session.handouts[mixedId]!.deliveries).toEqual(mixedDeliveries);
			const outsideOnly = Object.values(outsideHandouts).find((handout) => handout.id !== mixedId)!;
			expect(ctx.state.session.handouts[outsideOnly.id]).toEqual(outsideOnly);
			expect(ctx.state.session.archives[archiveId]).toEqual(archiveBefore);
		}
	});

	it('reads a record written before the stamp existed as live (the old gate allowed nothing else)', () => {
		expect(happenedLive({ id: 'roll-legacy', expression: '1d20', total: 12 })).toBe(true);
		expect(happenedLive({ id: 'roll-standby', workflow: 'idle' })).toBe(false);
	});

	it('capture and recap exclude Standby rolls: the archive they review keeps only live records', () => {
		let ctx = inWorkflow('idle');
		// In Standby: a roll, a fight that runs a turn, and a handout.
		ctx = roll(ctx, 'Standby check');
		ctx = startCombat(ctx);
		ctx = advanceTurn(ctx);
		ctx = deliverLetter(ctx, 'Standby letter');
		// Go live and do the same again (the fight carries on).
		ctx = setWorkflow(ctx, 'active');
		ctx = roll(ctx, 'Live check');
		ctx = advanceTurn(ctx);
		ctx = deliverLetter(ctx, 'Live letter');

		// History keeps everything and can tell the two apart ("Outside a session").
		expect(ctx.state.session.diceHistory.map((r) => [r.label, happenedLive(r)])).toEqual([
			['Standby check', false],
			['Live check', true],
		]);

		ctx = setWorkflow(ctx, 'ending');
		ctx = setWorkflow(ctx, 'recap');
		const outsideRolls = getDiceHistoryForActor(
			ctx.state.session,
			ctx.state.permissions,
			DM_ACTOR.id,
		).rolls;
		expect(outsideRolls.map((r) => [r.label, r.workflow])).toEqual([['Standby check', 'idle']]);
		expect(ctx.state.session.combat.log.length).toBeGreaterThan(0);
		expect(ctx.state.session.combat.log.every((entry) => !happenedLive(entry))).toBe(true);
		expect(Object.values(ctx.state.session.handouts).map((h) => h.title)).toEqual([
			'Standby letter',
		]);
		const archiveId = ctx.state.session.recapArchiveId!;
		const archive = ctx.state.session.archives[archiveId]!;
		expect(archive.diceHistory.map((r) => r.label)).toEqual(['Live check']);
		expect(archive.combat.log.map((entry) => entry.kind)).toEqual(['roll', 'turn-advanced']);
		expect(Object.values(archive.handouts).map((handout) => handout.title)).toEqual([
			'Live letter',
		]);

		// The end-of-session capture is written onto that archive, so it never sees the Standby roll.
		ctx = run(ctx, {
			type: 'session.author-recap',
			actorId: DM_ACTOR.id,
			payload: { archiveId, markdown: 'The party met the goblins.' },
		});
		const captured = ctx.state.session.archives[archiveId]!;
		expect(captured.recap).toBeDefined();
		expect(captured.diceHistory.map((r) => r.label)).toEqual(['Live check']);
		ctx = setWorkflow(ctx, 'archived');
		ctx = setWorkflow(ctx, 'idle');
		expect(
			getDiceHistoryForActor(ctx.state.session, ctx.state.permissions, DM_ACTOR.id).rolls,
		).toMatchObject([{ label: 'Standby check', workflow: 'idle' }]);
		expect(Object.values(ctx.state.session.handouts).map((h) => h.title)).toEqual([
			'Standby letter',
		]);
		ctx = startCombat(ctx);
		expect(ctx.state.session.combat.log.some((entry) => entry.workflow === 'idle')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Automations are a live-only effect
// ---------------------------------------------------------------------------

const CLEARED_ASSET = {
	id: 'asset-cleared',
	mimeType: 'audio/mpeg',
	fileName: 'battle.mp3',
	title: 'Battle',
	byteLength: 10,
	checksum: 'abc',
	license: { kind: 'owned' as const, licenseNote: '', attribution: '' },
	tags: [],
	durationSeconds: null,
	waveform: [],
	source: { sourceId: 's-local', importedAt: 't', importedBy: DM_ACTOR.id },
	schemaVersion: 1 as const,
};

function combatStartAudio(): { rule: AudioAutomationRule; library: AudioState } {
	const configured = configureAudioSource({
		id: 's-local',
		type: 'local-file',
		displayName: 'Battle music',
		cacheBehavior: 'local',
		createdBy: DM_ACTOR.id,
		createdAt: 't',
	});
	if (!configured.ok) throw new Error('expected a configured source');
	const library = ensureAudioState({
		sources: { 's-local': configured.source },
		assets: { [CLEARED_ASSET.id]: CLEARED_ASSET },
	});
	const built = buildAudioAutomationRule({
		id: 'rule-combat-start',
		trigger: 'combat-start',
		action: 'play',
		sourceId: 's-local',
		assetId: CLEARED_ASSET.id,
		createdBy: DM_ACTOR.id,
		createdAt: 't',
		library,
	});
	if (!built.ok) throw new Error(`expected a built rule: ${built.reason}`);
	return {
		rule: built.rule,
		library: { ...library, automationRules: { [built.rule.id]: built.rule } },
	};
}

function combatStartTrigger(workflow: SessionWorkflowState | null): AudioAutomationTrigger {
	return {
		kind: 'combat-start',
		scopeId: null,
		online: true,
		assetLocallyAvailable: true,
		assetCached: true,
		cacheEvicted: false,
		...(workflow ? { sessionWorkflow: workflow } : {}),
	};
}

describe('RC-SES-6.1: automation rules wait for Go live', () => {
	it('a combat-start rule resolves only for an event fired while live', () => {
		const { rule, library } = combatStartAudio();
		for (const workflow of SESSION_WORKFLOW_STATES) {
			const outcome = evaluateAudioAutomationRule(rule, combatStartTrigger(workflow), library);
			if (workflow === 'active') expect(outcome).toMatchObject({ status: 'requested' });
			else expect(outcome).toBeNull();
		}
		// A resolution the DM runs by hand ("Run now", the outcome preview) is not an automation firing.
		expect(evaluateAudioAutomationRule(rule, combatStartTrigger(null), library)).toMatchObject({
			status: 'requested',
		});
	});

	it('starting combat in Standby fires no combat-start automation; starting it live does', () => {
		const { library } = combatStartAudio();
		const resolveAfterStart = (workflow: SessionWorkflowState) => {
			const ctx = startCombat(inWorkflow(workflow));
			expect(ctx.state.session.combat.status).toBe('running');
			return resolveAudioAutomationForActor(
				library,
				ctx.state.permissions,
				DM_ACTOR.id,
				combatStartTrigger(ctx.state.session.workflow),
			);
		};
		expect(resolveAfterStart('idle')).toMatchObject({ requests: [], blockedCount: 0 });
		expect(resolveAfterStart('active')?.requests).toEqual([
			{ action: 'play', sourceId: 's-local', assetId: CLEARED_ASSET.id },
		]);
	});
});
