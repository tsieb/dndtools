import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, ProgressMeter, Stat } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import {
	getDesktopUpdatesBridge,
	type DesktopUpdateState,
	type DesktopUpdateStatus,
} from '../../platform/desktopUpdates';

/* ---- Settings › About › App updates (RC-PLT-1.2). The desktop shell owns the whole update
 * decision: this screen can ask it to check, to download, and to restart, and renders whatever
 * state comes back. Nothing here fakes progress or claims success the main process did not report,
 * and on web/Android the panel is simply absent rather than offering a dead control. */

const STATUS_TONE: Record<
	DesktopUpdateStatus,
	'success' | 'warning' | 'error' | 'info' | 'neutral'
> = {
	unsupported: 'neutral',
	idle: 'neutral',
	checking: 'info',
	available: 'info',
	downloading: 'info',
	downloaded: 'success',
	'up-to-date': 'success',
	error: 'error',
};

const STATUS_LABEL: Record<DesktopUpdateStatus, MessageKey> = {
	unsupported: 'settings.updates.status.unsupported',
	idle: 'settings.updates.status.idle',
	checking: 'settings.updates.status.checking',
	available: 'settings.updates.status.available',
	downloading: 'settings.updates.status.downloading',
	downloaded: 'settings.updates.status.downloaded',
	'up-to-date': 'settings.updates.status.upToDate',
	error: 'settings.updates.status.error',
};

export function AppUpdatesPanel() {
	const { t, formatDate } = useI18n();
	const bridge = getDesktopUpdatesBridge();
	const [state, setState] = useState<DesktopUpdateState | null>(null);

	useEffect(() => {
		if (!bridge) return;
		let cancelled = false;
		void bridge
			.state()
			.then((next) => {
				if (!cancelled) setState(next);
			})
			.catch(() => undefined);
		const off = bridge.onState((next) => {
			if (!cancelled) setState(next);
		});
		return () => {
			cancelled = true;
			off();
		};
	}, [bridge]);

	const run = useCallback(
		(action: () => Promise<DesktopUpdateState>) => () => {
			void action()
				.then(setState)
				.catch(() => undefined);
		},
		[],
	);

	if (!bridge || !state) return null;

	const busy = state.status === 'checking' || state.status === 'downloading';
	const version = state.availableVersion ?? state.currentVersion;

	const body: string = (() => {
		if (state.status === 'error' && state.message) return state.message;
		if (state.status === 'unsupported')
			return state.message ?? t('settings.updates.unsupportedBody');
		if (state.status === 'up-to-date')
			return t('settings.updates.upToDateBody', { version: state.currentVersion });
		if (state.status === 'available') return t('settings.updates.availableBody', { version });
		if (state.status === 'downloaded') return t('settings.updates.downloadedBody', { version });
		return t('settings.updates.body');
	})();

	return (
		<Panel
			title={t('settings.updates.title')}
			action={
				<Badge status={STATUS_TONE[state.status]}>
					{state.status === 'downloading'
						? t('settings.updates.status.downloading', { percent: state.percent })
						: t(STATUS_LABEL[state.status])}
				</Badge>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
						gap: 12,
					}}
				>
					<Stat label={t('settings.updates.installedVersion')} value={state.currentVersion} />
					{state.availableVersion ? (
						<Stat label={t('settings.updates.latestVersion')} value={state.availableVersion} />
					) : null}
					<Stat
						label={t('settings.updates.lastChecked')}
						value={
							state.checkedAt
								? formatDate(new Date(state.checkedAt), {
										dateStyle: 'medium',
										timeStyle: 'short',
									})
								: t('settings.updates.neverChecked')
						}
					/>
				</div>

				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>{body}</div>

				{state.status === 'downloading' ? (
					<ProgressMeter
						value={state.percent}
						max={100}
						label={t('settings.updates.status.downloading', { percent: state.percent })}
						valueLabel={`${state.percent}%`}
					/>
				) : null}

				{state.releaseNotes && state.availableVersion ? (
					<div>
						<div style={{ font: `600 12.5px/1.5 ${T.sans}`, marginBottom: 4 }}>
							{t('settings.updates.releaseNotes', { version: state.availableVersion })}
						</div>
						<div
							style={{
								font: `12.5px/1.6 ${T.sans}`,
								color: T.sub,
								whiteSpace: 'pre-wrap',
								maxHeight: 200,
								overflowY: 'auto',
							}}
						>
							{state.releaseNotes}
						</div>
					</div>
				) : null}

				{state.status !== 'unsupported' ? (
					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
						<Button
							variant="secondary"
							size="sm"
							icon="retry"
							disabled={busy}
							onClick={run(() => bridge.check())}
						>
							{t('settings.updates.check')}
						</Button>
						{state.status === 'available' ? (
							<Button
								variant="primary"
								size="sm"
								icon="download"
								onClick={run(() => bridge.download())}
							>
								{t('settings.updates.download')}
							</Button>
						) : null}
						{state.status === 'downloaded' ? (
							<Button variant="primary" size="sm" onClick={run(() => bridge.install())}>
								{t('settings.updates.restart')}
							</Button>
						) : null}
					</div>
				) : null}
			</div>
		</Panel>
	);
}
