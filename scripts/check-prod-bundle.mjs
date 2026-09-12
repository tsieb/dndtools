// Root entry point and gallery documentation generator. Build verification remains in the app.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import ts from 'typescript';
import prettier from 'prettier';

const root = new URL('../', import.meta.url);
const gallery = new URL('apps/gm-react/src/screens/DsGallery.tsx', root);
const docs = new URL('docs/design/COMPONENTS.md', root);

// Read literal registry data without executing React, loading browser modules or evaluating code.
function literal(node) {
	if (ts.isStringLiteral(node) || ts.isNumericLiteral(node))
		return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return null;
	if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken)
		return -literal(node.operand);
	if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
	if (ts.isObjectLiteralExpression(node))
		return Object.fromEntries(
			node.properties.map((property) => {
				if (
					!ts.isPropertyAssignment(property) ||
					!(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
				)
					throw new Error('Gallery registry must contain literal properties');
				return [property.name.text, literal(property.initializer)];
			}),
		);
	throw new Error('Gallery registry must contain only serializable literal data');
}

const mode = process.argv[2];
if (mode === '--write-docs' || mode === '--check-docs') {
	const source = ts.createSourceFile(
		'DsGallery.tsx',
		readFileSync(gallery, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let registry;
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (declaration.name.getText(source) === 'galleryRegistry')
				registry = literal(declaration.initializer);
		}
	}
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
		'<!-- Generated from DsGallery.tsx galleryRegistry. Do not edit by hand. -->',
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
} else {
	const result = spawnSync(
		process.execPath,
		[
			fileURLToPath(new URL('apps/gm-react/scripts/check-prod-bundle.mjs', root)),
			process.argv[2] ?? fileURLToPath(new URL('apps/gm-react/dist', root)),
		],
		{ stdio: 'inherit' },
	);
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}
