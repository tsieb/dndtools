import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { Badge, Button, Dialog, Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { DiscoverShelf } from './DiscoverShelf';
import {
	installPlanCommand,
	installPlanItemCount,
	planModuleInstall,
	type InstallPlan,
} from './moduleInstall';
import {
	KIND_LABEL,
	ListingRatings,
	MarketplaceGate,
	errText,
	fetchListingPackage,
	getFeaturedListings,
	kb,
	recordInstall,
	removeListing,
	searchListings,
	useMarketplaceReady,
	type DiscoveryListing,
	type ListingQuery,
	type ListingSearch,
} from './shared';

/** RC-CLD-4.5 — how long typing has to settle before the shelf asks the server again. */
const SEARCH_DEBOUNCE_MS = 250;

const NO_FILTERS: ListingQuery = { q: '', kind: 'all', system: '', license: '' };

export function CommDiscover() {
	const { t, formatDate } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const ready = useMarketplaceReady();
	// RC-CLD-4.5 — the shelf is a SERVER-SIDE search: words, kind, system and licence all travel to
	// `GET /listings`, and the server answers with the matches and the facets to filter by next.
	// RC-SYS-3.4's kind filter is the same control; it now narrows on the server instead of in here.
	const [query, setQuery] = useState<ListingQuery>(NO_FILTERS);
	const [debouncedQ, setDebouncedQ] = useState('');
	const [result, setResult] = useState<ListingSearch | null>(null);
	const [featured, setFeatured] = useState<DiscoveryListing[]>([]);
	const [failed, setFailed] = useState(false);
	const [selId, setSelId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// RC-CLD-4.1 — the review a module runs before anything enters the vault. The PLAN says which
	// flow that is: a widget package goes to the package install/upgrade, a content module to the
	// transactional `content.commit-import`, a system package to `system.define`.
	const [review, setReview] = useState<{
		listing: DiscoveryListing;
		// A plan that could not be understood never reaches the review: it is reported and dropped.
		plan: Exclude<InstallPlan, { kind: 'not-a-module' }>;
		isUpgrade: boolean;
	} | null>(null);
	// Removing a listing deletes it server-side for everyone (no undo exists), so it confirms first.
	const [confirmRemove, setConfirmRemove] = useState<DiscoveryListing | null>(null);
	const requestSeq = useRef(0);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedQ(query.q.trim()), SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [query.q]);

	const load = useCallback(() => {
		// Only the newest request may land: a slow answer to an older query never overwrites it.
		const seq = ++requestSeq.current;
		setFailed(false);
		searchListings({
			q: debouncedQ,
			kind: query.kind,
			system: query.system,
			license: query.license,
		})
			.then((next) => {
				if (seq === requestSeq.current) setResult(next);
			})
			.catch(() => {
				if (seq === requestSeq.current) setFailed(true);
			});
	}, [debouncedQ, query.kind, query.system, query.license]);
	// The featured row is a garnish: when it cannot load, the row is absent and the shelf still works.
	const loadFeatured = useCallback(() => {
		getFeaturedListings()
			.then(setFeatured)
			.catch(() => setFeatured([]));
	}, []);
	useEffect(() => {
		if (ready) load();
	}, [ready, load]);
	useEffect(() => {
		if (ready) loadFeatured();
	}, [ready, loadFeatured]);

	if (!ready) return <MarketplaceGate signInPrompt="community.market.signInBrowse" />;

	const listings = result?.listings ?? [];
	// A featured card can name a listing the current filter hides; the detail panel still opens it.
	const sel = [...listings, ...featured].find((m) => m.moduleId === selId) ?? listings[0] ?? null;
	const filtersActive = Boolean(
		query.q.trim() || query.kind !== 'all' || query.system || query.license,
	);
	const onlyKindFilter = query.kind !== 'all' && !query.q.trim() && !query.system && !query.license;

	/** Apply a change to one listing wherever it is shown: the shelf and the featured row. */
	const patchListing = (moduleId: string, patch: Partial<DiscoveryListing>) => {
		const apply = (m: DiscoveryListing) => (m.moduleId === moduleId ? { ...m, ...patch } : m);
		setResult((current) => current && { ...current, listings: current.listings.map(apply) });
		setFeatured((current) => current.map(apply));
	};

	// Fetch the payload, resolve it to an install plan, then hand off to the review dialog. Every
	// core command re-validates fail-closed — this pass is only so the dialog can show honest facts
	// (kind, id, how many things would land) before the DM commits.
	const startInstall = (listing: DiscoveryListing) => {
		setBusy(true);
		fetchListingPackage(listing.moduleId)
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
				// RC-CLD-4.5 — the install record is what lets this DM rate the module. The vault
				// install has already happened, so a failure here costs only the rating form.
				const installedId = review.listing.moduleId;
				recordInstall(installedId)
					.then(() => patchListing(installedId, { installed: true }))
					.catch(() => Toaster.error(t('community.discover.installNotRecorded')));
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

	const removeFromMarketplace = (listing: DiscoveryListing) => {
		setBusy(true);
		removeListing(listing.moduleId)
			.then(() => {
				setConfirmRemove(null);
				Toaster.success(t('community.discover.listingRemoved'));
				const keep = (m: DiscoveryListing) => m.moduleId !== listing.moduleId;
				setResult(
					(current) =>
						current && {
							...current,
							listings: current.listings.filter(keep),
							total: Math.max(0, current.total - 1),
						},
				);
				setFeatured((current) => current.filter(keep));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr',
				gap: T.space.five,
				alignItems: 'start',
			}}
		>
			<DiscoverShelf
				query={query}
				setQuery={setQuery}
				result={result}
				featured={featured}
				failed={failed}
				listings={listings}
				sel={sel}
				filtersActive={filtersActive}
				onlyKindFilter={onlyKindFilter}
				setSelId={setSelId}
				load={load}
				loadFeatured={loadFeatured}
			/>
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
					<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
						v{sel.version} ·{' '}
						{t('community.discover.listingMeta', {
							date: formatDate(new Date(sel.publishedAt)),
							size: kb(sel.size),
							fingerprint: sel.contentHash.slice(0, 12),
						})}
					</div>
					{(sel.systems.length > 0 || sel.license) && (
						<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{[
								sel.systems.length > 0
									? t('community.discover.systemsMeta', { systems: sel.systems.join(', ') })
									: '',
								sel.license ? t('community.discover.licenseMeta', { license: sel.license }) : '',
							]
								.filter(Boolean)
								.join(' · ')}
						</div>
					)}
					<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>{sel.summary}</div>
					<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
						{t('community.discover.installNote')}
					</div>
					{/* Fail closed: a scene package has no installer in this release, so the screen says so
					    rather than offering a button that could only fail. */}
					{sel.kind === 'scene-package' ? (
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
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
					<ListingRatings
						key={sel.moduleId}
						listing={sel}
						onRated={(next) => patchListing(next.moduleId, next)}
					/>
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
							onClick={() => confirmRemove && removeFromMarketplace(confirmRemove)}
						>
							{busy ? t('community.discover.removing') : t('community.discover.removeListing')}
						</Button>
					</>
				}
			>
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
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
							gap: T.space.two,
							font: `var(--text-sm)/1.6 ${T.sans}`,
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
									<code style={{ font: `var(--text-xs) ${T.mono}` }}>
										{review.plan.definition.id}
									</code>
								</div>
								<div style={{ color: T.ter, font: `var(--text-xs)/1.5 ${T.sans}` }}>
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
									<code style={{ font: `var(--text-xs) ${T.mono}` }}>
										{review.plan.bundle.manifest.id}
									</code>
								</div>
								{/* What lands, named, before anything is written. The DM reviews, then disposes. */}
								{review.plan.kind === 'content-module' && (
									<ul
										style={{ margin: T.space.zero, paddingInlineStart: T.space.five, color: T.ter }}
									>
										{review.plan.files.slice(0, 8).map((file) => (
											<li key={file.path} style={{ font: `var(--text-xs)/1.6 ${T.mono}` }}>
												{file.path}
											</li>
										))}
										{review.plan.files.length > 8 && (
											<li style={{ font: `var(--text-xs)/1.6 ${T.sans}` }}>
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
								<div style={{ color: T.ter, font: `var(--text-xs)/1.5 ${T.sans}` }}>
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
