import { hasDmAuthority } from '../state/permission-state';
import {
	addCombatantsInputSchema,
	advanceCombatTurnInputSchema,
	applyCombatResourceInputSchema,
	endCombatInputSchema,
	previousCombatTurnInputSchema,
	removeCombatantInputSchema,
	reorderCombatantInputSchema,
	setCombatantVisibilityInputSchema,
	startCombatInputSchema,
} from '../schemas/commands';
import {
	COMBAT_ENTITY_TYPE,
	activeCombatant,
	advanceTurn,
	cloneCombatant,
	cloneResources,
	initiativeInsertionIndex,
	orderInitiative,
	previousTurn,
	resolveCondition,
	type Combatant,
	type CombatantResources,
	type CombatLogEntry,
	type SessionCombatState,
} from '../state/combat-tracker';
import { rollExpression } from '../state/dice';
import {
	DEATH_SAVE_MAX,
	EMPTY_CONCENTRATION,
	EMPTY_DEATH_SAVES,
} from '../state/character-resources';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import { activeSystemPackageFor } from './character';
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
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
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
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const parsed = parseInput(previousCombatTurnInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return reject({ code: 'invalid-state', message: 'No combat is currently running.' }, state);
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
			logKind = 'condition-changed';
			label = `${existing.name}: ${payload.present ? 'add' : 'remove'} ${resolved.label}`;
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

// --- UX-SES-008 — mid-combat combatant management (add / remove / reorder / visibility) -----------

/** The fail-closed default placeholder for a hidden combatant (UX-SES-008 AC2 / UX-SES-016). */
const DEFAULT_HIDDEN_PLACEHOLDER = 'Unknown creature';

/** Shared DM + active-session + running-combat gate for combatant-management commands. */
function requireRunningCombatAsDm(
	state: CoreStateSlice,
	actorId: string,
): { actor: Actor } | { rejection: CommandRejection } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: actor };
	const dmCheck = requireDm(actor);
	if (dmCheck) return { rejection: dmCheck };
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return { rejection: sessionGuard };
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

	// The active combatant stays active across insertions.
	const nextTurn = activeId ? Math.max(0, order.indexOf(activeId)) : combat.turn;

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
	const turn = activeId ? Math.max(0, order.indexOf(activeId)) : combat.turn;

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
