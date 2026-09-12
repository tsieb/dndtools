import { useEffect, useState } from 'react';
import { Switch } from '../../ds';
import { Panel, SetRow } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { pushClient, pushDeliveryAvailable } from '../../cloud/push';

export function SettingsNotifications() {
	const { t } = useI18n();
	const [, render] = useState(0);
	const [error, setError] = useState(false);
	useEffect(() => pushClient.subscribe(() => render((value) => value + 1)), []);
	const queued = pushClient.queued();
	return (
		<Panel title={t('settings.push.title')}>
			{!pushDeliveryAvailable && <p>{t('settings.push.unavailable')}</p>}
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
			{error && <p role="alert">{t('settings.push.saveFailed')}</p>}
			<div role="status">{t('settings.push.queued', { count: queued.length })}</div>
			<ul aria-label={t('settings.push.queueLabel')}>
				{queued.map((reminder) => (
					<li key={reminder.id}>
						{t('settings.push.reminder', {
							body: reminder.body,
							time: new Date(reminder.dueAt).toISOString(),
						})}
					</li>
				))}
			</ul>
		</Panel>
	);
}
