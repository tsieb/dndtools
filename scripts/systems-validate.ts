import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { systemPackageSchema } from '../packages/core/src/schemas/system-package';
import { evaluateFormula } from '../packages/core/src/state/system-package';
import { BUILT_IN_SYSTEM_PACKAGES } from '../packages/core/src/systems';

const root = new URL('../', import.meta.url);
const levels = [1, 5, 10, 20];

// Read the authoritative vocabulary without loading React or executing the JSX module.
function iconVocabulary(): Set<string> {
	const path = new URL('apps/gm-react/src/ds/components/core/Icon.jsx', root);
	const source = ts.createSourceFile(
		path.pathname,
		readFileSync(path, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JSX,
	);
	const names = new Set<string>();
	function visit(node: ts.Node): void {
		if (
			ts.isVariableDeclaration(node) &&
			node.name.getText(source) === 'ICON_REGISTRY' &&
			node.initializer &&
			ts.isObjectLiteralExpression(node.initializer)
		) {
			for (const property of node.initializer.properties) {
				if (
					!ts.isPropertyAssignment(property) ||
					!(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
				)
					throw new Error('Unsupported ICON_REGISTRY entry');
				names.add(property.name.text);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	if (!names.size) throw new Error('ICON_REGISTRY vocabulary is empty');
	return names;
}

function fieldPath(parts: readonly PropertyKey[]): string {
	return (
		'$' +
		parts.map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`)).join('')
	);
}

function validate(label: string, value: unknown, icons: Set<string>): boolean {
	console.log(`\n${label}`);
	let failures = 0;
	const report = (ok: boolean, path: string, message: string): void => {
		if (!ok) failures++;
		console.log(`  ${ok ? 'PASS' : 'FAIL'} ${path}: ${message}`);
	};
	const parsed = systemPackageSchema.safeParse(value);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			if (issue.code === 'unrecognized_keys') {
				for (const key of issue.keys) report(false, fieldPath([...issue.path, key]), 'Unknown key');
			} else report(false, fieldPath(issue.path), issue.message);
		}
		console.log(`FAIL (${failures} schema issue(s); semantic checks skipped)`);
		return false;
	}
	const pkg = parsed.data;
	function fields(value: unknown, path: string): void {
		if (value !== null && typeof value === 'object' && Object.keys(value).length) {
			for (const [key, child] of Object.entries(value))
				fields(child, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`);
		} else report(true, path, 'schema');
	}
	fields(pkg, '$');
	function formula(path: string, expression: string, inputs: readonly string[]): void {
		for (const level of levels) {
			const samples: Record<string, number> = {
				level,
				score: 16,
				modifier: 3,
				proficiency: 2 + Math.floor((level - 1) / 4),
			};
			const scope = Object.fromEntries(inputs.map((input) => [input, samples[input] ?? 1]));
			const result = evaluateFormula(expression, scope);
			report(
				result.ok,
				path,
				`level ${level}, inputs ${JSON.stringify(scope)}: ${result.ok ? result.value : result.message}`,
			);
		}
	}
	pkg.attributes.forEach((entry, i) => {
		if (entry.derivation.kind === 'modifier')
			formula(`$.attributes[${i}].derivation.formula`, entry.derivation.formula, ['score']);
	});
	pkg.resources.forEach((entry, i) => {
		if (entry.maxFormula !== null)
			formula(`$.resources[${i}].maxFormula`, entry.maxFormula, [
				'level',
				'score',
				'modifier',
				'proficiency',
			]);
	});
	if (pkg.turnModel.kind === 'initiative' && pkg.turnModel.initiativeFormula !== null)
		formula('$.turnModel.initiativeFormula', pkg.turnModel.initiativeFormula, [
			'modifier',
			'score',
			'level',
		]);
	pkg.derived.forEach((entry, i) =>
		formula(`$.derived[${i}].formula`, entry.formula, entry.inputs),
	);
	const keys = new Map<string, number>();
	pkg.conditions.forEach((entry, i) => {
		report(
			icons.has(entry.icon),
			`$.conditions[${i}].icon`,
			icons.has(entry.icon) ? entry.icon : `Unknown icon ${JSON.stringify(entry.icon)}`,
		);
		const previous = keys.get(entry.key);
		report(
			previous === undefined,
			`$.conditions[${i}].key`,
			previous === undefined
				? 'unique'
				: `Duplicate ${JSON.stringify(entry.key)}; first at $.conditions[${previous}].key`,
		);
		keys.set(entry.key, previous ?? i);
	});
	console.log(failures ? `FAIL (${failures} issue(s))` : 'PASS');
	return failures === 0;
}

try {
	const icons = iconVocabulary();
	const paths = process.argv.slice(2);
	let valid = true;
	if (!paths.length) {
		for (const pkg of BUILT_IN_SYSTEM_PACKAGES) valid = validate(pkg.id, pkg, icons) && valid;
		paths.push(fileURLToPath(new URL('packages/core/src/systems/samples/pf2e.json', root)));
	}
	for (const path of paths) {
		try {
			valid = validate(path, JSON.parse(readFileSync(path, 'utf8')), icons) && valid;
		} catch (error) {
			console.error(`FAIL ${path} $: ${error instanceof Error ? error.message : String(error)}`);
			valid = false;
		}
	}
	process.exitCode = valid ? 0 : 1;
} catch (error) {
	console.error(`FAIL validator: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
