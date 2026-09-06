import { buildEncounterInputSchema, updateEncounterInputSchema } from '../schemas/commands';
import {
	ENCOUNTER_ENTITY_TYPE,
	buildEncounter,
	computeEncounterChallenge,
	encounterById,
	updateEncounter,
	upsertEncounter,
} from '../state/encounter';
import { CONTENT_ITEM_ENTITY_TYPE, contentItemById } from '../state/content';
import { activeSystemPackageFor } from './character';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * SES-006 — BUILD ENCOUNTERS command handlers (Architecture Contract 1 / Contract 4).
 *
 * The DM builds an encounter with COMBATANT SELECTION, deterministic CHALLENGE GUIDANCE, TERRAIN
 * NOTES, LEGENDARY/LAIR actions, LOOT, and GENERATED SESSION LOG LINKS. The encounter is DURABLE and
 * consistent with the declared `encounter` Vault Object subtype. SESSION LOG LINKS are BY REFERENCE
 * (target ids only) — never a clone (Contract 4). Building/updating an encounter is DM-only; the
 * challenge guidance is a PURE deterministic function the handler computes and rides on the event for
 * the GUI to render.
 */

/** Validate that every `note` session-log link points at a content item that exists (fail closed). */
function validateNoteLinks(
	state: CoreStateSlice,
	links: ReadonlyArray<{ kind: string; targetId: string }> | undefined,
): { ok: true } | { ok: false; rejection: CommandResult } {
	for (const link of links ?? []) {
		if (link.kind === 'note') {
			const target = contentItemById(state.content, link.targetId);
			if (!target) {
				return {
					ok: false,
					rejection: reject(
						{
							code: 'content-item-not-found',
							message: `Session log link target ${link.targetId} does not exist.`,
						},
						state,
					),
				};
			}
		}
	}
	return { ok: true };
}

export function handleBuildEncounter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(buildEncounterInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	// SESSION LOG LINKS are BY REFERENCE: a `note` link must resolve to a real content item.
	const linkCheck = validateNoteLinks(state, parsed.data.sessionLogLinks);
	if (!linkCheck.ok) return linkCheck.rejection;

	const encounter = buildEncounter(parsed.data, {
		id: env.ids(),
		createdBy: actor.id,
		now: env.clock(),
		childIds: env.ids,
	});
	// RC-SYS-2.5: the budget is the ACTIVE package's to declare. Under a package without challenge
	// ratings or levels this is `null`, and the op/event carry `null` rather than a fabricated band.
	const challenge = computeEncounterChallenge(
		encounter.combatants,
		encounter.party,
		activeSystemPackageFor(state),
	);
	const nextEncounters = upsertEncounter(state.encounters, encounter);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: ENCOUNTER_ENTITY_TYPE,
		entityId: encounter.id,
		opType: 'encounter.build',
		path: `encounters/${encounter.id}`,
		value: {
			title: encounter.title,
			difficulty: challenge?.difficulty ?? null,
			combatantCount: encounter.combatants.length,
			// Record link TARGETS only (no content) — the link is a reference (Contract 4).
			linkTargets: encounter.sessionLogLinks.map((link) => ({
				kind: link.kind,
				targetId: link.targetId,
			})),
		},
		beforeRevision: 0,
		afterRevision: encounter.revision,
		// Note links create an explicit dependency on the referenced content item.
		dependencies: encounter.sessionLogLinks
			.filter((link) => link.kind === 'note')
			.map((link) => `${CONTENT_ITEM_ENTITY_TYPE}:${link.targetId}`),
	});

	const events: CoreEvent[] = [
		{
			kind: 'encounter.built',
			encounterId: encounter.id,
			difficulty: challenge?.difficulty ?? null,
			encounterPoints: challenge?.encounterPoints ?? null,
			combatantCount: encounter.combatants.length,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...state, encounters: nextEncounters, sync: draft.log },
		events,
		operationIds: [draft.op.id],
	};
}

export function handleUpdateEncounter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(updateEncounterInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const existing = encounterById(state.encounters, parsed.data.encounterId);
	if (!existing) {
		return reject(
			{
				code: 'encounter-not-found',
				message: `Encounter ${parsed.data.encounterId} does not exist.`,
			},
			state,
		);
	}

	const linkCheck = validateNoteLinks(state, parsed.data.sessionLogLinks);
	if (!linkCheck.ok) return linkCheck.rejection;

	const nextEncounters = updateEncounter(
		state.encounters,
		parsed.data.encounterId,
		{
			...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
			...(parsed.data.combatants !== undefined ? { combatants: parsed.data.combatants } : {}),
			...(parsed.data.party !== undefined ? { party: parsed.data.party } : {}),
			...(parsed.data.terrainNotes !== undefined ? { terrainNotes: parsed.data.terrainNotes } : {}),
			...(parsed.data.specialActions !== undefined
				? { specialActions: parsed.data.specialActions }
				: {}),
			...(parsed.data.loot !== undefined ? { loot: parsed.data.loot } : {}),
			...(parsed.data.sessionLogLinks !== undefined
				? { sessionLogLinks: parsed.data.sessionLogLinks }
				: {}),
		},
		env.clock(),
	);
	if (!nextEncounters) {
		return reject(
			{
				code: 'encounter-not-found',
				message: `Encounter ${parsed.data.encounterId} does not exist.`,
			},
			state,
		);
	}
	const updated = encounterById(nextEncounters, parsed.data.encounterId)!;
	const challenge = computeEncounterChallenge(
		updated.combatants,
		updated.party,
		activeSystemPackageFor(state),
	);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: ENCOUNTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'encounter.update',
		path: `encounters/${updated.id}`,
		value: {
			title: updated.title,
			difficulty: challenge?.difficulty ?? null,
			combatantCount: updated.combatants.length,
		},
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
		dependencies: updated.sessionLogLinks
			.filter((link) => link.kind === 'note')
			.map((link) => `${CONTENT_ITEM_ENTITY_TYPE}:${link.targetId}`),
	});

	return {
		status: 'accepted',
		nextState: { ...state, encounters: nextEncounters, sync: draft.log },
		events: [
			{
				kind: 'encounter.updated',
				encounterId: updated.id,
				difficulty: challenge?.difficulty ?? null,
				encounterPoints: challenge?.encounterPoints ?? null,
				combatantCount: updated.combatants.length,
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}
