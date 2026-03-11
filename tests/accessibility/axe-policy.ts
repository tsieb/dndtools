import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

type KnownViolationEntry = {
	id: string;
	impact: Exclude<ImpactLevel, 'unknown'>;
	routePattern: string;
	selector: string;
	justification: string;
	targetResolutionDate: string;
};

type KnownViolationsPayload = {
	version: number;
	violations: KnownViolationEntry[];
};

export type AxeViolationRecord = {
	fingerprint: string;
	id: string;
	impact: ImpactLevel;
	route: string;
	selector: string;
	help: string;
	helpUrl: string;
	known: boolean;
};

export type AxePolicyScan = {
	testId: string;
	route: string;
	counts: Record<ImpactLevel, number>;
	criticalViolations: AxeViolationRecord[];
	seriousViolations: AxeViolationRecord[];
	moderateViolations: AxeViolationRecord[];
	minorViolations: AxeViolationRecord[];
	unknownViolations: AxeViolationRecord[];
	expiredKnownViolations: KnownViolationEntry[];
};

export type AxePolicyReport = {
	version: number;
	generatedAt: string;
	scans: AxePolicyScan[];
	violations: AxeViolationRecord[];
	counts: Record<ImpactLevel, number>;
	expiredKnownViolations: KnownViolationEntry[];
};

let knownViolationsPromise: Promise<KnownViolationEntry[]> | null = null;

function getKnownViolationsPath(): string {
	return path.join(process.cwd(), 'tests', 'accessibility', 'known-violations.json');
}

async function loadKnownViolations(): Promise<KnownViolationEntry[]> {
	if (!knownViolationsPromise) {
		knownViolationsPromise = (async () => {
			const raw = await fs.readFile(getKnownViolationsPath(), 'utf8');
			const parsed = JSON.parse(raw) as KnownViolationsPayload;
			return parsed.violations;
		})();
	}
	return knownViolationsPromise;
}

function getImpactLevel(rawImpact: string | null | undefined): ImpactLevel {
	if (rawImpact === 'critical') return 'critical';
	if (rawImpact === 'serious') return 'serious';
	if (rawImpact === 'moderate') return 'moderate';
	if (rawImpact === 'minor') return 'minor';
	return 'unknown';
}

function routeFromUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		return `${url.pathname}${url.search}`;
	} catch {
		return rawUrl;
	}
}

function buildFingerprint(id: string, route: string, selector: string): string {
	return `${id}::${route}::${selector}`;
}

function isKnownViolation(
	violation: {
		id: string;
		impact: ImpactLevel;
		route: string;
		selector: string;
	},
	knownViolations: KnownViolationEntry[],
): boolean {
	if (violation.impact === 'unknown') return false;
	return knownViolations.some((known) => {
		if (known.id !== violation.id) return false;
		if (known.impact !== violation.impact) return false;
		const routeMatch = new RegExp(known.routePattern).test(violation.route);
		if (!routeMatch) return false;
		if (known.selector === '*') return true;
		return known.selector === violation.selector;
	});
}

function getExpiredKnownViolations(knownViolations: KnownViolationEntry[]): KnownViolationEntry[] {
	const today = new Date().toISOString().slice(0, 10);
	return knownViolations.filter((known) => known.targetResolutionDate < today);
}

export async function runAxePolicyScan(page: Page, testId: string): Promise<AxePolicyScan | null> {
	const currentUrl = page.url();
	if (!currentUrl || currentUrl.startsWith('about:')) {
		return null;
	}

	const knownViolations = await loadKnownViolations();
	const expiredKnownViolations = getExpiredKnownViolations(knownViolations);
	const route = routeFromUrl(currentUrl);

	const results = await new AxeBuilder({ page })
		.setLegacyMode(true)
		.options({
			resultTypes: ['violations'],
		})
		.analyze();

	const records: AxeViolationRecord[] = results.violations.flatMap((violation) => {
		const impact = getImpactLevel(violation.impact);
		return violation.nodes.map((node) => {
			const selector = node.target.join(' ');
			const record = {
				id: violation.id,
				impact,
				route,
				selector,
			};
			return {
				fingerprint: buildFingerprint(violation.id, route, selector),
				id: violation.id,
				impact,
				route,
				selector,
				help: violation.help,
				helpUrl: violation.helpUrl,
				known: isKnownViolation(record, knownViolations),
			};
		});
	});

	const counts: Record<ImpactLevel, number> = {
		critical: 0,
		serious: 0,
		moderate: 0,
		minor: 0,
		unknown: 0,
	};
	for (const record of records) {
		counts[record.impact] += 1;
	}

	return {
		testId,
		route,
		counts,
		criticalViolations: records.filter((record) => record.impact === 'critical'),
		seriousViolations: records.filter((record) => record.impact === 'serious'),
		moderateViolations: records.filter((record) => record.impact === 'moderate'),
		minorViolations: records.filter((record) => record.impact === 'minor'),
		unknownViolations: records.filter((record) => record.impact === 'unknown'),
		expiredKnownViolations,
	};
}

export function assertAxePolicy(scan: AxePolicyScan): void {
	if (scan.expiredKnownViolations.length > 0) {
		const expired = scan.expiredKnownViolations
			.map((entry) => `${entry.id} (${entry.targetResolutionDate})`)
			.join(', ');
		throw new Error(
			`Known accessibility violations have passed their target resolution date: ${expired}`,
		);
	}

	if (scan.criticalViolations.length > 0) {
		const critical = scan.criticalViolations
			.map((entry) => `${entry.id} at ${entry.selector}`)
			.join('; ');
		throw new Error(`Critical accessibility violations found on ${scan.route}: ${critical}`);
	}

	if (scan.seriousViolations.length > 0) {
		const tracked = scan.seriousViolations.filter((entry) => entry.known).length;
		const untracked = scan.seriousViolations.length - tracked;
		// Keep serious findings visible without blocking CI.
		console.warn(
			`[a11y] serious violations on ${scan.route}: ${scan.seriousViolations.length} (tracked: ${tracked}, untracked: ${untracked})`,
		);
	}

	const moderateCount = scan.moderateViolations.length;
	const minorCount = scan.minorViolations.length;
	if (moderateCount > 0 || minorCount > 0) {
		console.warn(
			`[a11y] moderate/minor violations on ${scan.route}: moderate=${moderateCount}, minor=${minorCount}`,
		);
	}
}

export function createAxePolicyReporter(): {
	record: (scan: AxePolicyScan | null) => void;
	toReport: () => AxePolicyReport;
	write: (outputPath: string) => Promise<void>;
} {
	const scans: AxePolicyScan[] = [];
	return {
		record(scan: AxePolicyScan | null): void {
			if (!scan) return;
			scans.push(scan);
		},
		toReport(): AxePolicyReport {
			const violations = scans.flatMap((scan) => [
				...scan.criticalViolations,
				...scan.seriousViolations,
				...scan.moderateViolations,
				...scan.minorViolations,
				...scan.unknownViolations,
			]);
			const counts: Record<ImpactLevel, number> = {
				critical: 0,
				serious: 0,
				moderate: 0,
				minor: 0,
				unknown: 0,
			};
			for (const violation of violations) {
				counts[violation.impact] += 1;
			}
			return {
				version: 1,
				generatedAt: new Date().toISOString(),
				scans,
				violations,
				counts,
				expiredKnownViolations: scans.flatMap((scan) => scan.expiredKnownViolations),
			};
		},
		async write(outputPath: string): Promise<void> {
			const report = this.toReport();
			const outputDir = path.dirname(outputPath);
			await fs.mkdir(outputDir, { recursive: true });
			await fs.writeFile(`${outputPath}`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		},
	};
}
