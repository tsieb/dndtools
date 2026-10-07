// Markdown summary of a merged Playwright JSON report: failed tests, then tests that passed only
// on retry (Playwright's "flaky"). CI appends it to the step summary so a flake trend is visible
// without opening the HTML report; nightly.yml uses the same output for the quarantine issue.
//
//   node scripts/ci/e2e-summary.mjs <report.json>
import fs from 'node:fs';

const [file] = process.argv.slice(2);
if (!file) {
	console.error('usage: e2e-summary.mjs <report.json>');
	process.exit(2);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));

const failed = [];
const flaky = [];
let total = 0;
function walk(suite, titles) {
	for (const spec of suite.specs ?? []) {
		for (const test of spec.tests ?? []) {
			total += 1;
			const name = `${test.projectName ?? test.projectId ?? ''} › ${[...titles, spec.title].join(' › ')}`;
			const location = `${spec.file}:${spec.line}`;
			if (test.status === 'unexpected' || test.status === 'timedOut')
				failed.push({ name, location });
			else if (test.status === 'flaky') flaky.push({ name, location });
		}
	}
	for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
}
for (const suite of report.suites ?? []) walk(suite, [suite.title]);

const lines = [
	`### Browser e2e: ${total} tests, ${failed.length} failed, ${flaky.length} flaky`,
	'',
];
for (const [heading, rows] of [
	['Failed', failed],
	['Passed only on retry (flaky)', flaky],
]) {
	if (!rows.length) continue;
	lines.push(`**${heading}**`, '');
	for (const row of rows) lines.push(`- \`${row.location}\` ${row.name}`);
	lines.push('');
}
if (!failed.length && !flaky.length) lines.push('Every test passed on its first attempt.');
process.stdout.write(lines.join('\n') + '\n');
