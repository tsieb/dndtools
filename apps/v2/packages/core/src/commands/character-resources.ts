import {
	restCharacterInputSchema,
	setCharacterSpellInputSchema,
	setClassResourceInputSchema,
	setSpellSlotsInputSchema,
	updateCombatResourceInputSchema,
} from '../schemas/commands';
import type { Character } from '../state/character-state';
import { CHARACTER_ENTITY_TYPE, upsertCharacter } from '../state/character-state';
import {
	applyHpDelta,
	applyRest,
	expendClassResource,
	expendSpellSlot,
	recordDeathSave,
	resourcesOf,
	setClassResource,
	setCondition,
	setConcentration,
	setSpell,
	setSpellSlots,
	setTempHp,
	type CharacterResources,
	type ResourceLedgerEntry,
	type ResourceUpdateMeta,
} from '../state/character-resources';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureCharacterStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';

/**
 * CHAR-007 / CHAR-008 — durable COMBAT-RESOURCE and SPELL/RESOURCE commands (Architecture Contract 1
 * / Contract 3). Every mutation is a Processing-Core command: it requires the right actor, validates
 * with a pure reducer, mutates the durable CharacterState through PURE functions
 * (`state/character-resources.ts`), appends a durable `character.*` sync operation, and records the
 * change on the in-character EXPENDITURE history. The GUI never writes resource state directly.
 *
 * Authority + fail-closed posture:
 *
 *   - CHAR-007 session combat-resource updates (HP / temp HP / conditions / death saves / spell slots
 *     / class resources / concentration) accept a character OWNER **or** an authorized COMBAT
 *     PARTICIPANT, but ONLY while the session workflow is `active` (the CMD-active-session-control
 *     guard, reused here). The update fails closed when the session is not active, and fails closed
 *     for an actor who is neither the owner nor a combat participant (and for an observer always).
 *   - CHAR-008 spell/slot/class-resource MANAGEMENT and REST recovery are OWNER-only structural edits
 *     (the DM bypasses as administrator). They are not gated on the session being active.
 */

function charactersWith(state: CoreStateSlice, characters: CoreStateSlice['characters']): CoreStateSlice {
	return { ...state, characters };
}

/** The session-active guard reused from CMD-active-session-control (fail closed when not active). */
function requireActiveSession(state: CoreStateSlice): CommandRejection | null {
	if (state.session.workflow !== 'active') {
		return {
			code: 'invalid-state',
			message: 'Combat-resource updates require an active Session workflow.',
		};
	}
	return null;
}

/**
 * CHAR-007 authority: the DM (administrator) OR a player holding `combat-participant` (which `owner`
 * inherits) on the character. An observer never qualifies. Fail closed for anyone else.
 */
function actorMayUpdateCombatResources(
	state: CoreStateSlice,
	actor: Actor,
	characterId: string,
): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	return hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, characterId, 'combat-participant');
}

/** CHAR-008 authority: the DM (administrator) OR the character `owner`. Fail closed otherwise. */
function actorMayManageResources(
	state: CoreStateSlice,
	actor: Actor,
	characterId: string,
): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	return hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, characterId, 'owner');
}

function makeResourceMeta(
	env: CoreEnvironment,
	actor: Actor,
	operationId: string,
): ResourceUpdateMeta {
	return {
		ledgerId: env.ids(),
		now: env.clock(),
		actorActorId: actor.id,
		actorRole: actor.role,
		operationId,
	};
}

function resourceChangedEvent(
	characterId: string,
	revision: number,
	entry: ResourceLedgerEntry,
	actorId: string,
): CoreEvent {
	return {
		kind: 'character.resource-changed',
		characterId,
		revision,
		resourceKind: entry.kind,
		actorId,
	};
}

// --- CHAR-007 — session combat-resource update --------------------------------------------------

export function handleUpdateCombatResource(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(updateCombatResourceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[parsed.data.characterId];
	if (!existing) {
		return reject(
			{ code: 'character-not-found', message: `Character ${parsed.data.characterId} does not exist.` },
			state,
		);
	}

	// CMD-active-session-control: combat-resource writes require an active session (fail closed).
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	// CHAR-007 authority: owner OR combat-participant; anyone else (incl. observers) is rejected.
	if (!actorMayUpdateCombatResources(state, actor, existing.id)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You may not update this character’s combat resources.' },
			state,
		);
	}

	const operationId = env.ids();
	const meta = makeResourceMeta(env, actor, operationId);
	const resources = resourcesOf(existing);
	const payload = parsed.data;

	let updated: Character;
	let entry: ResourceLedgerEntry;

	switch (payload.kind) {
		case 'hp': {
			const result = applyHpDelta(existing, resources, payload.delta, meta);
			if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
			updated = { ...result.character, resources: result.resources };
			entry = result.entry;
			break;
		}
		case 'temp-hp': {
			const result = setTempHp(existing, resources, payload.value, meta);
			if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
			updated = { ...result.character, resources: result.resources };
			entry = result.entry;
			break;
		}
		case 'condition': {
			const result = setCondition(existing, resources, payload.condition, payload.present, meta);
			if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
			updated = { ...result.character, resources: result.resources };
			entry = result.entry;
			break;
		}
		case 'death-save': {
			const result = recordDeathSave(resources, payload.outcome, meta);
			if (!result.ok) return reject({ code: 'invalid-state', message: result.message }, state);
			entry = result.entry;
			updated = {
				...existing,
				resources: result.resources,
				updatedAt: meta.now,
				revision: existing.revision + 1,
			};
			break;
		}
		case 'concentration': {
			const result = setConcentration(resources, payload.effect, meta);
			if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
			entry = result.entry;
			updated = {
				...existing,
				resources: result.resources,
				updatedAt: meta.now,
				revision: existing.revision + 1,
			};
			break;
		}
		case 'spell-slot': {
			const result = expendSpellSlot(existing, resources, payload.level, meta);
			if (!result.ok) return reject({ code: 'invalid-state', message: result.message }, state);
			updated = { ...result.character, resources: result.resources };
			entry = result.entry;
			break;
		}
		case 'class-resource': {
			const result = expendClassResource(existing, resources, payload.resourceId, payload.amount, meta);
			if (!result.ok) {
				const code = result.error === 'no-such-class-resource' ? 'invalid-payload' : 'invalid-state';
				return reject({ code, message: result.message }, state);
			}
			updated = { ...result.character, resources: result.resources };
			entry = result.entry;
			break;
		}
	}

	const nextCharacters = upsertCharacter(characters, updated);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: `character.resource.${entry.kind}`,
		path: `characters/${updated.id}/resources`,
		value: { kind: entry.kind, label: entry.label, delta: entry.delta },
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [resourceChangedEvent(updated.id, updated.revision, entry, actor.id)],
		operationIds: [draft.op.id],
	};
}

// --- CHAR-008 — owner-managed spell/resource structure ------------------------------------------

function manageGuard(
	state: CoreStateSlice,
	actorId: string,
	characterId: string,
): { actor: Actor; existing: Character } | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[characterId];
	if (!existing) {
		return {
			rejection: reject(
				{ code: 'character-not-found', message: `Character ${characterId} does not exist.` },
				state,
			),
		};
	}
	if (!actorMayManageResources(state, actor, existing.id)) {
		return {
			rejection: reject(
				{ code: 'actor-not-authorized', message: 'Only the character owner may manage spells and resources.' },
				state,
			),
		};
	}
	return { actor, existing };
}

function commitManagedResources(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actor: Actor,
	existing: Character,
	nextResources: CharacterResources,
	opType: string,
	value: unknown,
): CommandResult {
	const now = env.clock();
	const updated: Character = {
		...existing,
		resources: nextResources,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, updated);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType,
		path: `characters/${updated.id}/resources`,
		value,
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.resources-managed',
				characterId: updated.id,
				revision: updated.revision,
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

export function handleSetSpellSlots(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setSpellSlotsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = manageGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const result = setSpellSlots(resourcesOf(guard.existing), {
		level: parsed.data.level,
		max: parsed.data.max,
		...(parsed.data.expended !== undefined ? { expended: parsed.data.expended } : {}),
	});
	if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
	return commitManagedResources(state, env, guard.actor, guard.existing, result.resources, 'character.set-spell-slots', {
		level: parsed.data.level,
		max: parsed.data.max,
	});
}

export function handleSetClassResource(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setClassResourceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = manageGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const result = setClassResource(resourcesOf(guard.existing), {
		id: parsed.data.id,
		name: parsed.data.name,
		max: parsed.data.max,
		recharge: parsed.data.recharge,
		...(parsed.data.expended !== undefined ? { expended: parsed.data.expended } : {}),
	});
	if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
	return commitManagedResources(
		state,
		env,
		guard.actor,
		guard.existing,
		result.resources,
		'character.set-class-resource',
		{ id: parsed.data.id, name: parsed.data.name, max: parsed.data.max, recharge: parsed.data.recharge },
	);
}

export function handleSetCharacterSpell(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setCharacterSpellInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = manageGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const result = setSpell(resourcesOf(guard.existing), {
		id: parsed.data.id,
		name: parsed.data.name,
		level: parsed.data.level,
		prepared: parsed.data.prepared,
	});
	if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
	return commitManagedResources(state, env, guard.actor, guard.existing, result.resources, 'character.set-spell', {
		id: parsed.data.id,
		name: parsed.data.name,
		level: parsed.data.level,
		prepared: parsed.data.prepared,
	});
}

// --- CHAR-008 — deterministic rest recovery -----------------------------------------------------

export function handleRestCharacter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(restCharacterInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = manageGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const operationId = env.ids();
	const meta = makeResourceMeta(env, guard.actor, operationId);
	const result = applyRest(guard.existing, resourcesOf(guard.existing), parsed.data.rest, meta);
	if (!result.ok) return reject({ code: 'invalid-state', message: result.message }, state);

	const updated: Character = { ...result.character, resources: result.resources };
	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, updated);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: `character.rest.${parsed.data.rest}`,
		path: `characters/${updated.id}/resources`,
		value: { rest: parsed.data.rest },
		beforeRevision: guard.existing.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.rested',
				characterId: updated.id,
				revision: updated.revision,
				rest: parsed.data.rest,
				actorId: guard.actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}
