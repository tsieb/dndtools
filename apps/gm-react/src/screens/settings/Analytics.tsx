import { useState } from 'react';
import { PRODUCT_ANALYTICS_EVENT_NAMES } from '@dndtools/core';
import { Badge, Switch, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import {
	isTelemetryConfigured,
	setTelemetryConsent,
	telemetryEnabled,
} from '../../cloud/telemetry';

/* ---- RC-CLD-1.4 — opt-in product analytics consent ----------------------------------------------
 * One switch, defaulted off, plus the two lists that make it an informed choice: what a granted
 * consent sends, and what it can never send. The event list is READ FROM THE CORE TAXONOMY rather
 * than authored here, so a new event cannot be added without appearing on this panel — the panel
 * cannot drift into a promise the client no longer keeps.
 *
 * A build with no cloud address shows the switch disabled with the reason, rather than offering a
 * control that would do nothing. */

/** Taxonomy event name → its plain-language line. Keyed off the core list, so a new event that
 *  forgets its copy fails `pnpm typecheck` here instead of shipping unlabelled. */
const EVENT_LABEL = {
	'app.launched': 'settings.analytics.event.app.launched',
	'screen.viewed': 'settings.analytics.event.screen.viewed',
	'feature.used': 'settings.analytics.event.feature.used',
	'experience.tier': 'settings.analytics.event.experience.tier',
	'cloud.capability': 'settings.analytics.event.cloud.capability',
	'error.observed': 'settings.analytics.event.error.observed',
} as const satisfies Record<(typeof PRODUCT_ANALYTICS_EVENT_NAMES)[number], MessageKey>;

function Note({ title, body }: { title: string; body: string }) {
	return (
		<div style={{ marginTop: 10 }}>
			<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>{title}</div>
			<div style={{ font: `12px/1.6 ${T.sans}`, color: T.sub, marginTop: 2 }}>{body}</div>
		</div>
	);
}

export function ProductAnalyticsPanel() {
	const { t } = useI18n();
	const available = isTelemetryConfigured();
	const [on, setOn] = useState(() => telemetryEnabled());

	const toggle = () => {
		const next = !on;
		setTelemetryConsent(next ? 'granted' : 'denied');
		setOn(next);
		Toaster.success(t(next ? 'settings.analytics.enabled' : 'settings.analytics.disabled'));
	};

	return (
		<Panel
			title={t('settings.analytics.title')}
			action={
				<Badge status={!available ? 'neutral' : on ? 'info' : 'success'}>
					{t(
						!available
							? 'settings.analytics.badgeUnavailable'
							: on
								? 'settings.analytics.badgeOn'
								: 'settings.analytics.badgeOff',
					)}
				</Badge>
			}
		>
			<SetRow
				label={t('settings.analytics.row')}
				help={t(
					!available
						? 'settings.analytics.helpUnavailable'
						: on
							? 'settings.analytics.helpOn'
							: 'settings.analytics.help',
				)}
				control={
					<Switch
						checked={on}
						disabled={!available}
						aria-label={t('settings.analytics.row')}
						onChange={toggle}
					/>
				}
			/>
			<Note title={t('settings.analytics.whatTitle')} body={t('settings.analytics.whatBody')} />
			<div style={{ marginTop: 10 }}>
				<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>
					{t('settings.analytics.eventsTitle')}
				</div>
				<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
					{PRODUCT_ANALYTICS_EVENT_NAMES.map((name) => (
						<li key={name} style={{ font: `12px/1.7 ${T.sans}`, color: T.sub }}>
							{t(EVENT_LABEL[name])}
						</li>
					))}
				</ul>
			</div>
			<Note title={t('settings.analytics.neverTitle')} body={t('settings.analytics.neverBody')} />
		</Panel>
	);
}
