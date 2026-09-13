import { z } from 'zod';
import { hasDmAuthority } from '../state/permission-state';
import {
	addCombatantsInputSchema,
	advanceCombatTurnInputSchema,
	applyCombatResourceInputSchema,
	endCombatInputSchema,
	moveCombatTokenInputSchema,
	placeCombatTemplateInputSchema,
	placeCombatTokenInputSchema,
	previousCombatTurnInputSchema,
	removeCombatTemplateInputSchema,
	removeCombatTokenInputSchema,
	removeCombatantInputSchema,
	reorderCombatantInputSchema,
	setCombatantVisibilityInputSchema,
	startCombatInputSchema,
} from '../schemas/commands';
import {
	COMBAT_ENTITY_TYPE,
	activeCombatant,
	advanceTurn,
	autoPlaceCombatTokens,
	MAX_COMBAT_TEMPLATES,
	cloneCombatTemplate,
	cloneCombatToken,
	cloneCombatant,
	cloneResources,
	initiativeInsertionIndex,
	isCombatTemplate,
	isCombatTokenPlacement,
	orderInitiative,
	previousTurn,
	resolveCondition,
	// RC-SES-3.1 — condition countdowns and the round tick that runs them out.
	sanitizeConditionRounds,
	tickCombatConditions,
	type Combatant,
	type CombatantResources,
	type CombatLogEntry,
	type CombatTemplate,
	type CombatToken,
	type SessionCombatState,
} from '../state/combat-tracker';
import { rollExpression } from '../state/dice';
import {
	DEATH_SAVE_MAX,
	EMPTY_CONCENTRATION,
	EMPTY_DEATH_SAVES,
	applyConcentrationCheckOutcome,
	raiseConcentrationCheck,
} from '../state/character-resources';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import { activeSystemPackageFor } from './character';
import { encounterById } from '../state/encounter';
import { hasGrantedCapability } from '../permissions/grants';
import { actorMayMoveCombatantToken } from '../queries/combat-tracker-view';
import type { Actor } from '../state/permission-state';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import { happenedLive, stampWorkflow } from '../lifecycle/session-workflow';

/**
 * SES-002 — RUN COMBAT command handlers (Architecture Contract 1 / Contract 3).
 *
 * The DM runs combat with INITIATIVE ORDER, ROUNDS, and TURNS, and applies per-combatant HP /
 * conditions / concentration / death saves, with stat-block previews and a durable ENCOUNTER LOG.
 * Every mutation is a Processing-Core command: it requires the right actor, validates with a pure
 * reducer, mutates the durable combat state through the PURE combat-tracker functions
 * (`state/combat-tracker.ts`), appends a durable `combat.*` sync op, and records the change on the
 * durable encounter log. The GUI never writes combat state directly.
 *
 * Authority + fail-closed posture:
 *
 *   - Combat is DM-RUN: starting/advancing combat and ending it are DM-only.
 *   - Applying a combatant resource (HP / temp HP / condition / death save / concentration) accepts
 *     the DM, OR — for a combatant that IS a character — a player holding `combat-participant` on that
 *     character (the CHAR-007 authority, reused). Observers never qualify.
 *   - RC-SES-5.1 — a player may set INITIATIVE only by rolling for a character combatant they hold
 *     `combat-participant` on, only while the DM's initiative call is open, and only once. Setting a
 *     value (the "adjust") is the DM's alone.
 *   - Combat runs in every session workflow state (RC-SES-6.1: Standby permits everything). Every
 *     encounter-log entry records the workflow it happened in, so the session log, capture and recap
 *     keep only the entries made while live. Commands still fail closed for unauthorized actors.
 */

const SESSION_ENTITY_ID = 'session-default';

/**
 * Commit a combat mutation. RC-SES-6.1 — every encounter-log entry the mutation added (including the
 * condition-expiry entries the tracker's round tick writes) is stamped with the workflow it happened
 * in. Entries already on the log keep their stamp, or their absence of one.
 */
function withCombat(state: CoreStateSlice, combat: SessionCombatState): CoreStateSlice {
	const known = new Set(state.session.combat.log.map((entry) => entry.id));
	const log = combat.log.map((entry) =>
		known.has(entry.id) || 'workflow' in entry
			? entry
			: stampWorkflow(entry, state.session.workflow),
	);
	return { ...state, session: { ...state.session, combat: { ...combat, log } } };
}

// --- RC-SES-5.1 — the initiative CALL -------------------------------------------------------------

/**
 * RC-SES-5.1 — whether the fight is still in its INITIATIVE CALL: combat is running but round 1 has
 * not begun. The DM opened it with `combat.start` + `rollForInitiative`, players are rolling from their
 * own devices, and nobody has acted yet. `round` is 0 here exactly as it is before any combat, so the
 * turn machinery needs no new field: the first `combat.advance-turn` begins round 1.
 */
function initiativeCallOpen(combat: SessionCombatState): boolean {
	return combat.status === 'running' && combat.round === 0;
}

/**
 * RC-SES-5.1 — `combat.start`'s input plus the flag that opens the fight as an initiative call. Built
 * here from the shared schema's shape, and kept strict, so an unknown key is still refused.
 */
const startCombatWithCallInputSchema = z
	.object({
		...startCombatInputSchema.shape,
		rollForInitiative: z.boolean().default(false),
	})
	.strict();

function combatLogEntry(
	env: CoreEnvironment,
	actor: Actor,
	operationId: string,
	combat: SessionCombatState,
	kind: CombatLogEntry['kind'],
	label: string,
	combatantId: string | null,
	delta: number | null,
): CombatLogEntry {
	return {
		id: env.ids(),
		round: combat.round,
		turn: combat.turn,
		kind,
		label,
		combatantId,
		delta,
		actorActorId: actor.id,
		actorRole: actor.role,
		at: env.clock(),
		operationId,
	};
}

// --- SES-002 — start combat (roll initiative) ----------------------------------------------------

/**
 * Build a tracker combatant from a start-combat input row, seeding its resources from the supplied
 * HP/AC/initiative (and, for a character combatant, mirroring the character's current combat block so
 * the tracker reflects the live sheet at start).
 */
function buildCombatant(
	state: CoreStateSlice,
	row: {
		id?: string;
		kind: Combatant['kind'];
		name: string;
		characterId?: string | null;
		ac: number;
		initiative: number;
		maxHp: number;
		hidden: boolean;
		placeholder?: string | null;
		notes?: string;
	},
	idFor: () => string,
): Combatant {
	let resources: CombatantResources = {
		hp: row.maxHp,
		maxHp: row.maxHp,
		tempHp: 0,
		conditions: [],
		deathSaves: { ...EMPTY_DEATH_SAVES },
		concentration: { ...EMPTY_CONCENTRATION },
	};
	let ac = row.ac;
	// A character combatant mirrors the character's current combat block at start (a snapshot seed).
	if (row.kind === 'character' && row.characterId) {
		const character = state.characters.characters[row.characterId];
		if (character) {
			resources = {
				hp: character.combat.hp,
				maxHp: character.combat.maxHp,
				tempHp: character.combat.tempHp,
				conditions: [...character.combat.conditions],
				deathSaves: { ...EMPTY_DEATH_SAVES },
				concentration: { ...EMPTY_CONCENTRATION },
			};
			ac = character.combat.ac;
		}
	}
	return {
		id: row.id ?? idFor(),
		kind: row.kind,
		name: row.name,
		characterId: row.characterId ?? null,
		statBlock: {
			ac,
			initiative: row.initiative,
			notes: row.notes ?? '',
		},
		resources,
		hidden: row.hidden,
		placeholder: row.placeholder ?? null,
		tieBreak: 0,
	};
}

export function handleStartCombat(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	// SES-002 — refuse to start over a running combat. Silently replacing it would DISCARD the
	// in-progress encounter (its log, round/turn, and combatants); the DM must explicitly end the
	// current combat first. Fail closed against accidental data loss.
	if (state.session.combat.status === 'running') {
		return reject(
			{
				code: 'invalid-state',
				message: 'Combat is already running. End the current combat before starting a new one.',
			},
			state,
		);
	}

	const parsed = parseInput(startCombatWithCallInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	// RC-SES-5.1 — open the fight as an initiative call (round 0) instead of starting round 1.
	const calling = parsed.data.rollForInitiative;

	// An encounter link (SES-006 → SES-002) is BY REFERENCE: the encounter must exist, but its data is
	// not cloned — its combatant selections seed tracker combatants and the link is recorded.
	const encounterId: string | null = parsed.data.encounterId ?? null;
	let rows = parsed.data.combatants;
	// SES-006 AC2: terrain notes flow from the encounter into combat state at start time.
	let linkedTerrainNotes = '';
	if (encounterId) {
		const encounter = encounterById(state.encounters, encounterId);
		if (!encounter) {
			return reject(
				{ code: 'encounter-not-found', message: `Encounter ${encounterId} does not exist.` },
				state,
			);
		}
		// Capture terrain notes from the encounter (SES-006 AC2).
		linkedTerrainNotes = encounter.terrainNotes;
		// When started from an encounter with no explicit combatant overrides, flow the encounter's
		// combatant selections into the tracker (SES-006 AC2).
		if (rows.length === 0) {
			rows = encounter.combatants.flatMap((selection) => {
				const count = Math.max(1, selection.quantity);
				return Array.from({ length: count }, (_unused, index) => ({
					kind: selection.kind,
					name: count > 1 ? `${selection.name} ${index + 1}` : selection.name,
					characterId: selection.characterId,
					ac: selection.ac,
					initiative: selection.initiative,
					maxHp: selection.maxHp,
					hidden: selection.hidden,
					notes: '',
				}));
			});
		}
	}

	if (rows.length === 0) {
		return reject(
			{ code: 'invalid-payload', message: 'Combat requires at least one combatant.' },
			state,
		);
	}

	const combatants = rows.map((row) => buildCombatant(state, row, env.ids));
	const ordered = orderInitiative(combatants);
	const combatantMap: Record<string, Combatant> = {};
	for (const combatant of ordered.combatants) combatantMap[combatant.id] = combatant;

	// RC-MAP-1.1 — when the session has an ACTIVE MAP, put every combatant on it in a deterministic
	// starting formation, so combat begins with tokens already on the board instead of the DM placing
	// a dozen of them by hand while the table waits. With no active map, combat runs without tokens
	// and the DM can place them later. The placement is a pure function of the initiative order, so a
	// replay reproduces it exactly.
	const tokenMapId = state.session.activeMap?.mapId ?? null;
	const tokens = tokenMapId ? autoPlaceCombatTokens(ordered.order, tokenMapId) : {};

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		status: 'running',
		encounterId,
		// SES-006 AC2: terrain notes flowed from the linked encounter (empty for ad-hoc combat).
		terrainNotes: linkedTerrainNotes,
		round: calling ? 0 : 1,
		turn: 0,
		combatants: combatantMap,
		order: ordered.order,
		tokens,
		// RC-MAP-1.2 — a new fight starts with a clear board: no area of effect carries over.
		templates: [],
		log: [],
		revision: state.session.combat.revision + 1,
		schemaVersion: state.session.combat.schemaVersion,
	};
	const startEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'combat-started',
		calling
			? `Initiative called for ${ordered.order.length} combatant(s).`
			: `Combat started with ${ordered.order.length} combatant(s).`,
		null,
		null,
	);
	nextCombat = {
		...nextCombat,
		log: [...state.session.combat.log.filter((entry) => !happenedLive(entry)), startEntry],
	};

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.start',
		path: 'combat',
		value: {
			encounterId,
			order: ordered.order,
			combatantCount: ordered.order.length,
			// RC-MAP-1.1 — record WHICH map the auto-placement used. The formation itself is derived
			// from `order`, so a replay reproduces it without shipping a coordinate per combatant.
			tokenMapId,
			// RC-SES-5.1 — whether this start opened an initiative call (round 0) rather than round 1.
			initiativeCall: calling,
		},
		beforeRevision: state.session.combat.revision,
		afterRevision: nextCombat.revision,
		...(encounterId ? { dependencies: [`encounter:${encounterId}`] } : {}),
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.started',
				actorId: actor.id,
				encounterId,
				combatantCount: ordered.order.length,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- SES-002 — advance turn (wraps to next round) ------------------------------------------------

export function handleAdvanceCombatTurn(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(advanceCombatTurnInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}

	// RC-SES-5.1 — out of an initiative call the first advance BEGINS the fight: round 1, at the top of
	// the order the rolls produced. It enters a round (the log reads "Round 1 begins.") but nothing
	// ticks, because no round has passed for a countdown to lose.
	const beginning = initiativeCallOpen(combat);
	const advance = beginning
		? { round: 1, turn: 0, wrappedRound: true }
		: advanceTurn(combat.round, combat.turn, combat.order.length);
	const operationId = env.ids();
	// RC-SES-3.1 — condition countdowns run on ROUNDS, so they only tick when the turn wraps into a
	// new round. Every timed condition loses a round; one that hits zero comes off the combatant here.
	const tick =
		advance.wrappedRound && !beginning
			? tickCombatConditions(combat.combatants, combat.order)
			: { combatants: combat.combatants, expired: [] };
	let nextCombat: SessionCombatState = {
		...combat,
		round: advance.round,
		turn: advance.turn,
		combatants: tick.combatants,
		revision: combat.revision + 1,
	};
	const nextActiveId = nextCombat.order[nextCombat.turn] ?? null;
	const nextActive = nextActiveId ? nextCombat.combatants[nextActiveId] : null;
	const turnEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		advance.wrappedRound ? 'round-advanced' : 'turn-advanced',
		advance.wrappedRound
			? `Round ${advance.round} begins.`
			: `Turn advanced to ${nextActive?.name ?? 'combatant'}.`,
		nextActiveId,
		null,
	);
	// RC-SES-3.1 — one log line per expiry, after the round line, in initiative order. The expiry is
	// named plainly ("Goblin: Poisoned wore off") because the DM reads the log to answer "why is that
	// gone?" and the answer has to be there without decoding anything.
	const expiryEntries = tick.expired.map((entry) =>
		combatLogEntry(
			env,
			actor,
			operationId,
			nextCombat,
			'condition-expired',
			`${combat.combatants[entry.combatantId]?.name ?? 'Combatant'}: ${
				resolveCondition(activeSystemPackageFor(state), entry.key).label
			} wore off`,
			entry.combatantId,
			null,
		),
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, turnEntry, ...expiryEntries] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.advance-turn',
		path: 'combat/turn',
		value: {
			round: advance.round,
			turn: advance.turn,
			wrappedRound: advance.wrappedRound,
			// RC-SES-3.1 — the op records WHICH conditions ran out on this tick, so a replay on another
			// device drops the same conditions instead of re-deriving them from a package it may not
			// have. The tick is otherwise a pure function of the combat state.
			expiredConditions: tick.expired.map((entry) => ({
				combatantId: entry.combatantId,
				condition: entry.key,
			})),
		},
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.turn-advanced',
				actorId: actor.id,
				round: advance.round,
				turn: advance.turn,
				wrappedRound: advance.wrappedRound,
				activeCombatantId: nextActiveId,
				revision: nextCombat.revision,
			},
			// RC-SES-3.1 — one event per expiry so the interface can say what wore off and on whom,
			// rather than diffing two tracker views and guessing.
			...tick.expired.map((entry) => ({
				kind: 'combat.condition-expired' as const,
				actorId: actor.id,
				combatantId: entry.combatantId,
				condition: entry.key,
				round: advance.round,
				revision: nextCombat.revision,
			})),
		],
		operationIds: [draft.op.id],
	};
}

// --- UX-SES-006 — previous turn (the undo for an accidental advance) ------------------------------

export function handlePreviousCombatTurn(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(previousCombatTurnInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}
	// RC-SES-5.1 — during an initiative call nobody has acted, so there is no turn to go back to.
	if (initiativeCallOpen(combat)) {
		return reject({ code: 'invalid-state', message: 'Round 1 has not begun yet.' }, state);
	}
	// Nothing to return to before the first turn of round 1 (the pure helper is a no-op there).
	if (combat.round <= 1 && combat.turn <= 0) {
		return reject(
			{ code: 'invalid-state', message: 'Combat is already at the first turn of round 1.' },
			state,
		);
	}

	const revert = previousTurn(combat.round, combat.turn, combat.order.length);
	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		round: revert.round,
		turn: revert.turn,
		revision: combat.revision + 1,
	};
	const nextActiveId = nextCombat.order[nextCombat.turn] ?? null;
	const nextActive = nextActiveId ? nextCombat.combatants[nextActiveId] : null;
	const turnEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'turn-reverted',
		`Returned to ${nextActive?.name ?? 'combatant'}'s turn.`,
		nextActiveId,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, turnEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.previous-turn',
		path: 'combat/turn',
		value: { round: revert.round, turn: revert.turn, wrappedRound: revert.wrappedRound },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.turn-reverted',
				actorId: actor.id,
				round: revert.round,
				turn: revert.turn,
				wrappedRound: revert.wrappedRound,
				activeCombatantId: nextActiveId,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- SES-002 — apply a per-combatant resource (HP/condition/concentration/death-save) ------------

/** Clamp into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * SES-002 authority for editing a combatant's resources: the DM always; for a CHARACTER combatant, a
 * player holding `combat-participant` on that character (the CHAR-007 authority, reused). An observer
 * never qualifies. An NPC/monster combatant has no character owner, so only the DM may edit it.
 *
 * `now` (the ISO clock from `env.clock()`) MUST be passed so that expired grants are treated as
 * inert (fail closed, PERM-004 AC2). Omitting `now` would allow an expired grant to remain
 * effective, violating the grant expiry guarantee.
 */
function actorMayEditCombatant(
	state: CoreStateSlice,
	actor: Actor,
	combatant: Combatant,
	now?: string,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (actor.role === 'observer') return false;
	if (combatant.kind !== 'character' || !combatant.characterId) return false;
	return hasGrantedCapability(
		state.permissions,
		actor,
		CHARACTER_ENTITY_TYPE,
		combatant.characterId,
		'combat-participant',
		now,
	);
}

export function handleApplyCombatResource(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	// RC-SES-5.1 — `kind: 'initiative'` is routed before the shared resource union parse (which does
	// not know it) to its own handler, under the same per-combatant authority.
	if (isCombatantInitiativePayload(rawPayload)) {
		return handleCombatantInitiative(state, env, actor, rawPayload);
	}

	const parsed = parseInput(applyCombatResourceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}

	const now = env.clock();

	const existing = combat.combatants[parsed.data.combatantId];
	if (!existing) {
		return reject(
			{
				code: 'combatant-not-found',
				message: `Combatant ${parsed.data.combatantId} is not in combat.`,
			},
			state,
		);
	}
	// Authority: DM, or an authorized combat-participant of a character combatant (fail closed).
	// `now` is passed so an EXPIRED grant is inert (fail closed — PERM-004 AC2).
	if (!actorMayEditCombatant(state, actor, existing, now)) {
		return reject(
			{ code: 'actor-not-authorized', message: "You may not edit this combatant's resources." },
			state,
		);
	}

	const payload = parsed.data;
	const resources = cloneResources(existing.resources);
	let logKind: CombatLogEntry['kind'];
	let label: string;
	let delta: number | null = null;

	switch (payload.kind) {
		case 'hp': {
			const hpBefore = resources.hp;
			let remaining = payload.delta;
			// Damage consumes temp HP first (the same rule as CHAR-007 applyHpDelta).
			if (remaining < 0 && resources.tempHp > 0) {
				const absorbed = Math.min(resources.tempHp, -remaining);
				resources.tempHp -= absorbed;
				remaining += absorbed;
			}
			resources.hp = clamp(resources.hp + remaining, 0, resources.maxHp);
			// UX-SES-005/007 — regaining HP above 0 ends the dying state: the death-save track resets
			// and the explicit "keep at 0, not defeated" choice clears (5e: regaining HP resets saves).
			if (hpBefore <= 0 && resources.hp > 0) {
				resources.deathSaves = { ...EMPTY_DEATH_SAVES };
				resources.notDefeated = false;
			}
			// RC-CHR-1.3 — damage taken while concentrating owes a concentration check. The core raises
			// the PROMPT (DC 10 or half the damage, whichever is higher) and stops: it does not roll,
			// and it never decides on its own that the effect dropped.
			if (payload.delta < 0) {
				resources.concentration = raiseConcentrationCheck(
					resources.concentration,
					-payload.delta,
					now,
				);
			}
			logKind = 'hp-changed';
			label = `${existing.name}: ${payload.delta >= 0 ? `heal ${payload.delta}` : `damage ${-payload.delta}`}`;
			delta = payload.delta;
			break;
		}
		case 'temp-hp': {
			// Temp HP does not stack; the higher value wins (CHAR-007 setTempHp rule).
			resources.tempHp = Math.max(resources.tempHp, payload.value);
			logKind = 'temp-hp-set';
			label = `${existing.name}: temp HP ${resources.tempHp}`;
			delta = resources.tempHp;
			break;
		}
		case 'condition': {
			// RC-SYS-2.3 — the ACTIVE system package owns the condition list. Adding a condition it
			// does not declare is refused (fail closed: a stray key would render as an unknown badge
			// nobody can explain). REMOVING is always allowed, so a key left over from a package the
			// campaign has since switched away from can still be cleared off a combatant.
			const resolved = resolveCondition(activeSystemPackageFor(state), payload.condition);
			if (payload.present && !resolved.known) {
				return reject(
					{
						code: 'condition-not-in-system',
						message: `The active system has no condition named "${payload.condition}".`,
					},
					state,
				);
			}
			const has = resources.conditions.includes(payload.condition);
			resources.conditions = payload.present
				? has
					? resources.conditions
					: [...resources.conditions, payload.condition]
				: resources.conditions.filter((c) => c !== payload.condition);
			// RC-SES-3.1 — a condition is `{ key, rounds? }`. The DM's explicit `rounds` wins; with none
			// given, a condition the package says lasts a number of ROUNDS starts on the package's own
			// count. Anything else gets no clock and runs until it is cleared. Removing a condition
			// takes its countdown with it, so a re-applied condition never inherits a stale timer.
			const timers = sanitizeConditionRounds(resources.conditions, resources.conditionRounds);
			let startedRounds: number | null = null;
			if (payload.present) {
				const fallback =
					resolved.defaultDuration === 'rounds' && resolved.defaultRounds !== null
						? resolved.defaultRounds
						: null;
				const rounds = payload.rounds ?? (has ? (timers[payload.condition] ?? null) : fallback);
				if (rounds !== null && rounds !== undefined) {
					timers[payload.condition] = rounds;
					startedRounds = rounds;
				}
			} else {
				delete timers[payload.condition];
			}
			resources.conditionRounds = timers;
			logKind = 'condition-changed';
			label = `${existing.name}: ${payload.present ? 'add' : 'remove'} ${resolved.label}${
				payload.present && startedRounds !== null
					? ` for ${startedRounds} ${startedRounds === 1 ? 'round' : 'rounds'}`
					: ''
			}`;
			break;
		}
		case 'death-save': {
			const current = resources.deathSaves;
			if (payload.outcome === 'reset') {
				resources.deathSaves = { ...EMPTY_DEATH_SAVES };
			} else if (
				current.stable ||
				current.failures >= DEATH_SAVE_MAX ||
				current.successes >= DEATH_SAVE_MAX
			) {
				return reject(
					{ code: 'invalid-state', message: 'Death saves are already resolved (stable or dead).' },
					state,
				);
			} else if (payload.outcome === 'success') {
				const successes = current.successes + 1;
				resources.deathSaves = {
					successes,
					failures: current.failures,
					stable: successes >= DEATH_SAVE_MAX,
				};
			} else {
				resources.deathSaves = {
					successes: current.successes,
					failures: current.failures + 1,
					stable: false,
				};
			}
			logKind = 'death-save';
			label = `${existing.name}: death save ${payload.outcome}`;
			delta = payload.outcome === 'success' ? 1 : payload.outcome === 'failure' ? -1 : null;
			break;
		}
		case 'concentration': {
			// RC-CHR-1.3 — setting or dropping concentration clears any check owed for the old effect.
			resources.concentration =
				payload.effect === null
					? { ...EMPTY_CONCENTRATION }
					: { effect: payload.effect, since: now, spellId: null, check: null };
			logKind = 'concentration';
			label =
				payload.effect === null
					? `${existing.name}: drop concentration`
					: `${existing.name}: concentrate on ${payload.effect}`;
			break;
		}
		// RC-CHR-1.3 — report what happened to the outstanding concentration check. `kept` clears the
		// prompt; `lost` ends concentration. Refused when nothing is owed, so the encounter log never
		// records a check this combatant never had to make.
		case 'concentration-check': {
			const check = resources.concentration.check;
			if (!check) {
				return reject(
					{ code: 'invalid-state', message: 'No concentration check is outstanding.' },
					state,
				);
			}
			const effect = resources.concentration.effect;
			resources.concentration = applyConcentrationCheckOutcome(
				resources.concentration,
				payload.outcome,
			);
			logKind = 'concentration';
			label =
				payload.outcome === 'kept'
					? `${existing.name}: kept concentration on ${effect} (DC ${check.dc})`
					: `${existing.name}: lost concentration on ${effect} (DC ${check.dc})`;
			break;
		}
		case 'defeated': {
			// UX-SES-005 — the at-0-HP confirmation outcome: `true` ⇒ "Yes — defeated" (defeated
			// treatment while HP ≤ 0); `false` ⇒ "No — keep at 0" (dying; death saves are the active
			// surface per UX-SES-007 AC3).
			resources.notDefeated = !payload.value;
			logKind = 'defeated-set';
			label = payload.value
				? `${existing.name}: marked defeated`
				: `${existing.name}: kept at 0 HP (not defeated)`;
			break;
		}
	}

	const operationId = env.ids();
	const nextCombatant: Combatant = { ...cloneCombatant(existing), resources };
	let nextCombat: SessionCombatState = {
		...combat,
		combatants: { ...combat.combatants, [nextCombatant.id]: nextCombatant },
		revision: combat.revision + 1,
	};
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		logKind,
		label,
		nextCombatant.id,
		delta,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: `combat.resource.${payload.kind}`,
		path: `combat/combatants/${nextCombatant.id}/resources`,
		value: { kind: payload.kind, label, delta },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.resource-applied',
				actorId: actor.id,
				combatantId: nextCombatant.id,
				resourceKind: payload.kind,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- RC-SES-5.1 — a combatant's INITIATIVE (a player's roll, or the DM's adjustment) -------------

/** How far a declared initiative modifier may reach. A 5e build tops out well inside this. */
const INITIATIVE_MODIFIER_LIMIT = 20;

/**
 * RC-SES-5.1 — set one combatant's initiative, carried on `combat.apply-resource` as
 * `kind: 'initiative'` (the one combat command that already accepts a player for their OWN
 * character). Two shapes:
 *
 *   - `roll: { modifier }` — the CORE rolls `1d20 + modifier` from a seed it records, so a player's
 *     device never supplies the total, only the modifier off its sheet (named in the log line, and
 *     bounded). This is what a player's companion sends.
 *   - `value` — an explicit initiative. DM-only: it is the DM's "adjust".
 */
const combatantInitiativeInputSchema = z.union([
	z
		.object({
			combatantId: z.string().min(1),
			kind: z.literal('initiative'),
			roll: z
				.object({
					modifier: z.number().int().min(-INITIATIVE_MODIFIER_LIMIT).max(INITIATIVE_MODIFIER_LIMIT),
				})
				.strict(),
		})
		.strict(),
	z
		.object({
			combatantId: z.string().min(1),
			kind: z.literal('initiative'),
			value: z.number().int().min(-99).max(999),
		})
		.strict(),
]);

/** Whether an `apply-resource` payload is the initiative shape (routed before the union parse). */
function isCombatantInitiativePayload(rawPayload: unknown): boolean {
	return (
		typeof rawPayload === 'object' &&
		rawPayload !== null &&
		(rawPayload as { kind?: unknown }).kind === 'initiative'
	);
}

/**
 * RC-SES-5.1 — the initiative handler. Authority is the resource rule reused: the DM, or a player
 * holding `combat-participant` on the character this combatant IS — so a player can never set another
 * player's initiative, and an NPC/monster row is the DM's alone. On top of that a player only ever
 * ROLLS, only while the call is open, and only once: after that the number is the DM's to accept or
 * adjust.
 *
 * The combatant moves to where its new initiative puts it (after any equal initiative, the rule a
 * mid-fight add already uses). During the call the cursor stays at the top, so round 1 opens on the
 * highest roll; once the fight is running the active combatant stays active across the move.
 */
function handleCombatantInitiative(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actor: Actor,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(combatantInitiativeInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const payload = parsed.data;
	const existing = combat.combatants[payload.combatantId];
	if (!existing) {
		return reject(
			{
				code: 'combatant-not-found',
				message: `Combatant ${payload.combatantId} is not in combat.`,
			},
			state,
		);
	}
	// `now` is passed so an EXPIRED grant is inert (fail closed — PERM-004 AC2).
	if (!actorMayEditCombatant(state, actor, existing, env.clock())) {
		return reject(
			{ code: 'actor-not-authorized', message: "You may not set this combatant's initiative." },
			state,
		);
	}
	const isDm = hasDmAuthority(actor.role);
	const calling = initiativeCallOpen(combat);
	if (!isDm) {
		if (!calling) {
			return reject(
				{
					code: 'invalid-state',
					message: 'Initiative is rolled when the DM calls for it, before round 1.',
				},
				state,
			);
		}
		if (!('roll' in payload)) {
			return reject(
				{
					code: 'actor-not-authorized',
					message: 'Only the DM can set an initiative value. Roll for it instead.',
				},
				state,
			);
		}
		// A row's initiative goes in ONCE, from whichever side put it there: the player's own roll, or a
		// value the DM set (logged as a reorder CARRYING the initiative — a plain position nudge logs a
		// null delta and leaves rolling open). Checking only for a prior roll would let a request still
		// in flight when the DM finalizes the row land afterwards and overwrite the DM's number.
		const closed = combat.log.find(
			(entry) =>
				entry.combatantId === existing.id &&
				(entry.kind === 'roll' || (entry.kind === 'combatant-reordered' && entry.delta !== null)),
		);
		if (closed) {
			return reject(
				{
					code: 'invalid-state',
					message:
						closed.kind === 'roll'
							? `${existing.name} has already rolled initiative.`
							: `The DM has already set ${existing.name}'s initiative.`,
				},
				state,
			);
		}
	}

	const operationId = env.ids();
	let initiative: number;
	let rolled: { expression: string; seed: number } | null = null;
	if ('roll' in payload) {
		const { modifier } = payload.roll;
		const expression = modifier === 0 ? '1d20' : `1d20${modifier > 0 ? '+' : ''}${modifier}`;
		// Seeded from the recorded operation id, so a replay reproduces the roll exactly.
		const result = rollExpression(expression, operationId);
		if (!result.ok) {
			return reject(
				{ code: 'invalid-payload', message: 'The initiative roll could not be made.' },
				state,
			);
		}
		initiative = result.result.total;
		rolled = { expression, seed: result.result.seed };
	} else {
		initiative = payload.value;
	}

	const activeId = combat.order[combat.turn] ?? null;
	const cloned = cloneCombatant(existing);
	const nextCombatant: Combatant = { ...cloned, statBlock: { ...cloned.statBlock, initiative } };
	const combatants = { ...combat.combatants, [existing.id]: nextCombatant };
	const order = combat.order.filter((id) => id !== existing.id);
	order.splice(initiativeInsertionIndex(order, combatants, initiative), 0, existing.id);
	const position = order.indexOf(existing.id);
	const turn = calling ? 0 : activeId ? Math.max(0, order.indexOf(activeId)) : combat.turn;

	let nextCombat: SessionCombatState = {
		...combat,
		combatants,
		order,
		turn,
		revision: combat.revision + 1,
	};
	// A roll is logged as a `roll` (a dice roll made during combat) and an adjustment as a reorder
	// (it moves the row); `delta` carries the initiative either way, which is how the tracker tells
	// an adjustment from an earlier/later nudge.
	let logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		rolled ? 'roll' : 'combatant-reordered',
		rolled
			? `${existing.name} rolled initiative: ${rolled.expression} = ${initiative}.`
			: `${existing.name}: initiative set to ${initiative}.`,
		existing.id,
		initiative,
	);
	if (rolled) {
		// The read side filters a `roll` entry by its OWN visibility, not the combatant's, and the label
		// names the combatant. A hidden combatant's roll therefore stays with the DM (and the player who
		// rolled it), never session-visible.
		const rollVisibility: NonNullable<CombatLogEntry['rollVisibility']> = !existing.hidden
			? 'session-visible'
			: isDm
				? 'dm-only'
				: 'shared';
		logEntry = {
			...logEntry,
			rollVisibility,
			...(rollVisibility === 'shared' ? { rollSharedWith: [actor.id] } : {}),
		};
	}
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.resource.initiative',
		path: `combat/combatants/${existing.id}/initiative`,
		value: {
			kind: 'initiative',
			initiative,
			position,
			...(rolled ? { expression: rolled.expression, seed: rolled.seed } : {}),
		},
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.resource-applied',
				actorId: actor.id,
				combatantId: existing.id,
				resourceKind: 'initiative',
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- UX-SES-008 — mid-combat combatant management (add / remove / reorder / visibility) -----------

/** The fail-closed default placeholder for a hidden combatant (UX-SES-008 AC2 / UX-SES-016). */
const DEFAULT_HIDDEN_PLACEHOLDER = 'Unknown creature';

/** Shared DM + running-combat gate for combatant-management commands. */
function requireRunningCombatAsDm(
	state: CoreStateSlice,
	actorId: string,
): { actor: Actor } | { rejection: CommandRejection } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: actor };
	const dmCheck = requireDm(actor);
	if (dmCheck) return { rejection: dmCheck };
	if (state.session.combat.status !== 'running') {
		return { rejection: { code: 'invalid-state', message: 'No combat is currently running.' } };
	}
	return { actor };
}

/**
 * UX-SES-008 AC1 — ADD combatant(s) to RUNNING combat (DM-only). A row with `quantity` N > 1 is a
 * MASS add creating "[Name] 1" … "[Name] N". A blank initiative AUTO-ROLLS 1d20 deterministically
 * from a recorded per-combatant seed (the generated combatant id), so the roll is reproducible. A
 * hidden row fails closed to the "Unknown creature" placeholder so the player tracker shows a
 * placeholder row, never the identity (UX-SES-008 AC2). Each new combatant is inserted into the
 * initiative order by descending initiative (after equal initiatives); the ACTIVE combatant stays
 * active across the insertion.
 */
export function handleAddCombatants(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(addCombatantsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	const activeId = combat.order[combat.turn] ?? null;

	const combatants = { ...combat.combatants };
	const order = [...combat.order];
	const addedIds: string[] = [];
	const addedNames: string[] = [];
	// NO-LEAK: a mass-add log entry has no single combatantId, so the read layer cannot withhold it
	// per-combatant. When ANY added combatant is hidden the label must not carry real names.
	let addedHidden = false;

	for (const row of parsed.data.combatants) {
		if (row.hidden) addedHidden = true;
		for (let index = 0; index < row.quantity; index += 1) {
			const id = env.ids();
			// Mass combatants are numbered "[Name] 1" … "[Name] N" (UX-SES-008 AC1).
			const name = row.quantity > 1 ? `${row.name} ${index + 1}` : row.name;
			// Auto-roll 1d20 when initiative is blank — deterministic from the recorded combatant id.
			let initiative = row.initiative ?? null;
			if (initiative === null) {
				const rolled = rollExpression('1d20', id);
				initiative = rolled.ok ? rolled.result.total : 10;
			}
			const combatant = buildCombatant(
				state,
				{
					id,
					kind: row.kind,
					name,
					characterId: row.characterId ?? null,
					ac: row.ac,
					initiative,
					maxHp: row.maxHp,
					hidden: row.hidden,
					// Fail closed: a hidden combatant ALWAYS carries a placeholder so the player view
					// renders a placeholder row rather than omitting it (UX-SES-008 AC2).
					placeholder: row.hidden
						? (row.placeholder ?? DEFAULT_HIDDEN_PLACEHOLDER)
						: (row.placeholder ?? null),
				},
				env.ids,
			);
			// Stamp a tie-break AFTER all existing combatants so equal initiatives keep their order.
			combatant.tieBreak = order.length;
			combatants[combatant.id] = combatant;
			order.splice(initiativeInsertionIndex(order, combatants, initiative), 0, combatant.id);
			addedIds.push(combatant.id);
			addedNames.push(name);
		}
	}

	// The active combatant stays active across insertions. RC-SES-5.1 — during an initiative call
	// nobody is active yet: the cursor stays at the top, so round 1 opens on the highest initiative.
	const nextTurn = initiativeCallOpen(combat)
		? 0
		: activeId
			? Math.max(0, order.indexOf(activeId))
			: combat.turn;

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		combatants,
		order,
		turn: nextTurn,
		revision: combat.revision + 1,
	};
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'combatant-added',
		// NO-LEAK: never put a hidden combatant's real name into a combatant-less (mass) log label —
		// such entries pass the non-DM log filter. Single adds carry combatantId, so the read layer
		// withholds them from viewers who cannot fully see that combatant.
		addedNames.length === 1
			? `Added ${addedNames[0]}.`
			: addedHidden
				? `Added ${addedNames.length} combatants.`
				: `Added ${addedNames.length} combatants (${addedNames.join(', ')}).`,
		addedIds.length === 1 ? (addedIds[0] ?? null) : null,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.add-combatants',
		path: 'combat/combatants',
		value: { addedCount: addedIds.length, order },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.combatants-added',
				actorId: actor.id,
				combatantIds: addedIds,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

/**
 * UX-SES-008 AC3 — REMOVE a combatant from running combat (DM-only; the GUI shows the confirmation
 * dialog BEFORE dispatching). Not destructive: any linked character record is unaffected and the
 * combatant can be re-added. The turn cursor is adjusted so the active combatant stays active; when
 * the ACTIVE combatant is removed, the next combatant in order becomes active (wrapping to the next
 * round when the removed combatant was last in the order).
 */
export function handleRemoveCombatant(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(removeCombatantInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	const existing = combat.combatants[parsed.data.combatantId];
	if (!existing) {
		return reject(
			{
				code: 'combatant-not-found',
				message: `Combatant ${parsed.data.combatantId} is not in combat.`,
			},
			state,
		);
	}

	const removedIndex = combat.order.indexOf(existing.id);
	const order = combat.order.filter((id) => id !== existing.id);
	const combatants = { ...combat.combatants };
	delete combatants[existing.id];
	// RC-MAP-1.1 — a combatant leaving combat takes their token with them; an orphaned placement would
	// keep drawing a creature that is no longer in the fight.
	const tokens = { ...combat.tokens };
	delete tokens[existing.id];

	// Keep the turn cursor on the same active combatant (or its successor when it was removed).
	let round = combat.round;
	let turn = combat.turn;
	if (removedIndex !== -1 && removedIndex < turn) {
		turn -= 1;
	} else if (removedIndex === turn && turn >= order.length) {
		// The removed combatant was active AND last in the order: wrap to the next round.
		turn = 0;
		if (order.length > 0) round += 1;
	}
	if (order.length === 0) turn = 0;

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		combatants,
		order,
		tokens,
		round,
		turn,
		revision: combat.revision + 1,
	};
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'combatant-removed',
		`${existing.name} removed from combat.`,
		existing.id,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.remove-combatant',
		path: `combat/combatants/${existing.id}`,
		value: { removed: true },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.combatant-removed',
				actorId: actor.id,
				combatantId: existing.id,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

/**
 * UX-SES-008 — REORDER: move a combatant one position earlier/later in the initiative order (the
 * explicit, keyboard-accessible alternative to drag). The ACTIVE combatant stays active across the
 * move (the turn cursor follows it). A move past either end is rejected as a no-op-invalid.
 */
export function handleReorderCombatant(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(reorderCombatantInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	const existing = combat.combatants[parsed.data.combatantId];
	if (!existing) {
		return reject(
			{
				code: 'combatant-not-found',
				message: `Combatant ${parsed.data.combatantId} is not in combat.`,
			},
			state,
		);
	}

	const from = combat.order.indexOf(existing.id);
	const to = parsed.data.direction === 'earlier' ? from - 1 : from + 1;
	if (from === -1 || to < 0 || to >= combat.order.length) {
		return reject(
			{ code: 'invalid-state', message: 'The combatant is already at that end of the order.' },
			state,
		);
	}

	const activeId = combat.order[combat.turn] ?? null;
	const order = [...combat.order];
	const moved = order.splice(from, 1)[0]!;
	order.splice(to, 0, moved);
	// RC-SES-5.1 — during an initiative call the cursor stays at the top (nobody is active yet).
	const turn = initiativeCallOpen(combat)
		? 0
		: activeId
			? Math.max(0, order.indexOf(activeId))
			: combat.turn;

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		order,
		turn,
		revision: combat.revision + 1,
	};
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'combatant-reordered',
		`${existing.name} moved to position ${to + 1}.`,
		existing.id,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.reorder-combatant',
		path: `combat/combatants/${existing.id}/position`,
		value: { position: to },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.combatant-reordered',
				actorId: actor.id,
				combatantId: existing.id,
				position: to,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

/**
 * UX-SES-008 — toggle a combatant HIDDEN/VISIBLE mid-combat (DM-only). Hiding fails closed to the
 * "Unknown creature" placeholder (unless the DM supplied one), so the player tracker IMMEDIATELY
 * renders a placeholder row — never the real name/HP, and never a silent gap. Unhiding reveals the
 * real identity to players (UX-SES-008 §spec hidden toggle).
 */
export function handleSetCombatantVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(setCombatantVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	const existing = combat.combatants[parsed.data.combatantId];
	if (!existing) {
		return reject(
			{
				code: 'combatant-not-found',
				message: `Combatant ${parsed.data.combatantId} is not in combat.`,
			},
			state,
		);
	}

	const hidden = parsed.data.hidden;
	const nextCombatant: Combatant = {
		...cloneCombatant(existing),
		hidden,
		placeholder: hidden
			? (parsed.data.placeholder ?? existing.placeholder ?? DEFAULT_HIDDEN_PLACEHOLDER)
			: existing.placeholder,
	};

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		combatants: { ...combat.combatants, [nextCombatant.id]: nextCombatant },
		revision: combat.revision + 1,
	};
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'combatant-visibility',
		`${existing.name} is now ${hidden ? 'hidden from players' : 'visible to players'}.`,
		existing.id,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.set-combatant-visibility',
		path: `combat/combatants/${nextCombatant.id}/visibility`,
		value: { hidden },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.combatant-visibility-changed',
				actorId: actor.id,
				combatantId: nextCombatant.id,
				hidden,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- SES-002 — end combat (persist the encounter log) --------------------------------------------

// ── RC-MAP-1.1 — session combat TOKENS (place / move / remove) ──────────────────────────────────
//
// A token records where a combatant is STANDING while combat runs. It lives in the combat slice keyed
// by combatant id, not on the map, so it inherits the combatant's visibility for free and vanishes
// with the combat instead of leaving an orphan marker on a map a player may later be shown.
//
// Authority: placing and removing are DM-only (that is board setup). MOVING also accepts the
// combatant's authorized combat-participant — the same authority that may already edit that
// combatant's HP — so a player can walk their own character without being able to reposition the DM's
// monsters. Every one of the three writes a durable op carrying BEFORE and AFTER, so a move is both
// replayable on another device and invertible for undo. Only place and remove touch the encounter
// log: a drag happens many times a turn and would bury everything else in it.

/** Look up a combatant in the RUNNING combat, or the rejection explaining why we cannot. */
function requireCombatant(
	state: CoreStateSlice,
	combatantId: string,
): { combatant: Combatant } | { rejection: CommandRejection } {
	const combatant = state.session.combat.combatants[combatantId];
	if (!combatant) {
		return {
			rejection: {
				code: 'combatant-not-found',
				message: `Combatant ${combatantId} is not in combat.`,
			},
		};
	}
	return { combatant };
}

/** Replace one combatant's token (or drop it when `token` is null), bumping the revision. */
function withToken(
	combat: SessionCombatState,
	combatantId: string,
	token: CombatToken | null,
): SessionCombatState {
	const tokens = { ...combat.tokens };
	if (token) tokens[combatantId] = token;
	else delete tokens[combatantId];
	return { ...combat, tokens, revision: combat.revision + 1 };
}

/**
 * RC-MAP-1.1 — PLACE a combatant's token on a map (DM-only). Placing again on a different map is how
 * a combatant moves between maps; a plain reposition on the same map is `combat.move-token`.
 */
export function handlePlaceCombatToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(placeCombatTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const found = requireCombatant(state, parsed.data.combatantId);
	if ('rejection' in found) return reject(found.rejection, state);
	const combatant = found.combatant;

	const map = state.maps.maps[parsed.data.mapId];
	if (!map) {
		return reject(
			{ code: 'map-not-found', message: `Map ${parsed.data.mapId} does not exist.` },
			state,
		);
	}

	const after: CombatToken = {
		mapId: parsed.data.mapId,
		x: parsed.data.x,
		y: parsed.data.y,
		size: parsed.data.size,
		...(parsed.data.facing === undefined ? {} : { facing: parsed.data.facing }),
	};
	if (!isCombatTokenPlacement(after)) {
		return reject(
			{ code: 'invalid-payload', message: 'That token placement is outside the map.' },
			state,
		);
	}

	const combat = state.session.combat;
	const before = combat.tokens[parsed.data.combatantId] ?? null;
	const operationId = env.ids();
	let nextCombat = withToken(combat, combatant.id, after);
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'token-placed',
		`${combatant.name} placed on ${map.name}.`,
		combatant.id,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.place-token',
		path: `combat/tokens/${combatant.id}`,
		value: { before: before ? cloneCombatToken(before) : null, after: cloneCombatToken(after) },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
		dependencies: [`map:${map.id}`],
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.token-placed',
				actorId: actor.id,
				combatantId: combatant.id,
				mapId: after.mapId,
				position: { x: after.x, y: after.y },
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

/**
 * RC-MAP-1.1 — MOVE a placed token to a new position on the map it is already on (DM, or the
 * combatant's authorized combat-participant). `facing: null` clears a facing; an omitted `facing` or
 * `size` keeps the current one. A combatant with no token yet is rejected — moving something that was
 * never placed would silently invent a position.
 */
export function handleMoveCombatToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (state.session.combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}

	const parsed = parseInput(moveCombatTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const found = requireCombatant(state, parsed.data.combatantId);
	if ('rejection' in found) return reject(found.rejection, state);
	const combatant = found.combatant;

	if (!actorMayMoveCombatantToken(state.permissions, actor, combatant, env.clock())) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You cannot move that combatant on the map.' },
			state,
		);
	}

	const combat = state.session.combat;
	const before = combat.tokens[combatant.id];
	if (!before) {
		return reject(
			{ code: 'combat-token-not-placed', message: `${combatant.name} is not on a map.` },
			state,
		);
	}

	const facing =
		parsed.data.facing === undefined
			? before.facing
			: parsed.data.facing === null
				? undefined
				: parsed.data.facing;
	const after: CombatToken = {
		mapId: before.mapId,
		x: parsed.data.x,
		y: parsed.data.y,
		size: parsed.data.size ?? before.size,
		...(facing === undefined ? {} : { facing }),
	};
	if (!isCombatTokenPlacement(after)) {
		return reject(
			{ code: 'invalid-payload', message: 'That token position is outside the map.' },
			state,
		);
	}

	const nextCombat = withToken(combat, combatant.id, after);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.move-token',
		path: `combat/tokens/${combatant.id}`,
		value: { before: cloneCombatToken(before), after: cloneCombatToken(after) },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
		dependencies: [`map:${after.mapId}`],
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.token-moved',
				actorId: actor.id,
				combatantId: combatant.id,
				mapId: after.mapId,
				position: { x: after.x, y: after.y },
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

/** RC-MAP-1.1 — take a combatant's token OFF the map (DM-only). The combatant stays in the order. */
export function handleRemoveCombatToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(removeCombatTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const found = requireCombatant(state, parsed.data.combatantId);
	if ('rejection' in found) return reject(found.rejection, state);
	const combatant = found.combatant;

	const combat = state.session.combat;
	const before = combat.tokens[combatant.id];
	if (!before) {
		return reject(
			{ code: 'combat-token-not-placed', message: `${combatant.name} is not on a map.` },
			state,
		);
	}

	const operationId = env.ids();
	let nextCombat = withToken(combat, combatant.id, null);
	const logEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'token-removed',
		`${combatant.name} taken off the map.`,
		combatant.id,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, logEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.remove-token',
		path: `combat/tokens/${combatant.id}`,
		value: { before: cloneCombatToken(before), after: null },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.token-removed',
				actorId: actor.id,
				combatantId: combatant.id,
				mapId: before.mapId,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

// ── RC-MAP-1.2 — session combat AoE TEMPLATES (place / remove) ──────────────────────────────────
//
// A template is the SHAPE an area of effect covers — the fireball's sphere, the dragon's cone —
// drawn on the map so the table can see who is caught. It is EPHEMERAL: it lives in the combat slice
// alongside the tokens, and `combat.end` clears every one of them, because an area of effect belongs
// to the fight it was cast in and should not outlive it as a mystery circle on a map a player is
// shown later.
//
// Authority: DM-only, both ways. Placing an AoE is a call about what a spell covers, which is the
// DM's ruling to make; a player asking "does it reach the ogre?" is answered by the DM moving the
// template, not by the player drawing their own. Both writes append a durable op with before AND
// after so they replay and invert. Neither writes an ENCOUNTER-LOG entry: templates are placed,
// nudged and cleared many times a round, and logging that would bury the events that matter (the
// same reasoning that keeps token MOVES out of the log).
//
// Which CELLS a template covers is never stored. `templateCells` in `geometry/template.ts` derives it
// from the map's own grid on demand, so re-gridding a map can never leave a template holding a stale
// cell list.

/** Replace the template list, bumping the revision. */
function withTemplates(
	combat: SessionCombatState,
	templates: CombatTemplate[],
): SessionCombatState {
	return { ...combat, templates, revision: combat.revision + 1 };
}

/**
 * RC-MAP-1.2 — PLACE an area-of-effect template on a map (DM-only). The origin is normalized, the
 * size is in table units (feet), and `rotation` points the shape; a sphere ignores it.
 */
export function handlePlaceCombatTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(placeCombatTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const map = state.maps.maps[parsed.data.mapId];
	if (!map) {
		return reject(
			{ code: 'map-not-found', message: `Map ${parsed.data.mapId} does not exist.` },
			state,
		);
	}

	const combat = state.session.combat;
	if (combat.templates.length >= MAX_COMBAT_TEMPLATES) {
		return reject(
			{
				code: 'template-limit-reached',
				message: `This combat already has ${MAX_COMBAT_TEMPLATES} areas of effect. Remove one first.`,
			},
			state,
		);
	}

	const sourceCombatantId = parsed.data.sourceCombatantId ?? null;
	if (sourceCombatantId !== null && !combat.combatants[sourceCombatantId]) {
		return reject(
			{
				code: 'combatant-not-found',
				message: `Combatant ${sourceCombatantId} is not in combat.`,
			},
			state,
		);
	}

	const template: CombatTemplate = {
		id: env.ids(),
		kind: parsed.data.kind,
		mapId: parsed.data.mapId,
		label: parsed.data.label.trim(),
		origin: { x: parsed.data.x, y: parsed.data.y },
		rotation: parsed.data.rotation,
		size: parsed.data.size,
		...(parsed.data.width === undefined ? {} : { width: parsed.data.width }),
		sourceCombatantId,
		placedBy: actor.id,
		placedAt: env.clock(),
	};
	if (!isCombatTemplate(template)) {
		return reject(
			{ code: 'invalid-payload', message: 'That area of effect is not a usable shape.' },
			state,
		);
	}

	const nextCombat = withTemplates(combat, [...combat.templates, template]);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.place-template',
		path: `combat/templates/${template.id}`,
		value: { before: null, after: cloneCombatTemplate(template) },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
		dependencies: [`map:${map.id}`],
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.template-placed',
				actorId: actor.id,
				templateId: template.id,
				templateKind: template.kind,
				mapId: template.mapId,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

/** RC-MAP-1.2 — take an area-of-effect template OFF the board (DM-only). */
export function handleRemoveCombatTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const gate = requireRunningCombatAsDm(state, actorId);
	if ('rejection' in gate) return reject(gate.rejection, state);
	const actor = gate.actor;

	const parsed = parseInput(removeCombatTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	const before = combat.templates.find((entry) => entry.id === parsed.data.templateId);
	if (!before) {
		return reject(
			{
				code: 'template-not-found',
				message: `Area of effect ${parsed.data.templateId} is not on the board.`,
			},
			state,
		);
	}

	const nextCombat = withTemplates(
		combat,
		combat.templates.filter((entry) => entry.id !== before.id),
	);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.remove-template',
		path: `combat/templates/${before.id}`,
		value: { before: cloneCombatTemplate(before), after: null },
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events: [
			{
				kind: 'combat.template-removed',
				actorId: actor.id,
				templateId: before.id,
				templateKind: before.kind,
				mapId: before.mapId,
				revision: nextCombat.revision,
			},
		],
		operationIds: [draft.op.id],
	};
}

export function handleEndCombat(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(endCombatInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		status: 'ended',
		// RC-MAP-1.2 — the areas of effect belonged to this fight. They go with it, so no template
		// outlives the combat that placed it on a map a player may be shown later.
		templates: [],
		revision: combat.revision + 1,
	};
	const endEntry = combatLogEntry(
		env,
		actor,
		operationId,
		nextCombat,
		'combat-ended',
		parsed.data.note && parsed.data.note.trim() !== ''
			? `Combat ended: ${parsed.data.note.trim()}`
			: 'Combat ended.',
		null,
		null,
	);
	nextCombat = { ...nextCombat, log: [...nextCombat.log, endEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.end',
		path: 'combat/status',
		value: {
			status: 'ended',
			logEntries: nextCombat.log.length,
			templatesCleared: combat.templates.length,
		},
		beforeRevision: combat.revision,
		afterRevision: nextCombat.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'combat.ended',
			actorId: actor.id,
			encounterId: nextCombat.encounterId,
			logEntries: nextCombat.log.length,
			revision: nextCombat.revision,
		},
	];

	return {
		status: 'accepted',
		nextState: withCombat({ ...state, sync: draft.log }, nextCombat),
		events,
		operationIds: [draft.op.id],
	};
}

/** Re-export for callers that compute the active combatant from a result. */
export { activeCombatant };
