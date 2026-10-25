import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, Menu } from '../ds';
import { T } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { CloudOfflineNotice, useCloudActions } from '../cloud/offline';
import { useSession } from './SessionContext';
import { useI18n } from '../i18n';
import { useVocabulary } from '../i18n/vocabulary';
import { isDemoLocalVault } from '../platform/storage/coreStore';
import { MAX_CONNECTION_CODE_CHARS } from './signaling';
import { MAX_ONLINE_JOIN_CODE_CHARS, encodeJoinCode } from './cloudCrypto';
import { connectionState, rosterPresence } from './sessionStatus';

// The host dialog (invitation, QR code, peer roster) is only fetched when the DM opens it.
const HostModal = lazy(() => import('./HostModal').then((m) => ({ default: m.HostModal })));
import {
	btn,
	ConnectionBanner,
	CopyField,
	fieldStyle,
	Modal,
	PresenceTag,
	InviteScanner,
	TONE,
} from './SessionPanelParts';
import { usePlatformCapabilities } from '../platform/capabilities';

// --- Shell table controls (topbar) ---------------------------------------------------------------

/**
 * RC-ENG-15.2 — how a table control lays itself out. `inline` is the wide top bar's labelled chip,
 * `row` a full-width named row in the Table controls sheet, and `icon` the bare 44px glyph (kept for
 * callers outside the shell; the shell no longer shows an unlabelled table control).
 */
export type TableControlLayout = 'inline' | 'row' | 'icon';

/** The sizing shared by the shell's table controls, per layout. */
export function tableControlBox(layout: TableControlLayout): CSSProperties {
	if (layout === 'icon') return { gap: 0, width: 44, height: 44, padding: 0 };
	if (layout === 'row')
		return {
			gap: 10,
			width: '100%',
			minHeight: 'var(--touch-target-min)',
			padding: '10px 14px',
			justifyContent: 'flex-start',
			textAlign: 'left',
		};
	return { gap: 7, padding: '6px 11px' };
}

// --- Account control (topbar) ----------------------------------------------------------------------

export function AccountButton({
	compact = false,
	layout = compact ? 'icon' : 'inline',
}: { compact?: boolean; layout?: TableControlLayout } = {}) {
	const auth = useAuth();
	const { t } = useI18n();
	const navigate = useNavigate();
	const signIn = useCloudActions('cloud.offline.signIn');
	const [open, setOpen] = useState(false);
	// Where a portaled menu hangs, fixed under the trigger's right edge; null keeps it in place.
	const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	if (!auth.isConfigured) return null; // local-first: hidden when cloud isn't configured
	const signedIn = auth.status === 'signed-in';
	const email = auth.user?.email ?? '';
	const name = signedIn
		? t('shell.account.signedInName', { email })
		: t('shell.account.signInName');
	// Only signing IN needs the network; signing out forgets this device's session either way.
	const gate = signedIn ? null : signIn;
	// The visible label is "Account" in both states, so a signed-in click no longer signs out on the
	// spot: it opens the account menu (settings, sign out). Signed out, it opens sign-in directly.
	function toggle() {
		if (!signedIn) {
			if (!signIn.blocked) auth.openAuthModal();
			return;
		}
		if (open) {
			setOpen(false);
			return;
		}
		// The top bar's backdrop blur is a stacking context (see ViewAsControl): outside a dialog the
		// menu is portaled to <body> and fixed under the trigger; inside the sheet it stays in place.
		const trigger = triggerRef.current;
		const rect = trigger?.getBoundingClientRect();
		setAnchor(
			trigger && rect && !trigger.closest('[role="dialog"]')
				? { top: rect.bottom + 6, right: document.documentElement.clientWidth - rect.right }
				: null,
		);
		setOpen(true);
	}
	function close() {
		setOpen(false);
		triggerRef.current?.focus();
	}
	const menu = open && (
		<Menu
			triggerRef={triggerRef}
			title={t('shell.account.label')}
			onClose={close}
			width={260}
			style={
				anchor
					? { position: 'fixed', top: anchor.top, right: anchor.right, zIndex: T.z.dropdown }
					: {
							position: 'absolute',
							top: '100%',
							right: 0,
							marginTop: T.space.one,
							zIndex: T.z.dropdown,
						}
			}
		>
			<p style={{ margin: '0 0 6px', font: `12px ${T.sans}`, color: T.sub }}>
				{t('shell.account.signedInAs', { email })}
			</p>
			<Button
				role="menuitem"
				variant="ghost"
				size="sm"
				icon="settings-gear"
				onClick={() => {
					setOpen(false);
					navigate('/settings?tab=account');
				}}
				style={{ width: '100%', justifyContent: 'flex-start' }}
			>
				{t('shell.account.settings')}
			</Button>
			<Button
				role="menuitem"
				variant="ghost"
				size="sm"
				icon="enter"
				onClick={() => {
					setOpen(false);
					void auth.signOut();
				}}
				style={{ width: '100%', justifyContent: 'flex-start' }}
			>
				{t('shell.account.signOut')}
			</Button>
		</Menu>
	);
	return (
		<div
			style={{
				position: 'relative',
				flex: '0 0 auto',
				width: layout === 'row' ? '100%' : undefined,
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				aria-label={name}
				title={name}
				aria-haspopup={signedIn ? 'menu' : 'dialog'}
				aria-expanded={signedIn ? open : undefined}
				{...gate?.offlineProps}
				onClick={toggle}
				style={{
					...gate?.offlineStyle,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					...tableControlBox(layout),
					borderRadius: 8,
					cursor: 'pointer',
					font: `600 12px ${T.sans}`,
					border: `1px solid ${signedIn ? 'var(--color-status-success-border)' : T.bd}`,
					background: signedIn ? 'var(--color-status-success-subtle)' : 'transparent',
					color: signedIn ? 'var(--color-status-success-text)' : T.sub,
				}}
			>
				<Icon name="characters-person" size={15} />
				{layout !== 'icon' && t('shell.account.label')}
			</button>
			{menu && (anchor ? createPortal(menu, document.body) : menu)}
		</div>
	);
}

// --- DM host control -------------------------------------------------------------------------------

export function HostSessionButton({
	compact = false,
	layout = compact ? 'icon' : 'inline',
}: { compact?: boolean; layout?: TableControlLayout } = {}) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const session = useSession();
	const active = session.role === 'host';
	const pending = session.pendingJoins.length;
	const connected = session.peers.filter((p) => p.connected).length;
	// One visible name, "Host table", in every state; the count rides behind it and the accessible
	// name spells the state out, so the visible label is always a prefix of the name (WCAG 2.5.3).
	const hostLabel =
		pending > 0
			? t('shell.host.waitingName', { count: pending })
			: active
				? t('shell.host.hostingName', { count: connected })
				: t('shell.host.label');
	const visible =
		pending > 0
			? t('shell.host.waiting', { count: pending })
			: active
				? t('shell.host.count', { count: connected })
				: t('shell.host.label');
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={hostLabel}
				aria-haspopup="dialog"
				title={hostLabel}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					...tableControlBox(layout),
					borderRadius: 8,
					cursor: 'pointer',
					font: `600 12px ${T.sans}`,
					border: `1px solid ${pending > 0 ? T.warn : active ? 'var(--color-status-success-border)' : T.bd}`,
					background:
						pending > 0
							? 'var(--color-status-warning-subtle)'
							: active
								? 'var(--color-status-success-subtle)'
								: 'transparent',
					color:
						pending > 0
							? 'var(--color-status-warning-text)'
							: active
								? 'var(--color-status-success-text)'
								: T.sub,
					flex: '0 0 auto',
				}}
			>
				<Icon name="players" size={15} />
				{layout !== 'icon' && visible}
			</button>
			{open && (
				<Suspense fallback={null}>
					<HostModal onClose={() => setOpen(false)} />
				</Suspense>
			)}
		</>
	);
}

// --- Player join control ---------------------------------------------------------------------------

export function JoinSessionButton({ onOpen }: { onOpen?: () => void } = {}) {
	const [open, setOpen] = useState(false);
	const session = useSession();
	const status = session.client?.status ?? 'idle';
	const joined = session.role === 'joined' && status === 'live';
	// The control carries the link's real state, so a player who has been dropped or is riding out a
	// wobble learns it from the closed panel rather than from silence.
	const unsteady = session.role === 'joined' && (status === 'reconnecting' || status === 'closed');
	const label = joined ? 'Connected' : unsteady ? connectionState(status).label : 'Join a table';
	const tone = joined ? TONE.ok : unsteady ? TONE[connectionState(status).tone] : null;
	return (
		<>
			<button
				type="button"
				onClick={() => (onOpen ? onOpen() : setOpen(true))}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 7,
					padding: '7px 12px',
					borderRadius: 9,
					cursor: 'pointer',
					font: `600 12.5px ${T.sans}`,
					border: `1px solid ${tone ? tone.border : T.accBd}`,
					background: tone ? tone.subtle : T.accSub,
					color: tone ? tone.text : T.acc,
				}}
			>
				<Icon name={joined ? 'check' : unsteady ? 'warning' : 'players'} size={15} />
				{label}
			</button>
			{open && <JoinModal onClose={() => setOpen(false)} />}
		</>
	);
}

export function JoinModal({ onClose }: { onClose: () => void }) {
	const { gm } = useVocabulary();
	const { t } = useI18n();
	const capabilities = usePlatformCapabilities();
	const session = useSession();
	const [offer, setOffer] = useState('');
	const [onlineCode, setOnlineCode] = useState('');
	const [answerCode, setAnswerCode] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [connectingOnline, setConnectingOnline] = useState(false);
	const [connectingNearby, setConnectingNearby] = useState(false);
	const [dictated, setDictated] = useState(false);
	const [room, setRoom] = useState('');
	const [pin, setPin] = useState('');
	// RC-PLT-2.4 — the join code and room/PIN routes go through the internet relay; the nearby and
	// pasted-connection-code routes below do not, so they stay live.
	const onlinePlay = useCloudActions('cloud.offline.onlinePlay');
	const status = session.client?.status ?? 'idle';
	const visibleError = error ?? session.client?.error;
	const roster = session.client?.presence ?? [];

	const connectOnline = async (joinCode: string) => {
		if (onlinePlay.blocked) return;
		setError(null);
		setConnectingOnline(true);
		try {
			await session.connectOnlineByCode(joinCode);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not connect with that join code.');
		} finally {
			setConnectingOnline(false);
		}
	};
	const connectOnlineNow = () => connectOnline(onlineCode.trim());
	// The dictated path rebuilds the SAME one-string join code from the two halves the DM read out,
	// so it goes through exactly one join route. A mistyped half fails here rather than on the wire.
	const connectDictated = async () => {
		if (onlinePlay.blocked) return;
		let joinCode: string;
		try {
			joinCode = encodeJoinCode(room.trim(), pin.trim());
		} catch {
			setError('That room or PIN is not in the right shape — check both with your DM.');
			return;
		}
		await connectOnline(joinCode);
	};

	// Electron LAN auto-discovery: browse for tables while the modal is open.
	// Depend on the (stable) callbacks, not the whole session object, whose identity
	// churns on every cloud-session update and would restart mDNS browse each tick.
	const { discoveryAvailable, browseTables, stopBrowseTables } = session;
	useEffect(() => {
		if (!discoveryAvailable) return;
		browseTables();
		return () => stopBrowseTables();
	}, [discoveryAvailable, browseTables, stopBrowseTables]);

	const join = async () => {
		setError(null);
		try {
			const { answerCode: code } = await session.join(offer.trim());
			setAnswerCode(code);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not join with that code.');
		}
	};
	const connectTo = async (serviceIndex: number) => {
		setError(null);
		setConnectingNearby(true);
		try {
			await session.connectDiscovered(session.discovered[serviceIndex]!);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not connect to that table.');
		} finally {
			setConnectingNearby(false);
		}
	};

	// RC-UX-3.7 — the demo vault never joins a table; say so instead of offering dead controls.
	if (isDemoLocalVault()) {
		return (
			<Modal title="Join a table" onClose={onClose}>
				<p role="status" style={{ margin: 0, font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
					{t('vaults.demoNoTable')}
				</p>
			</Modal>
		);
	}

	return (
		<Modal title="Join a table" onClose={onClose}>
			<ConnectionBanner status={status} />
			{status === 'live' ? (
				<div>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						You are at the table as{' '}
						<strong style={{ color: T.ink }}>
							{session.client?.identity?.displayName ?? 'a player'}
						</strong>
						. The table’s live view is below.
					</div>
					<div style={{ marginTop: 14 }}>
						<span
							style={{
								font: `600 11px ${T.sans}`,
								color: T.ter,
								textTransform: 'uppercase',
								letterSpacing: '.04em',
							}}
						>
							Who else is here
						</span>
						{roster.length === 0 ? (
							<div style={{ marginTop: 6, font: `12px ${T.sans}`, color: T.ter }}>
								The DM has not shared a roster for this table.
							</div>
						) : (
							<div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
								{roster.map((entry) => {
									const reading = rosterPresence(entry);
									return (
										<div
											key={entry.actorId}
											data-testid="session-roster-entry"
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 10,
												flexWrap: 'wrap',
												padding: '7px 11px',
												borderRadius: 9,
												border: `1px solid ${T.bd}`,
												background: T.surf,
											}}
										>
											<span
												style={{ flex: 1, minWidth: 120, font: `12.5px ${T.sans}`, color: T.ink }}
											>
												{entry.displayName}
											</span>
											<PresenceTag reading={reading} />
										</div>
									);
								})}
							</div>
						)}
					</div>
					<div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
						<button
							type="button"
							style={btn()}
							onClick={() => {
								session.leave();
								onClose();
							}}
						>
							Leave table
						</button>
					</div>
				</div>
			) : (
				<>
					{session.cloudAvailable && (
						<div style={{ marginBottom: 14 }}>
							<span
								style={{
									font: `600 11px ${T.sans}`,
									color: T.ter,
									textTransform: 'uppercase',
									letterSpacing: '.04em',
								}}
							>
								Join online with a code
							</span>
							<p style={{ margin: '5px 0 6px', font: `12px/1.5 ${T.sans}`, color: T.sub }}>
								Paste the online join code your DM sent you. It connects you to their table over the
								internet after the DM approves your request and chooses your participant.
							</p>
							{onlinePlay.offline && (
								<div style={{ marginBottom: 6 }}>
									<CloudOfflineNotice body="cloud.offline.playNotice" />
								</div>
							)}
							<textarea
								// The section heading above is a <span>, not a <label htmlFor>, so this field
								// had no accessible name — and a placeholder is not a name (it also vanishes
								// as soon as the player pastes into it).
								aria-label="Online join code"
								maxLength={MAX_ONLINE_JOIN_CODE_CHARS}
								value={onlineCode}
								onChange={(e) => setOnlineCode(e.target.value)}
								rows={2}
								placeholder="Paste the online join code…"
								style={fieldStyle}
							/>
							<button
								type="button"
								style={{ ...btn(true), marginTop: 8, ...onlinePlay.offlineStyle }}
								{...onlinePlay.offlineProps}
								onClick={() => void connectOnlineNow()}
								disabled={!onlineCode.trim() || connectingOnline || status === 'connecting'}
							>
								<Icon name="players" size={14} />
								{connectingOnline ? 'Connecting…' : 'Join online'}
							</button>
							<div style={{ marginTop: 10 }}>
								<button
									type="button"
									aria-expanded={dictated}
									onClick={() => setDictated((open) => !open)}
									style={{
										border: 'none',
										background: 'transparent',
										padding: 0,
										cursor: 'pointer',
										font: `600 11.5px ${T.sans}`,
										color: T.acc,
									}}
								>
									Type the room and PIN instead
								</button>
								{dictated && (
									<div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
										<label style={{ display: 'block' }}>
											<span style={{ display: 'block', font: `600 11px ${T.sans}`, color: T.ter }}>
												Room
											</span>
											<input
												value={room}
												onChange={(e) => setRoom(e.target.value)}
												placeholder="sess-…"
												style={{ ...fieldStyle, marginTop: 4 }}
											/>
										</label>
										<label style={{ display: 'block' }}>
											<span style={{ display: 'block', font: `600 11px ${T.sans}`, color: T.ter }}>
												PIN
											</span>
											<input
												value={pin}
												onChange={(e) => setPin(e.target.value)}
												style={{ ...fieldStyle, marginTop: 4 }}
											/>
										</label>
										<button
											type="button"
											style={{ ...btn(), alignSelf: 'flex-start', ...onlinePlay.offlineStyle }}
											{...onlinePlay.offlineProps}
											onClick={() => void connectDictated()}
											disabled={!room.trim() || !pin.trim() || connectingOnline}
										>
											<Icon name="players" size={14} />
											Join with room and PIN
										</button>
									</div>
								)}
							</div>
							<div style={{ marginTop: 12, height: 1, background: T.bd }} />
						</div>
					)}
					{session.discoveryAvailable && (
						<div style={{ marginBottom: 14 }}>
							<span
								style={{
									font: `600 11px ${T.sans}`,
									color: T.ter,
									textTransform: 'uppercase',
									letterSpacing: '.04em',
								}}
							>
								Tables on your network
							</span>
							{session.discovered.length === 0 ? (
								<div style={{ marginTop: 6, font: `12px ${T.sans}`, color: T.ter }}>
									Searching for tables nearby…
								</div>
							) : (
								<div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
									{session.discovered.map((s, i) => (
										<button
											key={s.sessionId}
											type="button"
											disabled={connectingNearby}
											onClick={() => void connectTo(i)}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 10,
												padding: '9px 12px',
												borderRadius: 9,
												cursor: connectingNearby ? 'wait' : 'pointer',
												border: `1px solid ${T.accBd}`,
												background: T.accSub,
												textAlign: 'left',
												opacity: connectingNearby ? 0.7 : 1,
											}}
										>
											<Icon name="players" size={15} color={T.acc} />
											<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.ink }}>
												{s.name}
												<span style={{ color: T.ter }}> · {s.host}</span>
											</span>
											<span style={{ font: `11px ${T.sans}`, color: T.acc }}>
												{connectingNearby ? 'Waiting for approval…' : 'Ask to join'}
											</span>
										</button>
									))}
								</div>
							)}
							<div style={{ marginTop: 10, height: 1, background: T.bd }} />
						</div>
					)}
					{capabilities.runtimeKind === 'android' && !session.discoveryAvailable && (
						<p style={{ margin: '0 0 12px', font: `12px/1.5 ${T.sans}`, color: T.ter }}>
							{capabilities.localDiscovery.unavailableMessage}
						</p>
					)}
					<p style={{ margin: '0 0 12px', font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
						Stay on the same network as your {gm}. Paste their invite code or scan their QR, then
						send the reply code back so they can connect you.
					</p>
					<InviteScanner onScan={setOffer} />
					<span
						style={{
							font: `600 11px ${T.sans}`,
							color: T.ter,
							textTransform: 'uppercase',
							letterSpacing: '.04em',
						}}
					>
						Invite code from your {gm}
					</span>
					<textarea
						aria-label={`Invite code from your ${gm}`}
						maxLength={MAX_CONNECTION_CODE_CHARS}
						value={offer}
						onChange={(e) => setOffer(e.target.value)}
						rows={3}
						placeholder="Paste the invite code…"
						style={{ ...fieldStyle, marginTop: 5 }}
					/>
					<button
						type="button"
						style={{ ...btn(true), marginTop: 10 }}
						onClick={() => void join()}
						disabled={!offer.trim() || status === 'connecting'}
					>
						<Icon name="players" size={14} />
						{status === 'connecting' ? 'Connecting…' : 'Join'}
					</button>
					{answerCode && (
						<div
							style={{
								marginTop: 14,
								padding: 14,
								borderRadius: 10,
								border: `1px solid ${T.accBd}`,
								background: T.accSub,
							}}
						>
							<div style={{ font: `12.5px ${T.sans}`, color: T.ink }}>
								Send this reply code back to your {gm} to finish connecting:
							</div>
							<CopyField label="Your reply code" value={answerCode} />
							<div style={{ marginTop: 8, font: `11.5px ${T.sans}`, color: T.ter }}>
								Waiting for your {gm} to connect you…
							</div>
						</div>
					)}
				</>
			)}
			{visibleError && (
				<div
					// Was colour-only and silent: no live region (so a failed join was never announced)
					// and no redundant icon (WCAG 1.4.1, and this repo pairs status colour with a shape).
					role="alert"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						marginTop: 12,
						font: `12px ${T.sans}`,
						color: 'var(--color-status-error-text)',
					}}
				>
					<Icon name="warning" size={14} />
					{visibleError}
				</div>
			)}
		</Modal>
	);
}
