import { useCallback, useEffect, useState } from 'react';
import { type WidgetPackageDefinition } from '@dndtools/core';
import { Badge, Button, Dialog, EmptyState, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { deleteModule, getModule, listModules, type ModuleListing } from '../../cloud/appApi';
import { MarketplaceGate, errText, kb } from './shared';
import { useI18n } from '../../i18n';

export function CommDiscover() {
	const { t, formatDate } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [modules, setModules] = useState<ModuleListing[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [selId, setSelId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [review, setReview] = useState<{
		listing: ModuleListing;
		definition: WidgetPackageDefinition;
		isUpgrade: boolean;
	} | null>(null);
	// Removing a listing deletes it server-side for everyone (no undo exists), so it confirms first.
	const [confirmRemove, setConfirmRemove] = useState<ModuleListing | null>(null);

	const load = useCallback(() => {
		setFailed(false);
		listModules()
			.then(setModules)
			.catch(() => setFailed(true));
	}, []);
	useEffect(() => {
		if (cloudReady) load();
	}, [cloudReady, load]);

	if (!cloudReady) return <MarketplaceGate signInPrompt="community.market.signInBrowse" />;

	const sel = modules?.find((m) => m.moduleId === selId) ?? modules?.[0] ?? null;

	// Fetch the payload, sanity-check the definition shape, then hand off to the review dialog. The
	// core install command re-validates the full definition fail-closed — this check is only so the
	// dialog can show honest facts (id/widget count) before the user commits.
	const startInstall = (listing: ModuleListing) => {
		setBusy(true);
		getModule(listing.moduleId)
			.then((full) => {
				const def = full.package as WidgetPackageDefinition;
				if (!def || typeof def !== 'object' || typeof def.id !== 'string' || !def.id) {
					Toaster.error(t('community.discover.notAPackage'));
					return;
				}
				const existing = runtime.state.widgets.packages[def.id];
				const isUpgrade = !!existing && !existing.removedAt;
				if (isUpgrade && def.id.startsWith('system.')) {
					Toaster.error(t('community.discover.clashesWithSystem'));
					return;
				}
				setReview({ listing, definition: def, isUpgrade });
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	const confirmInstall = async () => {
		if (!review) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: review.isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: review.definition },
			});
			if (result.status === 'accepted') {
				Toaster.success(
					review.isUpgrade
						? t('community.discover.upgraded', { id: review.definition.id })
						: t('community.discover.installed', { id: review.definition.id }),
				);
				setReview(null);
			} else {
				Toaster.error(result.rejection.message);
			}
		} catch (e) {
			// `dispatchNow` RETHROWS a failed persist. Without this the review Dialog just sat there
			// looking untouched and the user re-pressed Install — `runExport` below already gets this
			// right.
			Toaster.error(errText(e, t('community.discover.installFailed')));
		} finally {
			setBusy(false);
		}
	};

	const removeListing = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmRemove(null);
				Toaster.success(t('community.discover.listingRemoved'));
				setModules((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				{failed ? (
					<Panel title={t('community.discover.modules')}>
						<EmptyState
							inset
							icon="warning"
							title={t('community.discover.loadFailed')}
							description={t('community.discover.loadFailedBody')}
							action={
								<Button variant="secondary" size="sm" icon="retry" onClick={load}>
									{t('common.action.retry')}
								</Button>
							}
						/>
					</Panel>
				) : modules === null ? (
					<Panel title={t('community.discover.modules')}>
						<LoadingRegion
							label={t('community.discover.loading')}
							style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
						>
							<Skeleton height={96} />
							<Skeleton height={96} />
						</LoadingRegion>
					</Panel>
				) : modules.length === 0 ? (
					<EmptyState
						icon="globe"
						title={t('community.discover.emptyTitle')}
						description={t('community.discover.emptyBody')}
					/>
				) : (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 250px),1fr))',
							gap: 14,
						}}
					>
						{modules.map((m) => (
							<button
								key={m.moduleId}
								type="button"
								// Selection was border+shadow only, so a screen-reader user pressing these cards
								// got no confirmation that anything changed (the detail panel is elsewhere in
								// the DOM). `aria-pressed` makes the toggle state part of the button's name.
								aria-pressed={sel?.moduleId === m.moduleId}
								onClick={() => setSelId(m.moduleId)}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
									padding: 14,
									borderRadius: 12,
									cursor: 'pointer',
									textAlign: 'left',
									border: `1px solid ${sel?.moduleId === m.moduleId ? T.accBd : T.bd}`,
									background: T.surf,
									boxShadow: sel?.moduleId === m.moduleId ? T.smd : 'none',
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `700 14px ${T.disp}`, flex: 1, minWidth: 0 }}>{m.name}</span>
									{m.owned && <Badge status="accent">{t('community.discover.yours')}</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									v{m.version} · {kb(m.size)} · {formatDate(new Date(m.publishedAt))}
								</div>
								<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>
									{m.summary}
								</div>
							</button>
						))}
					</div>
				)}
			</div>
			{sel && (
				<Panel accent title={sel.name} action={<Badge status="neutral">v{sel.version}</Badge>}>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('community.discover.listingMeta', {
							date: formatDate(new Date(sel.publishedAt)),
							size: kb(sel.size),
							fingerprint: sel.contentHash.slice(0, 12),
						})}
					</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>{sel.summary}</div>
					<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
						{t('community.discover.installNote')}
					</div>
					<Button
						variant="primary"
						size="md"
						icon="import"
						disabled={busy}
						onClick={() => startInstall(sel)}
					>
						{t('community.discover.installToVault')}
					</Button>
					{sel.owned && (
						<Button
							variant="ghost"
							size="sm"
							icon="trash"
							disabled={busy}
							onClick={() => setConfirmRemove(sel)}
						>
							{t('community.discover.removeListing')}
						</Button>
					)}
				</Panel>
			)}
			<Dialog
				open={confirmRemove !== null}
				onClose={() => setConfirmRemove(null)}
				title={t('community.discover.removeTitle')}
				description={t('community.discover.removeDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setConfirmRemove(null)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="trash"
							disabled={busy}
							onClick={() => confirmRemove && removeListing(confirmRemove)}
						>
							{busy ? t('community.discover.removing') : t('community.discover.removeListing')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{confirmRemove?.name}</strong>{' '}
					{t('community.discover.removeBody')}
				</div>
			</Dialog>
			<Dialog
				open={review !== null}
				onClose={() => setReview(null)}
				title={t(
					review?.isUpgrade ? 'community.discover.upgradeTitle' : 'community.discover.installTitle',
				)}
				description={t('community.discover.installDescription')}
				icon="import"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="import"
							disabled={busy}
							onClick={() => void confirmInstall()}
						>
							{busy
								? t('community.discover.working')
								: t(
										review?.isUpgrade
											? 'community.discover.upgradePackage'
											: 'community.discover.installPackage',
									)}
						</Button>
					</>
				}
			>
				{review && (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							font: `12.5px/1.6 ${T.sans}`,
							color: T.sub,
						}}
					>
						<div>
							<strong style={{ color: T.ink }}>
								{review.definition.displayName ?? review.definition.id}
							</strong>{' '}
							· v{review.definition.version}
						</div>
						<div>
							{t('community.discover.widgetCount', {
								count: Array.isArray(review.definition.widgets)
									? review.definition.widgets.length
									: 0,
							})}{' '}
							· {t('community.discover.packageId')}{' '}
							<code style={{ font: `11.5px ${T.mono}` }}>{review.definition.id}</code>
						</div>
						<div style={{ color: T.ter, font: `11.5px/1.5 ${T.sans}` }}>
							{t(
								review.isUpgrade
									? 'community.discover.upgradeNote'
									: 'community.discover.installDisabledNote',
							)}
						</div>
					</div>
				)}
			</Dialog>
		</div>
	);
}
