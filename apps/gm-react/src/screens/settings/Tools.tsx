import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Toaster } from '../../ds';
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
		<Panel title={t('settings.tools.title')}>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>{t('settings.tools.intro')}</div>
			<div
				role="radiogroup"
				aria-label={t('settings.tools.groupLabel')}
				// This declared radiogroup had no arrow keys and every card was its own tab stop — the
				// same gap already closed for Seg/SegmentedControl and for Onboarding's choice cards.
				onKeyDown={radioGroupKeyDown}
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
					gap: 10,
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
						<button
							key={option.id}
							type="button"
							role="radio"
							aria-checked={selected}
							tabIndex={selected ? 0 : -1}
							onClick={() => choose(option.id)}
							style={{
								padding: 12,
								borderRadius: 10,
								border: `1px solid ${selected ? T.accBd : T.bd}`,
								background: selected ? T.accSub : T.alt,
								textAlign: 'left',
								cursor: 'pointer',
							}}
						>
							<div style={{ font: `600 13px ${T.sans}`, color: selected ? T.acc : T.ink }}>
								{t(option.title)}
							</div>
							<div style={{ marginTop: 4, font: `12px/1.5 ${T.sans}`, color: T.ter }}>
								{t(option.desc)}
							</div>
						</button>
					);
				})}
			</div>
		</Panel>
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
	const body = t('settings.plugins.body', { extensions });
	const [bodyBefore, bodyAfter = ''] = body.split(extensions);
	return (
		<Panel title={t('settings.plugins.title')}>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				{bodyBefore}
				<strong style={{ color: T.ink }}>{extensions}</strong>
				{bodyAfter}
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
		<Panel title={t('settings.systems.title')}>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
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
	);
}
