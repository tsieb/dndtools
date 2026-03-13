import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export type CommandResult = {
	command: string;
	args: string[];
	exitCode: number;
	durationMs: number;
	stdout: string;
	stderr: string;
	startedAt: string;
	finishedAt: string;
};

export function getPnpmCommand(): string {
	return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export function printJson(event: Record<string, unknown>): void {
	process.stdout.write(`${JSON.stringify(event)}\n`);
}

export async function ensureDirectory(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

export async function runCommand(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
		logFile?: string;
	} = {},
): Promise<CommandResult> {
	const startedAt = new Date();
	const child = spawn(command, args, {
		cwd: options.cwd ?? process.cwd(),
		env: {
			...process.env,
			...options.env,
		},
		shell: process.platform === 'win32',
	});

	let stdout = '';
	let stderr = '';

	child.stdout.on('data', (chunk) => {
		stdout += chunk.toString();
	});

	child.stderr.on('data', (chunk) => {
		stderr += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.on('error', reject);
		child.on('close', (code) => resolve(code ?? 1));
	});

	const finishedAt = new Date();
	const result: CommandResult = {
		command,
		args,
		exitCode,
		durationMs: finishedAt.getTime() - startedAt.getTime(),
		stdout,
		stderr,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
	};

	if (options.logFile) {
		await ensureDirectory(path.dirname(options.logFile));
		await fs.writeFile(
			options.logFile,
			[
				`$ ${command} ${args.join(' ')}`,
				'',
				stdout.trimEnd(),
				stderr ? `\n[stderr]\n${stderr.trimEnd()}` : '',
			]
				.filter(Boolean)
				.join('\n'),
			'utf-8',
		);
	}

	return result;
}

export function percentile(values: number[], ratio: number): number | null {
	if (values.length === 0) {
		return null;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
	return sorted[index] ?? null;
}

export function median(values: number[]): number | null {
	return percentile(values, 0.5);
}
