// Post-build guard: the DEV-only `window.__rt` SceneRuntime seam (RuntimeContext.tsx) must be
// dead-code-eliminated from production bundles. The whole e2e suite drives the app through that
// seam, and its prod safety rests on the `import.meta.env.DEV` gate staying intact — a leak would
// expose the raw dispatch/state runtime to any page script. Fails the build if `__rt` appears in
// any emitted JS asset.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const outDir = process.argv[2] ?? 'dist';
const assetsDir = join(outDir, 'assets');

let files;
try {
	files = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
} catch {
	console.error(`check-prod-bundle: no ${assetsDir} directory — run vite build first`);
	process.exit(1);
}
if (files.length === 0) {
	console.error(`check-prod-bundle: ${assetsDir} contains no JS assets — nothing to check`);
	process.exit(1);
}

// Word-boundary match so minified identifiers like `__rtl` don't false-positive.
const forbidden = /__rt\b/;
const offenders = [];
for (const f of files) {
	const src = readFileSync(join(assetsDir, f), 'utf8');
	if (forbidden.test(src)) offenders.push(f);
}

if (offenders.length > 0) {
	console.error(
		`check-prod-bundle: DEV-only __rt seam leaked into production bundle(s): ${offenders.join(', ')}\n` +
			'The import.meta.env.DEV gate in src/runtime/RuntimeContext.tsx has regressed.',
	);
	process.exit(1);
}
console.log(`check-prod-bundle: OK — __rt absent from ${files.length} JS asset(s) in ${assetsDir}`);
