import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// UX-A11Y-001 / UX-A11Y-017: the automated accessibility release gate.
//
// Runs axe-core against every primary v2 durable workspace on BOTH the desktop-chromium and
// mobile-chromium Playwright profiles (per the "Run Both E2E Projects" contract). Each test writes
// an isolated, worker-scoped artifact so parallel workers never race on a shared file
// (UX-A11Y-017 AC3, deterministic artifacts), and asserts inline that no critical/serious
// violation escapes the approved known-violation register (UX-A11Y-001 AC1). The merged gate +
// remediation-date expiry enforcement lives in `scripts/a11y-axe-report.ts`, which consumes these
// artifacts.

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = join(HERE, '..', '..', 'test-results', 'a11y');
const REGISTER_PATH = join(HERE, '..', 'a11y', 'known-violations.json');

// axe tag set including the WCAG 2.2 AA rules as axe-core adds them (UX-A11Y-017 spec).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

// Primary durable workspaces (architecture-decisions §9.1) that currently render in the v2 app.
const ROUTES: ReadonlyArray<{ path: string; slug: string }> = [
	{ path: '/', slug: 'command-center' },
	{ path: '/scenes', slug: 'scenes' },
	{ path: '/atlas', slug: 'atlas' },
	{ path: '/characters', slug: 'characters' },
	{ path: '/knowledge', slug: 'knowledge' },
	{ path: '/campaign', slug: 'campaign' },
	{ path: '/session', slug: 'session' },
	{ path: '/settings', slug: 'settings' },
];

interface ViolationNode {
	id: string;
	impact: string | null;
	route: string;
	project: string;
	selector: string;
	help: string;
	helpUrl: string;
}

interface KnownEntry {
	id: string;
	route: string;
	impact?: string;
	targetResolutionDate: string;
}

function loadRegister(): KnownEntry[] {
	if (!existsSync(REGISTER_PATH)) return [];
	const parsed = JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as { violations?: KnownEntry[] };
	return parsed.violations ?? [];
}

function isApproved(node: ViolationNode, register: KnownEntry[], now: number): boolean {
	return register.some((entry) => {
		if (entry.id !== node.id) return false;
		if (entry.route !== '*' && entry.route !== node.route) return false;
		if (entry.impact && entry.impact !== node.impact) return false;
		const due = Date.parse(`${entry.targetResolutionDate}T23:59:59.999Z`);
		return !Number.isNaN(due) && due >= now;
	});
}

async function openRoute(page: Page, path: string) {
	// Start from a deterministic, freshly-seeded vault so the scan is reproducible run to run.
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto(path);
	await page.getByTestId('route-landmark').waitFor({ state: 'visible' });
}

for (const route of ROUTES) {
	test(`a11y axe gate: ${route.path}`, async ({ page }, testInfo) => {
		await openRoute(page, route.path);

		const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
		const project = testInfo.project.name;

		const nodes: ViolationNode[] = [];
		for (const violation of results.violations) {
			for (const node of violation.nodes) {
				nodes.push({
					id: violation.id,
					impact: violation.impact ?? null,
					route: route.path,
					project,
					selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target),
					help: violation.help,
					helpUrl: violation.helpUrl,
				});
			}
		}

		// Isolated, worker-scoped artifact — the merge step (a11y-axe-report.ts) de-duplicates.
		mkdirSync(ARTIFACT_DIR, { recursive: true });
		writeFileSync(
			join(ARTIFACT_DIR, `axe-${project}-${route.slug}-w${testInfo.workerIndex}.json`),
			`${JSON.stringify({ project, route: route.path, workerIndex: testInfo.workerIndex, violations: nodes }, null, 2)}\n`,
			'utf8',
		);

		const register = loadRegister();
		const now = Date.now();
		const blocking = nodes.filter(
			(node) => BLOCKING_IMPACTS.has(node.impact ?? '') && !isApproved(node, register, now),
		);
		expect(
			blocking,
			`Unapproved critical/serious axe violations on ${route.path} (${project}):\n` +
				blocking.map((b) => `  - [${b.impact}] ${b.id} — ${b.selector} (${b.helpUrl})`).join('\n'),
		).toEqual([]);
	});
}
