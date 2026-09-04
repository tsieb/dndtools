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

export function CommWiki() {
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const navigate = useNavigate();
	const { plan, loading: planLoading, canChangePlan } = useEntitlements();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	// Publishing is a Beacon feature (the server enforces it too — this only keeps the UI honest).
	const canPublish = cloudReady && plan === 'beacon';

	const [title, setTitle] = useState('My Campaign Wiki');
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
			Toaster.error('Public wiki links are not configured for this desktop build.');
			return;
		}
		if (!canPublish) {
			Toaster.error('Updating a hosted wiki is included in the Beacon preview.');
			return;
		}
		if (pages.length === 0) {
			Toaster.error('Mark at least one note player-visible in Knowledge before publishing.');
			return;
		}
		if (!title.trim()) {
			Toaster.error('Give the wiki a title.');
			return;
		}
		if (access === 'password' && password.trim().length < 6) {
			Toaster.error('A password wiki needs a password of at least 6 characters.');
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
				Toaster.success(
					status
						? 'Wiki updated — the public link is unchanged.'
						: 'Wiki published — share the public link.',
				);
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	const unpublish = () => {
		setBusy(true);
		unpublishWiki()
			.then(() => {
				setStatus(null);
				setConfirmUnpublish(false);
				Toaster.success('Wiki unpublished — the public link no longer works.');
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	const copyLink = async (url: string) => {
		try {
			await navigator.clipboard.writeText(url);
			Toaster.success('Public link copied.');
		} catch {
			Toaster.error('Could not copy — copy the link manually.');
		}
	};

	// The settings/publish column adapts to the tier; the reading preview is always shown.
	let settings: React.ReactNode;
	if (!isAccountApiConfigured) {
		settings = (
			<Panel title="Publish settings" action={<Badge status="neutral">Local-only build</Badge>}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Public wiki hosting is not available in this edition. The reading preview still shows
					exactly which campaign notes would be included.
				</div>
				<EligibilityStat eligible={eligible} total={notes.length} />
			</Panel>
		);
	} else if (auth.status !== 'signed-in') {
		settings = (
			<Panel title="Publish settings" action={<Badge status="neutral">Signed out</Badge>}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<div style={{ flex: '1 1 220px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Sign in to publish a hosted campaign wiki. Everything else here works without an
						account.
					</div>
					<Button
						variant="primary"
						size="sm"
						icon="UserCircle"
						onClick={() => auth.openAuthModal()}
					>
						Sign in
					</Button>
				</div>
				<EligibilityStat eligible={eligible} total={notes.length} />
			</Panel>
		);
	} else if (!canPublish && status === null) {
		settings = (
			<Panel title="Publish settings" action={<Badge status="accent">Beacon</Badge>}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{planLoading
						? 'Checking your plan…'
						: canChangePlan
							? 'Publishing a hosted campaign wiki is a Beacon feature. Your player-visible notes are ready — try the Beacon preview at no charge to publish.'
							: 'Publishing a hosted campaign wiki is a Beacon feature. Your player-visible notes are ready, but plan changes are unavailable in this release.'}
				</div>
				<Button
					variant="primary"
					size="md"
					icon="sparkle"
					disabled={planLoading}
					onClick={() => navigate('/upgrade')}
				>
					See plans
				</Button>
				<EligibilityStat eligible={eligible} total={notes.length} />
			</Panel>
		);
	} else if (statusFailed) {
		settings = (
			<Panel title="Publish settings">
				<EmptyState
					inset
					icon="warning"
					title="Couldn’t load your wiki"
					description="Check your connection and try again."
					action={
						<Button variant="secondary" size="sm" icon="retry" onClick={loadStatus}>
							Retry
						</Button>
					}
				/>
			</Panel>
		);
	} else if (status === undefined) {
		settings = (
			<Panel title="Publish settings">
				<LoadingRegion
					label="Loading wiki status"
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
			<Panel title="Published wiki" action={<Badge status="success">Live</Badge>}>
				<div style={{ ...eb }}>Public link</div>
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
						{url ?? 'Public app URL is not configured.'}
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
						Copy
					</Button>
				</div>
				<div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
					<Stat
						label="Access"
						value={WIKI_ACCESS_MODES.find((m) => m.value === status.access)?.label ?? status.access}
						icon="lock"
					/>
					<Stat label="Pages" value={String(status.pageCount)} icon="knowledge-book" />
					<Stat label="Size" value={kb(status.size)} icon="upload" />
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					Published {new Date(status.publishedAt).toLocaleDateString()} · updated{' '}
					{new Date(status.updatedAt).toLocaleString()}.
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
						This wiki remains live.{' '}
						{canChangePlan
							? 'Try the Beacon preview to update its pages; you can unpublish it from any plan.'
							: 'Plan changes are unavailable in this release, but you can still unpublish the wiki.'}
					</div>
				)}
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{canPublish ? (
						<Button variant="secondary" size="md" icon="upload" disabled={busy} onClick={publish}>
							{busy ? 'Working…' : 'Re-publish current notes'}
						</Button>
					) : (
						<Button variant="primary" size="md" icon="sparkle" onClick={() => navigate('/upgrade')}>
							{canChangePlan ? 'Try Beacon preview' : 'View plan details'}
						</Button>
					)}
					<Button
						variant="ghost"
						size="md"
						icon="delete"
						disabled={busy}
						onClick={() => setConfirmUnpublish(true)}
					>
						Unpublish
					</Button>
				</div>
				<Dialog
					open={confirmUnpublish}
					onClose={() => setConfirmUnpublish(false)}
					title="Unpublish this wiki?"
					description="The public link stops working immediately — this cannot be undone."
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
								Cancel
							</Button>
							<Button variant="danger" size="sm" icon="delete" disabled={busy} onClick={unpublish}>
								{busy ? 'Unpublishing…' : 'Unpublish wiki'}
							</Button>
						</>
					}
				>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Anyone holding the link loses access at once. Your notes stay in the vault — you can
						publish again later (a new link is minted).
					</div>
				</Dialog>
			</Panel>
		);
	} else {
		// Signed-in, Beacon, nothing published yet: the publish form.
		settings = (
			<Panel title="Publish settings">
				<div style={{ ...eb }}>Title</div>
				<Input
					value={title}
					onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
					placeholder="Campaign wiki title"
					aria-label="Wiki title"
					maxLength={120}
				/>
				<div style={{ ...eb, marginTop: 10 }}>Access</div>
				<div
					role="radiogroup"
					aria-label="Wiki access"
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
								<div style={{ font: `600 12.5px ${T.sans}` }}>{m.label}</div>
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{m.note}</div>
							</span>
						</button>
					))}
				</div>
				{access === 'password' && (
					<Input
						type="password"
						value={password}
						onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
						placeholder="Reader password (min 6 characters)"
						aria-label="Wiki password"
						maxLength={100}
					/>
				)}
				<EligibilityStat eligible={eligible} total={notes.length} />
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					Only player-visible notes publish — DM-only notes never leave the vault. Readers need no
					account.
				</div>
				<Button
					variant="primary"
					size="md"
					icon="upload"
					disabled={busy || eligible === 0}
					onClick={publish}
				>
					{busy ? 'Publishing…' : 'Publish wiki'}
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
			<Panel title="Reading preview">
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
							{title.trim() || 'Your campaign wiki'}
						</div>
						<div style={{ font: `12px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
							A campaign wiki · {eligible} {eligible === 1 ? 'page' : 'pages'}
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
							Player-visible pages
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
									{new Date(n.updatedAt).toLocaleDateString()}
								</span>
							</div>
						))}
						{eligible === 0 && (
							<div style={{ font: `12.5px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
								No player-visible notes yet — mark notes player-visible in Knowledge to include
								them.
							</div>
						)}
						{eligible > 3 && (
							<div style={{ font: `11px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
								… and {eligible - 3} more
							</div>
						)}
					</div>
				</div>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					Only player-visible notes appear. DM-only blocks are stripped from the published page.
				</div>
			</Panel>
		</div>
	);
}

/** The shared eligibility stat row (eligible player-visible notes / total notes). */
export function EligibilityStat({ eligible, total }: { eligible: number; total: number }) {
	return (
		<div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
			<Stat label="Eligible pages" value={`${eligible}/${total}`} icon="knowledge-book" />
			<Stat label="Theme" value="Parchment" icon="theme" />
		</div>
	);
}
