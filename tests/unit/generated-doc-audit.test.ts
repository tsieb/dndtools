// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	auditCountTable,
	auditDefectCounts,
	auditStructureInventory,
	computeDefectCounts,
	computeRequirementCounts,
} from '../../scripts/lib/generated-doc-audit.ts';

const REQUIREMENT_FILES = [
	{ content: '### CANVAS-001\nfoo\n### CANVAS-002\nbar\n### MAP-001\nbaz\n' },
	{ content: '## not a heading\n### MAP-002\nq\n### MAP-003\nq\n' },
];

const COUNT_TABLE_DOC = `# Requirements

## Count Audit

| Domain    |   Count |
| --------- | ------: |
| CANVAS    |       2 |
| MAP       |       3 |
| **Total** |   **5** |

## Next Section
`;

describe('PLAT-015 Count Audit recomputation (AC3)', () => {
	it('computes per-domain requirement counts from headings', () => {
		const counts = computeRequirementCounts(REQUIREMENT_FILES);
		expect(counts.get('CANVAS')).toBe(2);
		expect(counts.get('MAP')).toBe(3);
	});

	it('passes when the table matches the computed counts', () => {
		expect(auditCountTable('10-requirements.md', COUNT_TABLE_DOC, REQUIREMENT_FILES)).toEqual([]);
	});

	it('fails closed when a domain count drifts (AC3 negative)', () => {
		const drifted = COUNT_TABLE_DOC.replace('| CANVAS    |       2 |', '| CANVAS    |       9 |');
		const issues = auditCountTable('10-requirements.md', drifted, REQUIREMENT_FILES);
		expect(issues.some((i) => i.message.includes('Count Audit drift for "CANVAS"'))).toBe(true);
	});

	it('fails closed when the Total drifts (AC3 negative)', () => {
		const drifted = COUNT_TABLE_DOC.replace('|   **5** |', '|   **8** |');
		const issues = auditCountTable('10-requirements.md', drifted, REQUIREMENT_FILES);
		expect(issues.some((i) => i.message.includes('Total drift'))).toBe(true);
	});

	it('reports a domain missing from the table', () => {
		const missing = COUNT_TABLE_DOC.replace('| MAP       |       3 |\n', '');
		const issues = auditCountTable('10-requirements.md', missing, REQUIREMENT_FILES);
		expect(issues.some((i) => i.message.includes('missing domain "MAP"'))).toBe(true);
	});

	it('reports when the table is absent entirely', () => {
		const issues = auditCountTable('10-requirements.md', '# No table here', REQUIREMENT_FILES);
		expect(issues.some((i) => i.message.includes('Count Audit table not found'))).toBe(true);
	});
});

const DEFECT_DOC = `## Defect Register

<!-- defect-count-summary: P1=1 P2=2 P3=1 total=4 -->

- P1: 1
- P2: 2
- P3: 1
- Total: 4

| ID | Severity | Location | x | y | z |
| --- | --- | --- | --- | --- | --- |
| \`A\` | P1 | l | d | r | c |
| \`B\` | P2 | l | d | r | c |
| \`C\` | P2 | l | d | r | c |
| \`D\` | P3 | l | d | r | c |
`;

describe('PLAT-015 defect-count recomputation (AC1)', () => {
	it('computes severity counts from register rows', () => {
		expect(computeDefectCounts(DEFECT_DOC)).toEqual({ p1: 1, p2: 2, p3: 1, total: 4 });
	});

	it('passes when the summary matches the recomputed counts', () => {
		expect(auditDefectCounts('07-known-defects.md', DEFECT_DOC)).toEqual([]);
	});

	it('fails closed when the machine summary drifts (AC1 negative)', () => {
		const drifted = DEFECT_DOC.replace('P1=1 P2=2 P3=1 total=4', 'P1=9 P2=13 P3=1 total=23');
		const issues = auditDefectCounts('07-known-defects.md', drifted);
		// This mirrors the CLAUDE-CODEX-COUNT-MISMATCH defect: a hand-edited count that disagrees
		// with the actual rows.
		expect(issues.some((i) => i.message.includes('Defect count drift for P1'))).toBe(true);
		expect(issues.some((i) => i.message.includes('Defect count drift for P2'))).toBe(true);
	});

	it('fails closed when a human bullet disagrees with the rows', () => {
		const drifted = DEFECT_DOC.replace('- P2: 2', '- P2: 13');
		const issues = auditDefectCounts('07-known-defects.md', drifted);
		expect(issues.some((i) => i.message.includes('bullet P2=13'))).toBe(true);
	});

	it('reports a missing summary comment', () => {
		const noSummary = DEFECT_DOC.replace(
			'<!-- defect-count-summary: P1=1 P2=2 P3=1 total=4 -->\n',
			'',
		);
		const issues = auditDefectCounts('07-known-defects.md', noSummary);
		expect(
			issues.some((i) => i.message.includes('missing the machine-checkable count summary')),
		).toBe(true);
	});
});

const STRUCTURE_DOC = `# Project Structure

## Top-Level Layout

- \`src/\`: renderer.
- \`scripts/\`: scripts.
- \`gone/\`: a directory that was deleted.

## Cleanup Rules
- something
`;

describe('PLAT-015 structure inventory audit (AC2)', () => {
	it('passes when documented dirs match the real top level', () => {
		const actual = new Set(['src', 'scripts', 'gone']);
		expect(auditStructureInventory('PROJECT_STRUCTURE.md', STRUCTURE_DOC, actual)).toEqual([]);
	});

	it('reports a documented dir that no longer exists (AC2 negative)', () => {
		const actual = new Set(['src', 'scripts']); // `gone/` removed from the repo
		const issues = auditStructureInventory('PROJECT_STRUCTURE.md', STRUCTURE_DOC, actual);
		expect(issues.some((i) => i.message.includes('"gone/" which no longer exists'))).toBe(true);
	});

	it('reports a real top-level dir missing from the inventory (the AUDIT-21.4 defect)', () => {
		const actual = new Set(['src', 'scripts', 'gone', 'mcp']); // mcp/ exists but undocumented
		const issues = auditStructureInventory('PROJECT_STRUCTURE.md', STRUCTURE_DOC, actual);
		expect(issues.some((i) => i.message.includes('"mcp/" exists but is not documented'))).toBe(
			true,
		);
	});

	it('honors the ignore set for generated/tooling dirs', () => {
		const actual = new Set(['src', 'scripts', 'gone', 'node_modules', 'build']);
		const issues = auditStructureInventory('PROJECT_STRUCTURE.md', STRUCTURE_DOC, actual, {
			ignore: new Set(['node_modules', 'build']),
		});
		expect(issues).toEqual([]);
	});
});
