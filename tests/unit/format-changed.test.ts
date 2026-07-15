// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isFormattingCandidate } from '../../scripts/format-changed.ts';

describe('incremental formatting baseline', () => {
	it('checks maintained source, workflow, and documentation files', () => {
		for (const file of [
			'apps/gm-react/src/App.tsx',
			'.github/workflows/ci.yml',
			'scripts/example.ts',
			'docs/example.md',
		]) {
			expect(isFormattingCandidate(file), file).toBe(true);
		}
	});

	it('leaves generated, archived, and lockfile content outside the incremental baseline', () => {
		for (const file of [
			'archive/gm-svelte/src/App.svelte',
			'pnpm-lock.yaml',
			'coverage/core/index.html',
			'test-results/report.json',
		]) {
			expect(isFormattingCandidate(file), file).toBe(false);
		}
	});
});
