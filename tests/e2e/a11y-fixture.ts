import { test as base, expect } from '@playwright/test';
import {
	assertAxePolicy,
	createAxePolicyReporter,
	runAxePolicyScan,
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

test.afterAll(async () => {
	const outputPath = process.env.A11Y_REPORT_PATH;
	if (!outputPath) return;
	await reporter.write(outputPath);
});
