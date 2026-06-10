// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('CI guardrails', () => {
	it('keeps planning validation wired through package scripts and CI', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const ciWorkflow = fs.readFileSync(
			path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
			'utf-8',
		);

		expect(packageJson.scripts?.['workpack:validate']).toBe('tsx scripts/workpack.ts validate');
		expect(packageJson.scripts?.['docs:validate']).toBe('tsx scripts/docs-validate.ts');
		expect(ciWorkflow).toContain('run: pnpm workpack:validate');
		expect(ciWorkflow).toContain('run: pnpm docs:validate');
	});

	it('keeps the PLAT-010 tiered quality-gate enforcement wired through scripts and CI', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const ciWorkflow = fs.readFileSync(
			path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
			'utf-8',
		);

		// The gate enforcement script exists, is invoked by the gates script, runs inside the
		// full check gate, and runs in CI. Removing any of these would let an unowned or
		// over-budget gate slip through, so the guardrail fails closed against silent removal.
		expect(packageJson.scripts?.['gates']).toBe('tsx scripts/quality-gates.ts');
		expect(packageJson.scripts?.['check']).toContain('pnpm gates');
		expect(ciWorkflow).toContain('run: pnpm gates');
		expect(fs.existsSync(path.join(repoRoot, 'scripts', 'quality-gates.ts'))).toBe(true);
	});
});
