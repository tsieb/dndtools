/**
 * Circular Dependency Lint (Epic 21.5)
 *
 * Detects circular import dependencies across the three runtime boundaries:
 * src/ (renderer), electron/ (desktop shell), and mcp/ (sidecar server).
 *
 * Any cycles found cause a non-zero exit code so this can be used as a CI gate.
 */

import { auditDirectories } from './import-cycle-audit';

const TARGETS = ['src/', 'electron/', 'mcp/'];
const results = auditDirectories(process.cwd(), TARGETS);
const totalCycles = results.reduce((sum, result) => sum + result.cycles.length, 0);

for (const { directory, cycles } of results) {
	if (cycles.length === 0) {
		console.log(`OK ${directory} - no circular dependencies`);
	} else {
		console.error(`FAIL ${directory} - ${cycles.length} circular dependency chain(s):`);
		for (const cycle of cycles) {
			console.error(`  ${cycle.join(' -> ')}`);
		}
	}
}

if (totalCycles > 0) {
	console.error(`\nFAIL ${totalCycles} circular dependency chain(s) found. Fix before merging.`);
	process.exit(1);
} else {
	console.log(`\nOK No circular dependencies found across ${TARGETS.length} module boundaries.`);
}
