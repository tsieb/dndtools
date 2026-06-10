import {
	assetNeedsLicenseReview,
	licenseReviewReason,
	type AudioLicenseReviewReason,
} from './audio-asset';
import {
	classifyAudioSource,
	resolveAudioPlaybackAvailability,
	type AudioPlaybackAvailability,
} from './audio-source';
import type { AudioState } from './audio-state';

/**
 * AUDIO-005 — ATMOSPHERE AUTOMATION: rule/trigger-driven audio behavior.
 *
 * The DM configures durable RULES that map a SESSION EVENT (combat start, map reveal, Scene activation,
 * handout delivery) to a DECLARED AUDIO ACTION (play / stop / crossfade) against a DECLARED source/asset.
 * When such an event fires, the automation RESOLVER deterministically computes which rules match and, for
 * each, whether the declared audio command may be REQUESTED — composing the EXISTING audio gates rather
 * than duplicating any policy:
 *
 *   - AUDIO-009: the referenced source must be a DECLARED, supported type (an unsupported/undeclared
 *     source can never have produced a record, but a legacy/corrupt record fails closed to blocked).
 *   - AUDIO-010: the source must be playback-enabled (cache/offline behavior declared) AND the offline
 *     availability must resolve `available` — a missing/uncached/evicted asset blocks the request and
 *     NEVER substitutes another track or retries the network.
 *   - AUDIO-004: a `play`/`crossfade` action against a local asset whose license is NOT cleared is
 *     BLOCKED — the licensing review gate is reused verbatim, so an automation rule can never bypass it
 *     into silent unlicensed playback.
 *
 * A BLOCKED rule resolves to a FLAGGED NO-OP with a non-leaking DIAGNOSTIC (AUDIO-005 AC2): the declared
 * command is never silently issued and the bypass never occurs. This module is PURE + DETERMINISTIC (no
 * DOM, no clock, no network) so an identical event sequence always produces an identical automation
 * outcome — the GUI renders the computed requests/diagnostics and dispatches the requested audio command
 * through the Processing Core (Contract 1 / Contract 4: automation output is a command request the core
 * validates).
 */

export const AUDIO_AUTOMATION_SCHEMA_VERSION = 1 as const;

/** The entity type audio automation rules are addressed by in ops. Rules are DM-only config (dm-only). */
export const AUDIO_AUTOMATION_ENTITY_TYPE = 'audio-automation-rule' as const;

/**
 * The DECLARED session-event triggers an automation rule may fire on (AUDIO-005). A CLOSED enum mapped to
 * the existing core events, so a rule can never be armed on an undeclared/unsupported event (fail closed):
 *
 *   - `combat-start`        — combat began (the `combat.started` event). The AUDIO-005 AC1 trigger.
 *   - `map-reveal`          — a map layer / fog reveal (`map.layer-changed` / `map.fog-changed`).
 *   - `scene-activation`    — a Scene became the active session scene (`session.workflow-changed`).
 *   - `handout-delivery`    — a handout was delivered to recipients (`session.handout-delivered`).
 */
export type AudioAutomationTriggerKind =
	| 'combat-start'
	| 'map-reveal'
	| 'scene-activation'
	| 'handout-delivery';

export const AUDIO_AUTOMATION_TRIGGER_KINDS: readonly AudioAutomationTriggerKind[] = Object.freeze([
	'combat-start',
	'map-reveal',
	'scene-activation',
	'handout-delivery',
]);

/** True when `value` is a declared trigger kind. Unknown values fail closed (the rule is not built). */
export function isAudioAutomationTriggerKind(value: unknown): value is AudioAutomationTriggerKind {
	return (
		typeof value === 'string' &&
		(AUDIO_AUTOMATION_TRIGGER_KINDS as readonly string[]).includes(value)
	);
}

/**
 * The DECLARED audio ACTION a rule requests when its trigger fires. A CLOSED enum (the audio command verbs
 * the playback surface exposes), so a rule can never request an undeclared command:
 *
 *   - `play`      — start the declared track. Requires a playable, licensed source/asset (the full gate).
 *   - `crossfade` — transition to the declared track. Same gate as `play` (it still begins playback).
 *   - `stop`      — stop session audio. A stop never plays a track, so it needs no asset/license gate.
 */
export type AudioAutomationAction = 'play' | 'crossfade' | 'stop';

export const AUDIO_AUTOMATION_ACTIONS: readonly AudioAutomationAction[] = Object.freeze([
	'play',
	'crossfade',
	'stop',
]);

/** True when `value` is a declared audio action. Unknown values fail closed (the rule is not built). */
export function isAudioAutomationAction(value: unknown): value is AudioAutomationAction {
	return (
		typeof value === 'string' && (AUDIO_AUTOMATION_ACTIONS as readonly string[]).includes(value)
	);
}

/** True when the action begins playback (and so must pass the source/asset/license/offline gate). */
export function actionStartsPlayback(action: AudioAutomationAction): boolean {
	return action === 'play' || action === 'crossfade';
}

/**
 * A durable AUDIO AUTOMATION RULE (AUDIO-005). The DM authors it; it references a DECLARED source (and an
 * optional declared local asset for a `play`/`crossfade`) BY ID — never a copy of the asset bytes. The
 * rule is DM-only config: it carries no player-facing content, so a player never sees the trigger or cue.
 */
export interface AudioAutomationRule {
	id: string;
	/** A short DM-authored label for the automation list (verbatim; defaults to a derived label). */
	label: string;
	/** Whether the rule is currently armed. A disabled rule is skipped by the resolver (still durable). */
	enabled: boolean;
	/** The session event this rule fires on (AUDIO-005). */
	trigger: AudioAutomationTriggerKind;
	/**
	 * An optional trigger SCOPE id — the specific entity the trigger must match (e.g. a Scene id for
	 * `scene-activation`, a handout id for `handout-delivery`). `null` ⇒ the rule fires for ANY occurrence
	 * of the trigger kind. Matching is exact + deterministic; a non-matching scope is simply not fired.
	 */
	triggerScopeId: string | null;
	/** The declared audio ACTION requested when the trigger fires. */
	action: AudioAutomationAction;
	/** The declared source the action plays/stops through (a configured `AudioSource` id). */
	sourceId: string;
	/** The declared local asset to play, or null (a stream `play`, or a `stop` which needs no asset). */
	assetId: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** The fail-closed build outcome. `ok` true ⇒ a valid rule to persist; false ⇒ rejected with a reason. */
export type AudioAutomationRuleResult =
	| { ok: true; rule: AudioAutomationRule }
	| { ok: false; reason: AudioAutomationRuleRejectionReason; message: string };

/** Why a rule build was rejected fail-closed (non-leaking; describes the reason, not the payload). */
export type AudioAutomationRuleRejectionReason =
	| 'unsupported-trigger'
	| 'unsupported-action'
	| 'source-not-found'
	| 'asset-not-found'
	| 'asset-required';

export interface BuildAudioAutomationRuleInput {
	id: string;
	label?: string;
	enabled?: boolean;
	trigger: string;
	triggerScopeId?: string | null;
	action: string;
	sourceId: string;
	assetId?: string | null;
	createdBy: string;
	createdAt: string;
	/** The library the source/asset references resolve against (fail closed: a dangling ref is rejected). */
	library: AudioState;
	/** Existing record (for an update) so created-by/at + revision continuity are preserved. */
	previous?: AudioAutomationRule;
}

/** Default human label for a rule when the DM did not author one. */
function defaultRuleLabel(trigger: AudioAutomationTriggerKind, action: AudioAutomationAction): string {
	return `${action} on ${trigger}`;
}

/**
 * AUDIO-005 — BUILD (or update) an automation rule, fail-closed. Decision order (reject BEFORE any state
 * mutation, so no half-armed rule is ever persisted):
 *
 *   1. An UNDECLARED trigger kind is rejected `unsupported-trigger`.
 *   2. An UNDECLARED action is rejected `unsupported-action`.
 *   3. The referenced SOURCE must exist in the library; a dangling source is rejected `source-not-found`.
 *   4. A referenced ASSET (when given) must exist; a dangling asset is rejected `asset-not-found`.
 *   5. A `play`/`crossfade` action MUST reference an asset for a LOCAL-FILE / BUNDLED-PRESET source (those
 *      types play a specific local asset); a missing asset is rejected `asset-required`. A web-stream
 *      `play` may omit the asset (the stream IS the track).
 *
 * The function never touches storage; the command handler persists the returned rule. License/offline
 * enforcement is NOT done here — it is RESOLVED at trigger time (the live library/online state) so a rule
 * authored while an asset was licensed still fails closed if the license is later revoked.
 */
export function buildAudioAutomationRule(
	input: BuildAudioAutomationRuleInput,
): AudioAutomationRuleResult {
	if (!isAudioAutomationTriggerKind(input.trigger)) {
		return {
			ok: false,
			reason: 'unsupported-trigger',
			message: `Audio automation trigger "${input.trigger}" is not a declared session-event trigger.`,
		};
	}
	if (!isAudioAutomationAction(input.action)) {
		return {
			ok: false,
			reason: 'unsupported-action',
			message: `Audio automation action "${input.action}" is not a declared audio action.`,
		};
	}

	const source = input.library.sources[input.sourceId];
	if (!source) {
		return {
			ok: false,
			reason: 'source-not-found',
			message: `Audio automation references source ${input.sourceId}, which is not configured.`,
		};
	}

	const assetId = input.assetId ?? null;
	if (assetId !== null && !input.library.assets[assetId]) {
		return {
			ok: false,
			reason: 'asset-not-found',
			message: `Audio automation references asset ${assetId}, which is not in the library.`,
		};
	}

	// A local/bundled play needs a specific asset; a web-stream play does not (the stream is the track).
	if (actionStartsPlayback(input.action) && assetId === null && source.type !== 'web-stream') {
		return {
			ok: false,
			reason: 'asset-required',
			message: `A ${input.action} automation on a ${source.type} source must reference a local asset.`,
		};
	}

	const previous = input.previous;
	const rule: AudioAutomationRule = {
		id: input.id,
		label: (input.label ?? '').trim() || defaultRuleLabel(input.trigger, input.action),
		enabled: input.enabled ?? true,
		trigger: input.trigger,
		triggerScopeId: (input.triggerScopeId ?? '').toString().trim() || null,
		action: input.action,
		sourceId: input.sourceId,
		assetId,
		createdBy: previous?.createdBy ?? input.createdBy,
		createdAt: previous?.createdAt ?? input.createdAt,
		updatedAt: input.createdAt,
		revision: (previous?.revision ?? 0) + 1,
	};
	return { ok: true, rule };
}

/** Deep-clone an automation rule so callers never mutate shared state. Pure. */
export function cloneAudioAutomationRule(rule: AudioAutomationRule): AudioAutomationRule {
	return { ...rule };
}

/**
 * AUDIO-005 — a FIRED session-event trigger the resolver evaluates rules against. Built by the GUI/runtime
 * from a core event (combat started / map revealed / scene activated / handout delivered). It carries the
 * device's CURRENT availability inputs (online + per-asset local availability/cache state) so the resolver
 * can reuse the AUDIO-010 offline gate WITHOUT any network I/O of its own.
 */
export interface AudioAutomationTrigger {
	kind: AudioAutomationTriggerKind;
	/** The specific entity the trigger occurred on (e.g. the activated Scene id), or null. */
	scopeId: string | null;
	/** Whether the device currently has network (AUDIO-010 offline gate input). Defaults to online. */
	online: boolean;
	/** Whether the rule's referenced local asset's bytes are available on this device. */
	assetLocallyAvailable: boolean;
	/** Whether the rule's referenced asset is explicitly cached (a web-stream pinned for offline). */
	assetCached: boolean;
	/** Whether a previously-cached asset was evicted (AUDIO-010 AC3 — reports missing, never substitutes). */
	cacheEvicted: boolean;
}

/** Why an automation rule did NOT issue its declared command (the non-leaking diagnostic reason). */
export type AudioAutomationBlockReason =
	// The source record no longer resolves to a declared, supported type (AUDIO-009 fail closed).
	| 'source-unsupported'
	// The source has playback disabled (cache/offline behavior undeclared — AUDIO-010 prerequisite).
	| 'playback-disabled'
	// The referenced local asset is not in the library (e.g. deleted after the rule was authored).
	| 'asset-missing'
	// The local asset's license is not cleared for use (AUDIO-004 review gate — never a silent bypass).
	| 'license-blocked'
	// The offline/availability gate resolved the track unplayable on this device (AUDIO-010, no retry).
	| 'unavailable';

/** A rule's resolved automation OUTCOME: either a requested command, or a flagged blocked no-op. */
export type AudioAutomationOutcome =
	| {
			ruleId: string;
			status: 'requested';
			/** The declared audio command this rule requests (the GUI dispatches it through the core). */
			request: AudioAutomationCommandRequest;
	  }
	| {
			ruleId: string;
			status: 'blocked';
			/** Why the declared command was NOT issued (AUDIO-005 AC2 — fail closed, diagnostic recorded). */
			reason: AudioAutomationBlockReason;
			/** The precise license-review reason when `reason` is `license-blocked`, else null. */
			licenseReviewReason: AudioLicenseReviewReason | null;
			message: string;
	  };

/**
 * The DECLARED audio command an automation rule requests (Contract 4: automation output is a command
 * request the Processing Core validates — this is NOT a durable mutation by itself). It names the action +
 * the declared source/asset; the playback command layer (a future AUDIO playback epic) consumes it.
 */
export interface AudioAutomationCommandRequest {
	action: AudioAutomationAction;
	sourceId: string;
	assetId: string | null;
}

/** Resolve the available-playback gate for a rule's source/asset against the live trigger inputs. */
function resolvePlaybackForRule(
	rule: AudioAutomationRule,
	library: AudioState,
	trigger: AudioAutomationTrigger,
): AudioPlaybackAvailability | 'source-unsupported' {
	const source = library.sources[rule.sourceId];
	if (!source) return 'source-unsupported';
	// A legacy/corrupt record whose type no longer resolves fails closed (AUDIO-009).
	if (!classifyAudioSource(source).supported) return 'source-unsupported';
	return resolveAudioPlaybackAvailability({
		source,
		assetLocallyAvailable: trigger.assetLocallyAvailable,
		assetCached: trigger.assetCached,
		cacheEvicted: trigger.cacheEvicted,
		online: trigger.online,
	});
}

/** Map an AUDIO-010 availability state to the non-leaking automation block reason + message. */
function blockOutcomeForAvailability(
	rule: AudioAutomationRule,
	availability: AudioPlaybackAvailability,
): Extract<AudioAutomationOutcome, { status: 'blocked' }> {
	const reason: AudioAutomationBlockReason =
		availability === 'playback-disabled'
			? 'playback-disabled'
			: availability === 'missing-asset'
				? 'asset-missing'
				: 'unavailable';
	return {
		ruleId: rule.id,
		status: 'blocked',
		reason,
		licenseReviewReason: null,
		message: `Automation "${rule.label}" did not start playback: track is ${availability}.`,
	};
}

/**
 * AUDIO-005 — evaluate ONE rule against a fired trigger, fail-closed. Returns the resolved outcome:
 *
 *   - A disabled rule, or a rule whose trigger kind/scope does not match, returns `null` (not fired).
 *   - A matching rule that BEGINS PLAYBACK is validated through the full gate: source supported
 *     (AUDIO-009) → license cleared (AUDIO-004) → offline availability `available` (AUDIO-010). Any failure
 *     is a `blocked` no-op with a diagnostic; only a fully-cleared rule is `requested`.
 *   - A `stop` action never plays a track, so it only requires a resolvable source; it is `requested`
 *     unless the source no longer resolves.
 */
export function evaluateAudioAutomationRule(
	rule: AudioAutomationRule,
	trigger: AudioAutomationTrigger,
	library: AudioState,
): AudioAutomationOutcome | null {
	if (!rule.enabled) return null;
	if (rule.trigger !== trigger.kind) return null;
	// A scoped rule fires only for its exact scope; an unscoped rule fires for any occurrence.
	if (rule.triggerScopeId !== null && rule.triggerScopeId !== trigger.scopeId) return null;

	const request: AudioAutomationCommandRequest = {
		action: rule.action,
		sourceId: rule.sourceId,
		assetId: rule.assetId,
	};

	if (!actionStartsPlayback(rule.action)) {
		// A `stop` needs no asset/license/offline gate, but the source must still resolve (fail closed).
		const source = library.sources[rule.sourceId];
		if (!source || !classifyAudioSource(source).supported) {
			return {
				ruleId: rule.id,
				status: 'blocked',
				reason: 'source-unsupported',
				licenseReviewReason: null,
				message: `Automation "${rule.label}" could not stop audio: source is unsupported.`,
			};
		}
		return { ruleId: rule.id, status: 'requested', request };
	}

	// AUDIO-004 — license gate FIRST for a local asset (a flagged asset never plays via automation).
	if (rule.assetId !== null) {
		const asset = library.assets[rule.assetId];
		if (!asset) {
			return {
				ruleId: rule.id,
				status: 'blocked',
				reason: 'asset-missing',
				licenseReviewReason: null,
				message: `Automation "${rule.label}" did not start playback: referenced asset is missing.`,
			};
		}
		if (assetNeedsLicenseReview(asset)) {
			return {
				ruleId: rule.id,
				status: 'blocked',
				reason: 'license-blocked',
				licenseReviewReason: licenseReviewReason(asset),
				message: `Automation "${rule.label}" did not start playback: asset license is not cleared.`,
			};
		}
	}

	// AUDIO-009 / AUDIO-010 — source/offline gate.
	const availability = resolvePlaybackForRule(rule, library, trigger);
	if (availability === 'source-unsupported') {
		return {
			ruleId: rule.id,
			status: 'blocked',
			reason: 'source-unsupported',
			licenseReviewReason: null,
			message: `Automation "${rule.label}" did not start playback: source is unsupported.`,
		};
	}
	if (availability !== 'available') {
		return blockOutcomeForAvailability(rule, availability);
	}

	return { ruleId: rule.id, status: 'requested', request };
}

/** The deterministic resolution of a fired trigger across ALL rules: outcomes in stable rule-id order. */
export interface AudioAutomationResolution {
	trigger: AudioAutomationTriggerKind;
	scopeId: string | null;
	/** Every fired rule's outcome (requested or blocked), in stable rule-id order. */
	outcomes: AudioAutomationOutcome[];
	/** The requested commands only — what the GUI dispatches through the core (AUDIO-005 AC1). */
	requests: AudioAutomationCommandRequest[];
	/** Count of blocked rules (AUDIO-005 AC2 — fail-closed diagnostics, never a silent bypass). */
	blockedCount: number;
}

/**
 * AUDIO-005 — THE deterministic automation resolver. Given a fired trigger + the live rule set + the live
 * library, it evaluates EVERY rule (stable id order) and returns the requested commands plus blocked
 * diagnostics. Pure + deterministic: the same (trigger, rules, library) always yields the same resolution,
 * so an identical event sequence produces an identical automation outcome. It performs NO mutation and NO
 * network I/O; the caller dispatches each `request` as a real audio command through the Processing Core.
 */
export function resolveAudioAutomation(
	trigger: AudioAutomationTrigger,
	rules: Record<string, AudioAutomationRule>,
	library: AudioState,
): AudioAutomationResolution {
	const outcomes: AudioAutomationOutcome[] = [];
	for (const rule of Object.values(rules).sort((a, b) => a.id.localeCompare(b.id))) {
		const outcome = evaluateAudioAutomationRule(rule, trigger, library);
		if (outcome) outcomes.push(outcome);
	}
	const requests = outcomes
		.filter((o): o is Extract<AudioAutomationOutcome, { status: 'requested' }> => o.status === 'requested')
		.map((o) => o.request);
	const blockedCount = outcomes.filter((o) => o.status === 'blocked').length;
	return { trigger: trigger.kind, scopeId: trigger.scopeId, outcomes, requests, blockedCount };
}
