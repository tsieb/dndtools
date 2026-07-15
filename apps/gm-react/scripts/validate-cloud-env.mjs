import { readFileSync } from 'node:fs';
import process from 'node:process';

const required = process.argv.includes('--required');
const policyArg = process.argv.indexOf('--policy');
const policyPath = policyArg >= 0 ? process.argv[policyArg + 1] : null;
const errors = [];

const values = {
	region: (process.env.VITE_CLOUD_REGION ?? '').trim(),
	pool: (process.env.VITE_COGNITO_USER_POOL_ID ?? '').trim(),
	client: (process.env.VITE_COGNITO_CLIENT_ID ?? '').trim(),
	signaling: (process.env.VITE_SIGNALING_WS_URL ?? '').trim(),
	sync: (process.env.VITE_SYNC_API_URL ?? '').trim(),
	app: (process.env.VITE_APP_API_URL ?? '').trim(),
	publicApp: (process.env.VITE_PUBLIC_APP_URL ?? '').trim(),
};

const entries = Object.entries(values);
const configured = entries.some(([, value]) => value !== '');
if (required || configured) {
	for (const [name, value] of entries) {
		if (!value) errors.push(`${name} is missing`);
	}
}

function endpoint(name, value, protocol) {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== protocol) errors.push(`${name} must use ${protocol}`);
		if (url.username || url.password || url.search || url.hash)
			errors.push(`${name} must not contain credentials, a query, or a fragment`);
		if (url.pathname === '/' || url.pathname.endsWith('/'))
			errors.push(`${name} must include a stage path and have no trailing slash`);
		return url.origin;
	} catch {
		errors.push(`${name} is not a valid URL`);
		return null;
	}
}

if (values.region && !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(values.region))
	errors.push('region is not a valid AWS region');
if (
	values.pool &&
	(!values.region ||
		!new RegExp(`^${values.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_[A-Za-z0-9]+$`).test(
			values.pool,
		))
)
	errors.push('user pool id must belong to the configured region');
if (values.client && !/^[a-z0-9]{1,128}$/.test(values.client))
	errors.push('Cognito client id has an invalid format');

const expectedCloud = new Set();
const signalingOrigin = endpoint('signaling URL', values.signaling, 'wss:');
const syncOrigin = endpoint('sync API URL', values.sync, 'https:');
const appOrigin = endpoint('app API URL', values.app, 'https:');
for (const origin of [signalingOrigin, syncOrigin, appOrigin])
	if (origin) expectedCloud.add(origin);

if (values.publicApp) {
	try {
		const url = new URL(values.publicApp);
		if (url.protocol !== 'https:') errors.push('public app URL must use https:');
		if (url.username || url.password || url.search || url.hash)
			errors.push('public app URL must not contain credentials, a query, or a fragment');
	} catch {
		errors.push('public app URL is not a valid URL');
	}
}
if (values.region) expectedCloud.add(`https://cognito-idp.${values.region}.amazonaws.com`);

const expectedAi = new Set();
for (const raw of (process.env.VITE_AI_ALLOWED_ORIGINS ?? '').split(/\s+/).filter(Boolean)) {
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' || url.origin !== raw) {
			errors.push(`AI origin must be a canonical HTTPS origin: ${raw}`);
		} else expectedAi.add(raw);
	} catch {
		errors.push(`AI origin is not a valid URL: ${raw}`);
	}
}
if (expectedAi.size > 32) errors.push('at most 32 AI origins may be packaged');

if (policyPath) {
	try {
		const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
		const actualCloud = [...(Array.isArray(policy.cloudOrigins) ? policy.cloudOrigins : [])].sort();
		const actualAi = [...(Array.isArray(policy.aiOrigins) ? policy.aiOrigins : [])].sort();
		if (policy.version !== 1) errors.push('Electron network policy has an unsupported version');
		if (JSON.stringify(actualCloud) !== JSON.stringify([...expectedCloud].sort()))
			errors.push('Electron network policy does not contain the exact configured cloud origins');
		if (JSON.stringify(actualAi) !== JSON.stringify([...expectedAi].sort()))
			errors.push('Electron network policy does not contain the exact configured AI origins');
	} catch (error) {
		errors.push(
			`could not validate Electron network policy: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

if (errors.length) {
	console.error(`Cloud configuration is invalid:\n- ${errors.join('\n- ')}`);
	process.exit(1);
}
console.log(
	configured || required
		? 'Cloud configuration is valid.'
		: 'Cloud configuration is absent; local-only build is valid.',
);
