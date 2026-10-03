import { SettingsSection } from './Experience';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, HelpTip, RadioCard, Toaster } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, T, radioGroupKeyDown } from '../../app/screen-kit';
import {
	getAiUsagePreference,
	saveAiUsagePreference,
	type AiUsagePreference,
} from '../../ai/usagePreference';
/* ---- The three small subpages: tool preferences, and the Plugins / Systems pointers -------------- */
/** The one durable consent control. It remains reachable when AI is hidden, but the AI setup and
 * assistant panels themselves never render until the user explicitly picks Complete use. */
export function SettingsToolPreferences() {
	const { t } = useI18n();
	const [preference, setPreference] = useState<AiUsagePreference>(getAiUsagePreference);
	const choose = (next: AiUsagePreference) => {
		saveAiUsagePreference(next);
		setPreference(next);
		Toaster.success(
			t(
				next === 'complete'
					? 'settings.tools.completeToast'
					: next === 'generation-only'
						? 'settings.tools.generatorsToast'
						: 'settings.tools.noneToast',
			),
		);
	};
	return (
		<SettingsSection gateKey="settings.tools.title">
			<Panel title={t('settings.tools.title')}>
				<HelpTip>{t('settings.tools.intro')}</HelpTip>
				<div
					role="radiogroup"
					aria-label={t('settings.tools.groupLabel')}
					// This declared radiogroup had no arrow keys and every card was its own tab stop — the
					// same gap already closed for Seg/SegmentedControl and for Onboarding's choice cards.
					onKeyDown={radioGroupKeyDown}
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
						gap: T.space.three,
					}}
				>
					{(
						[
							{
								id: 'complete' as const,
								title: 'settings.tools.completeTitle',
								desc: 'settings.tools.completeDesc',
							},
							{
								id: 'generation-only' as const,
								title: 'settings.tools.generatorsTitle',
								desc: 'settings.tools.generatorsDesc',
							},
							{
								id: 'none' as const,
								title: 'settings.tools.noneTitle',
								desc: 'settings.tools.noneDesc',
							},
						] satisfies Array<{ id: AiUsagePreference; title: MessageKey; desc: MessageKey }>
					).map((option) => {
						const selected = preference === option.id;
						return (
							<RadioCard
								key={option.id}
								value={option.id}
								checked={selected}
								onChange={choose}
								style={{
									padding: T.space.three,
									borderRadius: T.radius.md,
									border: `1px solid ${selected ? T.accBd : T.bd}`,
									background: selected ? T.accSub : T.alt,
									textAlign: 'left',
									cursor: 'pointer',
								}}
							>
								{/* Heading in primary ink: the DS heading paints accent on the accent tint, which
								    is 4.43:1 on parchment (DEBT-2026-008). The border carries the selection. */}
								<span style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink }}>
									{t(option.title)}
								</span>
								<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
									{t(option.desc)}
								</div>
							</RadioCard>
						);
					})}
				</div>
			</Panel>
		</SettingsSection>
	);
}

/* ---- Plugins → Extensions ---------------------------------------------------------------------
 * Installed widget packages have a REAL registry surface in Extensions (`runtime.state.widgets.packages`
 * with working `widget.package.enable/disable`). This subpage used to render a parallel MOCK list with
 * local-only toggles, contradicting the live surface — so it now points at the real one instead of
 * duplicating it with fake data. */
export function SettingsPlugins() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const extensions = t('settings.plugins.extensions');
	const [pluginsBefore, pluginsAfter = ''] = t('settings.plugins.body', { extensions }).split(
		extensions,
	);
	return (
		<SettingsSection gateKey="settings.plugins.title">
			<Panel title={t('settings.plugins.title')}>
				{/* Same pointer shape as Systems below: a nested accent callout inside the panel made a
				    second landmark and painted its action in the parchment accent pair. */}
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{pluginsBefore}
					<strong style={{ color: T.ink }}>{extensions}</strong>
					{pluginsAfter}
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="widget"
					onClick={() => navigate('/extensions')}
					style={{ alignSelf: 'flex-start' }}
				>
					{t('settings.openExtensions')}
				</Button>
			</Panel>
		</SettingsSection>
	);
}

/* ---- Systems (pointer — the REAL rules-system switch, with its `previewSystemSwitch` dry-run and
 * the `widget.package.switch-system` command, lives on the Extensions screen's System tab) ---------- */
export function SettingsSystems() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = t('settings.systems.location');
	const body = t('settings.systems.body', { location });
	const [bodyBefore, bodyAfter = ''] = body.split(location);
	return (
		<SettingsSection gateKey="settings.systems.title">
			<Panel title={t('settings.systems.title')}>
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{bodyBefore}
					<strong style={{ color: T.ink }}>{location}</strong>
					{bodyAfter}
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="scroll"
					onClick={() => navigate('/extensions')}
					style={{ alignSelf: 'flex-start' }}
				>
					{t('settings.openExtensions')}
				</Button>
			</Panel>
		</SettingsSection>
	);
}
