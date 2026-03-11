import fs from 'node:fs/promises';
import path from 'node:path';

type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

type AxeViolationRecord = {
	fingerprint: string;
	id: string;
	impact: ImpactLevel;
	route: string;
	selector: string;
	help: string;
	helpUrl: string;
	known: boolean;
};

type AxePolicyReport = {
	version: number;
	generatedAt: string;
	violations: AxeViolationRecord[];
	counts: Record<ImpactLevel, number>;
	expiredKnownViolations: Array<{ id: string; targetResolutionDate: string }>;
};

type SummaryPayload = {
	generatedAt: string;
	found: number;
	counts: Record<ImpactLevel, number>;
	newViolations: number;
	resolvedViolations: number;
	expiredKnownViolations: number;
	commentMarkdown: string;
};

function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith('--')) continue;
		const key = token.slice(2);
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) continue;
		args[key] = value;
		index += 1;
	}
	return args;
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function uniqueFingerprints(records: AxeViolationRecord[]): Set<string> {
	return new Set(records.map((record) => record.fingerprint));
}

function toMarkdown(summary: SummaryPayload): string {
	return [
		'<!-- dndtools-a11y-report -->',
		'### Accessibility Report',
		'',
		`Generated at: ${summary.generatedAt}`,
		'',
		'| Metric | Value |',
		'| --- | ---: |',
		`| Violations found | ${summary.found} |`,
		`| Critical | ${summary.counts.critical} |`,
		`| Serious | ${summary.counts.serious} |`,
		`| Moderate | ${summary.counts.moderate} |`,
		`| Minor | ${summary.counts.minor} |`,
		`| Unknown | ${summary.counts.unknown} |`,
		`| New vs baseline | ${summary.newViolations} |`,
		`| Resolved vs baseline | ${summary.resolvedViolations} |`,
		`| Known violations past target date | ${summary.expiredKnownViolations} |`,
		'',
		'Policy:',
		'- critical violations block CI',
		'- serious violations are warnings and tracked in `tests/accessibility/known-violations.json`',
		'- moderate/minor violations are logged for follow-up',
	].join('\n');
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const inputPath = args.input ?? path.join('tmp', 'accessibility', 'a11y-report.json');
	const baselinePath = args.baseline ?? path.join('tests', 'accessibility', 'a11y-baseline.json');
	const outputMarkdownPath = args.output ?? path.join('tmp', 'accessibility', 'a11y-summary.md');
	const outputJsonPath = args.json ?? path.join('tmp', 'accessibility', 'a11y-summary.json');

	const [report, baseline] = await Promise.all([
		readJsonOrNull<AxePolicyReport>(inputPath),
		readJsonOrNull<AxePolicyReport>(baselinePath),
	]);

	const reportViolations = report?.violations ?? [];
	const baselineViolations = baseline?.violations ?? [];
	const currentSet = uniqueFingerprints(reportViolations);
	const baselineSet = uniqueFingerprints(baselineViolations);

	let newViolations = 0;
	for (const fingerprint of currentSet) {
		if (!baselineSet.has(fingerprint)) newViolations += 1;
	}
	let resolvedViolations = 0;
	for (const fingerprint of baselineSet) {
		if (!currentSet.has(fingerprint)) resolvedViolations += 1;
	}

	const counts: Record<ImpactLevel, number> = report?.counts ?? {
		critical: 0,
		serious: 0,
		moderate: 0,
		minor: 0,
		unknown: 0,
	};
	const summary: SummaryPayload = {
		generatedAt: report?.generatedAt ?? new Date().toISOString(),
		found: reportViolations.length,
		counts,
		newViolations,
		resolvedViolations,
		expiredKnownViolations: report?.expiredKnownViolations.length ?? 0,
		commentMarkdown: '',
	};
	summary.commentMarkdown = toMarkdown(summary);

	await fs.mkdir(path.dirname(outputMarkdownPath), { recursive: true });
	await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
	await fs.writeFile(outputMarkdownPath, `${summary.commentMarkdown}\n`, 'utf8');
	await fs.writeFile(outputJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

await main();
