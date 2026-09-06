import { type FormEvent } from 'react';
import {
	AUDIO_AUTOMATION_ACTIONS,
	AUDIO_AUTOMATION_TRIGGER_KINDS,
	type AudioAssetView,
	type AudioAutomationAction,
	type AudioAutomationOutcome,
	type AudioAutomationRule,
	type AudioAutomationTriggerKind,
	type AudioSourceClassification,
} from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Field,
	Icon,
	Input,
	Select,
	Switch,
	tabPanelProps,
} from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { ACTION_LABELS, TRIGGER_LABELS } from './shared';
import { type SceneListRow } from './types';

/** The Automation tab (AUDIO-005) — the rule list with each rule's deterministic resolution, and
 * the create form. Extracted from Audio.tsx unchanged (RC-STB-2.6). */
export function AutomationTab({
	isPhone,
	isDesktop,
	previewing,
	canEdit,
	assets,
	sources,
	usableSources,
	automationRules,
	scenes,
	ruleOutcomes,
	ruleLabel,
	setRuleLabel,
	ruleTrigger,
	setRuleTrigger,
	ruleScopeId,
	setRuleScopeId,
	ruleAction,
	setRuleAction,
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
	sceneNameById,
}: {
	isPhone: boolean;
	isDesktop: boolean;
	previewing: boolean;
	canEdit: boolean;
	assets: AudioAssetView[];
	sources: AudioSourceClassification[];
	usableSources: AudioSourceClassification[];
	automationRules: AudioAutomationRule[];
	scenes: SceneListRow[];
	ruleOutcomes: Map<string, AudioAutomationOutcome | 'checking'>;
	ruleLabel: string;
	setRuleLabel: (next: string) => void;
	ruleTrigger: AudioAutomationTriggerKind;
	setRuleTrigger: (next: AudioAutomationTriggerKind) => void;
	ruleScopeId: string;
	setRuleScopeId: (next: string) => void;
	ruleAction: AudioAutomationAction;
	setRuleAction: (next: AudioAutomationAction) => void;
	setRuleSourceId: (next: string) => void;
	ruleAssetId: string;
	setRuleAssetId: (next: string) => void;
	ruleBusy: boolean;
	ruleError: string | null;
	ruleFormSourceId: string;
	ruleSourceAssets: AudioAssetView[];
	createRule: (event: FormEvent) => Promise<void>;
	toggleRuleEnabled: (rule: AudioAutomationRule, enabled: boolean) => void;
	deleteRule: (rule: AudioAutomationRule) => Promise<void>;
	runRuleNow: (rule: AudioAutomationRule) => Promise<void>;
	sceneNameById: (id: string | null) => string | null;
}) {
	return (
		<div
			{...tabPanelProps('audio', 'automation')}
			style={{
				display: 'grid',
				gridTemplateColumns: isDesktop ? '1.3fr 1fr' : 'minmax(0,1fr)',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel
				title="Automation rules"
				action={
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{automationRules.length} {automationRules.length === 1 ? 'rule' : 'rules'}
					</span>
				}
			>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					Each rule maps a session event to a declared audio command. The status below is the core
					resolver&rsquo;s deterministic verdict against the current library and this device&rsquo;s
					real file availability — a blocked rule is flagged, never silently bypassed.
				</div>
				{automationRules.length === 0 && (
					<EmptyState
						inset
						icon="wand"
						title="No automation rules."
						description="Map a session event — combat starting, a scene activating — to an audio cue with the form beside."
					/>
				)}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{automationRules.map((rule) => {
						const outcome = ruleOutcomes.get(rule.id);
						const sourceName =
							sources.find((s) => s.sourceId === rule.sourceId)?.displayName ?? rule.sourceId;
						const assetName = rule.assetId
							? (assets.find((a) => a.id === rule.assetId)?.title ?? rule.assetId)
							: null;
						const scopeName =
							rule.trigger === 'scene-activation'
								? sceneNameById(rule.triggerScopeId)
								: rule.triggerScopeId;
						return (
							<div
								key={rule.id}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 6,
									padding: '10px 12px',
									border: `1px solid ${T.bd}`,
									borderRadius: 9,
									background: T.surf,
								}}
							>
								{/* Six children with no wrap: on a phone the fixed ones (icon, badge, Switch,
										    "Run now", delete) ate almost the whole ~287px single-column content box,
										    collapsing the rule's own label+description column to a few pixels — one
										    character per line. responsive.spec structurally cannot see this: it only
										    renders each route's DEFAULT tab, and a crushed column overflows nothing. */}
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										flexWrap: isPhone ? 'wrap' : 'nowrap',
									}}
								>
									<Icon name="wand" size={15} color={rule.enabled ? T.acc : T.ter} />
									<div
										style={{
											// `flex: 1` is `1 1 0%`, and a 0 flex-basis makes the hypothetical
											// line size 0 — so wrapping alone would never trigger and the text
											// would still be squeezed to nothing. `auto` lets line-breaking see
											// the real content width and pushes the controls onto their own row.
											flex: isPhone ? '1 1 auto' : 1,
											minWidth: 0,
										}}
									>
										<div
											style={{
												font: `600 12.5px ${T.sans}`,
												color: rule.enabled ? T.ink : T.ter,
											}}
										>
											{rule.label}
										</div>
										<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
											{TRIGGER_LABELS[rule.trigger]}
											{scopeName ? ` (${scopeName})` : ' (any)'} → {ACTION_LABELS[rule.action]} ·{' '}
											{sourceName}
											{assetName ? ` · ${assetName}` : ''}
										</div>
									</div>
									{!rule.enabled ? (
										<Badge status="neutral">Disabled</Badge>
									) : outcome === 'checking' ? (
										<Badge status="neutral">Checking…</Badge>
									) : outcome?.status === 'requested' ? (
										<Badge status="success">Ready</Badge>
									) : outcome?.status === 'blocked' ? (
										<Badge status="warning">Blocked</Badge>
									) : null}
									<Switch
										checked={rule.enabled}
										disabled={!canEdit}
										onChange={(v: boolean) => toggleRuleEnabled(rule, v)}
										aria-label={`Enable ${rule.label}`}
									/>
									{outcome !== 'checking' && outcome?.status === 'requested' && (
										<Button
											variant="ghost"
											size="sm"
											icon="play"
											disabled={!canEdit}
											aria-label={`Run ${rule.label} now`}
											onClick={() => void runRuleNow(rule)}
										>
											Run now
										</Button>
									)}
									<Button
										variant="ghost"
										size="sm"
										icon="delete"
										disabled={!canEdit}
										aria-label={`Delete ${rule.label}`}
										onClick={() => void deleteRule(rule)}
									/>
								</div>
								{rule.enabled && outcome !== 'checking' && outcome?.status === 'blocked' && (
									<div
										role="status"
										style={{
											font: `11px/1.5 ${T.sans}`,
											color: 'var(--color-status-warning-text)',
										}}
									>
										{outcome.message}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</Panel>

			<Panel title="New rule">
				{canEdit ? (
					<form onSubmit={createRule} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
						<Field
							label="Label"
							htmlFor="automation-label"
							help="Optional — defaults to “action on trigger”."
						>
							<Input
								id="automation-label"
								value={ruleLabel}
								onChange={(e: { target: { value: string } }) => setRuleLabel(e.target.value)}
								placeholder="Battle drums on combat"
							/>
						</Field>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
								gap: 10,
							}}
						>
							<Field label="When" htmlFor="automation-trigger">
								<Select
									id="automation-trigger"
									value={ruleTrigger}
									onChange={(e: { target: { value: string } }) => {
										setRuleTrigger(e.target.value as AudioAutomationTriggerKind);
										setRuleScopeId('');
									}}
									options={AUDIO_AUTOMATION_TRIGGER_KINDS.map((t) => ({
										value: t,
										label: TRIGGER_LABELS[t],
									}))}
								/>
							</Field>
							<Field label="Do" htmlFor="automation-action">
								<Select
									id="automation-action"
									value={ruleAction}
									onChange={(e: { target: { value: string } }) =>
										setRuleAction(e.target.value as AudioAutomationAction)
									}
									options={AUDIO_AUTOMATION_ACTIONS.map((a) => ({
										value: a,
										label: ACTION_LABELS[a],
									}))}
								/>
							</Field>
						</div>
						{ruleTrigger === 'scene-activation' && (
							<Field label="Scene" htmlFor="automation-scope" help="Fire for one scene, or any.">
								<Select
									id="automation-scope"
									value={ruleScopeId}
									onChange={(e: { target: { value: string } }) => setRuleScopeId(e.target.value)}
									options={[
										{ value: '', label: 'Any scene' },
										...scenes.map((s) => ({ value: s.id, label: s.name })),
									]}
								/>
							</Field>
						)}
						<Field label="Source" htmlFor="automation-source">
							<Select
								id="automation-source"
								value={ruleFormSourceId}
								disabled={usableSources.length === 0}
								onChange={(e: { target: { value: string } }) => {
									setRuleSourceId(e.target.value);
									setRuleAssetId('');
								}}
								options={usableSources.map((s) => ({
									value: s.sourceId,
									label: s.displayName,
								}))}
							/>
						</Field>
						{ruleAction !== 'stop' && (
							<Field
								label="Asset"
								htmlFor="automation-asset"
								help="Required for a local/bundled source; a web stream plays the stream itself."
							>
								<Select
									id="automation-asset"
									value={ruleAssetId}
									onChange={(e: { target: { value: string } }) => setRuleAssetId(e.target.value)}
									options={[
										{ value: '', label: '— none (stream is the track) —' },
										...ruleSourceAssets.map((a) => ({
											value: a.id,
											label: a.title || a.fileName,
										})),
									]}
								/>
							</Field>
						)}
						<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
							<Button
								type="submit"
								variant="secondary"
								size="sm"
								icon="add"
								disabled={ruleBusy || usableSources.length === 0}
							>
								{ruleBusy ? 'Saving…' : 'Add rule'}
							</Button>
							{usableSources.length === 0 && (
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									Add a track or import audio first — a rule needs a source.
								</span>
							)}
							{ruleError && (
								<span
									role="alert"
									style={{ font: `11.5px ${T.sans}`, color: 'var(--color-status-error-text)' }}
								>
									{ruleError}
								</span>
							)}
						</div>
					</form>
				) : (
					<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						Automation is DM-only{previewing ? ' — exit preview to edit rules.' : '.'}
					</div>
				)}
			</Panel>
		</div>
	);
}
