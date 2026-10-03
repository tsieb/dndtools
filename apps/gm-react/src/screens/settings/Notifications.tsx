import { useEffect, useState } from 'react';
import { Switch } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { pushClient, pushDeliveryAvailable } from '../../cloud/push';

const BODY = { margin: T.space.zero, font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub } as const;

export function SettingsNotifications() {
	const { t, formatDate } = useI18n();
	const [, render] = useState(0);
	const [error, setError] = useState(false);
	useEffect(() => pushClient.subscribe(() => render((value) => value + 1)), []);
	const queued = pushClient.queued();
	return (
		<Panel title={t('settings.push.title')}>
			{!pushDeliveryAvailable && <p style={BODY}>{t('settings.push.unavailable')}</p>}
			<SetRow
				label={t('settings.push.previews')}
				help={t('settings.push.help')}
				control={
					<Switch
						label={t('settings.push.optIn')}
						checked={pushClient.optedIn()}
						onChange={(enabled: boolean) => {
							try {
								pushClient.setConsent(enabled);
								setError(false);
							} catch {
								setError(true);
								render((value) => value + 1);
							}
						}}
					/>
				}
			/>
			{error && (
				<p role="alert" style={{ ...BODY, color: T.err }}>
					{t('settings.push.saveFailed')}
				</p>
			)}
			<div role="status" style={{ ...BODY, color: T.ink }}>
				{t('settings.push.queued', { count: queued.length })}
			</div>
			<ul
				aria-label={t('settings.push.queueLabel')}
				style={{ ...BODY, margin: T.space.zero, paddingLeft: T.space.five }}
			>
				{queued.map((reminder) => (
					<li key={reminder.id}>
						{t('settings.push.reminder', {
							body: reminder.body,
							time: formatDate(new Date(reminder.dueAt), {
								dateStyle: 'medium',
								timeStyle: 'short',
							}),
						})}
					</li>
				))}
			</ul>
		</Panel>
	);
}
