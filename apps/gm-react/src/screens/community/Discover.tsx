import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog, EmptyState, Input, Select, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { MODULE_KINDS, type ModuleKind } from '@dndtools/core';
import {
	FeaturedRow,
	KIND_LABEL,
	ListingRatings,
	MarketplaceGate,
	RatingText,
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
import {
	installPlanCommand,
	installPlanItemCount,
	planModuleInstall,
	type InstallPlan,
} from './moduleInstall';
import { useI18n } from '../../i18n';

/** RC-SYS-3.4 — the kind filter's options: every listing kind, plus "all". */
const KIND_FILTERS: Array<'all' | ModuleKind> = ['all', ...MODULE_KINDS];

/** RC-CLD-4.5 — how long typing has to settle before the shelf asks the server again. */
const SEARCH_DEBOUNCE_MS = 250;

const NO_FILTERS: ListingQuery = { q: '', kind: 'all', system: '', license: '' };

/** A chosen value stays in its menu even when the shelf no longer offers it. */
const withChosen = (values: string[], chosen: string) =>
	chosen && !values.includes(chosen) ? [chosen, ...values] : values;

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

	const facets = result?.facets ?? { systems: [], licenses: [] };
	const filterControl = (
		id: string,
		label: string,
		value: string,
		options: Array<{ value: string; label: string }>,
		onChange: (value: string) => void,
	) => (
		<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
			<label htmlFor={id} style={{ font: `600 12px ${T.sans}`, color: T.sub }}>
				{label}
			</label>
			<Select
				id={id}
				value={value}
				onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
				style={{ maxWidth: 200 }}
				options={options}
			/>
		</div>
	);
	const toolbar = (
		<div
			role="search"
			aria-label={t('community.discover.searchLabel')}
			style={{ display: 'flex', alignItems: 'center', gap: T.space.three, flexWrap: 'wrap' }}
		>
			<div style={{ flex: '1 1 220px', minWidth: 0 }}>
				<Input
					type="search"
					icon="search"
					value={query.q}
					maxLength={100}
					aria-label={t('community.discover.searchLabel')}
					placeholder={t('community.discover.searchPlaceholder')}
					onChange={(e: { target: { value: string } }) =>
						setQuery((current) => ({ ...current, q: e.target.value }))
					}
				/>
			</div>
			{filterControl(
				'community-kind-filter',
				t('community.discover.filterKind'),
				query.kind,
				KIND_FILTERS.map((kind) => ({
					value: kind,
					label: kind === 'all' ? t('community.discover.kindAll') : t(KIND_LABEL[kind]),
				})),
				(kind) => setQuery((current) => ({ ...current, kind: kind as 'all' | ModuleKind })),
			)}
			{filterControl(
				'community-system-filter',
				t('community.discover.filterSystem'),
				query.system,
				[
					{ value: '', label: t('community.discover.systemAny') },
					...withChosen(facets.systems, query.system).map((s) => ({ value: s, label: s })),
				],
				(system) => setQuery((current) => ({ ...current, system })),
			)}
			{filterControl(
				'community-license-filter',
				t('community.discover.filterLicense'),
				query.license,
				[
					{ value: '', label: t('community.discover.licenseAny') },
					...withChosen(facets.licenses, query.license).map((l) => ({ value: l, label: l })),
				],
				(license) => setQuery((current) => ({ ...current, license })),
			)}
		</div>
	);

	let shelf: ReactNode;
	if (failed) {
		shelf = (
			<Panel title={t('community.discover.modules')}>
				<EmptyState
					inset
					icon="warning"
					title={t('community.discover.loadFailed')}
					description={t('community.discover.loadFailedBody')}
					action={
						<Button
							variant="secondary"
							size="sm"
							icon="retry"
							onClick={() => {
								load();
								loadFeatured();
							}}
						>
							{t('common.action.retry')}
						</Button>
					}
				/>
			</Panel>
		);
	} else if (result === null) {
		shelf = (
			<Panel title={t('community.discover.modules')}>
				<LoadingRegion
					label={t('community.discover.loading')}
					style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
				>
					<Skeleton height={96} />
					<Skeleton height={96} />
				</LoadingRegion>
			</Panel>
		);
	} else if (listings.length === 0) {
		shelf = !filtersActive ? (
			<EmptyState
				icon="globe"
				title={t('community.discover.emptyTitle')}
				description={t('community.discover.emptyBody')}
			/>
		) : (
			<EmptyState
				icon="globe"
				title={t(
					onlyKindFilter
						? 'community.discover.emptyKindTitle'
						: 'community.discover.emptySearchTitle',
				)}
				description={t(
					onlyKindFilter
						? 'community.discover.emptyKindBody'
						: 'community.discover.emptySearchBody',
				)}
			/>
		);
	} else {
		shelf = (
			<div
				data-testid="discover-shelf"
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 250px),1fr))',
					gap: 14,
				}}
			>
				{listings.map((m) => (
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
							{m.featured && <Badge status="info">{t('community.discover.featuredBadge')}</Badge>}
							{m.owned && <Badge status="accent">{t('community.discover.yours')}</Badge>}
						</div>
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{t(KIND_LABEL[m.kind] ?? 'community.discover.kindWidget')} · v{m.version} ·{' '}
							{kb(m.size)} · {formatDate(new Date(m.publishedAt))}
						</div>
						<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>{m.summary}</div>
						<RatingText rating={m.rating} />
					</button>
				))}
			</div>
		);
	}
	// The toolbar stays mounted while a query is in play, so typing never loses focus to a reload.
	const showToolbar = filtersActive || listings.length > 0;

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
				{featured.length > 0 && (
					<FeaturedRow listings={featured} selectedId={sel?.moduleId ?? null} onSelect={setSelId} />
				)}
				{showToolbar && toolbar}
				{showToolbar && result !== null && (
					<div aria-live="polite" style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('community.discover.resultCount', { count: result.total })}
					</div>
				)}
				{shelf}
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
					{(sel.systems.length > 0 || sel.license) && (
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
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
