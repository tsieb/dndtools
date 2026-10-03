import { useEffect, useState } from 'react';
import { Button, Dialog, EmptyState, Icon, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useAuth } from '../../cloud/AuthContext';
import { listDevices, revokeAllSessions, revokeDevice, type Device } from '../../cloud/appApi';
import { CloudOfflineNotice, useCloudActions } from '../../cloud/offline';
import { errMsg } from './shared';
/* ---- Account devices (REAL app-api — the remembered sign-ins and the global sign-out) ------------ */
/** The user agent is turned into something a person recognizes. Browser names are brands and stay
 * as they are; the device words around them are copy, so they come out of the catalog. */
function friendlyDeviceName(
	raw: string,
	t: (key: MessageKey, values?: Record<string, string>) => string,
): string {
	const value = raw.trim();
	if (!value) return t('settings.devices.unnamed');
	const platformKey: MessageKey | null = /iPhone|iPad/i.test(value)
		? 'settings.devices.platform.apple'
		: /Android/i.test(value)
			? 'settings.devices.platform.android'
			: /Windows/i.test(value)
				? 'settings.devices.platform.windows'
				: /Macintosh|Mac OS/i.test(value)
					? 'settings.devices.platform.mac'
					: /Linux/i.test(value)
						? 'settings.devices.platform.linux'
						: null;
	const platform = platformKey ? t(platformKey) : null;
	const browser = /Edg\//.test(value)
		? 'Edge'
		: /Firefox\//.test(value)
			? 'Firefox'
			: /Chrome\//.test(value)
				? 'Chrome'
				: /Safari\//.test(value)
					? 'Safari'
					: null;
	if (browser && platform) return t('settings.devices.browserOnPlatform', { browser, platform });
	if (platform) return platform;
	return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

/** Devices remembered by Cognito, plus the separate global sign-out action. */
export function AccountDevicesPanel() {
	const { t, formatDate } = useI18n();
	const auth = useAuth();
	const [devices, setDevices] = useState<Device[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	// Both revocations are server-side and irreversible (no undo exists), so each one goes through
	// an honest confirm dialog instead of firing straight off its button.
	const [pendingRevoke, setPendingRevoke] = useState<Device | null>(null);
	const [signOutOpen, setSignOutOpen] = useState(false);
	const load = () => {
		listDevices()
			.then(setDevices)
			.catch(() => setFailed(true));
	};
	useEffect(load, []);
	// Listing, forgetting and the global sign-out are all app-api round trips.
	const cloudActions = useCloudActions('cloud.offline.devices');
	const revoke = (deviceKey: string) => {
		setBusy(true);
		revokeDevice(deviceKey)
			.then(() => {
				setDevices((list) => (list ? list.filter((d) => d.deviceKey !== deviceKey) : list));
				setPendingRevoke(null);
				Toaster.success(t('settings.devices.forgotten'));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.devices.forgetFailed'))))
			.finally(() => setBusy(false));
	};
	const signOutEverywhere = () => {
		setBusy(true);
		revokeAllSessions()
			.then(async () => {
				setSignOutOpen(false);
				Toaster.success(t('settings.devices.signedOutEverywhere'));
				await auth.signOut(); // the global revoke killed this session's refresh token too
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.devices.signOutFailed'))))
			.finally(() => setBusy(false));
	};
	// The device name is emphasised mid-sentence, so format the whole sentence and split it around
	// that value rather than freezing English word order into two fragments.
	const pendingName = friendlyDeviceName(pendingRevoke?.name ?? '', t);
	const forgetSentence = t('settings.devices.forgetBody', { device: pendingName });
	const [forgetBefore, forgetAfter = ''] = forgetSentence.split(pendingName);
	return (
		<Panel
			title={t('settings.devices.title')}
			action={
				<Button
					variant="ghost"
					size="sm"
					icon="close"
					disabled={busy}
					{...cloudActions.offlineProps}
					onClick={() => setSignOutOpen(true)}
				>
					{t('settings.devices.signOutEverywhere')}
				</Button>
			}
		>
			<div
				style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub, marginBottom: T.space.one }}
			>
				{t('settings.devices.intro')}
			</div>
			<CloudOfflineNotice />
			{failed ? (
				// Was dead text telling the user to reopen the tab; `load` is right here.
				<EmptyState
					inset
					illustration="connection-lost"
					title={t('settings.devices.loadFailed')}
					action={
						<Button
							variant="secondary"
							size="sm"
							icon="retry"
							{...cloudActions.offlineProps}
							onClick={() => {
								setFailed(false);
								load();
							}}
						>
							{t('common.action.retry')}
						</Button>
					}
				/>
			) : devices === null ? (
				<LoadingRegion
					label={t('settings.devices.loading')}
					style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
				>
					<Skeleton height={46} />
					<Skeleton height={46} />
				</LoadingRegion>
			) : devices.length === 0 ? (
				<EmptyState
					inset
					icon="Monitor"
					title={t('settings.devices.emptyTitle')}
					description={t('settings.devices.emptyBody')}
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{devices.map((d, i) => (
						<div
							key={d.deviceKey}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: T.space.three,
								padding: `${T.space.three} ${T.space.zero}`,
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<span
								style={{
									width: 34,
									height: 34,
									borderRadius: T.radius.md,
									flex: '0 0 auto',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: T.alt,
									color: T.sub,
								}}
							>
								<Icon name="Monitor" size="sm" />
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
									{friendlyDeviceName(d.name, t)}
								</div>
								<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
									{d.lastSeen
										? t('settings.devices.lastSeen', {
												when: formatDate(new Date(d.lastSeen), {
													dateStyle: 'medium',
													timeStyle: 'short',
												}),
											})
										: t('settings.devices.lastSeenUnknown')}
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={busy}
								{...cloudActions.offlineProps}
								onClick={() => setPendingRevoke(d)}
							>
								{t('settings.devices.forget')}
							</Button>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title={t('settings.devices.forgetTitle')}
				description={t('settings.devices.forgetDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setPendingRevoke(null)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={busy}
							{...cloudActions.offlineProps}
							onClick={() => pendingRevoke && revoke(pendingRevoke.deviceKey)}
						>
							{busy ? t('settings.devices.forgetting') : t('settings.devices.forgetDevice')}
						</Button>
					</>
				}
			>
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{forgetBefore}
					<strong style={{ color: T.ink }}>{pendingName}</strong>
					{forgetAfter}
				</div>
			</Dialog>
			<Dialog
				open={signOutOpen}
				onClose={() => setSignOutOpen(false)}
				title={t('settings.devices.signOutTitle')}
				description={t('settings.devices.signOutDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setSignOutOpen(false)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={busy}
							{...cloudActions.offlineProps}
							onClick={signOutEverywhere}
						>
							{busy ? t('settings.devices.signingOut') : t('settings.devices.signOutEverywhere')}
						</Button>
					</>
				}
			>
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{t('settings.devices.signOutBody')}
				</div>
			</Dialog>
		</Panel>
	);
}
