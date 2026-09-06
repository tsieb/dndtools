import { useMemo, useState, type FormEvent } from 'react';
import {
	resolveAudioAutomationForActor,
	type AudioAssetView,
	type AudioAutomationAction,
	type AudioAutomationOutcome,
	type AudioAutomationRule,
	type AudioAutomationTriggerKind,
	type AudioSourceClassification,
	type CommandResult,
	type CoreCommand,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { type BytesPresence } from './shared';

/**
 * AUDIO-005 — the automation editor: each enabled rule's deterministic resolution against the
 * current library and this device's real byte presence, the rule form's local state, and the
 * configure / delete / run-now dispatches. Extracted from Audio.tsx unchanged (RC-STB-2.6).
 */
export function useAutomationEditor({
	automationRules,
	audioState,
	permissions,
	dmId,
	canEdit,
	assets,
	usableSources,
	bytesPresence,
	dispatch,
	failure,
	runtime,
}: {
	automationRules: AudioAutomationRule[];
	audioState: Parameters<typeof resolveAudioAutomationForActor>[0];
	permissions: Parameters<typeof resolveAudioAutomationForActor>[1];
	dmId: string;
	canEdit: boolean;
	assets: AudioAssetView[];
	usableSources: AudioSourceClassification[];
	bytesPresence: Record<string, BytesPresence>;
	dispatch: (command: CoreCommand) => void;
	failure: (command: CoreCommand) => Promise<string | null>;
	runtime: { dispatch: (command: CoreCommand) => Promise<CommandResult> };
}) {
	// Each ENABLED rule's deterministic resolution against the CURRENT library + this device's real
	// byte presence — exactly what the core resolver would compute if the trigger fired now.
	const ruleOutcomes = useMemo(() => {
		const map = new Map<string, AudioAutomationOutcome | 'checking'>();
		for (const rule of automationRules) {
			if (!rule.enabled) continue;
			const assetPresence = rule.assetId ? (bytesPresence[rule.assetId] ?? 'unknown') : 'present';
			if (assetPresence === 'unknown') {
				// The byte check hasn't settled on this device yet — resolving now would flash an
				// untrue "Blocked". Report 'checking' and resolve once presence is known.
				map.set(rule.id, 'checking');
				continue;
			}
			const bytesReady = assetPresence === 'present';
			const resolution = resolveAudioAutomationForActor(audioState, permissions, dmId, {
				kind: rule.trigger,
				scopeId: rule.triggerScopeId,
				online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
				assetLocallyAvailable: bytesReady,
				assetCached: bytesReady,
				cacheEvicted: false,
			});
			const outcome = resolution?.outcomes.find((o) => o.ruleId === rule.id);
			if (outcome) map.set(rule.id, outcome);
		}
		return map;
	}, [automationRules, audioState, permissions, dmId, bytesPresence]);

	const [ruleLabel, setRuleLabel] = useState('');
	const [ruleTrigger, setRuleTrigger] = useState<AudioAutomationTriggerKind>('combat-start');
	const [ruleScopeId, setRuleScopeId] = useState('');
	const [ruleAction, setRuleAction] = useState<AudioAutomationAction>('play');
	const [ruleSourceId, setRuleSourceId] = useState('');
	const [ruleAssetId, setRuleAssetId] = useState('');
	const [ruleBusy, setRuleBusy] = useState(false);
	const [ruleError, setRuleError] = useState<string | null>(null);

	const selectedRuleSource = usableSources.some((source) => source.sourceId === ruleSourceId)
		? ruleSourceId
		: '';
	const ruleFormSourceId = selectedRuleSource || usableSources[0]?.sourceId || '';
	const ruleSourceAssets = assets.filter((a) => a.sourceId === ruleFormSourceId);

	const createRule = async (e: FormEvent) => {
		e.preventDefault();
		if (ruleBusy || !canEdit || !ruleFormSourceId) return;
		setRuleBusy(true);
		setRuleError(null);
		try {
			const problem = await failure({
				type: 'audio.configure-automation',
				actorId: dmId,
				payload: {
					...(ruleLabel.trim() ? { label: ruleLabel.trim() } : {}),
					trigger: ruleTrigger,
					triggerScopeId: ruleTrigger === 'scene-activation' && ruleScopeId ? ruleScopeId : null,
					action: ruleAction,
					sourceId: ruleFormSourceId,
					assetId: ruleAction !== 'stop' && ruleAssetId ? ruleAssetId : null,
				},
			});
			if (problem) {
				setRuleError(problem);
			} else {
				Toaster.success('Automation rule saved.');
				setRuleLabel('');
				setRuleScopeId('');
				setRuleAssetId('');
			}
		} finally {
			setRuleBusy(false);
		}
	};

	const toggleRuleEnabled = (rule: AudioAutomationRule, enabled: boolean) =>
		dispatch({
			type: 'audio.configure-automation',
			actorId: dmId,
			payload: {
				ruleId: rule.id,
				label: rule.label,
				enabled,
				trigger: rule.trigger,
				triggerScopeId: rule.triggerScopeId,
				action: rule.action,
				sourceId: rule.sourceId,
				assetId: rule.assetId,
			},
		});

	// Delete is immediate with a Toaster UNDO (no confirm step) — undo re-dispatches the rule's
	// previous definition under its ORIGINAL id (configure-automation recreates a deleted ruleId).
	const deleteRule = async (rule: AudioAutomationRule) => {
		const problem = await failure({
			type: 'audio.delete-automation',
			actorId: dmId,
			payload: { ruleId: rule.id },
		});
		if (problem) {
			Toaster.error(problem);
			return;
		}
		Toaster.show({
			message: `Automation “${rule.label}” deleted.`,
			action: 'Undo',
			onAction: () => {
				void runtime
					.dispatch({
						type: 'audio.configure-automation',
						actorId: dmId,
						payload: {
							ruleId: rule.id,
							label: rule.label,
							enabled: rule.enabled,
							trigger: rule.trigger,
							triggerScopeId: rule.triggerScopeId,
							action: rule.action,
							sourceId: rule.sourceId,
							assetId: rule.assetId,
						},
					})
					.then((restored) => {
						if (restored.status !== 'accepted')
							Toaster.error(`Undo failed: ${restored.rejection.message}`);
					});
			},
		});
	};

	/** Dispatch a rule's RESOLVED command request through the core (AUDIO-005 AC1) — DM-initiated. */
	const runRuleNow = async (rule: AudioAutomationRule) => {
		const outcome = ruleOutcomes.get(rule.id);
		if (!outcome || outcome === 'checking' || outcome.status !== 'requested') return;
		const bytesReady = rule.assetId ? bytesPresence[rule.assetId] === 'present' : true;
		const problem = await failure(
			outcome.request.action === 'stop'
				? { type: 'session.audio.stop', actorId: dmId, payload: {} }
				: {
						type: 'session.audio.play',
						actorId: dmId,
						payload: {
							sourceId: outcome.request.sourceId,
							assetId: outcome.request.assetId,
							crossfadeSeconds: outcome.request.action === 'crossfade' ? 2 : 0,
							assetLocallyAvailable: bytesReady,
							assetCached: bytesReady,
							online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
						},
					},
		);
		if (problem) Toaster.error(problem);
	};

	return {
		ruleOutcomes,
		ruleLabel,
		setRuleLabel,
		ruleTrigger,
		setRuleTrigger,
		ruleScopeId,
		setRuleScopeId,
		ruleAction,
		setRuleAction,
		ruleSourceId,
		setRuleSourceId,
		ruleAssetId,
		setRuleAssetId,
		ruleBusy,
		ruleError,
		ruleFormSourceId,
		ruleSourceAssets,
		createRule,
		toggleRuleEnabled,
		deleteRule,
		runRuleNow,
	};
}
