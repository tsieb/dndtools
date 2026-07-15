import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface SecretFinding {
	rule: string;
	file: string;
	line: number;
	preview: string;
}

export const SECRET_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
	{ id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
	{
		id: 'github-token',
		pattern: /\b(?:github_pat_[A-Za-z0-9_]{50,}|gh[pousr]_[A-Za-z0-9]{36,255})\b/g,
	},
	{ id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	{ id: 'slack-token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
	{ id: 'stripe-live-secret', pattern: /\bsk_live_[0-9A-Za-z]{16,}\b/g },
	{ id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function lineNumberAt(text: string, index: number): number {
	let line = 1;
	for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
	return line;
}

function redact(value: string): string {
	if (value.length <= 12) return '[redacted]';
	return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function scanText(file: string, text: string): SecretFinding[] {
	const findings: SecretFinding[] = [];
	for (const { id, pattern } of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			findings.push({
				rule: id,
				file,
				line: lineNumberAt(text, match.index),
				preview: redact(match[0]),
			});
		}
	}
	return findings;
}

function repositoryFiles(repoRoot: string): string[] {
	const raw = execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
		{
			cwd: repoRoot,
			encoding: 'utf-8',
		},
	);
	return raw.split('\0').filter(Boolean);
}

export function scanTrackedFiles(repoRoot: string): SecretFinding[] {
	const findings: SecretFinding[] = [];
	for (const relativePath of repositoryFiles(repoRoot)) {
		const absolutePath = path.join(repoRoot, relativePath);
		const stat = fs.statSync(absolutePath);
		if (!stat.isFile() || stat.size > 2_000_000) continue;
		const bytes = fs.readFileSync(absolutePath);
		if (bytes.includes(0)) continue;
		findings.push(...scanText(relativePath, bytes.toString('utf-8')));
	}
	return findings;
}

function runCli(): void {
	const findings = scanTrackedFiles(process.cwd());
	if (findings.length > 0) {
		console.error(`secret scan failed with ${findings.length} high-confidence finding(s):`);
		for (const finding of findings) {
			console.error(`  ${finding.file}:${finding.line} [${finding.rule}] ${finding.preview}`);
		}
		process.exit(1);
	}
	console.log('secret scan passed: no high-confidence credentials found in repository files');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
