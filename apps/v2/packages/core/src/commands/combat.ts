import {
	advanceCombatTurnInputSchema,
	applyCombatResourceInputSchema,
	endCombatInputSchema,
	startCombatInputSchema,
} from '../schemas/commands';
import {
	COMBAT_ENTITY_TYPE,
	activeCombatant,
	advanceTurn,
	cloneCombatant,
	cloneResources,
	orderInitiative,
	type Combatant,
	type CombatantResources,
	type CombatLogEntry,
	type SessionCombatState,
} from '../state/combat-tracker';
import {
	DEATH_SAVE_MAX,
	EMPTY_CONCENTRATION,
	EMPTY_DEATH_SAVES,
} from '../state/character-resources';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import { encounterById } from '../state/encounter';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

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
 *   - All combat-running commands are gated on the session workflow being `active` (the
 *     CMD-active-session-control guard, reused). They fail closed when the session is not active and
 *     for unauthorized actors.
 */

const SESSION_ENTITY_ID = 'session-default';

/** The session-active guard reused from CMD-active-session-control (fail closed when not active). */
function requireActiveSession(state: CoreStateSlice): CommandRejection | null {
	if (state.session.workflow !== 'active') {
		return {
			code: 'invalid-state',
			message: 'Running combat requires an active Session workflow.',
		};
	}
	return null;
}

function withCombat(state: CoreStateSlice, combat: SessionCombatState): CoreStateSlice {
	return { ...state, session: { ...state.session, combat } };
}

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
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const parsed = parseInput(startCombatInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

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

	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		status: 'running',
		encounterId,
		// SES-006 AC2: terrain notes flowed from the linked encounter (empty for ad-hoc combat).
		terrainNotes: linkedTerrainNotes,
		round: 1,
		turn: 0,
		combatants: combatantMap,
		order: ordered.order,
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
		`Combat started with ${ordered.order.length} combatant(s).`,
		null,
		null,
	);
	nextCombat = { ...nextCombat, log: [startEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.start',
		path: 'combat',
		value: {
			encounterId,
			order: ordered.order,
			combatantCount: ordered.order.length,
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
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const parsed = parseInput(advanceCombatTurnInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject(
			{ code: 'invalid-state', message: 'No combat is currently running.' },
			state,
		);
	}

	const advance = advanceTurn(combat.round, combat.turn, combat.order.length);
	const operationId = env.ids();
	let nextCombat: SessionCombatState = {
		...combat,
		round: advance.round,
		turn: advance.turn,
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
	nextCombat = { ...nextCombat, log: [...nextCombat.log, turnEntry] };

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: COMBAT_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'combat.advance-turn',
		path: 'combat/turn',
		value: { round: advance.round, turn: advance.turn, wrappedRound: advance.wrappedRound },
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
	if (actor.role === 'dm') return true;
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

	const parsed = parseInput(applyCombatResourceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
	}
	// CMD-active-session-control: combat writes require an active session (fail closed).
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const now = env.clock();

	const existing = combat.combatants[parsed.data.combatantId];
	if (!existing) {
		return reject(
			{ code: 'combatant-not-found', message: `Combatant ${parsed.data.combatantId} is not in combat.` },
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
			let remaining = payload.delta;
			// Damage consumes temp HP first (the same rule as CHAR-007 applyHpDelta).
			if (remaining < 0 && resources.tempHp > 0) {
				const absorbed = Math.min(resources.tempHp, -remaining);
				resources.tempHp -= absorbed;
				remaining += absorbed;
			}
			resources.hp = clamp(resources.hp + remaining, 0, resources.maxHp);
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
			const has = resources.conditions.includes(payload.condition);
			resources.conditions = payload.present
				? has
					? resources.conditions
					: [...resources.conditions, payload.condition]
				: resources.conditions.filter((c) => c !== payload.condition);
			logKind = 'condition-changed';
			label = `${existing.name}: ${payload.present ? 'add' : 'remove'} ${payload.condition}`;
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
			resources.concentration =
				payload.effect === null
					? { ...EMPTY_CONCENTRATION }
					: { effect: payload.effect, since: env.clock() };
			logKind = 'concentration';
			label =
				payload.effect === null
					? `${existing.name}: drop concentration`
					: `${existing.name}: concentrate on ${payload.effect}`;
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

// --- SES-002 — end combat (persist the encounter log) --------------------------------------------

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
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

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
		value: { status: 'ended', logEntries: nextCombat.log.length },
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
