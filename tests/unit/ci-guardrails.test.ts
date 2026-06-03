// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('CI guardrails', () => {
	it('keeps V2 planning validation wired through package scripts and CI', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const ciWorkflow = fs.readFileSync(
			path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
			'utf-8',
		);

		expect(packageJson.scripts?.['v2:workpack:validate']).toBe(
			'tsx scripts/v2-workpack.ts validate',
		);
		expect(packageJson.scripts?.['docs:validate']).toBe('tsx scripts/docs-validate.ts');
		expect(ciWorkflow).toContain('run: pnpm v2:workpack:validate');
		expect(ciWorkflow).toContain('run: pnpm docs:validate');
	});
});
