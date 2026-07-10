// Plan entitlements for gm-react. One hook — useEntitlements() — answers "what plan is
// this table on and what does it include" for every surface (Upgrade, Settings).
//
// Three sources, in trust order:
//   • SERVER — account backend configured + signed in: the server's entitlement row and
//     feature matrix are authoritative (and explicitly simulated — no payment processor).
//   • CACHE — configured + signed in but the fetch failed (offline): the LAST KNOWN
//     server answer persisted to localStorage. Never invented, only remembered.
//   • LOCAL — backend not configured or signed out: the device-local plan choice
//     (the same 'dndtools:react:plan' key the screens have always shared).
//
// FAIL-CLOSED: any error with no cached answer resolves to the FREE plan ('hearth').
// Nothing in this module can fail open into a paid tier.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
      '1 device, on-device vault',
      'Up to 4 players at the table',
      'All core widgets & maps',
      'Community modules (read-only)',
      'No cloud sync or backup',
    ],
  },
  {
    id: 'lantern',
    name: 'Lantern',
    tagline: 'Cloud sync for your table',
    price: 7,
    cloud: true,
    popular: true,
    features: [
      'Everything in Hearth',
      'Cloud sync across devices',
      'Up to 6 players + 1 co-DM',
      '20 GB vault storage',
      '500 AI assist credits / mo',
      'Live audio projection',
    ],
  },
  {
    id: 'beacon',
    name: 'Beacon',
    tagline: 'For the always-on campaign',
    price: 15,
    cloud: true,
    features: [
      'Everything in Lantern',
      'Up to 12 players + 3 co-DMs',
      '200 GB vault storage',
      'Unlimited AI assist credits',
      'Priority sync & support',
      'Publish public campaign wikis',
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
      { label: 'Players at the table', hearth: '4', lantern: '6', beacon: '12' },
      { label: 'Co-DM seats', hearth: false, lantern: '1', beacon: '3' },
      { label: 'Community modules (read-only)', hearth: true, lantern: true, beacon: true },
    ],
  },
  {
    group: 'Cloud',
    rows: [
      { label: 'Sync across devices', cloud: true, hearth: false, lantern: true, beacon: true },
      { label: 'Off-device backup', cloud: true, hearth: false, lantern: true, beacon: true },
      { label: 'Vault storage', cloud: true, hearth: '—', lantern: '20 GB', beacon: '200 GB' },
      { label: 'Live audio projection', cloud: true, hearth: false, lantern: true, beacon: true },
    ],
  },
  {
    group: 'Assist & publish',
    rows: [
      { label: 'AI assist credits', cloud: true, hearth: false, lantern: '500 / mo', beacon: 'Unlimited' },
      { label: 'Public campaign wikis', cloud: true, hearth: false, lantern: false, beacon: true },
      { label: 'Priority sync & support', cloud: true, hearth: false, lantern: false, beacon: true },
    ],
  },
];

// The SAME device-local key Upgrade/Settings have always shared, so the plan choice
// stays consistent across screens whether or not the backend is configured.
const PLAN_KEY = 'dndtools:react:plan';
// Last KNOWN server entitlements (plan + matrix) for offline reads. Written only from a
// real server answer — never synthesized.
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
}

function readCache(): CachedEntitlements | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { plan?: unknown; features?: unknown };
    if (!isPlanId(parsed.plan) || !Array.isArray(parsed.features)) return null;
    return { plan: parsed.plan, features: parsed.features as FeatureMatrix };
  } catch {
    return null;
  }
}

function writeCache(value: CachedEntitlements) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
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
  /** Plans are ALWAYS simulated — no payment is processed anywhere in this product. */
  simulated: true;
  /** Change the plan: server + cache when server-backed, device-local otherwise. */
  setPlan(plan: PlanId): Promise<void>;
  refresh(): Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const serverBacked = isAccountApiConfigured && auth.status === 'signed-in';
  const [plan, setPlanState] = useState<PlanId>(() => readLocalPlan());
  const [features, setFeatures] = useState<FeatureMatrix>(OFFLINE_FALLBACK_MATRIX);
  const [source, setSource] = useState<EntitlementsSource>('local');
  const [loading, setLoading] = useState(serverBacked);

  const refresh = useCallback(async () => {
    if (!serverBacked) {
      setPlanState(readLocalPlan());
      setFeatures(OFFLINE_FALLBACK_MATRIX);
      setSource('local');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ent = await fetchEntitlements();
      const next: CachedEntitlements = {
        plan: isPlanId(ent.plan) ? ent.plan : FREE_PLAN,
        features: Array.isArray(ent.features) && ent.features.length ? ent.features : OFFLINE_FALLBACK_MATRIX,
      };
      setPlanState(next.plan);
      setFeatures(next.features);
      setSource('server');
      writeCache(next);
      writeLocalPlan(next.plan); // keep the device-local key in step for other screens
    } catch {
      // Offline / backend error: remember the LAST KNOWN server answer; with no cache,
      // fail CLOSED to the free tier — never open into a paid plan.
      const cached = readCache();
      setPlanState(cached?.plan ?? FREE_PLAN);
      setFeatures(cached?.features ?? OFFLINE_FALLBACK_MATRIX);
      setSource(cached ? 'cache' : 'local');
    } finally {
      setLoading(false);
    }
  }, [serverBacked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setPlan = useCallback(
    async (next: PlanId) => {
      if (!isPlanId(next)) throw new Error('Unknown plan.');
      if (serverBacked) {
        const ent = await pushPlan(next); // throws on failure — callers surface it; state unchanged
        const confirmed = isPlanId(ent.plan) ? ent.plan : FREE_PLAN;
        setPlanState(confirmed);
        setSource('server');
        writeCache({ plan: confirmed, features });
        writeLocalPlan(confirmed);
        return;
      }
      setPlanState(next);
      writeLocalPlan(next);
    },
    [serverBacked, features],
  );

  const value = useMemo<EntitlementsValue>(
    () => ({ plan, features, source, loading, serverBacked, simulated: true, setPlan, refresh }),
    [plan, features, source, loading, serverBacked, setPlan, refresh],
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
