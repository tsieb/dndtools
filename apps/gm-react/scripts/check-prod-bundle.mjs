// Post-build guard: the DEV-only `window.__rt` SceneRuntime seam (RuntimeContext.tsx) must be
// dead-code-eliminated from production bundles. The whole e2e suite drives the app through that
// seam, and its prod safety rests on the `import.meta.env.DEV` gate staying intact — a leak would
// expose the raw dispatch/state runtime to any page script. Fails the build if `__rt` appears in
// any emitted JS asset. The component gallery must also be wholly absent.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const outDir = process.argv[2] ?? 'dist';
const assetsDir = join(outDir, 'assets');

let files;
try {
	files = readdirSync(assetsDir, { recursive: true }).filter((f) => /\.[cm]?js$/.test(f));
} catch {
	console.error(`check-prod-bundle: no ${assetsDir} directory — run vite build first`);
	process.exit(1);
}
if (files.length === 0) {
	console.error(`check-prod-bundle: ${assetsDir} contains no JS assets — nothing to check`);
	process.exit(1);
}

// Word-boundary match so minified identifiers like `__rtl` don't false-positive.
const forbidden = /__rt\b|__ds\b|DsGallery|lamplight-ds-gallery/;
const offenders = [];
for (const f of files) {
	const src = readFileSync(join(assetsDir, f), 'utf8');
	if (forbidden.test(f) || forbidden.test(src)) offenders.push(f);
}

if (offenders.length > 0) {
	console.error(
		`check-prod-bundle: DEV-only runtime seam or component gallery leaked into production bundle(s): ${offenders.join(', ')}\n` +
			'Check the import.meta.env.DEV gates in src/runtime/RuntimeContext.tsx and src/App.tsx.',
	);
	process.exit(1);
}
console.log(
	`check-prod-bundle: OK — __rt and component gallery absent from ${files.length} JS asset(s) in ${assetsDir}`,
);
