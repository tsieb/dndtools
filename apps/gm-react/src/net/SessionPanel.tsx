import { useEffect, useState } from 'react';
import { Icon } from '../ds';
import { T } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { useSession } from './SessionContext';
import { MAX_CONNECTION_CODE_CHARS } from './signaling';
import { MAX_ONLINE_JOIN_CODE_CHARS, encodeJoinCode } from './cloudCrypto';
import { connectionState, rosterPresence } from './sessionStatus';
import { HostModal } from './HostModal';
import {
	btn,
	ConnectionBanner,
	CopyField,
	fieldStyle,
	Modal,
	PresenceTag,
	TONE,
} from './SessionPanelParts';
import { usePlatformCapabilities } from '../platform/capabilities';

// --- Account control (topbar) ----------------------------------------------------------------------

export function AccountButton({ compact = false }: { compact?: boolean } = {}) {
	const auth = useAuth();
	if (!auth.isConfigured) return null; // local-first: hidden when cloud isn't configured
	const signedIn = auth.status === 'signed-in';
	const label = signedIn ? (auth.user?.email ?? 'Account').split('@')[0] : 'Sign in';
	return (
		<button
			type="button"
			aria-label={
				signedIn
					? `Account: ${auth.user?.email ?? label} — sign out`
					: 'Sign in for online play and encrypted cloud backup'
			}
			title={
				signedIn
					? `Signed in as ${auth.user?.email ?? ''} — click to sign out`
					: 'Sign in for online play & encrypted cloud backup'
			}
			onClick={() => (signedIn ? void auth.signOut() : auth.openAuthModal())}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: compact ? 0 : 7,
				width: compact ? 44 : undefined,
				height: compact ? 44 : undefined,
				padding: compact ? 0 : '6px 11px',
				borderRadius: 8,
				cursor: 'pointer',
				font: `600 12px ${T.sans}`,
				border: `1px solid ${signedIn ? 'var(--color-status-success-border)' : T.bd}`,
				background: signedIn ? 'var(--color-status-success-subtle)' : 'transparent',
				color: signedIn ? 'var(--color-status-success-text)' : T.sub,
				flex: '0 0 auto',
			}}
		>
			<Icon name="players" size={15} />
			{!compact && label}
		</button>
	);
}

// --- DM host control -------------------------------------------------------------------------------

export function HostSessionButton({ compact = false }: { compact?: boolean } = {}) {
	const [open, setOpen] = useState(false);
	const session = useSession();
	const active = session.role === 'host';
	const pending = session.pendingJoins.length;
	const hostLabel =
		pending > 0
			? `${pending} ${pending === 1 ? 'player is' : 'players are'} waiting for approval`
			: active
				? `Hosting ${session.peers.filter((p) => p.connected).length} players`
				: 'Host a live table';
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={hostLabel}
				title={hostLabel}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: compact ? 0 : 7,
					width: compact ? 44 : undefined,
					height: compact ? 44 : undefined,
					padding: compact ? 0 : '6px 11px',
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
				{!compact &&
					(pending > 0
						? `Approve · ${pending}`
						: active
							? `Hosting · ${session.peers.filter((p) => p.connected).length}`
							: 'Host')}
			</button>
			{open && <HostModal onClose={() => setOpen(false)} />}
		</>
	);
}

// --- Player join control ---------------------------------------------------------------------------

export function JoinSessionButton() {
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
				onClick={() => setOpen(true)}
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

function JoinModal({ onClose }: { onClose: () => void }) {
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
	const status = session.client?.status ?? 'idle';
	const visibleError = error ?? session.client?.error;
	const roster = session.client?.presence ?? [];

	const connectOnline = async (joinCode: string) => {
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
								style={{ ...btn(true), marginTop: 8 }}
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
											style={{ ...btn(), alignSelf: 'flex-start' }}
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
						Or paste the invite code your DM shared. You’ll get a reply code to send back — then
						you’re connected directly, over the local network.
					</p>
					<span
						style={{
							font: `600 11px ${T.sans}`,
							color: T.ter,
							textTransform: 'uppercase',
							letterSpacing: '.04em',
						}}
					>
						Invite code from your DM
					</span>
					<textarea
						aria-label="Invite code from your DM"
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
								Send this reply code back to your DM to finish connecting:
							</div>
							<CopyField label="Your reply code" value={answerCode} />
							<div style={{ marginTop: 8, font: `11.5px ${T.sans}`, color: T.ter }}>
								Waiting for the DM to connect you…
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
