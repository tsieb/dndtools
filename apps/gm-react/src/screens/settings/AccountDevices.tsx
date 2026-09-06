import { useEffect, useState } from 'react';
import { Button, Dialog, EmptyState, Icon, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useAuth } from '../../cloud/AuthContext';
import { listDevices, revokeAllSessions, revokeDevice, type Device } from '../../cloud/appApi';
import { errMsg } from './shared';
/* ---- Account devices (REAL app-api — the remembered sign-ins and the global sign-out) ------------ */
function friendlyDeviceName(raw: string): string {
	const value = raw.trim();
	if (!value) return 'Remembered device';
	const platform = /iPhone|iPad/i.test(value)
		? 'iPhone or iPad'
		: /Android/i.test(value)
			? 'Android device'
			: /Windows/i.test(value)
				? 'Windows PC'
				: /Macintosh|Mac OS/i.test(value)
					? 'Mac'
					: /Linux/i.test(value)
						? 'Linux device'
						: null;
	const browser = /Edg\//.test(value)
		? 'Edge'
		: /Firefox\//.test(value)
			? 'Firefox'
			: /Chrome\//.test(value)
				? 'Chrome'
				: /Safari\//.test(value)
					? 'Safari'
					: null;
	if (browser && platform) return `${browser} on ${platform}`;
	if (platform) return platform;
	return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

/** Devices remembered by Cognito, plus the separate global sign-out action. */
export function AccountDevicesPanel() {
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
	const revoke = (deviceKey: string) => {
		setBusy(true);
		revokeDevice(deviceKey)
			.then(() => {
				setDevices((list) => (list ? list.filter((d) => d.deviceKey !== deviceKey) : list));
				setPendingRevoke(null);
				Toaster.success(
					'Device forgotten. A session already open there may continue until it expires.',
				);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not forget that device.')))
			.finally(() => setBusy(false));
	};
	const signOutEverywhere = () => {
		setBusy(true);
		revokeAllSessions()
			.then(async () => {
				setSignOutOpen(false);
				Toaster.success(
					'Sign-out requested everywhere. Open sessions may continue until they expire.',
				);
				await auth.signOut(); // the global revoke killed this session's refresh token too
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not sign out everywhere.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel
			title="Remembered devices"
			action={
				<Button
					variant="ghost"
					size="sm"
					icon="close"
					disabled={busy}
					onClick={() => setSignOutOpen(true)}
				>
					Sign out everywhere
				</Button>
			}
		>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
				Devices this account recognizes after sign-in. Forgetting one does not erase its local data
				or immediately close a session already open there. “Sign out everywhere” prevents those
				sessions from renewing.
			</div>
			{failed ? (
				// Was dead text telling the user to reopen the tab; `load` is right here.
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Couldn’t load your devices.
					</span>
					<Button
						variant="secondary"
						size="sm"
						icon="retry"
						onClick={() => {
							setFailed(false);
							load();
						}}
					>
						Retry
					</Button>
				</div>
			) : devices === null ? (
				<LoadingRegion
					label="Loading devices"
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					<Skeleton height={46} />
					<Skeleton height={46} />
				</LoadingRegion>
			) : devices.length === 0 ? (
				<EmptyState
					inset
					icon="Monitor"
					title="No remembered devices yet"
					description="Devices appear here after they sign in."
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{devices.map((d, i) => (
						<div
							key={d.deviceKey}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 12,
								padding: '11px 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<span
								style={{
									width: 34,
									height: 34,
									borderRadius: 8,
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
								<div style={{ font: `600 13px ${T.sans}` }}>{friendlyDeviceName(d.name)}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{d.lastSeen
										? `Last seen ${new Date(d.lastSeen).toLocaleString()}`
										: 'Last seen: unknown'}
								</div>
							</div>
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingRevoke(d)}>
								Forget
							</Button>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title="Forget this device?"
				description="Remove it from your account’s remembered-device list."
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
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={busy}
							onClick={() => pendingRevoke && revoke(pendingRevoke.deviceKey)}
						>
							{busy ? 'Forgetting…' : 'Forget device'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{friendlyDeviceName(pendingRevoke?.name ?? '')}</strong>{' '}
					will no longer be recognized as a remembered device. Nothing on it is erased, and its
					current session may remain open until it expires; use “Sign out everywhere” to prevent
					account sessions from renewing.
				</div>
			</Dialog>
			<Dialog
				open={signOutOpen}
				onClose={() => setSignOutOpen(false)}
				title="Sign out everywhere?"
				description="Stop future token refresh on every device, including this one."
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
							Cancel
						</Button>
						<Button variant="danger" size="sm" disabled={busy} onClick={signOutEverywhere}>
							{busy ? 'Signing out…' : 'Sign out everywhere'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This device signs out now. Other devices cannot refresh their sessions, but access tokens
					already issued to them can remain valid until they expire (normally within an hour).
				</div>
			</Dialog>
		</Panel>
	);
}
