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
import { useI18n } from '../../i18n';
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
	const { t } = useI18n();
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
				title={t('audio.automation.title')}
				action={
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('audio.automation.count', { count: automationRules.length })}
					</span>
				}
			>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					{t('audio.automation.intro')}
				</div>
				{automationRules.length === 0 && (
					<EmptyState
						inset
						icon="wand"
						title={t('audio.automation.emptyTitle')}
						description={t('audio.automation.emptyBody')}
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
											{t('audio.automation.ruleLine', {
												trigger: t(TRIGGER_LABELS[rule.trigger]),
												scope: scopeName ?? t('audio.automation.anyScope'),
												action: t(ACTION_LABELS[rule.action]),
												source: sourceName,
											})}
											{assetName ? ` · ${assetName}` : ''}
										</div>
									</div>
									{!rule.enabled ? (
										<Badge status="neutral">{t('audio.automation.disabled')}</Badge>
									) : outcome === 'checking' ? (
										<Badge status="neutral">{t('audio.automation.checking')}</Badge>
									) : outcome?.status === 'requested' ? (
										<Badge status="success">{t('audio.automation.ready')}</Badge>
									) : outcome?.status === 'blocked' ? (
										<Badge status="warning">{t('audio.automation.blocked')}</Badge>
									) : null}
									<Switch
										checked={rule.enabled}
										disabled={!canEdit}
										onChange={(v: boolean) => toggleRuleEnabled(rule, v)}
										aria-label={t('audio.automation.enableRule', { label: rule.label })}
									/>
									{outcome !== 'checking' && outcome?.status === 'requested' && (
										<Button
											variant="ghost"
											size="sm"
											icon="play"
											disabled={!canEdit}
											aria-label={t('audio.automation.runRule', { label: rule.label })}
											onClick={() => void runRuleNow(rule)}
										>
											{t('audio.automation.runNow')}
										</Button>
									)}
									<Button
										variant="ghost"
										size="sm"
										icon="delete"
										disabled={!canEdit}
										aria-label={t('audio.automation.deleteRule', { label: rule.label })}
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

			<Panel title={t('audio.automation.newRule')}>
				{canEdit ? (
					<form onSubmit={createRule} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
						<Field
							label={t('audio.automation.label')}
							htmlFor="automation-label"
							help={t('audio.automation.labelHelp')}
						>
							<Input
								id="automation-label"
								value={ruleLabel}
								onChange={(e: { target: { value: string } }) => setRuleLabel(e.target.value)}
								placeholder={t('audio.automation.labelPlaceholder')}
							/>
						</Field>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
								gap: 10,
							}}
						>
							<Field label={t('audio.automation.when')} htmlFor="automation-trigger">
								<Select
									id="automation-trigger"
									value={ruleTrigger}
									onChange={(e: { target: { value: string } }) => {
										setRuleTrigger(e.target.value as AudioAutomationTriggerKind);
										setRuleScopeId('');
									}}
									options={AUDIO_AUTOMATION_TRIGGER_KINDS.map((kind) => ({
										value: kind,
										label: t(TRIGGER_LABELS[kind]),
									}))}
								/>
							</Field>
							<Field label={t('audio.automation.do')} htmlFor="automation-action">
								<Select
									id="automation-action"
									value={ruleAction}
									onChange={(e: { target: { value: string } }) =>
										setRuleAction(e.target.value as AudioAutomationAction)
									}
									options={AUDIO_AUTOMATION_ACTIONS.map((a) => ({
										value: a,
										label: t(ACTION_LABELS[a]),
									}))}
								/>
							</Field>
						</div>
						{ruleTrigger === 'scene-activation' && (
							<Field
								label={t('audio.automation.scene')}
								htmlFor="automation-scope"
								help={t('audio.automation.sceneHelp')}
							>
								<Select
									id="automation-scope"
									value={ruleScopeId}
									onChange={(e: { target: { value: string } }) => setRuleScopeId(e.target.value)}
									options={[
										{ value: '', label: t('audio.automation.anyScene') },
										...scenes.map((s) => ({ value: s.id, label: s.name })),
									]}
								/>
							</Field>
						)}
						<Field label={t('audio.automation.source')} htmlFor="automation-source">
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
								label={t('audio.automation.asset')}
								htmlFor="automation-asset"
								help={t('audio.automation.assetHelp')}
							>
								<Select
									id="automation-asset"
									value={ruleAssetId}
									onChange={(e: { target: { value: string } }) => setRuleAssetId(e.target.value)}
									options={[
										{ value: '', label: t('audio.automation.noAsset') },
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
								{ruleBusy ? t('audio.presets.saving') : t('audio.automation.addRule')}
							</Button>
							{usableSources.length === 0 && (
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{t('audio.automation.needsSource')}
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
						{t(previewing ? 'audio.automation.dmOnlyPreviewing' : 'audio.automation.dmOnly')}
					</div>
				)}
			</Panel>
		</div>
	);
}
