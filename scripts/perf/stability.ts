/** Verify five consecutive CI reports refer to one code revision and agree on every gate verdict. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PERFORMANCE_BUDGETS } from '../../packages/core/src/index';

interface Report {
	commit: string;
	baselineCommit: string;
	ci: boolean;
	budgets: { budgetId: string; verdict: string; drift: string }[];
}

export function verifyStability(reports: Report[]): void {
	if (reports.length !== 5) throw new Error('Exactly five consecutive reports are required.');
	const expected = PERFORMANCE_BUDGETS.map((budget) => budget.id).sort();
	let previous: string | undefined;
	for (const report of reports) {
		if (
			!report.ci ||
			!/^[a-f0-9]{40}$/.test(report.commit) ||
			!/^[a-f0-9]{40}$/.test(report.baselineCommit) ||
			report.commit !== reports[0].commit ||
			report.baselineCommit !== reports[0].baselineCommit
		) {
			throw new Error('Reports must share the same candidate and baseline commits in CI mode.');
		}
		const budgets = [...report.budgets].sort((a, b) => a.budgetId.localeCompare(b.budgetId));
		if (
			JSON.stringify(budgets.map((budget) => budget.budgetId)) !== JSON.stringify(expected) ||
			budgets.some(
				(budget) =>
					!['pass', 'breach'].includes(budget.verdict) || !/^[+-]?\d+(\.\d+)?%$/.test(budget.drift),
			)
		) {
			throw new Error('Every budget requires a measured verdict and populated baseline drift.');
		}
		const verdicts = JSON.stringify(
			budgets.map(({ budgetId, verdict }) => ({ budgetId, verdict })),
		);
		if (previous !== undefined && verdicts !== previous)
			throw new Error('Budget verdicts changed across five unchanged-commit runs.');
		previous = verdicts;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const directory = resolve(process.argv[2] ?? 'tmp/perf');
	const reports = Array.from(
		{ length: 5 },
		(_, i) => JSON.parse(readFileSync(`${directory}/verdict-${i + 1}.json`, 'utf8')) as Report,
	);
	verifyStability(reports);
	const evidence = `Five consecutive captures of ${reports[0].commit} agree on all ${PERFORMANCE_BUDGETS.length} CI budget verdicts; every drift column is populated.\n`;
	writeFileSync(`${directory}/stability.txt`, evidence);
	console.log(evidence);
}
