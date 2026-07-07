// Live AWS cloud validation (opt-in via `--live`). Every check here requires the
// `aws` capability (a working `dndtools` profile) and hits the deployed dev stacks,
// so it is off by default. Checks fall into two tiers:
//
//   Fast probes (new here): resolve SSM config, assert CloudFront security headers,
//   assert the sync API rejects unauthenticated calls, assert Cognito's OIDC
//   discovery doc is reachable. These are cheap and prove the stacks are up + wired.
//
//   Deep e2e (existing): infra/verify-signaling|turn|sync.sh — full protocol,
//   TURN relay, and E2EE round-trip + ciphertext-at-rest. These mint a real
//   ephemeral Cognito token and are the ground truth.
//
// All coordinates come from SSM (never hardcoded), matching how the app + the
// existing verify scripts resolve them.

import type { Check, CheckContext, CheckOutcome } from './types.ts';

const PROFILE = process.env.DNDTOOLS_PROFILE ?? 'dndtools';
const REGION = process.env.DNDTOOLS_REGION ?? 'ca-central-1';
const STAGE = process.env.DNDTOOLS_STAGE ?? 'dev';

const SSM_KEYS = {
	webUrl: 'web/url',
	wsUrl: 'signaling/ws-url',
	syncUrl: 'sync/api-url',
	userPoolId: 'identity/user-pool-id',
	appClientId: 'identity/app-client-id',
	issuerUrl: 'identity/issuer-url',
	turnUri: 'turn/uri',
} as const;

async function ssmGet(ctx: CheckContext, key: string): Promise<string> {
	const cmd =
		`aws ssm get-parameter --name /dndtools/${STAGE}/${key} ` +
		`--query Parameter.Value --output text --profile ${PROFILE} --region ${REGION}`;
	const res = await ctx.exec(cmd, { timeoutMs: 30_000 });
	if (res.code !== 0) throw new Error(`SSM ${key} not resolvable`);
	const val = res.tail.trim().split('\n').pop()!.trim();
	if (!val || val === 'None') throw new Error(`SSM ${key} empty`);
	return val;
}

async function resolveConfig(ctx: CheckContext): Promise<CheckOutcome> {
	const resolved: Record<string, string> = {};
	for (const [name, key] of Object.entries(SSM_KEYS)) {
		const val = await ssmGet(ctx, key);
		resolved[name] = val;
		ctx.shared[name] = val; // hand off to later cloud checks
		ctx.log(`${key} = ${val}`);
	}
	return {
		status: 'pass',
		summary: `resolved ${Object.keys(resolved).length} SSM coordinates for stage ${STAGE}`,
		detail: resolved,
	};
}

async function ensureConfig(ctx: CheckContext): Promise<void> {
	if (ctx.shared.webUrl) return; // already resolved by the config check
	for (const [name, key] of Object.entries(SSM_KEYS)) {
		if (!ctx.shared[name]) ctx.shared[name] = await ssmGet(ctx, key);
	}
}

async function cloudfrontHeaders(ctx: CheckContext): Promise<CheckOutcome> {
	await ensureConfig(ctx);
	const url = ctx.shared.webUrl;
	const res = await fetch(url, { redirect: 'manual' });
	const h = res.headers;
	const required = {
		'content-security-policy': h.get('content-security-policy'),
		'strict-transport-security': h.get('strict-transport-security'),
		'x-content-type-options': h.get('x-content-type-options'),
		'x-frame-options': h.get('x-frame-options') ?? h.get('content-security-policy'),
	};
	ctx.log(`GET ${url} → ${res.status}`);
	for (const [k, v] of Object.entries(required)) ctx.log(`${k}: ${v ?? '(absent)'}`);
	const missing = Object.entries(required)
		.filter(([, v]) => !v)
		.map(([k]) => k);
	const ok200 = res.status === 200 || res.status === 304;
	if (!ok200)
		return {
			status: 'fail',
			summary: `CloudFront returned ${res.status}`,
			detail: { url, status: res.status },
		};
	if (missing.length)
		return {
			status: 'fail',
			summary: `missing security headers: ${missing.join(', ')}`,
			detail: required,
		};
	const cspHasNoInlineEval = !/unsafe-eval/.test(required['content-security-policy'] ?? '');
	return {
		status: cspHasNoInlineEval ? 'pass' : 'warn',
		summary: `CloudFront ${res.status}, CSP + HSTS + nosniff + frame-guard present`,
		detail: required,
	};
}

async function syncUnauth(ctx: CheckContext): Promise<CheckOutcome> {
	await ensureConfig(ctx);
	const url = `${ctx.shared.syncUrl.replace(/\/$/, '')}/vaults/validate-probe/operations`;
	const res = await fetch(url, { method: 'GET' });
	ctx.log(`GET ${url} (no auth) → ${res.status}`);
	const rejected = res.status === 401 || res.status === 403;
	return {
		status: rejected ? 'pass' : 'fail',
		summary: rejected
			? `sync API rejects unauthenticated request (${res.status})`
			: `sync API did NOT reject unauth request (${res.status}) — authorizer gap`,
		detail: { url, status: res.status },
	};
}

async function cognitoOpenid(ctx: CheckContext): Promise<CheckOutcome> {
	await ensureConfig(ctx);
	const issuer = ctx.shared.issuerUrl.replace(/\/$/, '');
	const url = `${issuer}/.well-known/openid-configuration`;
	const res = await fetch(url);
	ctx.log(`GET ${url} → ${res.status}`);
	if (res.status !== 200)
		return { status: 'fail', summary: `OIDC discovery ${res.status}`, detail: { url } };
	const doc = (await res.json()) as { jwks_uri?: string; issuer?: string };
	const ok = !!doc.jwks_uri && !!doc.issuer;
	return {
		status: ok ? 'pass' : 'fail',
		summary: ok
			? 'Cognito OIDC discovery reachable (jwks_uri present)'
			: 'OIDC discovery malformed',
		detail: doc,
	};
}

export const CLOUD_CHECKS: Check[] = [
	{
		id: 'cloud:config',
		title: 'Cloud config resolvable (SSM)',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-fast',
		offByDefault: true,
		requires: ['aws'],
		description: 'All deployed-stack coordinates resolve from SSM Parameter Store.',
		run: resolveConfig,
	},
	{
		id: 'cloud:web-headers',
		title: 'CloudFront security headers',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-fast',
		offByDefault: true,
		requires: ['aws'],
		description: 'Web app serves 200 with CSP + HSTS + nosniff + frame-guard.',
		run: cloudfrontHeaders,
	},
	{
		id: 'cloud:sync-unauth',
		title: 'Sync API rejects anonymous',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-fast',
		offByDefault: true,
		requires: ['aws'],
		description: 'Unauthenticated sync request is rejected 401/403 (JWT authorizer live).',
		run: syncUnauth,
	},
	{
		id: 'cloud:cognito-oidc',
		title: 'Cognito OIDC discovery',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-fast',
		offByDefault: true,
		requires: ['aws'],
		description: 'Identity pool OIDC discovery document is reachable and well-formed.',
		run: cognitoOpenid,
	},
	{
		id: 'cloud:signaling',
		title: 'Signaling e2e (WebSocket protocol)',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-deep',
		offByDefault: true,
		requires: ['aws'],
		timeoutMs: 6 * 60_000,
		description: 'Authorizer + advertise/browse/join/offer/answer relay + TURN minting.',
		command: `bash infra/verify-signaling.sh ${STAGE}`,
	},
	{
		id: 'cloud:turn',
		title: 'TURN relay (coturn)',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-deep',
		offByDefault: true,
		requires: ['aws'],
		timeoutMs: 6 * 60_000,
		description: 'Two relay-only peers allocate on coturn and round-trip a data channel.',
		command: `bash infra/verify-turn.sh ${STAGE}`,
	},
	{
		id: 'cloud:sync',
		title: 'E2EE sync round-trip + ciphertext-at-rest',
		layer: 'cloud',
		stage: 4,
		group: 'cloud-deep',
		offByDefault: true,
		requires: ['aws'],
		timeoutMs: 6 * 60_000,
		description: 'Encrypted push/pull/snapshot + server rejects plaintext + S3 is ciphertext.',
		command: `bash infra/verify-sync.sh ${STAGE}`,
	},
];
