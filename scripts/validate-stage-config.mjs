import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'config/stages');
const today = new Date().toISOString().slice(0, 10);
const errors = [];

for (const file of readdirSync(dir)
	.filter((name) => name.endsWith('.json'))
	.sort()) {
	const config = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
	const label = `config/stages/${file}`;
	if (config.version !== 1 || !['dev', 'prod'].includes(config.stage))
		errors.push(`${label}: invalid version or stage`);
	if (file !== `${config.stage}.json`) errors.push(`${label}: file name must match stage`);
	if (!/^([a-z]{2})(?:-gov)?-[a-z]+-\d$/.test(config.region ?? ''))
		errors.push(`${label}: invalid region`);
	if (
		!Array.isArray(config.allowedOrigins) ||
		!config.allowedOrigins.every((origin) => /^https:\/\/[^/?#]+$/.test(origin))
	)
		errors.push(`${label}: allowed origins must be canonical HTTPS origins`);
	if (config.logRetentionDays !== (config.stage === 'dev' ? 14 : 90))
		errors.push(`${label}: incorrect retention for stage`);
	if (!/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(config.diagnosticEndpoint ?? ''))
		errors.push(`${label}: invalid diagnostic endpoint`);
	if (!config.capabilities || typeof config.capabilities.clientTelemetry !== 'boolean')
		errors.push(`${label}: missing client telemetry capability`);
	if (!Array.isArray(config.featureFlags)) errors.push(`${label}: feature flags must be an array`);
	for (const flag of config.featureFlags ?? []) {
		if (!/^[a-z][a-z0-9-]{2,63}$/.test(flag.key ?? '') || !/^[a-z0-9._-]+$/.test(flag.owner ?? ''))
			errors.push(`${label}: invalid feature flag metadata`);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(flag.expiresAt ?? '') || flag.expiresAt < today)
			errors.push(
				`${label}: feature flag ${flag.key ?? '<unknown>'} has expired or invalid expiry`,
			);
		if (config.stage === 'prod' && flag.enabled)
			errors.push(
				`${label}: production feature flags require an explicit post-promotion approval and must default off`,
			);
	}
}
if (errors.length) {
	console.error(`Stage configuration is invalid:\n- ${errors.join('\n- ')}`);
	process.exit(1);
}
console.log('Stage configuration is valid.');
