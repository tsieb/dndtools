/**
 * v2 accessibility axe gate — merge + report CLI (UX-A11Y-001, UX-A11Y-017).
 *
 * Reads the per-worker axe artifacts written by the Playwright gate
 * (`apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts`), merges and de-duplicates them, applies the
 * shared release policy in `scripts/lib/a11y-axe-policy.ts`, and writes a deterministic merged
 * report plus a Markdown summary suitable for a PR comment artifact. Exits non-zero when the gate
 * fails so it can be wired straight into CI.
 *
 * Usage:
 *   tsx scripts/a11y-axe-report.ts \
 *     --artifacts apps/gm-react/test-results/a11y \
 *     --register apps/gm-react/tests/a11y/known-violations.json \
 *     --out tmp/a11y
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	evaluateGate,
	mergeViolations,
	type AxeViolationInput,
	type KnownViolationRegister,
} from './lib/a11y-axe-policy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

interface WorkerArtifact {
	project: string;
	route: string;
	workerIndex: number;
	violations: AxeViolationInput[];
}

function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const value = argv[i + 1];
		if (!value || value.startsWith('--')) continue;
		args[token.slice(2)] = value;
		i += 1;
	}
	return args;
}

function readRegister(path: string): KnownViolationRegister {
	if (!existsSync(path)) return { version: 1, violations: [] };
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as KnownViolationRegister;
	return { version: parsed.version ?? 1, violations: parsed.violations ?? [] };
}

function readArtifacts(dir: string): WorkerArtifact[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.startsWith('axe-') && name.endsWith('.json'))
		.sort()
		.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as WorkerArtifact);
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const artifactsDir = resolve(REPO_ROOT, args.artifacts ?? 'apps/gm-react/test-results/a11y');
	const registerPath = resolve(
		REPO_ROOT,
		args.register ?? 'apps/gm-react/tests/a11y/known-violations.json',
	);
	const outDir = resolve(REPO_ROOT, args.out ?? 'tmp/a11y');

	const register = readRegister(registerPath);
	const artifacts = readArtifacts(artifactsDir);

	if (artifacts.length === 0) {
		console.warn(
			`a11y axe report: no worker artifacts found in ${artifactsDir}. ` +
				`Run the Playwright a11y gate first (pnpm a11y:axe).`,
		);
	}

	const merged = mergeViolations(artifacts.map((artifact) => artifact.violations));
	const evaluation = evaluateGate(merged, register, new Date());

	const routesScanned = [...new Set(artifacts.map((a) => `${a.project} ${a.route}`))].sort();
	const report = {
		version: 1,
		generatedAt: new Date().toISOString(),
		routesScanned,
		counts: evaluation.counts,
		totalUnique: merged.length,
		blocking: evaluation.blocking,
		known: evaluation.violations.filter((v) => v.known),
		expiredRegisterEntries: evaluation.expiredRegisterEntries,
		ok: evaluation.ok,
	};

	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, 'a11y-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

	const md = [
		'<!-- dndtools-v2-a11y-report -->',
		'### V2 Accessibility Gate (axe / WCAG 2.2 AA)',
		'',
		`Generated: ${report.generatedAt}`,
		`Routes × profiles scanned: ${routesScanned.length}`,
		'',
		'| Impact | Count |',
		'| --- | ---: |',
		`| Critical | ${evaluation.counts.critical} |`,
		`| Serious | ${evaluation.counts.serious} |`,
		`| Moderate | ${evaluation.counts.moderate} |`,
		`| Minor | ${evaluation.counts.minor} |`,
		`| Unknown | ${evaluation.counts.unknown} |`,
		'',
		`Blocking violations: **${evaluation.blocking.length}**`,
		`Approved known violations (active): ${report.known.length}`,
		`Known-violation entries past remediation date: **${evaluation.expiredRegisterEntries.length}**`,
		'',
		'Policy: critical always blocks; serious blocks unless an approved known-violation entry with a',
		'future remediation date exists; moderate/minor are logged. An expired known-violation entry',
		'fails the gate until it is resolved or its date is extended with owner approval.',
		'',
		`Gate result: ${evaluation.ok ? 'PASS' : 'FAIL'}`,
	].join('\n');
	writeFileSync(join(outDir, 'a11y-summary.md'), `${md}\n`, 'utf8');

	console.log(md);

	if (!evaluation.ok) {
		console.error('\nV2 accessibility gate FAILED:');
		for (const v of evaluation.blocking) {
			console.error(`  - [${v.impact}] ${v.id} on ${v.route} (${v.project}) — ${v.selector}`);
		}
		for (const expired of evaluation.expiredRegisterEntries) {
			console.error(
				`  - known violation past due (${expired.daysOverdue}d): ${expired.entry.id} on ` +
					`${expired.entry.route} (owner ${expired.entry.owner}, due ${expired.entry.targetResolutionDate})`,
			);
		}
		process.exit(1);
	}
	console.log('\nV2 accessibility gate passed.');
}

main();
