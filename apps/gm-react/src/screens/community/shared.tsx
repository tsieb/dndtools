import { useEffect, useId, useState } from 'react';
import type { ModuleKind, PermissionState } from '@dndtools/core';
import { Badge, Button, SegmentedControl, Skeleton, Textarea, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import {
	AppApiError,
	type ModuleListing,
	type ModuleWithPackage,
	type WikiAccess,
	type WikiPage,
} from '../../cloud/appApi';
import { publicAppHashUrl } from '../../platform/publicAppUrl';
import { useAuth } from '../../cloud/AuthContext';
import { getIdToken } from '../../cloud/auth';
import { cloudConfig, isAccountApiConfigured } from '../../cloud/config';
import { useI18n, type MessageKey } from '../../i18n';

/* The Community tabs' shared helpers: error text, the wiki access modes, the note→wiki-page
 * projection, and the signed-out / unconfigured marketplace gate. Extracted from Community.tsx
 * unchanged (RC-STB-2.6). RC-CLD-4.5 adds the discovery client and the rating/featured pieces
 * Discover renders. */

/** The caller supplies the fallback so it comes out of the catalog: a thrown error's own message
 * is already the server's words, but the generic sentence has to be translatable. */
export const errText = (e: unknown, fallback: string) =>
	e instanceof Error && e.message ? e.message : fallback;

/** ARIA radio-group contract (mirrors Onboarding's): arrows move selection (selection follows
 * focus, wrapping), Tab skips the group as one stop. */

// Wiki access vocabulary shown in the publish settings. `value` matches the server's WikiAccess enum.
export const WIKI_ACCESS_MODES: { value: WikiAccess; label: MessageKey; note: MessageKey }[] = [
	{
		value: 'public',
		label: 'community.wiki.accessPublic',
		note: 'community.wiki.accessPublicNote',
	},
	{
		value: 'unlisted',
		label: 'community.wiki.accessUnlisted',
		note: 'community.wiki.accessUnlistedNote',
	},
	{
		value: 'password',
		label: 'community.wiki.accessPassword',
		note: 'community.wiki.accessPasswordNote',
	},
];

/** Lowercase kebab-case slug matching the server's WIKI_SLUG_RE (`[a-z0-9][a-z0-9-]{0,119}`). */
export function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);
}

export interface EligibleNote {
	id: string;
	title: string;
	body: string;
	updatedAt: string;
}

/** Build the player-safe page bundle the server persists: one page per player-visible note, with a
 *  stable, de-duplicated slug. Only text fields cross the wire — the reader renders the markdown as
 *  React nodes (never innerHTML), so hosted content can't script a reader. */
export function buildWikiPages(notes: EligibleNote[]): WikiPage[] {
	const seen = new Set<string>();
	return notes.map((n) => {
		const root = slugify(n.title) || 'page';
		let slug = root;
		for (let i = 2; seen.has(slug); i++) slug = `${root}-${i}`.slice(0, 120);
		seen.add(slug);
		return { slug, title: n.title, markdown: n.body, updatedAt: n.updatedAt };
	});
}

/** The public reader URL for a published wiki (chrome-less `#/wiki?id=…` route, HashRouter-safe). */
export const wikiPublicUrl = (wikiId: string) => publicAppHashUrl('/wiki', { id: wikiId });

/** Fail-closed marketplace gate: local-only build, or signed out. */
export function MarketplaceGate({ signInPrompt }: { signInPrompt: MessageKey }) {
	const { t } = useI18n();
	const auth = useAuth();
	if (!isAccountApiConfigured) {
		return (
			<Panel
				title={t('community.market.title')}
				action={<Badge status="neutral">{t('community.market.localOnly')}</Badge>}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('community.market.unavailable')}
				</div>
			</Panel>
		);
	}
	return (
		<Panel
			title={t('community.market.title')}
			action={<Badge status="neutral">{t('community.market.signedOut')}</Badge>}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t(signInPrompt)}
				</div>
				<Button variant="primary" size="sm" icon="UserCircle" onClick={() => auth.openAuthModal()}>
					{t('community.market.signIn')}
				</Button>
			</div>
		</Panel>
	);
}

/**
 * RC-CLD-4.1 — the actor a PORTABLE `content.export` is evaluated against.
 *
 * Core fails closed: a portable export whose viewer is the DM (or an unknown actor) contains
 * NOTHING, because a DM viewer would pull dm-only items through an actor-filtered read under a
 * "portable" label. So every portable export must name a real player actor; absent one, '' keeps
 * the fail-closed empty result rather than leaking.
 */
export function representativePlayerActorId(permissions: PermissionState): string {
	return (
		(Object.values(permissions.actors) as Array<{ id: string; role: string }>).find(
			(actor) => actor.role === 'player',
		)?.id ?? ''
	);
}

export const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

/** RC-CLD-4.1 — the listing kinds, in the DM's words. */
export const KIND_LABEL: Record<string, MessageKey> = {
	'widget-package': 'community.discover.kindWidget',
	'system-package': 'community.discover.kindSystem',
	'scene-package': 'community.discover.kindScene',
	'content-module': 'community.discover.kindContent',
};

// --- RC-CLD-4.5 — the discovery client -------------------------------------------------------
// The typed client for the app API's discovery routes. It sits beside the screens that use it and
// keeps the shared client's rules: fail closed when the backend is not in this build, and pass on
// a 4xx's safe message but never a 5xx's.

export interface RatingSummary {
	/** Mean stars to one decimal, or null when nobody has rated the listing yet. */
	average: number | null;
	count: number;
}

export interface DiscoveryListing extends ModuleListing {
	systems: string[];
	license: string;
	rating: RatingSummary;
	featured: boolean;
	/** The caller has an install record, which is what a rating requires. */
	installed: boolean;
	myReview: { reviewId: string; stars: number; note: string } | null;
}

export interface ListingQuery {
	q: string;
	kind: 'all' | ModuleKind;
	system: string;
	license: string;
}

export interface ListingSearch {
	listings: DiscoveryListing[];
	total: number;
	/** Filter options, computed over the whole shelf rather than the filtered result. */
	facets: { systems: string[]; licenses: string[] };
}

export interface ListingReview {
	reviewId: string;
	stars: number;
	note: string;
	createdAt: string;
	updatedAt: string;
	mine: boolean;
}

/**
 * DEV-only e2e seam. The e2e server blanks every cloud coordinate (isolation-guard.spec.ts), so a
 * spec that drives discovery sets `window.__dndtoolsAppApiE2e = { baseUrl }` with a `.invalid`
 * origin and answers it with `page.route`. `import.meta.env.DEV` is statically false in a
 * production build, which drops this branch entirely, and a `.invalid` host (RFC 2606) cannot
 * resolve even in development, so nothing can reach a real server through it.
 */
function e2eAppApiUrl(): string {
	if (!import.meta.env.DEV || typeof window === 'undefined') return '';
	const url = (window as unknown as { __dndtoolsAppApiE2e?: { baseUrl?: unknown } })
		.__dndtoolsAppApiE2e?.baseUrl;
	return typeof url === 'string' && /^https:\/\/[a-z0-9.-]+\.invalid(?:\/[\w/-]*)?$/.test(url)
		? url.replace(/\/$/, '')
		: '';
}

/** This build (or, in development, the e2e stand-in) has the marketplace backend. */
export function hasMarketplaceBackend(): boolean {
	return isAccountApiConfigured || Boolean(e2eAppApiUrl());
}

/** Discovery can be used right now: the backend exists and the DM is signed in to it. */
export function useMarketplaceReady(): boolean {
	const auth = useAuth();
	return Boolean(e2eAppApiUrl()) || (isAccountApiConfigured && auth.status === 'signed-in');
}

async function discoveryFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
	const e2eBase = e2eAppApiUrl();
	if (!e2eBase && !isAccountApiConfigured)
		throw new AppApiError(
			'Online account services are not available in this edition.',
			'not-configured',
		);
	const token = e2eBase ? 'e2e' : await getIdToken();
	if (!token)
		throw new AppApiError('Sign in to use cloud account features.', 'unauthenticated', 401);
	const base = e2eBase || cloudConfig.appApiUrl.replace(/\/$/, '');
	let res: Response;
	try {
		res = await fetch(`${base}${path}`, {
			...init,
			headers: {
				'content-type': 'application/json',
				...(init.headers ?? {}),
				authorization: `Bearer ${token}`,
			},
		});
	} catch {
		throw new AppApiError('Could not reach the cloud service — check your connection.', 'network');
	}
	if (!res.ok) {
		let message = `Cloud request failed (${res.status}).`;
		try {
			const body = (await res.json()) as { error?: unknown };
			if (res.status < 500 && typeof body.error === 'string' && body.error) message = body.error;
		} catch {
			/* non-JSON body: keep the generic message */
		}
		throw new AppApiError(message, 'http', res.status);
	}
	return (await res.json()) as T;
}

const listingPath = (moduleId: string) => `/listings/${encodeURIComponent(moduleId)}`;

/** Search the shelf. Every filter is applied by the server; an empty field is no filter. */
export function searchListings(query: ListingQuery): Promise<ListingSearch> {
	const params = new URLSearchParams();
	if (query.q.trim()) params.set('q', query.q.trim());
	if (query.kind !== 'all') params.set('kind', query.kind);
	if (query.system) params.set('system', query.system);
	if (query.license) params.set('license', query.license);
	const qs = params.toString();
	return discoveryFetch<ListingSearch>(`/listings${qs ? `?${qs}` : ''}`);
}

export async function getFeaturedListings(): Promise<DiscoveryListing[]> {
	return (await discoveryFetch<{ featured: DiscoveryListing[] }>('/listings/featured')).featured;
}

/** A listing's `.dndmodule` payload, for the install review. */
export function fetchListingPackage(moduleId: string): Promise<ModuleWithPackage> {
	return discoveryFetch<ModuleWithPackage>(`/marketplace/modules/${encodeURIComponent(moduleId)}`);
}

export async function removeListing(moduleId: string): Promise<void> {
	await discoveryFetch<{ ok: true }>(`/marketplace/modules/${encodeURIComponent(moduleId)}`, {
		method: 'DELETE',
	});
}

/** Tell the marketplace this DM installed the listing: the record a rating requires. */
export async function recordInstall(moduleId: string): Promise<void> {
	await discoveryFetch<{ ok: true }>(`${listingPath(moduleId)}/install`, {
		method: 'POST',
		body: '{}',
	});
}

export function rateListing(
	moduleId: string,
	stars: number,
	note: string,
): Promise<{ review: Omit<ListingReview, 'mine'>; rating: RatingSummary }> {
	return discoveryFetch(`${listingPath(moduleId)}/review`, {
		method: 'PUT',
		body: JSON.stringify({ stars, note }),
	});
}

export function listReviews(
	moduleId: string,
): Promise<{ reviews: ListingReview[]; rating: RatingSummary }> {
	return discoveryFetch(`${listingPath(moduleId)}/reviews`);
}

export async function flagReview(moduleId: string, reviewId: string): Promise<void> {
	await discoveryFetch<{ ok: true }>(
		`${listingPath(moduleId)}/reviews/${encodeURIComponent(reviewId)}/flag`,
		{ method: 'POST', body: '{}' },
	);
}

// --- RC-CLD-4.5 — ratings and the featured row -----------------------------------------------

/** Mirrors the server's note bound (MAX_REVIEW_NOTE_CHARS). */
const MAX_REVIEW_NOTE = 280;
const STAR = '★';
const EMPTY_STAR = '☆';
const STAR_OPTIONS = [1, 2, 3, 4, 5].map((stars) => ({
	value: String(stars),
	label: `${stars} ${STAR}`,
}));

/** "4.5 ★ · 2 ratings", or "No ratings yet". Announced as a sentence, not as glyphs. */
export function RatingText({ rating }: { rating: RatingSummary }) {
	const { t } = useI18n();
	if (rating.average === null) {
		return (
			<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
				{t('community.discover.noRatings')}
			</span>
		);
	}
	const values = { average: rating.average, count: rating.count };
	return (
		<span
			role="img"
			aria-label={t('community.discover.ratingLabel', values)}
			style={{ font: `600 11.5px ${T.sans}`, color: T.sub }}
		>
			{t('community.discover.ratingSummary', values)}
		</span>
	);
}

/** The maintainers' featured set, above the shelf. Choosing a card opens it in the detail panel. */
export function FeaturedRow({
	listings,
	selectedId,
	onSelect,
}: {
	listings: DiscoveryListing[];
	selectedId: string | null;
	onSelect: (moduleId: string) => void;
}) {
	const { t } = useI18n();
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: T.space.two, flexWrap: 'wrap' }}>
				<h2
					id={headingId}
					style={{ margin: T.space.zero, font: `700 14px ${T.disp}`, color: T.ink }}
				>
					{t('community.discover.featured')}
				</h2>
				<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{t('community.discover.featuredNote')}
				</span>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 200px),1fr))',
					gap: T.space.three,
				}}
			>
				{listings.map((m) => (
					<button
						key={m.moduleId}
						type="button"
						aria-pressed={selectedId === m.moduleId}
						onClick={() => onSelect(m.moduleId)}
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'flex-start',
							gap: T.space.one,
							padding: T.space.three,
							borderRadius: T.radius.lg,
							cursor: 'pointer',
							textAlign: 'left',
							border: `1px solid ${selectedId === m.moduleId ? T.accBd : T.bd}`,
							background: T.accSub,
						}}
					>
						<span style={{ font: `700 13.5px ${T.disp}`, color: T.ink }}>{m.name}</span>
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							{t(KIND_LABEL[m.kind] ?? 'community.discover.kindWidget')}
						</span>
						<RatingText rating={m.rating} />
					</button>
				))}
			</div>
		</section>
	);
}

/**
 * A listing's ratings and the caller's own. The policy is the server's; this only explains it
 * before it is enforced: a publisher cannot rate their own module, and a rating needs an install.
 * Mount it with `key={moduleId}` so the form starts from that listing's saved rating.
 */
export function ListingRatings({
	listing,
	onRated,
}: {
	listing: DiscoveryListing;
	onRated: (next: DiscoveryListing) => void;
}) {
	const { t, formatDate } = useI18n();
	const headingId = useId();
	const { moduleId } = listing;
	const [reviews, setReviews] = useState<ListingReview[] | 'failed' | null>(null);
	const [stars, setStars] = useState(listing.myReview?.stars ?? 0);
	const [note, setNote] = useState(listing.myReview?.note ?? '');
	const [saving, setSaving] = useState(false);
	const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set());

	useEffect(() => {
		let live = true;
		listReviews(moduleId)
			.then((res) => live && setReviews(res.reviews))
			.catch(() => live && setReviews('failed'));
		return () => {
			live = false;
		};
	}, [moduleId]);

	const save = () => {
		if (stars < 1 || saving) return;
		setSaving(true);
		rateListing(moduleId, stars, note.trim())
			.then((res) => {
				Toaster.success(t('community.discover.ratingSaved'));
				onRated({
					...listing,
					rating: res.rating,
					myReview: {
						reviewId: res.review.reviewId,
						stars: res.review.stars,
						note: res.review.note,
					},
				});
				// The saved rating is already true; a failed refresh only leaves the older list showing.
				listReviews(moduleId)
					.then((next) => setReviews(next.reviews))
					.catch(() => undefined);
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setSaving(false));
	};

	const report = (reviewId: string) => {
		flagReview(moduleId, reviewId)
			.then(() => {
				setReported((current) => new Set(current).add(reviewId));
				Toaster.success(t('community.discover.reported'));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))));
	};

	const hint = (key: MessageKey) => (
		<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>{t(key)}</div>
	);

	return (
		<section
			aria-labelledby={headingId}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				borderTop: `1px solid ${T.bd}`,
				paddingTop: T.space.three,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: T.space.two, flexWrap: 'wrap' }}>
				<h3
					id={headingId}
					style={{ margin: T.space.zero, font: `700 13px ${T.sans}`, color: T.ink }}
				>
					{t('community.discover.ratingsTitle')}
				</h3>
				<RatingText rating={listing.rating} />
			</div>
			{listing.owned ? (
				hint('community.discover.rateOwn')
			) : !listing.installed ? (
				hint('community.discover.rateNeedsInstall')
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
					<SegmentedControl
						ariaLabel={t('community.discover.yourRating')}
						size="sm"
						value={stars > 0 ? String(stars) : ''}
						onChange={(value: string) => setStars(Number(value))}
						options={STAR_OPTIONS}
					/>
					<Textarea
						value={note}
						rows={3}
						maxLength={MAX_REVIEW_NOTE}
						aria-label={t('community.discover.reviewNote')}
						placeholder={t('community.discover.reviewNotePlaceholder')}
						onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
					/>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: T.space.two,
						}}
					>
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							{t('community.discover.noteCount', { count: note.length, max: MAX_REVIEW_NOTE })}
						</span>
						<Button
							variant="secondary"
							size="sm"
							icon="check"
							disabled={saving || stars < 1}
							onClick={save}
						>
							{t(
								listing.myReview
									? 'community.discover.updateRating'
									: 'community.discover.saveRating',
							)}
						</Button>
					</div>
				</div>
			)}
			{reviews === null ? (
				<LoadingRegion label={t('community.discover.loadingReviews')}>
					<Skeleton height={36} />
				</LoadingRegion>
			) : reviews === 'failed' ? (
				hint('community.discover.reviewsFailed')
			) : reviews.length === 0 ? (
				hint('community.discover.noReviews')
			) : (
				<ul
					style={{
						listStyle: 'none',
						margin: T.space.zero,
						padding: T.space.zero,
						display: 'flex',
						flexDirection: 'column',
						gap: T.space.two,
					}}
				>
					{reviews.map((r) => {
						const shown = Math.min(5, Math.max(0, r.stars));
						const wasReported = reported.has(r.reviewId);
						return (
							<li
								key={r.reviewId}
								style={{ display: 'flex', flexDirection: 'column', gap: T.space.one }}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: T.space.two,
										flexWrap: 'wrap',
									}}
								>
									<span
										role="img"
										aria-label={t('community.discover.starsLabel', { stars: shown })}
										style={{ color: T.acc, font: `12px ${T.sans}` }}
									>
										{STAR.repeat(shown)}
										{EMPTY_STAR.repeat(5 - shown)}
									</span>
									{r.mine && <Badge status="accent">{t('community.discover.yours')}</Badge>}
									<span style={{ flex: 1, font: `11px ${T.sans}`, color: T.ter }}>
										{formatDate(new Date(r.updatedAt))}
									</span>
									{!r.mine && (
										<Button
											variant="ghost"
											size="sm"
											icon="flag"
											disabled={wasReported}
											aria-label={wasReported ? undefined : t('community.discover.reportLabel')}
											onClick={() => report(r.reviewId)}
										>
											{t(
												wasReported
													? 'community.discover.reportedShort'
													: 'community.discover.report',
											)}
										</Button>
									)}
								</div>
								{r.note && (
									<div
										style={{
											font: `12px/1.5 ${T.sans}`,
											color: T.sub,
											overflowWrap: 'anywhere',
										}}
									>
										{r.note}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
