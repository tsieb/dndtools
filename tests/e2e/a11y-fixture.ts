import { test as base, expect } from '@playwright/test';
import {
	assertAxePolicy,
	createAxePolicyReporter,
	runAxePolicyScan,
	workerShardPath,
} from '../accessibility/axe-policy.js';

export const test = base;
export { expect };
export type { Page } from '@playwright/test';
const reporter = createAxePolicyReporter();

test.afterEach(async ({ page }, testInfo) => {
	if (testInfo.status !== 'passed') return;
	const scan = await runAxePolicyScan(page, testInfo.titlePath.join(' > '));
	if (!scan) return;
	assertAxePolicy(scan);
	reporter.record(scan);
});

// Each worker writes to an isolated shard keyed by its worker index so that
// parallel workers cannot clobber each other (CODEX-PR12-A11Y-REPORT-RACE).
// The shards are merged into the final report by the globalTeardown in
// tests/e2e/a11y-merge-teardown.ts after all workers have finished.
test.afterAll(async ({}, testInfo) => {
	const outputPath = process.env.A11Y_REPORT_PATH;
	if (!outputPath) return;
	await reporter.write(workerShardPath(outputPath, testInfo.workerIndex));
});
