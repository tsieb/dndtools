// Plan entitlements for gm-react. One hook — useEntitlements() — answers "what plan is
// this table on and what does it include" for every surface (Upgrade, Settings).
//
// Three sources, in trust order:
//   • SERVER — account backend configured + signed in: the server's entitlement row and
//     feature matrix are authoritative (and explicitly simulated — no payment processor).
//   • CACHE — configured + signed in but the fetch failed (offline): THIS ACCOUNT'S
//     last known server answer persisted to localStorage. Never invented, only remembered.
//   • LOCAL — backend not configured or signed out: the device-local plan choice
//     (the same 'dndtools:react:plan' key the screens have always shared).
//
// FAIL-CLOSED: any error with no cached answer resolves to the FREE plan ('hearth').
// Nothing in this module can fail open into a paid tier.
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { ReactNode } from 'react';
import { isAccountApiConfigured } from './config';
import { useAuth } from './AuthContext';
import {
	getEntitlements as fetchEntitlements,
	setPlan as pushPlan,
	PLAN_IDS,
	type FeatureMatrix,
	type PlanId,
} from './appApi';

export type { PlanId, FeatureMatrix, FeatureGroup, FeatureRow, FeatureCell } from './appApi';
export { PLAN_IDS } from './appApi';

export const FREE_PLAN: PlanId = 'hearth';

/** Presentation data for the three plan cards (marketing copy lives client-side; the
 *  feature COMPARISON matrix is served by the backend — see OFFLINE_FALLBACK_MATRIX). */
export interface PlanCard {
	id: PlanId;
	name: string;
	tagline: string;
	price: number;
	cloud: boolean;
	popular?: boolean;
	features: string[];
}
export const PLAN_CARDS: PlanCard[] = [
	{
		id: 'hearth',
		name: 'Hearth',
		tagline: 'Local-first, forever free',
		price: 0,
		cloud: false,
		features: [
			'On-device campaign vault',
			'All table tools, maps & fog',
			'Manual and nearby-device play',
			'Bring-your-own AI assistant',
			'Browse community modules',
		],
	},
	{
		id: 'lantern',
		name: 'Lantern',
		tagline: 'Encrypted off-device backup',
		price: 7,
		cloud: true,
		popular: true,
		features: [
			'Everything in Hearth',
			'Encrypted off-device backup',
			'Manual restore with the same vault key',
			'Internet remote play',
			'1 co-DM seat',
		],
	},
	{
		id: 'beacon',
		name: 'Beacon',
		tagline: 'Publishing and larger tables',
		price: 15,
		cloud: true,
		features: [
			'Everything in Lantern',
			'3 co-DM seats',
			'Publish public campaign wikis',
			'Campaign publishing controls',
		],
	},
];

/** Offline fallback for the feature-comparison matrix. The account backend serves the
 *  authoritative copy (single source of truth); this mirror renders only when the server
 *  answer (live or cached) is unavailable. Keep in sync with the server's FEATURE_MATRIX
 *  in packages/cloud-fns/src/app-api/handler.ts. */
export const OFFLINE_FALLBACK_MATRIX: FeatureMatrix = [
	{
		group: 'At the table',
		rows: [
			{ label: 'On-device vault', hearth: true, lantern: true, beacon: true },
			{ label: 'Core widgets, maps & fog', hearth: true, lantern: true, beacon: true },
			{ label: 'Co-DM seats', hearth: false, lantern: '1', beacon: '3' },
			{ label: 'Manual & nearby-device play', hearth: true, lantern: true, beacon: true },
			{ label: 'Bring-your-own AI assistant', hearth: true, lantern: true, beacon: true },
		],
	},
	{
		group: 'Cloud',
		rows: [
			{
				label: 'Encrypted off-device backup',
				cloud: true,
				hearth: false,
				lantern: true,
				beacon: true,
			},
			{
				label: 'Manual restore with the same vault key',
				cloud: true,
				hearth: false,
				lantern: true,
				beacon: true,
			},
			{ label: 'Internet remote play', cloud: true, hearth: false, lantern: true, beacon: true },
		],
	},
	{
		group: 'Community & publish',
		rows: [
			{ label: 'Browse community modules', hearth: true, lantern: true, beacon: true },
			{ label: 'Publish community modules', hearth: true, lantern: true, beacon: true },
			{ label: 'Public campaign wikis', cloud: true, hearth: false, lantern: false, beacon: true },
		],
	},
];

// The SAME device-local key Upgrade/Settings have always shared, so the plan choice
// stays consistent across screens whether or not the backend is configured.
const PLAN_KEY = 'dndtools:react:plan';
// Last KNOWN server entitlements (plan + matrix) for offline reads. Every entry is scoped
// by Cognito sub so one account can never inherit another account's paid capabilities.
// Written only from a real server answer — never synthesized.
const CACHE_KEY = 'dndtools:react:entitlements:last';

const isPlanId = (v: unknown): v is PlanId => (PLAN_IDS as readonly string[]).includes(v as string);

export function readLocalPlan(): PlanId {
	try {
		const v = window.localStorage.getItem(PLAN_KEY);
		if (isPlanId(v)) return v;
	} catch {
		/* ignore */
	}
	return FREE_PLAN;
}

function writeLocalPlan(plan: PlanId) {
	try {
		window.localStorage.setItem(PLAN_KEY, plan);
	} catch {
		/* ignore */
	}
}

interface CachedEntitlements {
	plan: PlanId;
	features: FeatureMatrix;
	canChangePlan: boolean;
	simulated: boolean;
}

function cacheKey(accountId: string): string {
	return `${CACHE_KEY}:${encodeURIComponent(accountId)}`;
}

function readCache(accountId: string): CachedEntitlements | null {
	try {
		const raw = window.localStorage.getItem(cacheKey(accountId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			plan?: unknown;
			features?: unknown;
			canChangePlan?: unknown;
			simulated?: unknown;
		};
		if (!isPlanId(parsed.plan) || !Array.isArray(parsed.features)) return null;
		return {
			plan: parsed.plan,
			features: parsed.features as FeatureMatrix,
			// Old caches predate the production gate. Fail closed rather than assuming
			// a remembered preview still permits account changes.
			canChangePlan: parsed.canChangePlan === true,
			simulated: parsed.simulated === true,
		};
	} catch {
		return null;
	}
}

function writeCache(accountId: string, value: CachedEntitlements) {
	try {
		window.localStorage.setItem(cacheKey(accountId), JSON.stringify(value));
	} catch {
		/* ignore */
	}
}

export type EntitlementsSource = 'server' | 'cache' | 'local';

export interface EntitlementsValue {
	/** The active plan. Fail-closed: errors without a cached answer resolve to 'hearth'. */
	plan: PlanId;
	/** Feature-comparison matrix — server (live/cached) when available, offline fallback otherwise. */
	features: FeatureMatrix;
	/** Where the current answer came from. */
	source: EntitlementsSource;
	/** True while the initial server fetch is in flight. */
	loading: boolean;
	/** True when plan changes go to the account backend (configured + signed in). */
	serverBacked: boolean;
	/** Whether this deployment currently permits changing the plan from the app. */
	canChangePlan: boolean;
	/** True only for the explicitly enabled no-payment preview. */
	simulated: boolean;
	/** Change the plan: server + cache when server-backed, device-local otherwise. */
	setPlan(plan: PlanId): Promise<void>;
	refresh(): Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
	const auth = useAuth();
	const accountId =
		isAccountApiConfigured && auth.status === 'signed-in' && auth.user?.sub ? auth.user.sub : null;
	const authResolving = isAccountApiConfigured && auth.status === 'loading';
	const serverBacked = accountId !== null;
	const [plan, setPlanState] = useState<PlanId>(() => readLocalPlan());
	const [features, setFeatures] = useState<FeatureMatrix>(OFFLINE_FALLBACK_MATRIX);
	const [source, setSource] = useState<EntitlementsSource>('local');
	const [loading, setLoading] = useState(serverBacked);
	const [canChangePlan, setCanChangePlan] = useState(!serverBacked);
	const [simulated, setSimulated] = useState(!serverBacked);
	const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(null);
	const activeAccountRef = useRef(accountId);
	const requestSequenceRef = useRef(0);
	activeAccountRef.current = accountId;

	const refresh = useCallback(async () => {
		const requestId = ++requestSequenceRef.current;
		if (!accountId) {
			setPlanState(readLocalPlan());
			setFeatures(OFFLINE_FALLBACK_MATRIX);
			setSource('local');
			setCanChangePlan(true);
			setSimulated(true);
			setLoading(false);
			setResolvedAccountId(null);
			return;
		}
		// A signed-in account never sees the preceding account's answer while its own
		// request is loading. The render below also derives this fail-closed view before
		// the effect has had a chance to run.
		setPlanState(FREE_PLAN);
		setFeatures(OFFLINE_FALLBACK_MATRIX);
		setSource('local');
		setCanChangePlan(false);
		setSimulated(false);
		setLoading(true);
		setResolvedAccountId(accountId);
		try {
			const ent = await fetchEntitlements();
			if (requestId !== requestSequenceRef.current || activeAccountRef.current !== accountId)
				return;
			const next: CachedEntitlements = {
				plan: isPlanId(ent.plan) ? ent.plan : FREE_PLAN,
				features:
					Array.isArray(ent.features) && ent.features.length
						? ent.features
						: OFFLINE_FALLBACK_MATRIX,
				canChangePlan: ent.canChangePlan === true,
				simulated: ent.simulated === true,
			};
			setPlanState(next.plan);
			setFeatures(next.features);
			setSource('server');
			setCanChangePlan(next.canChangePlan);
			setSimulated(next.simulated);
			writeCache(accountId, next);
		} catch {
			if (requestId !== requestSequenceRef.current || activeAccountRef.current !== accountId)
				return;
			// Offline / backend error: remember the LAST KNOWN server answer; with no cache,
			// fail CLOSED to the free tier — never open into a paid plan.
			const cached = readCache(accountId);
			setPlanState(cached?.plan ?? FREE_PLAN);
			setFeatures(cached?.features ?? OFFLINE_FALLBACK_MATRIX);
			setSource(cached ? 'cache' : 'local');
			setCanChangePlan(cached?.canChangePlan ?? false);
			setSimulated(cached?.simulated ?? false);
		} finally {
			if (requestId === requestSequenceRef.current && activeAccountRef.current === accountId)
				setLoading(false);
		}
	}, [accountId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const setPlan = useCallback(
		async (next: PlanId) => {
			if (!isPlanId(next)) throw new Error('Unknown plan.');
			if (accountId) {
				if (!canChangePlan) {
					throw new Error('Self-service cloud plan changes are not available in this release.');
				}
				const requestId = ++requestSequenceRef.current;
				setLoading(true);
				try {
					const ent = await pushPlan(next); // throws on failure — callers surface it; state unchanged
					if (requestId !== requestSequenceRef.current || activeAccountRef.current !== accountId)
						return;
					const confirmed = isPlanId(ent.plan) ? ent.plan : FREE_PLAN;
					const confirmedFeatures =
						Array.isArray(ent.features) && ent.features.length
							? ent.features
							: OFFLINE_FALLBACK_MATRIX;
					setPlanState(confirmed);
					setFeatures(confirmedFeatures);
					setSource('server');
					const confirmedCanChange = ent.canChangePlan === true;
					const confirmedSimulated = ent.simulated === true;
					setCanChangePlan(confirmedCanChange);
					setSimulated(confirmedSimulated);
					setResolvedAccountId(accountId);
					writeCache(accountId, {
						plan: confirmed,
						features: confirmedFeatures,
						canChangePlan: confirmedCanChange,
						simulated: confirmedSimulated,
					});
					return;
				} finally {
					if (requestId === requestSequenceRef.current && activeAccountRef.current === accountId)
						setLoading(false);
				}
			}
			setPlanState(next);
			setCanChangePlan(true);
			setSimulated(true);
			writeLocalPlan(next);
		},
		[accountId, canChangePlan],
	);

	const changingAccount = authResolving || resolvedAccountId !== accountId;
	const visiblePlan = changingAccount ? FREE_PLAN : plan;
	const visibleFeatures = changingAccount ? OFFLINE_FALLBACK_MATRIX : features;
	const visibleSource = changingAccount ? 'local' : source;
	const visibleLoading = loading || changingAccount;
	const visibleCanChangePlan = changingAccount ? false : canChangePlan;
	const visibleSimulated = changingAccount ? false : simulated;

	const value = useMemo<EntitlementsValue>(
		() => ({
			plan: visiblePlan,
			features: visibleFeatures,
			source: visibleSource,
			loading: visibleLoading,
			serverBacked,
			canChangePlan: visibleCanChangePlan,
			simulated: visibleSimulated,
			setPlan,
			refresh,
		}),
		[
			visiblePlan,
			visibleFeatures,
			visibleSource,
			visibleLoading,
			serverBacked,
			visibleCanChangePlan,
			visibleSimulated,
			setPlan,
			refresh,
		],
	);

	return createElement(EntitlementsContext.Provider, { value }, children);
}

export function useEntitlements(): EntitlementsValue {
	const ctx = useContext(EntitlementsContext);
	if (!ctx) throw new Error('useEntitlements must be used within <EntitlementsProvider>');
	return ctx;
}

/** Non-hook read for surfaces outside the provider: device-local plan only (fail-closed). */
export function currentLocalPlan(): PlanId {
	return readLocalPlan();
}

/**
 * How many CO-DM SEATS a plan includes. Mirrors the 'Co-DM seats' row of the feature matrix
 * (hearth: none, lantern: 1, beacon: 3) and the marketing copy. This is the entitlement the
 * Settings promote-to-Co-DM flow enforces (passed to the Core `permission.assign-role` command,
 * which fails closed when a promotion would exceed it). Fail-closed: an unknown plan ⇒ 0 seats.
 */
const CO_DM_SEATS_BY_PLAN: Record<PlanId, number> = { hearth: 0, lantern: 1, beacon: 3 };
export function coDmSeatsForPlan(plan: PlanId): number {
	return CO_DM_SEATS_BY_PLAN[plan] ?? 0;
}
