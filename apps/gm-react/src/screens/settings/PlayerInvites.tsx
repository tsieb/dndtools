import { useEffect, useState } from 'react';
import {
	Badge,
	Button,
	Dialog,
	EmptyState,
	Icon,
	Input,
	Skeleton,
	Textarea,
	Toaster,
} from '../../ds';
import { LoadingRegion, Panel, Seg, T } from '../../app/screen-kit';
import { isAccountApiConfigured } from '../../cloud/config';
import {
	createInvite as apiCreateInvite,
	listInvites,
	revokeInvite as apiRevokeInvite,
	type CreateInviteResult,
	type Invite,
} from '../../cloud/appApi';
import { qrDataUrl } from '../../net/qr';
import { publicAppBaseUrl, publicAppHashUrl } from '../../platform/publicAppUrl';
import { coDmSeatsForPlan, useEntitlements } from '../../cloud/entitlements';
import { errMsg } from './shared';
/* ---- Player invites (REAL app-api when configured + signed in — server-minted join links) -------- */
/** The web join link an invite token redeems at — the /join route outside the DM shell. */
const inviteJoinUrl = (token: string) => publicAppHashUrl('/join', { token });

const copyText = async (text: string, okMessage: string) => {
	try {
		await navigator.clipboard.writeText(text);
		Toaster.success(okMessage);
	} catch {
		Toaster.error('Could not copy — copy the link manually.');
	}
};

/** Pending invites — REAL server-minted join links (app-api) when configured + signed in. */
export function InvitesPanel({
	cloudReady,
	createOpen,
	onCloseCreate,
}: {
	cloudReady: boolean;
	createOpen: boolean;
	onCloseCreate: () => void;
}) {
	const ent = useEntitlements();
	const coDmSeats = coDmSeatsForPlan(ent.plan);
	const [invites, setInvites] = useState<Invite[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [campaignName, setCampaignName] = useState('');
	const [note, setNote] = useState('');
	const [role, setRole] = useState<'player' | 'co-dm'>('player');
	const [email, setEmail] = useState('');
	const [minted, setMinted] = useState<CreateInviteResult | null>(null);
	const mintedJoinUrl = minted ? inviteJoinUrl(minted.token) : null;
	const [qr, setQr] = useState<string | null>(null);
	// Revoking kills the link server-side for good (no undo exists), so it confirms first.
	const [pendingRevoke, setPendingRevoke] = useState<Invite | null>(null);
	// Bumped by the failure state's Retry button so the load can be re-attempted in place.
	const [reloadNonce, setReloadNonce] = useState(0);
	useEffect(() => {
		if (!cloudReady) return;
		let cancelled = false;
		listInvites()
			.then((list) => {
				if (!cancelled) setInvites(list);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [cloudReady, reloadNonce]);
	useEffect(() => {
		if (!mintedJoinUrl) {
			setQr(null);
			return;
		}
		let cancelled = false;
		void qrDataUrl(mintedJoinUrl).then((url) => {
			if (!cancelled) setQr(url);
		});
		return () => {
			cancelled = true;
		};
	}, [mintedJoinUrl]);
	const close = () => {
		setMinted(null);
		setCampaignName('');
		setNote('');
		setRole('player');
		setEmail('');
		onCloseCreate();
	};
	const mint = () => {
		if (!publicAppBaseUrl()) {
			Toaster.error('Shareable links are not configured for this desktop build.');
			return;
		}
		const name = campaignName.trim();
		if (!name) {
			Toaster.error('Give the invite a campaign name.');
			return;
		}
		if (role === 'co-dm' && coDmSeats <= 0) {
			Toaster.error(
				ent.canChangePlan
					? 'Try the Lantern or Beacon preview to invite a Co-DM at no charge.'
					: 'Your current plan has no Co-DM seats, and plan changes are unavailable in this release.',
			);
			return;
		}
		const to = email.trim();
		// Catch an obvious typo client-side; the server validates authoritatively.
		if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
			Toaster.error('Enter a valid email address, or leave it blank to just get a link.');
			return;
		}
		setBusy(true);
		apiCreateInvite({
			campaignName: name,
			note: note.trim() || undefined,
			role,
			email: to || undefined,
		})
			.then((invite) => {
				setMinted(invite);
				setInvites((list) => (list ? [invite, ...list] : [invite]));
				if (invite.emailStatus === 'sent')
					Toaster.success(`Invite emailed to ${invite.emailedTo ?? to}.`);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not create the invite.')))
			.finally(() => setBusy(false));
	};
	const revoke = (inviteId: string) => {
		setBusy(true);
		apiRevokeInvite(inviteId)
			.then(() => {
				setInvites((list) => (list ? list.filter((i) => i.inviteId !== inviteId) : list));
				setPendingRevoke(null);
				Toaster.success('Invite revoked — its link no longer works.');
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not revoke that invite.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel title="Pending invites">
			{!cloudReady ? (
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					Online invite links work before the invitee opens the app.{' '}
					{isAccountApiConfigured
						? 'Sign in to create and manage them.'
						: 'Online invite links are unavailable here — share a live-table code directly instead.'}
				</div>
			) : failed ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Couldn’t load your invites.
					</span>
					<Button
						variant="secondary"
						size="sm"
						icon="retry"
						onClick={() => {
							setFailed(false);
							setInvites(null);
							setReloadNonce((n) => n + 1);
						}}
					>
						Retry
					</Button>
				</div>
			) : invites === null ? (
				<LoadingRegion
					label="Loading invites"
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					<Skeleton height={44} />
					<Skeleton height={44} />
				</LoadingRegion>
			) : invites.length === 0 ? (
				<EmptyState
					inset
					icon="send"
					title="No pending invites"
					description="“Invite player” creates a shareable join link (it expires after 14 days)."
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{invites.map((v, i) => {
						const joinUrl = inviteJoinUrl(v.token);
						return (
							<div
								key={v.inviteId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '10px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Icon name="send" size={15} color={T.ter} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<span style={{ font: `600 13px ${T.sans}` }}>{v.campaignName}</span>
										{v.role === 'co-dm' && <Badge status="accent">Co-DM</Badge>}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{v.note ? `${v.note} · ` : ''}expires{' '}
										{new Date(v.expiresAt * 1000).toLocaleDateString()}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									icon="link"
									disabled={busy || !joinUrl}
									title={joinUrl ? undefined : 'Public app URL is not configured'}
									aria-label={
										joinUrl
											? 'Copy join link'
											: 'Copy link (unavailable — public app URL is not configured)'
									}
									onClick={() => joinUrl && void copyText(joinUrl, 'Join link copied.')}
								>
									Copy link
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setPendingRevoke(v)}
								>
									Revoke
								</Button>
							</div>
						);
					})}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title="Revoke this invite?"
				description="The link stops working for good — revocation cannot be undone."
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
							onClick={() => pendingRevoke && revoke(pendingRevoke.inviteId)}
						>
							{busy ? 'Revoking…' : 'Revoke invite'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The join link for <strong style={{ color: T.ink }}>{pendingRevoke?.campaignName}</strong>{' '}
					stops working immediately, even if it was already shared. Anyone who already joined keeps
					their seat — mint a new invite to replace it.
				</div>
			</Dialog>
			<Dialog
				open={createOpen}
				onClose={close}
				title={minted ? 'Invite ready to share' : 'Invite a player'}
				description={
					minted
						? 'Send this link however you like — it works for 14 days or until you revoke it.'
						: 'Creates a shareable join link — add an email to send it, or share the link yourself.'
				}
				icon="send"
				size="md"
				footer={
					minted ? (
						<Button variant="primary" size="sm" onClick={close}>
							Done
						</Button>
					) : (
						<>
							<Button variant="secondary" size="sm" disabled={busy} onClick={close}>
								Cancel
							</Button>
							<Button variant="primary" size="sm" icon="send" disabled={busy} onClick={mint}>
								{busy ? 'Creating…' : 'Create invite'}
							</Button>
						</>
					)
				}
			>
				{minted ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
						{minted.emailStatus !== 'none' && (
							<div
								role="status"
								style={{
									width: '100%',
									display: 'flex',
									alignItems: 'flex-start',
									gap: 8,
									padding: '8px 10px',
									borderRadius: 8,
									border: `1px solid ${T.bd}`,
									font: `12px/1.5 ${T.sans}`,
									color: minted.emailStatus === 'sent' ? T.sub : T.ter,
								}}
							>
								<Icon
									name={minted.emailStatus === 'sent' ? 'check' : 'info'}
									size={14}
									color={minted.emailStatus === 'sent' ? T.ok : T.ter}
								/>
								<span>
									{minted.emailStatus === 'sent'
										? `Emailed to ${minted.emailedTo}. They can also use the link below.`
										: 'Email couldn’t be sent — email delivery isn’t set up for this app. Share the link below instead.'}
								</span>
							</div>
						)}
						{/* deliberate literal #fff: a QR quiet zone must stay white for scanners, whatever the theme */}
						{qr && (
							<img
								src={qr}
								alt="QR code for the join link"
								style={{
									width: 168,
									height: 168,
									borderRadius: 10,
									border: `1px solid ${T.bd}`,
									background: '#fff',
									padding: 8,
								}}
							/>
						)}
						<code
							style={{
								font: `11.5px ${T.mono}`,
								color: T.sub,
								wordBreak: 'break-all',
								textAlign: 'center',
							}}
						>
							{mintedJoinUrl ?? 'Public app URL is not configured.'}
						</code>
						<Button
							variant="secondary"
							size="sm"
							icon="link"
							disabled={!mintedJoinUrl}
							onClick={() => mintedJoinUrl && void copyText(mintedJoinUrl, 'Join link copied.')}
						>
							Copy link
						</Button>
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input
							value={campaignName}
							onChange={(e: { target: { value: string } }) => setCampaignName(e.target.value)}
							placeholder="Campaign name (shown to the invitee)"
							aria-label="Campaign name"
							maxLength={80}
						/>
						<Textarea
							value={note}
							onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
							placeholder="Note (optional) — e.g. “We play Fridays at 7”"
							aria-label="Invite note"
							rows={2}
							maxLength={200}
						/>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<span
								style={{
									font: `600 11.5px ${T.sans}`,
									color: T.ter,
									textTransform: 'uppercase',
									letterSpacing: '.06em',
								}}
							>
								Seat
							</span>
							<Seg
								ariaLabel="Seat"
								value={role}
								onChange={(v: string) => setRole(v as 'player' | 'co-dm')}
								options={[
									{ value: 'player', label: 'Player' },
									{ value: 'co-dm', label: coDmSeats > 0 ? 'Co-DM' : 'Co-DM (no seats)' },
								]}
							/>
							<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
								{role === 'co-dm'
									? 'A Co-DM sees your DM-only prep and helps run the table. Finish the promotion from the Players roster once they join your session.'
									: 'An ordinary player seat — sees only what you share with the table.'}
							</span>
						</div>
						<Input
							type="email"
							value={email}
							onChange={(e: { target: { value: string } }) => setEmail(e.target.value)}
							placeholder="Email invite to… (optional)"
							aria-label="Recipient email"
							autoComplete="off"
							maxLength={254}
						/>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							Leave email blank to just get a shareable link + QR code. When set, we’ll also email
							the invite if this app has email delivery configured.
						</div>
					</div>
				)}
			</Dialog>
		</Panel>
	);
}
