/**
 * Circular Dependency Lint (Epic 21.5)
 *
 * Detects circular import dependencies across the three runtime boundaries:
 * src/ (renderer), electron/ (desktop shell), and mcp/ (sidecar server).
 *
 * Uses madge to statically analyse the import graph. Any cycles found cause
 * a non-zero exit code so this can be used as a CI gate.
 */

import { execSync } from 'node:child_process';

interface CycleResult {
	directory: string;
	cycles: string[][];
}

const TARGETS = ['src/', 'electron/', 'mcp/'];
const results: CycleResult[] = [];
let totalCycles = 0;

for (const dir of TARGETS) {
	try {
		const output = execSync(`npx madge --circular --extensions ts,js --json ${dir}`, {
			encoding: 'utf-8',
			timeout: 120_000,
		});
		const cycles: string[][] = JSON.parse(output);
		results.push({ directory: dir, cycles });
		totalCycles += cycles.length;
	} catch (error: unknown) {
		// madge exits non-zero when cycles are found and --json is used
		if (error && typeof error === 'object' && 'stdout' in error) {
			const stdout = (error as { stdout: string }).stdout;
			try {
				const cycles: string[][] = JSON.parse(stdout);
				results.push({ directory: dir, cycles });
				totalCycles += cycles.length;
			} catch {
				console.error(`Failed to parse madge output for ${dir}`);
				process.exit(1);
			}
		} else {
			console.error(`Failed to run madge on ${dir}:`, error);
			process.exit(1);
		}
	}
}

// Report
for (const { directory, cycles } of results) {
	if (cycles.length === 0) {
		console.log(`✔ ${directory} — no circular dependencies`);
	} else {
		console.error(`✘ ${directory} — ${cycles.length} circular dependency chain(s):`);
		for (const cycle of cycles) {
			console.error(`  ${cycle.join(' → ')} → ${cycle[0]}`);
		}
	}
}

if (totalCycles > 0) {
	console.error(`\n✘ ${totalCycles} circular dependency chain(s) found. Fix before merging.`);
	process.exit(1);
} else {
	console.log(`\n✔ No circular dependencies found across ${TARGETS.length} module boundaries.`);
}
