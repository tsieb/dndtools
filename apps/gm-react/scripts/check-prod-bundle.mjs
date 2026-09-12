import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = new URL('../../../', import.meta.url);
const docs = new URL('docs/design/COMPONENTS.md', root);

/** Node-only command implementation. Safe to import without running a check. */
export async function run({ registry, defaultOutDir = 'dist' } = {}) {
	const mode = process.argv[2];
	if (mode === '--write-docs' || mode === '--check-docs') {
		registry ??= (await import('../../../scripts/check-prod-bundle.mjs')).galleryRegistry;
		const { default: prettier } = await import('prettier');
		await documentRegistry(registry, mode, prettier);
	} else {
		checkProductionBundle(
			mode ?? (defaultOutDir instanceof URL ? fileURLToPath(defaultOutDir) : defaultOutDir),
		);
	}
}

async function documentRegistry(registry, mode, prettier) {
	if (!registry?.length) throw new Error('Gallery registry is missing or empty');
	const facade = readFileSync(new URL('apps/gm-react/src/ds/index.d.ts', root), 'utf8');
	const exported = [...facade.matchAll(/export const (\w+): DSComponent;/g)]
		.map((match) => match[1])
		.sort();
	const registered = registry.map((entry) => entry.name).sort();
	if (JSON.stringify(exported) !== JSON.stringify(registered))
		throw new Error('Gallery registry must cover every public DS component exactly once');
	const lines = [
		'# Component reference',
		'',
		'<!-- Generated from the galleryRegistry shared by DsGallery.tsx and scripts/check-prod-bundle.mjs. Do not edit by hand. -->',
		'',
		'Run `node scripts/check-prod-bundle.mjs --write-docs` to regenerate; use `--check-docs` to verify coverage and drift.',
		'',
		'Start `pnpm dev` and open `http://localhost:5273/#/__ds`. The gallery is DEV-only: both the lazy import and route use `import.meta.env.DEV`. Production build verification rejects the route, gallery chunk and gallery marker.',
		'',
		'Choose a component, example and any combination of variant/state controls. Theme (tavern, parchment, high-contrast) and density (comfortable, compact) apply to the specimen and overlays. They are temporary and restore on exit. Hover, press and Tab through real controls for pointer and focus states; open overlays to check Escape and focus return. Reset example restores its selected fixture. Actions use synthetic local state.',
		'',
		'Scope: every public component in `src/ds/index.d.ts`; helper functions and constants are not components. Icon names and default condition names are additionally selectable from their live registries. Example props below are merged with the selected axes and example overrides; event handlers and semantic wrappers are supplied by the gallery renderer.',
		'',
	];
	for (const entry of registry) {
		lines.push(
			`## ${entry.name}`,
			'',
			entry.description,
			'',
			`[Source](../../${entry.source})`,
			'',
			'### Variants and states',
			'',
		);
		if (Object.keys(entry.axes).length) {
			lines.push('| Prop | Values |', '| --- | --- |');
			for (const [prop, values] of Object.entries(entry.axes))
				lines.push(
					`| \`${prop}\` | ${values.map((value) => `\`${JSON.stringify(value).replaceAll('|', '\\|')}\``).join(', ')} |`,
				);
		} else lines.push('Use the examples and native interactions below.');
		lines.push(
			'',
			'### Base props',
			'',
			'```json',
			JSON.stringify(entry.props, null, 2),
			'```',
			'',
			'### Examples',
			'',
		);
		for (const [name, props] of Object.entries(entry.examples))
			lines.push(
				`- **${name}**: ${Object.keys(props).length ? '`' + JSON.stringify(props).replaceAll('`', '\\`') + '`' : 'Base props.'}`,
			);
		lines.push('');
	}
	const formatted = await prettier.format(lines.join('\n'), {
		...(await prettier.resolveConfig(fileURLToPath(docs))),
		parser: 'markdown',
	});
	if (mode === '--write-docs') writeFileSync(docs, formatted);
	else if (readFileSync(docs, 'utf8') !== formatted)
		throw new Error('COMPONENTS.md is stale; run --write-docs');
	console.log(
		`Gallery documentation: ${registry.length} components; ${mode === '--write-docs' ? 'generated' : 'current'}`,
	);
}

// Fail closed on missing assets, runtime seam leaks or gallery leaks.
function checkProductionBundle(outDir) {
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
	// Registry component source links are forbidden even if the data module leaks on its own.
	// Require a category and component filename: production gate metadata includes DS test paths.
	const forbidden =
		/__rt\b|__ds\b|DsGallery|lamplight-ds-gallery|apps\/gm-react\/src\/ds\/components\/[a-z]+\/[A-Z]\w*\.jsx/;
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
}

if (import.meta.main) await run();
