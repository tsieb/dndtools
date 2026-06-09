/**
 * Playwright globalTeardown — runs once in the main process after all workers finish.
 * Merges per-worker a11y shard files into the final consolidated report.
 * Addresses defect CODEX-PR12-A11Y-REPORT-RACE (AC1 of A11Y-008).
 */
import { mergeA11yShards } from '../accessibility/axe-policy.js';

export default async function globalTeardown(): Promise<void> {
	const outputPath = process.env.A11Y_REPORT_PATH;
	if (!outputPath) return;
	await mergeA11yShards(outputPath);
}
