// Which cloud stacks and the web app must redeploy for a range of commits.
//
//   node scripts/ci/changed-stacks.mjs <base-sha|''> <head-sha>
//
// Prints one `name=true|false` line per target for $GITHUB_OUTPUT. An empty base (no earlier
// successful deploy on record) marks everything changed. The map is exported so the CI
// guardrail test can assert the stack couplings without parsing a workflow.
import { execFileSync } from 'node:child_process';

/** Path prefixes (or exact files) whose change requires redeploying each target. */
export const DEPLOY_TARGETS = {
	foundation: ['infra/foundation/'],
	identity: ['infra/identity/'],
	turn: ['infra/turn/'],
	// A pool/client replacement changes the issuer/audience embedded in the authorizer; signaling
	// enforces entitlements from app-api's table and resolves TURN coordinates from SSM at deploy.
	signaling: [
		'infra/signaling/',
		'infra/identity/',
		'infra/app-api/',
		'infra/turn/',
		'packages/cloud-fns/',
		'packages/core/',
	],
	sync_api: [
		'infra/sync-api/',
		'infra/identity/',
		'infra/app-api/',
		'packages/cloud-fns/',
		'packages/core/',
	],
	app_api: ['infra/app-api/', 'infra/identity/', 'packages/cloud-fns/', 'packages/core/'],
	// The CSP resolves the exact deployed API origins from SSM.
	web_hosting: ['infra/web-hosting/', 'infra/signaling/', 'infra/sync-api/', 'infra/app-api/'],
	// Identity replacements change the client-side pool/client coordinates.
	app: ['apps/gm-react/', 'packages/core/', 'infra/identity/', 'config/stages/'],
};

export function changedTargets(paths) {
	const result = {};
	for (const [target, prefixes] of Object.entries(DEPLOY_TARGETS)) {
		result[target] = paths.some((p) => prefixes.some((prefix) => p.startsWith(prefix)));
	}
	return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
	const [base, head] = process.argv.slice(2);
	if (!head) {
		console.error('usage: changed-stacks.mjs <base-sha|""> <head-sha>');
		process.exit(2);
	}
	let result;
	if (!base) {
		result = Object.fromEntries(Object.keys(DEPLOY_TARGETS).map((k) => [k, true]));
		console.error('changed-stacks: no previous deploy recorded; every target is marked changed');
	} else {
		const diff = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' });
		result = changedTargets(diff.split('\n').filter(Boolean));
	}
	for (const [k, v] of Object.entries(result)) console.log(`${k}=${v}`);
}
