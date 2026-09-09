import { useState } from 'react';
import { Icon } from '../ds';
import { T } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useSession } from './SessionContext';
import { qrDataUrl } from './qr';
import type { HostInvitation } from './SessionHost';
import { MAX_CONNECTION_CODE_CHARS } from './signaling';
import { hostConnectionSummary, peerPresence } from './sessionStatus';
import {
	btn,
	CopyField,
	fieldStyle,
	Modal,
	OnlineJoinShare,
	PresenceTag,
	ROLE_LABEL,
	TONE,
} from './SessionPanelParts';

/**
 * The DM's hosting dialog: start a LAN or online table, show the connection code and QR, take the
 * player's answer code, and approve or refuse the players waiting to join.
 *
 * A pure move out of `SessionPanel.tsx` (RC-ENG-2.2 — that file had grown past the RC-STB-2.7
 * file-size limit). The handshake, the approvals and the markup are unchanged.
 */
export function HostModal({ onClose }: { onClose: () => void }) {
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
