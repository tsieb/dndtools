import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ds';
import { T } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAuth } from '../cloud/AuthContext';
import { useSession } from './SessionContext';
import { qrDataUrl } from './qr';
import type { HostInvitation } from './SessionHost';
import type { ClientStatus } from './SessionClient';
import { MAX_CONNECTION_CODE_CHARS } from './signaling';
import { MAX_ONLINE_JOIN_CODE_CHARS, decodeJoinCode, encodeJoinCode } from './cloudCrypto';
import {
	connectionState,
	hostConnectionSummary,
	peerPresence,
	rosterPresence,
	type PresenceReading,
	type StatusTone,
} from './sessionStatus';
import { registerBackHandler } from '../platform/backNavigation';
import { usePlatformCapabilities } from '../platform/capabilities';

// Participant roles arrive as machine tokens; render the spoken versions.
const ROLE_LABEL: Record<string, string> = {
	dm: 'DM',
	'co-dm': 'Co-DM',
	player: 'Player',
	observer: 'Observer',
};

/**
 * The P2P session UI: a DM-side HOST control (topbar) and a player-side JOIN control (PlayerView). Both
 * drive the serverless LAN handshake — the DM shows a connection code / QR, the player returns an answer
 * code — and reflect live connection state. Kept intentionally self-contained (inline styles matching the
 * surrounding surfaces) so it can mount in either chrome.
 */

// --- shared modal primitive ------------------------------------------------------------------------

function Modal({
	title,
	onClose,
	children,
	width = 520,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	width?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	useEffect(() => {
		ref.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onCloseRef.current();
		};
		document.addEventListener('keydown', onKey);
		const unregisterBack = registerBackHandler('overlay', () => {
			onCloseRef.current();
			return true;
		});
		return () => {
			document.removeEventListener('keydown', onKey);
			unregisterBack();
		};
	}, []);
	return (
		<div
			className="app-fixed-viewport"
			role="presentation"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			style={{
				position: 'fixed',
				top: 'var(--native-titlebar-height)',
				right: 0,
				bottom: 0,
				left: 0,
				zIndex: 200,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding:
					'max(20px, var(--safe-area-top, 0px)) max(20px, var(--safe-area-right, 0px)) max(20px, var(--safe-area-bottom, 0px)) max(20px, var(--safe-area-left, 0px))',
				background: 'rgba(8,5,3,.55)',
				backdropFilter: 'blur(3px)',
			}}
		>
			<div
				ref={ref}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				style={{
					width,
					maxWidth: '100%',
					maxHeight: '100%',
					overflow: 'auto',
					background: T.surf,
					border: `1px solid ${T.bd}`,
					borderRadius: 14,
					boxShadow: T.smd,
					outline: 'none',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '14px 18px',
						borderBottom: `1px solid ${T.bd}`,
					}}
				>
					<span style={{ font: `600 15px ${T.disp}`, color: T.ink, flex: 1 }}>{title}</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						style={{
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							color: T.ter,
							display: 'flex',
						}}
					>
						<Icon name="close" size={18} />
					</button>
				</div>
				<div style={{ padding: 18 }}>{children}</div>
			</div>
		</div>
	);
}

const fieldStyle = {
	width: '100%',
	font: `12px ${T.mono}`,
	color: T.ink,
	background: T.alt,
	border: `1px solid ${T.bd}`,
	borderRadius: 8,
	padding: 10,
	resize: 'vertical' as const,
};
const btn = (primary?: boolean) => ({
	display: 'inline-flex',
	alignItems: 'center',
	gap: 7,
	padding: '8px 14px',
	borderRadius: 9,
	cursor: 'pointer',
	font: `600 12.5px ${T.sans}`,
	border: `1px solid ${primary ? T.accBd : T.bd}`,
	background: primary ? T.acc : T.surf,
	color: primary ? T.accFg : T.sub,
});

function CopyField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div style={{ marginTop: 10 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
				<span
					style={{
						font: `600 11px ${T.sans}`,
						color: T.ter,
						textTransform: 'uppercase',
						letterSpacing: '.04em',
						flex: 1,
					}}
				>
					{label}
				</span>
				<button
					type="button"
					style={btn()}
					onClick={() => {
						void navigator.clipboard?.writeText(value).then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						});
					}}
				>
					<Icon name={copied ? 'check' : 'duplicate'} size={13} />
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<textarea readOnly value={value} rows={3} style={fieldStyle} />
		</div>
	);
}

// --- status presentation ---------------------------------------------------------------------------

/** Semantic status families for the readings in `sessionStatus.ts`. `muted` is the quiet, no-news tone. */
const TONE: Record<StatusTone, { text: string; border: string; subtle: string }> = {
	ok: {
		text: 'var(--color-status-success-text)',
		border: 'var(--color-status-success-border)',
		subtle: 'var(--color-status-success-subtle)',
	},
	info: {
		text: 'var(--color-status-info-text)',
		border: 'var(--color-status-info-border)',
		subtle: 'var(--color-status-info-subtle)',
	},
	warn: {
		text: 'var(--color-status-warning-text)',
		border: 'var(--color-status-warning-border)',
		subtle: 'var(--color-status-warning-subtle)',
	},
	error: {
		text: 'var(--color-status-error-text)',
		border: 'var(--color-status-error-border)',
		subtle: 'var(--color-status-error-subtle)',
	},
	muted: { text: T.ter, border: T.bd, subtle: T.alt },
};

/** The player's live connection reading. Announced politely so a drop is not a silent visual change. */
function ConnectionBanner({ status }: { status: ClientStatus }) {
	const state = connectionState(status);
	const tone = TONE[state.tone];
	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="session-connection"
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 10,
				marginBottom: 14,
				padding: '10px 12px',
				borderRadius: 10,
				border: `1px solid ${tone.border}`,
				background: tone.subtle,
			}}
		>
			<Icon name={state.icon} size={16} color={tone.text} />
			<div style={{ flex: 1 }}>
				<div style={{ font: `600 12.5px ${T.sans}`, color: tone.text }}>{state.label}</div>
				<div style={{ marginTop: 2, font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>
					{state.detail}
				</div>
			</div>
		</div>
	);
}

/** One participant's presence: the spoken label plus any coarse hints, never colour alone. */
function PresenceTag({ reading }: { reading: PresenceReading }) {
	const tone = TONE[reading.tone];
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
			<span style={{ font: `11px ${T.sans}`, color: tone.text }}>{reading.label}</span>
			{reading.badges.map((badge) => (
				<span
					key={badge}
					style={{
						font: `600 10.5px ${T.sans}`,
						color: T.acc,
						border: `1px solid ${T.accBd}`,
						background: T.accSub,
						borderRadius: 999,
						padding: '1px 7px',
					}}
				>
					{badge}
				</span>
			))}
		</span>
	);
}

/** A read-aloud field: the DM dictates these when a player cannot paste the whole join code. */
function DictateField({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
			<span style={{ font: `600 11px ${T.sans}`, color: T.ter, minWidth: 46 }}>{label}</span>
			<code
				style={{
					flex: 1,
					font: `12px ${T.mono}`,
					color: T.ink,
					wordBreak: 'break-all',
					userSelect: 'all',
				}}
			>
				{value}
			</code>
		</div>
	);
}

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

/** The join code's two halves, or null when it cannot be read — never throws into a render. */
function splitJoinCode(code: string): { sessionId: string; pin: string } | null {
	try {
		return decodeJoinCode(code);
	} catch {
		return null;
	}
}

/**
 * The DM's share block for an online (cloud) table: the one-string join code, the same code as a QR
 * for a phone at the table, and the room + PIN read out separately for a player who cannot paste.
 * The PIN is the admission credential (`cloudCrypto.ts`) and never reaches the signaling service.
 */
function OnlineJoinShare({ code }: { code: string }) {
	const [qr, setQr] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void qrDataUrl(code).then((url) => {
			if (!cancelled) setQr(url);
		});
		return () => {
			cancelled = true;
		};
	}, [code]);

	// Both halves are already inside the code; splitting them out is a dictation aid, and it lets the
	// two sides confirm out loud that they are on the same room before anyone is approved.
	const parts = splitJoinCode(code);

	return (
		<>
			<CopyField label="Online join code — send privately" value={code} />
			{qr && (
				<img
					src={qr}
					alt="Online join code QR code"
					style={{
						display: 'block',
						margin: '12px auto 4px',
						width: 160,
						height: 160,
						imageRendering: 'pixelated',
						background: '#fff',
						borderRadius: 8,
						padding: 6,
					}}
				/>
			)}
			{parts && (
				<div
					style={{
						marginTop: 10,
						padding: '10px 12px',
						borderRadius: 10,
						border: `1px solid ${T.bd}`,
						background: T.alt,
					}}
				>
					<span
						style={{
							font: `600 11px ${T.sans}`,
							color: T.ter,
							textTransform: 'uppercase',
							letterSpacing: '.04em',
						}}
					>
						Or read these out
					</span>
					<DictateField label="Room" value={parts.sessionId} />
					<DictateField label="PIN" value={parts.pin} />
				</div>
			)}
			<div style={{ marginTop: 8, font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
				The PIN is what opens the table, and it is never sent to the signaling service. A device
				that has it still waits for your approval below.
			</div>
		</>
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

function HostModal({ onClose }: { onClose: () => void }) {
	const session = useSession();
	const runtime = useRuntime();
	const [selected, setSelected] = useState('');
	const [invitation, setInvitation] = useState<HostInvitation | null>(null);
	const [qr, setQr] = useState<string | null>(null);
	const [answer, setAnswer] = useState('');
	const [error, setError] = useState<string | null>(null);
	const onlineActive = session.onlineJoinCode !== null;

	const hostOnline = async () => {
		setError(null);
		try {
			// Only reflect "joinable online" when hosting actually started — a
			// dismissed sign-in (or failed advertise) resolves false / throws.
			await session.startHostingOnline();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not host online.');
		}
	};

	const assignedActorIds = new Set(session.peers.map((peer) => peer.actorId));
	const invitable = runtime.actors.filter(
		(a) =>
			(a.role === 'player' || a.role === 'observer' || a.role === 'co-dm') &&
			!assignedActorIds.has(a.id),
	);
	const selectedActorId = invitable.some((actor) => actor.id === selected) ? selected : '';

	const createInvite = async () => {
		setError(null);
		try {
			const actorId = selectedActorId;
			if (!actorId) {
				setError('Choose the participant this invitation belongs to.');
				return;
			}
			const inv = await session.invite(actorId);
			setInvitation(inv);
			setQr(await qrDataUrl(inv.offerCode));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not create the invitation.');
		}
	};
	const connect = async () => {
		setError(null);
		try {
			await session.acceptAnswer(answer.trim());
			setInvitation(null);
			setQr(null);
			setAnswer('');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not connect that player.');
		}
	};
	const approveRequest = async (requestId: string) => {
		setError(null);
		const actorId = selectedActorId;
		if (!actorId) {
			setError('Choose the participant this device may join as.');
			return;
		}
		try {
			await session.approveJoin(requestId, actorId);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not approve that device.');
		}
	};

	return (
		<Modal title="Host a live table" onClose={onClose}>
			<p style={{ margin: '0 0 14px', font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
				Host nearby without an account, or sign in for internet play. Every joining device waits for
				your approval and can use only the participant you choose.
			</p>
			{session.role !== 'host' ? (
				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					<button type="button" style={btn(true)} onClick={() => session.startHosting()}>
						<Icon name="session-bolt" size={14} />
						Host on local network
					</button>
					{session.cloudAvailable && (
						<button type="button" style={btn()} onClick={() => void hostOnline()}>
							<Icon name="players" size={14} />
							Host online
						</button>
					)}
				</div>
			) : (
				<>
					{session.cloudAvailable && (
						<div style={{ marginBottom: 14 }}>
							{onlineActive ? (
								<>
									<span
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 6,
											font: `600 12px ${T.sans}`,
											color: 'var(--color-status-success-text)',
										}}
									>
										<Icon name="check" size={14} />
										Joinable online — players can connect over the internet
									</span>
									{session.onlineJoinCode && <OnlineJoinShare code={session.onlineJoinCode} />}
								</>
							) : (
								<button type="button" style={btn()} onClick={() => void hostOnline()}>
									<Icon name="players" size={14} />
									Also make joinable online
								</button>
							)}
						</div>
					)}
					<div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
						<label style={{ flex: 1, minWidth: 180 }}>
							<span
								style={{
									display: 'block',
									font: `600 11px ${T.sans}`,
									color: T.ter,
									marginBottom: 4,
								}}
							>
								Invite participant
							</span>
							<select
								value={selectedActorId}
								onChange={(e) => setSelected(e.target.value)}
								style={{
									width: '100%',
									font: `13px ${T.sans}`,
									color: T.ink,
									background: T.alt,
									border: `1px solid ${T.bd}`,
									borderRadius: 8,
									padding: '8px 10px',
								}}
							>
								<option value="">
									{invitable.length === 0 ? 'No participants available' : 'Choose participant…'}
								</option>
								{invitable.map((a) => (
									<option key={a.id} value={a.id}>
										{a.displayName} ({a.role})
									</option>
								))}
							</select>
						</label>
						<button
							type="button"
							style={btn(true)}
							onClick={() => void createInvite()}
							disabled={!selectedActorId}
						>
							<Icon name="add" size={14} />
							Create invite
						</button>
					</div>

					{session.pendingJoins.length > 0 && (
						<div
							style={{
								marginTop: 14,
								padding: 14,
								borderRadius: 10,
								border: `1px solid ${T.warn}`,
								background: 'var(--color-status-warning-subtle)',
							}}
						>
							<div
								style={{ font: `600 12.5px ${T.sans}`, color: 'var(--color-status-warning-text)' }}
							>
								Join requests
							</div>
							<div style={{ margin: '4px 0 10px', font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>
								Confirm with the player before approving. The device receives access only as the
								participant selected above.
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								{session.pendingJoins.map((request, index) => (
									<div
										key={request.id}
										style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
									>
										<span style={{ flex: 1, minWidth: 140, font: `12px ${T.sans}`, color: T.ink }}>
											{request.transport === 'online' ? 'Online' : 'Nearby'} device {index + 1}
										</span>
										<button
											type="button"
											style={btn(true)}
											onClick={() => void approveRequest(request.id)}
											disabled={!selectedActorId}
										>
											<Icon name="check" size={13} />
											Approve
										</button>
										<button
											type="button"
											style={btn()}
											onClick={() => void session.rejectJoin(request.id)}
										>
											Decline
										</button>
									</div>
								))}
							</div>
						</div>
					)}

					{invitation && (
						<div
							style={{
								marginTop: 14,
								padding: 14,
								borderRadius: 10,
								border: `1px solid ${T.accBd}`,
								background: T.accSub,
							}}
						>
							<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>
								Invite for {invitation.displayName}
							</div>
							{qr && (
								<img
									src={qr}
									alt="Session invite QR code"
									style={{
										display: 'block',
										margin: '12px auto 4px',
										width: 180,
										height: 180,
										imageRendering: 'pixelated',
										background: '#fff',
										borderRadius: 8,
										padding: 6,
									}}
								/>
							)}
							<CopyField label="Invite code — send to the player" value={invitation.offerCode} />
							<div style={{ marginTop: 12 }}>
								<span
									style={{
										font: `600 11px ${T.sans}`,
										color: T.ter,
										textTransform: 'uppercase',
										letterSpacing: '.04em',
									}}
								>
									Paste the player’s reply code
								</span>
								<textarea
									maxLength={MAX_CONNECTION_CODE_CHARS}
									value={answer}
									onChange={(e) => setAnswer(e.target.value)}
									rows={3}
									placeholder="Paste the reply code from the player…"
									style={{ ...fieldStyle, marginTop: 5 }}
								/>
								<button
									type="button"
									style={{ ...btn(true), marginTop: 8 }}
									onClick={() => void connect()}
									disabled={!answer.trim()}
								>
									<Icon name="check" size={14} />
									Connect player
								</button>
							</div>
						</div>
					)}

					<div style={{ marginTop: 16 }}>
						<div style={{ font: `600 12px ${T.sans}`, color: T.ink, marginBottom: 8 }}>
							{hostConnectionSummary(session.peers)}
						</div>
						{session.peers.length === 0 ? (
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
								No one has joined yet. Create an invite above, or share the online join code.
							</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								{session.peers.map((p) => {
									const reading = peerPresence(p);
									return (
										<div
											key={p.peerId}
											data-testid="session-peer"
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 10,
												padding: '8px 11px',
												borderRadius: 9,
												border: `1px solid ${T.bd}`,
												background: T.surf,
												flexWrap: 'wrap',
											}}
										>
											<span
												style={{
													width: 8,
													height: 8,
													borderRadius: '50%',
													background: TONE[reading.tone].text,
												}}
											/>
											<span
												style={{ flex: 1, minWidth: 130, font: `12.5px ${T.sans}`, color: T.ink }}
											>
												{p.displayName}
												<span style={{ color: T.ter }}> · {ROLE_LABEL[p.role] ?? p.role}</span>
											</span>
											<PresenceTag reading={reading} />
											<button
												type="button"
												onClick={() => session.revoke(p.peerId)}
												aria-label={`Revoke access for ${p.displayName}`}
												style={{ ...btn(), padding: '5px 9px' }}
											>
												<Icon name="hidden" size={12} />
												Revoke
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>

					<div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
						<button
							type="button"
							style={btn()}
							onClick={() => {
								session.stopHosting();
								onClose();
							}}
						>
							Stop hosting
						</button>
					</div>
				</>
			)}
			{error && (
				<div
					style={{ marginTop: 12, font: `12px ${T.sans}`, color: 'var(--color-status-error-text)' }}
				>
					{error}
				</div>
			)}
		</Modal>
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
