import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContentItemsForActor } from '@dndtools/core';
import { Badge, Button, Dialog, EmptyState, Icon, Input, Skeleton, Stat, Toaster } from '../../ds';
import { LoadingRegion, Panel, T, eb, radioGroupKeyDown } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { useEntitlements } from '../../cloud/entitlements';
import { isAccountApiConfigured } from '../../cloud/config';
import {
	getMyWiki,
	publishWiki,
	unpublishWiki,
	type WikiAccess,
	type WikiStatus,
} from '../../cloud/appApi';
import { publicAppBaseUrl } from '../../platform/publicAppUrl';
import { WIKI_ACCESS_MODES, buildWikiPages, errText, kb, wikiPublicUrl } from './shared';
import { useI18n } from '../../i18n';

export function CommWiki() {
	const { t, formatDate, formatTime } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const navigate = useNavigate();
	const { plan, loading: planLoading, canChangePlan } = useEntitlements();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	// Publishing is a Beacon feature (the server enforces it too — this only keeps the UI honest).
	const canPublish = cloudReady && plan === 'beacon';

	const [title, setTitle] = useState(() => t('community.wiki.defaultTitle'));
	const [access, setAccess] = useState<WikiAccess>('unlisted');
	const [password, setPassword] = useState('');
	// undefined → the initial status fetch is in flight; null → nothing published; else the live status.
	const [status, setStatus] = useState<WikiStatus | null | undefined>(
		cloudReady ? undefined : null,
	);
	const [statusFailed, setStatusFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [confirmUnpublish, setConfirmUnpublish] = useState(false);

	// REAL: only player-visible notes are eligible (DM-only notes never leave the vault).
	const items = useMemo(
		() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId),
		[runtime.state.content, runtime.state.permissions, dmId],
	);
	const notes = items.filter((i) => i.kind === 'note');
	const eligibleNotes = notes.filter((i) => i.visibility === 'player-visible');
	const eligible = eligibleNotes.length;
	const pages = useMemo(() => buildWikiPages(eligibleNotes), [eligibleNotes]);

	// Load the caller's current published-wiki status; adopt its title/access into the form so a
	// re-publish edits the live wiki rather than resetting it.
	const loadStatus = useCallback(() => {
		if (!cloudReady) return;
		setStatusFailed(false);
		setStatus(undefined);
		getMyWiki()
			.then((s) => {
				setStatus(s);
				if (s) {
					setTitle(s.title);
					setAccess(s.access);
				}
			})
			.catch(() => setStatusFailed(true));
	}, [cloudReady]);
	useEffect(() => {
		if (cloudReady) loadStatus();
		else {
			setStatusFailed(false);
			setStatus(null);
		}
	}, [cloudReady, loadStatus]);

	const publish = () => {
		if (!publicAppBaseUrl()) {
			Toaster.error(t('community.wiki.noPublicUrl'));
			return;
		}
		if (!canPublish) {
			Toaster.error(t('community.wiki.needsBeacon'));
			return;
		}
		if (pages.length === 0) {
			Toaster.error(t('community.wiki.needsPages'));
			return;
		}
		if (!title.trim()) {
			Toaster.error(t('community.wiki.needsTitle'));
			return;
		}
		if (access === 'password' && password.trim().length < 6) {
			Toaster.error(t('community.wiki.needsPassword'));
			return;
		}
		setBusy(true);
		publishWiki({
			title: title.trim(),
			access,
			pages,
			...(access === 'password' ? { password: password.trim() } : {}),
		})
			.then((s) => {
				setStatus(s);
				setPassword('');
				Toaster.success(t(status ? 'community.wiki.updated' : 'community.wiki.published'));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	const unpublish = () => {
		setBusy(true);
		unpublishWiki()
			.then(() => {
				setStatus(null);
				setConfirmUnpublish(false);
				Toaster.success(t('community.wiki.unpublished'));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	const copyLink = async (url: string) => {
		try {
			await navigator.clipboard.writeText(url);
			Toaster.success(t('community.wiki.linkCopied'));
		} catch {
			Toaster.error(t('community.wiki.copyFailed'));
		}
	};

	// The settings/publish column adapts to the tier; the reading preview is always shown.
	let settings: React.ReactNode;
	if (!isAccountApiConfigured) {
		settings = (
			<Panel
				title={t('community.wiki.settingsTitle')}
				action={<Badge status="neutral">{t('community.market.localOnly')}</Badge>}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('community.wiki.localOnlyBody')}
				</div>
				<EligibilityStat eligible={eligible} total={notes.length} />
			</Panel>
		);
	} else if (auth.status !== 'signed-in') {
		settings = (
			<Panel
				title={t('community.wiki.settingsTitle')}
				action={<Badge status="neutral">{t('community.market.signedOut')}</Badge>}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<div style={{ flex: '1 1 220px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{t('community.wiki.signInPrompt')}
					</div>
					<Button
						variant="primary"
						size="sm"
						icon="UserCircle"
						onClick={() => auth.openAuthModal()}
					>
						{t('community.market.signIn')}
					</Button>
				</div>
				<EligibilityStat eligible={eligible} total={notes.length} />
			</Panel>
		);
	} else if (!canPublish && status === null) {
		settings = (
			<Panel
				title={t('community.wiki.settingsTitle')}
				action={<Badge status="accent">{t('community.wiki.beacon')}</Badge>}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t(
						planLoading
							? 'community.wiki.checkingPlan'
							: canChangePlan
								? 'community.wiki.beaconTryable'
								: 'community.wiki.beaconLocked',
					)}
				</div>
				<Button
					variant="primary"
					size="md"
					icon="sparkle"
					disabled={planLoading}
					onClick={() => navigate('/upgrade')}
				>
					{t('community.wiki.seePlans')}
				</Button>
				<EligibilityStat eligible={eligible} total={notes.length} />
			</Panel>
		);
	} else if (statusFailed) {
		settings = (
			<Panel title={t('community.wiki.settingsTitle')}>
				<EmptyState
					inset
					icon="warning"
					title={t('community.wiki.loadFailed')}
					description={t('community.discover.loadFailedBody')}
					action={
						<Button variant="secondary" size="sm" icon="retry" onClick={loadStatus}>
							{t('common.action.retry')}
						</Button>
					}
				/>
			</Panel>
		);
	} else if (status === undefined) {
		settings = (
			<Panel title={t('community.wiki.settingsTitle')}>
				<LoadingRegion
					label={t('community.wiki.loadingStatus')}
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					<Skeleton height={44} />
					<Skeleton height={96} />
				</LoadingRegion>
			</Panel>
		);
	} else if (status) {
		const url = wikiPublicUrl(status.wikiId);
		settings = (
			// "ok" was not a Badge status — it fell through to `neutral`, dropping both the green and
			// the status icon this positive state relies on for colour-independent meaning.
			<Panel
				title={t('community.wiki.publishedTitle')}
				action={<Badge status="success">{t('community.wiki.live')}</Badge>}
			>
				<div style={{ ...eb }}>{t('community.wiki.publicLink')}</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '9px 11px',
						borderRadius: 9,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<Icon name="globe" size={15} color={T.acc} />
					<span
						style={{
							font: `12px ${T.mono}`,
							color: T.sub,
							flex: 1,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{url ?? t('community.wiki.urlUnconfigured')}
					</span>
					<Button
						variant="ghost"
						size="sm"
						icon="link"
						disabled={!url}
						onClick={() => {
							if (url) void copyLink(url);
						}}
					>
						{t('common.action.copy')}
					</Button>
				</div>
				<div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
					<Stat
						label={t('community.wiki.access')}
						value={(() => {
							const mode = WIKI_ACCESS_MODES.find((m) => m.value === status.access);
							return mode ? t(mode.label) : status.access;
						})()}
						icon="lock"
					/>
					<Stat
						label={t('community.wiki.pages')}
						value={String(status.pageCount)}
						icon="knowledge-book"
					/>
					<Stat label={t('community.wiki.size')} value={kb(status.size)} icon="upload" />
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					{t('community.wiki.publishedMeta', {
						published: formatDate(new Date(status.publishedAt)),
						updated: `${formatDate(new Date(status.updatedAt))} ${formatTime(
							new Date(status.updatedAt),
						)}`,
					})}
				</div>
				{!canPublish && (
					<div
						style={{
							padding: '10px 12px',
							borderRadius: 9,
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
							font: `12px/1.5 ${T.sans}`,
							color: T.sub,
						}}
					>
						{t('community.wiki.remainsLive')}{' '}
						{t(
							canChangePlan
								? 'community.wiki.remainsLiveTryable'
								: 'community.wiki.remainsLiveLocked',
						)}
					</div>
				)}
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{canPublish ? (
						<Button variant="secondary" size="md" icon="upload" disabled={busy} onClick={publish}>
							{busy ? t('community.discover.working') : t('community.wiki.republish')}
						</Button>
					) : (
						<Button variant="primary" size="md" icon="sparkle" onClick={() => navigate('/upgrade')}>
							{t(canChangePlan ? 'community.wiki.tryBeacon' : 'community.wiki.viewPlan')}
						</Button>
					)}
					<Button
						variant="ghost"
						size="md"
						icon="delete"
						disabled={busy}
						onClick={() => setConfirmUnpublish(true)}
					>
						{t('community.wiki.unpublish')}
					</Button>
				</div>
				<Dialog
					open={confirmUnpublish}
					onClose={() => setConfirmUnpublish(false)}
					title={t('community.wiki.unpublishTitle')}
					description={t('community.wiki.unpublishDescription')}
					tone="danger"
					size="sm"
					footer={
						<>
							<Button
								variant="secondary"
								size="sm"
								disabled={busy}
								onClick={() => setConfirmUnpublish(false)}
							>
								{t('common.action.cancel')}
							</Button>
							<Button variant="danger" size="sm" icon="delete" disabled={busy} onClick={unpublish}>
								{busy ? t('community.wiki.unpublishing') : t('community.wiki.unpublishWiki')}
							</Button>
						</>
					}
				>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{t('community.wiki.unpublishBody')}
					</div>
				</Dialog>
			</Panel>
		);
	} else {
		// Signed-in, Beacon, nothing published yet: the publish form.
		settings = (
			<Panel title={t('community.wiki.settingsTitle')}>
				<div style={{ ...eb }}>{t('common.field.title')}</div>
				<Input
					value={title}
					onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
					placeholder={t('community.wiki.titlePlaceholder')}
					aria-label={t('community.wiki.titleField')}
					maxLength={120}
				/>
				<div style={{ ...eb, marginTop: 10 }}>{t('community.wiki.access')}</div>
				<div
					role="radiogroup"
					aria-label={t('community.wiki.accessField')}
					onKeyDown={radioGroupKeyDown}
					style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
				>
					{WIKI_ACCESS_MODES.map((m) => (
						<button
							key={m.value}
							type="button"
							role="radio"
							aria-checked={access === m.value}
							tabIndex={access === m.value ? 0 : -1}
							onClick={() => setAccess(m.value)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 11,
								padding: '10px 12px',
								borderRadius: 9,
								cursor: 'pointer',
								textAlign: 'left',
								border: `1px solid ${access === m.value ? T.accBd : T.bd}`,
								background: access === m.value ? T.accSub : T.surf,
							}}
						>
							<span
								style={{
									width: 16,
									height: 16,
									borderRadius: '50%',
									flex: '0 0 auto',
									border: `2px solid ${access === m.value ? T.acc : T.bdS}`,
									background: access === m.value ? T.acc : 'transparent',
								}}
							/>
							<span style={{ flex: 1 }}>
								<div style={{ font: `600 12.5px ${T.sans}` }}>{t(m.label)}</div>
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{t(m.note)}</div>
							</span>
						</button>
					))}
				</div>
				{access === 'password' && (
					<Input
						type="password"
						value={password}
						onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
						placeholder={t('community.wiki.passwordPlaceholder')}
						aria-label={t('community.wiki.passwordField')}
						maxLength={100}
					/>
				)}
				<EligibilityStat eligible={eligible} total={notes.length} />
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					{t('community.wiki.publishNote')}
				</div>
				<Button
					variant="primary"
					size="md"
					icon="upload"
					disabled={busy || eligible === 0}
					onClick={publish}
				>
					{busy ? t('community.publish.publishing') : t('community.wiki.publishWiki')}
				</Button>
			</Panel>
		);
	}

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1fr 1.1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			{settings}
			<Panel title={t('community.wiki.previewTitle')}>
				<div
					data-theme="parchment"
					style={{
						borderRadius: 12,
						overflow: 'hidden',
						border: `1px solid var(--color-border)`,
						background: 'var(--color-bg)',
						color: 'var(--color-text-primary)',
					}}
				>
					<div
						style={{
							padding: '18px 20px',
							borderBottom: `1px solid var(--color-border)`,
							background: 'var(--color-surface)',
						}}
					>
						<div
							style={{ font: `700 19px var(--font-display)`, color: 'var(--color-text-primary)' }}
						>
							{title.trim() || t('community.wiki.previewFallbackTitle')}
						</div>
						<div style={{ font: `12px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
							{t('community.wiki.previewSubtitle', { count: eligible })}
						</div>
					</div>
					<div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
						<div
							style={{
								font: `600 12px var(--font-sans)`,
								letterSpacing: '.08em',
								textTransform: 'uppercase',
								color: 'var(--color-text-tertiary)',
							}}
						>
							{t('community.wiki.previewPages')}
						</div>
						{eligibleNotes.slice(0, 3).map((n) => (
							<div key={n.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
								<span
									style={{
										flex: 1,
										font: `13.5px var(--font-sans)`,
										color: 'var(--color-text-primary)',
									}}
								>
									{n.title}
								</span>
								<span
									style={{ font: `11px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}
								>
									{formatDate(new Date(n.updatedAt))}
								</span>
							</div>
						))}
						{eligible === 0 && (
							<div style={{ font: `12.5px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
								{t('community.wiki.previewEmpty')}
							</div>
						)}
						{eligible > 3 && (
							<div style={{ font: `11px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
								{t('community.wiki.previewMore', { count: eligible - 3 })}
							</div>
						)}
					</div>
				</div>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{t('community.wiki.previewNote')}
				</div>
			</Panel>
		</div>
	);
}

/** The shared eligibility stat row (eligible player-visible notes / total notes). */
export function EligibilityStat({ eligible, total }: { eligible: number; total: number }) {
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
			<Stat
				label={t('community.wiki.eligiblePages')}
				value={`${eligible}/${total}`}
				icon="knowledge-book"
			/>
			<Stat
				label={t('community.wiki.theme')}
				value={t('settings.appearance.themeParchment')}
				icon="theme"
			/>
		</div>
	);
}
