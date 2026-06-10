import {
	configureAudioAutomationInputSchema,
	deleteAudioAutomationInputSchema,
} from '../schemas/commands';
import {
	AUDIO_AUTOMATION_ENTITY_TYPE,
	buildAudioAutomationRule,
	type AudioAutomationRule,
} from '../state/audio-automation';
import type { AudioState } from '../state/audio-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * AUDIO-005 — ATMOSPHERE AUTOMATION command handlers (Architecture Contract 1 / Contract 4).
 *
 * The DM CONFIGURES + DELETES durable automation rules that map a session event (combat start, map reveal,
 * Scene activation, handout delivery) to a declared audio command. Both are DM-only (audio automation is
 * Player-safe: dm-only). The architecture invariants this slice upholds, fail-closed:
 *
 *   - DM-only. A non-DM cannot configure/delete a rule (a player has no audio config authority), and the
 *     read model omits rules for non-DM actors so a hidden trigger/cue never leaks to players (AC2).
 *   - Declared triggers/actions only. An undeclared trigger kind or action is rejected; the rule is never
 *     persisted in an un-evaluable state.
 *   - Live references. A rule references a DECLARED source (and optional local asset) BY ID; a dangling
 *     reference is rejected at configuration. The license/offline gate is NOT baked into the rule — it is
 *     RESOLVED at trigger time against the LIVE library/online state, so a rule can never bypass a
 *     license/scope/offline block that was added after the rule was authored (the resolver fails closed).
 *
 * Each durable mutation appends an `audio.automation.*` op (actor + entity — the audit). The GUI dispatches
 * the intent; it never writes the automation rule set. Configuring a rule creates NO playback state — the
 * rule is a dormant definition until a real trigger fires and the GUI dispatches the resolved request.
 */

function withAudio(state: CoreStateSlice, audio: AudioState): CoreStateSlice {
	return { ...state, audio };
}

export function handleConfigureAudioAutomation(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(configureAudioAutomationInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = input.ruleId ? state.audio.automationRules[input.ruleId] : undefined;
	const ruleId = previous?.id ?? input.ruleId ?? env.ids();
	const result = buildAudioAutomationRule({
		id: ruleId,
		label: input.label,
		enabled: input.enabled,
		trigger: input.trigger,
		triggerScopeId: input.triggerScopeId ?? null,
		action: input.action,
		sourceId: input.sourceId,
		assetId: input.assetId ?? null,
		createdBy: actor.id,
		createdAt: env.clock(),
		library: state.audio,
		previous,
	});

	if (!result.ok) {
		// Fail closed: a dangling source/asset, undeclared trigger/action, or a play missing its asset is
		// rejected — no rule record is written, so no automation arms in an invalid state.
		const code =
			result.reason === 'source-not-found' || result.reason === 'asset-not-found'
				? 'audio-asset-not-found'
				: 'invalid-audio-automation';
		return reject({ code, message: result.message }, state);
	}

	const rule: AudioAutomationRule = result.rule;
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_AUTOMATION_ENTITY_TYPE,
		entityId: rule.id,
		opType: 'audio.automation.configure',
		path: `audio/automation/${rule.id}`,
		// The op value carries the rule DEFINITION (trigger/action/refs) — never asset bytes or player content.
		value: {
			ruleId: rule.id,
			trigger: rule.trigger,
			action: rule.action,
			sourceId: rule.sourceId,
			assetId: rule.assetId,
			enabled: rule.enabled,
		},
		beforeRevision: previous?.revision ?? 0,
		afterRevision: rule.revision,
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{
				...state.audio,
				automationRules: { ...state.audio.automationRules, [rule.id]: rule },
			},
		),
		events: [
			{
				kind: 'audio.automation-configured',
				ruleId: rule.id,
				trigger: rule.trigger,
				action: rule.action,
				enabled: rule.enabled,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleDeleteAudioAutomation(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(deleteAudioAutomationInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.audio.automationRules[input.ruleId];
	if (!previous) {
		return reject(
			{
				code: 'audio-automation-not-found',
				message: `Audio automation rule ${input.ruleId} does not exist.`,
			},
			state,
		);
	}

	const nextRules = { ...state.audio.automationRules };
	delete nextRules[input.ruleId];

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_AUTOMATION_ENTITY_TYPE,
		entityId: input.ruleId,
		opType: 'audio.automation.delete',
		path: `audio/automation/${input.ruleId}`,
		value: { ruleId: input.ruleId },
		beforeRevision: previous.revision,
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{ ...state.audio, automationRules: nextRules },
		),
		events: [{ kind: 'audio.automation-deleted', ruleId: input.ruleId, actorId: actor.id }],
		operationIds: [op.id],
	};
}
