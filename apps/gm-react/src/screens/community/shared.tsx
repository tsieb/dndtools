import type { ModuleKind, PermissionState } from '@dndtools/core';
import { Panel, T } from '../../app/screen-kit';
import { useAuth } from '../../cloud/AuthContext';
import {
	AppApiError,
	type ModuleListing,
	type ModuleWithPackage,
	type WikiAccess,
	type WikiPage,
} from '../../cloud/appApi';
import { getIdToken } from '../../cloud/auth';
import { cloudConfig, isAccountApiConfigured } from '../../cloud/config';
import { Badge, Button, EmptyState } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { publicAppHashUrl } from '../../platform/publicAppUrl';

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
				<EmptyState
					illustration="community-empty"
					title={t('community.market.localOnly')}
					description={t('community.market.unavailable')}
				/>
			</Panel>
		);
	}
	return (
		<Panel
			title={t('community.market.title')}
			action={<Badge status="neutral">{t('community.market.signedOut')}</Badge>}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: T.space.three, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
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

export { FeaturedRow, ListingRatings, RatingText } from './Ratings';
