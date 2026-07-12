// Typed client for the app-api backend (marketplace / invites / account / entitlements).
// One authedFetch seam: Cognito ID token via getIdToken(), base URL from cloudConfig.
// LOCAL-FIRST + FAIL-CLOSED: every function throws a typed 'not-configured' AppApiError
// when the backend isn't in this build — callers render their labeled local state instead.
// Server 400s carry safe messages (the handler never leaks internals); anything else is
// normalized to a generic, user-presentable message.
import { cloudConfig, isAccountApiConfigured } from './config';
import { getIdToken } from './auth';

// --- plans + feature matrix (shapes mirror the server's single source of truth) ---------
export type PlanId = 'hearth' | 'lantern' | 'beacon';
export const PLAN_IDS: readonly PlanId[] = ['hearth', 'lantern', 'beacon'] as const;
export type FeatureCell = boolean | string;
export interface FeatureRow {
  label: string;
  cloud?: boolean;
  hearth: FeatureCell;
  lantern: FeatureCell;
  beacon: FeatureCell;
}
export interface FeatureGroup {
  group: string;
  rows: FeatureRow[];
}
export type FeatureMatrix = FeatureGroup[];

export interface Entitlements {
  plan: PlanId;
  /** ALWAYS true — there is no payment processor; plan changes are simulated. */
  simulated: true;
  features: FeatureMatrix;
}

export interface ModuleListing {
  moduleId: string;
  name: string;
  summary: string;
  version: string;
  publishedAt: string;
  contentHash: string;
  size: number;
  /** True when the caller published this module (the server never echoes owner ids). */
  owned: boolean;
}
export interface ModuleWithPackage extends ModuleListing {
  package: unknown;
}

export interface Invite {
  inviteId: string;
  token: string;
  campaignName: string;
  note: string;
  /** Optional co-DM role carried on the invite (absent for a plain player invite). */
  role?: string;
  createdAt: string;
  /** Epoch seconds (14-day TTL). */
  expiresAt: number;
}

/**
 * Outcome of the OPTIONAL invite-email delivery. The link + QR always work regardless:
 *  • `none`           — no recipient was supplied (link-only invite).
 *  • `sent`           — SES accepted the message (`emailedTo` echoes the address).
 *  • `not-configured` — this deployment has no verified sender wired in — share the link.
 *  • `failed`         — SES rejected the send (unverified/sandbox) — share the link.
 */
export type InviteEmailStatus = 'none' | 'sent' | 'not-configured' | 'failed';

/** createInvite result — the minted Invite plus the (best-effort) email-delivery status. */
export interface CreateInviteResult extends Invite {
  emailStatus: InviteEmailStatus;
  /** Present only when emailStatus === 'sent' — the address the invite went to. */
  emailedTo?: string;
}
export interface ResolvedInvite {
  campaignName: string;
  note: string;
  invitedBy: string;
  expiresAt: number;
}

export interface Profile {
  email: string;
  displayName: string;
  createdAt: string;
}
export interface Device {
  deviceKey: string;
  name: string;
  lastSeen: string;
}

export type AppApiErrorCode = 'not-configured' | 'unauthenticated' | 'http' | 'network';

/** A typed failure with a SAFE, user-presentable message. */
export class AppApiError extends Error {
  constructor(
    message: string,
    readonly code: AppApiErrorCode = 'http',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

const base = () => cloudConfig.appApiUrl.replace(/\/$/, '');

async function errorFrom(res: Response): Promise<AppApiError> {
  let message = `Cloud request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: unknown };
    // Only 4xx messages are client-caused and safe/useful; a 500 is deliberately generic.
    if (res.status < 500 && typeof body.error === 'string' && body.error) message = body.error;
  } catch {
    /* non-JSON body: keep the generic message */
  }
  return new AppApiError(message, 'http', res.status);
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/** Authenticated fetch against the app-api. Throws AppApiError, never raw fetch errors. */
async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isAccountApiConfigured)
    throw new AppApiError('Cloud account backend is not configured for this build.', 'not-configured');
  const token = await getIdToken();
  if (!token) throw new AppApiError('Sign in to use cloud account features.', 'unauthenticated', 401);
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
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
  return parse<T>(res);
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

// --- Entitlements (simulated checkout — no payment is ever processed) --------------------
export function getEntitlements(): Promise<Entitlements> {
  return authedFetch<Entitlements>('/account/entitlements');
}

export function setPlan(plan: PlanId): Promise<Entitlements> {
  return authedFetch<Entitlements>('/account/entitlements', post({ plan }));
}

// --- Marketplace --------------------------------------------------------------------------
export async function listModules(): Promise<ModuleListing[]> {
  const res = await authedFetch<{ modules: ModuleListing[] }>('/marketplace/modules');
  return res.modules;
}

export async function publishModule(input: {
  name: string;
  summary: string;
  version: string;
  package: unknown;
}): Promise<string> {
  const res = await authedFetch<{ moduleId: string }>('/marketplace/modules', post(input));
  return res.moduleId;
}

export function getModule(moduleId: string): Promise<ModuleWithPackage> {
  return authedFetch<ModuleWithPackage>(`/marketplace/modules/${encodeURIComponent(moduleId)}`);
}

export async function deleteModule(moduleId: string): Promise<void> {
  await authedFetch<{ ok: true }>(`/marketplace/modules/${encodeURIComponent(moduleId)}`, {
    method: 'DELETE',
  });
}

// --- Invites --------------------------------------------------------------------------------
/**
 * Mint a server-side join link (+ token the UI renders as a QR). `email` is OPTIONAL: when
 * supplied the backend also tries to send the invite via SES — but delivery is best-effort,
 * so the link/QR are returned no matter what and `emailStatus` reports whether the mail went.
 */
export function createInvite(input: {
  campaignName: string;
  note?: string;
  email?: string;
  role?: string;
}): Promise<CreateInviteResult> {
  return authedFetch<CreateInviteResult>('/invites', post(input));
}

export async function listInvites(): Promise<Invite[]> {
  const res = await authedFetch<{ invites: Invite[] }>('/invites');
  return res.invites;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await authedFetch<{ ok: true }>(`/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' });
}

/** The one UNAUTHENTICATED call — invitees have no account yet. Needs only the API URL. */
export async function resolveInvite(token: string): Promise<ResolvedInvite> {
  if (!cloudConfig.appApiUrl)
    throw new AppApiError('Cloud account backend is not configured for this build.', 'not-configured');
  let res: Response;
  try {
    res = await fetch(`${base()}/invites/resolve/${encodeURIComponent(token)}`);
  } catch {
    throw new AppApiError('Could not reach the cloud service — check your connection.', 'network');
  }
  if (res.status === 404 || res.status === 410)
    throw new AppApiError('This invite link is invalid or has expired.', 'http', res.status);
  return parse<ResolvedInvite>(res);
}

// --- Account ----------------------------------------------------------------------------------
export function getProfile(): Promise<Profile> {
  return authedFetch<Profile>('/account/profile');
}

export async function updateProfile(displayName: string): Promise<string> {
  const res = await authedFetch<{ ok: true; displayName: string }>('/account/profile', {
    method: 'PUT',
    body: JSON.stringify({ displayName }),
  });
  return res.displayName;
}

export async function listDevices(): Promise<Device[]> {
  const res = await authedFetch<{ devices: Device[] }>('/account/devices');
  return res.devices;
}

export async function revokeDevice(deviceKey: string): Promise<void> {
  await authedFetch<{ ok: true }>('/account/devices/revoke', post({ deviceKey }));
}

/** Global sign-out: revokes every session's tokens on every device. */
export async function revokeAllSessions(): Promise<void> {
  await authedFetch<{ ok: true }>('/account/devices/revoke', post({}));
}

/** Everything the app backend holds about the account (vault content is E2EE, not here). */
export function exportAccountData(): Promise<Record<string, unknown>> {
  return authedFetch<Record<string, unknown>>('/account/export', { method: 'POST' });
}

/** Permanent: signs out everywhere, purges backend rows, deletes the Cognito identity. */
export async function deleteAccount(): Promise<void> {
  await authedFetch<{ ok: true }>('/account', { method: 'DELETE' });
}
