// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('CI guardrails', () => {
	it('keeps coverage enforcement wired through package scripts and CI', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const ciWorkflow = fs.readFileSync(
			path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
			'utf-8',
		);

		expect(packageJson.scripts?.['test:coverage']).toContain(
			'src/lib/domain/export.test.ts --coverage.enabled true --coverage.include src/lib/domain/export.ts',
		);
		expect(packageJson.scripts?.lint).toContain('pnpm audit:repo');
		expect(ciWorkflow).toContain('run: pnpm test');
		expect(ciWorkflow).toContain('run: pnpm test:coverage');
	});
});
