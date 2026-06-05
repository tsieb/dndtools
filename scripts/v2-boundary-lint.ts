import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Violation {
	file: string;
	line: number;
	message: string;
}

export interface BoundaryLintRoots {
	repoRoot: string;
	coreRoot: string;
	svelteAppRoot: string;
	exceptionsFile: string;
}

export function defaultRoots(repoRoot: string = process.cwd()): BoundaryLintRoots {
	const appRoot = path.join(repoRoot, 'apps', 'v2');
	const svelteAppRoot = path.join(appRoot, 'app');
	return {
		repoRoot,
		coreRoot: path.join(appRoot, 'packages', 'core'),
		svelteAppRoot,
		exceptionsFile: path.join(svelteAppRoot, 'platform-access-exceptions.json'),
	};
}

const IMPORT_PATTERN = /(?:^|\s)(?:import|export)\s+(?:[\s\S]*?)\sfrom\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_PATTERN = /(?:^|\s)import\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const CORE_FORBIDDEN_PREFIXES = [
	'svelte',
	'@sveltejs/',
	'$app',
	'$lib',
	'$service-worker',
	'dexie',
	'@capacitor/',
	'electron',
	'@modelcontextprotocol/sdk',
	'fs',
	'node:',
	'path',
	'os',
];

const V1_FORBIDDEN_PREFIXES = ['../../../../src/', '../../../../electron/', '../../../../mcp/'];

// PLAT-006: direct platform/storage primitives that GUI components and routes must never
// reach. Persistence routes through the StoragePort named methods; capabilities route
// through the platform layer. Each entry has a regex matching direct access plus a label.
interface PrimitiveRule {
	id: string;
	pattern: RegExp;
	message: string;
	// Import-spec rules must match against the raw line because the meaningful token is the
	// quoted module specifier, which the comment/string stripper would otherwise erase.
	matchRaw?: boolean;
}

const PLATFORM_PRIMITIVE_RULES: PrimitiveRule[] = [
	{
		id: 'dexie',
		pattern: /(?:from|import\()\s*['"]dexie['"]/,
		message: 'imports Dexie directly',
		matchRaw: true,
	},
	{
		id: 'indexedDB',
		pattern: /\bindexedDB\b/,
		message: 'accesses indexedDB directly',
	},
	{
		id: 'localStorage',
		pattern: /\blocalStorage\b/,
		message: 'accesses localStorage directly',
	},
	{
		id: 'sessionStorage',
		pattern: /\bsessionStorage\b/,
		message: 'accesses sessionStorage directly',
	},
	{
		id: 'crypto',
		pattern: /\bcrypto\.(randomUUID|subtle|getRandomValues)\b/,
		message: 'uses the crypto platform primitive directly',
	},
	{
		id: 'navigator',
		pattern: /\bnavigator\.(onLine|storage|serviceWorker|clipboard)\b/,
		message: 'reads a navigator platform capability directly',
	},
	{
		id: 'caches',
		pattern: /\bcaches\.(open|match|keys|delete)\b/,
		message: 'accesses the Cache Storage API directly',
	},
	{
		id: 'electron',
		pattern: /\bwindow\.electron\b/,
		message: 'reaches the Electron bridge directly',
	},
	{
		id: 'capacitor',
		pattern: /\b(Capacitor|window\.Capacitor)\b/,
		message: 'reaches the Capacitor native bridge directly',
	},
];

// PLAT-011: files under the contracts dir (or matching the contract suffix) are type-only.
// They must not export runtime values.
const CONTRACT_DIR_NAME = 'contracts';
const CONTRACT_SUFFIX = '.contract.ts';
// A runtime export begins with one of these keywords after `export`. `export type`,
// `export interface`, and `export { ... }` (re-export of types) are inspected separately.
const RUNTIME_EXPORT_PATTERN =
	/^\s*export\s+(?:default\s+)?(?:async\s+)?(const|let|var|function|class|enum)\b/;

interface AccessException {
	id: string;
	path: string;
	primitives: string[];
	owner: string;
	rationale: string;
	removalCriteria: string;
}

export function loadExceptions(exceptionsFile: string, repoRoot: string): AccessException[] {
	if (!fs.existsSync(exceptionsFile)) {
		throw new Error(
			`Platform access exception manifest missing at ${path.relative(repoRoot, exceptionsFile)}.`,
		);
	}
	const raw = JSON.parse(fs.readFileSync(exceptionsFile, 'utf8')) as { exceptions?: unknown };
	const list = Array.isArray(raw.exceptions) ? raw.exceptions : [];
	const seen = new Set<string>();
	return list.map((entry, index) => {
		const e = entry as Partial<AccessException>;
		for (const field of ['id', 'path', 'owner', 'rationale', 'removalCriteria'] as const) {
			if (typeof e[field] !== 'string' || (e[field] as string).trim() === '') {
				throw new Error(`Exception #${index} is missing required string field "${field}".`);
			}
		}
		if (!Array.isArray(e.primitives) || e.primitives.length === 0) {
			throw new Error(`Exception "${e.id}" must list at least one primitive.`);
		}
		if (seen.has(e.id as string)) {
			throw new Error(`Duplicate exception id "${e.id}".`);
		}
		seen.add(e.id as string);
		return e as AccessException;
	});
}

function walk(dir: string, files: string[] = []): string[] {
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.svelte-kit')
			continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, files);
		} else if (/\.(ts|svelte|svelte\.ts|js|mjs)$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

function checkImport(spec: string, forbidden: string[]): boolean {
	for (const prefix of forbidden) {
		if (spec === prefix) return true;
		if (spec.startsWith(prefix)) return true;
	}
	return false;
}

function lineOf(source: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (source[i] === '\n') line += 1;
	}
	return line;
}

function scanFile(
	file: string,
	repoRoot: string,
	forbidden: string[],
	violations: Violation[],
	allowVoidImports: string[] = [],
): void {
	const source = fs.readFileSync(file, 'utf8');
	const patterns = [IMPORT_PATTERN, SIDE_EFFECT_PATTERN, DYNAMIC_IMPORT_PATTERN];
	for (const pattern of patterns) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(source))) {
			const spec = match[1];
			if (!spec) continue;
			if (allowVoidImports.includes(spec)) continue;
			if (checkImport(spec, forbidden)) {
				violations.push({
					file: path.relative(repoRoot, file),
					line: lineOf(source, match.index),
					message: `Forbidden import "${spec}"`,
				});
			}
		}
	}
}

// Lines that only mention a primitive in a comment or string should not trip the rule.
// We strip line comments and template/quoted strings cheaply before matching.
function codeOnly(line: string): string {
	const noLineComment = line.replace(/\/\/.*$/, '');
	return noLineComment.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
}

/**
 * PLAT-006 / PLAT-012: scan a GUI/route/platform file for direct platform-primitive access.
 * Access is a violation unless the file is allowlisted for that primitive in the exception
 * manifest. Allowlisted files are still recorded so the regression test can prove each
 * exception is genuinely exercised.
 */
function scanPlatformPrimitives(
	file: string,
	repoRoot: string,
	exceptionsByPath: Map<string, Set<string>>,
	violations: Violation[],
): void {
	const relFile = path.relative(repoRoot, file).split(path.sep).join('/');
	const allowed = exceptionsByPath.get(relFile) ?? new Set<string>();
	const source = fs.readFileSync(file, 'utf8');
	const lines = source.split('\n');
	lines.forEach((rawLine, index) => {
		const line = codeOnly(rawLine);
		for (const rule of PLATFORM_PRIMITIVE_RULES) {
			rule.pattern.lastIndex = 0;
			const target = rule.matchRaw ? rawLine : line;
			if (rule.pattern.test(target)) {
				if (allowed.has(rule.id)) continue;
				violations.push({
					file: relFile,
					line: index + 1,
					message: `GUI/platform boundary: ${path.basename(file)} ${rule.message} (PLAT-006). Route through the storage adapter / platform layer, or add a scoped exception (PLAT-012).`,
				});
			}
		}
	});
}

/**
 * PLAT-011: a type-only contract module must not export runtime values. Flags any
 * `export const|let|var|function|class|enum`.
 */
function scanTypeOnlyModule(file: string, repoRoot: string, violations: Violation[]): void {
	const source = fs.readFileSync(file, 'utf8');
	source.split('\n').forEach((rawLine, index) => {
		const line = codeOnly(rawLine);
		if (RUNTIME_EXPORT_PATTERN.test(line)) {
			violations.push({
				file: path.relative(repoRoot, file).split(path.sep).join('/'),
				line: index + 1,
				message: `Type-only contract module exports a runtime value (PLAT-011). Move runtime constructors/validators to a non-contract module.`,
			});
		}
	});
}

function isContractModule(file: string, coreRoot: string): boolean {
	const rel = path.relative(coreRoot, file).split(path.sep).join('/');
	return rel.startsWith(`src/${CONTRACT_DIR_NAME}/`) || file.endsWith(CONTRACT_SUFFIX);
}

function isGuiOrRouteFile(file: string, svelteAppRoot: string): boolean {
	const rel = path.relative(svelteAppRoot, file).split(path.sep).join('/');
	if (rel.startsWith('src/lib/gui/')) return true;
	if (rel.startsWith('src/routes/')) return true;
	if (rel.startsWith('src/lib/platform/')) return true;
	if (rel.startsWith('src/lib/canvas-runtime/')) return true;
	if (rel.startsWith('src/lib/state/')) return true;
	return false;
}

function main(): Violation[] {
	return collectViolations(defaultRoots());
}

/**
 * Run every boundary rule against the given roots and return all violations. Exported so
 * regression tests can point it at a temp fixture tree with planted violations and assert
 * the rules actually fire (PLAT-006/011/012 enforcement is mechanical, not convention).
 */
export function collectViolations(roots: BoundaryLintRoots): Violation[] {
	const { repoRoot, coreRoot, svelteAppRoot, exceptionsFile } = roots;
	const violations: Violation[] = [];

	// Core production source must have zero GUI/platform/v1 dependencies.
	// Tests intentionally use Node APIs (fs/path) to scan source files, so they are excluded.
	for (const file of walk(path.join(coreRoot, 'src'))) {
		scanFile(file, repoRoot, CORE_FORBIDDEN_PREFIXES, violations);
	}

	// PLAT-011: type-only contract modules export no runtime values.
	for (const file of walk(path.join(coreRoot, 'src'))) {
		if (isContractModule(file, coreRoot)) {
			scanTypeOnlyModule(file, repoRoot, violations);
		}
	}

	// PLAT-006 / PLAT-012: app GUI/route/platform files must not reach platform primitives
	// except where an explicit, owned exception is recorded.
	const exceptions = loadExceptions(exceptionsFile, repoRoot);
	const exceptionsByPath = new Map<string, Set<string>>();
	for (const exc of exceptions) {
		exceptionsByPath.set(exc.path.split(path.sep).join('/'), new Set(exc.primitives));
	}

	for (const file of walk(path.join(svelteAppRoot, 'src'))) {
		scanFile(file, repoRoot, V1_FORBIDDEN_PREFIXES, violations);
		if (isGuiOrRouteFile(file, svelteAppRoot)) {
			scanPlatformPrimitives(file, repoRoot, exceptionsByPath, violations);
		}
	}
	for (const file of walk(path.join(svelteAppRoot, 'tests'))) {
		scanFile(file, repoRoot, V1_FORBIDDEN_PREFIXES, violations);
	}

	return violations;
}

function runCli(): void {
	const violations = main();
	if (violations.length > 0) {
		console.error('v2 boundary lint failed:');
		for (const v of violations) {
			console.error(`  ${v.file}:${v.line} — ${v.message}`);
		}
		process.exit(1);
	}
	console.log('v2 boundary lint passed');
}

// Run only when invoked directly as a CLI, not when imported by tests.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
	runCli();
}
