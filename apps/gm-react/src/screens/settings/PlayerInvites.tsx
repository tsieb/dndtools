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
import { useI18n } from '../../i18n';
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

const copyText = async (text: string, okMessage: string, failMessage: string) => {
	try {
		await navigator.clipboard.writeText(text);
		Toaster.success(okMessage);
	} catch {
		Toaster.error(failMessage);
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
	const { t, formatDate } = useI18n();
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
			Toaster.error(t('settings.invites.noPublicUrl'));
			return;
		}
		const name = campaignName.trim();
		if (!name) {
			Toaster.error(t('settings.invites.needName'));
			return;
		}
		if (role === 'co-dm' && coDmSeats <= 0) {
			Toaster.error(
				t(ent.canChangePlan ? 'settings.invites.noSeatsUpgrade' : 'settings.invites.noSeatsLocked'),
			);
			return;
		}
		const to = email.trim();
		// Catch an obvious typo client-side; the server validates authoritatively.
		if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
			Toaster.error(t('settings.invites.badEmail'));
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
					Toaster.success(t('settings.invites.emailed', { email: invite.emailedTo ?? to }));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.invites.createFailed'))))
			.finally(() => setBusy(false));
	};
	const revoke = (inviteId: string) => {
		setBusy(true);
		apiRevokeInvite(inviteId)
			.then(() => {
				setInvites((list) => (list ? list.filter((i) => i.inviteId !== inviteId) : list));
				setPendingRevoke(null);
				Toaster.success(t('settings.invites.revoked'));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.invites.revokeFailed'))))
			.finally(() => setBusy(false));
	};
	// The campaign name is emphasised mid-sentence, so format the whole sentence and split it around
	// that value rather than freezing English word order into two fragments.
	const revokeName = pendingRevoke?.campaignName ?? '';
	const revokeSentence = t('settings.invites.revokeBody', { campaign: revokeName });
	const [revokeBefore, revokeAfter = ''] = revokeSentence.split(revokeName);
	return (
		<Panel title={t('settings.invites.title')}>
			{!cloudReady ? (
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{t('settings.invites.beforeAppIntro')}{' '}
					{t(
						isAccountApiConfigured
							? 'settings.invites.signInToManage'
							: 'settings.invites.unavailableHere',
					)}
				</div>
			) : failed ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('settings.invites.loadFailed')}
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
						{t('common.action.retry')}
					</Button>
				</div>
			) : invites === null ? (
				<LoadingRegion
					label={t('settings.invites.loading')}
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					<Skeleton height={44} />
					<Skeleton height={44} />
				</LoadingRegion>
			) : invites.length === 0 ? (
				<EmptyState
					inset
					icon="send"
					title={t('settings.invites.emptyTitle')}
					description={t('settings.invites.emptyBody')}
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
										{v.role === 'co-dm' && (
											<Badge status="accent">{t('settings.invites.coDm')}</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{t(v.note ? 'settings.invites.noteAndExpiry' : 'settings.invites.expiry', {
											note: v.note ?? '',
											date: formatDate(new Date(v.expiresAt * 1000)),
										})}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									icon="link"
									disabled={busy || !joinUrl}
									title={joinUrl ? undefined : t('settings.invites.noPublicUrlShort')}
									aria-label={t(
										joinUrl
											? 'settings.invites.copyLinkLabel'
											: 'settings.invites.copyLinkDisabled',
									)}
									onClick={() =>
										joinUrl &&
										void copyText(
											joinUrl,
											t('settings.invites.linkCopied'),
											t('settings.invites.copyFailed'),
										)
									}
								>
									{t('settings.invites.copyLink')}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setPendingRevoke(v)}
								>
									{t('settings.invites.revoke')}
								</Button>
							</div>
						);
					})}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title={t('settings.invites.revokeTitle')}
				description={t('settings.invites.revokeDescription')}
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
							onClick={() => pendingRevoke && revoke(pendingRevoke.inviteId)}
						>
							{busy ? t('settings.invites.revoking') : t('settings.invites.revokeInvite')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{revokeBefore}
					<strong style={{ color: T.ink }}>{revokeName}</strong>
					{revokeAfter}
				</div>
			</Dialog>
			<Dialog
				open={createOpen}
				onClose={close}
				title={t(minted ? 'settings.invites.readyTitle' : 'settings.invites.createTitle')}
				description={t(
					minted ? 'settings.invites.readyDescription' : 'settings.invites.createDescription',
				)}
				icon="send"
				size="md"
				footer={
					minted ? (
						<Button variant="primary" size="sm" onClick={close}>
							{t('common.action.done')}
						</Button>
					) : (
						<>
							<Button variant="secondary" size="sm" disabled={busy} onClick={close}>
								{t('common.action.cancel')}
							</Button>
							<Button variant="primary" size="sm" icon="send" disabled={busy} onClick={mint}>
								{busy ? t('settings.invites.creating') : t('settings.invites.createInvite')}
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
										? t('settings.invites.emailSent', { email: minted.emailedTo ?? '' })
										: t('settings.invites.emailUnavailable')}
								</span>
							</div>
						)}
						{/* deliberate literal #fff: a QR quiet zone must stay white for scanners, whatever the theme */}
						{qr && (
							<img
								src={qr}
								alt={t('settings.invites.qrAlt')}
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
							{mintedJoinUrl ?? t('settings.invites.noPublicUrlShort')}
						</code>
						<Button
							variant="secondary"
							size="sm"
							icon="link"
							disabled={!mintedJoinUrl}
							onClick={() =>
								mintedJoinUrl &&
								void copyText(
									mintedJoinUrl,
									t('settings.invites.linkCopied'),
									t('settings.invites.copyFailed'),
								)
							}
						>
							{t('settings.invites.copyLink')}
						</Button>
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input
							value={campaignName}
							onChange={(e: { target: { value: string } }) => setCampaignName(e.target.value)}
							placeholder={t('settings.invites.campaignPlaceholder')}
							aria-label={t('settings.invites.campaignLabel')}
							maxLength={80}
						/>
						<Textarea
							value={note}
							onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
							placeholder={t('settings.invites.notePlaceholder')}
							aria-label={t('settings.invites.noteLabel')}
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
								{t('settings.invites.seat')}
							</span>
							<Seg
								ariaLabel={t('settings.invites.seat')}
								value={role}
								onChange={(v: string) => setRole(v as 'player' | 'co-dm')}
								options={[
									{ value: 'player', label: t('settings.invites.seatPlayer') },
									{
										value: 'co-dm',
										label: t(
											coDmSeats > 0 ? 'settings.invites.coDm' : 'settings.invites.coDmNoSeats',
										),
									},
								]}
							/>
							<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
								{t(role === 'co-dm' ? 'settings.invites.coDmHelp' : 'settings.invites.playerHelp')}
							</span>
						</div>
						<Input
							type="email"
							value={email}
							onChange={(e: { target: { value: string } }) => setEmail(e.target.value)}
							placeholder={t('settings.invites.emailPlaceholder')}
							aria-label={t('settings.invites.emailLabel')}
							autoComplete="off"
							maxLength={254}
						/>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							{t('settings.invites.emailHelp')}
						</div>
					</div>
				)}
			</Dialog>
		</Panel>
	);
}
