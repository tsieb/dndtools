import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dialog, EmptyState, Select, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { MODULE_KINDS, type ModuleKind } from '@dndtools/core';
import { deleteModule, getModule, listModules, type ModuleListing } from '../../cloud/appApi';
import { MarketplaceGate, errText, kb } from './shared';
import {
	installPlanCommand,
	installPlanItemCount,
	planModuleInstall,
	type InstallPlan,
} from './moduleInstall';
import { useI18n, type MessageKey } from '../../i18n';

/** RC-CLD-4.1 — the listing kinds, in the DM's words. */
const KIND_LABEL: Record<string, MessageKey> = {
	'widget-package': 'community.discover.kindWidget',
	'system-package': 'community.discover.kindSystem',
	'scene-package': 'community.discover.kindScene',
	'content-module': 'community.discover.kindContent',
};

/** RC-SYS-3.4 — the kind filter's options: every listing kind, plus "all". */
const KIND_FILTERS: Array<'all' | ModuleKind> = ['all', ...MODULE_KINDS];

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
	// RC-SYS-3.4 — a listing declares its kind, so the shelf can be narrowed to one. System packages
	// are the reason it exists: they are the only kind a DM browses for on purpose ("what else can I
	// play?"), and they were previously buried among widget packages and note bundles.
	const [kindFilter, setKindFilter] = useState<'all' | ModuleKind>('all');
	const [busy, setBusy] = useState(false);
	// RC-CLD-4.1 — the review a module runs before anything enters the vault. The PLAN says which
	// flow that is: a widget package goes to the package install/upgrade, a content module to the
	// transactional `content.commit-import`, a system package to `system.define`.
	const [review, setReview] = useState<{
		listing: ModuleListing;
		// A plan that could not be understood never reaches the review: it is reported and dropped.
		plan: Exclude<InstallPlan, { kind: 'not-a-module' }>;
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

	const visible =
		modules === null ? null : modules.filter((m) => kindFilter === 'all' || m.kind === kindFilter);
	// The filter can hide the selected listing; the detail panel then follows the filter rather than
	// describing something no longer on the shelf.
	const sel = visible?.find((m) => m.moduleId === selId) ?? visible?.[0] ?? null;

	// Fetch the payload, resolve it to an install plan, then hand off to the review dialog. Every
	// core command re-validates fail-closed — this pass is only so the dialog can show honest facts
	// (kind, id, how many things would land) before the DM commits.
	const startInstall = (listing: ModuleListing) => {
		setBusy(true);
		getModule(listing.moduleId)
			.then((full) => {
				const plan = planModuleInstall(
					full.package,
					t('community.discover.notAPackage'),
					runtime.state.systems,
				);
				if (plan.kind === 'not-a-module') {
					Toaster.error(plan.reason);
					return;
				}
				let isUpgrade = false;
				if (plan.kind === 'widget-package') {
					const existing = runtime.state.widgets.packages[plan.definition.id];
					isUpgrade = !!existing && !existing.removedAt;
					if (isUpgrade && plan.definition.id.startsWith('system.')) {
						Toaster.error(t('community.discover.clashesWithSystem'));
						return;
					}
				}
				setReview({ listing, plan, isUpgrade });
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	const confirmInstall = async () => {
		if (!review) return;
		const { plan } = review;
		if (plan.kind === 'unsupported') return;
		setBusy(true);
		try {
			const command = installPlanCommand(plan, { isUpgrade: review.isUpgrade });
			if (!command) return;
			const result = await runtime.dispatch({
				type: command.type as 'widget.package.install',
				actorId: dmId,
				payload: command.payload,
			});
			if (result.status === 'accepted') {
				Toaster.success(
					plan.kind === 'widget-package'
						? review.isUpgrade
							? t('community.discover.upgraded', { id: plan.definition.id })
							: t('community.discover.installed', { id: plan.definition.id })
						: t('community.discover.installedModule', {
								name: review.listing.name,
								count: installPlanItemCount(plan),
							}),
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

	const kindFilterControl = (
		<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
			<label htmlFor="community-kind-filter" style={{ font: `600 12px ${T.sans}`, color: T.sub }}>
				{t('community.discover.filterKind')}
			</label>
			<Select
				id="community-kind-filter"
				value={kindFilter}
				onChange={(e: { target: { value: string } }) =>
					setKindFilter(e.target.value as 'all' | ModuleKind)
				}
				style={{ maxWidth: 240 }}
				options={KIND_FILTERS.map((kind) => ({
					value: kind,
					label: kind === 'all' ? t('community.discover.kindAll') : t(KIND_LABEL[kind]),
				}))}
			/>
		</div>
	);

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
				) : visible!.length === 0 ? (
					<>
						{kindFilterControl}
						<EmptyState
							icon="globe"
							title={t('community.discover.emptyKindTitle')}
							description={t('community.discover.emptyKindBody')}
						/>
					</>
				) : (
					<>
						{kindFilterControl}
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 250px),1fr))',
								gap: 14,
							}}
						>
							{visible!.map((m) => (
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
										<span style={{ font: `700 14px ${T.disp}`, flex: 1, minWidth: 0 }}>
											{m.name}
										</span>
										{m.owned && <Badge status="accent">{t('community.discover.yours')}</Badge>}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{t(KIND_LABEL[m.kind] ?? 'community.discover.kindWidget')} · v{m.version} ·{' '}
										{kb(m.size)} · {formatDate(new Date(m.publishedAt))}
									</div>
									<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>
										{m.summary}
									</div>
								</button>
							))}
						</div>
					</>
				)}
			</div>
			{sel && (
				<Panel
					accent
					title={sel.name}
					action={
						<Badge status="neutral">
							{t(KIND_LABEL[sel.kind] ?? 'community.discover.kindWidget')}
						</Badge>
					}
				>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						v{sel.version} ·{' '}
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
					{/* Fail closed: a scene package has no installer in this release, so the screen says so
					    rather than offering a button that could only fail. */}
					{sel.kind === 'scene-package' ? (
						<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
							{t('community.discover.sceneUnsupported')}
						</div>
					) : (
						<Button
							variant="primary"
							size="md"
							icon="import"
							disabled={busy}
							onClick={() => startInstall(sel)}
						>
							{t('community.discover.installToVault')}
						</Button>
					)}
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
						{review?.plan.kind !== 'unsupported' && (
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
						)}
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
						{review.plan.kind === 'widget-package' ? (
							<>
								<div>
									<strong style={{ color: T.ink }}>
										{review.plan.definition.displayName ?? review.plan.definition.id}
									</strong>{' '}
									· v{review.plan.definition.version}
								</div>
								<div>
									{t('community.discover.widgetCount', { count: review.plan.itemCount })} ·{' '}
									{t('community.discover.packageId')}{' '}
									<code style={{ font: `11.5px ${T.mono}` }}>{review.plan.definition.id}</code>
								</div>
								<div style={{ color: T.ter, font: `11.5px/1.5 ${T.sans}` }}>
									{t(
										review.isUpgrade
											? 'community.discover.upgradeNote'
											: 'community.discover.installDisabledNote',
									)}
								</div>
							</>
						) : review.plan.kind === 'unsupported' ? (
							<div>{t('community.discover.sceneUnsupported')}</div>
						) : (
							<>
								<div>
									<strong style={{ color: T.ink }}>{review.plan.bundle.manifest.name}</strong> · v
									{review.plan.bundle.manifest.version} ·{' '}
									{t(KIND_LABEL[review.plan.bundle.manifest.kind])}
								</div>
								<div>
									{review.plan.kind === 'content-module'
										? t('community.discover.contentFileCount', { count: review.plan.files.length })
										: t('community.discover.systemPackageNote')}{' '}
									· {t('community.discover.packageId')}{' '}
									<code style={{ font: `11.5px ${T.mono}` }}>{review.plan.bundle.manifest.id}</code>
								</div>
								{/* What lands, named, before anything is written. The DM reviews, then disposes. */}
								{review.plan.kind === 'content-module' && (
									<ul style={{ margin: 0, paddingInlineStart: 18, color: T.ter }}>
										{review.plan.files.slice(0, 8).map((file) => (
											<li key={file.path} style={{ font: `11.5px/1.6 ${T.mono}` }}>
												{file.path}
											</li>
										))}
										{review.plan.files.length > 8 && (
											<li style={{ font: `11.5px/1.6 ${T.sans}` }}>
												{t('community.discover.moreFiles', {
													count: review.plan.files.length - 8,
												})}
											</li>
										)}
									</ul>
								)}
								{review.plan.kind === 'system-package' && review.plan.rehomed && (
									<div>
										{t('community.discover.systemRehomed', {
											id: review.plan.systemPackage.id,
										})}
									</div>
								)}
								<div style={{ color: T.ter, font: `11.5px/1.5 ${T.sans}` }}>
									{t(
										review.plan.kind === 'content-module'
											? 'community.discover.contentInstallNote'
											: 'community.discover.systemInstallNote',
									)}
								</div>
							</>
						)}
					</div>
				)}
			</Dialog>
		</div>
	);
}
